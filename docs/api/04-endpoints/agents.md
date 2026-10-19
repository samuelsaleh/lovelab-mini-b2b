# Agents

Sales agents are `profiles` rows with `is_agent = true`. All routes here are
admin-only except where marked A/self.

| Method | Path | Auth | RL | Purpose |
|---|---|---|---|---|
| GET | `/api/agents[?include_trashed=1]` | A | 60 | All agents with stats |
| POST | `/api/agents` | A | 20 | Invite an agent |
| GET | `/api/agents/[id]` | A | 60 | Detail + up to 500 commissions |
| PUT | `/api/agents/[id]` | A | 30 | Update / change status / move org / restore |
| DELETE | `/api/agents/[id][?permanent=true]` | A | 20 | Trash (or purge after 7 days) |
| PATCH | `/api/agents/[id]/commission-config` | A | 20 | Save the commission scheme |
| GET | `/api/agents/[id]/contract-text` | A/self | 20 | Text of the contract PDF |
| POST | `/api/agents/[id]/contract` | A/self | 10 | Upload the contract (≤ 10 MB) |
| GET | `/api/agents/[id]/contract` | A/self | none | Signed URL (1 h) |
| DELETE | `/api/agents/[id]/contract` | A/self | none | Remove the contract |
| POST | `/api/agents/[id]/extract-commission` | A | 10 | Claude proposes a config from contract text |
| GET | `/api/agents/[id]/new-client-bonus/preview?amount=…` | A | 30 | What a backfill would grant |
| PATCH | `/api/agents/[id]/new-client-bonus` | A | 10 | Set bonus mode / amount, optional backfill |
| POST | `/api/agents/[id]/repair` | A | 20 | Idempotent self-heal |
| POST | `/api/agents/[id]/reset-password` | A | 10 | New temp password by email |

---

### `GET /api/agents`

`{ "agents": [ … ], "trashedAgents": [ … ] }`. Each agent is the profile plus
the aggregates from the `get_agent_stats()` SQL function (`total_orders`,
`total_revenue`, `total_commission`, `pending_commission`, `paid_commission`,
`total_docs` …) and its organization.

### `POST /api/agents`

```json
{ "email": "required", "commission_rate": 10, "full_name": "…",
  "agent_phone": "…", "agent_company": "…", "agent_country": "FR", "agent_city": "…",
  "agent_region": "…", "agent_territory": "…", "agent_specialty": "…",
  "agent_conditions": "…", "agent_notes": "…", "agent_language": "fr",
  "organization_id": "uuid | null", "send_invite": true }
```

`lib/agents/invite.js`: creates the auth user with a temporary password
(`Firstname1234!`), the profile (`is_agent`, `agent_status = 'invited'`,
`has_password_set = false`), the `allowed_emails` row, the personal folder
(`events.type = 'agent'`), the Google Drive folder (`profiles.drive_folder_id`)
and, with `send_invite`, the credentials email. Re-inviting an email that
already exists reuses and repairs the profile. Response `{ "agent": { … } }`;
the temporary password is never returned, only emailed.

### `PUT /api/agents/[id]`

Any profile field above, plus `agent_status` (`active` / `paused` /
`inactive`), `organization_id` (moves the agent and re-provisions folders) and
`_restore: true` (out of the trash). Changing `commission_rate` recalculates
every unpaid commission (`lib/commissionRecalc.js`). `{ "agent": { … } }`.

### `DELETE /api/agents/[id]`

Soft: `agent_status = 'inactive'`, `agent_deleted_at = now()`, sessions revoked
(`revoke_user_sessions`), allowlist row removed. Documents and commissions stay.
With `?permanent=true`, and only after 7 days in the trash, the profile and auth
user are deleted (commissions cascade, documents keep `created_by = null`).

### `PATCH /api/agents/[id]/commission-config`

```json
{ "config": { "type": "flat", "rate": 10 } }
{ "config": { "type": "tiered", "tiers": [ { "upTo": 1000, "rate": 8 }, { "upTo": null, "rate": 12 } ] } }
{ "config": { "type": "category", "rates": { "bracelets": 10, "necklaces": 8 } } }
{ "config": { "type": "complex", "…": "see lib/commission.js" } }
```

Validated by `lib/commission.js`; stored in `profiles.agent_commission_config`.
`lib/effectiveRate.js` falls back to the organization's `commission_rate` when
the agent's own rate is 0.

### Contracts

`POST …/contract` (multipart `file`, PDF, ≤ 10 MB) stores the path in
`profiles.agent_contract_url`. `GET …/contract` → `{ "url": "<signed>" }`.
`GET …/contract-text` → `{ "text": "…", "commissionConfig": { … }, "commissionRate": 10 }`
(text extracted with `pdf-parse`). `POST …/extract-commission { "contractText" }`
asks Claude (`claude-3-5-haiku-20241022`) for a proposed config and returns
`{ "proposed": { … } }` without saving anything.

### New-client bonus

```json
PATCH { "mode": "off | manual | auto", "amount": 50, "runBackfill": true }
```

`auto`: every order whose client company is new for this agent earns
`amount` (`type = 'new_client_bonus'`), matched on a fuzzy-normalised company
name (`lib/newClientBonusEligibility.js`). `manual`: admins grant it per order
via `POST /api/commissions/new-client-bonus`. With `runBackfill`, past orders
are scanned; `GET …/new-client-bonus/preview?amount=50` shows what would be
granted first. Response `{ "agent": { … }, "backfill": { "granted": 3, "skipped": 7 } }`.

### `POST /api/agents/[id]/repair`

Checks and fixes, in order: `is_agent` flag, `allowed_emails` row,
`agent_status`, organization membership, agent folder, Drive folder.
`{ "fixes": [ "…" ], "healthy": true, "message": "…" }`. Safe to call repeatedly.

### `POST /api/agents/[id]/reset-password`

Generates a new temporary password, sets `has_password_set = false`, emails
the credentials. `{ "ok": true }`.
