import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { getSenderFrom, getOrderNotificationRecipients } from '@/lib/email';
import { orderNotificationEmail } from '@/lib/email-templates';
import { NextResponse } from 'next/server';
import { calculateCommission } from '@/lib/commission';
import { getAccessibleEventIds, getUserContext, requireEventPermission, resolveAgentIds } from '@/app/api/_lib/access';

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
    const search = searchParams.get('search');
    const trashed = searchParams.get('trashed') === 'true';
    const createdByAgent = searchParams.get('created_by_agent');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const perPage = Math.min(200, Math.max(1, parseInt(searchParams.get('per_page') || '50', 10)));
    const offset = (page - 1) * perPage;

    let query = adminSupabase
      .from('documents')
      .select('*, events(name), profiles(full_name, email)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + perPage - 1);

    // Admin filtering by a specific agent's documents (email-reconciled)
    if (isAdmin && createdByAgent) {
      const agentIds = await resolveAgentIds(adminSupabase, createdByAgent);
      query = agentIds.length === 1
        ? query.eq('created_by', agentIds[0])
        : query.in('created_by', agentIds);
    } else if (!isAdmin) {
      const userIds = await resolveAgentIds(adminSupabase, user.id);
      const accessibleEventIds = await getAccessibleEventIds(adminSupabase, user.id, isAdmin);
      const createdByFilter = userIds.map(id => `created_by.eq.${id}`).join(',');
      if (accessibleEventIds.length > 0) {
        query = query.or(`${createdByFilter},event_id.in.(${accessibleEventIds.join(',')})`);
      } else {
        query = userIds.length === 1
          ? query.eq('created_by', userIds[0])
          : query.in('created_by', userIds);
      }
    }

    // Filter by trash state
    if (trashed) {
      query = query.not('deleted_at', 'is', null);
    } else {
      query = query.is('deleted_at', null);
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

    return NextResponse.json({ documents, total_count: count, page, per_page: perPage });
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
    } = body;

    if (!client_name || !document_type || !file_path || !file_name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!['quote', 'order'].includes(document_type)) {
      return NextResponse.json({ error: 'Invalid document type' }, { status: 400 });
    }

    if (event_id) {
      const { allowed } = await requireEventPermission(adminSupabase, event_id, user.id, 'edit', isAdmin);
      if (!allowed) {
        return NextResponse.json({ error: 'Forbidden: no edit access to this folder' }, { status: 403 });
      }
    }

    // Sanitize file_path to prevent path traversal
    const safePath = String(file_path)
      .replace(/\.\./g, '')
      .replace(/^\/+/, '')
      .replace(/[^a-zA-Z0-9\-_./]/g, '_');

    if (!safePath || safePath.length < 3) {
      return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
    }

    // Limit metadata size to prevent abuse (max 100KB)
    const metadataStr = JSON.stringify(metadata || {});
    if (metadataStr.length > 102400) {
      return NextResponse.json({ error: 'Metadata too large' }, { status: 400 });
    }

    const { data: document, error } = await adminSupabase
      .from('documents')
      .insert({
        event_id: event_id || null,
        client_name,
        client_company: client_company || null,
        document_type,
        file_path: safePath,
        file_name,
        file_size: file_size || null,
        total_amount: total_amount || null,
        created_by: user.id,
        metadata: metadata || {},
      })
      .select()
      .single();

    if (error) {
      console.error('[Documents POST] Error:', error.message);
      return NextResponse.json({ error: 'Failed to save document' }, { status: 500 });
    }

    // Agent commission hook: auto-create commission for active agents.
    // Wrapped in try/catch so failures never block the document response.
    try {
      if (document?.total_amount > 0) {
        const adminSupabase = createAdminClient();
        const { data: agentProfile } = await adminSupabase
          .from('profiles')
          .select('is_agent, commission_rate, agent_status, agent_commission_config, organization_id')
          .eq('id', user.id)
          .single();

        if (agentProfile?.is_agent && agentProfile.agent_status === 'active') {
          let effectiveRate = agentProfile.commission_rate || 0;
          if (!effectiveRate && agentProfile.organization_id) {
            const { data: org } = await adminSupabase
              .from('organizations')
              .select('commission_rate')
              .eq('id', agentProfile.organization_id)
              .single();
            effectiveRate = org?.commission_rate || 0;
          }

          const { amount, rate } = calculateCommission(
            document.total_amount,
            agentProfile.agent_commission_config || null,
            effectiveRate,
          );

          if (amount > 0) {
            await adminSupabase.from('agent_commissions').upsert({
              agent_id: user.id,
              document_id: document.id,
              type: 'order',
              order_total: document.total_amount,
              commission_rate: rate,
              commission_amount: amount,
              status: 'pending',
            }, { onConflict: 'agent_id,document_id' });
          }
        }
      }
    } catch (commErr) {
      console.error('[Documents POST] Commission hook error (non-blocking):', commErr.message);
    }

    // Order notification: email alberto@ and dionne@ on every new document/order.
    // Non-blocking — document is already saved at this point.
    try {
      const resendApiKey = process.env.RESEND_API_KEY;
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

    return NextResponse.json({ document });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
