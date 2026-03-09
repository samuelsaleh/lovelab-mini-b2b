import { getSenderFrom } from '@/lib/email';

/**
 * Send an email via Resend. Returns { sent, reason?, status? }.
 * Checks response status and logs failures instead of silently swallowing them.
 */
export async function sendEmail({ to, subject, html, from }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: 'no_api_key' };

  const recipients = Array.isArray(to) ? to : [to];
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: from || getSenderFrom(),
        to: recipients,
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[sendEmail] Resend error:', res.status, body);
      return { sent: false, reason: 'resend_error', status: res.status };
    }

    return { sent: true };
  } catch (err) {
    console.error('[sendEmail] Network error:', err.message);
    return { sent: false, reason: 'network_error' };
  }
}
