import { NextResponse } from 'next/server';
import { requireFairAdmin } from '@/lib/fair-assistant/server';
import { getFolderInfo } from '@/lib/google-drive';

export async function GET() {
  const auth = await requireFairAdmin();
  if (auth.error) return auth.error;

  const result = {
    folderId: process.env.FAIR_DRIVE_INBOX_FOLDER_ID || null,
    folderIdSet: Boolean(process.env.FAIR_DRIVE_INBOX_FOLDER_ID),
    webhookUrlSet: Boolean(process.env.FAIR_N8N_WEBHOOK_URL),
    webhookSecretSet: Boolean(process.env.FAIR_WEBHOOK_SECRET),
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL || null,
    auth: 'NONE',
    accountEmail: null,
    folderAccess: 'unchecked',
    folderName: null,
    folderError: null,
  };

  if (process.env.GOOGLE_DRIVE_REFRESH_TOKEN && process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET) {
    result.auth = 'OAuth refresh token';
  } else if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    result.auth = 'Service account';
    try {
      const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
      const sa = typeof raw === 'string' ? JSON.parse(raw) : raw;
      result.accountEmail = sa.client_email || null;
    } catch {
      result.accountEmail = 'parse_error';
    }
  }

  if (result.folderId) {
    try {
      const folder = await getFolderInfo(result.folderId);
      result.folderAccess = 'ok';
      result.folderName = folder.name;
      result.folderParents = folder.parents;
    } catch (err) {
      result.folderAccess = 'fail';
      result.folderError = err.message;
    }
  }

  return NextResponse.json(result);
}
