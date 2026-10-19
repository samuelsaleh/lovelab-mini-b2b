# External integrations

One table per service: what it is used for, where the code is, what it needs,
how it fails. Secrets live in the server's `.env`; see
[08-environment.md](08-environment.md) and `.claude/skills/env-sync/SKILL.md`.

## Supabase

| | |
|---|---|
| Used for | Postgres, Auth, Storage, Realtime (fair assistant) |
| Project | `hnmydfafjghtrsrzpbtm` "LoveLab Order form", eu-west-1, Postgres 17.6 |
| Code | `lib/supabase/{client,server,middleware}.js` |
| Env | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (browser + RLS-bound server client), `SUPABASE_SERVICE_ROLE_KEY` (server only, bypasses RLS) |
| Failure mode | middleware fails open on unreachable Supabase; routes then 401/500 |
| Docs | [05-database/README.md](05-database/README.md) |

Auth providers enabled: Google OAuth, email + password, magic link / OTP.
Supabase's own email templates are **not** used: links are generated with
`auth.admin.generateLink` and sent through Resend (`lib/auth/sendBrandedAuthLink.js`).

## Resend

| | |
|---|---|
| Used for | every outbound email: order confirmations, internal notices, invites and auth links, fair outreach, price list announcements, IGI digests, admin alerts, commission and Synalia reports |
| Code | `lib/send-email.js` (`sendEmail`, abortable, never throws: returns `{ ok, id, reason }`), `lib/email.js` (sender and recipient lists), `lib/email-templates.js`, `lib/email-shell.js`, `lib/emailDeliveries.js`, `lib/resendWebhook.js` |
| Env | `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `SENDER_EMAIL` (default `dionne@love-lab.com`, must be a verified sender), `ADMIN_NOTIFICATION_EMAIL`, `ADMIN_ALERT_EMAIL`, `ORDER_NOTIFICATION_EMAILS`, `EXTRA_ORDER_NOTIFICATION_EMAILS` |
| Inbound | `POST /api/webhooks/resend` (Svix-signed), see [04-endpoints/email-and-webhooks.md](04-endpoints/email-and-webhooks.md) |
| Failure mode | 503 when the key is missing; 502 when Resend rejects; the sender then records a health event and alerts admins |
| Lessons | one key per consumer (the app, n8n, a Claude session), install before revoke: `.claude/skills/api-credentials/SKILL.md`, incident of 15 Sept 2026 |

## Anthropic (Claude)

| Where | Model | Purpose |
|---|---|---|
| `lib/api.js` → `POST /api/anthropic` | `claude-sonnet-5` requested by the client, allow-list in the route is older models | builder chat, budget recommendations, contract chat (**see known issues**) |
| `POST /api/analytics/chat` | `claude-sonnet-4-5` | analytics assistant with tool definitions (`lib/analyticsChat.js`) |
| `lib/ai/anthropic.js` | `claude-sonnet-5`, 60 s timeout | generic server helper; fair-assistant chat |
| `lib/ai/translateText.js`, `lib/fair-assistant/translate.js` | `claude-sonnet-5`, fallback `claude-haiku-4-5-20251001` | translations with a back-translation check |
| `lib/fair-assistant/aiHealth.js` | haiku | key health ping for `/api/fair-assistant/diagnose` |
| `POST /api/agents/[id]/extract-commission` | `claude-3-5-haiku-20241022` | propose a commission config from contract text |

Env: `ANTHROPIC_API_KEY`. The system prompt and catalogue block for the builder
are in `lib/prompt.js`. The browser never holds the key; `/api/anthropic` caps
`max_tokens` at 4096 and rate-limits to 20/min.

## Perplexity

"Look up company" in the client gate. `lib/api.js lookupCompany` →
`POST /api/perplexity`, which translates the legacy chat-completions request
into the **Agent API** (`https://api.perplexity.ai/v1/agent`, model
`perplexity/sonar`) since the Sonar endpoint closed on 27 Sept 2026.
Env: `PERPLEXITY_API_KEY`. Keys are managed at perplexity.ai → API → Keys.

## Google Drive

| Use | Code | Env |
|---|---|---|
| Fair-assistant photo inbox (n8n reads from here) | `lib/fair-assistant/drive.js` | `FAIR_DRIVE_INBOX_FOLDER_ID` |
| Agent folders `<root>/<Agent>/` (cached in `profiles.drive_folder_id`) | `lib/agentDriveFolder.js` | `GOOGLE_DRIVE_FOLDER_ID` |
| Monthly commission report archive `<root>/<YYYY-MM — Month YYYY>/…xlsx` | `lib/commissionReportDrive.js` | `GOOGLE_DRIVE_COMMISSION_REPORTS_FOLDER_ID` |
| Synalia quarterly reports | `lib/synaliaReportDrive.js` | `GOOGLE_DRIVE_SYNALIA_REPORTS_FOLDER_ID` |
| Backups (`GET /api/backup`) | `app/api/backup/route.js` | `GOOGLE_DRIVE_FOLDER_ID` |

Authentication (`lib/google-drive.js`): **either** an OAuth refresh token
(`GOOGLE_DRIVE_REFRESH_TOKEN`, `GOOGLE_OAUTH_CLIENT_ID`,
`GOOGLE_OAUTH_CLIENT_SECRET`; obtain with `scripts/get-drive-token.mjs`)
**or** a service account (`GOOGLE_SERVICE_ACCOUNT_KEY`, JSON). Helpers:
`findOrCreateFolder`, `findFolderByAnyName` (accepts month names in several
languages), `uploadFileToDrive`, `uploadJsonToDrive`, `createDailyBackupFolder`.
Without credentials the features degrade: reports still go to Supabase Storage
and email, the backup returns `{ skipped: true }`.

## n8n (Hostinger)

| Workflow | Direction | Auth | Status |
|---|---|---|---|
| `fair-assistant-extract`: card OCR, language detection, Salesforce dedup | app → n8n: `POST FAIR_N8N_WEBHOOK_URL { id, mimeType, batchId, imageId }`; n8n → app: `POST /api/fair-assistant/callback` | header `X-Fair-Auth: FAIR_WEBHOOK_SECRET` both ways | live |
| `fair-assistant-send` | n8n → `GET /api/fair-assistant/drafts`, `POST …/send-callback` | same | legacy; sending now happens in the app; `FAIR_N8N_SEND_WEBHOOK_URL` is unused |
| `monthly-commission-reports` (`n8n/monthly-commission-reports.workflow.json`) | n8n cron `0 8 1 * *` → `POST /api/commission-reports/generate` with the cron header | `CRON_SECRET` | the API side is **disabled**; the JSON still points at the old host `b2b-lovelab.com` |

Setup: `n8n/SETUP.md`, `docs/fair-assistant-n8n.md`. n8n credentials for
Claude sessions live in Sam's personal `my-n8n-key` skill, not in the repo.

## LoveLab ERP (Laravel)

`LOVELAB_API_URL` (default `https://software.lovelab-antwerp.com/api`). The
ERP endpoints have no authentication, so the app calls them server-side only.

| Endpoint | Used by |
|---|---|
| `POST consignment-order/store`, `POST consignment-order/return`, undo | `lib/lovelab-sync.js` from document save / reconcile / `POST /api/lovelab-sync/undo-return` |
| `POST gift-lost-order/store` | `delete_from_stock` orders |
| `GET parties` | `GET /api/parties` |
| `GET agent-discount/{email}`, `POST agent-discount` | `/api/agent-discount` |
| `GET jewellery-memos/out…`, `POST party-masters memo_type` | `/api/admin/out-memos*` |
| `GET/POST certificate-in`, `GET certificate-out`, `GET certificate-stock`, `GET certificate-in/descriptions`, `POST certificate-master` | `lib/igi/lovelabCertificates.js`, `lib/igi/lovelabStock.js`, the IGI crons |
| `GET packing-stock` | `lib/igi/lovelabStock.js` (seeding) |

Failures are recorded as `system_health_events` and never block the user's
save; the 10-minute cron retries certificate pushes.

## VIES (EU VAT)

`GET /api/vat` → `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/{cc}/vat/{number}`.
No credentials. 30 s timeout, 10-minute cache, `GR` → `EL`. Unreachable VIES
yields `result: "UNVERIFIED"`, never an error.

## Salesforce

Only a provenance marker: `clients.source = 'salesforce'` with
`source_comment` and `source_imported_at`, from the one-off importer
`scripts/archive/import_salesforce_accounts.py`. Live Salesforce writes happen
inside the n8n OCR workflow, not in this app.

## Summary of outbound hosts

`*.supabase.co`, `api.resend.com`, `api.anthropic.com`, `api.perplexity.ai`,
`www.googleapis.com` / `oauth2.googleapis.com`, the n8n host (Hostinger),
`software.lovelab-antwerp.com`, `ec.europa.eu`.
