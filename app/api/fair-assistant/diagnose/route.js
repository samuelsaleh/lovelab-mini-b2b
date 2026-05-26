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
    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
          client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
          refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
          grant_type: 'refresh_token',
        }),
      });
      if (tokenRes.ok) {
        const { access_token } = await tokenRes.json();
        const aboutRes = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
          headers: { Authorization: `Bearer ${access_token}` },
        });
        if (aboutRes.ok) {
          const about = await aboutRes.json();
          result.accountEmail = about?.user?.emailAddress || null;
          result.accountDisplay = about?.user?.displayName || null;
        } else {
          result.accountEmail = `about_failed_${aboutRes.status}`;
        }
      } else {
        result.accountEmail = `token_failed_${tokenRes.status}`;
      }
    } catch (err) {
      result.accountEmail = `error: ${err.message}`;
    }
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
