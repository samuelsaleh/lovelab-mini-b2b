import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}(T.*)?$/;

// Resolve and authorise the request, factored out so PATCH and DELETE share
// the exact same admin-only guard the original POST in ../route.js uses.
async function requireAdmin(request) {
  const rateLimitRes = checkRateLimit(request, { maxRequests: 30, prefix: 'agent-payments-mutate' });
  if (rateLimitRes) return { error: rateLimitRes };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { user, profile };
}

export async function PATCH(request, { params }) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Sparse update: only validate + assign fields the caller actually sent.
  // Sending null/undefined for a key leaves it unchanged.
  const update = {};
  if (Object.prototype.hasOwnProperty.call(body, 'amount')) {
    const amt = Number(body.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 });
    }
    update.amount = amt;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'notes')) {
    const notes = body.notes == null ? null : String(body.notes).trim();
    update.notes = notes ? notes : null;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'payment_date')) {
    const pd = String(body.payment_date || '').trim();
    if (!ISO_DATE_REGEX.test(pd)) {
      return NextResponse.json({ error: 'payment_date must be YYYY-MM-DD' }, { status: 400 });
    }
    update.payment_date = pd;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No editable fields supplied' }, { status: 400 });
  }

  const adminSupabase = createAdminClient();
  const { data: payment, error } = await adminSupabase
    .from('agent_payments')
    .update(update)
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!payment) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
  }
  return NextResponse.json({ payment });
}

export async function DELETE(request, { params }) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const adminSupabase = createAdminClient();
  // Hard-delete is intentional: agent_payments rows are admin-created records
  // of cash actually paid out; if it's wrong, the right operation is to
  // remove it, not to soft-delete and leave it haunting future totals.
  const { data: removed, error } = await adminSupabase
    .from('agent_payments')
    .delete()
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!removed) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
