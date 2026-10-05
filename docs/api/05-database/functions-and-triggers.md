# Database functions, triggers, views and enums

Read from the live project on 5 October 2026. There are **no views, no custom
enum types and no Edge Functions** in this project. All "allowed values" are
plain `CHECK` constraints on `text` columns (listed per table in
[tables.md](tables.md)).

## Functions

### Authorization helpers (used inside RLS policies)

All five are `SECURITY DEFINER`, language `sql`, and read `public.profiles` or
`public.organization_memberships` as the function owner so that a policy can ask
"is the caller an admin?" without the caller needing SELECT rights on other
people's profile rows.

| Function | Signature | Returns true when |
|---|---|---|
| `is_admin()` | `() → boolean` | the caller's `profiles.role = 'admin'` |
| `is_agent()` | `() → boolean` | the caller's `profiles.is_agent = true AND agent_status = 'active'` (defined, but no live policy uses it) |
| `is_igi()` | `() → boolean` | the caller's `profiles.is_igi = true` |
| `is_active_org_member(org_id uuid)` | `→ boolean` | the caller has an `organization_memberships` row for `org_id` with `deleted_at IS NULL` |
| `shares_active_org_with(target_user uuid)` | `→ boolean` | the caller and `target_user` both have non-deleted memberships in at least one common organization |

They are also callable over PostgREST (`POST /rest/v1/rpc/is_admin` etc.) by
`anon` and `authenticated`. That is harmless for these particular functions
(they only ever answer about `auth.uid()`, which is null for anon), but Supabase's
linter flags it; see [schema-health.md](schema-health.md).

### `revoke_user_sessions(uid uuid) → void`
`SECURITY DEFINER`. Deletes every row in `auth.sessions` for the given user, which
logs that user out everywhere. Called from the admin API when an agent is
deactivated or their password is reset. Source: `database-migrations/supabase-phase13-bugfixes.sql`.

### `get_agent_stats() → TABLE(...)`
`SECURITY INVOKER`, language `sql`. One row per agent with aggregated figures,
used by the agents list page:

| Column | Meaning |
|---|---|
| `agent_id` | `profiles.id` |
| `total_orders` | count of `agent_commissions` rows with `type = 'order'` |
| `total_revenue` | sum of `order_total` over those rows |
| `total_commission` | sum of `commission_amount` over `type = 'order'` |
| `total_bonuses` | sum of `commission_amount` over `type = 'bonus'` (note: not `new_client_bonus`) |
| `pending_commission` | sum over `status IN ('pending','approved')` |
| `paid_commission` | sum over `status = 'paid'` |
| `total_docs`, `total_order_docs`, `total_doc_revenue` | from `documents` where `created_by = agent` and `deleted_at IS NULL` |

Because it is `SECURITY INVOKER`, RLS applies: an agent calling it only sees
their own rows; the API calls it with the service role.
Source: live migration `20260309140004_create_get_agent_stats_rpc`.

### `updated_at` maintainers (trigger functions)

Four near-identical trigger functions set `NEW.updated_at = now()`:

| Function | Attached to |
|---|---|
| `handle_updated_at()` | `profiles`, `events`, `documents`, `email_deliveries` |
| `set_updated_at()` | `commission_reports` |
| `set_packs_updated_at()` | `packs` |
| `update_drafts_updated_at()` | `drafts` |

Tables that have an `updated_at` column but **no trigger** (the application
sets it explicitly, or it stays at its default): `clients`, `organizations`,
`organization_memberships`, `organization_invitations`, `saved_reports`,
`fair_batches`, `fair_images`, `fair_leads`, `fair_email_drafts`,
`fair_saved_templates`, `igi_models` (handled inside `igi_models_guard`),
`igi_invoices`.

### `igi_models_guard()` (trigger function)

`BEFORE UPDATE ON igi_models`. Enforces the business rules of the certificate
model lifecycle at the database level, whatever client is writing:

1. `serial` and `serial_full`, once non-null, can never change (raises
   `check_violation`).
2. The only permitted state transition is **into `in_use`**, from
   `awaiting_serial` (model numbered by IGI) or from `reserved` (serial reserved
   in advance, then produced). Any other state change raises.
3. When a model moves `awaiting_serial → in_use`, `numbered_at` is stamped if
   the writer forgot.
4. `updated_at` is refreshed.

### Schema-drift helpers

Five `SECURITY DEFINER` SQL functions prefixed `__schema_drift_` expose
`information_schema` / `pg_catalog` data to `scripts/check-schema-drift.mjs`
(run with `npm run check:schema`), which compares the live database with
`lib/expected-schema.mjs`:

`__schema_drift_tables()`, `__schema_drift_columns()`, `__schema_drift_constraints()`,
`__schema_drift_indexes()`, `__schema_drift_functions()`.

Source: `database-migrations/schema-drift-helpers.sql`. They are read-only and
return nothing sensitive, but they are also callable over PostgREST.

## Triggers

| Table | Trigger | Timing | Function |
|---|---|---|---|
| `profiles` | `set_profiles_updated_at` | BEFORE UPDATE | `handle_updated_at()` |
| `events` | `set_events_updated_at` | BEFORE UPDATE | `handle_updated_at()` |
| `documents` | `set_documents_updated_at` | BEFORE UPDATE | `handle_updated_at()` |
| `email_deliveries` | `set_email_deliveries_updated_at` | BEFORE UPDATE | `handle_updated_at()` |
| `commission_reports` | `commission_reports_set_updated_at` | BEFORE UPDATE | `set_updated_at()` |
| `packs` | `packs_updated_at` | BEFORE UPDATE | `set_packs_updated_at()` |
| `drafts` | `drafts_updated_at` | BEFORE UPDATE | `update_drafts_updated_at()` |
| `igi_models` | `igi_models_guard` | BEFORE UPDATE | `igi_models_guard()` |

**There is no trigger on `auth.users`.** A `profiles` row is *not* created by the
database when someone signs up; the application creates it (see
[../02-authentication.md](../02-authentication.md)). Likewise, nothing in the
database cascades a `profiles` delete to `auth.users` or vice-versa beyond the
declared foreign keys.

## Foreign keys that cascade

The `list_tables` output does not expose `ON DELETE` actions, so cascade
behaviour comes from the migration files and from
`docs/cascade-delete-audit.md`. The important ones:

- `profiles.id → auth.users.id` **ON DELETE CASCADE**: deleting an auth user
  removes the profile.
- `documents.event_id → events.id`: set null on event delete (documents survive
  their event).
- Everything hanging off `fair_batches` (`fair_images`, `fair_leads`,
  `fair_email_drafts`) cascades with the batch.
- `igi_visit_lines.visit_id → igi_visits.id` cascades; `igi_*` → `igi_models`
  references do **not** cascade (a model with history cannot be deleted).
- `pack_visibility`, `pack_fairs`, `pack_hidden`, `pack_pinned` cascade with
  their pack.

When in doubt, check the `ON DELETE` clause in the migration that created the
constraint; the application never relies on cascades for business data and
prefers soft deletes (`deleted_at`) on `documents`, `organizations`,
`organization_memberships`, `organization_invitations` and
`profiles.agent_deleted_at`.
