import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/app/api/_lib/access';
import { getSenderFrom } from '@/lib/email';
import { clientResourcesEmail } from '@/lib/email-templates';
import { validateResourceEmailOverrides } from '@/lib/resources-email-overrides';

export const runtime = 'nodejs';

// Hardcoded CC — every resources email is silently copied to Alberto's
// personal Gmail so he has a record of every outbound document send.
// Clients don't see this address.
const CC_RECIPIENTS = ['albertosaleh@gmail.com'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUPPORTED_LANGS = ['en', 'fr', 'de', 'it', 'nl'];

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

// Resolve the public origin we should use to fetch our own static assets.
// We deliberately fetch over HTTP rather than `fs.readFile` so the serverless
// function bundle never traces public/ contents — without this, Vercel pulls
// the entire public/ folder (Packshots, etc.) into the function and blows
// past the 2 GB function size limit.
function resolveBaseUrl(request) {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  try {
    const u = new URL(request.url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return '';
  }
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
    const overrideValidation = validateResourceEmailOverrides(body);
    if (!overrideValidation.ok) {
      return NextResponse.json({ error: overrideValidation.error }, { status: 400 });
    }
    const { overrides } = overrideValidation;

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

    const baseUrl = resolveBaseUrl(request);
    if (!baseUrl) {
      return NextResponse.json({ error: 'Server misconfigured: cannot resolve site origin' }, { status: 500 });
    }

    const attachments = [];
    let totalBytes = 0;
    const fileNames = [];

    for (const f of files) {
      const filePath = typeof f?.path === 'string' ? f.path : null;
      if (!filePath || !ALLOWED_PATH_RE.test(filePath)) {
        return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
      }

      // Each segment of the URL needs encoding because our public/ folders
      // contain spaces ("LoveLab Excel Packs") and parentheses (the FR
      // catalogue filename). Splitting on "/" and re-encoding per segment
      // preserves the slashes while making the rest URL-safe.
      const encodedPath = filePath
        .split('/')
        .map((seg, i) => (i === 0 ? seg : encodeURIComponent(seg)))
        .join('/');

      const fileUrl = `${baseUrl}${encodedPath}`;

      let buf;
      try {
        const res = await fetch(fileUrl);
        if (!res.ok) {
          return NextResponse.json({ error: `File not found: ${filePath}` }, { status: 404 });
        }
        buf = Buffer.from(await res.arrayBuffer());
      } catch {
        return NextResponse.json({ error: `Failed to fetch: ${filePath}` }, { status: 502 });
      }

      totalBytes += buf.length;
      if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
        const mb = (MAX_TOTAL_ATTACHMENT_BYTES / (1024 * 1024)).toFixed(0);
        return NextResponse.json({ error: `Attachments exceed ${mb} MB total` }, { status: 413 });
      }

      // Derive the on-disk basename from the original path (last segment,
      // decoded) so the attachment in the email shows a clean filename.
      const baseName = decodeURIComponent(filePath.split('/').pop() || 'file');
      attachments.push({ filename: baseName, content: buf.toString('base64') });
      fileNames.push(baseName);
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || baseUrl || 'https://lovelab-b2b.vercel.app';
    const { subject, html } = clientResourcesEmail({
      contactName: contactName || '',
      lang: langCode,
      fileNames,
      overrides,
    }, siteUrl);

    const payload = {
      from: getSenderFrom('LoveLab'),
      to: [recipient],
      cc: CC_RECIPIENTS,
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
