# Database layer

Supabase project **LoveLab Order form** (`hnmydfafjghtrsrzpbtm`, region
eu-west-1, Postgres 17.6). One schema in use: `public`, 43 tables, no views, no
enums, no Edge Functions. Auth is Supabase Auth (`auth.users`); files are in
Supabase Storage (three private buckets).

| Page | What you will find |
|---|---|
| [tables.md](tables.md) | Every table, its purpose and every column, grouped by domain |
| [rls-policies.md](rls-policies.md) | Every Row Level Security policy in plain English, as it applies live |
| [functions-and-triggers.md](functions-and-triggers.md) | SQL functions (`is_admin()` and friends, `get_agent_stats()`, `revoke_user_sessions()`), triggers, cascade rules |
| [storage.md](storage.md) | The three buckets, what is stored where, signed URL lifetimes |
| [migrations.md](migrations.md) | Where the SQL lives, how to apply a change, order of application on an empty database |
| [schema-health.md](schema-health.md) | Drift between code and database, advisor findings, policies to tighten |

## How the data fits together

```
auth.users ──1:1── profiles ──┬── organization_memberships ── organizations
   (Supabase Auth)   (role, flags)│                                  │
                                  ├── event_access ──── events ◄─────┘ (organization_id)
                                  │   (read/edit/manage)   │ type: fair | agent | partner | other
                                  │                        │
                                  ├── documents ◄──────────┘ (event_id)
                                  │   (quotes & orders, PDF in storage, metadata jsonb)
                                  │        │
                                  │        └── agent_commissions ──► commission_reports ◄── agent_payments
                                  │             (order / bonus / new_client_bonus)
                                  │
                                  ├── clients (shared address book)
                                  ├── drafts (order-form autosave)
                                  ├── packs ── pack_visibility / pack_fairs / pack_hidden / pack_pinned
                                  ├── agent_folders ── agent_folder_files
                                  └── saved_reports

fair_batches ── fair_images ── fair_leads ── fair_email_drafts ──► email_deliveries ◄── documents
                                                                   (Resend outcomes)

igi_models ──┬── igi_batches, igi_counts            (IGI's pool)
             ├── igi_visit_lines ── igi_visits ── igi_receipts   (movements IGI → LoveLab)
             ├── igi_descriptions, igi_shelf_snapshots           (ERP stock labels & snapshots)
             └── igi_certificate_in_sync / _out_sync             (ERP mirror)   igi_invoices, igi_digest_sends

system_health_events, pending_signups, allowed_emails, audit_state
```

## The three access paths into the database

1. **Browser, anon key + user session.** Used only for authentication
   (`lib/supabase/client.js`) and the Fair Assistant realtime subscription.
   RLS applies.
2. **API route, anon key + cookies** (`createClient()` in
   `lib/supabase/server.js`). RLS applies. Used for `auth.getUser()`
   everywhere, and for data in a handful of routes: `drafts`, `reports`,
   `packs/[id]/hidden|pinned`, `organizations/invitations`,
   `documents/upload` (storage) and the whole IGI portal (`/api/igi-portal/*`),
   where RLS **is** the security boundary.
3. **API route, service role** (`createAdminClient()`). Bypasses RLS. Used by
   roughly 170 files. Authorization is done in JavaScript before the query
   (`app/api/_lib/access.js`, `lib/organizations/authz.js`,
   `lib/fair-assistant/server.js`). This is the normal path.

Consequence for anyone changing the schema: **a new RLS policy does not protect
a route that uses the service role.** Put the check in the route (or in the
shared helpers) as well.

## Conventions

- `uuid` primary keys from `gen_random_uuid()`; every timestamp is `timestamptz`.
- Allowed values are `CHECK (col = ANY(ARRAY[...]))` on `text` columns, never enums.
  The full list per column is in [tables.md](tables.md).
- Soft delete over hard delete for business data (`deleted_at`,
  `agent_deleted_at`, `status = 'cancelled'`).
- Idempotency through unique keys (`email_deliveries.resend_id`,
  `igi_receipts.reference`, `fair_leads (batch_id, lead_hash)`,
  `agent_commissions (agent_id, document_id, type)`, `documents.metadata.save_request_id`).
- Money is `numeric` in euros; quantities are `integer`.
- JSON blobs (`documents.metadata`, `drafts.form_state`, `packs.form_rows`,
  `profiles.agent_commission_config`, `commission_reports.snapshot_data`) are
  owned by the JavaScript that writes them; the database does not validate them.
