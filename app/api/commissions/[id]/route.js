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
 * Admin-only. Edits one commission row by hand. Any of:
 *   { invoice_number: "INV-123" }   the manual note; an empty string clears it
 *   { order_total: 1800 }           new net; the commission is recalculated
 *                                   from the line's rate
 *   { commission_amount: 350 }      set the commission directly
 *   { status: 'cancelled' }         take the line out of every total and
 *                                   report (the order itself is untouched);
 *   { status: 'pending' }           bring a cancelled line back
 * Amount and status changes are refused on a paid-out line (409).
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
    const hasInvoice = body?.invoice_number !== undefined;
    const hasNet = body?.order_total !== undefined;
    const hasCommission = body?.commission_amount !== undefined;
    const hasStatus = body?.status !== undefined;
    if (!body || (!hasInvoice && !hasNet && !hasCommission && !hasStatus)) {
      return NextResponse.json({ error: 'invoice_number is required' }, { status: 400 });
    }
    if (hasInvoice && body.invoice_number !== null && typeof body.invoice_number !== 'string') {
      return NextResponse.json({ error: 'invoice_number must be a string' }, { status: 400 });
    }

    const update = {};

    if (hasInvoice) {
      // Normalise: trim, cap length, and store NULL when blank.
      const trimmed = (body.invoice_number || '').trim().slice(0, MAX_INVOICE_LEN);
      update.invoice_number = trimmed === '' ? null : trimmed;
    }

    // Amounts and status (Dionne, 21 Oct 2026: fix a line's figures or
    // cancel it from the organization table without touching the order).
    if (hasNet || hasCommission || hasStatus) {
      const net = hasNet ? Number(body.order_total) : null;
      const commission = hasCommission ? Number(body.commission_amount) : null;
      if (hasNet && (!Number.isFinite(net) || net < 0)) {
        return NextResponse.json({ error: 'order_total must be a number ≥ 0' }, { status: 400 });
      }
      if (hasCommission && (!Number.isFinite(commission) || commission < 0)) {
        return NextResponse.json({ error: 'commission_amount must be a number ≥ 0' }, { status: 400 });
      }
      if (hasStatus && !['cancelled', 'pending'].includes(body.status)) {
        return NextResponse.json({ error: "status must be 'cancelled' or 'pending'" }, { status: 400 });
      }

      const { data: row, error: loadErr } = await adminSupabase
        .from('agent_commissions')
        .select('id, status, commission_rate, order_total, commission_amount, type')
        .eq('id', id)
        .maybeSingle();
      if (loadErr) {
        console.error('[Commissions PATCH] Load error:', loadErr.message);
        return NextResponse.json({ error: 'Failed to load commission' }, { status: 500 });
      }
      if (!row) return NextResponse.json({ error: 'Commission not found' }, { status: 404 });

      // A paid-out line is settled money: undo the payout first.
      if (row.status === 'paid') {
        return NextResponse.json(
          { error: 'This commission is already paid out. Undo the payout before changing it.' },
          { status: 409 },
        );
      }
      if ((hasNet || hasCommission) && row.status === 'cancelled' && body.status !== 'pending') {
        return NextResponse.json({ error: 'This commission is cancelled. Restore it first.' }, { status: 409 });
      }

      const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
      if (hasNet) {
        update.order_total = round2(net);
        // A new net recalculates the commission from the line's rate, unless
        // the commission itself is being set in the same request.
        if (!hasCommission) {
          const rate = Number(row.commission_rate) || 0;
          update.commission_amount = round2(net * rate / 100);
        }
      }
      if (hasCommission) update.commission_amount = round2(commission);
      if (hasStatus) {
        update.status = body.status;
        if (body.status === 'cancelled') update.paid_at = null;
      }
    }

    const { data: updated, error: updErr } = await adminSupabase
      .from('agent_commissions')
      .update(update)
      .eq('id', id)
      .select('id, invoice_number, order_total, commission_amount, commission_rate, status')
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
