import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { isAdmin, requireSession } from '@/lib/organizations/authz';
import { grantAccess } from '@/lib/agents/access';
import { autoEnsureOrganization } from '@/lib/organizations/provision-agent';
import { NextResponse } from 'next/server';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/agents/[id]/repair
 * Idempotently fixes all broken states for an agent:
 *   - Ensures allowed_emails entry exists
 *   - Activates agents stuck at 'invited' who have already logged in
 *   - Creates org + membership + folders if missing
 * Returns a report of what was fixed vs. already healthy.
 */
export async function POST(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 20, prefix: 'agent-repair' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const session = await requireSession(supabase);
    if (session.error) return session.error;
    if (!isAdmin(session.profile)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    if (!id || !UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid agent ID' }, { status: 400 });
    }

    const adminSupabase = createAdminClient();
    const fixes = [];
    const healthy = [];

    // Load the agent profile
    const { data: agent, error: profileErr } = await adminSupabase
      .from('profiles')
      .select('id, email, is_agent, agent_status, organization_id, agent_since')
      .eq('id', id)
      .maybeSingle();

    if (profileErr || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // 1. Ensure is_agent=true and valid status
    if (!agent.is_agent || !agent.agent_status) {
      const { error: flagErr } = await adminSupabase
        .from('profiles')
        .update({
          is_agent: true,
          agent_status: agent.agent_status || 'active',
          agent_since: agent.agent_since || new Date().toISOString(),
        })
        .eq('id', id);

      if (flagErr) {
        fixes.push({ item: 'is_agent flag', status: 'failed', error: flagErr.message });
      } else {
        fixes.push({ item: 'is_agent flag', status: 'fixed' });
      }
    } else {
      healthy.push('is_agent flag');
    }

    // 2. Ensure allowed_emails entry
    const { data: emailRow } = await adminSupabase
      .from('allowed_emails')
      .select('email')
      .eq('email', agent.email)
      .maybeSingle();

    if (!emailRow) {
      try {
        await grantAccess(adminSupabase, agent.email);
        fixes.push({ item: 'allowed_emails', status: 'fixed' });
      } catch (grantErr) {
        fixes.push({ item: 'allowed_emails', status: 'failed', error: grantErr.message });
      }
    } else {
      healthy.push('allowed_emails');
    }

    // 3. Activate agent stuck at 'invited' (they have logged in — auth user confirmed)
    if (agent.agent_status === 'invited') {
      const { data: authUser } = await adminSupabase.auth.admin.getUserById(id);
      const hasLoggedIn = !!authUser?.user?.last_sign_in_at;
      if (hasLoggedIn) {
        const { error: activateErr } = await adminSupabase
          .from('profiles')
          .update({ agent_status: 'active' })
          .eq('id', id);

        if (activateErr) {
          fixes.push({ item: 'agent_status invited→active', status: 'failed', error: activateErr.message });
        } else {
          fixes.push({ item: 'agent_status invited→active', status: 'fixed' });
        }
      } else {
        healthy.push('agent_status (invited, not yet logged in)');
      }
    } else {
      healthy.push('agent_status');
    }

    // 4. Ensure org + membership + folders
    if (!agent.organization_id) {
      try {
        const result = await autoEnsureOrganization(id, session.user.id);
        const folderOk = !!result.folder;
        fixes.push({ item: 'organization', status: 'fixed', name: result.organization?.name });
        fixes.push({ item: 'agent_folders', status: folderOk ? 'fixed' : 'failed — provisioning error' });
      } catch (orgErr) {
        fixes.push({ item: 'organization + folders', status: 'failed', error: orgErr.message });
      }
    } else {
      // Always run the idempotent full-tree provisioner. A root can exist while
      // the Sub-agents grouping or this member's child folder is missing.
      try {
        const { provisionOrganizationFolders } = await import('@/lib/organizations/provision-agent');
        await provisionOrganizationFolders(agent.organization_id);
        healthy.push('organization');
        fixes.push({ item: 'agent_folders tree', status: 'verified/repaired' });
      } catch (folderErr) {
        fixes.push({ item: 'agent_folders tree', status: 'failed', error: folderErr.message });
      }
    }

    return NextResponse.json({ fixes, healthy, message: `Repair complete. ${fixes.length} item(s) fixed.` });
  } catch (err) {
    console.error('[Agent Repair] Exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
