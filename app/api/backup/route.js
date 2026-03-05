import { createAdminClient } from '@/lib/supabase/server';
import { createDailyBackupFolder, uploadJsonToDrive, uploadFileToDrive } from '@/lib/google-drive';
import { checkRateLimit } from '@/lib/rateLimit';
import { getSenderFrom, getSenderEmail } from '@/lib/email';
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
  'agent_folders',
  'agent_folder_files',
  'agent_payments',
  'saved_reports',
];

const MAX_ROWS_PER_TABLE = 50_000;

function verifyCronAuth(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  const headerSecret = request.headers.get('x-vercel-cron-secret');
  return headerSecret === cronSecret;
}

async function sendAlertEmail(error) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || getSenderEmail();
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
        from: getSenderFrom(),
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
  const rateLimitRes = checkRateLimit(request, { maxRequests: 5, prefix: 'backup' });
  if (rateLimitRes) return rateLimitRes;

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

    // Back up Supabase Storage files (contracts + agent files)
    const STORAGE_BUCKET = 'documents';
    const STORAGE_PREFIXES = ['contracts', 'agent-files'];
    results.storage = {};
    for (const prefix of STORAGE_PREFIXES) {
      try {
        const { data: files, error: listErr } = await adminSupabase.storage
          .from(STORAGE_BUCKET)
          .list(prefix, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });

        if (listErr) {
          results.storage[prefix] = { status: 'error', error: listErr.message };
          results.errors.push(`storage/${prefix}: ${listErr.message}`);
          continue;
        }

        let backed = 0;
        const folders = (files || []).filter(f => !f.metadata);
        const directFiles = (files || []).filter(f => f.metadata);

        for (const file of directFiles) {
          try {
            const { data: blob, error: dlErr } = await adminSupabase.storage
              .from(STORAGE_BUCKET)
              .download(`${prefix}/${file.name}`);
            if (dlErr || !blob) continue;
            const buf = Buffer.from(await blob.arrayBuffer());
            await uploadFileToDrive(folderId, `storage/${prefix}/${file.name}`, buf, blob.type || 'application/octet-stream');
            backed++;
          } catch { /* skip individual file failures */ }
        }

        for (const folder of folders) {
          try {
            const { data: subFiles } = await adminSupabase.storage
              .from(STORAGE_BUCKET)
              .list(`${prefix}/${folder.name}`, { limit: 500 });
            for (const sf of (subFiles || [])) {
              if (!sf.metadata) continue;
              try {
                const path = `${prefix}/${folder.name}/${sf.name}`;
                const { data: blob, error: dlErr } = await adminSupabase.storage
                  .from(STORAGE_BUCKET)
                  .download(path);
                if (dlErr || !blob) continue;
                const buf = Buffer.from(await blob.arrayBuffer());
                await uploadFileToDrive(folderId, `storage/${path}`, buf, blob.type || 'application/octet-stream');
                backed++;
              } catch { /* skip individual file failures */ }
            }
          } catch { /* skip folder failures */ }
        }

        results.storage[prefix] = { status: 'ok', files_backed: backed };
      } catch (storageErr) {
        results.storage[prefix] = { status: 'error', error: storageErr.message };
        results.errors.push(`storage/${prefix}: ${storageErr.message}`);
      }
    }

    // Upload a metadata/summary file
    await uploadJsonToDrive(folderId, '_backup-summary.json', {
      date: today,
      completed_at: new Date().toISOString(),
      tables: results.tables,
      storage: results.storage,
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
