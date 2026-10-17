# Packs

Pre-built orders at a fixed price (≥ €970). Table `packs` plus the join tables
`pack_visibility`, `pack_fairs`, `pack_hidden`, `pack_pinned`. Visibility:
`global` (everyone), `private` (owner + admins), `restricted` (agents listed in
`pack_visibility` + admins). Every pack has a generated Excel order form in the
`pack-templates` bucket (`lib/packTemplates.js`, `lib/packExcel.js`).

| Method | Path | Auth | RL | Purpose |
|---|---|---|---|---|
| GET | `/api/packs` | S | 60 | Packs I can see |
| POST | `/api/packs` | S | 30 | Create (201) |
| PUT | `/api/packs/[id]` | owner / A | 30 | Update |
| DELETE | `/api/packs/[id]` | owner (non-seed) / A | 30 | Delete + template |
| PUT | `/api/packs/[id]/fairs` | S (pack visible) | 60 | Replace the fair set |
| PUT | `/api/packs/[id]/hidden` | S | 60 | Hide / unhide for me |
| PUT | `/api/packs/[id]/pinned` | S | 60 | Pin / unpin for me |
| POST | `/api/packs/reorder` | A | 30 | Global sort order |
| GET | `/api/pack-fairs` | S | 60 | Fairs with pack counts |
| GET | `/api/pack-templates` | A | 60 | Templates with download URLs |
| GET | `/api/pack-templates/[id]/download` | A | 60 | The xlsx |

---

### `GET /api/packs`

RLS-filtered, then decorated:

```json
{ "packs": [ { "id", "label": "PACK 1", "description": [ "…" ], "budget_label": "€1,000",
               "fixed_total": 970, "form_rows": [ { "collection": "…", "carat": "…", "color": "…", "qty": 3 } ],
               "scope": "global", "is_seed": true, "sort_order": 10, "created_by": "…",
               "fair_ids": [ "…" ], "hidden": false, "pinned": true, "is_owner": false,
               "agent_ids": [ "…" ], "owner_name": "…" } ] }
```

`agent_ids` and `owner_name` only for admins.

### `POST /api/packs`  /  `PUT /api/packs/[id]`

```json
{ "label": "required", "fixed_total": 1200, "form_rows": [ … ],
  "description": [ "line", "line" ], "budget_label": "…",
  "scope": "global | private | restricted",   // admin only; non-admins forced to private
  "agent_ids": [ "…" ],                        // admin only, for restricted
  "event_ids": [ "…" ] }                       // fairs to file under
```

422 when `fixed_total` < 970. On success the Excel template is (re)generated.
`201 { "pack": { … } }` / `200 { "pack": { … } }`.

### `DELETE /api/packs/[id]`

Owner may delete their own non-seed pack; admins any pack. Removes the template
object too.

### Per-user and per-fair flags

- `PUT …/fairs { "event_ids": [ … ] }` replaces the `pack_fairs` rows.
  503 `{ "error", "code": "PACK_FOLDERS_NOT_INSTALLED" }` if the phase-34
  migration is missing.
- `PUT …/hidden { "hidden": true }`, `PUT …/pinned { "pinned": true }`: own
  rows in `pack_hidden` / `pack_pinned` (RLS-bound client).
- `POST /api/packs/reorder { "ordered_ids": [ … ] }` writes `sort_order`.

### `GET /api/pack-fairs`

`{ "fairs": [ { "id", "name", "pack_count": 4, "can_delete": false } ] }`.

### Templates (admin)

`GET /api/pack-templates` → `{ "templates": [ { "pack_id", "label", "path", "downloadUrl" } ] }`.
`GET /api/pack-templates/[id]/download` streams `<packId>.xlsx`, regenerating it
if the object is missing. Both declare `runtime = 'nodejs'`.
