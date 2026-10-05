# Row Level Security policies

Every table in `public` has RLS **enabled** (none is forced, so the `postgres`
superuser and the service role bypass it). The policies below were read from the
live project `hnmydfafjghtrsrzpbtm` on 5 October 2026 (`pg_policies`), not from the
migration files, so this is what actually applies today.

Two things to keep in mind when reading them:

1. **Most API routes use the service-role client** (`lib/supabase/server.js`
   admin client), which bypasses RLS entirely. For those routes the *route code*
   is the access control, not the policy. RLS matters for the browser client
   (anon key + user session) and for any direct PostgREST access.
2. All policies are `PERMISSIVE`, so for a given command the user gets access if
   **any** policy for that command passes. Where a table has a `true` policy
   (`documents`, `clients`, `audit_state`) that policy wins over the stricter ones
   beside it. See [schema-health.md](schema-health.md#rls-policies-that-are-wider-than-they-look).

Helper functions used in policies (all `SECURITY DEFINER`, see
[functions-and-triggers.md](functions-and-triggers.md)):

| Function | True when |
|---|---|
| `is_admin()` | `profiles.role = 'admin'` for `auth.uid()` |
| `is_agent()` | `profiles.is_agent = true AND agent_status = 'active'` |
| `is_igi()` | `profiles.is_igi = true` |
| `is_active_org_member(org_id)` | caller has a non-deleted `organization_memberships` row for that org |
| `shares_active_org_with(user)` | caller and `user` are both non-deleted members of at least one common organization |

---

## Identity and access tables

### `profiles`
| Cmd | Policy | Who |
|---|---|---|
| SELECT | Profile access | own row only (`id = auth.uid()`) |
| INSERT | Enable insert for authenticated users | own row only |
| UPDATE | Users can update own profile | own row only |

No admin policy: admins read other profiles through the service role in API
routes, never through the browser client.

### `allowed_emails`
| SELECT | Authenticated users can view allowed emails | any signed-in user |

Writes go through the service role (approve-signup flow).

### `pending_signups`
| ALL | Admins can manage pending signups | `profiles.role = 'admin'` |

### `event_access`
| ALL | Admins manage event_access | `is_admin()` |
| SELECT | Users can read own event_access | `user_email = auth.email()` or admin |

### `audit_state`
| SELECT | Allow public read | **everyone, including anon** |
| INSERT / UPDATE | Authenticated users can insert/update audit_state | any signed-in user |

---

## Organizations

### `organizations`
| INSERT | Authenticated users can create organizations | any signed-in user |
| SELECT | Members and admins can view organizations | active member of the org, or admin |
| UPDATE | Org owners and admins can update organizations | membership `role = 'owner'`, or admin |
| DELETE | Only admins can delete organizations | admin |

### `organization_memberships`
| SELECT | Org members can view memberships in their org | active member of the same org, or admin |
| INSERT | Org owners and admins can insert memberships | owner of that org, or admin |
| UPDATE | Org owners, admins, or self can update memberships | the member themself, an owner, or admin |
| DELETE | Org owners and admins can delete memberships | owner, or admin |

### `organization_invitations`
| SELECT | Org members and invitees can view invitations | active member of the org, the invited email, or admin |
| INSERT | Org owners and admins can create invitations | owner, or admin |
| UPDATE | Invitees can update their own invitations | the invited email (used by accept), or admin |
| DELETE | Org owners and admins can delete invitations | owner, or admin |

---

## Events, documents, clients, drafts

### `events`
| SELECT | Role-based event access | creator, admin, or anyone listed in `event_access` for that event (matched on `user_email = auth.email()`) |
| SELECT | Org members can view team events | event belongs to an org the caller is an active member of, or the creator shares an org with the caller |
| INSERT | Role-based event insert | `created_by = auth.uid()` |
| UPDATE / DELETE | Role-based event update / delete | creator or admin |

### `documents`
| SELECT | **Allow public read** | **`true`, role `public` (includes anon)** |
| SELECT | Role-based document access | not deleted AND (creator, admin, or `event_access` on its event) |
| SELECT | Org members can view team documents | not deleted AND (creator shares an org with caller, or the document's event is in an org the caller is a member of) |
| INSERT | Role-based document insert | `created_by = auth.uid()` |
| UPDATE / DELETE | Role-based document update / delete | creator or admin |

Because of the first row, the two careful SELECT policies are currently
redundant for anyone holding the anon key. The app itself always goes through
`/api/documents/*` with the service role and applies the visibility rules in
`lib/documentAccess.js`, so the UI behaves correctly, but the database alone
does not enforce it. Flagged in [schema-health.md](schema-health.md).

### `clients`
| SELECT | **Allow anon read clients** | **role `anon`, `true`** |
| SELECT | Authenticated users can read all clients | any signed-in user |
| SELECT | Users can view own clients | creator (redundant with the row above) |
| INSERT | Authenticated users can insert clients | any signed-in user |
| INSERT | Users can create own clients | `created_by = auth.uid()` |
| UPDATE | Users can update own clients / Users can update their own clients (duplicate pair) | creator |
| DELETE | Users can delete own clients / Users can delete their own clients (duplicate pair) | creator |

Nine policies, several duplicated by name. The intended model is "every
signed-in user can read the shared client book, only the creator edits". The
anon read policy is almost certainly a leftover.

### `drafts` (autosaved order-form state)
| SELECT / INSERT / UPDATE / DELETE | Users can … own drafts | `auth.uid() = user_id` |

### `consignment_contacts`
| ALL | Admin full access on consignment_contacts | admin |

---

## Agents, commissions, reports

### `agent_commissions`
| SELECT | Commission select access | the agent (`agent_id = auth.uid()`) or admin |
| INSERT / UPDATE / DELETE | Admin commission insert / update / delete | admin |

### `agent_payments`
| SELECT | Agents can view their own payments | the agent or admin |
| ALL | Admins can manage agent payments | admin |

### `commission_reports`
| ALL | commission_reports_admin_all | `profiles.role = 'admin'` (inline subquery, not `is_admin()`) |

### `saved_reports`
| ALL | Users can manage their own reports | `user_id = auth.uid()` |
| SELECT | Admins can view all reports | admin |

### `agent_folders` / `agent_folder_files`
| ALL | Admins full access … | admin |
| ALL | Agents access own folders / own folder files | `agent_id = auth.uid()` (files: via the parent folder's `agent_id`) |

---

## Packs

### `packs`
| SELECT | packs_select | `scope = 'global'`, or creator, or admin, or (`scope = 'restricted'` and caller listed in `pack_visibility`) |
| INSERT | packs_insert | `scope = 'private'` and creator = caller; or `scope in ('global','restricted')` and admin |
| UPDATE | packs_update | admin or creator |
| DELETE | packs_delete | admin, or (creator and `is_seed = false`) |

### `pack_visibility`
| SELECT | pack_visibility_select | the listed agent or admin |
| INSERT / DELETE | pack_visibility_insert / delete | admin |

### `pack_fairs`
| SELECT / INSERT / UPDATE / DELETE | pack_fairs_* | **any authenticated user** (`true`) |

### `pack_hidden`, `pack_pinned`
| SELECT / INSERT / DELETE | pack_hidden_* / pack_pinned_* | own rows only (`user_id = auth.uid()`) |

---

## Fair assistant

All five tables are **admin only**:

| Table | Policy |
|---|---|
| `fair_batches` | Admin fair_batches access (ALL, `is_admin()`) |
| `fair_images` | Admin fair_images access |
| `fair_leads` | Admin fair_leads access |
| `fair_email_drafts` | Admin fair_email_drafts access |
| `fair_saved_templates` | fair_saved_templates_admin_all |

The n8n callbacks write through the service role, authenticated by the shared
`X-Fair-Auth` secret, not by a Supabase user.

---

## Email deliveries and health

| Table | Policy | Who |
|---|---|---|
| `email_deliveries` | Admin email_deliveries access (ALL) | admin |
| `system_health_events` | Admin can read / update system health | admin (SELECT, UPDATE). Inserts come from the service role. |

---

## IGI certificate module

Admins have `ALL` on every `igi_*` table ("Admin full access on …"). IGI
accounts (`is_igi()`) get a deliberately narrow set so that the IGI portal can
work with the user's own session:

| Table | IGI may |
|---|---|
| `igi_models` | SELECT rows in state `in_use` or `awaiting_serial`; UPDATE a row only to move it from `awaiting_serial` to `in_use` with a non-null `serial` (the "number a new model" action) |
| `igi_visits` | SELECT all; UPDATE a visit only from `requested` to `issued` ("record what they made") |
| `igi_visit_lines` | SELECT all; UPDATE lines whose visit is still `requested` ("set the quantity made") |
| `igi_batches` | SELECT, INSERT |
| `igi_counts` | SELECT, INSERT |
| `igi_descriptions`, `igi_shelf_snapshots`, `igi_receipts`, `igi_invoices`, `igi_digest_sends`, `igi_certificate_in_sync`, `igi_certificate_out_sync` | nothing (admin only) |

The `igi_models_guard` trigger adds further protection on top of these policies
(a serial can never change once set, and state only ever moves *into* `in_use`).

---

## Storage policies (`storage.objects`)

| Bucket | Policy | Who |
|---|---|---|
| `documents` | Allow authenticated uploads / downloads / updates / deletes | any authenticated user, any path in the bucket |
| `commission-reports` | commission_reports_bucket_admin_select / insert / update / delete | `profiles.role = 'admin'` |
| `pack-templates` | *(no policies in `storage.objects`)* | service role only |

See [storage.md](storage.md) for how each bucket is used.
