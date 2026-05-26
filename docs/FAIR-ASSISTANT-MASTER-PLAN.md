# Fair Assistant — Master Plan & Handoff

> **Last updated:** 2026-05-20  
> **For:** Sam — continue in Claude Code or Cursor  
> **Repo:** `~/Developer/lovelab-mini-b2b`  
> **Branch:** `feature/fair-assistant` (code built, **NOT committed yet**)  
> **Admin UI:** `/admin/fair-assistant`  
> **Start here in a new session:** *"Read docs/FAIR-ASSISTANT-MASTER-PLAN.md and continue setup from WHERE WE ARE NOW."*

---

## Table of contents

1. [What this is (plain English)](#1-what-this-is-plain-english)
2. [The big plan — end-to-end flow](#2-the-big-plan--end-to-end-flow)
3. [Product decisions (locked)](#3-product-decisions-locked)
4. [Architecture](#4-architecture)
5. [What was built in code](#5-what-was-built-in-code)
6. [The automations (n8n)](#6-the-automations-n8n)
7. [Environment variables](#7-environment-variables)
8. [Google Drive folders](#8-google-drive-folders)
9. [WHERE WE ARE NOW — status checklist](#9-where-we-are-now--status-checklist)
10. [Setup steps — what to do next](#10-setup-steps--what-to-do-next)
11. [Step 4 explained — n8n callback (the confusing part)](#11-step-4-explained--n8n-callback-the-confusing-part)
12. [How to duplicate the n8n workflow](#12-how-to-duplicate-the-n8n-workflow)
13. [Testing checklist](#13-testing-checklist)
14. [Phase 2 — send workflow (later)](#14-phase-2--send-workflow-later)
15. [Git workflow](#15-git-workflow)
16. [File index](#16-file-index)
17. [Troubleshooting](#17-troubleshooting)

---

## 1. What this is (plain English)

**Fair Assistant** is a feature inside the existing LoveLab B2B app (`lovelab-mini-b2b`). It is **NOT** a separate app.

**Who uses it:** Alberto (`alberto@love-lab.com`) at trade fairs.

**What he does:**
1. Opens the app on his iPhone → `/admin/fair-assistant`
2. Creates a batch (e.g. "Baselworld 2026")
3. Uploads business card photos **inside the app** (NOT manually in Google Drive)
4. Watches leads appear live in the Leads tab
5. Writes one English outreach email template
6. App translates per country/language via Claude
7. Sends branded HTML emails via Gmail
8. Everything logs to Salesforce (existing pipeline)

**Speed target:** ~100 cards processed and emailed in under 10 minutes.

**Important:** Alberto **never opens Google Drive**. Drive is invisible backend storage — the app uploads there automatically, then n8n picks up the file.

---

## 2. The big plan — end-to-end flow

### Phase A — Extract leads (building now)

```
┌─────────────────────────────────────────────────────────────────┐
│  ALBERTO (iPhone)                                               │
│  /admin/fair-assistant → Upload tab                             │
│  Select/take card photos                                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  NEXT.JS APP (Vercel)                                           │
│  1. Upload photo → Google Drive inbox folder (automatic)        │
│  2. Save row in Supabase (fair_images, fair_batches)            │
│  3. POST to n8n webhook with file ID + batchId + imageId        │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  N8N — fair-assistant-extract (CLONED workflow)                 │
│  Webhook → Download from Drive → GPT OCR → Parse → Validate     │
│  → Country detect → Salesforce dedup/create                     │
│  → ★ CALLBACK TO APP ★ (Step 4 — NOT DONE YET)                  │
│  → Move file to Processed folder                                │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  APP Leads tab (Supabase realtime)                              │
│  Lead appears with name, company, email, country, language      │
└─────────────────────────────────────────────────────────────────┘
```

### Phase B — Outreach (code built, send automation later)

```
Alberto → Outreach tab
  → Write headline + paragraphs + signoff (English)
  → Optional: Claude chat panel to refine copy
  → Preview branded HTML email (logo + products + lovelab.be)
  → "Generate all" → Claude translates per lead country
  → "Send" → n8n send workflow → Gmail HTML → callback to app
```

---

## 3. Product decisions (locked)

| Decision | Rule |
|---|---|
| No web research | No Perplexity. Only translate + personalize `{firstName}`, `{company}`, `{fairName}`. |
| Greeting | If no first name → **"Hi,"** only. Never "Hi Unknown". |
| Bilingual countries | Belgium = FR + NL in one email. Same idea for CH, CA, LU. |
| Email shell | Klaviyo-inspired branded HTML. Logo top. Variable text slots. Fixed lovelab.be line. Fixed 2×2 product grid. |
| Claude chat | Panel to help draft/refine outreach templates. |
| Source of truth | Supabase for fair workflow. Salesforce = one-way downstream sink. |
| n8n strategy | **Do NOT edit original workflow.** Clone it. Original = backup. |
| User entry point | **Always start in the app.** Never manual Drive upload for Fair Assistant. |

### Fixed product grid in every email

| Product | Link |
|---|---|
| CUTY Bordeaux | https://lovelab.be/collections/cuty/010 |
| TRIPLY Gold mix | https://lovelab.be/collections/multi/three/mix |
| MATCHY Pear Navy Blue | https://lovelab.be/collections/matchy/pear |
| CUBIX Green | https://lovelab.be/collections/cube/product |

---

## 4. Architecture

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19 — `FairAssistantClient.jsx` |
| Database | Supabase PostgreSQL — 4 new tables |
| Realtime | Supabase realtime on `fair_leads`, `fair_batches`, `fair_email_drafts` |
| AI | Anthropic Claude (translate + outreach chat) |
| OCR + CRM | Existing n8n workflow (cloned) — GPT-4.1 + Salesforce |
| File storage | Google Drive (inbox → processed/errors) — app uploads, n8n downloads |
| Email send | Gmail via n8n (send workflow — not built yet) |
| Hosting | Vercel |
| n8n host | `https://n8n.srv1074816.hstgr.cloud` (Hostinger) |

### Security between app and n8n

Shared secret in header `X-Fair-Auth` on every cross-call:
- App → n8n (upload trigger)
- n8n → app (callback)
- App → n8n (send trigger)
- n8n → app (send callback)

**Current value:** `Secret - Lovelab`

---

## 5. What was built in code

All on branch `feature/fair-assistant`. **Not committed.**

### Database ✅ APPLIED in Supabase production

File: `database-migrations/supabase-phase23-fair-assistant.sql`

| Table | Purpose |
|---|---|
| `fair_batches` | One batch per fair session (name, template text, status, counts) |
| `fair_images` | Each uploaded card photo (Drive file ID, processing status) |
| `fair_leads` | Extracted contact (name, email, country, language, Salesforce ID) |
| `fair_email_drafts` | Per-lead translated email (subject, HTML body, send status) |

RLS: admin-only via `is_admin()`. Realtime enabled.

### Admin UI

| File | Purpose |
|---|---|
| `app/admin/fair-assistant/page.jsx` | Page shell |
| `app/components/FairAssistantClient.jsx` | Main UI — 3 tabs: Upload, Leads, Outreach |
| `app/components/FairOutreachChatPanel.jsx` | Claude chat to refine templates |
| `lib/navItems.js` | Nav link added |
| `app/admin/layout.jsx` | Admin nav updated |

### API routes (`app/api/fair-assistant/`)

| Route | Method | Purpose |
|---|---|---|
| `/batches` | GET, POST | List / create batches |
| `/batches/[id]` | GET, PATCH | Batch detail + update template fields |
| `/upload` | POST | Upload to Drive + trigger n8n |
| `/callback` | POST | **n8n reports leads back to app** |
| `/preview` | POST | Preview branded HTML for one lead |
| `/chat` | POST | Claude outreach assistant |
| `/generate-all` | POST | Translate + build all email drafts |
| `/send` | POST | Trigger n8n send workflow |
| `/drafts` | GET | n8n fetches ready drafts |
| `/send-callback` | POST | n8n reports sent/failed |
| `/retry-failed` | POST | Retry failed sends |

### Lib modules (`lib/fair-assistant/`)

| File | Purpose |
|---|---|
| `auth.js` | Verify `X-Fair-Auth` header |
| `schemas.js` | Validate callback payloads, normalize lead fields |
| `languages.js` | Country → language mapping (BE = fr+nl, etc.) |
| `greeting.js` | "Hi," vs "Hi {firstName}," logic |
| `email-products.js` | Fixed 2×2 product grid |
| `email-shell.js` | Branded HTML email template |
| `templates.js` | Outreach template presets |
| `translate.js` | Claude translation per lead |
| `n8n.js` | Trigger extract + send webhooks |
| `server.js` | Admin auth helper |

Also: `lib/ai/anthropic.js` — shared Claude client.

### Tests & docs

- `lib/__tests__/fair-assistant.test.js` — 5 tests passing
- `docs/fair-assistant-n8n.md` — n8n integration reference
- `.env.example` — Fair Assistant env vars documented

---

## 6. The automations (n8n)

### Three workflows — understand the difference

| Workflow | Status | Trigger | Purpose |
|---|---|---|---|
| **Original** (existing) | Keep as backup | Old webhook OR manual Drive | Alberto drops files in Drive manually → OCR → Salesforce → Gmail notify |
| **fair-assistant-extract** (clone) | **NOT CREATED YET** | App webhook `fair-assistant-extract` | App upload → same OCR logic → **callback to app** → Processed folder |
| **fair-assistant-send** (new) | Not built yet | App webhook | Fetch drafts → Gmail HTML send → callback |

### Original workflow (DO NOT EDIT)

- **Host:** `n8n.srv1074816.hstgr.cloud`
- **Original webhook path:** `3d1df2d6-22a1-4e65-a402-5198045b3ae0`
- **Flow:** Webhook → Filter Images → Download Business Card → Analyze (GPT) → Parse Info → Validate and Clean Data → Country Extractor → Check Duplicate → IF → Create Salesforce Lead → Gmail Notification → Move to Processed
- **Error paths:** → Move to Errors Folder
- **Credentials in n8n:** ASDrive (Google), Salesforce, Gmail (`albertosaleh@gmail.com`), OpenAI

### fair-assistant-extract (clone — TO CREATE)

Same middle nodes as original. Two differences:

1. **Webhook path:** `fair-assistant-extract`  
   URL: `https://n8n.srv1074816.hstgr.cloud/webhook/fair-assistant-extract`

2. **New HTTP Request node** after Create Salesforce Lead → POST to app callback

**What the app sends when Alberto uploads a photo:**

```json
{
  "body": {
    "id": "GOOGLE_DRIVE_FILE_ID",
    "mimeType": "image/jpeg"
  },
  "batchId": "uuid-from-supabase",
  "imageId": "uuid-from-supabase"
}
```

The Download Business Card node uses `{{ $json.body.id }}` for the file ID (same as today).

### What n8n must send back (callback — Step 4)

```json
{
  "event": "lead_created",
  "batchId": "{{ $('Webhook').item.json.batchId }}",
  "imageId": "{{ $('Webhook').item.json.imageId }}",
  "lead": {
    "firstName": "{{ $('Validate and Clean Data').item.json.firstName }}",
    "lastName": "{{ $('Validate and Clean Data').item.json.lastName }}",
    "company": "{{ $('Validate and Clean Data').item.json.company }}",
    "email": "{{ $('Validate and Clean Data').item.json.email }}",
    "phone": "{{ $('Validate and Clean Data').item.json.phone }}",
    "mobilephone": "{{ $('Parse Info').item.json.mobilephone }}",
    "title": "{{ $('Validate and Clean Data').item.json.title }}",
    "country": "{{ $('Validate and Clean Data').item.json.country }}",
    "street": "{{ $('Validate and Clean Data').item.json.street }}",
    "city": "{{ $('Validate and Clean Data').item.json.city }}",
    "state": "{{ $('Validate and Clean Data').item.json.state }}",
    "postalCode": "{{ $('Validate and Clean Data').item.json.postalCode }}",
    "salesforceId": "{{ $('Create Salesforce Lead1').item.json.id }}"
  }
}
```

On failure:
```json
{
  "event": "lead_failed",
  "batchId": "{{ $('Webhook').item.json.batchId }}",
  "imageId": "{{ $('Webhook').item.json.imageId }}",
  "error": "processing failed"
}
```

---

## 7. Environment variables

### Vercel (production)

| Variable | Value | Status |
|---|---|---|
| `FAIR_WEBHOOK_SECRET` | `Secret - Lovelab` | ✅ DONE |
| `FAIR_N8N_WEBHOOK_URL` | `https://n8n.srv1074816.hstgr.cloud/webhook/fair-assistant-extract` | ✅ DONE |
| `FAIR_DRIVE_INBOX_FOLDER_ID` | `1nBu_tYjyXttYron_7h0H4hDynB2HhYaM` | ✅ DONE (Step 3, redeployed) |
| `FAIR_N8N_SEND_WEBHOOK_URL` | (empty) | ⏳ Later — send workflow not built |
| `GOOGLE_DRIVE_REFRESH_TOKEN` etc. | (existing) | ✅ Should already exist |
| `ANTHROPIC_API_KEY` | (existing) | ✅ Needed for translate + chat |
| `NEXT_PUBLIC_SITE_URL` | Your Vercel URL | ⚠️ Confirm — needed for n8n callback URL |

**App URL (likely):** `https://lovelab-b2b.vercel.app` — verify in Vercel → Domains.

### Local `.env` (for dev)

Copy from `.env.example`. Same Fair Assistant vars as Vercel.

---

## 8. Google Drive folders

Path: `My Drive > Business Cards Love Lab > Business Cards not Processed`

| Role | Folder name | ID |
|---|---|---|
| **Inbox** (app uploads here automatically) | Business Cards not Processed | `1nBu_tYjyXttYron_7h0H4hDynB2HhYaM` |
| **Processed** (n8n moves after success) | (configured in n8n workflow) | `1OrCRtd66TyfXQVx7kr8PNaceu9fMfQDl` |
| **Errors** (n8n moves on failure) | (configured in n8n workflow) | `1U4vj655wQVZnM5fv3CjhHMSVcUZknYlx` |

App and n8n must use the **same Google account** (ASDrive credential in n8n).

---

## 9. WHERE WE ARE NOW — status checklist

### Done ✅

- [x] Product spec and architecture decisions locked
- [x] Supabase migration written AND applied in production
- [x] Full app code built (UI + 11 API routes + lib modules)
- [x] Tests written (5 passing)
- [x] n8n integration doc written
- [x] Vercel env: `FAIR_WEBHOOK_SECRET`
- [x] Vercel env: `FAIR_N8N_WEBHOOK_URL`
- [x] Vercel env: `FAIR_DRIVE_INBOX_FOLDER_ID` + redeployed
- [x] n8n webhook path changed to `fair-assistant-extract` (may be on original workflow — see note below)

### Not done yet ❌

- [ ] **Duplicate n8n workflow** → rename clone `fair-assistant-extract` (see Section 12)
- [ ] **Add callback HTTP node** in cloned workflow (Section 11) — **CRITICAL: leads won't appear without this**
- [ ] **Deploy branch** to Vercel preview (push `feature/fair-assistant`)
- [ ] **End-to-end test** — upload 1 card → lead in Leads tab
- [ ] **Commit + push** all code on `feature/fair-assistant`
- [ ] **Build send workflow** (`fair-assistant-send`) — Phase 2
- [ ] **PR + merge** when ready

### Important note about n8n

Sam may have changed the webhook path on the **original** workflow instead of creating a **duplicate**. That works for testing but removes the backup.

**Recommended:** Duplicate now (Section 12), revert original webhook to old path, add callback only on clone.

---

## 10. Setup steps — what to do next

Do these **in order**:

### Step 1 — Duplicate n8n workflow ⏳ YOU ARE HERE

See [Section 12](#12-how-to-duplicate-the-n8n-workflow). Takes ~2 minutes.

### Step 2 — Add callback HTTP node ⏳ NEXT

See [Section 11](#11-step-4-explained--n8n-callback-the-confusing-part).

### Step 3 — Commit and push code

```bash
cd ~/Developer/lovelab-mini-b2b
git add -A
git commit -m "feat: Fair Assistant — card upload, leads table, outreach drafts"
git push -u origin feature/fair-assistant
```

Vercel will create a preview deploy. Use preview URL in n8n callback if production doesn't have the feature yet.

### Step 4 — End-to-end test

See [Section 13](#13-testing-checklist).

### Step 5 — Send workflow (later)

See [Section 14](#14-phase-2--send-workflow-later).

---

## 11. Step 4 explained — n8n callback (the confusing part)

### Why it's needed

Without the callback, n8n still:
- Reads the card ✅
- Creates Salesforce lead ✅

But the app **never hears about it** → Leads tab stays empty ❌

The callback is n8n saying: *"Hey app, here's the contact I extracted."*

### Where to add it in the workflow

Your existing workflow looks like:

```
Webhook → … → Create Salesforce Lead1 → Gmail Notification1 → Move to Processed Folder1
```

Change to (on the **clone** only):

```
Webhook → … → Create Salesforce Lead1 → [HTTP Request: callback] → Move to Processed Folder1
```

You can remove Gmail Notification1 from the clone (the app replaces it).

### HTTP Request node settings

| Setting | Value |
|---|---|
| **Method** | POST |
| **URL** | `https://lovelab-b2b.vercel.app/api/fair-assistant/callback` |
| **Authentication** | None |
| **Header** | `X-Fair-Auth` = `Secret - Lovelab` |
| **Body type** | JSON |
| **Body** | See JSON in [Section 6](#what-n8n-must-send-back-callback--step-4) |

Replace URL with your actual Vercel domain if different.

### After saving

- Save workflow
- Toggle **Active** ON
- Test with 1 card upload from app

---

## 12. How to duplicate the n8n workflow

**There is no automatic new workflow.** You create it manually in n8n:

1. Go to n8n → **Workflows** list (not inside a workflow)
2. Find your business card workflow
3. Click **⋯** (three dots) on the workflow card
4. Click **Duplicate**
5. Open the **copy** (NOT the original)
6. Rename to: **`fair-assistant-extract`**
7. Open the **Webhook** node (first node)
8. Set path to: **`fair-assistant-extract`**
9. Save
10. Add callback HTTP node (Section 11)
11. Activate the clone

**On the ORIGINAL workflow:**
- Revert webhook path to: `3d1df2d6-22a1-4e65-a402-5198045b3ae0` (if you changed it)
- Leave everything else alone — this is Alberto's manual backup

You should now see **two workflows** in n8n.

---

## 13. Testing checklist

### Extract flow (Phase A)

1. [ ] Branch deployed to Vercel (preview or production)
2. [ ] Log in as admin → go to `/admin/fair-assistant`
3. [ ] Create a new batch (e.g. "Test May 20")
4. [ ] Upload **1 test business card photo**
5. [ ] Check n8n → Executions → run should be green
6. [ ] HTTP callback node should return **200**
7. [ ] App → Leads tab → contact should appear within seconds
8. [ ] Salesforce → lead should exist (same as before)
9. [ ] Drive → file moved to Processed folder

### Outreach flow (Phase B — after extract works)

1. [ ] Go to Outreach tab
2. [ ] Fill headline, paragraph1, paragraph2, signoff
3. [ ] Click Preview on one lead → branded HTML shows
4. [ ] Click "Generate all" → drafts created per language
5. [ ] (Later) Click Send → emails go out via n8n

---

## 14. Phase 2 — send workflow (later)

Build new n8n workflow: **`fair-assistant-send`**

1. **Trigger:** Webhook POST `{ "batchId": "..." }` — app sends when Alberto clicks Send
2. **HTTP GET** `https://YOUR-APP/api/fair-assistant/drafts?batchId=...`  
   Header: `X-Fair-Auth: Secret - Lovelab`
3. **Split in batches** (1 at a time)
4. **Wait** 2 seconds (throttle)
5. **Gmail** — send HTML from draft (`body_html`, `subject`, to lead email)
6. **HTTP POST** `/api/fair-assistant/send-callback` with `event: email_sent` or `email_failed`
7. After last item: `event: send_complete`

Then add to Vercel:
```
FAIR_N8N_SEND_WEBHOOK_URL=https://n8n.srv1074816.hstgr.cloud/webhook/fair-assistant-send
```

---

## 15. Git workflow

- All Fair Assistant work on branch **`feature/fair-assistant`**
- Bug fixes on `main` → merge `main` into `feature/fair-assistant`
- Do NOT commit Fair Assistant work directly to `main` until PR approved

**Current git state (2026-05-20):**
```
Branch: feature/fair-assistant
Modified: .env.example, app/admin/layout.jsx, lib/navItems.js
Untracked: all fair-assistant files (admin page, API routes, lib, migration, docs, tests)
Last commit on branch: b199fe6 fix: order PDF last page size...
NOT COMMITTED
```

---

## 16. File index

```
lovelab-mini-b2b/
├── docs/
│   ├── FAIR-ASSISTANT-MASTER-PLAN.md    ← THIS FILE
│   └── fair-assistant-n8n.md            ← n8n technical reference
├── database-migrations/
│   └── supabase-phase23-fair-assistant.sql
├── app/
│   ├── admin/fair-assistant/page.jsx
│   ├── components/
│   │   ├── FairAssistantClient.jsx
│   │   └── FairOutreachChatPanel.jsx
│   └── api/fair-assistant/
│       ├── batches/route.js
│       ├── batches/[id]/route.js
│       ├── upload/route.js
│       ├── callback/route.js
│       ├── preview/route.js
│       ├── chat/route.js
│       ├── generate-all/route.js
│       ├── send/route.js
│       ├── drafts/route.js
│       ├── send-callback/route.js
│       └── retry-failed/route.js
└── lib/
    ├── fair-assistant/
    │   ├── auth.js, schemas.js, languages.js, greeting.js
    │   ├── email-products.js, email-shell.js, templates.js
    │   ├── translate.js, n8n.js, server.js
    └── ai/anthropic.js
    └── __tests__/fair-assistant.test.js
```

---

## 17. Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| Upload fails "FAIR_DRIVE_INBOX_FOLDER_ID not configured" | Env var missing on Vercel | Add var, redeploy |
| Upload fails "failed to trigger processing" | n8n webhook URL wrong or workflow inactive | Check URL + activate workflow |
| n8n runs green but Leads tab empty | **Callback node missing** | Add HTTP Request node (Section 11) |
| Callback returns 401 | Wrong `X-Fair-Auth` header | Must match `FAIR_WEBHOOK_SECRET` exactly |
| Callback returns 400 | Malformed JSON body | Copy exact body from Section 6 |
| Lead in Salesforce but not app | Callback not connected after Create Lead | Wire node between SF and Move to Processed |
| "Batch not found" on upload | Supabase migration not applied | Run migration SQL |
| Feature page 404 | Branch not deployed | Push branch, use preview URL |

---

## Quick start for Claude Code

Paste this when opening a new session:

```
I'm continuing the LoveLab Fair Assistant setup.

Read: ~/Developer/lovelab-mini-b2b/docs/FAIR-ASSISTANT-MASTER-PLAN.md

We are at Section 9 — need to:
1. Duplicate n8n workflow to fair-assistant-extract
2. Add callback HTTP node
3. Commit + push feature/fair-assistant
4. Test end-to-end

App code is built. Supabase migration applied. Vercel env vars done.
n8n clone + callback NOT done yet.
```

---

*Document created 2026-05-20 for handoff from Cursor to Claude Code.*
