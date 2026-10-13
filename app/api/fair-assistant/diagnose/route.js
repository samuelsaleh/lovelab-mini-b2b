import { NextResponse } from 'next/server';
import { requireFairAdmin } from '@/lib/fair-assistant/server';
import { getFolderInfo } from '@/lib/google-drive';
import { checkAnthropicKey } from '@/lib/fair-assistant/aiHealth';
import { resendPacer } from '@/lib/resendPacer';
import { getSenderEmail } from '@/lib/email';

export async function GET() {
  const auth = await requireFairAdmin();
  if (auth.error) return auth.error;

  const result = {
    folderId: process.env.FAIR_DRIVE_INBOX_FOLDER_ID || null,
    folderIdSet: Boolean(process.env.FAIR_DRIVE_INBOX_FOLDER_ID),
    webhookUrlSet: Boolean(process.env.FAIR_N8N_WEBHOOK_URL),
    webhookSecretSet: Boolean(process.env.FAIR_WEBHOOK_SECRET),
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL || null,
    // Where the card reader (n8n) is called, and the settings the send path runs with.
    n8nHost: hostOf(process.env.FAIR_N8N_WEBHOOK_URL),
    callbackUrl: `${process.env.NEXT_PUBLIC_SITE_URL || ''}/api/fair-assistant/callback`,
    sendPerSecond: Number.isFinite(resendPacer.perSecond) ? resendPacer.perSecond : null,
    commit: process.env.GIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || null,
    resend: { keySet: Boolean(process.env.RESEND_API_KEY) },
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

  result.resend = await checkResend();

  const ai = await checkAnthropicKey();
  result.anthropic = ai.status;
  result.anthropicDetail = ai.detail;

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

function hostOf(url) {
  try { return url ? new URL(url).host : null; } catch { return 'invalid URL'; }
}

// One cheap authenticated call: Resend's limit for this account (response headers) and whether
// open/click tracking is switched on for the sending domain ("Opened" on the Follow-up tab needs it).
async function checkResend() {
  const out = { keySet: Boolean(process.env.RESEND_API_KEY), limitPolicy: null, domain: null, openTracking: null, clickTracking: null, error: null };
  if (!out.keySet) return out;
  try {
    const res = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      signal: AbortSignal.timeout(8000),
    });
    out.limitPolicy = res.headers.get('ratelimit-policy');
    if (!res.ok) { out.error = `Resend answered ${res.status}`; return out; }
    const body = await res.json().catch(() => ({}));
    const sender = String(getSenderEmail() || '').split('@')[1]?.toLowerCase();
    const d = (body?.data || []).find((x) => String(x.name || '').toLowerCase() === sender) || null;
    if (d) { out.domain = d.name; out.openTracking = d.open_tracking ?? null; out.clickTracking = d.click_tracking ?? null; }
  } catch (err) {
    out.error = err.message;
  }
  return out;
}
