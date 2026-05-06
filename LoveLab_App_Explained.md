# LoveLab Fair Assistant — Full Explanation

A complete walkthrough of the app's purpose, user flow, architecture, data
model, and the reusable patterns you can lift into another app.

---

## 1. The problem in one sentence

**Trade-show business cards die in a stack on a desk.** This app turns
"100 photographed cards on an iPhone at the booth" into "100 personalized
emails sent in their native language, plus 100 leads in Salesforce" — in
under 10 minutes.

Target user is Sam's father Alberto (`alberto@love-lab.com`), who runs a
jewelry brand and meets buyers at fairs like Vicenzaoro and JCK Las Vegas.

---

## 2. The user flow (8 phone screens, mobile-first)

```
Login
  ↓
Home (list of past "batches" = past fairs)
  ↓
[+ NEW BATCH]
  ↓
Step 1: Name the fair ("Vicenzaoro Jan 2026")
  ↓
Step 2: Drop in / pick photos of all the cards (HEIC, JPEG, anything)
        Thumbnails fill in as photos upload in parallel
  ↓
[PROCESS BATCH] → fires n8n extraction workflow
  ↓
Step 3: LIVE extraction screen
  - Progress bar: "23 of 34 photos done"
  - Leads stream in as Claude OCRs each card (live via PocketBase realtime)
  - Failed photos collapsible at the bottom
  - Tap any lead to edit it inline
  ↓
[DRAFT OUTREACH] → chat with Claude
  - "Hi! You met 29 buyers. Want a warm follow-up or something direct?"
  - You iterate in English; Claude proposes a draft
  - When a draft is detected → [USE THIS DRAFT] CTA appears
  ↓
Send Review screen
  - Shows the English draft
  - Shows recipients with their detected language (IT, FR, DE, EN, ZH...)
  - "Preview in Italian" → see one translated example
  ↓
[SEND TO 29 LEADS] → fires n8n send workflow
  - n8n translates per-lead, personalizes, sends from
    alberto@love-lab.com via Outlook OAuth, logs activity in Salesforce
  ↓
Sending screen with live progress
  ↓
Batch Complete: "29 emails sent in 67 sec"
```

Hard constraint that drives every decision:
**100 cards processed and sent in under 10 minutes.**

---

## 3. The architecture — the part that's actually reusable

This is the most interesting part for grafting onto another app. It follows
Sam's agency manifesto ("**Shared Core, Isolated Clients**") — one VPS,
many client apps, shared LLM gateway.

```
┌─────────────────────────────────────────────────┐
│  iPhone Safari at fair.love-lab.com             │
│  (Next.js 14 App Router + Tailwind + shadcn/ui) │
└──────────────────────┬──────────────────────────┘
                       │ HTTPS
                       ▼
        ┌───────────────────────────────────┐
        │  FastAPI "thin orchestrator"      │
        │  (port 8000)                      │
        │  - Auth via PocketBase tokens     │
        │  - File upload / streaming        │
        │  - Mints HMAC + JWT for n8n       │
        │  - Receives n8n callbacks         │
        └────────┬─────────────────┬────────┘
                 │                 │
        ┌────────▼─────┐   ┌───────▼────────────────┐
        │  PocketBase  │   │  n8n (on Hostinger)    │
        │  (SQLite)    │   │  - extract-v3 workflow │
        │  - Auth      │   │  - send-v3 workflow    │
        │  - DB        │   │  - Salesforce + Outlook│
        │  - File store│   │  - heic-convert        │
        │  - Realtime  │   └──────────┬─────────────┘
        └──────────────┘              │
                                      ▼
                              ┌────────────────┐
                              │   LiteLLM      │
                              │   proxy        │ ← shared agency gateway
                              │ (Claude + GPT) │
                              │  + Langfuse    │ ← observability
                              └────────────────┘
```

### The roles of each piece (the mental model worth stealing)

| Layer | Tech | Job |
|-------|------|-----|
| **Frontend** | Next.js 14, Tailwind, shadcn/ui, TanStack Query, react-hook-form, zod, PocketBase JS SDK | Pure UI. Talks only to the backend + PocketBase realtime. Never talks to n8n directly. |
| **Backend** | FastAPI, httpx, structlog, Pydantic v2 | **Thin orchestrator only.** Doesn't do business logic. Auth, upload, "fire the right webhook with the right payload", receive callbacks, update DB. |
| **PocketBase** | Single binary, SQLite | DB + auth + file storage + realtime subscriptions, all in one. Frontend reads via PB JS SDK; backend writes as admin. |
| **n8n** | Visual workflow engine | The actual business logic — OCR, multi-contact parsing, language detection, Salesforce dedup, email sending. **Stays where it always was**, untouched. |
| **LiteLLM** | Self-hosted LLM proxy | Single API key for all LLM calls. Per-client rate limits + cost caps. Routes traces to Langfuse. |
| **Langfuse** | Cloud SaaS (free tier) | LLM observability — every call logged with cost, latency, prompt, response. |

---

## 4. The data model (5 PocketBase collections)

```
batches
├─ id, name, fairName, status (uploading | extracting | extracted |
│                              drafting | sending | complete | failed)
├─ createdBy → users
└─ totals: totalCards, totalContacts, totalSent, totalFailed

images (one row per uploaded photo)
├─ batch → batches
├─ file (the binary, stored in PB)
├─ status (uploaded | processing | processed | failed)
└─ error

leads (one row per extracted contact — a card can produce multiple)
├─ batch → batches
├─ image → images
├─ firstName, lastName, company, email, phone, title, address...
├─ language, languageLabel (detected: "it", "italian")
├─ salesforceId, salesforceUrl
├─ leadHash (sha256 of email+name+company — for idempotency)
├─ sent, sentAt, sentSubject, sentLanguage
└─ error

outreach_drafts (one per batch — the English template)
└─ batch, subject, bodyEnglish

chat_messages (the convo with Claude to draft the outreach)
└─ batch, role (user|assistant|system), content
```

The killer detail: **the frontend doesn't poll**. It opens a PocketBase
realtime subscription on the `leads` table filtered by batch. As n8n
inserts each lead, the subscription fires and the UI updates instantly.
Same pattern for batch status changes.

---

## 5. The 6 most reusable patterns (steal these)

### Pattern A — "Frontend never touches the workflow engine"

The frontend only knows about the backend. The backend is the only thing
that mints webhook URLs and signs them. n8n is invisible to the user.
**You can swap n8n for anything later** (Temporal, Inngest, plain
background workers) without changing a single frontend line.

### Pattern B — Two-layer auth between backend and n8n

- **Outbound (backend → n8n):** HMAC-SHA256 signature on the body, shared
  secret. Stops anyone who finds the webhook URL from triggering it.
- **Inbound (n8n → backend):** short-lived JWT (1 hour, scoped to one
  `batchId`), minted by the backend, echoed back by n8n. Easy to revoke
  per-batch.

The contract is fully spelled out in `CONTRACT_BACKEND_N8N.md` — that
document is the keystone the whole thing hangs from.

### Pattern C — Idempotent callbacks via deterministic hash

n8n can produce 1, 2, or 3 leads per card (multi-contact cards). Webhooks
may retry. **Solution:** every lead has a
`leadHash = sha256(email + firstName + lastName + company)`, and
PocketBase has a unique index on `(batch, image, leadHash)`. Second
insert with the same key is a no-op `200 OK`. **This pattern works for any
"external system pushes results back" integration.**

### Pattern D — File abstraction via streaming endpoint

n8n doesn't fetch images directly from PocketBase. It calls
`GET /internal/images/{id}/raw` on the backend with a service token; the
backend streams bytes via FastAPI `StreamingResponse`. Storage is
swappable (PB → S3 → R2) with zero changes to n8n.

### Pattern E — Live progress via realtime subscriptions, not polling

The "Extracting…" screen subscribes to PocketBase realtime on the `leads`
collection filtered by `batch="abc123"`. Every time n8n writes a lead, the
UI updates. **No backend SSE, no WebSockets to manage** — PocketBase
already does it for free.

### Pattern F — LiteLLM as the single LLM seam

Everything that calls an LLM (the chat with Claude in the app, *and* the
translation step inside n8n) goes through the same LiteLLM URL with a
virtual key (`sk-lovelab-client`). One place to:

- Swap models (Claude → GPT-4 → local)
- Cap monthly spend (`$50/month` hard cap per virtual key)
- See traces in Langfuse alongside each other

---

## 6. The "vertical slice" mental flow you can copy

Here's the abstract template hidden in this app — apply it to your other one:

```
USER ACTION (upload a thing)
  ↓
FRONTEND → BACKEND (just stores the input + creates a "job" row)
  ↓
BACKEND fires HMAC-signed webhook to WORKFLOW ENGINE with:
  - jobId
  - signed callback URL
  - JWT scoped to that job
  - URLs the engine should call back to fetch input
  ↓
WORKFLOW ENGINE does the heavy work, calls back N times:
  - one callback per "result item" (idempotent via hash)
  - one callback per error
  - one final "complete" callback with summary
  ↓
BACKEND writes results to DB
  ↓
FRONTEND sees them appear instantly via realtime subscription
  ↓
USER reviews / chats with LLM to refine
  ↓
FINAL action fires a second workflow with the user's curated decision
  ↓
Same callback pattern repeats
```

If your other app has anything that looks like:

- "User uploads → AI/automated processing → user reviews → user triggers
  final action"
- "Per-item results come in over time, want live UI"
- "Need a workflow engine for legacy integrations (Salesforce, HubSpot,
  email, CRMs)"

…then this whole template drops in.

---

## 7. Where the project actually is right now

From `PROJECT_STATUS.md`:

- **Phase 1 (infra setup): planned, not yet executed** — Coolify + LiteLLM
  + Langfuse + production PocketBase on the VPS
- **Phase 2 (backend): scaffold exists** with all the right files and
  routers (`batches`, `chat`, `n8n_callbacks`, `internal`), implementations
  partially fleshed out
- **Phase 3 (n8n v3 workflows): exists as JSON in the repo**
  (`lovelab_workflow_v3_extract.json`, `lovelab_workflow_v3_send.json`)
- **Phase 4 (8 frontend screens): scaffolded, screens partly built**
- **Phase 5 (polish, CI/CD, backups): not yet started**

The whole architecture and contracts are nailed down on paper — the app is
more "specced and partially scaffolded" than "running and shipping". For
grafting purposes, the spec docs (`CONTRACT_BACKEND_N8N.md`,
`PHASE_2_BACKEND_SPEC.md`, `PHASE_4_FRONTEND_SPEC.md`) are essentially
clean reference material you can read like a textbook.

---

## 8. To map this onto another existing app, answer these four

1. **What's the equivalent of "100 cards"?** What gets uploaded / dropped
   in / created in bulk?
2. **What's the equivalent of "send 100 emails"?** What's the bulk action
   at the end?
3. **What does the existing app already use** for: DB, auth, frontend
   framework, LLM access?
4. **What's the legacy integration that has to stay?** (Salesforce +
   Outlook here — what's the equivalent?)

With those four answers, the LoveLab pattern maps cleanly onto another
app's structure.
