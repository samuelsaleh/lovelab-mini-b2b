# Email delivery status — did the email arrive?

**Why this exists.** On 9 September 2026 an order confirmation was accepted
by Resend, reached the three internal copies, and bounced for the one person
it was for. Nobody knew. Resend knows what happens to every email after it
leaves us; this feature makes the app know too, and say what to do about it.

It covers the three kinds of email the app sends:

| kind | sent from | shown on |
|---|---|---|
| Order confirmation to the client | Save & send in the order form | the order's row in **Documents** |
| Fair follow-up to a lead | **Fair assistant → Send** | the lead's card |
| Internal notice to the office | every order created / updated / emailed | admin alerts only |

## How it works

1. Every send stores Resend's email id in the `email_deliveries` table.
2. **Resend tells us the outcome** (delivered, delayed, bounced, marked as
   spam) through a webhook at `/api/webhooks/resend`. This is immediate.
3. **A daily check** (`/api/cron/email-deliveries`, 06:00) asks Resend with the
   API key about anything the webhook hasn't settled, in case a webhook was
   missed.
4. In the Fair Assistant, the **Follow-up** tab of a batch has **Check
   deliveries now** (`POST /api/fair-assistant/batches/:id/refresh-deliveries`):
   it asks Resend about every email of the batch and updates the pills. Use
   it whenever the daily check is not running (see step 5 of the setup).
   `POST /api/email-deliveries/refresh` does the same for one order or one lead.
6. **Opens and clicks** (since 15 Sept 2026) are kept per email —
   `email_deliveries.opened_at / clicked_at / open_count / click_count` — and
   mirrored to `fair_email_drafts.opened_at / clicked_at`, so the batch
   Follow-up shows who opened. Needs
   `supabase/migrations/20260915130000_email_opens.sql`.
5. A **bounce, complaint or failure** records a health event and emails the
   admins straight away, with the reason and what to do.

## One-time setup (5 minutes)

1. **Run the migration** in Supabase → SQL editor:
   `supabase/migrations/20260909120000_email_deliveries.sql`.
   Until it runs, emails go out exactly as before and nothing is tracked.
2. **Create the webhook** in Resend: dashboard → *Webhooks* → *Add webhook*.
   - Endpoint URL: `https://app.lovelab-antwerp.com/api/webhooks/resend`
     (since the move to the self-hosted server, Sept 2026 — the old
     `b2b-lovelab.com` address only redirects and Resend does not follow it)
   - Events: tick `email.sent`, `email.delivered`, `email.delivery_delayed`,
     `email.bounced`, `email.complained`, `email.failed`, `email.suppressed`,
     `email.opened`, `email.clicked`.
   - Resend then shows a **signing secret** starting with `whsec_`.
3. **Put the secret in the server's env file** (`RESEND_WEBHOOK_SECRET` =
   that value) **and restart the app** (`pm2 restart app-lovelab-antwerp`).
   Saving a variable does not restart anything; until the app restarts, the
   webhook keeps answering 503 "Webhook not configured" (9 Sept 2026: this
   is exactly what happened on first setup, then on Vercel).
5. **Daily check on the server.** The 06:00 sweep used to be a Vercel cron
   (`vercel.json`); on the self-hosted server nothing fires it. Add a
   cron entry that calls it once a day with the secret header:
   `0 6 * * * curl -s -H "x-vercel-cron-secret: $CRON_SECRET" https://app.lovelab-antwerp.com/api/cron/email-deliveries`
   (`CRON_SECRET` must be set in the env file too). Until then, use
   **Check deliveries now** in the Fair Assistant.
6. **AI key.** Translating fair emails needs a valid `ANTHROPIC_API_KEY` in
   the same env file; the Outreach tab shows a red banner and keeps Send off
   while the key is missing or rejected.
4. Send yourself a test order confirmation. Within a minute the row in
   Documents should show **✓ email delivered**.

The API key does not change. The webhook secret is a second, separate value.

## What the statuses mean

| status | what it means | what to do |
|---|---|---|
| ✉ emailed | Resend accepted it; no answer from the client's server yet | nothing yet |
| ✓ email delivered | the client's mail server took it | nothing |
| ⏳ email delayed | their server is slow or temporarily refusing; Resend retries for 72 h | if still delayed tomorrow, check the address |
| ✗ email bounced | permanently rejected | hover the badge: it says why — wrong address, mailbox full, message too large, blocked as spam — and what to change |
| ✗ email marked as spam | the recipient reported it | don't email that address again without asking |
| Blocked by Resend | the address bounced before and Resend suppresses it | ask for another address, or remove it from *Suppressions* in Resend |

## If something looks wrong

- **Every badge stays on "emailed"** → the webhook isn't reaching us. Check the
  URL and that `RESEND_WEBHOOK_SECRET` matches; Resend's webhook page shows
  each attempt and our response (401 = wrong secret, 503 = secret not set).
  The daily check will still catch up.
- **A bounce for an internal address** (e.g. an office mailbox) → the admin
  alert names it; fix the address in `ORDER_NOTIFICATION_EMAILS`.
- Health events for all of this use sources starting with `email_delivery_`,
  `resend_webhook` and `cron_email_deliveries`.
