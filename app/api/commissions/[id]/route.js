/**
 * DELETE /api/commissions/[id]
 *
 * Permanently removes a single commission row from the agent's history —
 * any type (quick order, ad-hoc bonus, real order commission, new-client
 * bonus) and any status (including paid out). Used to clean up entries that
 * are no longer relevant.
 *
 * Note: this only removes the commission row. For an order-linked commission
 * the underlying order document is left untouched (re-saving that order could
 * recreate the commission). Deleting a paid-out row does NOT touch the
 * agent_payments ledger or any commission_reports history.
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
