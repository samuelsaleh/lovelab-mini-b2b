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

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

// GET - List all agents with aggregated commission stats (admin only)
export async function GET(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'agents' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!(await requireAdmin(supabase, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const adminSupabase = createAdminClient();

    const AGENT_SELECT = 'id, email, full_name, avatar_url, is_agent, agent_status, commission_rate, agent_since, agent_conditions, agent_phone, agent_company, agent_country, agent_city, agent_region, agent_territory, agent_specialty, agent_notes, agent_deleted_at, agent_contract_url, created_at, organization_id';

    const { data: agents, error } = await adminSupabase
      .from('profiles')
      .select(AGENT_SELECT)
      .eq('is_agent', true)
      .is('agent_deleted_at', null)
      .order('agent_since', { ascending: false, nullsFirst: false });

    if (error) {
      console.error('[Agents GET] Error:', error.message);
      return NextResponse.json({ error: 'Failed to load agents' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    let trashedAgents = [];
    if (searchParams.get('include_trashed') === 'true') {
      const { data: trashed } = await adminSupabase
        .from('profiles')
        .select(AGENT_SELECT)
        .eq('is_agent', true)
        .not('agent_deleted_at', 'is', null)
        .order('agent_deleted_at', { ascending: false });
      trashedAgents = trashed || [];
    }

    // Fetch aggregated commission stats per agent
    const { data: commissions } = await adminSupabase
      .from('agent_commissions')
      .select('agent_id, type, commission_amount, status, order_total');
    const { data: documents } = await adminSupabase
      .from('documents')
      .select('created_by, document_type, total_amount, deleted_at');

    // Reconcile legacy user ids by email so stats stick to the same person.
    const currentAgentIdByEmail = new Map(
      (agents || [])
        .filter((a) => normalizeEmail(a.email))
        .map((a) => [normalizeEmail(a.email), a.id])
    );
    const sourceIds = Array.from(new Set([
      ...(commissions || []).map((c) => c.agent_id).filter(Boolean),
      ...(documents || []).map((d) => d.created_by).filter(Boolean),
    ]));
    const sourceEmailById = {};
    if (sourceIds.length > 0) {
      const { data: sourceProfiles } = await adminSupabase
        .from('profiles')
        .select('id, email')
        .in('id', sourceIds);
      for (const p of sourceProfiles || []) {
        sourceEmailById[p.id] = normalizeEmail(p.email);
      }
    }
    const resolveAgentId = (rawId) => {
      if (!rawId) return null;
      if ((agents || []).some((a) => a.id === rawId)) return rawId;
      const email = sourceEmailById[rawId];
      return (email && currentAgentIdByEmail.get(email)) || rawId;
    };

    const statsMap = {};
    for (const c of commissions || []) {
      const targetAgentId = resolveAgentId(c.agent_id);
      if (!targetAgentId) continue;
      if (!statsMap[targetAgentId]) {
        statsMap[targetAgentId] = {
          total_orders: 0,
          total_revenue: 0,
          total_commission: 0,
          total_bonuses: 0,
          pending_commission: 0,
          paid_commission: 0,
        };
      }
      const s = statsMap[targetAgentId];
      if (c.type === 'order') {
        s.total_orders++;
        s.total_revenue += Number(c.order_total) || 0;
        s.total_commission += Number(c.commission_amount) || 0;
      } else if (c.type === 'bonus') {
        s.total_bonuses += Number(c.commission_amount) || 0;
      }
      if (c.status === 'pending' || c.status === 'approved') {
        s.pending_commission += Number(c.commission_amount) || 0;
      } else if (c.status === 'paid') {
        s.paid_commission += Number(c.commission_amount) || 0;
      }
    }

    const docStatsMap = {};
    for (const d of documents || []) {
      if (d.deleted_at) continue;
      const targetAgentId = resolveAgentId(d.created_by);
      if (!targetAgentId) continue;
      if (!docStatsMap[targetAgentId]) {
        docStatsMap[targetAgentId] = {
          total_docs: 0,
          total_order_docs: 0,
          total_doc_revenue: 0,
        };
      }
      const ds = docStatsMap[targetAgentId];
      ds.total_docs += 1;
      if (d.document_type === 'order') {
        ds.total_order_docs += 1;
        ds.total_doc_revenue += Number(d.total_amount) || 0;
      }
    }

    const makeStats = (agentId, commissionRate = 0) => {
      const base = {
        ...(statsMap[agentId] || {
          total_orders: 0,
          total_revenue: 0,
          total_commission: 0,
          total_bonuses: 0,
          pending_commission: 0,
          paid_commission: 0,
        }),
        ...(docStatsMap[agentId] || {
          total_docs: 0,
          total_order_docs: 0,
          total_doc_revenue: 0,
        }),
      };
      const noCommissionHistory =
        (base.total_orders || 0) === 0 &&
        (base.total_commission || 0) === 0 &&
        (base.pending_commission || 0) === 0 &&
        (base.paid_commission || 0) === 0;
      const effective_orders = (base.total_orders || 0) > 0 ? base.total_orders : (base.total_order_docs || 0);
      const effective_revenue = (base.total_revenue || 0) > 0 ? base.total_revenue : (base.total_doc_revenue || 0);
      const estimatedFromDocs = ((base.total_doc_revenue || 0) * (Number(commissionRate) || 0)) / 100;
      const effective_total_commission = (base.total_commission || 0) > 0
        ? base.total_commission
        : (noCommissionHistory ? estimatedFromDocs : 0);
      const effective_pending_commission = (base.pending_commission || 0) > 0
        ? base.pending_commission
        : (noCommissionHistory ? estimatedFromDocs : 0);
      return {
        ...base,
        effective_orders: Math.round((effective_orders || 0) * 100) / 100,
        effective_revenue: Math.round((effective_revenue || 0) * 100) / 100,
        effective_total_commission: Math.round((effective_total_commission || 0) * 100) / 100,
        effective_pending_commission: Math.round((effective_pending_commission || 0) * 100) / 100,
      };
    };

    const orgIds = [...new Set((agents || []).map(a => a.organization_id).filter(Boolean))];
    const orgMap = {};
    if (orgIds.length > 0) {
      const { data: orgs } = await adminSupabase
        .from('organizations')
        .select('id, name, territory, commission_rate, conditions')
        .in('id', orgIds);
      for (const org of orgs || []) {
        orgMap[org.id] = org;
      }
    }

    const agentsWithStats = agents.map(a => {
      const org = orgMap[a.organization_id] || null;
      return {
        ...a,
        organization_name: org?.name || null,
        organization_territory: org?.territory || null,
        organization_rate: org?.commission_rate ?? null,
        organization_conditions: org?.conditions || null,
        stats: makeStats(a.id, a.commission_rate),
      };
    });

    const response = { agents: agentsWithStats };
    if (trashedAgents.length > 0) {
      response.trashedAgents = trashedAgents.map(a => ({
        ...a,
        stats: makeStats(a.id, a.commission_rate),
      }));
    }
    return NextResponse.json(response);
  } catch (err) {
    console.error('[Agents GET] Exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create/invite a new agent (admin only)
export async function POST(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 20, prefix: 'agents-post' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!(await requireAdmin(supabase, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const {
      email,
      commission_rate,
      full_name,
      agent_phone,
      agent_company,
      agent_country,
      agent_city,
      agent_region,
      agent_territory,
      agent_specialty,
      agent_conditions,
      agent_notes,
      organization_id: requestedOrgId,
      send_invite = true,
    } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const emailLower = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLower)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    const rate = Number(commission_rate);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      return NextResponse.json({ error: 'Commission rate must be between 0 and 100' }, { status: 400 });
    }

    const adminSupabase = createAdminClient();

    // Check if user already exists in profiles
    const { data: existingProfile } = await adminSupabase
      .from('profiles')
      .select('id, email, is_agent')
      .eq('email', emailLower)
      .maybeSingle();

    const agentFields = {
      is_agent: true,
      agent_status: existingProfile ? 'active' : 'invited',
      commission_rate: rate,
      agent_since: new Date().toISOString(),
      agent_phone: agent_phone?.trim() || null,
      agent_company: agent_company?.trim() || null,
      agent_country: agent_country?.trim() || null,
      agent_city: agent_city?.trim() || null,
      agent_region: agent_region?.trim() || null,
      agent_territory: agent_territory?.trim() || null,
      agent_specialty: agent_specialty?.trim() || null,
      agent_conditions: agent_conditions?.trim() || null,
      agent_notes: agent_notes?.trim() || null,
      ...(requestedOrgId ? { organization_id: requestedOrgId } : {}),
    };

    let agentProfile;

    if (existingProfile) {
      // Existing user -- upgrade to agent
      const nameUpdate = full_name?.trim() ? { full_name: full_name.trim() } : {};
      const { data, error } = await adminSupabase
        .from('profiles')
        .update({ ...agentFields, ...nameUpdate })
        .eq('id', existingProfile.id)
        .select()
        .single();

      if (error) {
        console.error('[Agents POST] Update error:', error.message);
        return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
      }
      agentProfile = data;
    } else {
      // New user -- add to allowed_emails and create auth account with magic link
      await adminSupabase
        .from('allowed_emails')
        .upsert({ email: emailLower }, { onConflict: 'email' });

      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
      let magicLinkUrl = null;

      let authUser = null;

      if (send_invite) {
        const { data: magicData, error: magicError } = await adminSupabase.auth.admin.generateLink({
          type: 'magiclink',
          email: emailLower,
          options: {
            data: { full_name: full_name?.trim() || '' },
            redirectTo: `${siteUrl}/auth/callback`,
          },
        });
        if (magicError) {
          console.warn('[Agents POST] Magic link warning:', magicError.message);
        } else {
          if (magicData?.properties?.action_link) {
            magicLinkUrl = magicData.properties.action_link;
          }
          if (magicData?.user) {
            authUser = magicData.user;
          }
        }
      }

      // If generateLink didn't return the user, look them up by paginated list
      if (!authUser) {
        const { data: { users } } = await adminSupabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
        authUser = users?.find(u => u.email?.toLowerCase() === emailLower) || null;
      }

      if (authUser) {
        const { data, error } = await adminSupabase
          .from('profiles')
          .upsert({
            id: authUser.id,
            email: emailLower,
            full_name: full_name?.trim() || '',
            ...agentFields,
          }, { onConflict: 'id' })
          .select()
          .single();

        if (error) {
          console.error('[Agents POST] Profile upsert error:', error.message);
          return NextResponse.json({ error: 'Failed to create agent profile' }, { status: 500 });
        }
        agentProfile = data;
      } else {
        agentProfile = { email: emailLower, ...agentFields, full_name: full_name?.trim() || '', _pending: true };
      }

      // Send branded welcome email with magic link via Resend
      if (send_invite) {
        const resendApiKey = process.env.RESEND_API_KEY;
        if (resendApiKey) {
          const agentName = full_name?.trim() || emailLower;
          const signInUrl = magicLinkUrl || `${siteUrl}/login`;
          try {
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from: getSenderFrom(),
                to: [emailLower],
                subject: `${agentName}, you're invited to LoveLab B2B`,
                html: `
                  <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #fff;">
                    <img src="${siteUrl}/logo.png" alt="LoveLab" style="height: 48px; margin-bottom: 24px;" />
                    <h2 style="color: #1a1a1a; margin: 0 0 8px;">Welcome, ${agentName}!</h2>
                    <p style="color: #555; font-size: 15px; margin: 0 0 24px;">
                      You've been invited to join <strong style="color: #5D3A5E;">LoveLab B2B</strong> as a sales partner.
                    </p>
                    <p style="color: #555; font-size: 15px; margin: 0 0 24px;">
                      Click the button below to sign in — no password needed.
                    </p>
                    <a href="${signInUrl}" style="display: inline-block; padding: 14px 32px; background: #5D3A5E; color: #fff; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600;">
                      Sign in to LoveLab B2B
                    </a>
                    <p style="color: #aaa; font-size: 12px; margin-top: 24px;">
                      You can also sign in anytime at <a href="${siteUrl}/login" style="color: #5D3A5E;">${siteUrl.replace('https://', '')}</a> using Google.
                    </p>
                    <p style="color: #ccc; font-size: 11px; margin-top: 24px;">
                      LoveLab B2B · This email was sent automatically.
                    </p>
                  </div>
                `,
              }),
            });
          } catch (emailErr) {
            console.error('[Agents POST] Welcome email error:', emailErr.message);
          }
        }
      }
    }

    // Send branded welcome email for existing users being upgraded to agent
    if (existingProfile && send_invite) {
      const resendApiKey = process.env.RESEND_API_KEY;
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
      if (resendApiKey) {
        const agentName = full_name?.trim() || existingProfile.email;
        try {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: getSenderFrom(),
              to: [existingProfile.email || emailLower],
              subject: `${agentName}, you're now a LoveLab sales partner`,
              html: `
                <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #fff;">
                  <img src="${siteUrl}/logo.png" alt="LoveLab" style="height: 48px; margin-bottom: 24px;" />
                  <h2 style="color: #1a1a1a; margin: 0 0 8px;">Welcome, ${agentName}!</h2>
                  <p style="color: #555; font-size: 15px; margin: 0 0 24px;">
                    You've been added as a <strong style="color: #5D3A5E;">LoveLab sales partner</strong>. Your orders and commissions will now be tracked automatically.
                  </p>
                  <a href="${siteUrl}/login" style="display: inline-block; padding: 14px 32px; background: #5D3A5E; color: #fff; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600;">
                    Go to LoveLab B2B
                  </a>
                  <p style="color: #ccc; font-size: 11px; margin-top: 24px;">
                    LoveLab B2B · This email was sent automatically.
                  </p>
                </div>
              `,
            }),
          });
        } catch (emailErr) {
          console.error('[Agents POST] Upgrade email error:', emailErr.message);
        }
      }
    }

    // Auto-create root folder for the agent if they have an ID and don't already have one
    if (agentProfile?.id && !agentProfile?._pending) {
      try {
        const { data: existingFolder } = await adminSupabase
          .from('agent_folders')
          .select('id')
          .eq('agent_id', agentProfile.id)
          .is('parent_id', null)
          .maybeSingle();

        if (!existingFolder) {
          await adminSupabase.from('agent_folders').insert({
            agent_id: agentProfile.id,
            name: agentProfile.full_name?.trim() || agentProfile.email || 'My Folder',
            parent_id: null,
            created_by: user.id,
          });
        }
      } catch (folderErr) {
        console.error('[Agents POST] Root folder creation error (non-blocking):', folderErr.message);
      }

      // Auto-ensure organization + org storage folders
      if (!agentProfile.organization_id) {
        try {
          const orgRes = await fetch(
            new URL('/api/organizations/auto-ensure', process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin),
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                cookie: request.headers.get('cookie') || '',
              },
              body: JSON.stringify({ user_id: agentProfile.id }),
            }
          );
          if (orgRes.ok) {
            const orgJson = await orgRes.json();
            agentProfile.organization_id = orgJson.organization?.id || null;
          }
        } catch (orgErr) {
          console.error('[Agents POST] Auto-ensure org error (non-blocking):', orgErr.message);
        }
      }
    }

    return NextResponse.json({ agent: agentProfile });
  } catch (err) {
    console.error('[Agents POST] Exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
