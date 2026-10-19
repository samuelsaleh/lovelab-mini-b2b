# Staff: employees and commercial assistants

Both are admin-only. An **employee** is simply a profile with `role = 'admin'`.
A **commercial assistant** is a non-admin profile with `is_assistant = true`
whose access is a set of fairs (`event_access` rows with `edit`).

| Method | Path | RL | Purpose |
|---|---|---|---|
| GET | `/api/employees` | 60 | `{ "employees": [ { …profile, "you": true } ] }` |
| POST | `/api/employees` | 20 | Invite `{ "email", "full_name", "send_invite" }`; 201 created / 200 already existed |
| PUT | `/api/employees/[id]` | 30 | `{ "_resend": true }` new temp password (not for yourself) **or** `{ "commercial": true, "commission_rate": 10 }` toggles the agent flag on an admin |
| DELETE | `/api/employees/[id]` | 20 | Demote to member, revoke allowlist and sessions; refuses yourself and the last admin |
| GET | `/api/assistants` | 60 | `{ "assistants": [ { …profile, "events": [ … ] } ] }` |
| POST | `/api/assistants` | 20 | `{ "email", "full_name", "event_ids": [ ≥ 1 ], "send_invite" }` |
| PUT | `/api/assistants/[id]` | 30 | `{ "full_name" }`, `{ "event_ids": [ … ] }` (replaces the set), or `{ "_resend": true }` |
| DELETE | `/api/assistants/[id]` | 20 | Clears `is_assistant`, deletes their `event_access`, revokes sessions |

Invites use `lib/employees/invite.js` / `lib/assistants/invite.js`: auth user
with a temporary password, `user_metadata.must_set_password` (employees) or
`has_password_set = false` (assistants), `allowed_emails` row, credentials email
through Resend.
