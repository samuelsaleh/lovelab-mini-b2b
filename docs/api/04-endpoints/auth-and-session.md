# Auth and session

Background: [../02-authentication.md](../02-authentication.md).

| Method | Path | Auth | RL | Purpose |
|---|---|---|---|---|
| GET | `/auth/callback` | Public | none | OAuth / magic-link landing |
| POST | `/api/magic-link` | Public | 5 | Send a magic link |
| POST | `/api/forgot-password` | Public | 5 | Send a password-recovery link |
| POST | `/api/signup-request` | Public | 5 | Ask for access |
| GET | `/api/approve-signup` | Token | 10 | Admin approves a request (from the email link) |
| GET | `/api/reject-signup` | Token | 10 | Admin rejects a request |
| GET | `/api/me` | S (IGI allowed) | 60 | Who am I |
| PATCH | `/api/me/password-set` | S | 10 | Mark the password as set |

---

### `GET /auth/callback`

Not an API in the JSON sense: the browser is redirected here by Supabase.

Query: `code` (OAuth) **or** `token_hash` + `type` (`magiclink`, `recovery`,
`invite`); optional `next` (relative path, validated against open redirects).
Header `x-forwarded-host` must be in `ALLOWED_HOSTS`.

Does, in order: exchange / verify → login gate → `ensureProfile()` → role
repair → agent activation → redirect. On a refused email: signs out and
redirects to `/login?error=access_denied`. See the authentication page for the
details. Tests: `app/auth/__tests__/callback.test.js`.

### `POST /api/magic-link`

```json
{ "email": "someone@love-lab.com" }
```

Always `200 { "ok": true }`. Sends only if the email is in `allowed_emails`.
The link is generated with `auth.admin.generateLink` and emailed through Resend
by `lib/auth/sendBrandedAuthLink.js` (8 s timeout, never throws). Target:
`/auth/callback?token_hash=…&type=magiclink`.

### `POST /api/forgot-password`

```json
{ "email": "agent@example.com" }
```

Always `200 { "ok": true }`. No allowlist check (deliberate: an agent who was
removed from the allowlist can still reset and then be refused by the gate).
Target: `/auth/callback?next=/reset-password`.

### `POST /api/signup-request`

```json
{ "email": "new@shop.be", "full_name": "New Person" }
```

Inserts a `pending_signups` row with a random token, then emails the addresses
in `ADMIN_NOTIFICATION_EMAIL` (first = To, rest = CC) with approve and reject
links. Errors: 409 when the email already has access or a pending request,
403 when it was rejected before, 400 on an invalid email.

### `GET /api/approve-signup?token=…[&confirm=1]`  /  `GET /api/reject-signup?token=…[&confirm=1]`

Without `confirm=1`: renders an HTML page with a confirm button (so email
scanners that prefetch links do nothing). With it:

- approve: upsert `allowed_emails`, generate a magic link, email it to the
  requester, set `status = 'approved'`, redirect to `/approve-result?status=approved`
- reject: set `status = 'rejected'`, email the requester, redirect to
  `/approve-result?status=rejected`

Unknown or used token → `/approve-result?status=invalid`.

### `GET /api/me`

Returns the current identity. No session is **not** an error:

```json
{ "user": null, "profile": null }
```

With a session:

```json
{
  "user": { "id": "…", "email": "…", "user_metadata": { … } },
  "profile": {
    "id": "…", "email": "…", "full_name": "…", "role": "admin",
    "is_agent": true, "agent_status": "active", "commission_rate": 10,
    "is_assistant": false, "is_igi": false, "has_password_set": true,
    "organization_id": "…", "agent_language": "fr", "…": "all profile columns"
  },
  "organization_membership": {
    "organization_id": "…", "organization_name": "Showroom X", "role": "owner"
  }
}
```

`organization_membership` is `null` when the user is in no active organization;
it prefers the org on `profile.organization_id`, else the first active one.
Side effect: an `invited` agent is promoted to `active` here, because password
logins never reach `/auth/callback`. IGI sessions are allowed through the fence
for this route. Used by `AuthProvider.jsx` on every page load.

### `PATCH /api/me/password-set`

No body. Sets `profiles.has_password_set = true` and removes
`must_set_password` from the auth user's metadata. Called by `/set-password`
after `supabase.auth.updateUser({ password })` succeeds. `200 { "ok": true }`.
