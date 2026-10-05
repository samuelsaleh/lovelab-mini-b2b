# Endpoint reference

155 route files, 209 handlers, all under `app/api/` (plus `app/auth/callback`).
Grouped here by domain. Each page lists every route with its guard, rate limit,
inputs and outputs, and the side effects that matter (emails, ERP calls,
commission recalculation).

Legend used on every page:

| Mark | Meaning |
|---|---|
| **S** | any signed-in user (session cookies) |
| **A** | admin (`profiles.role = 'admin'`) |
| **A/self** | admin, or the agent whose id is in the path |
| **IGI** | `profiles.is_igi = true`, RLS-bound client |
| **Cron** | header `x-vercel-cron-secret` |
| **Webhook** | shared secret or signature, see page |
| **Public** | no authentication |
| RL *n* | rate limit, *n* requests per minute per IP |

| Page | Routes | Scope |
|---|---|---|
| [auth-and-session.md](auth-and-session.md) | 9 | OAuth callback, magic link, password reset, signup requests, `/api/me` |
| [documents-and-orders.md](documents-and-orders.md) | 17 | documents CRUD, upload, preview, send by email, trash/restore/purge, bulk filing, autosave drafts |
| [clients-and-lookups.md](clients-and-lookups.md) | 9 | client book, VAT (VIES), Anthropic and Perplexity proxies, analytics chat, ERP party search and agent discount |
| [events-and-access.md](events-and-access.md) | 8 | folders (fairs, agent folders), sharing grants |
| [agent-folders.md](agent-folders.md) | 10 | private file folders per agent, org folder sidebar |
| [agents.md](agents.md) | 15 | invite, update, trash, commission config, contracts, new-client bonus, repair, reset password |
| [commissions-and-payments.md](commissions-and-payments.md) | 19 | commission ledger, customer-paid, settlement, payouts, monthly Excel reports |
| [staff.md](staff.md) | 8 | employees (admins) and commercial assistants |
| [organizations.md](organizations.md) | 14 | partner companies, members, invitations, ledger, stats, folders |
| [packs.md](packs.md) | 12 | packs, visibility, fairs, hide/pin, Excel templates |
| [fair-assistant.md](fair-assistant.md) | 29 | batches, card upload, n8n callbacks, leads, drafts, chat, send, templates |
| [price-lists-resources-reports.md](price-lists-resources-reports.md) | 11 | price list announcements, resource emails, Synalia report, saved reports |
| [consignment-and-erp.md](consignment-and-erp.md) | 8 | consignment, contacts, ERP undo-return, out memos |
| [igi-lovelab.md](igi-lovelab.md) | 32 | the LoveLab side of the certificate module and the admin preview of IGI's portal |
| [igi-portal.md](igi-portal.md) | 8 | what IGI's own accounts can call |
| [email-and-webhooks.md](email-and-webhooks.md) | 2 | Resend webhook, delivery refresh |
| [cron-and-backup.md](cron-and-backup.md) | 6 | the five scheduled jobs and the backup |

Shared helpers referenced throughout:

| Helper | File | Role |
|---|---|---|
| `getUserContext`, `requireEventPermission`, `canAccessDocument`, `resolveAgentIds`, `getOrgTeamScope` | `app/api/_lib/access.js` | authorization |
| `requireSession`, `isAdmin`, `requireOrganizationAccess` | `lib/organizations/authz.js` | organization routes |
| `requireFairAdmin`, `verifyFairWebhookSecret` | `lib/fair-assistant/server.js`, `lib/fair-assistant/auth.js` | fair assistant |
| `requireLoveLab`, `fail` | `app/api/igi/_lib/access.js` | IGI, LoveLab side |
| `requireIgi`, `loadIgiWorld` | `app/api/igi-portal/_lib/` | IGI portal |
| `checkRateLimit` | `lib/rateLimit.js` | 429s |
| `createClient`, `createAdminClient` | `lib/supabase/server.js` | RLS-bound vs service role |
| `sendEmail` | `lib/send-email.js` | Resend wrapper, never throws |
| `recordHealthEvent` | `lib/healthEvent.js` | alerts |
