# Fair Assistant — how it works and how to keep it running

Admin screen: `/admin/fair-assistant`. Business-card photos go in, leads and follow-up emails come out.

## The flow

1. **Upload** (`POST /api/fair-assistant/upload`): the photo is checked (JPEG, PNG, WebP or HEIC, max 12 MB), hashed (the same bytes are stored once per batch), saved in the Drive inbox folder, and a `fair_images` row is created as `processing`. The app then calls the n8n extract webhook.
2. **Card reader** (n8n workflow *LoveLab App Fair Assistant*): OCR, cleaning, Salesforce lookup and lead creation.
3. **Callback** (`POST /api/fair-assistant/callback`): n8n tells the app what happened (events below). The app creates the lead and marks the photo.
4. **Drafts** (`generate-all`): one email per lead, translated into the lead's language. Drafts already sent are never rewritten.
5. **Send** (`send`): see below.

A photo in `processing` for more than 5 minutes is shown as *no answer*. The row has **Try again** (sends the same Drive file to n8n again), **Already in Salesforce** and **Delete and upload again**.

## Environment variables

The sender is the app-wide `SENDER_EMAIL` (default `dionne@love-lab.com`, see `lib/email.js`); the reply-to of the follow-up emails is `alberto@love-lab.com`, set in `app/api/fair-assistant/send/route.js`. Neither was changed.

| Variable | Meaning |
|---|---|
| `FAIR_WEBHOOK_SECRET` | Random value (`openssl rand -hex 24`). n8n sends it as header `X-Fair-Auth` on every callback; the app compares it. Never commit it. |
| `FAIR_N8N_WEBHOOK_URL` | Production URL of the n8n extract webhook. |
| `FAIR_DRIVE_INBOX_FOLDER_ID` | Drive folder the photos go to. |
| `RESEND_MAX_PER_SECOND` | Mail rate cap, default `3`. Never raise it above what Resend allows (10 per second for the whole team). |
| `FAIR_SEND_CHUNK_SECONDS` | Work per Send call, default 25; keep below the reverse-proxy timeout. |

The n8n callback nodes must post to `https://<app domain>/api/fair-assistant/callback` with the same secret. If the domain or the secret changes, change both places; the screen *Diagnose* shows the callback URL the app expects.

## Callback events (n8n to app)

| `event` | Fields | Result |
|---|---|---|
| `lead_created` | `batchId`, `imageId`, `lead{firstName, lastName, company, email, phone, mobilephone, title, country, street, city, state, postalCode, salesforceId}` | Lead inserted (idempotent by lead hash), photo `processed`. |
| `image_duplicate` | `batchId`, `imageId`, `salesforceId` | Photo `processed` with a note "already in Salesforce". No lead is added, so no follow-up email. |
| `image_failed` / `lead_failed` | `batchId`, `imageId`, `error` | Photo `failed` with the reason. |
| `extraction_complete` | `batchId`, `summary.totalLeads` | Batch `extracted`. |

Build the JSON body with `JSON.stringify` in n8n, never by pasting OCR text into a string: a quote or a line break in a name breaks the JSON and the callback is lost.

## Sending

- **3 mails per second, hard cap**, retries included. Every Resend call in the app goes through one limiter (`lib/resendPacer.js`), so order mails, alerts and the fair send share the same budget. The send response reports `perSecond`.
- A draft is **claimed** (`draft_ready` to `sending`) before it is sent, so two clicks or two admins never send the same mail. Every mail carries a Resend `Idempotency-Key`.
- A Resend rate limit (429) is retried after `Retry-After`; still blocked, the draft goes back to `draft_ready`. A **quota** 429 stops the send and loses nothing.
- Pressing Send when everything is sent sends 0.
- An address that bounced for good, complained, or is on Resend's suppression list is skipped.
- A batch whose name starts with `[TEST]` sends every mail to the logged-in admin only, with the real recipient in the subject.

## Opened and clicked

The Follow-up tab shows Delivered, Opened and Clicked from Resend's webhook (`/api/webhooks/resend`, see `docs/email-delivery-status.md`). Opens and clicks only exist if **Open tracking** and **Click tracking** are switched on for the sending domain in Resend. *Diagnose* shows both flags. Mail apps that preload images overstate opens.

## Migrations

`supabase/migrations/20261013120000_fair_images_content_hash.sql` adds the photo hash. The app works without it (no duplicate-photo protection until it is run).

## A card is stuck: what to do

1. Open *Diagnose*. Check the n8n host, the callback URL, `webhookSecretSet`, and that the sending domain is right.
2. In n8n, open the *LoveLab App Fair Assistant* executions. A failed execution names the node.
3. Press **Try again** on the photo. If the contact is already in Salesforce, the photo comes back as *already in Salesforce*.
4. If *Try again* answers "card reader did not accept", the n8n webhook is down or its URL changed: fix `FAIR_N8N_WEBHOOK_URL`.
5. A callback that never arrives usually means a wrong domain or secret in the n8n callback nodes (HTTP 401 or 503 in the n8n execution).

## Rotating the secret

Generate a new value, set `FAIR_WEBHOOK_SECRET` on the server and restart, then update the four callback nodes in n8n to the same value. Do it outside fair hours and upload one test card in a `[TEST]` batch afterwards.
