# Events (folders) and sharing

An *event* is a folder: `type` is `fair`, `agent` (one personal folder per
agent per organization), `partner` or `other`. Permissions:
[../02-authentication.md](../02-authentication.md#2-event-folder-permission).

| Method | Path | Auth | RL | Purpose |
|---|---|---|---|---|
| GET | `/api/events` | S | 60 | Folders visible to me |
| POST | `/api/events` | S | 20 | Create a folder |
| PUT | `/api/events/[id]` | S + `manage` | 30 | Rename / retype |
| DELETE | `/api/events/[id]` | S + `manage` | 20 | Delete (documents are unfiled, not deleted) |
| GET | `/api/events/[id]/access` | S + `manage` | 30 | Who has access |
| POST | `/api/events/[id]/access` | S + `manage` | 20 | Grant |
| PATCH | `/api/events/[id]/access/[userId]` | S + `manage` | 20 | Change permission |
| DELETE | `/api/events/[id]/access/[userId]` | S + `manage` | 20 | Revoke |

---

### `GET /api/events`

```json
{ "events": [
  { "id": "…", "name": "Inhorgenta 2026", "type": "fair", "location": "München",
    "start_date": "2026-02-20", "end_date": "2026-02-23", "organization_id": null,
    "created_by": "…", "permission": "manage", "doc_count": 37,
    "agent_stats": { "orders": 12, "revenue": 18400 } }
] }
```

`permission` is the caller's effective permission; `agent_stats` only on
`type = 'agent'` folders for admins.

### `POST /api/events`

```json
{ "name": "required", "type": "fair | agent | partner | other",
  "location": "…", "start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD",
  "organization_id": "uuid | null" }
```

An `agent` folder is linked to the agent's organization automatically and
de-duplicated against `events_agent_name_org_unique`; in that case the response
carries `deduplicated: true` and the existing folder. `{ "event": { … } }`.

### `PUT /api/events/[id]`

`{ "name": "required", "type": "optional" }`.

### `DELETE /api/events/[id]`

Sets `event_id = null` on its documents, deletes `event_access` and
`pack_fairs` rows by cascade, then deletes the event.

### Sharing

`GET …/access` → `{ "access": [ { "user_id", "user_email", "permission", "granted_by", "created_at", "profile": { "full_name", "email" } } ] }`

`POST …/access`:

```json
{ "permission": "read | edit | manage",
  "user_id": "uuid"  |  "email": "person@x.be"  |  "organization_id": "uuid" }
```

Exactly one target. `organization_id` grants every active member. `email` works
for people who have not logged in yet (the row is matched on `user_email` later).

`PATCH …/access/[userId]` → `{ "permission": "edit" }`.
`DELETE …/access/[userId]` → `{ "ok": true }`.

Script equivalent: `scripts/grant-fair-access.mjs`.
