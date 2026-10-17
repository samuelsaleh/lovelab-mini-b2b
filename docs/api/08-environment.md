# Environment variables

Read from the server's `.env` (production) or a local `.env` (development).
`.env.example` is the template, but it is incomplete; this table is the result
of grepping `process.env.*` across `lib/`, `app/`, `scripts/`, `proxy.js` and
`next.config.js`. **Never commit a value, never paste one on a command line**
(`.claude/skills/api-credentials/SKILL.md`). To change one in production use
`scripts/sync-env.sh KEY` (`.claude/skills/env-sync/SKILL.md`); `NEXT_PUBLIC_*`
keys need a rebuild, which the script does.

## Required for the app to start and sign people in

| Variable | Used by | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | every Supabase client | baked in at build time |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser and RLS-bound server client | public by design; RLS is what protects data |
| `SUPABASE_SERVICE_ROLE_KEY` | `createAdminClient()`, scripts | **server only**, bypasses RLS |
| `NEXT_PUBLIC_SITE_URL` | OAuth redirects, email links | `https://app.lovelab-antwerp.com` in prod; protected by sync-env |
| `ALLOWED_HOSTS` | `/auth/callback` host check | comma-separated; protected by sync-env |
| `ADMIN_EMAILS` | callback role repair | comma-separated; promotes, never demotes |
| `IGI_EMAILS` | login gate, callback, middleware fence | IGI accounts; never also in `ADMIN_EMAILS` |
| `ALLOWED_EMAILS` | fallback when the `allowed_emails` table is empty | rarely needed now |
| `RESEND_API_KEY` | all email, including magic links and invites | without it: 503 on send routes, auth links fail silently (`{ ok: false }`) |
| `SENDER_EMAIL` | From address | default `dionne@love-lab.com`; must be verified in Resend |

## Email routing

| Variable | Meaning |
|---|---|
| `ADMIN_NOTIFICATION_EMAIL` | signup requests, health alerts: first address To, rest CC; default `albertosaleh@gmail.com` |
| `ADMIN_ALERT_EMAIL` | override for health alerts (not in `.env.example`) |
| `ORDER_NOTIFICATION_EMAILS` | internal order notices; default Alberto, Dionne, Elie |
| `EXTRA_ORDER_NOTIFICATION_EMAILS` | appended to every order notice; default Dionne, Debbie, Dahlia; set empty to switch off |
| `SYNALIA_REPORT_RECIPIENT` | default `dionne@love-lab.com` |
| `RESEND_WEBHOOK_SECRET` | `whsec_…` from Resend → Webhooks; without it the webhook answers 503 |

## Integrations

| Variable | Feature | Without it |
|---|---|---|
| `ANTHROPIC_API_KEY` | builder AI, analytics chat, translations, fair-assistant chat, contract extraction | 503 / red banner in Fair Assistant |
| `PERPLEXITY_API_KEY` | company lookup | 503 |
| `LOVELAB_API_URL` | ERP calls | default `https://software.lovelab-antwerp.com/api` |
| `CRON_SECRET` | all `/api/cron/*`, `/api/backup`, cron-triggered report generation | every cron call 401 |
| `FAIR_WEBHOOK_SECRET` | n8n ↔ app shared secret (`X-Fair-Auth`) | callbacks 503 |
| `FAIR_N8N_WEBHOOK_URL` | card extraction trigger | uploads succeed, nothing is extracted |
| `FAIR_N8N_SEND_WEBHOOK_URL` | legacy n8n send | unused |
| `FAIR_DRIVE_INBOX_FOLDER_ID` | where card photos go | upload 500 |
| `GOOGLE_DRIVE_REFRESH_TOKEN`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | Drive via OAuth (not in `.env.example`) | |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Drive via service account (alternative) | Drive features skipped |
| `GOOGLE_DRIVE_FOLDER_ID` | backups, agent folders root | |
| `GOOGLE_DRIVE_COMMISSION_REPORTS_FOLDER_ID` | monthly report archive (year folder or parent of year folders) | report still stored + emailed |
| `GOOGLE_DRIVE_SYNALIA_REPORTS_FOLDER_ID` | Synalia archive | |
| `AGENT_DOCUMENTS_BUCKET` | bucket for organization folder markers (not in `.env.example`) | defaults to `agent-documents`, which does not exist; markers fail non-blocking |

## Scripts only

`VERIFY_BASE_URL` (verify-*.mjs), `DEPLOY_SSH_PASSWORD`, `APP_DIR`,
`ENV_FILE`, `SITE_URL` (sync-env / install-server-cron), `NODE_ENV`,
`VERCEL_URL` (one fallback in resources/send-email), `PORT`.

Documented but no longer read: `COMMISSION_REPORT_RECIPIENT` (recipient is
hard-coded), n8n's `N8N_ALERT_TO`.

## Checking a key is live

| Key | Check |
|---|---|
| `RESEND_WEBHOOK_SECRET` | `curl -s -o /dev/null -w '%{http_code}' -X POST https://app.lovelab-antwerp.com/api/webhooks/resend -H 'content-type: application/json' -d '{}'` → 401 means set, 503 means missing |
| `ANTHROPIC_API_KEY` | Admin → Fair Assistant → Outreach: no red banner; or `GET /api/fair-assistant/diagnose` |
| `CRON_SECRET` | `scripts/run-cron.sh /api/cron/health-check` returns JSON, not 401 |
| Drive | `GET /api/fair-assistant/diagnose` → `drive.ok` |
