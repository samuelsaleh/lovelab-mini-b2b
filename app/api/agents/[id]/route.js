import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { getSenderFrom } from '@/lib/email';
import { isAdmin as isAdminRole } from '@/lib/organizations/utils';
import { NextResponse } from 'next/server';

async function requireAdmin(supabase, userId) {
  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();
  return isAdminRole(data);
}

const AGENT_FIELDS = 'id, email, full_name, avatar_url, is_agent, agent_status, commission_rate, agent_since, agent_conditions, agent_phone, agent_company, agent_country, agent_city, agent_region, agent_territory, agent_specialty, agent_notes, agent_deleted_at, agent_contract_url, created_at, organization_id';

// GET - Single agent detail with commission history (admin only)
export async function GET(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'agent-detail' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!(await requireAdmin(supabase, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const adminSupabase = createAdminClient();

    const { data: agent, error } = await adminSupabase
      .from('profiles')
      .select(AGENT_FIELDS)
      .eq('id', id)
      .eq('is_agent', true)
      .single();

    if (error || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // Fetch commission history
    const { data: commissions } = await adminSupabase
      .from('agent_commissions')
      .select('id, type, document_id, order_total, commission_rate, commission_amount, status, paid_at, notes, created_at')
      .eq('agent_id', id)
      .order('created_at', { ascending: false })
      .limit(500);

    // Fetch document details for order-type commissions
    const docIds = (commissions || [])
      .filter(c => c.document_id)
      .map(c => c.document_id);

    let docsMap = {};
    if (docIds.length > 0) {
      const { data: docs } = await adminSupabase
        .from('documents')
        .select('id, client_name, client_company, created_at')
        .in('id', docIds);

      for (const d of docs || []) {
        docsMap[d.id] = d;
      }
    }

    const commissionsWithDocs = (commissions || []).map(c => ({
      ...c,
      document: c.document_id ? docsMap[c.document_id] || null : null,
    }));

    return NextResponse.json({ agent, commissions: commissionsWithDocs });
  } catch (err) {
    console.error('[Agent GET] Exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - Update agent profile/rate/status (admin only)
export async function PUT(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 30, prefix: 'agent-update' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!(await requireAdmin(supabase, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const adminSupabase = createAdminClient();

    // Verify agent exists
    const { data: existing } = await adminSupabase
      .from('profiles')
      .select('id, is_agent')
      .eq('id', id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // Handle restore from trash
    if (body._restore === true) {
      const { data: restored, error: restoreErr } = await adminSupabase
        .from('profiles')
        .update({ agent_status: 'active', agent_deleted_at: null })
        .eq('id', id)
        .select(AGENT_FIELDS)
        .single();

      if (restoreErr) {
        console.error('[Agent PUT] Restore error:', restoreErr.message);
        return NextResponse.json({ error: 'Failed to restore agent' }, { status: 500 });
      }

      // Re-add to allowed_emails so they can log back in
      if (restored?.email) {
        try {
          await adminSupabase
            .from('allowed_emails')
            .upsert({ email: restored.email.toLowerCase() }, { onConflict: 'email' });
        } catch (allowErr) {
          console.error('[Agent PUT] allowed_emails re-add error (non-blocking):', allowErr.message);
        }

        // Generate a new magic link and send a "your access has been restored" email
        const resendApiKey = process.env.RESEND_API_KEY;
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
        if (resendApiKey) {
          try {
            let magicLinkUrl = `${siteUrl}/login`;
            const { data: magicData } = await adminSupabase.auth.admin.generateLink({
              type: 'magiclink',
              email: restored.email.toLowerCase(),
              options: { redirectTo: `${siteUrl}/auth/callback` },
            });
            if (magicData?.properties?.action_link) {
              magicLinkUrl = magicData.properties.action_link;
            }

            const agentName = restored.full_name || restored.email;
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from: getSenderFrom(),
                to: [restored.email],
                subject: `${agentName}, your LoveLab B2B access has been restored`,
                html: `
                  <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #fff;">
                    <img src="${siteUrl}/logo.png" alt="LoveLab" style="height: 48px; margin-bottom: 24px;" />
                    <h2 style="color: #1a1a1a; margin: 0 0 8px;">Your access has been restored</h2>
                    <p style="color: #555; font-size: 15px; margin: 0 0 24px;">
                      Hi ${agentName}, your access to <strong style="color: #5D3A5E;">LoveLab B2B</strong> has been restored. You can now log back in.
                    </p>
                    <a href="${magicLinkUrl}" style="display: inline-block; padding: 14px 32px; background: #5D3A5E; color: #fff; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600;">
                      Sign in to LoveLab B2B
                    </a>
                    <p style="color: #ccc; font-size: 11px; margin-top: 24px;">
                      LoveLab B2B · This email was sent automatically.
                    </p>
                  </div>
                `,
              }),
            });
          } catch (emailErr) {
            console.error('[Agent PUT] Restore email error (non-blocking):', emailErr.message);
          }
        }
      }

      return NextResponse.json({ agent: restored, message: 'Agent restored.' });
    }

    // Build update object from allowed fields only
    const allowedFields = [
      'full_name', 'commission_rate', 'agent_status', 'agent_conditions',
      'agent_phone', 'agent_company', 'agent_country', 'agent_city',
      'agent_region', 'agent_territory', 'agent_specialty', 'agent_notes',
    ];

    const updates = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = typeof body[field] === 'string' ? body[field].trim() || null : body[field];
      }
    }

    if (updates.commission_rate !== undefined) {
      const rate = Number(updates.commission_rate);
      if (isNaN(rate) || rate < 0 || rate > 100) {
        return NextResponse.json({ error: 'Commission rate must be between 0 and 100' }, { status: 400 });
      }
      updates.commission_rate = rate;
    }

    if (updates.agent_status !== undefined) {
      const validStatuses = ['invited', 'active', 'paused', 'inactive'];
      if (!validStatuses.includes(updates.agent_status)) {
        return NextResponse.json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }, { status: 400 });
      }
    }

    // Handle organization reassignment
    const newOrgId = body.organization_id !== undefined ? (body.organization_id || null) : undefined;
    if (newOrgId !== undefined) {
      updates.organization_id = newOrgId;

      const { data: currentProfile } = await adminSupabase
        .from('profiles')
        .select('organization_id')
        .eq('id', id)
        .single();

      const oldOrgId = currentProfile?.organization_id || null;

      if (oldOrgId !== newOrgId) {
        if (oldOrgId) {
          await adminSupabase
            .from('organization_memberships')
            .delete()
            .eq('organization_id', oldOrgId)
            .eq('user_id', id);
        }
        if (newOrgId) {
          const { data: existingMembership } = await adminSupabase
            .from('organization_memberships')
            .select('id')
            .eq('organization_id', newOrgId)
            .eq('user_id', id)
            .maybeSingle();

          if (!existingMembership) {
            await adminSupabase
              .from('organization_memberships')
              .insert({ organization_id: newOrgId, user_id: id, role: 'member' });
          }
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const { data: agent, error } = await adminSupabase
      .from('profiles')
      .update(updates)
      .eq('id', id)
      .select(AGENT_FIELDS)
      .single();

    if (error) {
      console.error('[Agent PUT] Error:', error.message);
      return NextResponse.json({ error: 'Failed to update agent' }, { status: 500 });
    }

    return NextResponse.json({ agent });
  } catch (err) {
    console.error('[Agent PUT] Exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Soft-delete agent (7-day recovery window, then permanent)
export async function DELETE(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 20, prefix: 'agent-delete' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!(await requireAdmin(supabase, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const adminSupabase = createAdminClient();
    const url = new URL(request.url);
    const permanent = url.searchParams.get('permanent') === 'true';

    if (permanent) {
      // Permanent delete: only allowed if already soft-deleted and past 7 days
      const { data: check } = await adminSupabase
        .from('profiles')
        .select('agent_deleted_at')
        .eq('id', id)
        .single();

      if (!check?.agent_deleted_at) {
        return NextResponse.json({ error: 'Agent must be in trash before permanent deletion' }, { status: 400 });
      }

      const deletedAt = new Date(check.agent_deleted_at);
      const daysSince = (Date.now() - deletedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) {
        return NextResponse.json({ error: `Cannot permanently delete yet. ${Math.ceil(7 - daysSince)} days remaining.` }, { status: 400 });
      }

      // Wipe agent fields but keep the user profile
      const { error } = await adminSupabase
        .from('profiles')
        .update({
          is_agent: false,
          agent_status: null,
          commission_rate: null,
          agent_since: null,
          agent_conditions: null,
          agent_phone: null,
          agent_company: null,
          agent_country: null,
          agent_city: null,
          agent_region: null,
          agent_territory: null,
          agent_specialty: null,
          agent_notes: null,
          agent_deleted_at: null,
        })
        .eq('id', id);

      if (error) {
        console.error('[Agent DELETE permanent] Error:', error.message);
        return NextResponse.json({ error: 'Failed to permanently delete agent' }, { status: 500 });
      }

      return NextResponse.json({ message: 'Agent permanently removed. Commission history preserved.' });
    }

    // Soft-delete: mark with timestamp, deactivate
    const { data: agent, error } = await adminSupabase
      .from('profiles')
      .update({
        agent_status: 'inactive',
        agent_deleted_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(AGENT_FIELDS)
      .single();

    if (error) {
      console.error('[Agent DELETE] Error:', error.message);
      return NextResponse.json({ error: 'Failed to delete agent' }, { status: 500 });
    }

    // Revoke all active sessions by deleting from auth.sessions.
    // Existing access-token JWTs remain valid until they expire (Supabase limitation)
    // but refresh tokens are invalidated so no new tokens can be obtained.
    try {
      await adminSupabase.rpc('revoke_user_sessions', { uid: id });
    } catch (revokeErr) {
      console.error('[Agent DELETE] Session revocation error (non-blocking):', revokeErr.message);
    }

    // Remove from allowed_emails so they cannot log back in
    if (agent?.email) {
      try {
        await adminSupabase
          .from('allowed_emails')
          .delete()
          .eq('email', agent.email.toLowerCase());
      } catch (emailErr) {
        console.error('[Agent DELETE] allowed_emails removal error (non-blocking):', emailErr.message);
      }
    }

    return NextResponse.json({ agent, message: 'Agent moved to trash. Can be restored within 7 days.' });
  } catch (err) {
    console.error('[Agent DELETE] Exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
