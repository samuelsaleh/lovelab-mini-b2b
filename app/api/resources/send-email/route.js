import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';
import { getUserContext } from '@/app/api/_lib/access';
import { getSenderFrom } from '@/lib/email';
import { clientResourcesEmail } from '@/lib/email-templates';
import path from 'node:path';
import fs from 'node:fs/promises';

export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUPPORTED_LANGS = ['en', 'fr', 'de', 'it', 'nl'];

// Hard caps to keep the modal preview honest — anything longer almost
// certainly means a paste-mistake rather than a real customisation.
const MAX_OVERRIDE_LEN = { subject: 200, greeting: 200, body: 4000, signoff: 200 };

function pickOverrides(body) {
  const raw = body && typeof body === 'object' ? body : {};
  const out = {};
  for (const key of Object.keys(MAX_OVERRIDE_LEN)) {
    const v = raw[key];
    if (typeof v === 'string') out[key] = v.slice(0, MAX_OVERRIDE_LEN[key]);
  }
  return out;
}

// Hard whitelist for outbound resource sends. Only files under these
// public/ subfolders may be attached. Prevents path traversal or arbitrary
// file exfiltration from the server.
const ALLOWED_PATH_RE = /^\/(LoveLab Excel Packs|Lovelab PDF Packs|Price Lists|catalogues)\/[^/]+\.(xlsx|pdf)$/i;
// Cap matches "select everything across Catalogue + Packs + Price List" with
// some headroom for future additions.
const MAX_FILES_PER_SEND = 20;
// Resend hard limit on total attachment payload is ~40 MB (base64 inflates by
// ~33%). Stay safely under 30 MB raw to leave room for headers + body.
const MAX_TOTAL_ATTACHMENT_BYTES = 30 * 1024 * 1024;

function sanitizeEmail(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return EMAIL_RE.test(trimmed) ? trimmed : null;
}

export async function POST(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 20, prefix: 'resources-send-email' });
    if (rateLimitRes) return rateLimitRes;

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Email service not configured' }, { status: 503 });
    }

    const supabase = await createClient();
    const { user, isAdmin } = await getUserContext(supabase);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Defense in depth — UI also hides this for non-admins.
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const { files, to, lang = 'en', contactName } = body || {};
    const overrides = pickOverrides(body);

    const recipient = sanitizeEmail(to);
    if (!recipient) {
      return NextResponse.json({ error: 'Invalid recipient email' }, { status: 400 });
    }

    if (!Array.isArray(files) || files.length === 0) {
      return NextResponse.json({ error: 'No files selected' }, { status: 400 });
    }
    if (files.length > MAX_FILES_PER_SEND) {
      return NextResponse.json({ error: `Too many files (max ${MAX_FILES_PER_SEND})` }, { status: 400 });
    }

    const langCode = SUPPORTED_LANGS.includes(lang) ? lang : 'en';

    const attachments = [];
    let totalBytes = 0;
    const fileNames = [];

    for (const f of files) {
      const filePath = typeof f?.path === 'string' ? f.path : null;
      if (!filePath || !ALLOWED_PATH_RE.test(filePath)) {
        return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
      }

      // Strip the leading slash and resolve against public/. Reject anything
      // that escapes the public directory after normalization.
      const relPath = filePath.replace(/^\//, '');
      const publicDir = path.join(process.cwd(), 'public');
      const fullPath = path.normalize(path.join(publicDir, relPath));
      if (!fullPath.startsWith(publicDir + path.sep)) {
        return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
      }

      let buf;
      try {
        buf = await fs.readFile(fullPath);
      } catch {
        return NextResponse.json({ error: `File not found: ${filePath}` }, { status: 404 });
      }

      totalBytes += buf.length;
      if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
        const mb = (MAX_TOTAL_ATTACHMENT_BYTES / (1024 * 1024)).toFixed(0);
        return NextResponse.json({ error: `Attachments exceed ${mb} MB total` }, { status: 413 });
      }

      const baseName = path.basename(fullPath);
      attachments.push({ filename: baseName, content: buf.toString('base64') });
      fileNames.push(baseName);
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://lovelab-b2b.vercel.app';
    const { subject, html } = clientResourcesEmail({
      contactName: contactName || '',
      lang: langCode,
      fileNames,
      overrides,
    }, siteUrl);

    const payload = {
      from: getSenderFrom('LoveLab'),
      to: [recipient],
      subject,
      html,
      attachments,
    };

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.error('[resources/send-email] Resend error', res.status, errBody);
      return NextResponse.json({ error: 'Email provider rejected the request' }, { status: 502 });
    }

    const result = await res.json().catch(() => ({}));
    return NextResponse.json({ sent: true, id: result?.id || null });
  } catch (error) {
    console.error('[resources/send-email] Internal error:', error?.message, error?.stack);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
