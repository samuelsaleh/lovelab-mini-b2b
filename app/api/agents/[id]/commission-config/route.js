import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';

function validateConfigSchema(config) {
  switch (config.type) {
    case 'flat':
      if (typeof config.rate !== 'number' || config.rate < 0 || config.rate > 100) {
        return 'flat config requires "rate" as a number between 0 and 100';
      }
      break;
    case 'tiered':
      if (!Array.isArray(config.tiers) || config.tiers.length === 0) {
        return 'tiered config requires a non-empty "tiers" array';
      }
      for (const tier of config.tiers) {
        if (typeof tier.rate !== 'number' || tier.rate < 0 || tier.rate > 100) {
          return 'each tier must have a "rate" between 0 and 100';
        }
        if (tier.upTo !== undefined && (typeof tier.upTo !== 'number' || tier.upTo <= 0)) {
          return 'tier "upTo" must be a positive number';
        }
      }
      break;
    case 'category':
      if (!config.rates || typeof config.rates !== 'object' || Object.keys(config.rates).length === 0) {
        return 'category config requires a non-empty "rates" object';
      }
      for (const [key, val] of Object.entries(config.rates)) {
        if (typeof val !== 'number' || val < 0 || val > 100) {
          return `category rate for "${key}" must be a number between 0 and 100`;
        }
      }
      if (config.default !== undefined && (typeof config.default !== 'number' || config.default < 0 || config.default > 100)) {
        return 'category "default" rate must be between 0 and 100';
      }
      break;
    case 'complex':
      if (!config.description || typeof config.description !== 'string' || !config.description.trim()) {
        return 'complex config requires a non-empty "description" string';
      }
      break;
  }
  return null;
}

// PATCH /api/agents/[id]/commission-config
// Admin confirms and saves the AI-proposed commission config.
// Also updates commission_rate for flat/tiered configs.
// Access: admin only.
export async function PATCH(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 20, prefix: 'commission-config' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const adminSupabase = createAdminClient();
    const { data: profile } = await adminSupabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id: agentId } = await params;
    const { config } = await request.json();

    if (!config || typeof config !== 'object') {
      return NextResponse.json({ error: 'config object is required' }, { status: 400 });
    }

    const validTypes = ['flat', 'tiered', 'category', 'complex'];
    if (!validTypes.includes(config.type)) {
      return NextResponse.json({ error: `Invalid config type. Must be one of: ${validTypes.join(', ')}` }, { status: 400 });
    }

    const schemaErr = validateConfigSchema(config);
    if (schemaErr) {
      return NextResponse.json({ error: schemaErr }, { status: 400 });
    }

    const updates = { agent_commission_config: config };

    if (config.type === 'flat' && typeof config.rate === 'number') {
      const rate = Number(config.rate);
      if (rate >= 0 && rate <= 100) {
        updates.commission_rate = rate;
      }
    }

    const { data: updated, error } = await adminSupabase
      .from('profiles')
      .update(updates)
      .eq('id', agentId)
      .select('id, commission_rate, agent_commission_config')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
      }
      console.error('[commission-config PATCH] Error:', error.message);
      return NextResponse.json({ error: 'Failed to save commission config' }, { status: 500 });
    }

    return NextResponse.json({ agent: updated });
  } catch (err) {
    console.error('[commission-config PATCH] Exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
