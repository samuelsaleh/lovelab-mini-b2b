import { createAdminClient } from '@/lib/supabase/server';
import { createDailyBackupFolder, uploadJsonToDrive } from '@/lib/google-drive';
import { NextResponse } from 'next/server';

const TABLES = [
  'profiles',
  'allowed_emails',
  'events',
  'documents',
  'clients',
  'pending_signups',
  'drafts',
  'agent_commissions',
];

const MAX_ROWS_PER_TABLE = 50_000;

function verifyCronAuth(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  const headerSecret = request.headers.get('x-vercel-cron-secret');
  if (headerSecret === cronSecret) return true;

  const { searchParams } = new URL(request.url);
  if (searchParams.get('secret') === cronSecret) return true;

  return false;
}

async function sendAlertEmail(error) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || 'alberto@love-lab.com';
  if (!resendApiKey) return;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://lovelab-b2b.vercel.app';

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'LoveLab B2B <alberto@love-lab.com>',
        to: [adminEmail],
        subject: 'LoveLab Backup FAILED',
        html: `
          <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px;">
            <img src="${siteUrl}/logo.png" alt="LoveLab" style="height: 48px; margin-bottom: 24px;" />
            <h2 style="color: #dc2626; margin: 0 0 8px;">Daily Backup Failed</h2>
            <p style="color: #555; font-size: 15px; margin: 0 0 16px;">
              The automated daily backup to Google Drive failed on <strong>${new Date().toISOString().split('T')[0]}</strong>.
            </p>
            <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
              <p style="color: #991b1b; font-size: 13px; margin: 0; font-family: monospace; white-space: pre-wrap;">${String(error).slice(0, 500)}</p>
            </div>
            <p style="color: #555; font-size: 14px; margin: 0;">
              Please check the Vercel logs or try triggering a manual backup.
            </p>
            <p style="color: #aaa; font-size: 11px; margin-top: 32px;">
              LoveLab B2B · Automated backup alert
            </p>
          </div>
        `,
      }),
    });
  } catch (emailErr) {
    console.error('[backup] Failed to send alert email:', emailErr.message);
  }
}

export async function GET(request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = new Date().toISOString().split('T')[0];
  const results = { date: today, tables: {}, errors: [] };

  try {
    const adminSupabase = createAdminClient();
    const folderId = await createDailyBackupFolder(today);
    results.folderId = folderId;

    for (const table of TABLES) {
      try {
        const { data, error } = await adminSupabase
          .from(table)
          .select('*')
          .limit(MAX_ROWS_PER_TABLE);

        if (error) {
          results.tables[table] = { status: 'error', error: error.message };
          results.errors.push(`${table}: ${error.message}`);
          continue;
        }

        const rows = data || [];
        await uploadJsonToDrive(folderId, `${table}.json`, {
          table,
          exported_at: new Date().toISOString(),
          row_count: rows.length,
          data: rows,
        });

        results.tables[table] = { status: 'ok', rows: rows.length };
      } catch (tableErr) {
        results.tables[table] = { status: 'error', error: tableErr.message };
        results.errors.push(`${table}: ${tableErr.message}`);
      }
    }

    // Upload a metadata/summary file
    await uploadJsonToDrive(folderId, '_backup-summary.json', {
      date: today,
      completed_at: new Date().toISOString(),
      tables: results.tables,
      errors: results.errors,
      total_tables: TABLES.length,
      successful_tables: Object.values(results.tables).filter(t => t.status === 'ok').length,
    });

    if (results.errors.length > 0) {
      await sendAlertEmail(`Partial backup failure:\n${results.errors.join('\n')}`);
    }

    return NextResponse.json({
      success: true,
      date: today,
      tables: results.tables,
      errors: results.errors.length > 0 ? results.errors : undefined,
    });
  } catch (err) {
    console.error('[backup] Fatal error:', err);
    await sendAlertEmail(err.message || String(err));
    return NextResponse.json({
      success: false,
      error: err.message,
      date: today,
      tables: results.tables,
    }, { status: 500 });
  }
}
