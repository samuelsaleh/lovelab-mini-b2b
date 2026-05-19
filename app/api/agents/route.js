import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { welcomeAgentEmail, upgradeAgentEmail } from '@/lib/email-templates';
import { sendEmail } from '@/lib/send-email';
import { isAdmin, requireSession } from '@/lib/organizations/authz';
import { provisionAgentInOrg, autoEnsureOrganization } from '@/lib/organizations/provision-agent';
import { grantAccess } from '@/lib/agents/access';
import { isValidEmail, normalizeEmail } from '@/lib/auth/validation';
import { ensureAgentDriveFolder } from '@/lib/agentDriveFolder';
import { NextResponse } from 'next/server';

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

    const AGENT_SELECT = 'id, email, full_name, avatar_url, is_agent, agent_status, commission_rate, agent_since, agent_conditions, agent_phone, agent_company, agent_country, agent_city, agent_region, agent_territory, agent_specialty, agent_notes, agent_deleted_at, agent_contract_url, created_at, organization_id, new_client_bonus_enabled, new_client_bonus_amount';

    // Use OR so agents whose is_agent flag was lost (NULL after a profile migration
    // race or partial upsert) are still visible as long as agent_status is set.
    const { data: agents, error } = await adminSupabase
      .from('profiles')
      .select(AGENT_SELECT)
      .or('is_agent.eq.true,agent_status.in.(invited,active,inactive)')
      .is('agent_deleted_at', null)
      .order('agent_since', { ascending: false, nullsFirst: false });

    if (error) {
      console.error('[Agents GET] Error:', error.message);
      return NextResponse.json({ error: 'Failed to load agents' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const includeTrashed = searchParams.get('include_trashed') === 'true';

    let trashedAgents = [];
    let rawStats = null;
    try {
      const [trashedResult, statsResult] = await Promise.all([
        includeTrashed
          ? adminSupabase.from('profiles').select(AGENT_SELECT).or('is_agent.eq.true,agent_status.in.(invited,active,inactive)').not('agent_deleted_at', 'is', null).order('agent_deleted_at', { ascending: false })
          : Promise.resolve({ data: [] }),
        adminSupabase.rpc('get_agent_stats'),
      ]);
      trashedAgents = trashedResult.data || [];
      rawStats = statsResult.data;
    } catch (e) {
      console.error('[Agents GET] stats/trashed query error (non-blocking):', e?.message);
    }

    const commByAgent = {};
    try {
      const { data: commRows } = await adminSupabase
        .from('agent_commissions')
        .select('agent_id, type, order_total, commission_amount, status, customer_paid_at');
      for (const c of commRows || []) {
        if (!c.agent_id) continue;
        // Phase 18 fix: cancelled rows must NOT count toward orders/revenue/
        // commission totals. Phase 11b's soft-delete cascade flips a row to
        // status='cancelled' when its document is trashed, which means a
        // deleted order would otherwise still appear in admin "Top Agents"
        // (this is exactly the Marc Schlund / 1 order / 470€ bug).
        if (c.status === 'cancelled') continue;
        if (!commByAgent[c.agent_id]) {
          commByAgent[c.agent_id] = {
            orders: 0,
            revenue: 0,
            commission: 0,
            pending: 0,
            paid: 0,
            // Phase 19b — four-bucket split.
            ready_to_pay: 0,
            awaiting_customer: 0,
          };
        }
        const a = commByAgent[c.agent_id];
        const amt = Number(c.commission_amount) || 0;
        if (c.type === 'order') { a.orders++; a.revenue += Number(c.order_total) || 0; }
        a.commission += amt;
        if (c.status === 'pending' || c.status === 'approved') {
          a.pending += amt;
          if (c.customer_paid_at) a.ready_to_pay += amt;
          else a.awaiting_customer += amt;
        } else if (c.status === 'paid') {
          a.paid += amt;
        }
      }
    } catch (e) {
      console.error('[Agents GET] commission query error (non-blocking):', e?.message);
    }

    // Fourth fallback: query documents directly, grouped by created_by.
    // This covers agents who have real B2B orders but no agent_commissions rows
    // (e.g. orders created before the commission hook existed, or orders saved
    // by a non-agent user on behalf of an agent).
    const docStatsByAgent = {};
    try {
      const { data: docRows } = await adminSupabase
        .from('documents')
        .select('created_by, total_amount, order_channel')
        .eq('document_type', 'order')
        .not('order_channel', 'in', '("internal","consignment")')
        .is('deleted_at', null);
      for (const d of docRows || []) {
        if (!d.created_by) continue;
        if (!docStatsByAgent[d.created_by]) docStatsByAgent[d.created_by] = { orders: 0, revenue: 0 };
        docStatsByAgent[d.created_by].orders++;
        docStatsByAgent[d.created_by].revenue += Number(d.total_amount) || 0;
      }
    } catch (e) {
      console.error('[Agents GET] doc stats fallback query error (non-blocking):', e?.message);
    }

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
      const fb = commByAgent[agentId];
      // Fourth fallback: actual documents created by this agent
      const ds = docStatsByAgent[agentId];
      const rate = Number(commissionRate) || 0;

      const effective_orders = (base.total_orders || 0) > 0 ? base.total_orders
        : fb ? fb.orders
        : (base.total_order_docs || 0) > 0 ? base.total_order_docs
        : (ds ? ds.orders : 0);

      const effective_revenue = (base.total_revenue || 0) > 0 ? base.total_revenue
        : fb ? fb.revenue
        : (base.total_doc_revenue || 0) > 0 ? base.total_doc_revenue
        : (ds ? ds.revenue : 0);

      const effective_total_commission = (base.total_commission || 0) > 0 ? base.total_commission
        : fb ? fb.commission
        : (rate > 0 && effective_revenue > 0 ? Math.round(effective_revenue * rate / 100 * 100) / 100 : 0);

      const effective_pending_commission = (base.pending_commission || 0) > 0 ? base.pending_commission
        : fb ? fb.pending
        : effective_total_commission - (base.paid_commission || (fb?.paid ?? 0));

      // Phase 19b — four-bucket split. Always sourced from the live
      // commission table (commByAgent); falls back to 0 when there are
      // no rows yet (older agents pre-migration). Never derived from
      // documents because the customer_paid_at flag has no document-level
      // equivalent.
      const ready_to_pay = fb?.ready_to_pay || 0;
      const awaiting_customer = fb?.awaiting_customer || 0;

      return {
        ...base,
        effective_orders: Math.round((effective_orders || 0) * 100) / 100,
        effective_revenue: Math.round((effective_revenue || 0) * 100) / 100,
        effective_total_commission: Math.round((effective_total_commission || 0) * 100) / 100,
        effective_pending_commission: Math.round(Math.max(0, effective_pending_commission || 0) * 100) / 100,
        ready_to_pay: Math.round(ready_to_pay * 100) / 100,
        awaiting_customer: Math.round(awaiting_customer * 100) / 100,
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

    const emailLower = normalizeEmail(email);
    if (!isValidEmail(emailLower)) {
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
      organization_id: requestedOrgId || null,
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

      // Ensure existing users are also granted login access
      try {
        await grantAccess(adminSupabase, emailLower);
      } catch (grantErr) {
        console.error('[Agents POST] grantAccess error (non-blocking):', grantErr.message);
      }
    } else {
      // New user -- add to allowed_emails and create auth account with magic link
      try {
        await grantAccess(adminSupabase, emailLower);
      } catch (grantErr) {
        console.error('[Agents POST] grantAccess error (non-blocking):', grantErr.message);
      }

      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
      let magicLinkUrl = null;

      // Check if an auth user already exists for this email (e.g. via Google OAuth)
      // to prevent creating a duplicate auth user with a different ID.
      let authUser = null;
      try {
        const { data: existingUsers } = await adminSupabase.auth.admin.listUsers({
          filter: `email.eq.${emailLower}`,
          perPage: 1,
        });
        const match = (existingUsers?.users || []).find(
          u => u.email?.toLowerCase() === emailLower
        );
        if (match) authUser = match;
      } catch (lookupErr) {
        console.warn('[Agents POST] Auth user lookup warning:', lookupErr.message);
      }

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
          // Only use the generateLink user if we haven't found an existing one
          if (!authUser && magicData?.user) {
            authUser = magicData.user;
          }
        }
      }

      if (!authUser) {
        // No existing auth user found; create one now
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
            has_password_set: false,
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
        console.error('[Agents POST] Could not create auth user for:', emailLower);
        return NextResponse.json({ error: 'Failed to create account. Please try again or check if the email already exists.' }, { status: 500 });
      }

      if (send_invite) {
        const agentName = full_name?.trim() || emailLower;
        const signInUrl = magicLinkUrl || `${siteUrl}/login`;
        const { subject, html } = welcomeAgentEmail(agentName, signInUrl, siteUrl);
        await sendEmail({ to: emailLower, subject, html });
      }
    }

    if (existingProfile && send_invite) {
      try {
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
        const agentName = full_name?.trim() || existingProfile.email;
        const { subject, html } = upgradeAgentEmail(agentName, siteUrl);
        await sendEmail({ to: existingProfile.email || emailLower, subject, html });
      } catch (emailErr) {
        console.error('[Agents POST] Upgrade email failed (non-blocking):', emailErr.message);
      }
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

    // Phase 22: pre-create the per-agent Google Drive folder for commission
    // reports so it shows up in mom's Drive immediately after the agent is
    // added (without waiting for the first report). Strictly best-effort —
    // a Drive outage / missing env / permission error must NEVER block agent
    // creation. The reports flow itself also lazy-creates the folder, so
    // worst case this hook is just a no-op and the folder appears on the
    // first "Send report now" click.
    if (agentProfile?.id && !agentProfile?._pending) {
      try {
        const drive = await ensureAgentDriveFolder({
          agentName: agentProfile.full_name || agentProfile.email,
          cachedFolderId: agentProfile.drive_folder_id || null,
        });
        if (drive?.ok && drive.folderId && !drive.fromCache) {
          const { error: cacheErr } = await adminSupabase
            .from('profiles')
            .update({ drive_folder_id: drive.folderId })
            .eq('id', agentProfile.id);
          if (cacheErr) {
            console.warn('[Agents POST] Failed to cache drive_folder_id (non-blocking):', cacheErr.message);
          } else {
            agentProfile.drive_folder_id = drive.folderId;
          }
        }
      } catch (driveErr) {
        console.warn('[Agents POST] Drive folder creation failed (non-blocking):', driveErr?.message || driveErr);
      }
    }

    return NextResponse.json({ agent: agentProfile });
  } catch (err) {
    console.error('[Agents POST] Exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
