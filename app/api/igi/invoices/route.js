import { NextResponse } from 'next/server';
import { requireLoveLab, fail } from '@/app/api/igi/_lib/access';
import {
  invoiceOnEveryBasis, invoiceComparison, basisThatWouldMatch,
  DEFAULT_BASIS, INVOICE_BASES, FEE_EUR,
} from '@/lib/igi/derive';
import { monthKey } from '@/lib/igi/dates';

/**
 * GET /api/igi/invoices
 *
 * Every month with completed movements: our own figures on all three bases,
 * model by model, beside whatever IGI actually billed.
 *
 * Our figure is derived here rather than stored, so it cannot drift away from
 * the movements. Only IGI's invoice is kept, which is the whole point of
 * putting the two columns side by side.
 */
export async function GET(request) {
  const auth = await requireLoveLab(request, 'igi-invoices');
  if (auth.error) return auth.error;

  try {
    const db = auth.adminSupabase;

    const [visits, lines, models, invoices] = await Promise.all([
      db.from('igi_visits').select('id, visit_no, visit_date, status, unattributed_total, date_suspect'),
      db.from('igi_visit_lines').select('visit_id, model_id, qty_requested, qty_issued, qty_received'),
      db.from('igi_models').select('id, serial, name, stones, carat, shape'),
      db.from('igi_invoices').select('period_month, igi_reference, igi_total_eur, basis, note'),
    ]);

    for (const r of [visits, lines, models, invoices]) {
      if (r.error) return fail('IGI/Invoices GET', r.error, 'Failed to load the invoices');
    }

    const modelById = new Map(models.data.map((m) => [m.id, m]));
    const billedByMonth = new Map(
      invoices.data.map((i) => [monthKey(i.period_month), i]),
    );

    const closed = visits.data.filter((v) => v.status === 'closed');
    const months = [...new Set(closed.map((v) => monthKey(v.visit_date)))]
      .filter(Boolean)
      .sort()
      .reverse();

    return NextResponse.json({
      fee_eur: FEE_EUR,
      bases: Object.fromEntries(
        Object.entries(INVOICE_BASES).map(([k, v]) => [k, { label: v.label, note: v.note }]),
      ),
      months: months.map((month) => {
        const billed = billedByMonth.get(month) || null;
        const basis = billed?.basis || DEFAULT_BASIS;
        const byBasis = invoiceOnEveryBasis(month, visits.data, lines.data);
        const ours = byBasis[basis];
        const billedEur = billed?.igi_total_eur == null ? null : Number(billed.igi_total_eur);

        return {
          month,
          basis,
          ours: {
            ...ours,
            rows: ours.rows.map((r) => ({ ...r, ...nameOf(modelById.get(r.model_id)) })),
          },
          // Every basis, so a disagreement can be explained rather than argued.
          totals_by_basis: Object.fromEntries(
            Object.entries(byBasis).map(([k, v]) => [k, { qty: v.qty, eur: v.eur }]),
          ),
          billed: billed && {
            reference: billed.igi_reference,
            total_eur: billedEur,
            note: billed.note,
          },
          comparison: invoiceComparison(ours.eur, billedEur),
          basis_that_would_match: basisThatWouldMatch(byBasis, billedEur),
        };
      }),
    });
  } catch (err) {
    return fail('IGI/Invoices GET', err, 'Internal server error');
  }
}

function nameOf(model) {
  return {
    serial: model?.serial ?? null,
    name: model?.name ?? 'Unknown model',
    stones: model?.stones ?? null,
    carat: model?.carat ?? null,
    shape: model?.shape ?? null,
  };
}

/**
 * PUT /api/igi/invoices — record what IGI billed for a month.
 *
 * Keyed on the month, so entering it again corrects rather than duplicates.
 */
export async function PUT(request) {
  const auth = await requireLoveLab(request, 'igi-invoices-write', 30);
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { month, reference, total_eur: totalEur, basis, note } = body || {};

  if (typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'Which month is this invoice for?' }, { status: 400 });
  }
  if (totalEur !== null && totalEur !== undefined
      && (typeof totalEur !== 'number' || !Number.isFinite(totalEur) || totalEur < 0)) {
    return NextResponse.json({ error: 'The total must be an amount, zero or more.' }, { status: 400 });
  }
  if (basis !== undefined && !INVOICE_BASES[basis]) {
    return NextResponse.json({ error: 'Unknown billing basis' }, { status: 400 });
  }

  try {
    const { data, error } = await auth.adminSupabase
      .from('igi_invoices')
      .upsert({
        period_month: `${month}-01`,
        igi_reference: typeof reference === 'string' ? reference.trim().slice(0, 120) || null : null,
        igi_total_eur: totalEur ?? null,
        basis: basis || DEFAULT_BASIS,
        note: typeof note === 'string' ? note.trim().slice(0, 500) || null : null,
        recorded_by: auth.user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'period_month' })
      .select('period_month, igi_reference, igi_total_eur, basis, note')
      .single();

    if (error) return fail('IGI/Invoices PUT', error, 'Failed to save the invoice');

    return NextResponse.json({ invoice: data });
  } catch (err) {
    return fail('IGI/Invoices PUT', err, 'Internal server error');
  }
}
