# Organizations (agent teams)

A partner company with `owner` and `member` roles, a fallback commission rate,
shared folders and a settlement ledger. Tables: `organizations`,
`organization_memberships`, `organization_invitations`. Guards:
`requireSession`, `isAdmin`, `requireOrganizationAccess` (admin or active
member) in `lib/organizations/authz.js`.

| Method | Path | Auth | RL | Purpose |
|---|---|---|---|---|
| GET | `/api/organizations` | S | 60 | All (admin) or mine |
| POST | `/api/organizations` | S | 10 | Create (201) |
| GET | `/api/organizations/[id]` | member / A | 60 | Detail |
| PATCH | `/api/organizations/[id]` | A | 30 | Update |
| GET | `/api/organizations/[id]/members` | member / A | 60 | Members |
| POST | `/api/organizations/[id]/members` | owner / A | 20 | Add or invite (202) |
| PATCH | `/api/organizations/[id]/members/[userId]` | owner / A | 30 | Pause / reactivate / resend |
| DELETE | `/api/organizations/[id]/members/[userId]` | owner / A | 30 | Remove |
| GET | `/api/organizations/[id]/ledger[?include_orders=1]` | member / A | 60 | Settlement ledger |
| GET | `/api/organizations/[id]/stats?from=&to=` | member / A | 60 | Team dashboard |
| POST | `/api/organizations/[id]/folders/provision` | member / A | 20 | Rebuild folders |
| POST | `/api/organizations/auto-ensure` | S | none | Make sure I have an org |
| GET | `/api/organizations/invitations` | S | none | My pending invitations |
| POST | `/api/organizations/invitations/accept` | S | none | Accept by token |

---

### `POST /api/organizations`

`{ "name": "required", "territory": "…", "owner_user_id": "uuid (admins; defaults to caller)" }`.
Creates the org, an `owner` membership, the folder tree (`agent_folders` and
storage markers, non-blocking) and returns `201 { "organization": { … }, "folder": { … } }`.
Non-admins can only create an organization for themselves.

### `PATCH /api/organizations/[id]`

`{ "name", "territory", "commission_rate", "conditions" }`. A new
`commission_rate` recalculates the unpaid commissions of members who use the
fallback rate.

### Members

`GET …/members` → `{ "members": [ { "user_id", "role", "deleted_at", "profile": { … }, "stats": { … } } ], "caller_role": "owner" }`.

`POST …/members` (owner or admin):

```json
{ "user_id": "uuid" }                                            // existing user
{ "email": "x@y.fr", "full_name": "…", "role": "member" }         // invite one
{ "emails": ["a@y.fr", "b@y.fr"], "role": "member" }              // invite several
```

Invites run the full agent onboarding (`lib/organizations/provision-agent.js`:
auth user, profile with the org's rate, allowlist, folders, membership,
credentials email) and answer `202 { "results": [ … ] }` because the email goes
out asynchronously.

`PATCH …/members/[userId] { "action": "pause" | "reactivate" | "resend_invite" }`
(`canManageTargetMember`: owners cannot act on other owners).
`DELETE …/members/[userId]` soft-deletes the membership and pauses the agent.

### `GET /api/organizations/[id]/ledger`

Per member and for the whole team: ready-to-pay, reported, paid totals and
the payouts; with `include_orders=1`, the underlying commission rows.
`lib/organizations/settlement.js`.

### `GET /api/organizations/[id]/stats?from=2026-01-01&to=2026-09-30`

```json
{ "organization": { "id", "name", "territory", "commission_rate" },
  "totals": { … }, "per_member": [ … ], "revenue_by_event": [ … ],
  "period": { "from": "2026-01-01", "to": "2026-09-30" } }
```

(`lib/organizations/team-stats`). Visitors get masked revenue in the UI only.

### Invitations

`GET /api/organizations/invitations` → `{ "invitations": [ … ] }` for the
caller's email (RLS-bound). `POST …/invitations/accept { "token" }` → creates
the membership; 410 if expired, 409 if already accepted, 403 if the email does
not match the session.

### `POST /api/organizations/auto-ensure`

`{ "user_id": "uuid (admins only; defaults to caller)" }`. Guarantees the user
has an organization, an `owner` membership and folders. Idempotent; used on
first login of a legacy agent. `{ "organization": { … }, "created": false }`.
