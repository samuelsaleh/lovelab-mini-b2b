import { NextResponse } from 'next/server';
import { requireLoveLab, fail } from '@/app/api/igi/_lib/access';

/**
 * GET /api/igi/certificate-erp-outs
 * LoveLab ERP Certificate Out rows mirrored by the 10-minute cron
 * (igi_certificate_out_sync). Shown on Movements → LoveLab out.
 */
export async function GET(request) {
  const auth = await requireLoveLab(request, 'igi-certificate-erp-outs');
  if (auth.error) return auth.error;

  try {
    const { data, error } = await auth.adminSupabase
      .from('igi_certificate_out_sync')
      .select(
        'id, erp_out_id, invoice_no, out_date, party, description, pcs, remark, source, external_ref, serial, model_id, synced_at',
      )
      .order('erp_out_id', { ascending: false })
      .limit(500);

    if (error) return fail('IGI/ERP-outs GET', error, 'Failed to load LoveLab certificate outs');

    return NextResponse.json({
      outs: data || [],
      count: (data || []).length,
    });
  } catch (err) {
    return fail('IGI/ERP-outs GET', err, 'Internal server error');
  }
}
