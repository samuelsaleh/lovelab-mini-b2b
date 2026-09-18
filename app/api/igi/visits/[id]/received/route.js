/**
 * PATCH /api/igi/visits/[id]/received
 *
 * LoveLab confirms the certificates came back. One button: by default everything
 * IGI made came back, and a per-line figure is only sent when something is short.
 *
 * After closing the movement, quantities are posted to LoveLab Certificate In
 * (POST /api/certificate-in) via igi_receipts for idempotency. A failed ERP push
 * does not undo the local close — it is recorded as failed and retried by cron.
 */

import { NextResponse } from 'next/server';
import { requireLoveLab, fail } from '@/app/api/igi/_lib/access';
import { canAdvance } from '@/lib/igi/visits';
import { pushVisitReceiptToLovelab } from '@/lib/igi/pushReceipt';
import { recordHealthEvent } from '@/lib/healthEvent';
import { shortOnReturn } from '@/lib/igi/shortfall';
import { notifyIgiOfShortReturn, siteUrlFor } from '@/lib/igi/notify';

export async function PATCH(request, { params }) {
  const auth = await requireLoveLab(request, 'igi-visit-received', 30);
  if (auth.error) return auth.error;

  const { id } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    const db = auth.adminSupabase;

    const { data: visit, error: visitErr } = await db
      .from('igi_visits').select('id, status, visit_no').eq('id', id).maybeSingle();

    if (visitErr) return fail('IGI/VisitReceived PATCH', visitErr, 'Failed to confirm the return');
    if (!visit) return NextResponse.json({ error: 'Movement not found' }, { status: 404 });

    if (!canAdvance(visit.status, 'closed')) {
      return NextResponse.json(
        {
          error: visit.status === 'closed'
            ? 'This movement has already been received.'
            : 'Record what IGI made before confirming the return.',
        },
        { status: 409 },
      );
    }

    const { data: lines, error: linesErr } = await db
      .from('igi_visit_lines').select('id, model_id, qty_issued').eq('visit_id', id);

    if (linesErr) return fail('IGI/VisitReceived PATCH', linesErr, 'Failed to confirm the return');

    const overrides = body?.received && typeof body.received === 'object' ? body.received : {};
    let total = 0;
    const receivedLines = [];

    for (const line of lines) {
      const raw = overrides[line.model_id];
      // Blank means everything IGI made came back, which is the normal case.
      const qty = raw === undefined || raw === null || raw === ''
        ? (line.qty_issued ?? 0)
        : Number(raw);

      if (!Number.isInteger(qty) || qty < 0) {
        return NextResponse.json(
          { error: 'Every quantity must be a whole number, zero or more.' },
          { status: 400 },
        );
      }
      if (qty > (line.qty_issued ?? 0)) {
        return NextResponse.json(
          { error: 'More came back than IGI made. Check the count before confirming.' },
          { status: 400 },
        );
      }

      total += qty;
      const { error: updErr } = await db
        .from('igi_visit_lines').update({ qty_received: qty }).eq('id', line.id);
      if (updErr) return fail('IGI/VisitReceived PATCH', updErr, 'Failed to confirm the return');

      receivedLines.push({ ...line, qty_received: qty });
    }

    const { data: updated, error: statusErr } = await db
      .from('igi_visits')
      .update({ status: 'closed', closed_at: new Date().toISOString(), received_by: auth.user.id })
      .eq('id', id)
      .select('id, visit_no, status, closed_at')
      .single();

    if (statusErr) return fail('IGI/VisitReceived PATCH', statusErr, 'Failed to confirm the return');

    let erp = null;
    try {
      const modelIds = [...new Set(receivedLines.map((l) => l.model_id))];
      const { data: models, error: modelErr } = await db
        .from('igi_models')
        .select('id, name, serial, stones, carat, shape, spec')
        .in('id', modelIds);

      if (modelErr) throw modelErr;

      erp = await pushVisitReceiptToLovelab(db, {
        visit: updated,
        lines: receivedLines,
        models: models || [],
      });
    } catch (err) {
      erp = { ok: false, error: err?.message || 'ERP certificate-in failed' };
      try {
        await recordHealthEvent({
          source: 'igi_visit_received_erp',
          severity: 'warn',
          message: `Certificate In push failed for visit ${updated.visit_no || updated.id}: ${erp.error}`,
          context: { visit_id: updated.id, visit_no: updated.visit_no },
        });
      } catch {
        // health is best-effort
      }
    }

    // Fewer came back than IGI made: tell IGI the same day (Sam, 18 Sept 2026).
    const missing = shortOnReturn(receivedLines);
    const email = missing > 0
      ? await notifyIgiOfShortReturn(db, { visitId: id, siteUrl: siteUrlFor(request) })
      : null;

    return NextResponse.json({ visit: updated, received: total, missing, email, erp });
  } catch (err) {
    return fail('IGI/VisitReceived PATCH', err, 'Internal server error');
  }
}
