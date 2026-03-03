import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';
import pdfParse from 'pdf-parse';

const BUCKET = 'documents';

// GET /api/agents/[id]/contract-text
// Downloads the agent's contract PDF and returns extracted plain text.
// Access: admin or the agent themselves.
export async function GET(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 20, prefix: 'contract-text' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: agentId } = await params;
    if (!agentId) return NextResponse.json({ error: 'Missing agent ID' }, { status: 400 });

    const adminSupabase = createAdminClient();

    // Access check: admin or the agent themselves
    const { data: profile } = await adminSupabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAdmin = profile?.role === 'admin';
    const isSelf = user.id === agentId;
    if (!isAdmin && !isSelf) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get contract path from agent profile
    const { data: agentProfile } = await adminSupabase
      .from('profiles')
      .select('agent_contract_url, agent_commission_config, commission_rate')
      .eq('id', agentId)
      .single();

    if (!agentProfile?.agent_contract_url) {
      return NextResponse.json({ text: null, commissionConfig: null });
    }

    // Download PDF from storage
    const { data: fileData, error: downloadError } = await adminSupabase.storage
      .from(BUCKET)
      .download(agentProfile.agent_contract_url);

    if (downloadError || !fileData) {
      console.error('[contract-text GET] Download error:', downloadError?.message);
      return NextResponse.json({ error: 'Failed to download contract' }, { status: 500 });
    }

    // Parse PDF to text
    const arrayBuffer = await fileData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const parsed = await pdfParse(buffer);
    const text = parsed.text?.trim() || '';

    return NextResponse.json({
      text,
      commissionConfig: agentProfile.agent_commission_config || null,
      commissionRate: agentProfile.commission_rate || 0,
    });
  } catch (err) {
    console.error('[contract-text GET] Exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
