# IGI portal: what IGI's own accounts can call

IGI employees log in like everyone else but with `profiles.is_igi = true`. The
proxy fences them into `/igi*`, `/api/igi-portal*`, `/api/me` and
`/set-password`. Every route here uses `requireIgi` and the **RLS-bound
client**: the admin client is banned in `app/api/igi-portal/`, so the Row
Level Security policies and column grants on the `igi_*` tables are the real
boundary (see [../05-database/rls-policies.md](../05-database/rls-policies.md#igi-certificate-module)).
IGI can see models and movements, never LoveLab's shelf, invoices or ERP data.

Rate limits: 60 reads, 30 writes per minute. Errors use the same
`not_switched_on` / `behind_the_app` 503s as the LoveLab side. Shared view
builders live in `lib/igi/portalActions.js` and `app/api/igi-portal/_lib/load.js`
(`loadIgiWorld`), which the admin preview routes reuse.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/igi-portal/todo` | Open requests waiting on IGI, models awaiting a serial, models below `order_min` |
| GET | `/api/igi-portal/stock` | IGI's pool per model and what LoveLab is currently asking for |
| GET | `/api/igi-portal/history` | Movements, batches and counts |
| GET | `/api/igi-portal/invoices` | Certificates issued per month at €1.20 each (IGI's billing view) |
| POST | `/api/igi-portal/batches` | Record production `{ "model_id", "qty" > 0, "batch_date": "YYYY-MM-DD", "reference", "note" }` → 201 |
| POST | `/api/igi-portal/counts` | Record a stock count `{ "model_id", "counted" ≥ 0, "note" }` → 201 `{ "count" }`, or 200 `{ "unchanged": true }`, 409 if the model is not in use or the pool would go negative |
| PATCH | `/api/igi-portal/models/[modelId]/serial` | Number a new model `{ "serial": "LGAJ6529", "serial_full": "LGAJ6529-2610" }`; only from `awaiting_serial`, serial immutable afterwards (trigger) |
| PATCH | `/api/igi-portal/todo/[visitId]/produce` | Record what was produced `{ "made": { "<model_id>": qty } }`; visit `requested` → `issued`; emails LoveLab |

### `GET /api/igi-portal/todo` response (abridged)

Built by `todoView()` in `lib/igi/portalViews.js` from `loadIgiWorld()`:

```json
{ "visits": [ { "id", "visit_no": 34, "visit_date": "2026-10-03", "status": "requested", "note",
                "lines": [ { "model_id", "serial", "name", "qty_requested": 20, "pool": 12 } ] } ],
  "awaiting": [ { "id", "name", "stones", "carat", "shape", "spec", "requested_at" } ],
  "produce": [ { "id", "serial", "name", "pool": 30, "level": 50, "short_by": 20 } ] }
```

`produce` lists models whose pool is under their `order_min` (`level`), sorted by
how short they are. The exact field names of a model, a visit and a line as IGI
sees them are defined in `lib/igi/portalShapes.js` (`toIgiModel`, `toIgiVisit`,
`toIgiLine`), which deliberately omit every LoveLab-side column.

What IGI may change, and nothing else (enforced by RLS + column grants):
append a batch, append a count, set a serial once, set `qty_issued` on the
lines of a `requested` visit and move that visit to `issued`.
