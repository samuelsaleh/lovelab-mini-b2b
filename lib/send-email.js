import { getSenderFrom } from '@/lib/email';

/**
 * Send an email via Resend.
 *
 * @param {object} args
 * @param {string|string[]} args.to       — single recipient or list
 * @param {string}          args.subject
 * @param {string}          args.html
 * @param {string}          [args.from]
 * @param {string}          [args.replyTo]
 * @param {Array<{ filename: string, content: Buffer | string }>} [args.attachments]
 *        Optional attachments. `content` accepts a Node Buffer (preferred) or
 *        a base64-encoded string. Resend caps attachments at ~40 MB total.
 *
 * @returns {Promise<{ sent: boolean, reason?: string, status?: number, message_id?: string }>}
 */
export async function sendEmail({ to, subject, html, from, replyTo, attachments }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: 'no_api_key' };

  const recipients = Array.isArray(to) ? to : [to];

  const payload = {
    from: from || getSenderFrom(),
    to: recipients,
    subject,
    html,
  };
  if (replyTo) payload.reply_to = replyTo;

  if (Array.isArray(attachments) && attachments.length) {
    payload.attachments = attachments.map((a) => {
      const content = Buffer.isBuffer(a.content)
        ? a.content.toString('base64')
        : a.content; // already base64 string
      return { filename: a.filename, content };
    });
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[sendEmail] Resend error:', res.status, body);
      return { sent: false, reason: 'resend_error', status: res.status, error: body };
    }

    const data = await res.json().catch(() => ({}));
    return { sent: true, message_id: data?.id || null };
  } catch (err) {
    console.error('[sendEmail] Network error:', err.message);
    return { sent: false, reason: 'network_error', error: err.message };
  }
}
