import { NextResponse } from 'next/server';
import { requireLoveLab, fail } from '@/app/api/igi/_lib/access';

/**
 * GET /api/igi/models/[id]/shelf-history
 *
 * Explains "On our shelf" for one model:
 *   1. Nightly packing-stock snapshot (what the Stock column shows)
 *   2. Certificate In / Out ledger from ERP sync (why stock moved)
 */
export async function GET(request, { params }) {
  const auth = await requireLoveLab(request, 'igi-shelf-history');
  if (auth.error) return auth.error;

  const { id: modelId } = await params;
  if (!modelId) {
    return NextResponse.json({ error: 'Model id required' }, { status: 400 });
  }

  try {
    const db = auth.adminSupabase;

    const { data: model, error: modelErr } = await db
      .from('igi_models')
      .select('id, serial, name, stones, carat, shape, spec, state')
      .eq('id', modelId)
      .maybeSingle();

    if (modelErr) return fail('IGI/shelf-history', modelErr, 'Failed to load model');
    if (!model) return NextResponse.json({ error: 'Model not found' }, { status: 404 });

    const [snaps, descriptions, ins, outs] = await Promise.all([
      db.from('igi_shelf_snapshots')
        .select('snapshot_date, description, total_pcs, model_id')
        .eq('model_id', modelId)
        .order('snapshot_date', { ascending: false })
        .limit(120),
      db.from('igi_descriptions')
        .select('description, kind, last_seen_at')
        .eq('model_id', modelId),
      db.from('igi_certificate_in_sync')
        .select('erp_in_id, invoice_no, in_date, party, description, pcs, source, external_ref, serial, synced_at')
        .eq('model_id', modelId)
        .order('erp_in_id', { ascending: true })
        .limit(500),
      db.from('igi_certificate_out_sync')
        .select('erp_out_id, invoice_no, out_date, party, description, pcs, source, external_ref, serial, synced_at')
        .eq('model_id', modelId)
        .order('erp_out_id', { ascending: true })
        .limit(500),
    ]);

    for (const r of [snaps, descriptions, ins, outs]) {
      if (r.error) return fail('IGI/shelf-history', r.error, 'Failed to load shelf history');
    }

    // Group snapshots by day (sum if several packing descriptions map to one model).
    const byDate = new Map();
    for (const s of snaps.data || []) {
      const day = s.snapshot_date;
      if (!byDate.has(day)) byDate.set(day, { date: day, pcs: 0, lines: [] });
      const row = byDate.get(day);
      row.pcs += Number(s.total_pcs) || 0;
      row.lines.push({ description: s.description, pcs: Number(s.total_pcs) || 0 });
    }
    const history = [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
    for (let i = 0; i < history.length; i += 1) {
      const older = history[i + 1];
      history[i].change = older ? history[i].pcs - older.pcs : null;
    }

    const current = history[0] || null;

    const entries = [
      ...(ins.data || []).map((r) => ({
        kind: 'in',
        id: `in-${r.erp_in_id}`,
        date: r.in_date,
        invoice_no: r.invoice_no,
        party: r.party,
        description: r.description,
        pcs: Number(r.pcs) || 0,
        source: r.source,
        external_ref: r.external_ref,
        sort_key: `${r.in_date || ''}#${String(r.erp_in_id).padStart(12, '0')}`,
      })),
      ...(outs.data || []).map((r) => ({
        kind: 'out',
        id: `out-${r.erp_out_id}`,
        date: r.out_date,
        invoice_no: r.invoice_no,
        party: r.party,
        description: r.description,
        pcs: Number(r.pcs) || 0,
        source: r.source,
        external_ref: r.external_ref,
        sort_key: `${r.out_date || ''}#${String(r.erp_out_id).padStart(12, '0')}`,
      })),
    ].sort((a, b) => (a.sort_key < b.sort_key ? -1 : 1));

    let running = 0;
    const ledger = entries.map((e) => {
      running += e.kind === 'in' ? e.pcs : -e.pcs;
      return { ...e, balance: running };
    });

    const totalIn = entries.filter((e) => e.kind === 'in').reduce((t, e) => t + e.pcs, 0);
    const totalOut = entries.filter((e) => e.kind === 'out').reduce((t, e) => t + e.pcs, 0);

    return NextResponse.json({
      model,
      shelf: {
        current: current ? current.pcs : null,
        as_of: current?.date || null,
        source:
          'Nightly packing-stock read from LoveLab ERP. Descriptions are linked to this model on Matching.',
        descriptions: (descriptions.data || []).map((d) => d.description),
        history,
      },
      certificate_ledger: {
        total_in: totalIn,
        total_out: totalOut,
        net: totalIn - totalOut,
        source:
          'Certificate In − Certificate Out from the stock software (synced every 10 minutes).',
        entries: ledger.reverse(), // newest first for the UI
      },
    });
  } catch (err) {
    return fail('IGI/shelf-history', err, 'Internal server error');
  }
}
