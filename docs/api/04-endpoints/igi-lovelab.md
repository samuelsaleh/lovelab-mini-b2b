# IGI certificates: the LoveLab side

Background: LoveLab sells lab-grown diamond jewellery with an IGI certificate
per piece. IGI Antwerp (across the road) produces the certificates in batches
per *model*; LoveLab fetches them in *visits* and keeps them on a *shelf*; the
ERP records each certificate going out with a sold piece. This module keeps
both sides' stock honest and visible, one-sidedly: **IGI never sees LoveLab's
shelf**. Full rules: `docs/CERTIFICATE_ERP_SYNC.md`, `docs/igi-switch-on.md`.
Tables: the `igi_*` section of [../05-database/tables.md](../05-database/tables.md).

Formulas: IGI pool = Σ batches − Σ issued + Σ count deltas.
LoveLab shelf = `shelf_opening` + Σ Certificate In − Σ Certificate Out (from the ERP mirror).

Every route here is admin-only (`requireLoveLab`, RL 60 reads / 30 writes
unless noted) and answers 503 `{ "not_switched_on": true }` or
`{ "behind_the_app": true }` when the database is missing a table or column
(see [../03-conventions.md](../03-conventions.md#error-format)).

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/igi/overview` | Per model: shelf, IGI pool, asked-for, alert status; totals |
| GET | `/api/igi/daily` | Day-by-day history of certificates taken |
| GET | `/api/igi/descriptions` | ERP description → model mapping with latest counts |
| PATCH | `/api/igi/descriptions` | `{ "description", "model_id" \| "kind": "certificate \| packaging \| in_house \| ignore" }` |
| GET | `/api/igi/invoices` | Our monthly figures on each basis beside IGI's invoice |
| PUT | `/api/igi/invoices` | `{ "month": "YYYY-MM", "reference", "total_eur", "basis", "note" }` (upsert) |
| PATCH | `/api/igi/alerts` | `{ "model_ids": [ ≤ 200 ], "shelf_min", "order_min", "shelf_opening" }` |
| POST | `/api/igi/models` | New model `{ "name", "stones", "carat", "shape", "spec" }` → state `awaiting_serial`, emails IGI (201) |
| PATCH | `/api/igi/models` | Rename `{ "model_id", "name" }`; pushes the label to the ERP certificate master |
| DELETE | `/api/igi/models` | `{ "model_id" }` in the body; only an un-numbered model (409 otherwise) |
| GET | `/api/igi/models/[id]/shelf-history` | Snapshots + in/out ledger for one model |
| GET | `/api/igi/certificate-erp-ins` | Mirror of ERP Certificate In (≤ 500) |
| GET | `/api/igi/certificate-erp-outs` | Mirror of ERP Certificate Out (≤ 500) |
| GET | `/api/igi/visits` | All movements with totals and shortfall flags |
| POST | `/api/igi/visits` | Request certificates `{ "lines": [ { "model_id", "qty" } ], "note" }` → 201 `{ "visit", "short": [ … ], "email" }`; emails IGI |
| GET | `/api/igi/visits/[id]` | One movement with lines and held quantities |
| DELETE | `/api/igi/visits/[id]` | Only app-created, not yet issued (`whyNotDeletable`, 409); RL 20 |
| PATCH | `/api/igi/visits/[id]/issued` | Record what IGI made on IGI's behalf `{ "issued": { "<model_id>": qty } }` (blank = requested) |
| PATCH | `/api/igi/visits/[id]/received` | Close the movement `{ "received": { "<model_id>": qty } }` (blank = issued); pushes Certificate In to the ERP; emails IGI about missing pieces |
| POST | `/api/igi/visits/[id]/notify` | Resend the request email (status must be `requested`); RL 10 |
| GET | `/api/igi/their-side` | What IGI currently sees, built with the portal's own view builders |
| GET | `/api/igi/preview/todo` `/stock` `/history` `/invoices` | The four IGI portal screens, rendered for an admin through the service role |
| POST | `/api/igi/preview/batches` | Same action as the portal (record a batch), run by an admin |
| POST | `/api/igi/preview/counts` | Same as the portal (record a count) |
| PATCH | `/api/igi/preview/models/[modelId]/serial` | Same as the portal (number a model) |
| PATCH | `/api/igi/preview/todo/[visitId]/produce` | Same as the portal (record production; emails LoveLab) |

### The visit lifecycle

```
LoveLab  POST /api/igi/visits            status = requested   ──► email to IGI ("please prepare")
IGI      PATCH /api/igi-portal/todo/[id]/produce   status = issued   ──► email to LoveLab ("ready")
         (or LoveLab on their behalf: PATCH /api/igi/visits/[id]/issued)
LoveLab  PATCH /api/igi/visits/[id]/received      status = closed   ──► igi_receipts row, POST certificate-in to ERP
                                                                    ──► email to IGI if received < issued
```

Quantities per line: `qty_requested` → `qty_issued` → `qty_received`. A visit
with `correction = true` is an adjustment entered after the fact.

### `GET /api/igi/overview` response (abridged)

```json
{ "models": [ { "id", "serial": "LGAJ6529", "name": "Flower 0.30 round", "state": "in_use",
                "shelf": 758, "shelf_min": 25, "shelf_status": "ok | collect",
                "pool": 120, "order_min": 50, "order_status": "ok | order",
                "qty_ordered": 0, "asked_for": 20, "…": "see lib/igi/derive.js" } ],
  "totals": { "on_shelf": 4120, "at_igi": 2210, "ordered": 0, "unattributed": 0,
              "models_in_use": 61, "reserved": 2, "awaiting_serial": 1,
              "to_collect": 2, "to_order": 1, "open_visits": 1 },
  "shelf": { "dates": [ "2026-10-04", "…" ], "…": "snapshot series" } }
```

`unattributed` is the count of certificates IGI issued between 16 June and
28 July 2026 before models were tracked; it is shown apart and never folded
into a model's figure. Per-model derivation (statuses, shortfalls) lives in
`lib/igi/derive.js`, `lib/igi/status.js`, `lib/igi/shortfall.js`.

### Emails this module sends

| When | To | Content |
|---|---|---|
| New visit requested / `notify` | IGI | The lines requested |
| IGI records production | LoveLab (Liuba) | What is ready to collect |
| Visit received short | IGI | Missing pieces |
| New model added | IGI | Please assign a serial |
| Cron `igi-mail`, 07:00 daily | Liuba | Morning digest |
| Cron `igi-mail`, Friday 14:00 | IGI | Weekly digest |
| Cron `igi-mail`, every second Friday | Alberto | Order digest (models under `order_min`) |

Scheduled sends are deduplicated per day through `igi_digest_sends`.
Templates: `lib/igi/mail*.js`.

### ERP synchronisation (`lib/igi/lovelabCertificates.js`, `lib/igi/lovelabStock.js`)

| Direction | Trigger | ERP endpoint |
|---|---|---|
| LoveLab → ERP In | visit received | `POST certificate-in` (idempotent via `igi_receipts.reference`, retried by cron) |
| ERP → LoveLab In | cron every 10 min | `GET certificate-in` → `igi_certificate_in_sync` (add / update / delete) |
| ERP → LoveLab Out | cron every 10 min | `GET certificate-out` → `igi_certificate_out_sync` |
| Shelf snapshot | cron 10 min + nightly | `GET certificate-stock` → `igi_shelf_snapshots` |
| Model labels | rename / serial assigned / cron | `POST certificate-master` |

Operational scripts: `npm run igi:import` / `igi:check`
(`scripts/import-igi-seed.mjs`), `scripts/build-igi-switch-on.mjs`,
`scripts/build-igi-update.mjs`; one-off SQL in `database-migrations/igi-*.sql`.
