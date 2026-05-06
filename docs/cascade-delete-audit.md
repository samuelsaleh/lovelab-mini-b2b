# Cascade-delete & soft-delete audit

Phase 0.3 of the Agent Commission Resilience plan.

Maps every "delete" path in the system, what it does to dependent rows, and
whether that behaviour is correct. The Marc / UFS bug ("ghost commission after
deleting the order") is gap row 2 below.

## How deletes happen in this app

The codebase mixes three delete patterns. They behave very differently:

1. **Hard delete** — `delete().eq('id', x)`. The row is gone; FK ON DELETE
   rules apply.
2. **Soft delete** — `update({ deleted_at: now() })`. The row stays in the
   table; FK ON DELETE rules **do not** fire; dependent tables must be cleaned
   up by the application.
3. **Application-level cascade** — explicit follow-up `update`/`delete` on
   related tables, written in the API route. This is what we are missing in
   most places.

## Inventory

| Entity | Delete path | Pattern | Cascades to | Gap |
|--------|-------------|---------|-------------|-----|
| `documents` | `app/api/documents/[id]/route.js` DELETE (line 228) | Soft (`deleted_at`) | **Nothing.** `agent_commissions.document_id` FK has `ON DELETE CASCADE` but the FK never fires for soft delete. | **Gap 1 — primary cause of the Marc/UFS ghost commission.** When a doc is soft-deleted the linked `agent_commissions` row stays in `pending`. |
| `documents` | `app/api/documents/[id]/restore/route.js` POST | Soft restore | **Nothing.** | **Gap 2.** When we add Gap 1's fix (set commission to `cancelled`), restore must flip it back to `pending`. |
| `documents` | `app/api/documents/[id]/purge/route.js` DELETE | Hard | `agent_commissions` (CASCADE), storage object | OK on the DB side. |
| `documents` | `app/api/consignment/reconcile/route.js` line 143 | Hard `delete()` on the dummy invoice | `agent_commissions` (CASCADE) | OK. |
| `agent_commissions` | (no explicit user-facing delete) | — | — | OK. Only purged via FK cascade or admin SQL. |
| `events` | `app/api/events/[id]/route.js` DELETE | Hard | `documents.event_id` -> SET NULL; `event_access` -> CASCADE; `agent_commissions` is unaffected (correct: commissions belong to docs, not events). | OK but check what happens to docs whose only event link is now NULL — they remain visible to creator + admin via RLS. Acceptable. |
| `profiles` (agent soft-delete) | `app/api/agents/[id]/route.js` DELETE non-permanent (line 317) | Soft (`agent_deleted_at`, `agent_status='inactive'`) | **Nothing.** | **Gap 3.** Pending commissions for a soft-deleted agent are still counted in admin totals + still attempted to be paid. We need a daily reconciliation job (Phase 17 cron) that flags these. |
| `profiles` (agent permanent) | same file, lines 287–306 | Field wipe (not row delete) | `agent_commissions` keeps the agent_id (now points at a profile that's no longer an agent). FK is intact. | OK by design — the comment says "Commission history preserved". But the admin `/agents` list will no longer show this person, so old commissions become orphaned in the UI. **Gap 4.** Add a "former agents" view or include these in the agent payouts ledger. |
| `profiles` (full row delete) | not exposed via UI; only auth.users cascade | Hard (rare) | `agent_commissions` (CASCADE) → real commission data is destroyed. | **Gap 5.** If we ever expose a hard-delete (or auth.users cascades), commission history is permanently lost. Recommend changing `agent_commissions.agent_id` FK from `ON DELETE CASCADE` to `ON DELETE SET NULL` and adding `agent_email_snapshot text` for traceability. Defer to a later phase — not blocking commission resilience today. |
| `organizations` | `app/api/organizations/[id]/route.js` DELETE | Likely hard | `organization_memberships` (CASCADE), `organization_invitations` (CASCADE), `profiles.organization_id` -> NULL (no explicit FK action), `events.organization_id` -> SET NULL (no explicit FK action). | **Gap 6.** Ambiguity: when `profiles.organization_id` and `events.organization_id` were added (in `supabase/migrations/`), no `ON DELETE` was specified, so they default to `NO ACTION`. If anyone tries to delete an organization with linked profiles, the delete will fail. Confirm in the drift run; if not present, add `ON DELETE SET NULL` in Phase 0.5. |
| `agent_folders` | `app/api/agent-folders/[id]/route.js` DELETE | Hard | `agent_folder_files` (CASCADE), child folders (CASCADE) | OK. |

## Required fixes — included in the resilience plan

### Fix 1 — `documents` soft-delete must cancel commission

File: `app/api/documents/[id]/route.js` DELETE handler.

After the soft-delete update, also:

```js
await adminSupabase
  .from('agent_commissions')
  .update({ status: 'cancelled', notes: 'Auto-cancelled because the linked document was deleted.' })
  .eq('document_id', id)
  .neq('status', 'paid');
```

`paid` rows must never be cancelled by an automated path; if the order was
deleted after payment, an admin handles the refund manually.

### Fix 2 — `documents` restore must un-cancel commission

File: `app/api/documents/[id]/restore/route.js`.

After the `deleted_at: null` update:

```js
await adminSupabase
  .from('agent_commissions')
  .update({ status: 'pending' })
  .eq('document_id', id)
  .eq('status', 'cancelled');
```

### Fix 3 — daily commission/agent reconciliation cron

Phase 17. Cron job runs `scripts/reconcile-commissions.mjs` once a day:

- Set `status='cancelled'` on commissions whose document is soft-deleted but
  whose status is still `pending`/`approved`. (Catches anything Fix 1 missed.)
- Log a health event when an agent has `agent_deleted_at IS NOT NULL` but
  pending commissions remain — admin must decide whether to pay or void.

### Fix 4 — UI: include orphaned/former-agent commissions in the ledger

Out of scope for the immediate commission-resilience milestone. Tracked
separately so payouts to ex-agents are still visible.

### Fix 5 — defer FK hardening for `agent_commissions.agent_id`

Out of scope for the immediate milestone. Schema change requires a backup
+ data migration.

### Fix 6 — confirm/repair `organizations` delete behaviour

Run the drift report (Phase 0.1c). If FKs default to `NO ACTION`, add a
phase-numbered migration in Phase 0.5 that aligns them with the intent
(`ON DELETE SET NULL` for `profiles.organization_id` and
`events.organization_id`).

## Tests

- Add Jest test in `app/api/__tests__/documents-delete-cascades.test.js`
  (new file) that asserts:
  - Soft-deleting a document with a `pending` commission flips status to
    `cancelled`.
  - Soft-deleting a document with a `paid` commission leaves it untouched.
  - Restoring a document flips `cancelled` back to `pending`.
- Manual end-to-end check in Vercel preview before promoting to prod.
