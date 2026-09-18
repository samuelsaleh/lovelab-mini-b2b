import { NextResponse } from 'next/server';
import { requireLoveLab, fail } from '@/app/api/igi/_lib/access';

/**
 * GET /api/igi/certificate-erp-ins
 * LoveLab ERP Certificate In rows mirrored by the 10-minute cron
 * (igi_certificate_in_sync). Shown on Movements → LoveLab in.
 */
export async function GET(request) {
  const auth = await requireLoveLab(request, 'igi-certificate-erp-ins');
  if (auth.error) return auth.error;

  try {
    const { data, error } = await auth.adminSupabase
      .from('igi_certificate_in_sync')
      .select(
        'id, erp_in_id, invoice_no, in_date, party, description, pcs, remark, source, external_ref, serial, model_id, synced_at',
      )
      .order('erp_in_id', { ascending: false })
      .limit(500);

    if (error) return fail('IGI/ERP-ins GET', error, 'Failed to load LoveLab certificate ins');

    return NextResponse.json({
      ins: data || [],
      count: (data || []).length,
    });
  } catch (err) {
    return fail('IGI/ERP-ins GET', err, 'Internal server error');
  }
}
