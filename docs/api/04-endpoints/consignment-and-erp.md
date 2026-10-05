# Consignment and the LoveLab ERP

**Consignment**: goods handed to an agent (`documents.consignment_agent_id`)
or to a contact (`consignment_contacts`) to sell on LoveLab's behalf. The order
is a `documents` row with `order_channel = 'consignment'` and the details in
`metadata.consignment` (`recipient_type`, `return_date`, `returned_at`,
`reconciliation`). It is not revenue and earns no commission until reconciled.

**ERP**: the Laravel system at `LOVELAB_API_URL`
(`https://software.lovelab-antwerp.com/api`). `lib/lovelab-sync.js` pushes
consignment orders (`consignment-order/store`, `/return`), undoes returns, and
pushes write-offs (`gift-lost-order/store`) for `delete_from_stock` orders.
Calls are fire-and-forget from the document save; failures become health events.

| Method | Path | Auth | RL | Purpose |
|---|---|---|---|---|
| GET | `/api/consignment/my` | S | 60 | My consignment orders (as recipient agent) |
| POST | `/api/consignment/reconcile` | A | none | Close a consignment: invoice the sold items, return the rest |
| GET | `/api/consignment-contacts` | A | 60 | Contacts |
| POST | `/api/consignment-contacts` | A | 30 | Create (201) `{ "full_name", "company", "phone", "email", "address", "notes" }` |
| POST | `/api/lovelab-sync/undo-return` | A | 20 | Reverse a return in the ERP `{ "document_id" }`; 502 on ERP failure |
| GET | `/api/admin/out-memos?memo_type=&from=&to=&branch_id=` | A | 60 | ERP proxy: pending out-memos |
| GET | `/api/admin/out-memos/[invNo]` | A | 60 | ERP proxy: one memo |
| POST | `/api/admin/out-memos/party-type` | A | 30 | ERP proxy `{ "party", "memo_type": "Agent \| Party \| Internal" }` |

### `POST /api/consignment/reconcile`

```json
{ "order_id": "uuid of the consignment document",
  "reconciliation": [ { "row_no": 1, "sold": 2 }, { "row_no": 2, "sold": 0 } ],
  "client": { "companyName", "contactName", "email", "phone", "addressLine1", "addressLine2", "country", "vatNumber" },
  "sold_value": 1240 }
```

Creates a new `b2b` order document for the sold items (with commission for the
consignment agent), marks the consignment `returned_at`, and syncs both to the
ERP in the background. Idempotent: calling it again for the same `order_id`
returns the existing invoice. Response `{ "ok": true, "invoice_id": "uuid", "document": { …the updated consignment row… } }`.
Related helper: `lib/consignment.js`.
