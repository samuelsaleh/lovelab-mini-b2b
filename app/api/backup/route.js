import { createAdminClient } from '@/lib/supabase/server';
import { createDailyBackupFolder, uploadJsonToDrive, uploadFileToDrive, hasDriveCredentials } from '@/lib/google-drive';
import { checkRateLimit } from '@/lib/rateLimit';
import { getSenderFrom, getSenderEmail, getAdminNotificationRecipients } from '@/lib/email';
import { backupFailedEmail } from '@/lib/email-templates';
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
  'email_deliveries',
  // LoveLab x IGI certificate module. The movements are the only record of what
  // crossed the road, so they belong in the nightly backup.
  'igi_models',
  'igi_batches',
  'igi_counts',
  'igi_digest_sends',
  'igi_visits',
  'igi_visit_lines',
  'igi_descriptions',
  'igi_shelf_snapshots',
  'igi_receipts',
  'igi_certificate_out_sync',
  'igi_certificate_in_sync',
  'igi_invoices',
];

const MAX_ROWS_PER_TABLE = 50_000;

function verifyCronAuth(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[backup] CRON_SECRET env var is not set — all backup requests will be rejected. Set CRON_SECRET in your environment variables.');
    return false;
  }

  const headerSecret = request.headers.get('x-vercel-cron-secret');
  return headerSecret === cronSecret;
}

async function sendAlertEmail(error) {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) return;

  // ADMIN_NOTIFICATION_EMAIL is comma-separated; previously this route passed
  // the raw string straight to Resend, which silently dropped multi-recipient
  // alerts. Use the shared parser so backup failures reach every admin.
  const { to: primaryAdmin, cc: ccAdmins } = getAdminNotificationRecipients();
  // Final fallback: if for some reason the helper returned nothing usable,
  // ping the sender mailbox so the alert isn't lost entirely.
  const toAddress = primaryAdmin || getSenderEmail();
  if (!toAddress) return;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://app.lovelab-antwerp.com';

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: getSenderFrom(),
        to: [toAddress],
        ...(ccAdmins.length > 0 ? { cc: ccAdmins } : {}),
        ...backupFailedEmail({ date: new Date().toISOString().split('T')[0], error }, siteUrl),
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

  // Sam, 15 Sep 2026: "cancel this message, it gets sent every day". Since
  // the move to the new server there are no Google Drive credentials, so the
  // backup cannot run at all. That is a setup gap, not a failed backup: say
  // so in the log and the response, and keep the alert email for real
  // failures. The health check still surfaces it on its own report.
  if (!hasDriveCredentials()) {
    const message = 'Backup skipped: no Google Drive credentials on this server. Set GOOGLE_DRIVE_REFRESH_TOKEN + GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET, or GOOGLE_SERVICE_ACCOUNT_KEY.';
    console.error('[backup] ' + message);
    return NextResponse.json({ ...results, skipped: true, reason: 'no_drive_credentials', message }, { status: 200 });
  }

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
