import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';
import { getUserContext, resolveAgentIds } from '@/app/api/_lib/access';

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
      events = raw
        .filter((evt) => userIds.includes(evt.created_by) || accessByEvent.has(evt.id))
        .map((evt) => ({
          ...evt,
          permission: userIds.includes(evt.created_by) ? 'manage' : accessByEvent.get(evt.id),
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
        .not('order_channel', 'in', '("internal","consignment","delete_from_stock")');
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
    // existing one instead of inserting a duplicate. Sam saw two "Corinne"
    // entries in the dropdown because two admins (or one admin twice) hit
    // "+ New Event" with the same name; this makes the create idempotent.
    //
    // Phase 21: also dedup by `organization_id` alone — once we auto-link
    // agent folders, the canonical folder for an agent might have a
    // different display name than the auto-creator's `full_name` lookup
    // (e.g. profile.full_name = "CORINNE SECRET CODE PARIS" but the legacy
    // folder is still named "Corinne Ruimy"). Returning that existing row
    // stops the dropdown growing a duplicate every time SaveDocumentModal
    // opens.
    if (eventType === 'agent') {
      if (targetOrgId) {
        const { data: orgMatch, error: orgErr } = await adminSupabase
          .from('events')
          .select('*')
          .eq('type', 'agent')
          .eq('organization_id', targetOrgId)
          .limit(1);
        if (orgErr) {
          console.error('[Events POST] org-dedup probe failed:', orgErr.message);
        } else if ((orgMatch || []).length > 0) {
          return NextResponse.json({ event: orgMatch[0], deduplicated: true });
        }
      }
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
