# Authentication, users and permissions

## Sign-in methods

All four methods end in a Supabase Auth session stored in cookies; from then on
every API call is identified by those cookies.

| Method | Who uses it | Flow |
|---|---|---|
| **Google OAuth** | Office staff (admins) | `app/login/page.jsx` → `supabase.auth.signInWithOAuth` → Google → `GET /auth/callback?code=…` → `exchangeCodeForSession` → gate → profile → redirect |
| **Magic link** | Staff without Google, approved signups | `POST /api/magic-link { email }` → only if the email is in `allowed_emails`; builds the link itself with `auth.admin.generateLink` and sends it through **Resend** (not Supabase's mailer) → `GET /auth/callback?token_hash=…&type=magiclink` → `verifyOtp` |
| **Email + password** | Agents, assistants, employees who were invited | Invite creates the auth user with a temporary password (`Firstname1234!`) and `profiles.has_password_set = false`. The login page calls `signInWithPassword` directly, so **`/auth/callback` is never hit**. `AuthProvider` forces `/set-password`; saving there calls `PATCH /api/me/password-set`. |
| **Forgot password** | Anyone with a password | `POST /api/forgot-password { email }` → recovery link → `/auth/callback?next=/reset-password` |

Self-service access: `POST /api/signup-request` stores a `pending_signups` row
and emails the admins approve / reject links (`GET /api/approve-signup?token=`,
`GET /api/reject-signup?token=`, both ask for `&confirm=1` before acting).
Approval adds the email to `allowed_emails` and sends a magic link.

### What `/auth/callback` does

1. Exchanges the code or verifies the token.
2. **Gate** (`lib/auth/isUserAllowed.js`): the user may enter if the email is in
   `allowed_emails` (fallback: `ALLOWED_EMAILS` env), **or** they are an agent
   (`is_agent`, not deleted, status `active` or `invited`), **or** they are IGI
   (`IGI_EMAILS` env or `profiles.is_igi`). Otherwise sign out and redirect to
   `/login?error=access_denied`.
3. `ensureProfile()` (service role, there is **no database trigger**): create
   the `profiles` row; or, if a profile with the same email exists under a
   different auth id (a re-invited agent), delete and re-insert it under the new
   id and move `organization_memberships` across.
4. Role repair: email in `ADMIN_EMAILS` → `role = 'admin'` (never demotes);
   email in `IGI_EMAILS` → `is_igi = true, role = 'member'` (IGI wins over
   admin). `agent_status` `invited` → `active`.
5. Redirect: `/set-password` for a magic-link agent without a password (or an
   admin whose `user_metadata.must_set_password` is set), `/igi` for IGI
   accounts, otherwise the validated `next` parameter. `x-forwarded-host` must be
   in `ALLOWED_HOSTS`.

Because password logins skip the callback, `GET /api/me` repeats the
`invited → active` promotion, and the login gate is **not** applied to them (see
[11-known-issues.md](11-known-issues.md)).

### Sessions

`proxy.js` (Next 16's name for middleware) runs `updateSession()` from
`lib/supabase/middleware.js` on every non-static path, including `/api/*`:

1. Refreshes the Supabase cookies (`auth.getUser()`). If Supabase is
   unreachable the request is let through; routes then fail with 401.
2. **IGI fence**: a signed-in user with `profiles.is_igi = true` may only reach
   `/igi`, `/igi/*`, `/api/igi-portal*`, `/api/me` and `/set-password`.
   API paths get 403 `{ "error": "Forbidden" }`, pages redirect to `/igi`.
   If that lookup errors, the request is let through and logged.

Nothing else is authorised in the proxy. Every route checks for itself.

Logging a user out everywhere: `revoke_user_sessions(uid)` (SQL, service role)
deletes `auth.sessions`; called when an agent is deleted or an employee
removed. Access tokens already issued stay valid until they expire (1 h).

## User types

`profiles.role` has only two values, `admin` and `member`. Everything else is a
flag or a relationship.

| Type | Identified by | Typical screens | Notes |
|---|---|---|---|
| **Admin** ("employee") | `role = 'admin'` | everything under `/admin`, `/certificates`, analytics, all documents | Set from `ADMIN_EMAILS` at login, by the Employees invite (`POST /api/employees`) or `scripts/add-admin-user.mjs`. An admin can also be an agent ("commercial admin", `/admin/my-sales`). |
| **Member** | `role = 'member'`, email in `allowed_emails` | builder, own documents | The default for anyone let in by the allowlist. |
| **Agent** (commercial) | `is_agent = true`; `agent_status` ∈ invited / active / paused / inactive; `agent_deleted_at`; `commission_rate`, `agent_commission_config`, `organization_id`, `agent_language` | builder, own documents, own commissions, packs, agent folder | Invited by `POST /api/agents` or `POST /api/organizations/[id]/members`. Gets a personal folder (`events.type = 'agent'`) and a Google Drive folder. |
| **Commercial assistant** | `is_assistant = true` and not admin | Home, Builder, Documents for granted fairs | Sees every document in fairs they hold `event_access` for (permission `edit`). Must pick a fair when saving an order. |
| **Organization owner / member** | `organization_memberships.role` ∈ owner / member, `deleted_at IS NULL` | Team page: members, ledger, stats | Owners can invite members (full agent onboarding), pause, reactivate and remove them. `profiles.organization_id` caches the primary org. |
| **IGI** (external lab) | `is_igi = true` and/or email in `IGI_EMAILS` | `/igi` portal only | Never admin, never in `allowed_emails`. Created with `scripts/add-igi-user.mjs`. Reaches the database **through RLS**, not the service role. |
| **Visitor / demo** | hard-coded `VISITOR_EMAILS` in `lib/visitorAccess.js` | admin screens with revenue masked | UI-only; not a database concept. |

`resolveAgentIds(agentId)` returns every profile id that shares the email of
the given profile. All access checks use it, so a user who was deleted and
re-invited keeps seeing their old documents.

## Permission model, from coarse to fine

### 1. Route guard

Each route starts with one of the guards in
[03-conventions.md](03-conventions.md#authentication): session, admin, IGI,
cron secret, shared secret. Helper functions: `getUserContext()`
(`app/api/_lib/access.js`), `requireSession()` / `isAdmin()`
(`lib/organizations/authz.js`), `requireFairAdmin()`
(`lib/fair-assistant/server.js`), `requireLoveLab()` (`app/api/igi/_lib`),
`requireIgi()` (`app/api/igi-portal/_lib`).

### 2. Event (folder) permission

`getEventPermission(admin, eventId, user)` → `null | 'read' | 'edit' | 'manage'`,
evaluated in this order:

1. Admin → `manage`.
2. Creator of the event (any of the user's resolved ids) → `manage`.
3. `event_access` row for the user → its `permission`.
4. Team visibility → `read`: the event's `organization_id` is one the user is
   an active member of, or the creator shares an active organization with the
   user.

`requireEventPermission(…, required)` compares ranks `read < edit < manage`.
Saving an order into a folder needs `edit`; sharing or deleting a folder needs
`manage`.

### 3. Document visibility (`lib/documentAccess.js`, `canAccessDocument()`)

Folder access is **not** row access.

| User | Sees |
|---|---|
| Admin | every document (`scope=mine` narrows to their own) |
| Agent | documents they created (`created_by`) or are credited for (`agent_id`), plus team documents through `getOrgTeamScope()` |
| Assistant | every document in fairs they have `event_access` for, plus their own |
| Anyone | never `internal`, `consignment`, `delete_from_stock` or `sample` channels unless explicitly filtered |

Editing needs `edit`; `order_channel` changes are admin-only.

### 4. Catalogue, price list and pack visibility

- `lib/collectionAccess.js`: retired collections hidden from all; admin-only
  collections; the Iconix preview set for every agent; three collections
  granted to a single email; price list `2026-10` for everyone, `2025` and
  `2026` for `LEGACY_PRICELIST_EMAILS` only.
- `lib/packVisibility.js`: `global` for everyone, `private` for owner + admins,
  `restricted` for agents listed in `pack_visibility` + admins.

### 5. Row Level Security

The last line of defence, and the **only** line for the IGI portal. Full list
in [05-database/rls-policies.md](05-database/rls-policies.md). Remember that
service-role routes bypass it.

## Invitations and lifecycle

| Action | Route | Effect |
|---|---|---|
| Invite agent | `POST /api/agents` | auth user with temp password, profile flags, `allowed_emails` row, agent folder, Drive folder, email with credentials (`send_invite`) |
| Invite team member | `POST /api/organizations/[id]/members` | same, plus membership; owner or admin |
| Invite employee | `POST /api/employees` | auth user (`must_set_password`), `role = 'admin'`, allowlist |
| Invite assistant | `POST /api/assistants` | profile `is_assistant`, `event_access` rows for the chosen fairs |
| Pause / reactivate | `PUT /api/agents/[id] { agent_status }`, `PATCH /api/organizations/[id]/members/[userId] { action }` | status only; a paused agent is refused by the gate **only** if also absent from `allowed_emails` |
| Reset password | `POST /api/agents/[id]/reset-password`, `PUT /api/employees/[id] { _resend: true }` | new temp password, `has_password_set = false`, email |
| Delete agent | `DELETE /api/agents/[id]` | soft: `agent_status = 'inactive'`, `agent_deleted_at`, sessions revoked, allowlist row removed. `?permanent=true` allowed after 7 days in trash |
| Remove employee | `DELETE /api/employees/[id]` | demote to member, revoke access and sessions; refuses the last admin and yourself |
| Repair | `POST /api/agents/[id]/repair` | idempotent fix of flag, allowlist, status, org and folders |

## Secrets involved

`ADMIN_EMAILS`, `IGI_EMAILS`, `ALLOWED_EMAILS`, `ALLOWED_HOSTS`,
`NEXT_PUBLIC_SITE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` (for the
auth emails). How to change them in production: `.claude/skills/env-sync/SKILL.md`.
Never put a value on a command line or in a commit: `.claude/skills/api-credentials/SKILL.md`.
