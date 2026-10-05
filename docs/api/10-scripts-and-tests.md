# Scripts and tests

## npm scripts

| Command | Does |
|---|---|
| `npm run dev` | `next dev --webpack` on :3000 |
| `npm run build` / `npm start` | production build / `next start` (what pm2 runs) |
| `npm run lint` | `next lint` |
| `npm test` / `npm run test:watch` | Jest |
| `npm run check:schema` | `scripts/check-schema-drift.mjs`: compares production with `lib/expected-schema.mjs` (`--json`, `--strict`) |
| `npm run igi:import` / `igi:check` | load / verify the IGI seed (`lib/igi/seed.json`) |

## Maintenance scripts (`scripts/*.mjs`)

All connect with the **service role** from `.env` and must be run from a
laptop with that file (never from a cloud session without the key). Read the
header comment of each before running; most support a dry run.

| Group | Scripts |
|---|---|
| Users and onboarding | `add-admin-user.mjs`, `add-igi-user.mjs`, `onboard-showroom-accestory.mjs`, `reset-agent-password.js`, `check-and-activate-test-agent.mjs`, `grant-fair-access.mjs` (dry run by default), `set-agent-bonus.mjs` |
| Backfills | `backfill-agent-drive-folders`, `backfill-org-folders`, `backfill-org-agent-subfolders`, `backfill-document-agent-id`, `backfill-pack-templates`, `backfill-missing-commissions`, `materialize-commissions`, `backfill-nicolas-bonus`, `backfill-reported-commissions-paid`, `backfill-shipping-commission`, `sync-bonus-customer-paid` |
| Repairs and one-offs | `refile-org-member-orders`, `refile-unfiled-agent-orders`, `reorg-agents-orgs`, `repair-online-b2c-channels`, `repair-org-legacy-ids`, `cleanup-agent-folders`, `repair-silke-inhorgenta-dates`, `settle-silke-inhorgenta`, `edit-packs-2026-06` |
| Diagnostics (read-only) | `audit-agent-fair-isolation`, `audit-agents-orgs`, `audit-org-data`, `diagnose-*` (bastien-orders, channel-analytics, channel-misclassification, client-contacts, nicolas-bonus, offre-orders, unfiled-agent-orders), `inspect-agent-folders`, `inspect-undocumented`, `list-order-countries`, `verify-*` (bastian-inova, offre-flow, org-activity-summary, org-settlement, october-pricelist), `preview-org-commission-rate` |
| Assets and builds | `build-email-catalogues`, `build-email-packshots`, `build-slideshow-frames` (needs `pdftoppm`), `generate-packshot-manifest.js`, `generate-necklace-pricelist`, `generate-necklace-it-export`, `reprice-october-bracelets`, `reprice-shapy-pricelist`, `dump-october-pdf-cells`, `pdf-text`, `test-commission-report*` |
| IGI | `build-igi-seed`, `build-igi-switch-on` (generates `database-migrations/igi-switch-on.sql`), `build-igi-update`, `import-igi-seed` |
| Operations | `run-cron.sh`, `install-server-cron.sh`, `sync-env.sh`, `get-drive-token.mjs` |

SQL that is not a migration: `database-migrations/diagnose-*.sql`,
`verify-*.sql`, `igi-*-2026-09-1x.sql` (dated corrections). Run in the SQL
editor, read the comments first.

## Tests

Two runners, deliberately:

| Runner | Where | Count | Run |
|---|---|---|---|
| **Jest** (`next/jest`, jsdom, `@/` alias) | `lib/__tests__` (~146), `app/components/**/__tests__` (~110), `app/api/**/__tests__` (~79), `app/admin`, `app/auth`, `lib/auth/__tests__` | ~350 files | `npm test` |
| **node:test** | `tests/**/*.test.mjs` (agents, assistants, employees, auth gate, org authz, settlement, team stats, folders, builder) | 31 files | `node --test tests/` (no npm script; Jest ignores them) |

API route tests `require()` the route module and call the exported handler with
a mocked `Request` and mocked Supabase clients; the header comment of each
file lists what it covers. Good examples to copy: `documents*.test.js`,
`commissions-*.test.js`, `igi-*-routes.test.js`, `packs.test.js`,
`webhooks-resend.test.js`.

Routes **without** a direct test (as of 5 Oct 2026): `admin/out-memos/*`,
`agent-folders*`, `agent-folder-files*`, most `agents/[id]/*` sub-routes,
`approve-signup`, `reject-signup`, `assistants*`,
`commission-reports/[id]/download`, `consignment/my`,
`cron/{email-deliveries, igi-certificate-outs}`,
`documents/{[id]/purge, preview, upload}`, `drafts`,
`email-deliveries/refresh`, `events/[id]*`, almost all `fair-assistant/*`,
`igi/{certificate-erp-ins, certificate-erp-outs, daily, models/[id]/shelf-history, their-side}`,
every `organizations/*` route, `pack-templates*`, `packs/[id]/pinned`,
`parties`, `reports*`, `synalia-report/{export, preview}`, `vat`.

External services are always mocked; nothing in the suite talks to Supabase,
Resend, Anthropic or the ERP.
