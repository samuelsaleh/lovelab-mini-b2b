# Silent try/catch audit

Phase 0.2 of the Agent Commission Resilience plan.

Lists every place the codebase swallows or under-logs an error. Each entry is
classified into a tier so we know what needs a real fix vs what is fine.

## Tier definitions

| Tier | Meaning | Action required |
|------|---------|-----------------|
| A    | Hides data-integrity bugs from production. Caused (or could cause) the agent commission bug class. | Replace with `system_health_events` + admin email alert + structured logging. |
| B    | Best-effort UX path (e.g. localStorage quota, optional contact save, side-effect email). Failure is acceptable but should be observable. | Keep silent in user flow but log to `system_health_events` for visibility. |
| C    | Genuinely safe — pure UI fallback, intentional ignore, no business impact. | Leave as-is; document the intent in a comment. |

## Tier A — must fix in this plan

| # | File | Lines | Catches | Why this is Tier A |
|---|------|-------|---------|--------------------|
| A1 | `app/api/documents/route.js` | 367–369 | Commission auto-creation hook | Caused the original Marc / Corinne missing-commission bugs. Failure modes include schema drift (`agent_commission_config` missing), `ON CONFLICT` mismatch on partial unique index, RLS denial. Currently logs `console.error` but returns success to the user. |
| A2 | `app/api/documents/[id]/route.js` | 178–180 | Commission recalc on edit | Same risk profile as A1. Editing a document silently fails to update the commission row. |
| A3 | `app/api/agents/[id]/route.js` | 335–339 | `revoke_user_sessions` RPC after agent soft-delete | If the RPC silently fails the deleted agent keeps a valid session. Logged but never alerts. Promote to Tier A because it is a security/auth concern. |

Plan tasks for Tier A:

1. Introduce `system_health_events` table (Phase 16 migration).
2. Add `lib/healthEvent.js` helper that writes to that table and triggers an admin
   email when severity ≥ `error`.
3. Replace each Tier A `catch` with a call to `recordHealthEvent({ source, severity, message, context })`.
4. Keep the catches non-blocking from the user's perspective but the failure becomes visible to admins immediately.

## Tier B — log to health events, do not block user flow

| File | Lines | What is caught | Notes |
|------|-------|----------------|-------|
| `app/api/documents/send-email/route.js` | 312 | `/* no-op */` after attempting to send invoice email | Email failure should be visible to admin, not silent. |
| `app/api/documents/route.js` | 410+ | (orderNotificationEmail) email-send failure | Same as above. |
| `app/components/SaveDocumentModal.jsx` | 360 | Contact save failure during order save | Worth logging to detect slow-burn data loss. |
| `app/api/backup/route.js` | 151, 170, 172 | Per-file/per-folder failures during nightly backup | Backups silently degrade — must be observable. |
| `app/components/EditConsignmentDetailsModal.jsx` | 69, 116 | Refresh failure after edit | UI says success while data is stale. Worth a low-severity health event. |
| `app/components/EditConsignmentDetailsModal 2.jsx` | 59, 102 | Same as above (duplicate file — also flagged in Phase 0.5). | |
| `app/components/InternalOrdersPanel.jsx` | 37, 182 | Non-blocking refresh failures | Log only. |
| `app/components/ConsignmentRecipientForm.jsx` | 94, 104 | Non-blocking lookups | Log only. |
| `app/admin/consignment/page.jsx` | 189 | Non-blocking refresh | Log only. |
| `app/agent/consignment/page.jsx` | 86 | Non-blocking refresh | Log only. |

Plan task for Tier B: same `recordHealthEvent({ severity: 'warn' })` helper, no
admin alert by default — just visible in the admin health-events panel. No code
behaviour change.

## Tier C — leave as-is (or add a clarifying comment)

| File | Lines | Reason it's OK |
|------|-------|----------------|
| `app/App.jsx` | 426, 535, 563, 589, 608, 616 | localStorage write/remove failures, intentional UI-only fallback. No data is lost. |
| `app/components/AgentFolderBrowser.jsx` | 470 | UI redirect fallback. |
| `app/components/AuthProvider.jsx` | 115 | `} catch (e) {}` — auth state cleanup; user signs out on next request anyway. Worth replacing with `catch {}` for consistency, but no functional issue. |

## Cross-cutting findings

1. **Multiple "route 2.js" / "page 2.jsx" duplicates.** During the silent-catch
   sweep we found duplicated files (e.g. `app/api/agent-payments/route 2.js`,
   `app/api/events/[id]/access/route 2.js`, etc.). These shadow the real route
   when imports get confused and they often miss recent fixes. They are flagged
   in Phase 0.5 (de-dup pass) and must be deleted before any other work.

2. **`console.error` is treated as observability.** It isn't. We get no alert
   when these fire in production because Vercel function logs are not piped to
   anyone. The Phase 16 health-events table fixes this for Tier A and B without
   asking Sam to set up Sentry / DataDog yet.

3. **No test exercises the failure path.** None of the Tier A catches has a
   test that asserts `recordHealthEvent` is called when the underlying call
   fails. This is part of the Phase 11 test plan.

## Suggested execution order

1. Phase 16 migration (creates `system_health_events`).
2. Add `lib/healthEvent.js` helper.
3. Patch Tier A catches (3 sites) — gated by feature flag at first so we can
   roll back fast.
4. Patch Tier B catches (10 sites) — no flag, low risk.
5. Add Jest tests asserting `recordHealthEvent` is called on simulated failures
   for the Tier A sites.
