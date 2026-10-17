# Schema health: drift, advisor findings and things to fix

A snapshot of what the live database looks like compared with the code, and
what Supabase's own linter says about it. Taken on 5 October 2026 from project
`hnmydfafjghtrsrzpbtm` ("LoveLab Order form", eu-west-1, Postgres 17.6).
Re-run `npm run check:schema` and the Supabase dashboard advisors before relying
on this page.

## 1. Drift between `lib/expected-schema.mjs` and the live database

`lib/expected-schema.mjs` is the schema the code *depends on*, not a full
description. Nothing the code expects is missing from the live database
(`npm run check:schema` is clean in that direction). The live database has more
than the file lists:

**Tables the file does not describe at all** (present and in use):
`fair_batches`, `fair_images`, `fair_leads`, `fair_email_drafts`,
`fair_saved_templates`, `igi_certificate_in_sync`.

**Columns present live but absent from the file** (excluding plain `created_at`
/ `updated_at`):

| Table | Columns |
|---|---|
| `profiles` | `avatar_url`, `drive_folder_id` |
| `clients` | `address`, `city`, `zip`, `email`, `phone`, `vat`, `vat_valid` |
| `documents` | `activity_at` (added by `supabase/migrations/20260912120000_documents_activity_at.sql`) |
| `email_deliveries` | `opened_at`, `clicked_at`, `open_count`, `click_count` |
| `igi_models` | `shelf_opening` |
| `consignment_contacts` | `phone`, `email`, `address`, `notes`, `created_by` |
| `organization_invitations` | `role`, `invited_by`, `accepted_at`, `deleted_at` |
| `agent_folders` | `created_by` |
| `agent_folder_files` | `file_size` |
| `event_access` | `id` |

Recommendation: add these to `expectedSchema` so the drift check protects them.

## 2. Migration bookkeeping

Supabase's `supabase_migrations.schema_migrations` table knows about **19**
migrations (applied through the dashboard/MCP), while the repository has 40
files in `supabase/migrations/` and ~95 in `database-migrations/`. Most of the
schema was applied by pasting SQL into the SQL editor, which leaves no record.
See [migrations.md](migrations.md) for the full story and the recommended way
forward.

## 3. RLS policies that are wider than they look

Supabase's security advisor does **not** flag these, because RLS is enabled and
a policy exists. They are visible only by reading the policies.

| Table | Policy | Effect | Suggested fix |
|---|---|---|---|
| `documents` | `Allow public read` (`SELECT`, role `public`, `USING true`) | Anyone with the anon key can list every non-deleted *and deleted* document row (metadata, client names, totals). Files in storage are still private. | Drop the policy. The app only reads documents through service-role API routes, so nothing breaks. Test the Documents page and the dashboard after dropping. |
| `clients` | `Allow anon read clients` (`SELECT`, role `anon`, `USING true`) | Anonymous read of the whole client book (names, emails, phones, VAT numbers). | Drop it. Signed-in users keep `Authenticated users can read all clients`. |
| `audit_state` | `Allow public read` | Anonymous read of the one-row MAPIG audit JSON. Low sensitivity, but no reason for it. | Restrict to `is_admin()`. |
| `pack_fairs` | four `true` policies for `authenticated` | Any signed-in user, including agents, can attach or detach any pack from any fair. The UI only exposes this to admins. | Replace with `is_admin()` for write, keep `true` for read. |
| `clients` | duplicated pairs (`Users can update own clients` / `… their own clients`, same for delete) | Harmless but confusing. | Drop one of each pair. |
| `storage.objects` (`documents` bucket) | any authenticated user may read/write/delete any object | An agent could, with the anon key and their session, download another agent's PDF if they guessed the path. Paths contain UUIDs so guessing is impractical, and the app signs URLs server-side. | Consider path-prefix policies (`storage.foldername(name)[1] = auth.uid()::text`) or keep as is and rely on server-side access. |

## 4. Supabase security advisor (5 Oct 2026)

| Level | Finding | Detail |
|---|---|---|
| WARN | Function search_path mutable | `set_updated_at`, `igi_models_guard`, `set_packs_updated_at`, `handle_updated_at` have no fixed `search_path`. Fix: `ALTER FUNCTION … SET search_path = public, pg_temp;`. Low risk, trigger functions only. [Docs](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable) |
| WARN | Public / authenticated can execute SECURITY DEFINER functions | `is_admin`, `is_agent`, `is_igi`, `is_active_org_member`, `shares_active_org_with` are callable through `/rest/v1/rpc/…`. They only answer about the caller, so no data leaks, but `REVOKE EXECUTE … FROM anon, authenticated` costs nothing (policies run as the table owner and keep working). [Docs](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) |
| WARN | Leaked password protection disabled | Agents log in with email + password. Enable HaveIBeenPwned checking in Auth settings. [Docs](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) |

## 5. Supabase performance advisor (5 Oct 2026)

| Level | Finding | Count | Notes |
|---|---|---|---|
| WARN | `auth_rls_initplan` | 56 policies on 22 tables | Policies call `auth.uid()` / `auth.email()` directly. Wrapping as `(select auth.uid())` lets Postgres evaluate once per query instead of once per row. Matters most on `documents` (600 rows, growing) and `clients`. [Docs](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan) |
| WARN | `multiple_permissive_policies` | 59 | Several SELECT policies on the same table are OR-ed together (`documents`, `events`, `clients`, `igi_*`…). Each one is evaluated per row. Merging them is an optimisation, not a correctness issue. |
| WARN | `duplicate_index` | 1 | `organization_memberships`: `idx_org_memberships_user_active` and `org_memberships_user_idx` are identical. Drop one. |
| INFO | `unindexed_foreign_keys` | 29 | Mostly `created_by` / `*_by` audit columns, which are never used for lookups. The two worth indexing: `documents.event_id` (used by every event view) and `agent_commissions.document_id` (used by commission recalculation). |
| INFO | `unused_index` | 19 | Indexes never hit since the last stats reset. Leave them until there is production load data over a longer window. |
| INFO | `auth_db_connections_absolute` | 1 | Auth server pinned at 10 connections; switch to percentage if the instance is ever resized. |

## 6. Row counts (for a sense of scale)

| Table | Rows | Table | Rows |
|---|---|---|---|
| `igi_shelf_snapshots` | ~831 | `agent_commissions` | ~249 |
| `drafts` | ~629 | `igi_visit_lines` | ~218 |
| `documents` | ~599 | `igi_certificate_out_sync` | ~199 |
| `clients` | ~593 | `igi_descriptions` | ~177 |
| `email_deliveries` | ~139 | `igi_models` | ~98 |
| `profiles` | ~48 | `events` | ~38 |

Everything else is under 100 rows. This is a small database; none of the
performance findings is urgent.
