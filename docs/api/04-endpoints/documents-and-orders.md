# Documents and orders

A *document* is a quote or an order: a PDF in the `documents` bucket plus a row
in `public.documents` whose `metadata` holds everything the order form captured.
Visibility rules: [../02-authentication.md](../02-authentication.md#3-document-visibility).
Table: [../05-database/tables.md](../05-database/tables.md#documents).

| Method | Path | Auth | RL | Purpose |
|---|---|---|---|---|
| GET | `/api/documents` | S | 60 | List (paginated, role-scoped) |
| POST | `/api/documents` | S + `edit` on the folder | 30 | Save a new document after upload |
| GET | `/api/documents/[id]` | S + read | 60 | One document |
| PUT | `/api/documents/[id]` | S + edit | 20 | Full re-save (re-edit flow) |
| PATCH | `/api/documents/[id]` | S + edit | 30 | Partial update |
| DELETE | `/api/documents/[id]` | S + edit | 20 | Trash (soft delete) |
| POST | `/api/documents/[id]/restore` | S + edit | 20 | Un-trash |
| DELETE | `/api/documents/[id]/purge` | S + edit | 20 | Hard delete row + file |
| PATCH | `/api/documents/[id]/synalia` | A | 60 | Set jeweler group |
| PATCH | `/api/documents/bulk-file` | A | 30 | File up to 200 orders into a folder |
| GET | `/api/documents/preview` | S + read | 60 | Signed URL for the PDF |
| POST | `/api/documents/upload` | S | 20 | Upload the PDF |
| POST | `/api/documents/send-email` | S + read | 20 | Email the order to the client |
| GET | `/api/drafts` | S | 60 | Order-form autosave |
| POST | `/api/drafts` | S | 60 | Save autosave |
| DELETE | `/api/drafts` | S | 30 | Remove autosave |

## The save flow, end to end

1. The builder renders the PDF in the browser (`lib/pdf.js`).
2. `POST /api/documents/upload` (multipart) stores it at
   `documents/<userId>/<sanitised path>.pdf` and returns `filePath`.
3. `POST /api/documents` stores the row with that `file_path` and the whole
   form state in `metadata`. This is where the side effects happen (below).
4. Optionally `POST /api/documents/send-email` emails the PDF to the client.

Re-editing an existing order repeats 1–3 with `PUT /api/documents/[id]`, which
replaces the file and bumps `activity_at`.

### Side effects of saving an order (`POST`, `PUT`)

| Effect | Condition | Where |
|---|---|---|
| Filed into the agent's folder | creator or `agent_id` is an agent and no `event_id` given | `lib/events/ensure-agent-folder.js` |
| Commission row | `document_type = 'order'`, `status = 'sent'`, channel `b2b`/`b2c`, an agent is attributed | `lib/commissionAttribution.js`, `lib/commission.js` |
| New-client bonus | agent has `new_client_bonus_mode = 'auto'` and the client company is new for them | `lib/newClientBonus.js` |
| Internal order notice email | every saved / updated / emailed order | `lib/orderNotices.js` → `ORDER_NOTIFICATION_EMAILS` + `EXTRA_ORDER_NOTIFICATION_EMAILS` |
| ERP sync | `order_channel = 'consignment'` (consignment-order/store) or `'delete_from_stock'` (gift-lost-order/store) | `lib/lovelab-sync.js`, background, failure recorded as a health event |
| Nothing | `status = 'draft'` | promoting a draft to `sent` later fires all of the above once |

---

### `GET /api/documents`

Query parameters (all optional):

| Param | Meaning |
|---|---|
| `event_id` | only this folder |
| `organization_id` | only this team's documents (caller must be a member or admin, else 403) |
| `scope=mine` | admins: only my own instead of everything |
| `created_by_agent` | admins: documents created by one agent (resolved across same-email ids) |
| `search` | free text over client name, company, file name (`lib/documentSearch.js`) |
| `trashed=1` | only soft-deleted rows |
| `order_channel` | `b2b`, `b2c`, `internal`, `consignment`, `delete_from_stock`. **Without it, the non-revenue channels are hidden.** |
| `status` | `draft` or `sent` |
| `draft_kind` | `offre` or `none` |
| `summary=1` | lighter rows (no metadata) for dashboards |
| `page`, `per_page` | default 50, max 200 (500 for consignment lists) |

Response:

```json
{
  "documents": [
    {
      "id": "…", "event_id": "…", "client_name": "Bijouterie X", "client_company": "X SA",
      "document_type": "order", "file_path": "…/x.pdf", "file_name": "Order X 2026-10-05.pdf",
      "file_size": 184233, "total_amount": 2480, "order_channel": "b2b",
      "status": "sent", "draft_kind": null, "agent_id": "…", "created_by": "…",
      "created_at": "…", "updated_at": "…", "activity_at": "…", "deleted_at": null,
      "metadata": { "lines": [ … ], "client": { … }, "shipping": { … }, "email": { "status": "delivered" }, "…": "…" },
      "event": { "id": "…", "name": "Inhorgenta 2026", "type": "fair" },
      "creator": { "id": "…", "full_name": "…", "email": "…" },
      "agent": { "id": "…", "full_name": "…" },
      "email_delivery": { "status": "delivered", "opened_at": "…" }
    }
  ],
  "total_count": 143, "page": 1, "per_page": 50
}
```

Sorted by `activity_at desc`. Scope per role is described on the
authentication page; an admin sees everything, an agent their own and credited
documents plus their team's, an assistant their fairs.

### `POST /api/documents`

```json
{
  "event_id": "uuid | null",
  "client_name": "required",
  "client_company": "optional",
  "document_type": "quote | order",
  "file_path": "from /upload (required unless admin)",
  "file_name": "required",
  "file_size": 184233,
  "total_amount": 2480,
  "order_channel": "b2b | b2c | internal | consignment | delete_from_stock",
  "status": "sent | draft",
  "draft_kind": "offre | null",
  "agent_id": "uuid | null | \"no_agent\"",
  "consignment_agent_id": "uuid | null",
  "metadata": { "save_request_id": "client uuid", "…": "≤ 100 KB" }
}
```

Rules: `client_name`, `document_type`, `file_name` required (400). The caller
needs `edit` on `event_id` or the event must belong to one of their
organizations (403). Assistants must give an `event_id`. Consignment orders need
`metadata.consignment.recipient_type` of `agent` or `contact` and a valid
`return_date`. `metadata` over 100 KB is refused. A repeated
`metadata.save_request_id` returns the existing row with
`idempotent_replay: true` instead of inserting.

Response `200 { "document": { … } }` (also 200 on replay).

### `GET /api/documents/[id]`

`{ "document": { … } }` with the same embeds as the list. 404 if not visible
to you.

### `PUT /api/documents/[id]`

Same body as `POST`. Replaces the PDF (removes the old object), rewrites
`metadata`, bumps `activity_at`, recalculates the commission and bonus
(`lib/commissionRecalc.js`), handles `draft → sent` promotion, honours
`agent_id: "no_agent"` to detach the order from any agent (commission cancelled),
and sends the order notice. Admin-only fields: `draft_kind`, `order_channel`.

### `PATCH /api/documents/[id]`

Partial: any of `file_name`, `event_id` (move folder), `metadata` (shallow
merge), `consignment_agent_id`, `agent_id`, `order_channel` (admin only).
Refreshes the commission if the attribution changed.

### `DELETE /api/documents/[id]`  →  trash

Sets `deleted_at`; cancels its non-paid commissions (status `cancelled`). The
file stays. `{ "ok": true }`.

### `POST /api/documents/[id]/restore`

Clears `deleted_at`, un-cancels commissions. 400 if the document is not in the
trash.

### `DELETE /api/documents/[id]/purge`

Deletes the row and the storage object (both the stored path and the
owner-scoped fallback path). Commissions go with the row (FK cascade).

### `PATCH /api/documents/[id]/synalia`  (A)

```json
{ "jewelerGroup": "AUCUN | SYNALIA | MG | JOAILLIERS_ORFEVRES" }
```

or the legacy `{ "synalia": true }`. Writes `metadata.jewelerGroup`; used by
the quarterly Synalia report.

### `PATCH /api/documents/bulk-file`  (A)

```json
{ "ids": ["…", "…"], "event_id": "uuid | null" }
```

Up to 200 ids. Moves the orders into the folder (or unfiles with `null`),
skipping drafts and trashed rows, then refreshes their commissions.

```json
{ "event": { … }, "updated_count": 12, "updated_ids": [ … ],
  "skipped": [ { "id": "…", "reason": "draft" } ], "not_found": [ … ],
  "commissions_refreshed": 12 }
```

### `GET /api/documents/preview?id=<uuid>`

`{ "signedUrl": "https://…supabase.co/storage/v1/object/sign/…" }`, valid 5
minutes. Legacy `?path=` is still accepted for old links. Needs read access.

### `POST /api/documents/upload`

`multipart/form-data`: `file` (PDF, ≤ 25 MB, checked by magic bytes),
`filePath` (relative, sanitised). Uploaded with the **user's own session**, so
the bucket's authenticated-insert policy applies. Returns
`{ "data": { … }, "filePath": "<userId>/<path>" }`. 400 on a bad type, 413 over
size.

### `POST /api/documents/send-email`  (`runtime = nodejs`)

```json
{
  "documentId": "required", "to": "client@shop.be", "lang": "fr | en | nl",
  "contactName": "…", "subject": "…", "greeting": "…", "bodyText": "…",
  "questions": "…", "signoff": "…",
  "driveIntro": "…", "driveLabel": "…", "driveUrl": "https://…"
}
```

Attaches the PDF (and the catalogue if the total stays under Resend's size
limit), BCCs the office and admins, records the send in `email_deliveries`
(`kind = 'order_confirmation'`), mirrors the status into `metadata.email`, and
sends the internal "Order emailed to client" notice. `503` when
`RESEND_API_KEY` is missing, `502` when Resend rejects it (and an admin is
alerted). Response `{ "sent": true, "id": "<resend id>" }`.

## Autosave drafts (`drafts` table, not `documents.status = 'draft'`)

The order form saves its state every few seconds per company name so a crash
or tab close loses nothing. RLS-bound (own rows only).

| Call | Body / query | Returns |
|---|---|---|
| `GET /api/drafts?company=X` | | `{ "draft": { "id", "company_name", "form_state", "updated_at" } \| null }` |
| `GET /api/drafts` | | `{ "drafts": [ … up to 50 … ] }` |
| `POST /api/drafts` | `{ "company_name": "X", "form_state": { … } }` | upsert on `(user_id, company_name)`; `{ "draft": { … } }` |
| `DELETE /api/drafts?id=…` or `?company=…` | | `{ "ok": true }` |
