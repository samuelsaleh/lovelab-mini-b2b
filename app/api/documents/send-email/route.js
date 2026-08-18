import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';
import { getUserContext, requireEventPermission, isUserOwnerOrSameEmail } from '@/app/api/_lib/access';
import { getSenderFrom, getSenderEmail, getAdminNotificationRecipients } from '@/lib/email';
import { clientOrderEmail, stripCompanyPrefix } from '@/lib/email-templates';
import { readOrderEmailCatalogue } from '@/lib/orderEmailCatalogue';

// All client-facing order emails are BCC'd to the LoveLab office inboxes (so
// every conversation funnels through inboxes someone actually reads) PLUS the
// admin recipients from ADMIN_NOTIFICATION_EMAIL (so Alberto / whoever owns
// admin alerts also gets a copy). BCC instead of CC keeps internal addresses
// invisible to the client — they only see their own address in the To field.
// No reply_to is set on purpose: replies fall back to the From address (the
// dionne@love-lab.com office mailbox), which is exactly where we want them.
// The office list is hardcoded on purpose so admins can't accidentally bypass
// the team BCC.
const OFFICE_BCC_RECIPIENTS = ['dionne@love-lab.com', 'elie@love-lab.com'];

function buildOrderBccRecipients() {
  // Merge office inboxes + admin recipients, dedupe (case-insensitive),
  // preserve order. Returns at minimum the office inboxes even if env is empty.
  const seen = new Set();
  const out = [];
  for (const e of [...OFFICE_BCC_RECIPIENTS, ...getAdminNotificationRecipients().all]) {
    const key = e.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

// Address that gets pinged ONLY when an outbound order email fails to send.
// Honors ADMIN_ALERT_EMAIL override, otherwise falls through to the primary
// admin from ADMIN_NOTIFICATION_EMAIL — so a single env var change reroutes
// both the BCC list and the failure alerts.
function getAdminAlertEmail() {
  return process.env.ADMIN_ALERT_EMAIL || getAdminNotificationRecipients().to;
}

async function sendAdminAlert({ apiKey, recipient, bccEmail, lang, documentId, reason, statusCode }) {
  const adminAlertEmail = getAdminAlertEmail();
  if (!apiKey || !adminAlertEmail) return;
  try {
    const subject = `[LoveLab] Order email FAILED — ${recipient || 'unknown recipient'}`;
    const html = `
      <div style="font-family:sans-serif;max-width:520px">
        <h2 style="color:#b91c1c;margin:0 0 12px">Order email failed</h2>
        <p style="color:#444;margin:0 0 16px">An order confirmation email could not be delivered.</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <tr><td style="padding:4px 0;color:#666;width:140px">Document ID</td><td>${documentId || '—'}</td></tr>
          <tr><td style="padding:4px 0;color:#666">Recipient</td><td>${recipient || '—'}</td></tr>
          <tr><td style="padding:4px 0;color:#666">BCC</td><td>${bccEmail || '—'}</td></tr>
          <tr><td style="padding:4px 0;color:#666">Language</td><td>${lang || '—'}</td></tr>
          <tr><td style="padding:4px 0;color:#666">HTTP status</td><td>${statusCode || '—'}</td></tr>
          <tr><td style="padding:4px 0;color:#666;vertical-align:top">Reason</td><td><pre style="margin:0;white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:12px">${(reason || 'unknown').slice(0, 800)}</pre></td></tr>
        </table>
      </div>
    `;
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `LoveLab Alerts <${getSenderEmail()}>`,
        to: [adminAlertEmail],
        subject,
        html,
      }),
    });
  } catch (alertErr) {
    // Never let alert failures cascade — they would mask the original error.
    console.error('[send-email] Admin alert failed:', alertErr?.message);
  }
}
export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUPPORTED_LANGS = ['en', 'fr', 'de', 'it', 'nl'];

function sanitizeEmail(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return EMAIL_RE.test(trimmed) ? trimmed : null;
}

export async function POST(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 20, prefix: 'docs-send-email' });
    if (rateLimitRes) return rateLimitRes;

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Email service not configured' }, { status: 503 });
    }

    const supabase = await createClient();
    const adminSupabase = createAdminClient();
    const { user, isAdmin } = await getUserContext(supabase);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Anyone who can read the saved document may email the client (admins,
    // folder collaborators like Silke, document owners). Defense-in-depth is
    // the canRead check below — not an admin-only gate.
    // (UI: SaveDocumentModal shows the email block for admins / agents /
    // users with edit|manage on a shared folder.)

    const body = await request.json().catch(() => ({}));
    const {
      documentId,
      to,
      lang = 'en',
      contactName,
      // Editable preview overrides — any falsy value falls back to the
      // localised default inside `clientOrderEmail`.
      subject: subjectOverride,
      greeting: greetingOverride,
      bodyText: bodyOverride,
      questions: questionsOverride,
      signoff: signoffOverride,
      driveIntro: driveIntroOverride,
      driveLabel: driveLabelOverride,
      driveUrl: driveUrlOverride,
    } = body || {};

    if (!documentId || !UUID_RE.test(documentId)) {
      return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 });
    }

    const recipient = sanitizeEmail(to);
    if (!recipient) {
      return NextResponse.json({ error: 'Invalid recipient email' }, { status: 400 });
    }

    // BCC is hardcoded to the LoveLab office inboxes — clients can't see
    // these addresses (BCC, not CC), but it guarantees the team always has a
    // copy of every send (their "sent folder" replacement, since Resend can't
    // write to Outlook/Gmail Sent).
    const bccEmails = buildOrderBccRecipients();

    const langCode = SUPPORTED_LANGS.includes(lang) ? lang : 'en';

    const { data: doc, error: docError } = await adminSupabase
      .from('documents')
      .select('id, file_path, file_name, created_by, event_id, client_name, client_company, document_type')
      .eq('id', documentId)
      .single();

    if (docError || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const eventAccess = doc.event_id
      ? await requireEventPermission(adminSupabase, doc.event_id, user.id, 'read', isAdmin)
      : { allowed: false };
    const isOwner = await isUserOwnerOrSameEmail(adminSupabase, doc.created_by, user);
    const canRead = isAdmin || isOwner || eventAccess.allowed;
    if (!canRead) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!doc.file_path) {
      return NextResponse.json({ error: 'No PDF file attached to this document' }, { status: 404 });
    }

    // Download the invoice PDF from Supabase storage. Mirrors the fallback path
    // used in /api/documents/preview for documents stored at owner-scoped paths.
    let pdfBuffer = null;
    {
      const { data: blob, error: dlError } = await adminSupabase.storage
        .from('documents')
        .download(doc.file_path);
      if (!dlError && blob) {
        pdfBuffer = Buffer.from(await blob.arrayBuffer());
      } else {
        const filename = doc.file_path.split('/').pop();
        const ownerScopedPath = `${doc.created_by}/${filename}`;
        if (ownerScopedPath !== doc.file_path) {
          const { data: fallbackBlob } = await adminSupabase.storage
            .from('documents')
            .download(ownerScopedPath);
          if (fallbackBlob) {
            pdfBuffer = Buffer.from(await fallbackBlob.arrayBuffer());
          }
        }
      }
    }

    if (!pdfBuffer) {
      return NextResponse.json({ error: 'Failed to load invoice PDF' }, { status: 500 });
    }

    // Build a clean recipient-facing filename (strip the storage uniqueness
    // suffix so the client just sees "LoveLab_Order_Acme_2026-04-22.pdf").
    const safeCompany = (doc.client_company || doc.client_name || 'Order')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'Order';
    const docKind = doc.document_type === 'quote' ? 'Quote' : 'Order';
    const datePart = new Date().toISOString().slice(0, 10);
    const niceFilename = `LoveLab_${docKind}_${safeCompany}_${datePart}.pdf`;

    const attachments = [
      {
        filename: niceFilename,
        content: pdfBuffer.toString('base64'),
      },
    ];

    // Catalogue is ALWAYS attached on admin sends — there's no opt-out toggle
    // anymore. Falls back to the EN PDF for languages that don't have a
    // localised version on disk yet.
    const cat = await readOrderEmailCatalogue(langCode);
    if (cat) {
      attachments.push({
        filename: cat.filename,
        content: cat.buffer.toString('base64'),
      });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://lovelab-b2b.vercel.app';
    // Defensive: if the user typed the company name into the contact
    // field too (e.g. contact="Oxygene Marie Schultz" with company="Oxygene"),
    // strip the company prefix so the greeting reads "Cher Marie Schultz,"
    // not "Cher Oxygene Marie Schultz,". The modal preview applies the
    // same helper so what the admin sees is what the client gets.
    const greetingName = stripCompanyPrefix(
      contactName || doc.client_name || '',
      doc.client_company,
    );
    const { subject, html } = clientOrderEmail({
      contactName: greetingName,
      lang: langCode,
      overrides: {
        subject: subjectOverride,
        greeting: greetingOverride,
        body: bodyOverride,
        questions: questionsOverride,
        signoff: signoffOverride,
        driveIntro: driveIntroOverride,
        driveLabel: driveLabelOverride,
        driveUrl: driveUrlOverride,
      },
    }, siteUrl);

    // From-name is hardcoded to "LoveLab" so every client sees a consistent
    // sender label regardless of which admin triggered the email.
    // No reply_to: client replies fall back to the From address
    // (dionne@love-lab.com), which is the office mailbox we want them in.
    // BCC keeps the team copy invisible to the client.
    const payload = {
      from: getSenderFrom('LoveLab'),
      to: [recipient],
      bcc: bccEmails,
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
      console.error('[send-email] Resend error', res.status, errBody);
      await sendAdminAlert({
        apiKey,
        recipient,
        bccEmail: bccEmails.join(', '),
        lang: langCode,
        documentId,
        reason: errBody || `Resend HTTP ${res.status}`,
        statusCode: res.status,
      });
      return NextResponse.json({ error: 'Email provider rejected the request' }, { status: 502 });
    }

    const result = await res.json().catch(() => ({}));
    return NextResponse.json({ sent: true, id: result?.id || null });
  } catch (error) {
    console.error('[send-email] Internal error:', error?.message, error?.stack);
    // Best-effort admin notification for unexpected exceptions. We can't trust
    // the outer scope variables (the throw might have been before they were
    // assigned), so we keep this minimal.
    try {
      await sendAdminAlert({
        apiKey: process.env.RESEND_API_KEY,
        recipient: null,
        bccEmail: null,
        lang: null,
        documentId: null,
        reason: `${error?.message || 'unknown'}\n${error?.stack || ''}`,
        statusCode: 500,
      });
    } catch { /* no-op */ }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
