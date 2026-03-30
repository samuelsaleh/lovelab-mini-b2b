import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { getUserContext, resolveAgentIds } from '@/app/api/_lib/access';
import { NextResponse } from 'next/server';

// GET — list consignment orders assigned to the current agent
// Filters by the consignment_agent_id column (indexed), not JSONB path.
export async function GET(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'consignment-my' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const adminSupabase = createAdminClient();
    const { user, isAdmin } = await getUserContext(supabase);

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Resolve all profile IDs for this user (handles re-invited agents)
    const agentIds = await resolveAgentIds(adminSupabase, user.id);

    let query = adminSupabase
      .from('documents')
      .select('id, created_at, client_name, client_company, total_amount, file_path, file_name, consignment_agent_id, metadata, order_channel')
      .eq('order_channel', 'consignment')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (agentIds.length === 1) {
      query = query.eq('consignment_agent_id', agentIds[0]);
    } else {
      query = query.in('consignment_agent_id', agentIds);
    }

    const { data: documents, error } = await query;

    if (error) {
      console.error('[Consignment/My GET] Error:', error.message);
      return NextResponse.json({ error: 'Failed to load consignment orders' }, { status: 500 });
    }

    return NextResponse.json({ documents: documents || [] });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
