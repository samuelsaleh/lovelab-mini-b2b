# Email deliveries and the Resend webhook

Every email the app sends goes through Resend (`lib/send-email.js`) and is
recorded in `email_deliveries` with Resend's id. Two things keep the status
current: Resend's webhook (immediate) and a daily sweep (safety net). The
status is mirrored onto the order (`documents.metadata.email`) or the
fair-assistant draft (`fair_email_drafts.delivery_status`, `opened_at`,
`clicked_at`) so the UI can show a pill. Full write-up:
`docs/email-delivery-status.md`.

| Method | Path | Auth | RL | Purpose |
|---|---|---|---|---|
| POST | `/api/webhooks/resend` | Svix signature | none | Resend delivery events |
| POST | `/api/email-deliveries/refresh` | A | 30 | Poll Resend for up to 5 tracked emails |

### `POST /api/webhooks/resend`  (`runtime = nodejs`)

Configured in the Resend dashboard → Webhooks → endpoint
`https://app.lovelab-antwerp.com/api/webhooks/resend`, signing secret in
`RESEND_WEBHOOK_SECRET`. The route reads the **raw body**, verifies
`svix-id`, `svix-timestamp`, `svix-signature` (5-minute tolerance,
`lib/resendWebhook.js`), then `applyResendEvent()` updates the row matched on
`resend_id`:

| Resend event | `status` | Extra |
|---|---|---|
| `email.sent` | `sent` | |
| `email.delivered` | `delivered` | |
| `email.delivery_delayed` | `delivery_delayed` | `detail` |
| `email.bounced` | `bounced` | `bounce_type`, `bounce_subtype`, `advice`; health event + admin alert |
| `email.complained` | `complained` | health event + admin alert |
| `email.failed` | `failed` | health event + admin alert |
| `email.opened` | unchanged | `opened_at`, `open_count++` |
| `email.clicked` | unchanged | `clicked_at`, `click_count++` |

Responses: `200 { "ok": true }`; `200 { "ok": false }` when the handler throws
(so Resend does not retry forever); `401 { "error", "reason" }` on a bad
signature; `503 { "error": "Webhook not configured" }` when the secret is
missing on the server. Idempotent on `resend_id` + event timestamp.

Checking the secret is installed (from the env-sync skill): a POST with an
empty body should return 401, not 503.

### `POST /api/email-deliveries/refresh`

`{ "document_id" | "draft_id" | "resend_id" }` → asks Resend `GET /emails/:id`
for each matching delivery (max 5) and returns `{ "deliveries": [ … ] }`. 503 if
the `email_deliveries` table is not migrated. The fair assistant has its own
batch version, `POST /api/fair-assistant/batches/[id]/refresh-deliveries`.

### Kinds of email tracked

| `kind` | Sent by | Shown on |
|---|---|---|
| `order_confirmation` | `POST /api/documents/send-email` | the order's row |
| `fair_outreach` | `POST /api/fair-assistant/send` | the lead's card |
| `internal_notice` | every order create / update / email | admin alerts only |
| `price_list_announcement` | `POST /api/price-lists/announce/send` | the announce page |
| `other` | reserved | |

Auth emails (magic links, invites, resets) and IGI digests are sent through
Resend too but are **not** recorded in `email_deliveries`.
