# Clients, VAT and external lookups

| Method | Path | Auth | RL | Purpose |
|---|---|---|---|---|
| GET | `/api/clients` | S | 60 | Search the shared client book |
| POST | `/api/clients` | S | 30 | Create or update a client |
| GET | `/api/vat` | S | 15 | Validate an EU VAT number (VIES) |
| POST | `/api/anthropic` | S | 20 | Claude proxy for the builder |
| POST | `/api/perplexity` | S | 10 | Company lookup proxy |
| POST | `/api/analytics/chat` | S | 20 | Analytics assistant with tools |
| GET | `/api/parties` | A | 60 | ERP party search |
| GET | `/api/agent-discount` | S | 60 | ERP agent discount lookup |
| POST | `/api/agent-discount` | S | 30 | ERP agent discount write-through |

---

### `GET /api/clients?search=…`

Every signed-in user sees the whole book (RLS and route agree). Returns
`{ "clients": [ … ] }`, at most 2000 rows, matched on company, name, city,
country (normalised index `idx_clients_lookup_norm`).

### `POST /api/clients`

```json
{
  "id": "uuid (omit to create)",
  "company": "required", "name": "…", "email": "…", "phone": "…",
  "country": "BE", "address": "…", "city": "…", "zip": "…",
  "vat": "BE0123456789", "vat_valid": true,
  "dzb_client_number": "…", "jeweler_group": "SYNALIA",
  "shipping_same_as_billing": false, "shipping_address": "…",
  "shipping_address_line2": "…", "shipping_country": "…",
  "source": "manual | salesforce (admin only)", "source_comment": "…", "source_imported_at": "…",
  "confirm_contact_overwrite": false
}
```

Contact fields (`name`, `email`, `phone`) of an existing client are only
overwritten when `confirm_contact_overwrite` is true; otherwise the response
carries `contact_warnings` listing what differs so the UI can ask. Response
`{ "client": { … }, "contact_warnings": [ … ] }`. Logic in
`lib/clientContactMerge.js`, `lib/clientSync.js`.

### `GET /api/vat?country=BE&number=0123456789`

Calls `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/{cc}/vat/{n}`
with a 30 s timeout and a 10-minute in-memory cache. `GR` is mapped to `EL`.
**Always 200**:

```json
{ "source": "vies | cache", "result": "VALID | INVALID | UNVERIFIED",
  "isValid": true, "errorCode": null, "countryCode": "BE",
  "vatNumber": "0123456789", "name": "X SA", "address": "…" }
```

`UNVERIFIED` means VIES was unreachable; the UI lets the user continue and
stores `vat_valid = null`.

### `POST /api/anthropic`

Server-side proxy so the key never reaches the browser.

```json
{ "model": "claude-sonnet-4-5", "system": "…", "max_tokens": 2048,
  "messages": [ { "role": "user", "content": "…" } ] }
```

`model` must be in the allow-list in `app/api/anthropic/route.js`;
`max_tokens` is capped at 4096. The Anthropic response is returned as is. 400
`Model not allowed` otherwise. **Known issue:** the client (`lib/api.js`) sends
`claude-sonnet-5`, which is not in the list; see
[../11-known-issues.md](../11-known-issues.md).

### `POST /api/perplexity`

Accepts the old chat-completions shape and translates it to Perplexity's Agent
API (`/v1/agent`, model `perplexity/sonar`), because the Sonar
chat-completions endpoint was switched off on 27 September 2026.

```json
{ "model": "sonar", "messages": [ … ], "max_tokens": 1024,
  "web_search_options": { "search_context_size": "low" } }
```

Returns `{ "choices": [ … ], "citations": [ … ], "search_results": [ … ], "usage": { … } }`
in the old shape. Used by "Look up company" in the client gate.

### `POST /api/analytics/chat`

```json
{ "messages": [ … ], "analyticsContext": { "…": "the numbers the page already computed" } }
```

Runs Claude (`claude-sonnet-4-5`) with the tool definitions from
`lib/analyticsChat.js`; returns `{ "stop_reason": "…", "content": [ … ] }` for
the client to execute tool calls locally and loop.

### ERP proxies

All three call the Laravel ERP at `LOVELAB_API_URL`
(`https://software.lovelab-antwerp.com/api`) server-side, because the ERP
endpoints have no authentication of their own.

| Route | Upstream | Notes |
|---|---|---|
| `GET /api/parties?q=…&branch_id=…&limit=…` (A) | `GET /parties` | `{ "parties": [ … ] }`; used to pick the ERP party for consignment |
| `GET /api/agent-discount?email=…` | `GET /agent-discount/{email}` | the URL is hard-coded in the route rather than read from the env |
| `POST /api/agent-discount` | `POST /agent-discount` | body passed through |

Upstream errors come back as `{ "error": "…" }` with the upstream status, or
502 when the ERP is unreachable.
