# Overview and architecture

## What the application is

**LoveLab B2B** (`app.lovelab-antwerp.com`) is the back-office of LoveLab
Antwerp, a jewellery brand. It started in February 2026 as a quote calculator
for trade fairs and has grown into the system the company runs its wholesale
side on:

| Area | What it does |
|---|---|
| **Order builder** | Build a B2B / B2C order from the catalogue (collections, carats, colours, packs), with business rules (minimum €800, 10 % from €1,600, minimum pieces per colour), VAT validation, PDF generation, and an AI assistant that proposes orders from a budget or a description. |
| **Documents** | Every quote and order as a PDF plus structured metadata, filed into folders (fairs, agent folders, partners), soft-deletable, emailable to the client with delivery tracking. |
| **Clients** | A shared address book with VAT, shipping and jeweler-group data. |
| **Agents, organizations, commissions** | Sales agents and partner companies, their commission schemes, new-client bonuses, monthly Excel commission reports, payouts and settlement. |
| **Packs** | Pre-built orders at a fixed price, with Excel templates and per-fair filing. |
| **Fair assistant** | Photograph business cards at a fair → n8n OCRs them → translated follow-up emails per lead, sent through Resend with delivery and open tracking. |
| **IGI certificates** | Stock and movement tracking of diamond certificates between LoveLab and the IGI laboratory across the street, with a separate portal for IGI, ERP synchronisation, scheduled digests and invoice reconciliation. |
| **Price lists and resources** | Catalogues and price lists, announced to agents in their own language. |
| **Analytics and reports** | Dashboards, saved reports, an analytics chat with tool use, the quarterly Synalia report. |
| **Operations** | Health checks, email delivery sweeps, backups, schema drift detection. |

Users: LoveLab office staff (admins), sales agents and their teams, commercial
assistants at fairs, and IGI employees. All French-, Dutch- and English-speaking;
the UI is EN/FR.

## Stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | **Next.js 16** (App Router, `--webpack`), **React 19** | `app/` holds pages and `app/api/**/route.js` the HTTP API. Plain JavaScript, no TypeScript. |
| Database, auth, storage | **Supabase** (Postgres 17, Supabase Auth, Storage) | project `hnmydfafjghtrsrzpbtm`, eu-west-1. `@supabase/ssr` for cookie sessions. |
| Email | **Resend** (+ webhooks) | all outbound mail, including auth links |
| AI | **Anthropic** (Claude) and **Perplexity** (company lookup) | server-side proxies only; keys never reach the browser |
| Automation | **n8n** (Hostinger) | card OCR + Salesforce dedup for the fair assistant |
| Files | **Google Drive** | backups, fair photo inbox, report archives, agent folders |
| ERP | **LoveLab ERP** (Laravel, `software.lovelab-antwerp.com/api`) | consignment, write-offs, certificates, party search, memos |
| PDF / Excel | `jspdf` + `html2canvas` (client), `exceljs`, `pdf-parse` (server) | |
| Tests | Jest (`npm test`) and `node --test tests/` | about 350 Jest files, 31 node:test files |

## Request lifecycle

```
Browser (React, lib/api.js fetch helpers, Supabase browser client for auth)
   │  cookies: sb-access-token / sb-refresh-token
   ▼
proxy.js  ──► lib/supabase/middleware.js : refresh session, IGI fence
   │
   ▼
app/api/<domain>/route.js
   ├─ checkRateLimit()                      lib/rateLimit.js (in-memory, per IP)
   ├─ auth guard                            session / admin / IGI / cron secret / shared secret
   ├─ authorization                         app/api/_lib/access.js (events, documents, orgs)
   ├─ validation                            inline, allow-listed fields
   ├─ data access                           createAdminClient()  ──► Postgres (RLS bypassed)
   │                                        createClient()       ──► Postgres (RLS applied)
   ├─ side effects                          Resend, Drive, ERP, Anthropic, n8n, health events
   └─ NextResponse.json(...)
```

Business logic lives in `lib/` (about 120 modules): pricing (`catalog.js`,
`orderTotals.js`), commissions (`commission.js`, `commissionAttribution.js`,
`newClientBonus.js`, `commissionReportService.js`), access
(`documentAccess.js`, `collectionAccess.js`, `packVisibility.js`), email
(`send-email.js`, `email-templates.js`, `emailDeliveries.js`), integrations
(`google-drive.js`, `lovelab-sync.js`, `ai/*`, `fair-assistant/*`, `igi/*`,
`organizations/*`).

## Deployment and environments

| | Production |
|---|---|
| Host | DigitalOcean droplet, `/var/www/app.lovelab-antwerp.com/public_html` |
| Process | `next start` under **pm2** as `app-lovelab-antwerp` (fork mode; a restart is a few seconds of downtime) |
| Node | 22 (`.nvmrc`) |
| Deploy | push to `main` → `.github/workflows/deploy.yml` → SSH with a key restricted to one forced command, `scripts/deploy.sh` on the server (not in the repo) → pull, `npm ci`, `npm run build`, `pm2 restart` |
| Secrets | the server's `.env`, never in git. `scripts/sync-env.sh KEY…` copies keys from a local `.env` over SSH and restarts with `--update-env`; `NEXT_PUBLIC_*` keys trigger a rebuild. Procedure: `.claude/skills/env-sync/SKILL.md`. |
| Scheduled jobs | the server's crontab, installed by `scripts/install-server-cron.sh`, each line calling `scripts/run-cron.sh /api/cron/<job>` |
| Vercel | **not used** anymore. `vercel.json` only 301-redirects everything to the production host; its `crons` block is inert. Many comments and the `x-vercel-cron-secret` header name are historical. |

There is no staging environment. The Supabase organisation has one other,
inactive project. Testing a migration means a Supabase branch (preview
database) or a careful idempotent script.

Local development: `cp .env.example .env`, fill the Supabase keys,
`npm install`, `npm run dev`. The database is shared with production unless you
point the two Supabase variables at your own project.

## Where to look

| Question | Page |
|---|---|
| How do I call an endpoint, what do errors look like? | [03-conventions.md](03-conventions.md) |
| Who can do what? | [02-authentication.md](02-authentication.md) |
| What does endpoint X do? | [04-endpoints/README.md](04-endpoints/README.md) |
| What is in table Y? | [05-database/tables.md](05-database/tables.md) |
| Which secrets does feature Z need? | [08-environment.md](08-environment.md), [06-integrations.md](06-integrations.md) |
| What runs at night? | [07-background-jobs.md](07-background-jobs.md) |
| What does "offre" / "pool" / "DZB" mean? | [09-glossary.md](09-glossary.md) |
| What is known to be broken or odd? | [11-known-issues.md](11-known-issues.md) |
