import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { getSenderFrom, getOrderNotificationRecipients } from '@/lib/email';
import { orderNotificationEmail } from '@/lib/email-templates';
import { NextResponse } from 'next/server';
import { syncConsignmentToLovelab, syncGiftLostToLovelab } from '@/lib/lovelab-sync';
import { getAccessibleEventIds, getActiveOrgMemberships, getOrgTeamScope, getUserContext, requireEventPermission, resolveAgentIds } from '@/app/api/_lib/access';
import { canUseOrgScope, buildTeamScopeOrFilter } from '@/lib/organizations/team';
import { recordHealthEvent } from '@/lib/healthEvent';
import { resolveCommissionAgent, upsertCommissionForDocument } from '@/lib/commissionAttribution';
import { maybeCreateBonusForOrder } from '@/lib/newClientBonus';

// GET - List documents (optionally filtered by event_id)
export async function GET(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'docs' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const adminSupabase = createAdminClient();
    const { user, isAdmin } = await getUserContext(supabase);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('event_id');
    const organizationId = searchParams.get('organization_id');
    const scopeMine = searchParams.get('scope') === 'mine'; // opt out of team expansion
    const search = searchParams.get('search');
    const trashed = searchParams.get('trashed') === 'true';
    const createdByAgent = searchParams.get('created_by_agent');
    const orderChannelFilter = searchParams.get('order_channel'); // e.g. 'internal' or 'consignment'
    const summaryOnly = searchParams.get('summary') === 'true'; // strips heavy metadata.formState
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    // Raise per_page cap to 500 for consignment admin views (only admins can hit this with
    // order_channel=consignment; the default cap is 200 for regular document lists).
    const maxPerPage = orderChannelFilter === 'consignment' ? 500 : 200;
    const perPage = Math.min(maxPerPage, Math.max(1, parseInt(searchParams.get('per_page') || '50', 10)));
    const offset = (page - 1) * perPage;

    // For summary/dashboard views strip the heavy formState from the metadata payload.
    // We must hint which FK to use for the profiles embed since documents now has two
    // FK columns pointing at profiles (created_by and consignment_agent_id).
    const selectFields = summaryOnly
      ? 'id, created_at, client_name, client_company, total_amount, order_channel, status, file_path, file_name, consignment_agent_id, metadata, events(name, organization_id), creator:profiles!created_by(full_name, email), consignment_agent:profiles!consignment_agent_id(full_name, email)'
      : '*, events(name, organization_id), creator:profiles!created_by(full_name, email), consignment_agent:profiles!consignment_agent_id(full_name, email)';

    let query = adminSupabase
      .from('documents')
      .select(selectFields, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + perPage - 1);

    // Team scope: non-admin callers may request organization_id only for an
    // org they are an ACTIVE member of (any role — owner or member). Everyone
    // in an org sees the same team documents; outsiders get 403.
    let nonAdminOrgScope = null;
    if (organizationId && !isAdmin) {
      const memberships = await getActiveOrgMemberships(adminSupabase, user.id);
      if (!canUseOrgScope({ isAdmin, organizationId, memberships })) {
        return NextResponse.json({ error: 'Forbidden: not a member of this organization' }, { status: 403 });
      }
      nonAdminOrgScope = await getOrgTeamScope(adminSupabase, organizationId);
    }

    // Admin personal-agent filtering: documents created by this agent (including
    // legacy IDs sharing the same email) plus documents explicitly attributed
    // to the agent through a commission row. Do NOT expand through every event
    // in the agent's organization: that made every teammate order appear on the
    // owner's personal page and looked like recurring duplicates.
    if (isAdmin && createdByAgent) {
      const agentIds = await resolveAgentIds(adminSupabase, createdByAgent);

      const { data: attributedCommissions } = await adminSupabase
        .from('agent_commissions')
        .select('document_id')
        .in('agent_id', agentIds);
      const commDocIds = [...new Set(
        (attributedCommissions || []).map(c => c.document_id).filter(Boolean),
      )];

      const orParts = [`created_by.in.(${agentIds.join(',')})`];
      if (commDocIds.length > 0) {
        orParts.push(`id.in.(${commDocIds.join(',')})`);
      }

      query = query.or(orParts.join(','));
    } else if (!isAdmin && nonAdminOrgScope) {
      // Explicit team view: only the requested org's documents.
      const orFilter = buildTeamScopeOrFilter(nonAdminOrgScope);
      if (orFilter) {
        query = query.or(orFilter);
      } else {
        return NextResponse.json({ documents: [], total_count: 0, page, per_page: perPage });
      }
    } else if (!isAdmin) {
      const userIds = await resolveAgentIds(adminSupabase, user.id);
      const accessibleEventIds = await getAccessibleEventIds(adminSupabase, user.id, isAdmin);

      // Team visibility: an org member's default list also includes their
      // teammates' documents (everyone in an org sees the same data).
      // scope=mine opts back into the personal-only view (analytics toggle).
      const memberships = scopeMine ? [] : await getActiveOrgMemberships(adminSupabase, user.id);
      const teamCreatorIds = new Set(userIds);
      const teamEventIds = new Set(accessibleEventIds);
      for (const membership of memberships) {
        const scope = await getOrgTeamScope(adminSupabase, membership.organization_id);
        scope.memberIds.forEach((id) => teamCreatorIds.add(id));
        scope.eventIds.forEach((id) => teamEventIds.add(id));
      }

      const creatorIds = [...teamCreatorIds];
      const eventIds = [...teamEventIds];
      if (eventIds.length > 0) {
        query = query.or(`created_by.in.(${creatorIds.join(',')}),event_id.in.(${eventIds.join(',')})`);
      } else {
        query = creatorIds.length === 1
          ? query.eq('created_by', creatorIds[0])
          : query.in('created_by', creatorIds);
      }
    }

    // Filter by trash state
    if (trashed) {
      query = query.not('deleted_at', 'is', null);
    } else {
      query = query.is('deleted_at', null);
    }

    // Exclude internal, consignment, delete_from_stock, and sample orders from default views.
    // Only include them when the caller explicitly requests that order_channel.
    if (!orderChannelFilter) {
      query = query.not('order_channel', 'in', '("internal","consignment","delete_from_stock","sample")');
    }

    if (eventId) {
      if (!isAdmin) {
        const { allowed } = await requireEventPermission(adminSupabase, eventId, user.id, 'read', isAdmin);
        if (!allowed) {
          return NextResponse.json({ documents: [] });
        }
      }
      query = query.eq('event_id', eventId);
    }

    if (organizationId && isAdmin) {
      const orgScope = await getOrgTeamScope(adminSupabase, organizationId);
      const orFilter = buildTeamScopeOrFilter(orgScope);
      if (orFilter) {
        query = query.or(orFilter);
      } else {
        return NextResponse.json({ documents: [], total_count: 0, page, per_page: perPage });
      }
    }

    // Filter by order_channel if specified (e.g. 'internal', 'consignment', 'delete_from_stock')
    if (orderChannelFilter) {
      const allowed = ['b2b', 'b2c', 'internal', 'consignment', 'delete_from_stock'];
      if (allowed.includes(orderChannelFilter)) {
        query = query.eq('order_channel', orderChannelFilter);
      }
    }

    if (search && search.trim()) {
      // Sanitize search input: escape PostgREST special characters
      const sanitized = search.trim().replace(/[,.()"'\\%_*]/g, '');
      if (sanitized) {
        query = query.or(`client_name.ilike.%${sanitized}%,client_company.ilike.%${sanitized}%`);
      }
    }

    const { data: documents, error, count } = await query;

    if (error) {
      console.error('[Documents GET] Error:', error.message);
      return NextResponse.json({ error: 'Failed to load documents' }, { status: 500 });
    }

    // PostgREST normally returns one row per document even when both branches
    // of an OR match. Keep a defensive ID-based dedupe at the API boundary so
    // no client or future joined query can render/count the same row twice.
    const uniqueDocuments = [...new Map((documents || []).map((doc) => [doc.id, doc])).values()];
    // Prefer the database total. Never let the current page length inflate
    // total_count — that made dashboards page forever and freeze /admin.
    const totalCount = Number.isFinite(Number(count)) ? Number(count) : uniqueDocuments.length;
    return NextResponse.json({
      documents: uniqueDocuments,
      total_count: totalCount,
      page,
      per_page: perPage,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Save document metadata (after uploading PDF to storage)
export async function POST(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 30, prefix: 'docs-post' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const adminSupabase = createAdminClient();
    const { user, isAdmin } = await getUserContext(supabase);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      event_id,
      client_name,
      client_company,
      document_type,
      file_path,
      file_name,
      file_size,
      total_amount,
      metadata,
      order_channel,
      consignment_agent_id,
      status,
    } = body;

    // file_path is optional for admin-created auto-generated records (e.g. invoices
    // auto-created from consignment reconciliation). Non-admin users must supply it.
    if (!client_name || !document_type || !file_name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (!isAdmin && !file_path) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!['quote', 'order'].includes(document_type)) {
      return NextResponse.json({ error: 'Invalid document type' }, { status: 400 });
    }

    const rawChannel = order_channel === 'sample' ? 'b2b' : order_channel;
    const safeOrderChannel = ['b2b', 'b2c', 'internal', 'consignment', 'delete_from_stock'].includes(rawChannel) ? rawChannel : 'b2b';
    const isInternalOrder = safeOrderChannel === 'internal';
    const isConsignmentOrder = safeOrderChannel === 'consignment';
    const isWriteOffOrder = safeOrderChannel === 'delete_from_stock';

    // Draft (parked) orders: a real, reopenable row that is NOT yet committed.
    // No commission, no bonus, no notification email, no LoveLab sync, and
    // excluded from revenue. Promoted to 'sent' later via PUT.
    const safeStatus = status === 'draft' ? 'draft' : 'sent';
    const isDraft = safeStatus === 'draft';

    // Validate consignment-specific fields
    if (isConsignmentOrder) {
      const consignment = metadata?.consignment;
      if (!consignment || !['agent', 'contact'].includes(consignment.recipient_type)) {
        return NextResponse.json({ error: 'Consignment orders require metadata.consignment.recipient_type of "agent" or "contact"' }, { status: 400 });
      }
      if (consignment.return_date && !/^\d{4}-\d{2}-\d{2}$/.test(consignment.return_date)) {
        return NextResponse.json({ error: 'Invalid return_date format — expected YYYY-MM-DD' }, { status: 400 });
      }
    }

    // Drafts are never filed into a folder — they live in the Draft view until promoted to sent.
    const effectiveEventId = isDraft ? null : (event_id || null);

    if (effectiveEventId) {
      const { allowed } = await requireEventPermission(adminSupabase, effectiveEventId, user.id, 'edit', isAdmin);
      if (!allowed) {
        return NextResponse.json({ error: 'Forbidden: no edit access to this folder' }, { status: 403 });
      }
    }

    // Sanitize file_path to prevent path traversal (skip when null/undefined)
    let safePath = null;
    if (file_path) {
      safePath = String(file_path)
        .replace(/\.\./g, '')
        .replace(/^\/+/, '')
        .replace(/[^a-zA-Z0-9\-_./]/g, '_');
      if (!safePath || safePath.length < 3) {
        return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
      }
    }

    // Limit metadata size to prevent abuse (max 100KB)
    const metadataStr = JSON.stringify(metadata || {});
    if (metadataStr.length > 102400) {
      return NextResponse.json({ error: 'Metadata too large' }, { status: 400 });
    }

    const docMetadata = metadata || {};
    const saveRequestId = typeof docMetadata.save_request_id === 'string'
      ? docMetadata.save_request_id.trim().slice(0, 128)
      : '';

    // Idempotency for slow-network retries. The client keeps this key stable
    // while the save modal remains open. If the first POST committed but its
    // response timed out, the retry returns that row instead of creating the
    // same order a second time.
    if (saveRequestId) {
      const { data: existingDocument, error: idempotencyError } = await adminSupabase
        .from('documents')
        .select('*')
        .eq('created_by', user.id)
        .contains('metadata', { save_request_id: saveRequestId })
        .maybeSingle();
      if (idempotencyError) {
        console.error('[Documents POST] Idempotency lookup failed:', idempotencyError.message);
        return NextResponse.json({ error: 'Failed to verify save request' }, { status: 500 });
      }
      if (existingDocument) {
        return NextResponse.json({ document: existingDocument, idempotent_replay: true });
      }
      docMetadata.save_request_id = saveRequestId;
    }

    const { data: document, error } = await adminSupabase
      .from('documents')
      .insert({
        event_id: effectiveEventId,
        client_name,
        client_company: client_company || null,
        document_type,
        file_path: safePath || null,
        file_name,
        file_size: file_size || null,
        total_amount: total_amount || null,
        created_by: user.id,
        metadata: docMetadata,
        order_channel: safeOrderChannel,
        consignment_agent_id: isConsignmentOrder ? (consignment_agent_id || null) : null,
        status: safeStatus,
      })
      .select()
      .single();

    if (error) {
      console.error('[Documents POST] Error:', error.message, error.code, error.details, error.hint);
      return NextResponse.json({ error: 'Failed to save document', detail: error.message }, { status: 500 });
    }

    // Agent commission hook: auto-create commission for active agents.
    // Skipped for internal and consignment orders — they carry no agent commission.
    // Wrapped in try/catch so failures never block the document response.
    // Attribution logic lives in lib/commissionAttribution.js so PUT and POST
    // resolve the same way.
    try {
      if (document?.total_amount > 0 && !isDraft && !isInternalOrder && !isConsignmentOrder && !isWriteOffOrder) {
        const commSupabase = createAdminClient();
        const attribution = await resolveCommissionAgent(commSupabase, document);
        if (attribution) {
          await upsertCommissionForDocument(commSupabase, {
            document,
            profile: attribution.profile,
            agentId: attribution.agentId,
          });
          // Phase 19 — new-client bonus. Wrapped in its own try/catch so a
          // bonus failure cannot revert the order commission we just wrote.
          try {
            await maybeCreateBonusForOrder(commSupabase, {
              agentId: attribution.agentId,
              profile: attribution.profile,
              document,
            });
          } catch (bonusErr) {
            await recordHealthEvent({
              source: 'documents_post_new_client_bonus_hook',
              severity: 'warn',
              message: bonusErr.message || 'New-client bonus hook failed',
              context: {
                documentId: document?.id || null,
                agentId: attribution.agentId,
                code: bonusErr.code || null,
              },
            });
          }
        }
      }
    } catch (commErr) {
      // Tier A — never silent. recordHealthEvent inserts a row and emails admins
      // for severity ≥ 'error'. We still swallow upward so the document save
      // returns 200 to the user; admins see the failure within minutes.
      await recordHealthEvent({
        source: 'documents_post_commission_hook',
        severity: 'error',
        message: commErr.message || 'Commission hook failed',
        context: {
          documentId: document?.id || null,
          createdBy: user.id,
          eventId: event_id || null,
          orderChannel: safeOrderChannel,
          totalAmount: document?.total_amount ?? null,
          code: commErr.code || null,
          details: commErr.details || null,
        },
      });
    }

    // Order notification: email on new documents/orders.
    // Skipped for internal and consignment orders — not revenue-bearing.
    // Non-blocking — document is already saved at this point.
    try {
      const resendApiKey = isDraft || isInternalOrder || isConsignmentOrder || isWriteOffOrder ? null : process.env.RESEND_API_KEY;
      if (resendApiKey) {
        const adminSupabase2 = createAdminClient();
        const eventName = event_id
          ? (await adminSupabase2.from('events').select('name').eq('id', event_id).single())?.data?.name
          : null;
        const creatorName =
          (await adminSupabase2.from('profiles').select('full_name').eq('id', user.id).single())?.data?.full_name ||
          user.email;

        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://lovelab-b2b.vercel.app';
        const { subject, html } = orderNotificationEmail({
          documentType: document.document_type,
          clientCompany: document.client_company,
          clientName: document.client_name,
          totalAmount: document.total_amount,
          eventName,
          creatorName,
        }, siteUrl);

        const { Resend } = await import('resend');
        const resend = new Resend(resendApiKey);
        await resend.emails.send({
          from: getSenderFrom(),
          to: getOrderNotificationRecipients(),
          subject,
          html,
        });
      }
    } catch (emailErr) {
      console.error('[Documents POST] Notification email error (non-blocking):', emailErr.message);
    }

    // Lovelab Sync: Sync consignment orders to main system.
    // Skipped for drafts — a parked order hasn't been committed yet.
    if (isConsignmentOrder && !isDraft) {
      // Non-blocking
      syncConsignmentToLovelab(document).catch(err => console.error('[Lovelab Sync POST] error:', err));
    }
    if (isWriteOffOrder && !isDraft) {
      syncGiftLostToLovelab(document).catch(err => console.error('[Lovelab Sync POST] gift lost error:', err));
    }

    return NextResponse.json({ document });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
