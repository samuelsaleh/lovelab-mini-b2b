# Phase 19/B — Monthly Commission Reports — Setup Checklist

End-to-end setup for the automated monthly commission Excel + email + Google Drive archive system.

After all steps, on the **1st of every month at 08:00 Brussels time**, n8n calls our API which:
1. Builds an `.xlsx` for every active agent's previous-month commissions (only orders the customer has paid).
2. Saves a private archive in Supabase Storage.
3. Saves a copy to your Google Drive (`<root>/2026-05 — May 2026/Nicolas Vial - May 2026.xlsx`).
4. Emails it to `dionne@love-lab.com` with the agent's email as `Reply-To`.
5. Skips any agent with no paid orders (no email at all for them).

You can also click **"Generate & Email"** on the agent detail page to do the same thing manually.

---

## ✅ Pre-flight — what you need

- Access to your Supabase project SQL editor.
- Access to the Google Drive account whose `GOOGLE_DRIVE_REFRESH_TOKEN` is already set in `.env`.
- An n8n instance (cloud or self-hosted). Already deployed? Skip to step 4.
- Your `.env` file (next to `package.json`).

---

## 1. Run the SQL migration in Supabase

Open Supabase → SQL Editor → paste the contents of `database-migrations/supabase-phase19e-commission-reports.sql` and **Run**.

Expected output ends with:

```
NOTICE:  Phase 19e OK — commission_reports table + storage bucket in place
```

This creates:
- `public.commission_reports` table (one row per generation).
- A private Storage bucket `commission-reports` with admin-only RLS.

> **Idempotent.** Safe to re-run if interrupted.

---

## 2. Pick the Google Drive folder

The system writes files to `<root>/<year>/<month>/<Agent> - <Month Year>.xlsx`.

You have two options for what to put in the env var:

### Option A — Point at a YEAR folder (Sam's current setup)

Use this if you want full control over the year folders.

1. In Drive, create or open the year folder, e.g. `Agents/2026/`.
2. Copy its folder ID from the URL: `https://drive.google.com/drive/folders/<ID>`.
3. The system drops month subfolders directly inside.
4. **Important:** when 2027 starts, you need to update the env var to the new 2027 folder.

### Option B — Point at a PARENT folder (recommended for full auto)

Use this if you don't want to touch env vars yearly.

1. Open the parent (e.g. `Agents/`) — the one that *contains* `2026/`.
2. Copy its folder ID.
3. The system auto-creates `2026/`, `2027/`, ... and the months inside.

### Multilingual month names — fully supported

The system matches month subfolders by name in **English / French / Dutch**:

| Month | Accepted names |
|---|---|
| 1 | January / Janvier / Januari |
| 2 | February / Février / Februari |
| 3 | March / Mars / Maart |
| 4 | April / Avril / April |
| 5 | **May / Mai / Mei** |
| 6 | June / Juin / Juni |
| 7 | July / Juillet / Juli |
| 8 | August / Août / Augustus |
| 9 | September / Septembre / September |
| 10 | October / Octobre / Oktober |
| 11 | November / Novembre / November |
| 12 | December / Décembre / December |

If your `2026/` folder already has a `Mai/` folder, the May 2026 report drops into it — no duplicate `May/` is created. If a month is missing entirely, the system creates a new folder with the **English** name (e.g. `April/`).

---

## 3. Add env vars to `.env`

Append to your `.env` (and update on Vercel/your host):

```env
# Folder ID from step 2 above
GOOGLE_DRIVE_COMMISSION_REPORTS_FOLDER_ID=1aBcDeFgHiJkLmNoPqRsTuVwXyZ

# Optional: override default recipient (default = dionne@love-lab.com)
# COMMISSION_REPORT_RECIPIENT=dionne@love-lab.com

# Already set if you have any other cron — keep the same value
# CRON_SECRET=<long random string, used as the n8n auth header>
```

If `CRON_SECRET` is **not** set yet, generate one:

```bash
openssl rand -hex 32
```

Restart your dev server / redeploy after editing `.env`.

---

## 4. Smoke test the API (before importing the n8n workflow)

In one terminal, with the dev server running:

```bash
# Generate for ONE agent for a specific month — sandbox flags off so it
# actually emails + uploads:
curl -X POST http://localhost:3000/api/commission-reports/generate \
  -H "x-vercel-cron-secret: $CRON_SECRET" \
  -H "content-type: application/json" \
  -d '{
    "agent_id": "<uuid-of-an-agent-with-paid-orders>",
    "month": "2026-04",
    "send_email": false,
    "upload_to_drive": false
  }'
```

Expected response:

```json
{
  "mode": "single",
  "period": { "key": "2026-04", "label": "April 2026", ... },
  "result": {
    "reportId": "...",
    "totals": { "grandTotal": 1234.5, "orderCount": 5, ... },
    "storage": { "path": "2026-04/nicolas-vial-2026-04.xlsx" },
    "drive":   { "skipped": true, "reason": "disabled" },
    "email":   { "sent": false, "reason": "disabled" }
  }
}
```

Then re-run with `send_email: true` and `upload_to_drive: true` to verify Drive + Resend wiring.
Open the agent's detail page → **Reports** tab to see the new row.

---

## 5. Import the n8n workflow

1. In n8n: **Workflows → Import from File** → pick `n8n/monthly-commission-reports.workflow.json`.
2. **Workflow Settings** (gear icon, top-right):
   - Timezone: **Europe/Brussels** (already in JSON, double-check).
   - Save data → all (already in JSON).

### 5a. Set up the credentials

Open the workflow. Two nodes need credentials:

#### Credential 1 — `LoveLab CRON_SECRET` (HTTP Header Auth)

1. Click the **POST /api/commission-reports/generate** node → Credentials → **Create New**.
2. Name: `LoveLab CRON_SECRET (x-vercel-cron-secret)`.
3. Type: **Header Auth**.
4. **Name:** `x-vercel-cron-secret`
5. **Value:** the same string as `CRON_SECRET` in your `.env`.
6. Save.

#### Credential 2 — SMTP (only if you keep the alert email node)

If you want the optional failure-alert email:
1. Click the **Email Sam (failure alert)** node.
2. Either:
   - Use Resend SMTP (`smtp.resend.com:465`, user: `resend`, password: your Resend API key), OR
   - Delete the alert node — the API already records a warn-severity row in `system_health_events` which is surfaced in your admin panel.

### 5b. Set the n8n environment variable

Add to n8n's environment (Cloud: Settings → Variables; self-hosted: docker-compose env):

```env
LOVELAB_BASE_URL=https://your-deployed-app.vercel.app
# Optional, only if using the alert node:
N8N_ALERT_FROM=no-reply@love-lab.com
N8N_ALERT_TO=sam@love-lab.com
```

### 5c. Dry-run the workflow

1. Click **Execute Workflow** (the play button at the bottom).
2. The HTTP node should return a `200` with a `summary` like `{ total_agents: N, sent: N, skipped: 0, failed: 0 }`.
3. Open `dionne@love-lab.com` — there should be one email per agent who had paid orders for the **previous** calendar month.

If something fails, the alert email + the `system_health_events` row will tell you which agent + why.

### 5d. Activate the workflow

Toggle **Active** (top-right) → **On**. From now on it runs at 08:00 Brussels on the 1st of every month.

---

## 6. Tell mom what to expect

> "Every month on the 1st around 8 AM you'll get a separate email per agent with their commission breakdown attached as Excel. Reply to the email if you need to talk to the agent. The same files also appear in `LoveLab Commission Reports/` on Drive so you can browse them later. If something goes wrong I'll know — n8n alerts me directly."

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| HTTP 401 from n8n | `CRON_SECRET` missing or mismatched | Re-check the credential value matches `.env` |
| HTTP 403 from manual UI button | Logged-in user is not admin | Make sure your account has `role='admin'` in `profiles` |
| `Drive upload failed` in the response | `GOOGLE_DRIVE_COMMISSION_REPORTS_FOLDER_ID` missing or wrong | Check step 3 |
| Email succeeded but landed in spam | Resend domain not verified | Verify `love-lab.com` in Resend → DNS records |
| Empty `.xlsx` for an agent | They had no `customer_paid_at` orders for the period | Tick the "Customer paid?" checkboxes on the Commission History table for that month and re-run for just that agent |
| Drive folder has month subfolder duplicates | Race condition on first run | Drive's API doesn't dedupe; the helper finds the most-recent and trashes older duplicates on next run |

---

## What lives where

| Thing | Where |
|---|---|
| Source of truth (DB) | `commission_reports` table — one row per generation |
| Primary archive (admin-only) | Supabase Storage bucket `commission-reports`, path `<period_key>/<agent>-<period_key>.xlsx` |
| Mom's convenience copy | Google Drive `<your folder>/<period_key> — <Month Year>/<Agent> - <Month Year>.xlsx` |
| Email | Resend → `dionne@love-lab.com`, with the agent's email as Reply-To |
| Audit log of failures | `system_health_events` table (severity ≥ warn) + admin email if the existing healthEvent flow is wired |
| Manual UI | `/admin/agents/<id>` → **Reports** tab |
| Cron orchestrator | n8n workflow `LoveLab — Monthly Commission Reports` |
