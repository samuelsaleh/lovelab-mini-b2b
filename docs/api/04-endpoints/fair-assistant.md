# Fair assistant

Turns photographed business cards into translated follow-up emails. Pipeline:

```
admin uploads card photos ──► Google Drive inbox ──► n8n (OCR, language, Salesforce dedup)
        │                                                  │ callbacks (x-fair-auth)
        ▼                                                  ▼
  fair_batches ◄──────────────── fair_images ──────── fair_leads
        │  template (headline, paragraphs, buttons, attachments, per-type variants)
        ▼
  generate-all: Claude translates per lead ──► fair_email_drafts (draft_ready)
        ▼
  send: Resend, time-boxed loop ──► email_deliveries (webhook + sweep update status, opens, clicks)
```

All routes require an admin (`requireFairAdmin`) except the three **Webhook**
routes, which n8n calls with header `x-fair-auth: <FAIR_WEBHOOK_SECRET>`
(503 if the secret is not configured, 401 if wrong). Realtime: the UI
subscribes to `fair_leads` and `fair_batches` through the browser client, so
leads appear as n8n inserts them. Docs: `docs/fair-assistant-n8n.md`.

| Method | Path | Auth | RL | Purpose |
|---|---|---|---|---|
| GET | `/api/fair-assistant/batches` | A | 60 | List batches |
| POST | `/api/fair-assistant/batches` | A | 30 | Create `{ "name" \| "fairName", "eventId", "templateId" }` |
| GET | `/api/fair-assistant/batches/[id]` | A | 60 | Batch + leads + images + drafts |
| PATCH | `/api/fair-assistant/batches/[id]` | A | 30 | Edit template copy, buttons, attachments, status |
| DELETE | `/api/fair-assistant/batches/[id]` | A | 20 | Delete (cascades) |
| POST | `/api/fair-assistant/batches/[id]/refresh-deliveries` | A | 10 | Ask Resend about every sent email |
| POST | `/api/fair-assistant/upload` | A | 120 | Upload one card photo (multipart `batchId`, `file`); `maxDuration = 60` |
| POST | `/api/fair-assistant/callback` | Webhook | none | n8n extraction events |
| GET | `/api/fair-assistant/drafts?batchId=` | Webhook | none | n8n fetches `draft_ready` drafts (legacy send path) |
| POST | `/api/fair-assistant/send-callback` | Webhook | none | n8n send events (legacy) |
| GET / POST / DELETE | `/api/fair-assistant/chat` | A | 60 / 20 / 10 | Copywriting chat with Claude per batch |
| GET | `/api/fair-assistant/diagnose` | A | none | Config check: Drive auth, inbox folder, Anthropic key |
| POST | `/api/fair-assistant/generate-all` | A | 10 | Build one draft per lead `{ "batchId" }` |
| POST | `/api/fair-assistant/preview` | A | 30 | Render one lead's email |
| POST | `/api/fair-assistant/send` | A | 10 | Send `draft_ready` drafts, time-boxed |
| POST | `/api/fair-assistant/retry-failed` | A | 10 | Failed → `draft_ready` |
| GET | `/api/fair-assistant/image-library` | A | 30 | Packshot groups for the template |
| DELETE | `/api/fair-assistant/images/[id]` | A | 30 | Drop a stuck image |
| POST | `/api/fair-assistant/images/[id]/mark-duplicate` | A | 30 | Mark processed as duplicate |
| PATCH | `/api/fair-assistant/leads/[id]` | A | 60 | Edit a lead (language follows country) |
| DELETE | `/api/fair-assistant/leads/[id]` | A | 20 | Delete a lead |
| GET / POST | `/api/fair-assistant/saved-templates` | A | 60 / 30 | Saved templates |
| PATCH / DELETE | `/api/fair-assistant/saved-templates/[id]` | A | 30 / 20 | |

---

### Batches

`PATCH …/batches/[id]` accepts only these keys: `headline`, `paragraph1`,
`paragraph2`, `signoff`, `cta_line`, `subject`, `button1_label`, `button1_url`,
`button2_label`, `button2_url`, `attached_files` (array of
`{ "path", "name" }` from the resources), `custom_html`, the `agent_*` and
`partner_*` variants, `status`, `fair_name`, `template_id`. Templates by
`lead_type` are in `lib/fair-assistant/templates.js`.

`GET …/batches/[id]`:

```json
{ "batch": { … }, "leads": [ … ], "images": [ … ],
  "drafts": [ { "lead_id", "status": "sent", "subject", "language": "it",
                "delivery_status": "delivered", "opened_at": "…", "clicked_at": null } ] }
```

### Upload and n8n callbacks

`POST …/upload` stores the photo in the Drive inbox
(`FAIR_DRIVE_INBOX_FOLDER_ID`), inserts a `fair_images` row and POSTs
`{ "id", "mimeType", "batchId", "imageId" }` to `FAIR_N8N_WEBHOOK_URL` with the
`X-Fair-Auth` header. n8n then calls back:

`POST …/callback` body, parsed by `lib/fair-assistant/callbacks.js`:

```json
{ "event": "lead_created", "batchId": "…", "imageId": "…",
  "lead": { "firstName", "lastName", "company", "email", "phone", "mobilePhone", "title",
            "country", "language", "languageLabel", "street", "city", "state", "postalCode",
            "salesforceId", "salesforceUrl", "leadHash" } }
{ "event": "lead_failed" | "image_failed", "batchId", "imageId", "error": "…" }
{ "event": "image_duplicate" | "lead_duplicate", "batchId", "imageId" }
{ "event": "batch_complete" | "extraction_complete", "batchId", "summary": { … } }
```

Inserts are idempotent on `(batch_id, lead_hash)`. Responses are `{ "ok": true }`.
`GET …/drafts` and `POST …/send-callback` belong to the earlier design where
n8n also sent the emails; sending now happens in the app, but the routes are
kept for compatibility.

### Generating and sending

- `POST …/generate-all { "batchId" }`: for each lead, picks the template
  variant for its `lead_type`, translates with Claude
  (`lib/fair-assistant/translate.js`: `claude-sonnet-5`, fallback
  `claude-haiku-4-5-20251001`, with a back-check of the translation), renders
  the HTML (`lib/fair-assistant/email-shell.js`) and writes a `draft_ready`
  row. `{ "generated": 29, "failed": 1, "total": 30, "translationFailures": [ … ] }`.
- `POST …/preview { "batchId", "leadId", "overrides", "allowPlaceholder", "forceLeadType" }`
  → `{ "subject", "html", "language" }`; 502 + `translationFailed` when the
  back-check fails.
- `POST …/send { "batchId" }`: sends `draft_ready` drafts through Resend in an
  8.5-second loop, recording each in `email_deliveries`
  (`kind = 'fair_outreach'`). 413 when attachments exceed Resend's limit.
  `{ "sent": 12, "failed": 0, "skipped": 0, "remaining": 17, "message": "…" }`;
  call again while `remaining > 0`.
- `POST …/retry-failed { "batchId" }` resets failed drafts that still have a body.
- `POST …/batches/[id]/refresh-deliveries` polls Resend for every sent draft:
  `{ "checked", "updated", "untracked", "errors", "byStatus": { "delivered": 25, "bounced": 1 } }`.

### Chat

`POST …/chat { "messages": [ … ], "context": { … }, "batchId" }` → `{ "message": "…" }`
(Claude via `lib/ai/anthropic.js`). History is persisted per batch in
`fair_chat_messages` (`GET ?batchId=`, `DELETE ?batchId=`). **That table is not
present in the live database**; see [../11-known-issues.md](../11-known-issues.md).

### `GET /api/fair-assistant/diagnose`

`{ "drive": { "ok", "mode": "oauth | service_account", "inboxFolder": { … } }, "anthropic": { "ok" }, "n8n": { "configured" } }`.
