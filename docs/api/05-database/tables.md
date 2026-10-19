# Tables reference

All 43 tables of the `public` schema, read from the live project on 5 October
2026 and grouped by domain. For each table: what it is for, then the exact
columns. "Null" is whether the column may be NULL. Allowed values come from
`CHECK` constraints; there are no enum types.

Conventions that apply everywhere:

- Primary keys are `uuid` with `gen_random_uuid()` unless stated.
- `created_at` is `timestamptz DEFAULT now()`. `updated_at` is maintained by a
  trigger only where [functions-and-triggers.md](functions-and-triggers.md) says so.
- `*_by` columns reference `profiles.id` and are audit columns (who did it).
- Soft deletes use `deleted_at` (`documents`, `organizations`,
  `organization_memberships`, `organization_invitations`) or
  `profiles.agent_deleted_at`. "Active" means the column is NULL.
- Row counts are approximate (`pg_class.reltuples`) and only there to give a
  sense of scale.

Foreign keys are listed as they exist live. `ON DELETE` actions are not exposed
by the catalogue query used; see the cascade section of
[functions-and-triggers.md](functions-and-triggers.md#foreign-keys-that-cascade).

## Domain map

| Domain | Tables |
|---|---|

| Identity and access | `allowed_emails`, `audit_state`, `event_access`, `pending_signups`, `profiles` |
| Organizations | `organization_invitations`, `organization_memberships`, `organizations` |
| Events | `events` |
| Documents and orders | `consignment_contacts`, `documents`, `drafts` |
| Clients | `clients` |
| Agents and commissions | `agent_commissions`, `agent_folder_files`, `agent_folders`, `agent_payments`, `commission_reports` |
| Reports | `saved_reports` |
| Packs | `pack_fairs`, `pack_hidden`, `pack_pinned`, `pack_visibility`, `packs` |
| Fair assistant | `fair_batches`, `fair_email_drafts`, `fair_images`, `fair_leads`, `fair_saved_templates` |
| Email | `email_deliveries` |
| Health | `system_health_events` |
| IGI certificates | `igi_batches`, `igi_certificate_in_sync`, `igi_certificate_out_sync`, `igi_counts`, `igi_descriptions`, `igi_digest_sends`, `igi_invoices`, `igi_models`, `igi_receipts`, `igi_shelf_snapshots`, `igi_visit_lines`, `igi_visits` |


---

## Identity and access

### `allowed_emails`

The login allowlist for internal staff and agents. `isUserAllowed()` lets a user in if their email is here (or they are an agent / IGI account). Approving a signup request or inviting an agent inserts a row; deleting an agent removes it.

_Rows at time of writing: about 50. RLS: enabled._

**Primary key:** `id`  
**Foreign keys:** `added_by` → `profiles.id`  

| Column | Type | Null | Default | Allowed values / check |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `email` | text | no |  |  |
| `added_by` | uuid | yes |  |  |
| `created_at` | timestamptz | yes | now() |  |

### `audit_state`

A single JSON row (`id = 'mapig-audit'`) created by hand in production for an external audit tool. No application route reads or writes it.

_Rows at time of writing: about 1. RLS: enabled._

**Primary key:** `id`  

| Column | Type | Null | Default | Allowed values / check |
|---|---|---|---|---|
| `id` | text | no | 'mapig-audit' |  |
| `data` | jsonb | no | '{}' |  |
| `updated_at` | timestamptz | no | now() |  |

### `event_access`

Per-event sharing grants. `permission` is `read`, `edit` or `manage` (ranked). Matched in RLS on `user_email = auth.email()`, in code on `user_id`. Commercial assistants get their fairs through rows here.

_Rows at time of writing: about 13. RLS: enabled._

**Primary key:** `id`  
**Foreign keys:** `granted_by` → `auth.users.id`; `event_id` → `events.id`; `user_id` → `auth.users.id`  

| Column | Type | Null | Default | Allowed values / check |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `user_email` | text | no |  |  |
| `event_id` | uuid | no |  |  |
| `created_at` | timestamptz | yes | now() |  |
| `user_id` | uuid | yes |  |  |
| `granted_by` | uuid | yes |  |  |
| `permission` | text | no | 'read' |  |

### `pending_signups`

Self-service access requests from the login page. The `token` is embedded in the approve / reject links emailed to admins.

_Rows at time of writing: about 5. RLS: enabled._

**Primary key:** `id`  

| Column | Type | Null | Default | Allowed values / check |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `email` | text | no |  |  |
| `full_name` | text | no |  |  |
| `token` | uuid | no | gen_random_uuid() |  |
| `status` | text | no | 'pending' | pending, approved, rejected |
| `created_at` | timestamptz | yes | now() |  |

### `profiles`

One row per user, same `id` as `auth.users`. Created by the application (not a trigger) on first login or invite. `role` is `admin` or `member`; everything else is a flag: `is_agent` (+ `agent_status`, commission settings, `agent_deleted_at` soft delete), `is_assistant`, `is_igi`. `organization_id` is the denormalised primary team. `agent_commission_config` is the structured commission scheme (flat / tiered / category / complex). `has_password_set` gates the forced set-password screen.

_Rows at time of writing: about 48. RLS: enabled._

**Primary key:** `id`  
**Foreign keys:** `id` → `auth.users.id`; `organization_id` → `organizations.id`  

| Column | Type | Null | Default | Allowed values / check |
|---|---|---|---|---|
| `id` | uuid | no |  |  |
| `email` | text | no |  |  |
| `full_name` | text | yes |  |  |
| `avatar_url` | text | yes |  |  |
| `role` | text | yes | 'member' | admin, member |
| `created_at` | timestamptz | yes | now() |  |
| `is_agent` | boolean | yes | false |  |
| `agent_status` | text | yes |  | invited, active, paused, inactive (nullable) |
| `commission_rate` | numeric | yes | 0 | commission_rate >= 0 AND commission_rate <= 100 |
| `agent_since` | timestamptz | yes |  |  |
| `agent_conditions` | text | yes |  |  |
| `agent_phone` | text | yes |  |  |
| `agent_company` | text | yes |  |  |
| `agent_country` | text | yes |  |  |
| `agent_city` | text | yes |  |  |
| `agent_region` | text | yes |  |  |
| `agent_territory` | text | yes |  |  |
| `agent_specialty` | text | yes |  |  |
| `agent_notes` | text | yes |  |  |
| `agent_deleted_at` | timestamptz | yes |  |  |
| `agent_contract_url` | text | yes |  |  |
| `has_password_set` | boolean | yes | false |  |
| `organization_id` | uuid | yes |  |  |
| `agent_commission_config` | jsonb | yes |  |  |
| `updated_at` | timestamptz | yes | now() |  |
| `new_client_bonus_enabled` | boolean | no | false |  |
| `new_client_bonus_amount` | numeric | yes |  | new_client_bonus_amount IS NULL OR new_client_bonus_amount >= 0 |
| `drive_folder_id` | text | yes |  |  |
| `new_client_bonus_mode` | text | no | 'off' | off, manual, auto |
| `is_assistant` | boolean | yes | false |  |
| `is_igi` | boolean | yes | false |  |
| `agent_language` | text | yes |  |  |


---

## Organizations

### `organization_invitations`

Token-based invitation of an email into an organization. `accepted_at` set on accept; `expires_at` enforced by the accept route (410).

_Rows at time of writing: about 0. RLS: enabled._

**Primary key:** `id`  
**Foreign keys:** `organization_id` → `organizations.id`; `invited_by` → `profiles.id`  

| Column | Type | Null | Default | Allowed values / check |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `organization_id` | uuid | no |  |  |
| `email` | text | no |  |  |
| `role` | text | no | 'member' | owner, member |
| `invited_by` | uuid | yes |  |  |
| `token` | text | no |  |  |
| `expires_at` | timestamptz | no |  |  |
| `accepted_at` | timestamptz | yes |  |  |
| `created_at` | timestamptz | no | now() |  |
| `updated_at` | timestamptz | no | now() |  |
| `deleted_at` | timestamptz | yes |  |  |

### `organization_memberships`

Who belongs to which organization and as what (`owner` or `member`). Soft-deleted with `deleted_at`; "active" always means `deleted_at IS NULL`. Unique per `(organization_id, user_id)`.

_Rows at time of writing: about 20. RLS: enabled._

**Primary key:** `id`  
**Foreign keys:** `user_id` → `profiles.id`; `organization_id` → `organizations.id`  

| Column | Type | Null | Default | Allowed values / check |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `organization_id` | uuid | no |  |  |
| `user_id` | uuid | no |  |  |
| `role` | text | no | 'member' | owner, member |
| `created_at` | timestamptz | no | now() |  |
| `updated_at` | timestamptz | no | now() |  |
| `deleted_at` | timestamptz | yes |  |  |

### `organizations`

Partner companies / agent teams. `commission_rate` is the fallback rate for members without their own. Soft-deleted with `deleted_at`.

_Rows at time of writing: about 12. RLS: enabled._

**Primary key:** `id`  
**Foreign keys:** `created_by` → `profiles.id`  

| Column | Type | Null | Default | Allowed values / check |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `name` | text | no |  |  |
| `territory` | text | yes |  |  |
| `created_by` | uuid | yes |  |  |
| `created_at` | timestamptz | no | now() |  |
| `updated_at` | timestamptz | no | now() |  |
| `deleted_at` | timestamptz | yes |  |  |
| `commission_rate` | numeric | yes | NULL | commission_rate IS NULL OR commission_rate >= 0 AND commission_rate <= 100 |
| `conditions` | text | yes |  |  |


---

## Events

### `events`

Folders. `type='fair'` is a trade fair, `type='agent'` is an agent's personal folder (one per agent per organization, enforced by `events_agent_name_org_unique`), `partner` and `other` are catch-alls. `organization_id` links a folder to a team.

_Rows at time of writing: about 38. RLS: enabled._

**Primary key:** `id`  
**Foreign keys:** `created_by` → `profiles.id`; `organization_id` → `organizations.id`  

| Column | Type | Null | Default | Allowed values / check |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `name` | text | no |  |  |
| `location` | text | yes |  |  |
| `start_date` | date | yes |  |  |
| `end_date` | date | yes |  |  |
| `created_by` | uuid | yes |  |  |
| `created_at` | timestamptz | yes | now() |  |
| `type` | text | no | 'other' | fair, agent, partner, other |
| `organization_id` | uuid | yes |  |  |
| `updated_at` | timestamptz | yes | now() |  |


---

## Documents and orders

### `consignment_contacts`

People (not users) to whom goods are consigned when the recipient is not an agent. Referenced from `documents.metadata.consignment` by id.

_Rows at time of writing: about 4. RLS: enabled._

**Primary key:** `id`  
**Foreign keys:** `created_by` → `profiles.id`  

| Column | Type | Null | Default | Allowed values / check |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `full_name` | text | no |  |  |
| `company` | text | yes |  |  |
| `phone` | text | yes |  |  |
| `email` | text | yes |  |  |
| `address` | text | yes |  |  |
| `notes` | text | yes |  |  |
| `created_at` | timestamptz | no | now() |  |
| `created_by` | uuid | yes |  |  |

### `documents`

The central table: every quote and order. The PDF lives in the `documents` bucket at `file_path`; everything the order form captured (lines, client, totals, shipping, consignment details, email status) is in `metadata` (jsonb). `created_by` is who typed it, `agent_id` is who gets the commission. `order_channel` decides whether it counts as revenue (`b2b`, `b2c`) or not (`internal`, `consignment`, `delete_from_stock`; `sample` is legacy). `status='draft'` parks an order with no side effects; `draft_kind='offre'` marks a formal offer. Soft-deleted with `deleted_at`; `activity_at` is bumped only on user re-edits and drives list ordering.

_Rows at time of writing: about 599. RLS: enabled._

**Primary key:** `id`  
**Foreign keys:** `created_by` → `profiles.id`; `consignment_agent_id` → `profiles.id`; `agent_id` → `profiles.id`; `event_id` → `events.id`  

| Column | Type | Null | Default | Allowed values / check |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `event_id` | uuid | yes |  |  |
| `client_name` | text | no |  |  |
| `client_company` | text | yes |  |  |
| `document_type` | text | no |  | quote, order |
| `file_path` | text | no |  |  |
| `file_name` | text | no |  |  |
| `file_size` | integer | yes |  |  |
| `total_amount` | numeric | yes |  |  |
| `created_by` | uuid | yes |  |  |
| `metadata` | jsonb | yes | '{}' |  |
| `created_at` | timestamptz | yes | now() |  |
| `deleted_at` | timestamptz | yes |  |  |
| `order_channel` | text | no | 'b2b' | b2b, b2c, internal, consignment, delete_from_stock, sample |
| `consignment_agent_id` | uuid | yes |  |  |
| `updated_at` | timestamptz | yes | now() |  |
| `status` | text | no | 'sent' | draft, sent |
| `draft_kind` | text | yes |  | draft_kind IS NULL OR draft_kind = 'offre' |
| `agent_id` | uuid | yes |  |  |
| `activity_at` | timestamptz | yes | now() |  |

### `drafts`

Autosave of the order form, keyed by `(user_id, company_name)`. Not to be confused with `documents.status = 'draft'`. `form_state` is the whole React form state.

_Rows at time of writing: about 629. RLS: enabled._

**Primary key:** `id`  
**Foreign keys:** `user_id` → `auth.users.id`  

| Column | Type | Null | Default | Allowed values / check |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `user_id` | uuid | no |  |  |
| `company_name` | text | no |  |  |
| `form_state` | jsonb | no |  |  |
| `created_at` | timestamptz | yes | now() |  |
| `updated_at` | timestamptz | yes | now() |  |


---

## Clients

### `clients`

The shared client book used to auto-fill the order form. `source` distinguishes hand-entered clients from the one-off Salesforce import. `dzb_client_number` and `jeweler_group` (AUCUN / SYNALIA / MG / JOAILLIERS_ORFEVRES) drive the Synalia quarterly report. `vat` / `vat_valid` cache the last VIES check.

_Rows at time of writing: about 593. RLS: enabled._

**Primary key:** `id`  
**Foreign keys:** `created_by` → `profiles.id`  

| Column | Type | Null | Default | Allowed values / check |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `name` | text | yes |  |  |
| `company` | text | no |  |  |
| `country` | text | yes |  |  |
| `address` | text | yes |  |  |
| `city` | text | yes |  |  |
| `zip` | text | yes |  |  |
| `email` | text | yes |  |  |
| `phone` | text | yes |  |  |
| `vat` | text | yes |  |  |
| `vat_valid` | boolean | yes |  |  |
| `created_by` | uuid | yes |  |  |
| `created_at` | timestamptz | yes | now() |  |
| `updated_at` | timestamptz | yes | now() |  |
| `source` | text | no | 'manual' | manual, salesforce |
| `source_comment` | text | yes |  |  |
| `source_imported_at` | timestamptz | yes |  |  |
| `dzb_client_number` | text | yes |  |  |
| `jeweler_group` | text | yes |  |  |
| `shipping_same_as_billing` | boolean | yes | true |  |
| `shipping_address` | text | yes |  |  |
| `shipping_address_line2` | text | yes |  |  |
| `shipping_country` | text | yes |  |  |


---

## Agents and commissions

### `agent_commissions`

Commission ledger: one row per commission earned by an agent. `type='order'` rows are created automatically when an order is saved (or by hand as a *quick order* with `document_id = NULL` and a `client_label`); `type='new_client_bonus'` rows are the first-customer bonus; `type='bonus'` is a manual bonus. Lifecycle: `pending` → (customer pays: `customer_paid_at`) → (included in a report: `report_id`) → `paid` (`paid_at`), or `cancelled` when the order is trashed. The partial unique index `(agent_id, document_id, type) WHERE document_id IS NOT NULL` is what the code's `ON CONFLICT` targets.

_Rows at time of writing: about 249. RLS: enabled._

**Primary key:** `id`  
**Foreign keys:** `report_id` → `commission_reports.id`; `agent_id` → `profiles.id`; `document_id` → `documents.id`  

| Column | Type | Null | Default | Allowed values / check |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `agent_id` | uuid | no |  |  |
| `document_id` | uuid | yes |  |  |
| `type` | text | no | 'order' | order, bonus, new_client_bonus |
| `order_total` | numeric | yes | 0 |  |
| `commission_rate` | numeric | yes | 0 |  |
| `commission_amount` | numeric | no | 0 |  |
| `status` | text | no | 'pending' | pending, approved, paid, cancelled |
| `paid_at` | timestamptz | yes |  |  |
| `notes` | text | yes |  |  |
| `created_at` | timestamptz | yes | now() |  |
| `customer_paid_at` | timestamptz | yes |  |  |
| `client_label` | text | yes |  |  |
| `invoice_number` | text | yes |  |  |
| `report_id` | uuid | yes |  |  |

### `agent_folder_files`

Files uploaded into an agent's private folder tree (contracts, price lists, whatever an admin shares with one agent). The bytes live in the `documents` storage bucket under `file_path`.

_Rows at time of writing: about 0. RLS: enabled._

**Primary key:** `id`  
**Foreign keys:** `folder_id` → `agent_folders.id`; `uploaded_by` → `profiles.id`  

| Column | Type | Null | Default | Allowed values / check |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `folder_id` | uuid | no |  |  |
| `name` | text | no |  |  |
| `file_path` | text | no |  |  |
| `file_size` | bigint | yes |  |  |
| `uploaded_by` | uuid | yes |  |  |
| `created_at` | timestamptz | yes | now() |  |

### `agent_folders`

Hierarchical folders per agent (`parent_id` self-reference). Root folders are created when an agent is invited; `organization_id` lets a whole team share a tree.

_Rows at time of writing: about 28. RLS: enabled._

**Primary key:** `id`  
**Foreign keys:** `organization_id` → `organizations.id`; `parent_id` → `agent_folders.id`; `created_by` → `profiles.id`; `agent_id` → `profiles.id`  

| Column | Type | Null | Default | Allowed values / check |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `agent_id` | uuid | no |  |  |
| `name` | text | no |  |  |
| `parent_id` | uuid | yes |  |  |
| `created_by` | uuid | yes |  |  |
| `created_at` | timestamptz | yes | now() |  |
| `organization_id` | uuid | yes |  |  |

### `agent_payments`

Money actually paid out to an agent. A payment can settle a `commission_reports` row (`report_id`), in which case the report's commissions flip to `paid`. `invoice_number` is the agent's invoice to LoveLab.

_Rows at time of writing: about 5. RLS: enabled._

**Primary key:** `id`  
**Foreign keys:** `report_id` → `commission_reports.id`; `created_by` → `profiles.id`; `agent_id` → `profiles.id`  

| Column | Type | Null | Default | Allowed values / check |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `agent_id` | uuid | no |  |  |
| `amount` | numeric | no |  | amount > 0 |
| `payment_date` | timestamptz | no | now() |  |
| `notes` | text | yes |  |  |
| `created_by` | uuid | yes |  |  |
| `created_at` | timestamptz | yes | now() |  |
| `report_id` | uuid | yes |  |  |
| `invoice_number` | text | yes |  |  |

### `commission_reports`

One row per generated monthly commission report (an `.xlsx` in the `commission-reports` bucket, copied to Google Drive, emailed to the office). `period_key` is `YYYY-MM`. `snapshot_data` freezes the figures at generation time. Commissions included in the report point back via `agent_commissions.report_id`.

_Rows at time of writing: about 12. RLS: enabled._

**Primary key:** `id`  
**Foreign keys:** `triggered_by` → `auth.users.id`; `agent_id` → `profiles.id`  

| Column | Type | Null | Default | Allowed values / check |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `agent_id` | uuid | no |  |  |
| `period_start` | timestamptz | no |  |  |
| `period_end` | timestamptz | no |  |  |
| `period_label` | text | no |  |  |
| `period_key` | text | no |  |  |
| `total_due` | numeric | no | 0 |  |
| `order_count` | integer | no | 0 |  |
| `bonus_count` | integer | no | 0 |  |
| `loose_b2c_count` | integer | no | 0 |  |
| `storage_path` | text | yes |  |  |
| `drive_file_id` | text | yes |  |  |
| `drive_view_link` | text | yes |  |  |
| `email_recipient` | text | yes |  |  |
| `email_message_id` | text | yes |  |  |
| `email_sent_at` | timestamptz | yes |  |  |
| `email_error` | text | yes |  |  |
| `status` | text | no | 'generated' | generated, sent, failed, archived |
| `triggered_by` | uuid | yes |  |  |
| `trigger_source` | text | no | 'manual' | manual, cron |
| `snapshot_data` | jsonb | yes |  |  |
| `notes` | text | yes |  |  |
| `created_at` | timestamptz | no | now() |  |
| `updated_at` | timestamptz | no | now() |  |


---

## Reports

### `saved_reports`

User-saved report configurations for the Reports page (`entity_type` + a `config` blob).

_Rows at time of writing: about 2. RLS: enabled._

**Primary key:** `id`  
**Foreign keys:** `user_id` → `profiles.id`  

| Column | Type | Null | Default | Allowed values / check |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `user_id` | uuid | no |  |  |
| `name` | text | no |  |  |
| `entity_type` | text | no |  | documents, commissions, clients, events |
| `config` | jsonb | no | '{}' |  |
| `created_at` | timestamptz | yes | now() |  |
| `updated_at` | timestamptz | yes | now() |  |


---

## Packs

### `pack_fairs`

Which fairs a pack is filed under, with a per-fair `sort_order`. Shared by everyone.

_Rows at time of writing: about 48. RLS: enabled._

**Primary key:** `pack_id`, `event_id`  
**Foreign keys:** `pack_id` → `packs.id`; `added_by` → `profiles.id`; `event_id` → `events.id`  

| Column | Type | Null | Default | Allowed values / check |
|---|---|---|---|---|
| `pack_id` | uuid | no |  |  |
| `event_id` | uuid | no |  |  |
| `sort_order` | integer | no | 0 |  |
| `added_by` | uuid | yes |  |  |
| `created_at` | timestamptz | no | now() |  |

### `pack_hidden`

Per-user list of packs hidden from their builder.

_Rows at time of writing: about 29. RLS: enabled._

**Primary key:** `pack_id`, `user_id`  
**Foreign keys:** `pack_id` → `packs.id`; `user_id` → `profiles.id`  

| Column | Type | Null | Default | Allowed values / check |
|---|---|---|---|---|
| `pack_id` | uuid | no |  |  |
| `user_id` | uuid | no |  |  |
| `created_at` | timestamptz | no | now() |  |

### `pack_pinned`

Per-user list of pinned packs.

_Rows at time of writing: about 1. RLS: enabled._

**Primary key:** `pack_id`, `user_id`  
**Foreign keys:** `pack_id` → `packs.id`; `user_id` → `profiles.id`  

| Column | Type | Null | Default | Allowed values / check |
|---|---|---|---|---|
| `pack_id` | uuid | no |  |  |
| `user_id` | uuid | no |  |  |
| `created_at` | timestamptz | no | now() |  |

### `pack_visibility`

For `scope='restricted'` packs: the agents allowed to see the pack.

_Rows at time of writing: about 22. RLS: enabled._

**Primary key:** `pack_id`, `agent_id`  
**Foreign keys:** `agent_id` → `profiles.id`; `pack_id` → `packs.id`  

| Column | Type | Null | Default | Allowed values / check |
|---|---|---|---|---|
| `pack_id` | uuid | no |  |  |
| `agent_id` | uuid | no |  |  |

### `packs`

Pre-built orders with a fixed total (≥ €970). `form_rows` holds the lines in the order form's own shape. `scope`: `global` (everyone), `private` (owner + admins), `restricted` (listed agents). `is_seed` marks the catalogue packs that cannot be deleted by their owner. An Excel template is generated per pack in the `pack-templates` bucket.

_Rows at time of writing: about 20. RLS: enabled._

**Primary key:** `id`  
**Foreign keys:** `created_by` → `profiles.id`  

| Column | Type | Null | Default | Allowed values / check |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `label` | text | no |  |  |
| `description` | ARRAY | yes | '{}'[] |  |
| `budget_label` | text | yes |  |  |
| `fixed_total` | numeric | no |  | fixed_total >= 970 |
| `form_rows` | jsonb | no |  |  |
| `scope` | text | no |  | global, private, restricted |
| `created_by` | uuid | yes |  |  |
| `is_seed` | boolean | yes | false |  |
| `created_at` | timestamptz | yes | now() |  |
| `updated_at` | timestamptz | yes | now() |  |
| `sort_order` | integer | yes | 1000000 |  |


---

## Fair assistant

### `fair_batches`

Fair assistant: one batch per fair visit. Holds the outreach template (headline, paragraphs, sign-off, buttons, attachments, per-lead-type variants) and running totals. `status` tracks the pipeline from `uploading` to `complete`.

_Rows at time of writing: about 6. RLS: enabled._

**Primary key:** `id`  
**Foreign keys:** `event_id` → `events.id`; `created_by` → `profiles.id`  

| Column | Type | Null | Default | Allowed values / check |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `event_id` | uuid | yes |  |  |
| `name` | text | no |  |  |
| `fair_name` | text | yes |  |  |
| `status` | text | no | 'uploading' | uploading, extracting, extracted, drafting, generating, sending, complete, failed, stuck |
| `template_id` | text | no | 'generic' |  |
| `headline` | text | yes |  |  |
| `paragraph1` | text | yes |  |  |
| `paragraph2` | text | yes |  |  |
| `signoff` | text | yes | (((('Warm regards,' || '\n') || 'Alberto Saleh') || '\n') || 'LoveLab Antwerp') |  |
| `total_images` | integer | no | 0 |  |
| `total_leads` | integer | no | 0 |  |
| `total_sent` | integer | no | 0 |  |
| `total_failed` | integer | no | 0 |  |
| `created_by` | uuid | yes |  |  |
| `created_at` | timestamptz | no | now() |  |
| `updated_at` | timestamptz | no | now() |  |
| `cta_line` | text | yes |  |  |
| `attached_files` | jsonb | no | '[]' |  |
| `custom_html` | text | yes |  |  |
| `button1_label` | text | yes |  |  |
| `button1_url` | text | yes |  |  |
| `button2_label` | text | yes |  |  |
| `button2_url` | text | yes |  |  |
| `subject` | text | yes |  |  |
| `agent_subject` | text | yes |  |  |
| `agent_headline` | text | yes |  |  |
| `agent_paragraph1` | text | yes |  |  |
| `agent_paragraph2` | text | yes |  |  |
| `agent_signoff` | text | yes |  |  |
| `partner_subject` | text | yes |  |  |
| `partner_headline` | text | yes |  |  |
| `partner_paragraph1` | text | yes |  |  |
| `partner_paragraph2` | text | yes |  |  |
| `partner_signoff` | text | yes |  |  |

### `fair_email_drafts`

Fair assistant: one translated, personalised email per lead (`lead_id` unique). `status` runs `pending` → `generating` → `draft_ready` → `sending` → `sent` / `failed`. `message_id` is Resend's id; `delivery_status`, `opened_at`, `clicked_at` mirror `email_deliveries`.

_Rows at time of writing: about 32. RLS: enabled._

**Primary key:** `id`  
**Foreign keys:** `batch_id` → `fair_batches.id`; `lead_id` → `fair_leads.id`  

| Column | Type | Null | Default | Allowed values / check |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `batch_id` | uuid | no |  |  |
| `lead_id` | uuid | no |  |  |
| `subject` | text | yes |  |  |
| `body_html` | text | yes |  |  |
| `language` | text | yes |  |  |
| `status` | text | no | 'pending' | pending, generating, draft_ready, sending, sent, failed |
| `error` | text | yes |  |  |
| `sent_at` | timestamptz | yes |  |  |
| `created_at` | timestamptz | no | now() |  |
| `updated_at` | timestamptz | no | now() |  |
| `message_id` | text | yes |  |  |
| `delivery_status` | text | yes |  |  |
| `delivery_error` | text | yes |  |  |
| `opened_at` | timestamptz | yes |  |  |
| `clicked_at` | timestamptz | yes |  |  |

### `fair_images`

Fair assistant: one row per photographed business card, stored in the Google Drive inbox (`drive_file_id`). n8n updates `status` through the callback.

_Rows at time of writing: about 48. RLS: enabled._

**Primary key:** `id`  
**Foreign keys:** `batch_id` → `fair_batches.id`  

| Column | Type | Null | Default | Allowed values / check |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `batch_id` | uuid | no |  |  |
| `drive_file_id` | text | yes |  |  |
| `file_name` | text | yes |  |  |
| `status` | text | no | 'pending' | pending, processing, processed, failed |
| `error` | text | yes |  |  |
| `created_at` | timestamptz | no | now() |  |
| `updated_at` | timestamptz | no | now() |  |

### `fair_leads`

Fair assistant: a contact extracted from a card by n8n (a card can yield several). `lead_hash` makes callbacks idempotent (unique per batch). `language` drives translation; `lead_type` picks the template variant.

_Rows at time of writing: about 34. RLS: enabled._

**Primary key:** `id`  
**Foreign keys:** `batch_id` → `fair_batches.id`; `image_id` → `fair_images.id`  

| Column | Type | Null | Default | Allowed values / check |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `batch_id` | uuid | no |  |  |
| `image_id` | uuid | yes |  |  |
| `first_name` | text | yes |  |  |
| `last_name` | text | yes |  |  |
| `company` | text | yes |  |  |
| `email` | text | yes |  |  |
| `phone` | text | yes |  |  |
| `mobile_phone` | text | yes |  |  |
| `title` | text | yes |  |  |
| `country` | text | yes |  |  |
| `language` | text | yes |  |  |
| `language_label` | text | yes |  |  |
| `street` | text | yes |  |  |
| `city` | text | yes |  |  |
| `state` | text | yes |  |  |
| `postal_code` | text | yes |  |  |
| `salesforce_id` | text | yes |  |  |
| `salesforce_url` | text | yes |  |  |
| `lead_hash` | text | yes |  |  |
| `status` | text | no | 'extracted' | extracted, ready, sent, failed |
| `error` | text | yes |  |  |
| `sent_at` | timestamptz | yes |  |  |
| `created_at` | timestamptz | no | now() |  |
| `updated_at` | timestamptz | no | now() |  |
| `lead_type` | text | no | 'shop' | shop, agent, partner, other |

### `fair_saved_templates`

Fair assistant: reusable outreach templates an admin saved, per `lead_type`.

_Rows at time of writing: about 0. RLS: enabled._

**Primary key:** `id`  
**Foreign keys:** `created_by` → `profiles.id`  

| Column | Type | Null | Default | Allowed values / check |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `name` | text | no |  |  |
| `lead_type` | text | no | 'shop' | shop, agent, partner, other |
| `headline` | text | yes |  |  |
| `paragraph1` | text | yes |  |  |
| `paragraph2` | text | yes |  |  |
| `signoff` | text | yes |  |  |
| `cta_line` | text | yes |  |  |
| `created_by` | uuid | yes |  |  |
| `created_at` | timestamptz | no | now() |  |
| `updated_at` | timestamptz | no | now() |  |


---

## Email

### `email_deliveries`

One row per email handed to Resend (`resend_id` unique). Updated by the Resend webhook and the daily sweep with the delivery outcome, bounce reason, opens and clicks. Linked to the order (`document_id`) or the fair-assistant draft (`draft_id`) it belongs to.

_Rows at time of writing: about 139. RLS: enabled._

**Primary key:** `id`  
**Foreign keys:** `draft_id` → `fair_email_drafts.id`; `document_id` → `documents.id`  

| Column | Type | Null | Default | Allowed values / check |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `resend_id` | text | no |  |  |
| `kind` | text | no |  | order_confirmation, fair_outreach, internal_notice, price_list_announcement, other |
| `document_id` | uuid | yes |  |  |
| `draft_id` | uuid | yes |  |  |
| `recipient` | text | yes |  |  |
| `subject` | text | yes |  |  |
| `status` | text | no | 'sent' | sent, delivered, delivery_delayed, bounced, complained, failed, suppressed, unknown |
| `detail` | text | yes |  |  |
| `advice` | text | yes |  |  |
| `bounce_type` | text | yes |  |  |
| `bounce_subtype` | text | yes |  |  |
| `sent_at` | timestamptz | no | now() |  |
| `last_event_at` | timestamptz | yes |  |  |
| `checked_at` | timestamptz | yes |  |  |
| `created_at` | timestamptz | no | now() |  |
| `updated_at` | timestamptz | no | now() |  |
| `opened_at` | timestamptz | yes |  |  |
| `clicked_at` | timestamptz | yes |  |  |
| `open_count` | integer | no | 0 |  |
| `click_count` | integer | no | 0 |  |


---

## Health

### `system_health_events`

Operational alerts raised by the code (bounced email, ghost commission, schema drift, failed ERP sync…). `alerted_at` records when admins were emailed; `resolved_at` / `resolved_note` close it.

_Rows at time of writing: about 54. RLS: enabled._

**Primary key:** `id`  
**Foreign keys:** `resolved_by` → `profiles.id`  

| Column | Type | Null | Default | Allowed values / check |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `source` | text | no |  |  |
| `severity` | text | no |  | info, warn, error, critical |
| `message` | text | no |  |  |
| `context` | jsonb | no | '{}' |  |
| `alerted_at` | timestamptz | yes |  |  |
| `resolved_at` | timestamptz | yes |  |  |
| `resolved_by` | uuid | yes |  |  |
| `resolved_note` | text | yes |  |  |
| `created_at` | timestamptz | no | now() |  |


---

## IGI certificates

### `igi_batches`

IGI module: a production batch IGI recorded ("we made 50 of model X on this date"). Append-only; adds to IGI's pool.

_Rows at time of writing: about 76. RLS: enabled._

**Primary key:** `id`  
**Foreign keys:** `model_id` → `igi_models.id`; `created_by` → `profiles.id`  

| Column | Type | Null | Default | Allowed values / check |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `model_id` | uuid | no |  |  |
| `qty` | integer | no |  | qty > 0 |
| `batch_date` | date | no |  |  |
| `reference` | text | yes |  |  |
| `note` | text | yes |  |  |
| `created_at` | timestamptz | no | now() |  |
| `created_by` | uuid | yes |  |  |

### `igi_certificate_in_sync`

IGI module: mirror of the ERP's *Certificate In* rows (certificates arriving on LoveLab's shelf), refreshed every 10 minutes. `erp_in_id` unique. Shelf = `shelf_opening` + In − Out.

_Rows at time of writing: about 86. RLS: enabled._

**Primary key:** `id`  
**Foreign keys:** `model_id` → `igi_models.id`  

| Column | Type | Null | Default | Allowed values / check |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `erp_in_id` | bigint | no |  |  |
| `invoice_no` | text | yes |  |  |
| `in_date` | date | yes |  |  |
| `party` | text | yes |  |  |
| `description` | text | yes |  |  |
| `pcs` | numeric | yes |  |  |
| `remark` | text | yes |  |  |
| `source` | text | yes |  |  |
| `external_ref` | text | yes |  |  |
| `model_id` | uuid | yes |  |  |
| `serial` | text | yes |  |  |
| `payload` | jsonb | yes |  |  |
| `synced_at` | timestamptz | no | now() |  |
| `created_at` | timestamptz | no | now() |  |

### `igi_certificate_out_sync`

IGI module: mirror of the ERP's *Certificate Out* rows (certificates leaving with a sold piece). `erp_out_id` unique.

_Rows at time of writing: about 199. RLS: enabled._

**Primary key:** `id`  
**Foreign keys:** `model_id` → `igi_models.id`  

| Column | Type | Null | Default | Allowed values / check |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `erp_out_id` | bigint | no |  |  |
| `invoice_no` | text | yes |  |  |
| `out_date` | date | yes |  |  |
| `party` | text | yes |  |  |
| `description` | text | yes |  |  |
| `pcs` | numeric | yes |  |  |
| `remark` | text | yes |  |  |
| `source` | text | yes |  |  |
| `external_ref` | text | yes |  |  |
| `model_id` | uuid | yes |  |  |
| `serial` | text | yes |  |  |
| `payload` | jsonb | yes |  |  |
| `synced_at` | timestamptz | no | now() |  |
| `created_at` | timestamptz | no | now() |  |

### `igi_counts`

IGI module: a stock count IGI entered on their portal, stored as a delta (`delta = counted − was`, never zero). Append-only; corrects IGI's pool.

_Rows at time of writing: about 39. RLS: enabled._

**Primary key:** `id`  
**Foreign keys:** `model_id` → `igi_models.id`; `created_by` → `profiles.id`  

| Column | Type | Null | Default | Allowed values / check |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `model_id` | uuid | no |  |  |
| `was` | integer | no |  | was >= 0 |
| `counted` | integer | no |  | counted >= 0 |
| `delta` | integer | no |  | delta <> 0 |
| `note` | text | yes |  |  |
| `counted_at` | timestamptz | no | now() |  |
| `created_by` | uuid | yes |  |  |

### `igi_descriptions`

IGI module: every distinct stock description seen in the ERP, with the model it maps to and a `kind` (certificate / packaging / in_house / ignore). Only `certificate` rows may carry a `model_id`.

_Rows at time of writing: about 177. RLS: enabled._

**Primary key:** `id`  
**Foreign keys:** `model_id` → `igi_models.id`; `linked_by` → `profiles.id`  

| Column | Type | Null | Default | Allowed values / check |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `description` | text | no |  |  |
| `model_id` | uuid | yes |  |  |
| `kind` | text | no | 'certificate' | certificate, packaging, in_house, ignore |
| `first_seen_at` | timestamptz | no | now() |  |
| `last_seen_at` | timestamptz | yes |  |  |
| `linked_by` | uuid | yes |  |  |

### `igi_digest_sends`

IGI module: idempotency log for the scheduled emails (`morning` to Liuba, `igi_weekly` to IGI, `order` to Alberto). Primary key `(kind, sent_on)` guarantees at most one send per kind per day.

_Rows at time of writing: about 0. RLS: enabled._

**Primary key:** `kind`, `sent_on`  

| Column | Type | Null | Default | Allowed values / check |
|---|---|---|---|---|
| `kind` | text | no |  | morning, igi_weekly, order |
| `sent_on` | date | no |  |  |
| `sent_at` | timestamptz | no | now() |  |
| `recipients` | ARRAY | no | '{}'[] |  |
| `subject` | text | yes |  |  |

### `igi_invoices`

IGI module: what IGI invoiced for a month (`period_month`, unique), beside the `basis` LoveLab uses to check it (received / issued / requested counts).

_Rows at time of writing: about 0. RLS: enabled._

**Primary key:** `id`  
**Foreign keys:** `recorded_by` → `profiles.id`  

| Column | Type | Null | Default | Allowed values / check |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `period_month` | date | no |  |  |
| `igi_reference` | text | yes |  |  |
| `igi_total_eur` | numeric | yes |  | igi_total_eur IS NULL OR igi_total_eur >= 0 |
| `basis` | text | no | 'received' | received, issued, requested |
| `note` | text | yes |  |  |
| `recorded_by` | uuid | yes |  |  |
| `created_at` | timestamptz | no | now() |  |
| `updated_at` | timestamptz | no | now() |  |

### `igi_models`

IGI module: a certificate model identified by its LGAJ `serial` (unique, immutable once set). `state`: `in_use`, `reserved` (serial reserved before production) or `awaiting_serial` (LoveLab asked for a new model, IGI has not numbered it). `shelf_min` / `order_min` are alert levels; `shelf_opening` is the opening balance for the shelf formula. The `igi_models_guard` trigger enforces the lifecycle.

_Rows at time of writing: about 98. RLS: enabled._

**Primary key:** `id`  
**Foreign keys:** `numbered_by` → `profiles.id`; `requested_by` → `profiles.id`  

| Column | Type | Null | Default | Allowed values / check |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `serial` | text | yes |  |  |
| `serial_full` | text | yes |  |  |
| `name` | text | no |  |  |
| `igi_name` | text | yes |  |  |
| `stones` | text | yes |  |  |
| `carat` | numeric | yes |  |  |
| `shape` | text | yes |  |  |
| `spec` | text | yes |  |  |
| `state` | text | no | 'in_use' | in_use, reserved, awaiting_serial |
| `qty_ordered` | integer | yes |  | qty_ordered IS NULL OR qty_ordered >= 0 |
| `shelf_min` | integer | no | 25 | shelf_min >= 0 |
| `pool_min` | integer | yes |  | pool_min IS NULL OR pool_min >= 0 |
| `sort_order` | integer | yes |  |  |
| `created_at` | timestamptz | no | now() |  |
| `updated_at` | timestamptz | no | now() |  |
| `requested_by` | uuid | yes |  |  |
| `requested_at` | timestamptz | yes |  |  |
| `numbered_by` | uuid | yes |  |  |
| `numbered_at` | timestamptz | yes |  |  |
| `order_min` | integer | yes |  | order_min IS NULL OR order_min >= 0 |
| `shelf_alerted_at` | timestamptz | yes |  |  |
| `order_alerted_at` | timestamptz | yes |  |  |
| `shelf_opening` | integer | yes |  | shelf_opening IS NULL OR shelf_opening >= 0 |

### `igi_receipts`

IGI module: idempotent record of each *Certificate In* pushed to the ERP when a visit is received (`reference` unique). Failed pushes are retried by the 10-minute cron.

_Rows at time of writing: about 5. RLS: enabled._

**Primary key:** `id`  
**Foreign keys:** `visit_id` → `igi_visits.id`  

| Column | Type | Null | Default | Allowed values / check |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `visit_id` | uuid | no |  |  |
| `reference` | text | no |  |  |
| `status` | text | no | 'pending' | pending, applied, failed |
| `posted_at` | timestamptz | yes |  |  |
| `response` | jsonb | yes |  |  |
| `created_at` | timestamptz | no | now() |  |

### `igi_shelf_snapshots`

IGI module: nightly (and 10-minutely) snapshot of the ERP's certificate stock per description, used for history charts and to seed `shelf_opening`.

_Rows at time of writing: about 831. RLS: enabled._

**Primary key:** `id`  
**Foreign keys:** `model_id` → `igi_models.id`  

| Column | Type | Null | Default | Allowed values / check |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `snapshot_date` | date | no |  |  |
| `description` | text | no |  |  |
| `total_pcs` | integer | no |  | total_pcs >= 0 |
| `model_id` | uuid | yes |  |  |
| `captured_at` | timestamptz | no | now() |  |

### `igi_visit_lines`

IGI module: one line per model in a visit: `qty_requested` by LoveLab, `qty_issued` by IGI, `qty_received` by LoveLab. Unique per `(visit_id, model_id)`. Cannot be deleted while the model exists (RESTRICT).

_Rows at time of writing: about 218. RLS: enabled._

**Primary key:** `id`  
**Foreign keys:** `visit_id` → `igi_visits.id`; `model_id` → `igi_models.id`  

| Column | Type | Null | Default | Allowed values / check |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `visit_id` | uuid | no |  |  |
| `model_id` | uuid | no |  |  |
| `qty_requested` | integer | no |  | qty_requested >= 0 |
| `qty_issued` | integer | yes |  | qty_issued IS NULL OR qty_issued >= 0 |
| `qty_received` | integer | yes |  | qty_received IS NULL OR qty_received >= 0 |

### `igi_visits`

IGI module: a *movement* of certificates from IGI to LoveLab. `status` runs `requested` → `issued` (IGI recorded what they made) → `closed` (LoveLab received). `visit_no` is a human-readable sequence. `correction` marks adjustment visits.

_Rows at time of writing: about 35. RLS: enabled._

**Primary key:** `id`  
**Foreign keys:** `issued_by` → `profiles.id`; `created_by` → `profiles.id`; `received_by` → `profiles.id`  

| Column | Type | Null | Default | Allowed values / check |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `visit_no` | integer | no |  |  |
| `visit_date` | date | no |  |  |
| `status` | text | no | 'requested' | requested, issued, closed |
| `requested_at` | timestamptz | yes |  |  |
| `issued_at` | timestamptz | yes |  |  |
| `closed_at` | timestamptz | yes |  |  |
| `unattributed_total` | integer | yes |  | unattributed_total IS NULL OR unattributed_total >= 0 |
| `date_suspect` | boolean | no | false |  |
| `note` | text | yes |  |  |
| `created_at` | timestamptz | no | now() |  |
| `created_by` | uuid | yes |  |  |
| `issued_by` | uuid | yes |  |  |
| `received_by` | uuid | yes |  |  |
| `correction` | boolean | no | false |  |
| `notified_at` | timestamptz | yes |  |  |
| `notify_error` | text | yes |  |  |
