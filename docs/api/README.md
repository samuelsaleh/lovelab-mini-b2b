# LoveLab B2B — technical and API documentation

For the engineer taking over or extending `app.lovelab-antwerp.com`. Written
from the code at commit `d4599fb` and the **live Supabase project** (schema,
policies, functions, buckets and advisors were read from production on
5 October 2026, not only from the migration files).

## Start here

1. [01-overview.md](01-overview.md) — what the application does, the stack,
   the request lifecycle, how it is deployed.
2. [02-authentication.md](02-authentication.md) — sign-in flows, the seven
   kinds of user, and the five layers of permission checks.
3. [03-conventions.md](03-conventions.md) — base URL, auth headers, request and
   response shapes, every error code, rate limits, idempotency.

## Reference

| Section | Contents |
|---|---|
| [04-endpoints/](04-endpoints/README.md) | All 209 handlers in 155 route files, grouped in 17 domain pages, with guards, inputs, outputs and side effects |
| [05-database/](05-database/README.md) | 43 tables with every column, all RLS policies in plain English, functions and triggers, storage buckets, migrations, schema health |
| [06-integrations.md](06-integrations.md) | Supabase, Resend, Anthropic, Perplexity, Google Drive, n8n, the LoveLab ERP, VIES |
| [07-background-jobs.md](07-background-jobs.md) | The five cron jobs, the backup, and the asynchronous work inside requests |
| [08-environment.md](08-environment.md) | Every environment variable, what breaks without it, how to check it |
| [09-glossary.md](09-glossary.md) | Business vocabulary: offre, pool, shelf, DZB, Synalia, quick order… |
| [10-scripts-and-tests.md](10-scripts-and-tests.md) | npm scripts, the 70 maintenance scripts, the two test runners |
| [11-known-issues.md](11-known-issues.md) | 24 discrepancies found while writing this, ranked |

## Ten facts that explain most of the code

1. It is one Next.js 16 app; the "API" is `app/api/**/route.js` and the only
   client is the React front end in the same repo.
2. Supabase is database, auth and file storage. Most routes use the
   **service-role** client and check permissions in JavaScript; RLS is the
   real boundary only for the IGI portal.
3. Everything revolves around the `documents` table: a PDF plus a `metadata`
   JSON blob, filed into `events` (folders), credited to an agent, generating
   `agent_commissions`.
4. Users are `profiles` with `role` (admin / member) and flags (`is_agent`,
   `is_assistant`, `is_igi`); agents group into `organizations`.
5. Every email goes through Resend and is tracked in `email_deliveries` via a
   webhook and a daily sweep.
6. AI is Claude behind server-side proxies; Perplexity looks up companies;
   n8n OCRs business cards for the fair assistant.
7. The IGI certificate module is a two-sided stock system with its own portal,
   ERP mirror and scheduled digests.
8. Production is a DigitalOcean server under pm2, deployed by a push to
   `main`; crons are in the server's crontab; Vercel only redirects.
9. Secrets live in the server's `.env`, moved with `scripts/sync-env.sh`;
   nothing secret is in git.
10. The schema was built by pasting SQL into Supabase; `lib/expected-schema.mjs`
    and `npm run check:schema` are the guard rail, and they have gaps.

## Keeping this up to date

- A new route: add a row to the right page in `04-endpoints/` (method, path,
  guard, RL, purpose) and a short body section if it has a non-trivial payload.
- A new table or column: add it to `lib/expected-schema.mjs` first, then to
  `05-database/tables.md`; re-read the policies if you added any.
- A new secret: `08-environment.md` and `.env.example`.
- Something that only works because of a quirk: `11-known-issues.md`.

The table reference was generated from the live schema with a small script
(column tables) plus hand-written descriptions; regenerating it means running
the Supabase MCP `list_tables` call with `verbose: true` and re-applying the
descriptions.
