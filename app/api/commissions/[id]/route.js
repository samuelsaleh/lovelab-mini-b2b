/**
 * DELETE /api/commissions/[id]
 *
 * Permanently removes a manual, unsettled commission row from the agent's
 * history (quick order or ad-hoc bonus). Paid, reported, and order-linked
 * rows are immutable here because they feed commission reports and payment
 * reconciliation.
 *
 * Access: admin only.
 */

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_INVOICE_LEN = 100;

/**
 * PATCH /api/commissions/[id]
 *
 * Admin-only. Updates the manual `invoice_number` note on a single commission
 * row. Send `{ invoice_number: "INV-123" }`; an empty string clears it.
 */
export async function PATCH(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, {
      maxRequests: 60,
      prefix: 'commission-patch',
    });
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

    const { id } = await params;
    if (!id || !UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid commission id' }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    if (!body || body.invoice_number === undefined) {
      return NextResponse.json({ error: 'invoice_number is required' }, { status: 400 });
    }
    if (body.invoice_number !== null && typeof body.invoice_number !== 'string') {
      return NextResponse.json({ error: 'invoice_number must be a string' }, { status: 400 });
    }

    // Normalise: trim, cap length, and store NULL when blank.
    const trimmed = (body.invoice_number || '').trim().slice(0, MAX_INVOICE_LEN);
    const value = trimmed === '' ? null : trimmed;

    const { data: updated, error: updErr } = await adminSupabase
      .from('agent_commissions')
      .update({ invoice_number: value })
      .eq('id', id)
      .select('id, invoice_number')
      .maybeSingle();

    if (updErr) {
      console.error('[Commissions PATCH] Error:', updErr.message);
      return NextResponse.json({ error: 'Failed to update commission' }, { status: 500 });
    }
    if (!updated) {
      return NextResponse.json({ error: 'Commission not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, commission: updated });
  } catch (err) {
    console.error('[Commissions PATCH] Exception:', err);
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, {
      maxRequests: 30,
      prefix: 'commission-delete',
    });
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

    const { id } = await params;
    if (!id || !UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid commission id' }, { status: 400 });
    }

    const { data: existing, error: lookupErr } = await adminSupabase
      .from('agent_commissions')
      .select('id, status, report_id, document_id')
      .eq('id', id)
      .maybeSingle();

    if (lookupErr) {
      console.error('[Commissions DELETE] Lookup error:', lookupErr.message);
      return NextResponse.json({ error: 'Failed to load commission' }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: 'Commission not found' }, { status: 404 });
    }
    if (existing.status === 'paid' || existing.report_id || existing.document_id) {
      return NextResponse.json(
        { error: 'Cannot delete paid, reported, or order-linked commissions' },
        { status: 409 },
      );
    }

    const { data: deleted, error: delErr } = await adminSupabase
      .from('agent_commissions')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (delErr) {
      console.error('[Commissions DELETE] Error:', delErr.message);
      return NextResponse.json({ error: 'Failed to delete commission' }, { status: 500 });
    }
    if (!deleted) {
      return NextResponse.json({ error: 'Commission not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, id });
  } catch (err) {
    console.error('[Commissions DELETE] Exception:', err);
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 },
    );
  }
}
