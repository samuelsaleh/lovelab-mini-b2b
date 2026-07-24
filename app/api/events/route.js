import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';
import { getUserContext, resolveAgentIds, getActiveOrgMemberships } from '@/app/api/_lib/access';

// Simple ISO date validation (YYYY-MM-DD)
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// GET - List all events
export async function GET(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'events' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const adminSupabase = createAdminClient();
    const { user, isAdmin } = await getUserContext(supabase);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: rawEvents, error } = await adminSupabase
      .from('events')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Events GET] Error:', error.message);
      return NextResponse.json({ error: 'Failed to load events' }, { status: 500 });
    }

    const raw = rawEvents || [];
    let events = raw;

    if (!isAdmin) {
      const userIds = await resolveAgentIds(adminSupabase, user.id);

      let accessRows = [];
      const { data, error: accessErr } = await adminSupabase
        .from('event_access')
        .select('event_id, permission')
        .in('user_id', userIds);
      if (!accessErr) {
        accessRows = data || [];
      }

      const accessByEvent = new Map(accessRows.map((row) => [row.event_id, row.permission]));

      // Org members can also see (read) events linked to their organization —
      // e.g. the org's agent folder. Without this, a sub-agent saving an
      // order gets an EMPTY event dropdown, the save falls back to
      // event_id = null, and the order never shows its "@ organization"
      // badge nor files under the org (Wassila / Caprice, July 2026).
      const myOrgIds = new Set(
        (await getActiveOrgMemberships(adminSupabase, user.id)).map((m) => m.organization_id)
      );

      events = raw
        .filter((evt) =>
          userIds.includes(evt.created_by) ||
          accessByEvent.has(evt.id) ||
          (evt.organization_id && myOrgIds.has(evt.organization_id))
        )
        .map((evt) => ({
          ...evt,
          permission: userIds.includes(evt.created_by)
            ? 'manage'
            : (accessByEvent.get(evt.id) || 'read'),
        }));
    } else {
      events = raw.map((evt) => ({ ...evt, permission: 'manage' }));
    }

    // Authoritative per-event document count for the sidebar.
    // Applies the SAME filters as the default /api/documents view
    // (deleted_at IS NULL, order_channel not in internal/consignment/delete_from_stock)
    // so the count and the click-through always agree. Replaces the unfiltered
    // `documents(count)` join we used to embed, which caused the
    // "nicolas vial: 0 orders but folder has 5" bug from before pagination ran out.
    const visibleEventIds = events.map((e) => e.id);
    const docCountByEvent = new Map();
    if (visibleEventIds.length > 0) {
      const { data: docCountRows, error: countErr } = await adminSupabase
        .from('documents')
        .select('event_id')
        .in('event_id', visibleEventIds)
        .is('deleted_at', null)
        .not('order_channel', 'in', '("internal","consignment","delete_from_stock","sample")');
      if (countErr) {
        console.error('[Events GET] doc count query failed:', countErr.message);
      } else {
        for (const row of docCountRows || []) {
          if (row.event_id) {
            docCountByEvent.set(row.event_id, (docCountByEvent.get(row.event_id) || 0) + 1);
          }
        }
      }
    }
    events = events.map((e) => ({ ...e, doc_count: docCountByEvent.get(e.id) || 0 }));

    // Enrich agent-type folders with REAL agent stats — orders / revenue /
    // team counted across every document the agent (or their team in the
    // same organization) actually created, not just the ones explicitly
    // tagged to this folder. Without this, the Fairs page card for an
    // agent only counts orders saved into the folder, which led to
    // "Nicolas has 5 orders / €9k" while the agents admin page showed
    // 20+ orders and €50k+ for the same person — same agent, two truths.
    //
    // Linkage: events.organization_id is auto-set when an agent folder is
    // created (see POST below). Profiles in that organization are the
    // agents this folder represents. Fair/partner/other folders are
    // untouched and still use the per-event document tagging.
    try {
      const agentEvents = events.filter((e) => e.type === 'agent' && e.organization_id);
      const orgIds = [...new Set(agentEvents.map((e) => e.organization_id))];
      if (orgIds.length > 0) {
        const { data: orgAgents, error: agentsErr } = await adminSupabase
          .from('profiles')
          .select('id, organization_id, full_name, agent_status, is_agent, avatar_url')
          .in('organization_id', orgIds)
          .or('is_agent.eq.true,agent_status.in.(invited,active,inactive)')
          .is('agent_deleted_at', null);

        if (agentsErr) {
          console.error('[Events GET] org agents query failed:', agentsErr.message);
        } else {
          const agentsByOrg = new Map();
          const userIdToOrg = new Map();
          for (const p of orgAgents || []) {
            if (!agentsByOrg.has(p.organization_id)) agentsByOrg.set(p.organization_id, []);
            agentsByOrg.get(p.organization_id).push(p);
            userIdToOrg.set(p.id, p.organization_id);
          }

          const allAgentIds = [...userIdToOrg.keys()];
          const docsByOrg = new Map();
          if (allAgentIds.length > 0) {
            const { data: agentDocs, error: docsErr } = await adminSupabase
              .from('documents')
              .select('created_by, total_amount, document_type, order_channel')
              .in('created_by', allAgentIds)
              .eq('document_type', 'order')
              .is('deleted_at', null)
              .not('order_channel', 'in', '("internal","consignment","delete_from_stock","sample")');
            if (docsErr) {
              console.error('[Events GET] agent docs query failed:', docsErr.message);
            } else {
              for (const d of agentDocs || []) {
                const orgId = userIdToOrg.get(d.created_by);
                if (!orgId) continue;
                if (!docsByOrg.has(orgId)) docsByOrg.set(orgId, { orders: 0, revenue: 0, creators: new Set() });
                const agg = docsByOrg.get(orgId);
                agg.orders++;
                agg.revenue += Number(d.total_amount) || 0;
                agg.creators.add(d.created_by);
              }
            }
          }

          const enrichedById = new Map();
          for (const e of agentEvents) {
            const agg = docsByOrg.get(e.organization_id) || { orders: 0, revenue: 0, creators: new Set() };
            const orgAgentsList = agentsByOrg.get(e.organization_id) || [];
            // Click-through target: when an org has exactly one agent, the
            // card can deep-link to that agent's detail page. Otherwise
            // we leave it null and the UI falls back to a multi-agent
            // view.
            const singleAgent = orgAgentsList.length === 1 ? orgAgentsList[0] : null;
            enrichedById.set(e.id, {
              agent_stats: {
                orders: agg.orders,
                revenue: agg.revenue,
                team: agg.creators.size,
                agent_count: orgAgentsList.length,
              },
              primary_agent_id: singleAgent?.id || null,
              primary_agent_status: singleAgent?.agent_status || null,
              primary_agent_avatar: singleAgent?.avatar_url || null,
            });
          }
          events = events.map((e) => enrichedById.has(e.id) ? { ...e, ...enrichedById.get(e.id) } : e);
        }
      }
    } catch (enrichErr) {
      console.error('[Events GET] agent enrichment failed (non-blocking):', enrichErr?.message || enrichErr);
    }

    return NextResponse.json({ events });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create a new event
export async function POST(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 20, prefix: 'events-post' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const adminSupabase = createAdminClient();
    const { user } = await getUserContext(supabase);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, location, start_date, end_date, type, organization_id } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Event name is required' }, { status: 400 });
    }

    // Validate dates if provided
    if (start_date && !ISO_DATE_REGEX.test(start_date)) {
      return NextResponse.json({ error: 'Invalid start date format (use YYYY-MM-DD)' }, { status: 400 });
    }
    if (end_date && !ISO_DATE_REGEX.test(end_date)) {
      return NextResponse.json({ error: 'Invalid end date format (use YYYY-MM-DD)' }, { status: 400 });
    }
    if (start_date && end_date && end_date < start_date) {
      return NextResponse.json({ error: 'End date must be after start date' }, { status: 400 });
    }

    const validTypes = ['fair', 'agent', 'partner', 'other'];
    const eventType = validTypes.includes(type) ? type : 'other';
    const trimmedName = name.trim();
    // Auto-link agent folders to the matching agent's organization. Without
    // this, every order saved into the folder skips Tier 2 commission
    // attribution (the order's event has no organization_id, so
    // resolveCommissionAgent can't find the agent), which is exactly the
    // "PO Oxygène doesn't appear on Corinne's page" bug from May 2026.
    //
    // Resolution order:
    //   1. organization_id explicitly passed in the body (admin override).
    //   2. Single agent profile whose full_name matches the folder name.
    //   3. null (orphan folder — falls back to the legacy behaviour).
    let targetOrgId = (eventType === 'agent' && organization_id) ? organization_id : null;
    if (eventType === 'agent' && !targetOrgId) {
      const { data: agentMatch } = await adminSupabase
        .from('profiles')
        .select('organization_id')
        .ilike('full_name', trimmedName)
        .or('is_agent.eq.true,agent_status.in.(invited,active,inactive)')
        .is('agent_deleted_at', null)
        .not('organization_id', 'is', null)
        .limit(2);
      // Only auto-link when EXACTLY one agent matches — avoids cross-wiring
      // two people with the same display name into one folder.
      if (Array.isArray(agentMatch) && agentMatch.length === 1) {
        targetOrgId = agentMatch[0].organization_id;
      }
    }

    // Phase 13 dedup: when an agent-type event is created with the same name
    // (case-insensitive, trimmed) within the same organization, return the
    // existing one instead of inserting a duplicate.
    //
    // July 2026: org-only dedup was removed so multi-member orgs (Sarah +
    // Wassila + …) can each have their own agent folder. Solo-org rename
    // collisions (Corinne) are handled in SaveDocumentModal auto-create.
    if (eventType === 'agent') {
      const dedupQuery = adminSupabase
        .from('events')
        .select('*')
        .eq('type', 'agent')
        .ilike('name', trimmedName);
      const { data: dedupRows, error: dedupErr } = targetOrgId
        ? await dedupQuery.eq('organization_id', targetOrgId)
        : await dedupQuery.is('organization_id', null);
      if (dedupErr) {
        console.error('[Events POST] dedup probe failed:', dedupErr.message);
      } else if ((dedupRows || []).length > 0) {
        const existing = dedupRows.find(
          (r) => (r.name || '').trim().toLowerCase() === trimmedName.toLowerCase(),
        );
        if (existing) {
          return NextResponse.json({ event: existing, deduplicated: true });
        }
      }
    }

    const { data: event, error } = await adminSupabase
      .from('events')
      .insert({
        name: trimmedName,
        location: location?.trim() || null,
        start_date: start_date || null,
        end_date: end_date || null,
        type: eventType,
        organization_id: targetOrgId,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error('[Events POST] Error:', error.message);
      return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
    }

    return NextResponse.json({ event });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
