# API conventions

Everything that is true of every endpoint, so the per-domain pages only have to
say what is different.

## Base URL and transport

| Environment | Base URL |
|---|---|
| Production | `https://app.lovelab-antwerp.com` |
| Local | `http://localhost:3000` |

All endpoints are under `/api/…` except the OAuth landing route
`/auth/callback`. JSON in, JSON out, UTF-8. A handful of routes return a binary
file or an HTML page and are marked as such on their page.

The old host `b2b-lovelab.com` and the Vercel deployment only redirect (301) to
the production URL. Webhooks must point at `app.lovelab-antwerp.com` directly;
Resend, for one, does not follow the redirect.

## Authentication

There are five ways a request proves who it is. Each route page says which one
applies.

| Marker in the docs | How it works | Failure |
|---|---|---|
| **Session** (S) | Supabase Auth session cookies set by the browser client. Any `fetch()` from the app sends them automatically. There is no bearer-token alternative; a script must either reuse the cookies or use the Supabase service role directly. | 401 `{ "error": "Unauthorized" }` |
| **Admin** (A) | Session + `profiles.role = 'admin'` | 403 `{ "error": "Forbidden" }` |
| **IGI** | Session + `profiles.is_igi = true`. The proxy also fences IGI sessions out of everything but `/igi*`, `/api/igi-portal*`, `/api/me` and `/set-password` (403 on API paths, redirect on pages). | 403 |
| **Cron secret** | Header `x-vercel-cron-secret: <CRON_SECRET>`. Not a bearer token, and the header name is kept even though Vercel no longer runs the crons. Unset secret means every call fails. | 401 |
| **Shared secret / signature** | n8n callbacks: header `x-fair-auth: <FAIR_WEBHOOK_SECRET>`. Resend webhook: Svix headers `svix-id`, `svix-timestamp`, `svix-signature` verified against `RESEND_WEBHOOK_SECRET` over the raw body (5-minute tolerance). | 401; 503 `{ "error": "Webhook not configured" }` if the secret is not set on the server |

A few routes are deliberately **public**: `POST /api/magic-link`,
`POST /api/forgot-password`, `POST /api/signup-request`,
`GET /api/approve-signup`, `GET /api/reject-signup` (token in the link),
`GET /auth/callback`.

Authorization beyond "is admin" is done in JavaScript inside the route, mostly
through `app/api/_lib/access.js`:

- `getUserContext()` → `{ user, profile, isAdmin, isAssistant, isIgi }`
- `getEventPermission()` / `requireEventPermission()`: `read` < `edit` < `manage`
- `canAccessDocument()`: own or credited document, admin, or assistant with event access
- `resolveAgentIds()`: all profile ids sharing one email (a re-invited agent gets a new auth id; the code treats them as the same person)

See [02-authentication.md](02-authentication.md) for the full model.

## Request format

- JSON body with `Content-Type: application/json`. Unknown keys are ignored;
  routes read an allow-list of fields.
- File uploads are `multipart/form-data` (`POST /api/documents/upload`,
  `POST /api/agent-folder-files`, `POST /api/agents/[id]/contract`,
  `POST /api/fair-assistant/upload`). Size limits are enforced in the route
  (25 MB, 25 MB, 10 MB, and the proxy limit) and PDFs are checked by magic
  bytes, not extension. The Next.js proxy body limit is 25 MB
  (`proxyClientMaxBodySize` in `next.config.js`).
- Path parameters in `[brackets]` are UUIDs unless the page says otherwise.
  Invalid UUIDs return 400.
- Dates are `YYYY-MM-DD` strings; timestamps are ISO 8601 with offset (what
  Postgres `timestamptz` serialises to). Months are `YYYY-MM`.
- Money is a JSON number in euros with two decimals (`1234.5`), never cents,
  never a string.
- Some `DELETE` routes take a JSON body (`DELETE /api/igi/models`); most take
  the id in the path or as a query parameter (`DELETE /api/drafts?id=`).

## Response format

Success responses have **no envelope**. Each route returns its own named keys,
documented per route. The common shapes:

```json
{ "document": { … } }                      // one object
{ "documents": [ … ], "total_count": 143,  // a page of a list
  "page": 1, "per_page": 50 }
{ "ok": true }                              // an action with nothing to return
{ "sent": 12, "failed": 0, "skipped": 3 }   // a batch action
```

Status codes: 200 for reads and updates, 201 for most creates (`POST
/api/organizations`, `/api/packs`, `/api/consignment-contacts`,
`/api/igi/models`, `/api/igi/visits`, IGI portal batches and counts), 202 for
`POST /api/organizations/[id]/members` (the invite continues in the
background).

## Error format

```json
{ "error": "Human-readable message" }
```

| Status | Meaning here |
|---|---|
| 400 | Validation: missing field, bad UUID, bad date, metadata too large (100 KB), wrong file type |
| 401 | No session / bad secret |
| 403 | Signed in but not allowed (not admin, no event permission, IGI fence) |
| 404 | Row not found, or exists but soft-deleted / not visible to you |
| 409 | State conflict: already paid, already accepted, duplicate request, model already numbered |
| 410 | Expired invitation token |
| 413 | Email attachments too large |
| 422 | Business rule: pack total under €970, translation could not be verified |
| 429 | Rate limit (see below) |
| 500 | Unhandled error; message is generic, details in the server log |
| 502 | An upstream (Resend, ERP, Anthropic, Perplexity) rejected the call |
| 503 | Not configured (missing API key or secret) **or** database not migrated yet |
| 504 | Upstream timeout |

Extra keys that some routes add next to `error`:

| Key | Where | Meaning |
|---|---|---|
| `detail` | documents, bonus backfill, cron | the underlying database or upstream message |
| `reason` | new-client bonus 409, Resend webhook 401 | a machine-readable cause |
| `code: "PACK_FOLDERS_NOT_INSTALLED"` | `PUT /api/packs/[id]/fairs` | `pack_fairs` migration not applied |
| `not_switched_on: true` | any `/api/igi*` route, 503 | an `igi_*` table does not exist yet (Postgres `42P01`) |
| `behind_the_app: true` | any `/api/igi*` route, 503 | a column the code expects is missing (`42703`) |
| `translationFailed: true`, `lang` | fair-assistant preview, price-list translate | the AI translation failed its own check |
| `idempotent_replay: true` | `POST /api/documents` (200, not an error) | the same `metadata.save_request_id` was seen before; the existing document is returned |

Deliberate exceptions to the shape:

- `POST /api/magic-link` and `POST /api/forgot-password` **always** return
  200 `{ "ok": true }` so nobody can probe which emails have accounts.
- `GET /api/vat` always returns 200 with `result: "VALID" | "INVALID" | "UNVERIFIED"`.
- `POST /api/webhooks/resend` returns 200 `{ "ok": false }` when its handler
  throws, so Resend does not retry forever.
- `GET /api/approve-signup` / `reject-signup` return HTML or a redirect.
- File downloads return the bytes with `Content-Disposition: attachment`.

## Rate limiting

`lib/rateLimit.js`: fixed window of 60 seconds per `prefix:IP`, in memory,
per server process (so it resets on every pm2 restart and is not shared across
instances). IP comes from `x-vercel-forwarded-for`, then `x-forwarded-for`,
then `x-real-ip`.

Over the limit:

```
HTTP/1.1 429
Retry-After: <seconds>
X-RateLimit-Remaining: 0

{ "error": "Too many requests. Please try again later." }
```

Typical limits (per route page, written as "RL n"): reads 60, writes 20–30,
expensive actions (AI, email send, report generation, uploads) 10, public
auth endpoints 5. Cron and webhook routes have no limit. A few routes have none
by omission; they are marked "no RL".

## Pagination, filtering, sorting

Only two list endpoints paginate: `GET /api/documents` (`page`, `per_page` ≤ 200,
≤ 500 for consignment; returns `total_count`) and `GET /api/commissions`
(`per_page` ≤ 500). Everything else returns the full list, capped in code
(clients 2000, commission reports 200, ERP mirrors 500). Filters are plain query
parameters named after the column (`event_id`, `status`, `order_channel`…).
Sorting is fixed per route (documents by `activity_at desc`).

## Idempotency and retries

- `POST /api/documents` accepts `metadata.save_request_id` (a client-generated
  UUID). A second POST with the same id returns the first document with
  `idempotent_replay: true` instead of saving twice.
- n8n callbacks are idempotent through `fair_leads (batch_id, lead_hash)`.
- Resend webhooks are idempotent through `email_deliveries.resend_id`.
- IGI → ERP pushes are idempotent through `igi_receipts.reference`.
- Long-running senders (`fair-assistant/send`, `price-lists/announce/send`)
  work in time-boxed loops (about 8.5 s) and return `remaining`; the client
  calls again until `remaining` is 0.

## Runtime notes

- Routes that build PDFs, parse Excel or attach files declare
  `export const runtime = 'nodejs'`; `POST /api/commission-reports/generate`
  declares `maxDuration = 300` and `POST /api/fair-assistant/upload` 60.
  On the self-hosted server these are only hints.
- The whole app runs as one `next start` process under pm2 (fork mode). A
  deploy or env change restarts it, which drops in-flight requests for a few
  seconds and resets the in-memory rate limiter.
- There is no API versioning. Breaking changes are coordinated with the
  single first-party client (the Next.js front end in the same repository).
- Health events: many routes record failures in `system_health_events`
  (`lib/healthEvent.js`) and email admins for `error` / `critical`, throttled
  to one email per source and severity per 30 minutes.
