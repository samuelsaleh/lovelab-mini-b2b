# Commissions, payouts and commission reports

Concepts: a **commission** (`agent_commissions`) is earned per order; it becomes
**ready** when the customer has paid (`customer_paid_at`), is **reported** when
included in a monthly report (`report_id`), and **paid** when a payout
(`agent_payments`) settles it. Lifecycle code: `lib/commission.js`,
`lib/commissionPaidOut.js`, `lib/organizations/settlement.js`.

| Method | Path | Auth | RL | Purpose |
|---|---|---|---|---|
| GET | `/api/commissions` | A, or agent (own) | 60 | Ledger + summary |
| POST | `/api/commissions` | A | 20 | Manual bonus or quick order |
| PUT | `/api/commissions` | A | 30 | Bulk status change (≤ 100) |
| PATCH | `/api/commissions/[id]` | A | 60 | Set `invoice_number` |
| DELETE | `/api/commissions/[id]` | A | 30 | Hard delete |
| PATCH | `/api/commissions/[id]/customer-paid` | A | 60 | Toggle customer paid |
| PATCH | `/api/commissions/customer-paid-bulk` | A | 30 | Same, ≤ 200 ids |
| PATCH | `/api/commissions/[id]/force-paid` | A | 60 | Mark paid without a payout row |
| PATCH | `/api/commissions/[id]/revert-paid` | A | 60 | Paid → pending |
| PATCH | `/api/commissions/[id]/reported` | A | 60 | Link / unlink from latest report |
| POST | `/api/commissions/new-client-bonus` | A | 30 | Grant the manual bonus |
| GET | `/api/agent-payments[?agent_id]` | S (own) / A | 30 | Payout ledger |
| POST | `/api/agent-payments` | A | 20 | Record a payout (settles a report) |
| PATCH | `/api/agent-payments/[id]` | A | 30 | Edit |
| DELETE | `/api/agent-payments/[id]` | A | 30 | Delete |
| GET | `/api/commission-reports` | A, or agent (own) | 60 | Report runs |
| POST | `/api/commission-reports/generate` | A or Cron | 10 | Build the Excel |
| DELETE | `/api/commission-reports/[id]` | A | 30 | Delete a run |
| GET | `/api/commission-reports/[id]/download` | A or owning agent | 60 | The xlsx |

---

### `GET /api/commissions`

Query: `agent_id` (admins), `status`, `page`, `per_page` (≤ 500).

```json
{ "commissions": [ { "id", "agent_id", "document_id", "type": "order", "order_total": 2480,
                     "commission_rate": 10, "commission_amount": 248, "status": "pending",
                     "customer_paid_at": null, "report_id": null, "paid_at": null,
                     "invoice_number": null, "client_label": null, "notes": null, "created_at": "…",
                     "document": { "client_company", "file_name", "event": { … } } } ],
  "summary": { "total_earned": 6980, "from_orders": 6480, "from_bonuses": 250, "from_new_client_bonus": 250,
               "pending_amount": 2100, "paid_amount": 4880, "order_count": 41, "bonus_count": 1, "new_client_bonus_count": 5,
               "ready_to_pay": 1240, "awaiting_customer": 860, "ready_to_pay_count": 9, "awaiting_customer_count": 6,
               "total_paid_out": 4880, "true_pending_balance": 2100 },
  "total_count": 57, "page": 1, "per_page": 100 }
```

### `POST /api/commissions`

```json
{ "agent_id": "required", "type": "bonus | order", "amount": 250,
  "amount_mode": "direct | order_total", "commission_rate": 10,
  "client_label": "Bijouterie Y (quick order)", "notes": "…",
  "status": "pending", "created_at": "2026-09-01", "customer_paid": true }
```

`type = 'bonus'`: a manual bonus of `amount`. `type = 'order'` with
`amount_mode = 'order_total'`: a **quick order**, a sale that has no document
(`document_id = null`, `client_label` shown instead), commission computed from
`commission_rate`. `201 { "commission": { … } }`.

### `PUT /api/commissions`

`{ "ids": [ … ], "status": "pending | approved | paid | cancelled", "notes": "…" }`
→ `{ "updated": 12 }`.

### Customer paid

`PATCH …/[id]/customer-paid { "paid": true }` sets or clears
`customer_paid_at`; a linked `new_client_bonus` row follows. Bulk variant takes
`{ "ids": [ … ], "paid": true }`. Payment-driven settlement means nothing is
payable before this flag.

### `force-paid`, `revert-paid`, `reported`

- `force-paid`: `status = 'paid'`, `paid_at = now()`, no payout row. 409 if
  already paid or cancelled.
- `revert-paid`: back to `pending`, `paid_at = null`; linked bonus follows.
- `reported { "reported": true | false }`: attach to / detach from the agent's
  most recent `commission_reports` row.

### `POST /api/commissions/new-client-bonus`

`{ "agent_id", "document_id" }` → grants the agent's configured bonus for that
order. 409 `{ "error", "reason" }` when it cannot, with `reason` one of
`document_not_found`, `document_deleted`, `no_customer_key` (no company name to
match on), `already_exists`, `not_first_order`.

### Payouts (`agent_payments`)

`POST /api/agent-payments`:

```json
{ "agent_id": "required", "amount": 1240, "payment_date": "2026-10-01",
  "notes": "…", "report_id": "uuid (optional)", "invoice_number": "AG-2026-09" }
```

With `report_id` the report is **settled** first: every commission on it is
marked `paid` with that `invoice_number`, then the payment row is written.
`{ "payment": { … }, "settled": { "count": 12, "total": 1240 } }`. 409 for a
multi-member organization unless the agent is its owner (team settlement goes
through the organization ledger). `PATCH` accepts `amount`, `notes`,
`payment_date`; `DELETE` removes the row (commissions are not reverted).

### Monthly commission reports

`POST /api/commission-reports/generate`:

```json
{ "agent_id": "uuid" | "organization_id": "uuid",   // one of them; omit both for all agents
  "month": "2026-09", "send_email": true, "upload_to_drive": true, "skip_if_empty": true }
```

Admin session, **or** the cron header (`x-vercel-cron-secret`) for the n8n
monthly call. Builds an `.xlsx` of the month's **customer-paid** commissions
(`lib/commissionReportService.js`), stores it in the `commission-reports`
bucket, copies it to Drive under `<root>/<YYYY-MM — Month YYYY>/<Agent> - <Month>.xlsx`
(`GOOGLE_DRIVE_COMMISSION_REPORTS_FOLDER_ID`), and emails it to
`dionne@love-lab.com` only (hard-coded; agents are never emailed). Commissions
included get `report_id`. Response `{ "mode": "agent", "period": { … }, "result": { "report": { … }, "drive": { … }, "email": { … } } }`
or `{ "mode": "all", "summary": { … }, "results": [ … ] }`. **The cron batch mode
(all agents from the cron header) is disabled** and returns `{ "disabled": true }`;
`maxDuration = 300`.

`GET /api/commission-reports?agent_id=&month=&limit=` → `{ "reports": [ … ] }`.
`DELETE …/[id]` removes the row and the storage object (Drive copy stays;
commissions lose their `report_id`). `GET …/[id]/download` streams the file
(`Content-Disposition: attachment`).

Set-up and n8n schedule: `n8n/SETUP.md`.
