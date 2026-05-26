# Fair Assistant — n8n integration

**Important:** Do **not** edit your existing Google Drive card workflow. Leave it as backup.
Duplicate it twice in n8n so you end up with **3 workflows**:

| Workflow | Purpose | Touch existing? |
|---|---|---|
| **Original** (today) | Alberto drops photos in Drive manually → OCR → Salesforce | **Leave alone — backup** |
| **fair-assistant-extract** (new) | App uploads photo → same OCR logic → callback to app | Clone + add callbacks |
| **fair-assistant-send** (new) | App clicks Send → Gmail HTML emails → callback to app | Build new |

---

## Where to put each variable (plain English)

You need the **same values in two places**: your app (Vercel + local `.env`) and your n8n HTTP nodes (header).

### 1. `FAIR_WEBHOOK_SECRET` — a shared password

**What it is:** A secret only your app and n8n know. Like a door code. Stops random people from calling your webhook URLs.

**What to put:** Any long random string you invent once. Examples:

```
FAIR_WEBHOOK_SECRET=lovelab-fair-2026-xK9mP2vL8nQ4wR7
```

Or generate one in Terminal:

```bash
openssl rand -hex 24
```

Copy the output and use it as the value.

**Where to add it:**

| Place | How |
|---|---|
| **Local dev** | File `.env` in project root (create from `.env.example`) |
| **Vercel** | Project → Settings → Environment Variables → Add `FAIR_WEBHOOK_SECRET` |
| **n8n** | In each HTTP Request node to your app, add header: `X-Fair-Auth` = paste the **exact same string** |

You do **not** need a special account or service for this — you make it up once and reuse it everywhere.

---

### 2. `FAIR_N8N_WEBHOOK_URL` — URL of the **new** extract workflow

**What it is:** The webhook address n8n gives you when you create the **cloned** extract workflow (not the old one).

**What to put:**

1. In n8n, duplicate your existing card workflow → rename `fair-assistant-extract`
2. Open the **Webhook** trigger node at the start
3. Copy **Production URL** (looks like `https://your-n8n.com/webhook/abc123...`)
4. Paste into:

```
FAIR_N8N_WEBHOOK_URL=https://your-n8n.com/webhook/abc123...
```

**Where to add it:** Vercel + local `.env` only (the app calls n8n — n8n does not need this variable).

---

### 3. `FAIR_N8N_SEND_WEBHOOK_URL` — URL of the **new** send workflow

**What it is:** Same idea, but for the send-outreach workflow you build later.

**What to put:** Webhook Production URL from the `fair-assistant-send` workflow.

**Where to add it:** Vercel + local `.env` only.

You can leave this empty until the send workflow exists. Upload + leads will still work without it.

---

### 4. `FAIR_DRIVE_INBOX_FOLDER_ID` — Google Drive folder for incoming photos

**What it is:** The folder where the app uploads card photos before n8n processes them.

**What to put:**

1. Open the Google Drive folder you use today for card inbox (or create a new one)
2. Look at the browser URL:

```
https://drive.google.com/drive/folders/1OrCRtd66TyfXQVx7kr8PNaceu9fMfQDl
                                      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                      this part is the folder ID
```

3. Paste:

```
FAIR_DRIVE_INBOX_FOLDER_ID=1OrCRtd66TyfXQVx7kr8PNaceu9fMfQDl
```

**Where to add it:** Vercel + local `.env` only.

---

## Summary checklist

```
[ ] Supabase migration run (supabase-phase23-fair-assistant.sql)
[ ] FAIR_WEBHOOK_SECRET invented + same value in Vercel, .env, and n8n HTTP headers
[ ] FAIR_DRIVE_INBOX_FOLDER_ID from Google Drive URL
[ ] Clone existing workflow → fair-assistant-extract (do NOT edit original)
[ ] FAIR_N8N_WEBHOOK_URL = Production URL from cloned extract workflow
[ ] Add callback HTTP nodes to cloned extract workflow only
[ ] Build fair-assistant-send workflow (later)
[ ] FAIR_N8N_SEND_WEBHOOK_URL = Production URL from send workflow
```

---

## 1. Clone extract workflow (keep original as backup)

In n8n:

1. Open your **existing** card workflow
2. **Duplicate** it (three dots → Duplicate)
3. Rename duplicate to **`fair-assistant-extract`**
4. **Deactivate or leave original active** — both can coexist

The app calls **only** the new webhook URL (`FAIR_N8N_WEBHOOK_URL`). The old workflow still works if Alberto drops files in Drive the manual way.

### What the app sends when you upload a photo

Your Next.js app POSTs to the **new** webhook:

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

The cloned workflow's first Webhook node receives this. The **Download Business Card** node should still use `{{ $json.body.id }}` for the file id (same as today).

### Add callback nodes (cloned workflow only)

After **Create Salesforce Lead1** (success), add **HTTP Request**:

- **Method:** POST
- **URL:** `https://YOUR-APP-DOMAIN/api/fair-assistant/callback`
- **Header:** `X-Fair-Auth` = your `FAIR_WEBHOOK_SECRET` string (paste literally, or `$env.FAIR_WEBHOOK_SECRET` if set on Hostinger)
- **Body:**

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

On error paths, POST:

```json
{
  "event": "lead_failed",
  "batchId": "{{ $('Webhook').item.json.batchId }}",
  "imageId": "{{ $('Webhook').item.json.imageId }}",
  "error": "processing failed"
}
```

You can **remove** the internal Gmail notification node from the clone if you want (optional — the app UI replaces it).

---

## 2. New send-outreach workflow (`fair-assistant-send`)

**Trigger:** Webhook POST `{ "batchId": "..." }` — app sends this when Alberto clicks Send.

**Steps:**

1. HTTP GET `https://YOUR-APP/api/fair-assistant/drafts?batchId=...`
   - Header: `X-Fair-Auth: your-secret-string`
2. Split in batches (1 at a time)
3. Wait 2 seconds
4. Gmail — HTML email from draft (`body_html`, `subject`, lead email)
5. HTTP POST `https://YOUR-APP/api/fair-assistant/send-callback` with `event: email_sent` or `email_failed`
6. After last item: `event: send_complete`

---

## 3. Supabase migration

Run [`database-migrations/supabase-phase23-fair-assistant.sql`](../database-migrations/supabase-phase23-fair-assistant.sql) in Supabase SQL editor.

---

## 4. App URL

Admin UI: `/admin/fair-assistant`

Preview deploy: push branch `feature/fair-assistant` to GitHub — Vercel gives you a preview URL. Use that URL in n8n callback nodes until you merge to production.
