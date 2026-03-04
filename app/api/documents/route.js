import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';
import { calculateCommission } from '@/lib/commission';
import { getAccessibleEventIds, getUserContext, requireEventPermission } from '@/app/api/_lib/access';

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

    let query = adminSupabase
      .from('documents')
      .select('*, events(name), profiles(full_name, email)')
      .order('created_at', { ascending: false })
      .limit(2000); // Allow up to 2000 documents for analytics

    if (!isAdmin) {
      const accessibleEventIds = await getAccessibleEventIds(adminSupabase, user.id, isAdmin);
      if (accessibleEventIds.length > 0) {
        query = query.or(`created_by.eq.${user.id},event_id.in.(${accessibleEventIds.join(',')})`);
      } else {
        query = query.eq('created_by', user.id);
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

    const { data: documents, error } = await query;

    if (error) {
      console.error('[Documents GET] Error:', error.message);
      return NextResponse.json({ error: 'Failed to load documents' }, { status: 500 });
    }

    return NextResponse.json({ documents });
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
          .select('is_agent, commission_rate, agent_status, agent_commission_config')
          .eq('id', user.id)
          .single();

        if (agentProfile?.is_agent && agentProfile.agent_status === 'active') {
          const { amount, rate } = calculateCommission(
            document.total_amount,
            agentProfile.agent_commission_config || null,
            agentProfile.commission_rate || 0,
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

        const { Resend } = await import('resend');
        const resend = new Resend(resendApiKey);
        const subject = document.document_type === 'order'
          ? `New order: ${document.client_company || document.client_name} — €${(document.total_amount || 0).toLocaleString('fr-FR')}`
          : `New quote: ${document.client_company || document.client_name}`;

        await resend.emails.send({
          from: 'LoveLab B2B <noreply@love-lab.com>',
          to: ['alberto@love-lab.com', 'dionne@love-lab.com'],
          subject,
          html: `
            <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
              <img src="https://lovelab-b2b.vercel.app/logo.png" alt="LoveLab" style="height:48px;margin-bottom:16px"/>
              <h2 style="color:#5D3A5E;margin:0 0 16px">
                ${document.document_type === 'order' ? '📦 New Order Created' : '📝 New Quote Created'}
              </h2>
              <table style="width:100%;border-collapse:collapse;font-size:14px">
                <tr><td style="padding:6px 0;color:#666;width:140px">Client</td><td style="padding:6px 0;font-weight:600">${document.client_company || document.client_name || '—'}</td></tr>
                <tr><td style="padding:6px 0;color:#666">Contact</td><td style="padding:6px 0">${document.client_name || '—'}</td></tr>
                <tr><td style="padding:6px 0;color:#666">Amount</td><td style="padding:6px 0;font-weight:600;color:#5D3A5E">€${(document.total_amount || 0).toLocaleString('fr-FR')}</td></tr>
                <tr><td style="padding:6px 0;color:#666">Folder</td><td style="padding:6px 0">${eventName || 'No folder'}</td></tr>
                <tr><td style="padding:6px 0;color:#666">Created by</td><td style="padding:6px 0">${creatorName}</td></tr>
                <tr><td style="padding:6px 0;color:#666">Type</td><td style="padding:6px 0;text-transform:capitalize">${document.document_type}</td></tr>
              </table>
              <div style="margin-top:20px">
                <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://lovelab-b2b.vercel.app'}/dashboard" style="background:#5D3A5E;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">View in Dashboard →</a>
              </div>
              <p style="margin-top:24px;font-size:11px;color:#aaa">LoveLab B2B — automated notification</p>
            </div>
          `,
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
