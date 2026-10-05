# Known issues and discrepancies

Found while writing this documentation (5 October 2026) by comparing the code,
the live database and the operational set-up. Nothing here was changed;
these are observations for Taddeo to prioritise.

## Functional

1. **The builder's Claude chat is rejected by its own proxy.** `lib/api.js`
   sends `model: 'claude-sonnet-5'`; the allow-list in
   `app/api/anthropic/route.js` only contains `claude-sonnet-4-5`,
   `claude-sonnet-4-20250514`, `claude-haiku-4-20250414` and three
   `claude-3*` ids, so every call should get 400 `Model not allowed`. Affects
   `sendChat`, `sendRecommendationChat`, `sendBuilderChat`, `sendContractChat`.
   Fix: add `claude-sonnet-5` (and `claude-haiku-4-5-20251001`) to the list.
2. **Fair-assistant chat history has no table.** `/api/fair-assistant/chat`
   reads and writes `fair_chat_messages`, created by
   `database-migrations/supabase-phase23-fair-assistant-chat-memory.sql`, but
   the live database has no such table. `GET` returns 500
   `Failed to load chat history`. Fix: apply that file.
3. **Organization folder markers target a bucket that does not exist.**
   `lib/organizations/provisioning.js` writes to `AGENT_DOCUMENTS_BUCKET`
   (default `agent-documents`); only `documents`, `commission-reports` and
   `pack-templates` exist. Callers swallow the error, so only the storage
   "folders" are missing. Fix: set the variable to `documents` or create the bucket.
4. **A paused agent can still log in** if their email is in `allowed_emails`
   (it is, from the invite) because `isUserAllowed` short-circuits on the
   allowlist, and password logins never run the gate at all (`signInWithPassword`
   does not go through `/auth/callback`). The UI then shows them their folder.
   Fix: check `agent_status` in `/api/me` or in the middleware for `is_agent`
   profiles, and remove the allowlist row on pause.
5. **The monthly commission batch is off** but the n8n workflow still fires it,
   at the old host `b2b-lovelab.com` (which redirects; POST bodies may be
   dropped). Either delete the n8n workflow or re-enable the route.
6. **`/api/backup` is never scheduled** (neither crontab nor `vercel.json`),
   and returns `{ skipped: true }` without Drive credentials. Supabase's own
   daily backups are the only backup today.
7. **`extract-commission` uses `claude-3-5-haiku-20241022`**, a model likely
   retired; verify before relying on it.
8. **`agent-discount` hard-codes the ERP URL** instead of `LOVELAB_API_URL`.

## Security and data (see also [05-database/schema-health.md](05-database/schema-health.md))

9. **`documents` has an `Allow public read` RLS policy** (`USING true`, role
   `public`). Anyone with the anon key can read all document rows, including
   trashed ones (client names, totals, metadata). The app itself uses the
   service role, so dropping the policy breaks nothing.
10. **`clients` has an `Allow anon read clients` policy.** Same remedy.
11. **`pack_fairs` is writable by any signed-in user**, including agents, while
    the UI only exposes it to admins.
12. **`profiles` INSERT policy** (`auth.uid() = id`) was never dropped: a
    signed-in user with no profile row could insert their own with
    `role = 'admin'`. The window is small (the callback creates the profile at
    once) but the policy serves no purpose now.
13. **Leaked-password protection is off** in Supabase Auth while agents use
    passwords.
14. **The `documents` bucket is read/write for any authenticated user** on any
    path. Paths contain UUIDs and the app signs URLs server-side, so exposure is
    low, but a path-prefix policy would be cleaner.
15. The `is_*` SECURITY DEFINER helpers are executable by `anon` over
    PostgREST. Harmless (they only answer about `auth.uid()`), flagged by the
    linter; `REVOKE EXECUTE … FROM anon` closes it.

## Schema bookkeeping

16. `lib/expected-schema.mjs` misses the six `fair_*` tables,
    `igi_certificate_in_sync` and a dozen columns, so drift on them is invisible
    (list in schema-health.md).
17. Supabase only knows 19 of the ~135 migration files; the rest were pasted
    into the SQL editor. See [05-database/migrations.md](05-database/migrations.md)
    for the baseline proposal.
18. `set_clients_updated_at` exists in `supabase-phase4-fixes.sql` but not in
    the database; `clients.updated_at` is only right when the code sets it.
19. The `documents.order_channel` CHECK still allows `sample` although the
    value was retired in June 2026.
20. Duplicate indexes on `organization_memberships`; 29 unindexed foreign keys
    (only `documents.event_id` and `agent_commissions.document_id` matter).

## Documentation debt

21. `README.md` says Next.js 14, Google-only login and three migrations.
22. `LoveLab_App_Explained.md` describes a different design (FastAPI,
    PocketBase, LiteLLM) that was never built here; keep it as a design note or
    delete it.
23. Comments and the `x-vercel-cron-secret` header still refer to Vercel;
    production is a DigitalOcean server with pm2.
24. `docs/FAIR-ASSISTANT-MASTER-PLAN.md` (May 2026) predates the move from n8n
    sending to in-app sending.
