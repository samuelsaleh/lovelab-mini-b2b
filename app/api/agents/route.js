import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { welcomeAgentEmail, upgradeAgentEmail } from '@/lib/email-templates';
import { sendEmail } from '@/lib/send-email';
import { isAdmin, requireSession } from '@/lib/organizations/authz';
import { provisionAgentInOrg, autoEnsureOrganization } from '@/lib/organizations/provision-agent';
import { NextResponse } from 'next/server';

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

// GET - List all agents with aggregated commission stats (admin only)
export async function GET(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'agents' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const session = await requireSession(supabase);
    if (session.error) return session.error;
    if (!isAdmin(session.profile)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { user } = session;

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
    const includeTrashed = searchParams.get('include_trashed') === 'true';

    const [trashedResult, statsResult] = await Promise.all([
      includeTrashed
        ? adminSupabase.from('profiles').select(AGENT_SELECT).eq('is_agent', true).not('agent_deleted_at', 'is', null).order('agent_deleted_at', { ascending: false })
        : Promise.resolve({ data: [] }),
      adminSupabase.rpc('get_agent_stats'),
    ]);
    const trashedAgents = trashedResult.data || [];
    const rawStats = statsResult.data;

    // Reconcile legacy user IDs by email so stats stick to the same person.
    const currentAgentIdByEmail = new Map(
      (agents || [])
        .filter((a) => normalizeEmail(a.email))
        .map((a) => [normalizeEmail(a.email), a.id])
    );
    const sourceIds = (rawStats || []).map(s => s.agent_id).filter(Boolean);
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

    const mergedStats = {};
    for (const row of rawStats || []) {
      const targetId = resolveAgentId(row.agent_id);
      if (!targetId) continue;
      if (!mergedStats[targetId]) {
        mergedStats[targetId] = { total_orders: 0, total_revenue: 0, total_commission: 0, total_bonuses: 0, pending_commission: 0, paid_commission: 0, total_docs: 0, total_order_docs: 0, total_doc_revenue: 0 };
      }
      const s = mergedStats[targetId];
      s.total_orders += Number(row.total_orders) || 0;
      s.total_revenue += Number(row.total_revenue) || 0;
      s.total_commission += Number(row.total_commission) || 0;
      s.total_bonuses += Number(row.total_bonuses) || 0;
      s.pending_commission += Number(row.pending_commission) || 0;
      s.paid_commission += Number(row.paid_commission) || 0;
      s.total_docs += Number(row.total_docs) || 0;
      s.total_order_docs += Number(row.total_order_docs) || 0;
      s.total_doc_revenue += Number(row.total_doc_revenue) || 0;
    }

    const makeStats = (agentId, commissionRate = 0) => {
      const base = mergedStats[agentId] || {
        total_orders: 0, total_revenue: 0, total_commission: 0, total_bonuses: 0,
        pending_commission: 0, paid_commission: 0, total_docs: 0, total_order_docs: 0, total_doc_revenue: 0,
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
    const session = await requireSession(supabase);
    if (session.error) return session.error;
    if (!isAdmin(session.profile)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { user } = session;

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

      if (!authUser) {
        // generateLink creates the auth user; if send_invite was false, create one now
        const { data: createData, error: createErr } = await adminSupabase.auth.admin.createUser({
          email: emailLower,
          email_confirm: true,
          user_metadata: { full_name: full_name?.trim() || '' },
        });
        if (!createErr && createData?.user) {
          authUser = createData.user;
        }
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

      if (send_invite) {
        const agentName = full_name?.trim() || emailLower;
        const signInUrl = magicLinkUrl || `${siteUrl}/login`;
        const { subject, html } = welcomeAgentEmail(agentName, signInUrl, siteUrl);
        await sendEmail({ to: emailLower, subject, html });
      }
    }

    if (existingProfile && send_invite) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
      const agentName = full_name?.trim() || existingProfile.email;
      const { subject, html } = upgradeAgentEmail(agentName, siteUrl);
      await sendEmail({ to: existingProfile.email || emailLower, subject, html });
    }

    // Handle organization membership and folder provisioning
    if (agentProfile?.id && !agentProfile?._pending) {
      if (requestedOrgId) {
        try {
          const { data: existingMembership } = await adminSupabase
            .from('organization_memberships')
            .select('id')
            .eq('organization_id', requestedOrgId)
            .eq('user_id', agentProfile.id)
            .maybeSingle();

          if (!existingMembership) {
            await adminSupabase
              .from('organization_memberships')
              .insert({ organization_id: requestedOrgId, user_id: agentProfile.id, role: 'member' });
          }

          await provisionAgentInOrg(requestedOrgId, agentProfile.id);
        } catch (memberErr) {
          console.error('[Agents POST] Org membership/folder error (non-blocking):', memberErr.message);
        }
      } else if (!agentProfile.organization_id) {
        try {
          const result = await autoEnsureOrganization(agentProfile.id, user.id);
          agentProfile.organization_id = result.organization?.id || null;
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
