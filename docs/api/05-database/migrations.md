# Migrations: where the schema lives and how to change it

## The short version

- The schema was built up over eight months by **pasting SQL into the Supabase
  SQL editor**. The files are kept in the repository, but Supabase itself only
  recorded 19 of them in `supabase_migrations.schema_migrations` (the ones
  applied through the MCP / CLI since March 2026).
- There are **two folders** of SQL and **one JavaScript file** that describes
  what the code expects:

| Location | What it is | Count |
|---|---|---|
| `database-migrations/*.sql` | Legacy, phase-numbered files (`supabase-setup.sql`, `supabase-phase3.sql` … `supabase-phase34-pack-fairs.sql`), plus one-off data fixes, diagnostics (`diagnose-*.sql`) and verifiers (`verify-*.sql`). **All base tables are created here.** | ~95 |
| `supabase/migrations/*.sql` | Timestamped files in Supabase CLI format, from March 2026 onward: organizations, order channels, consignment, assistants, the whole IGI module, email deliveries. **They depend on the legacy base tables**; `supabase db reset` on an empty project will fail. | 40 |
| `supabase-b2b-b2c-orders.sql` (repo root) | Adds `documents.order_channel`. Must run before `supabase/migrations/20260311200000_internal_orders_channel.sql`. | 1 |
| `lib/expected-schema.mjs` | The schema the **code depends on**, checked against production by `npm run check:schema`. Not a full description (see [schema-health.md](schema-health.md)). | 1 |

- Nothing is ever applied automatically on deploy. A deploy that needs a new
  column is a two-step operation: run the SQL in Supabase, then push the code.
  The IGI routes handle the gap gracefully (503 `not_switched_on` /
  `behind_the_app`, see [../03-conventions.md](../03-conventions.md)); most
  other routes do not.

## Applying a new migration today

1. Write the file in `supabase/migrations/` with a `YYYYMMDDHHMMSS_name.sql`
   name. Make it idempotent (`IF NOT EXISTS`, `DROP POLICY IF EXISTS … ; CREATE POLICY …`).
   Every existing file follows this convention, so re-running one is safe.
2. Add the new table / column / check / unique index / function to
   `lib/expected-schema.mjs` with a `source:` pointing at the file.
3. Apply it to production in one of two ways:
   - Supabase dashboard → SQL editor → paste → Run (how everything before
     March 2026 was done; leaves no record in `schema_migrations`), or
   - the Supabase MCP `apply_migration` tool / `supabase db push` (records the
     version). Prefer this.
4. Run `npm run check:schema` against production. It must be clean.
5. Only then deploy the code that uses the change.

For a one-off data fix, put the SQL in `database-migrations/` with a dated
name (`igi-correction-2026-09-16.sql` is the pattern) and do not add it to
`expected-schema.mjs`.

## Order of application on an empty database

Nothing in the repo states this; it was inferred from the dependencies between
files. Use it to rebuild a staging project.

1. `database-migrations/supabase-setup.sql` → `supabase-phase3.sql` →
   `supabase-phase4-fixes.sql` → `phase5-security` → `phase6-admin-access` →
   `phase6-fix` → `phase6-fix2` → `phase7-signup-requests` →
   `supabase-drafts.sql` → `phase8-agents` → `phase9-reports` →
   `phase10-agent-password` → `phase11-commission-config` →
   `phase12-agent-folders` → `phase13-bugfixes` → `phase14-event-sharing`.
2. `supabase/migrations/20260306120000_organization_first_foundation.sql` →
   `20260306124000_organization_invitations.sql` →
   `20260306_add_org_id_to_agent_folders.sql` →
   `20260306_org_management_fields.sql` → `20260306_data_fixes.sql`.
3. `database-migrations/supabase-codify-existing-schema.sql` (creates
   `audit_state`, `events.type`, `profiles.agent_deleted_at`,
   `profiles.agent_contract_url`, which were created by hand in production).
   Must precede the next step, which drops policies on `audit_state`.
4. `20260311000000_fix_rls_and_function_security.sql` →
   `20260311100000_events_organization_link.sql` →
   **root `supabase-b2b-b2c-orders.sql`** →
   `20260311200000_internal_orders_channel.sql` →
   `20260330000000_consignment.sql` → `20260401000000_delete_from_stock.sql`.
5. `phase15-salesforce-clients` → `phase16-system-health-events` →
   `phase17-event-dedup` (run `diagnose-event-duplicates.sql` first on a
   non-empty DB) → `phase0-drift-repair` (no-op on a fresh DB) →
   `phase19-new-client-bonus` → `phase19-new-client-bonus-fix` →
   `phase19b-customer-paid` → **`phase19c` before `phase19d`** (19c's
   `ON CONFLICT (agent_id, document_id)` needs the index that 19d replaces) →
   `phase19d-bonus-unique-fix` → `phase19e-commission-reports` →
   `phase20-custom-packs` → `phase21-pack6-rb-syn` →
   `phase22-agent-drive-folder` → `phase23-fair-assistant.sql` then its
   ten `phase23-fair-assistant-*.sql` sub-files →
   `2026-05-27-backfill-events-org-id.sql` → `phase24-draft-orders`.
6. `20260622000000_sample_orders_channel.sql` →
   `20260624100000_merge_sample_into_draft.sql` → `phase25-offre-orders` →
   `phase25-rename-packs` → `phase26-pack-templates-bucket` →
   `phase26-pack-visibility` → `phase27-admin-see-all-packs` →
   `phase27-quick-orders` → `phase28-commission-invoice-number` →
   `phase29-payment-driven-settlement` → `phase30-team-visibility` →
   `20260719000000_client_dzb_group.sql` → `20260719120000_client_shipping.sql`
   → `phase33-pack-sort-and-admin-delete` →
   `20260812120000_new_client_bonus_mode.sql` → `phase34-pack-fairs` →
   `20260818090000_commercial_assistants.sql` →
   `20260818110000_event_access_user_email_compat.sql` →
   `20260818130000_documents_agent_id.sql`.
7. The IGI and email files `20260828120000` … `20260925120000` in timestamp
   order. On a fresh database `database-migrations/igi-switch-on.sql`
   (generated by `scripts/build-igi-switch-on.mjs`) can replace the IGI ones
   and also loads the opening balances of 27 August 2026.
8. `database-migrations/schema-drift-helpers.sql` (any time; needed by
   `npm run check:schema`).

Some files exist in both folders with the same content
(`supabase-phase31-client-dzb-group.sql` = `20260719000000`,
`phase32-client-shipping` = `20260719120000`, `supabase-sample-orders-channel`
= `20260622000000`, `supabase-merge-sample-into-draft` = `20260624100000`,
`supabase-email-opens` = `20260915130000`, `igi-certificate-*-sync` =
`20260918*`, `igi-shelf-opening` = `20260919120000_igi_shelf_opening`). Apply
either, once.

## What is in production but in no migration file

Found by comparing the live project with the repository:

- The `documents` storage bucket and its four permissive policies.
- The `get_agent_stats()` function body (recorded in Supabase as migration
  `20260309140004_create_get_agent_stats_rpc`, but the SQL is not in the repo;
  `database-migrations/diagnose-marc-stats.sql` dumps it).
- The `Allow public read` policies on `documents` and `audit_state` and
  `Allow anon read clients` on `clients`.
- The duplicate `clients` update/delete policies.
- A `set_clients_updated_at` trigger is defined in `supabase-phase4-fixes.sql`
  but is **absent** from the live database.
- The `fair_chat_messages` table is created by
  `supabase-phase23-fair-assistant-chat-memory.sql` but is **absent** from the
  live database (see [../11-known-issues.md](../11-known-issues.md)).

## Recommended clean-up (not done, for Taddeo to decide)

1. Generate one consolidated baseline from the live database
   (`supabase db dump --schema public,storage` or the dashboard's schema export),
   commit it as `supabase/migrations/00000000000000_baseline.sql`, and move
   `database-migrations/` to `database-migrations/archive/`.
2. Repair `supabase_migrations.schema_migrations` so it lists the baseline plus
   the 19 recorded versions (`supabase migration repair`).
3. From then on, only `supabase/migrations/` + `apply_migration` / `db push`.
4. Extend `lib/expected-schema.mjs` with the gaps listed in
   [schema-health.md](schema-health.md) and add a CI step that runs
   `npm run check:schema --strict` against a staging branch.
