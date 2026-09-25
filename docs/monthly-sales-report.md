# Monthly sales report — delivery to Google Drive

Built by Rafi on branch `claude/rafi-monthly-sales-report`. Nothing here is live until the branch is merged and deployed.

## What it does

On the 1st of each month, `/api/cron/monthly-sales-report` builds the previous month's sales report from the database (read-only) and delivers it on two channels:

- **Google Drive gets the PDF only**, in a shared folder.
- **Email:** the brief HTML is the body, with the PDF attached. It goes to `MONTHLY_SALES_REPORT_RECIPIENTS`. **While that is not set, it goes to sam@love-lab.com**; the other addresses are added later. Set but empty means no email.

Each channel reports its own result, and one failing does not stop the other. Sample data is never uploaded or emailed.

```
My Drive (rafi.goldo21@gmail.com) / LoveLab Analytics / Monthly Report/   ← GOOGLE_DRIVE_SALES_REPORTS_FOLDER_ID = 1uU4GsXjqJKdlm_GdHWnEXnuobhdzYD6z
├── 2026-08 August — LoveLab sales report.pdf
└── 2026-09 September — LoveLab sales report.pdf
```

The PDF is one phone-width page with no page breaks, so it reads properly in the Drive app on an iPhone. It shows:

- net sales and the change vs the previous month
- B2B vs B2C
- sales by month (B2B / B2C / total per month)
- sales and commission by agent
- every fair of the month separately, plus every fair of the year
- commission, always shown as a cost to LoveLab

## To switch it on (server side — Sam)

1. **Drive folder.** Already created, 25/09/2026: *LoveLab Analytics / Monthly Report* in Rafi's Drive. Its folder ID is `1uU4GsXjqJKdlm_GdHWnEXnuobhdzYD6z`. Share it with the executives, and **as Editor with the Google account the app uploads with**. Without that the app cannot write there.
   - It works in a normal folder (any account's My Drive) and in a Google Workspace *Shared drive*.
   - The upload **never deletes anything**. If two folders have the same year name, it uses the oldest. A re-run replaces that month's PDF instead of adding a duplicate.
   - Also share it with the Google account the app already uploads with (the one behind `GOOGLE_DRIVE_REFRESH_TOKEN` or `GOOGLE_SERVICE_ACCOUNT_KEY`, the same one that writes the commission reports).
   - The folder ID is the last part of the folder's URL.
2. **Env vars** (server `.env`, see the `env-sync` skill):
   - `GOOGLE_DRIVE_SALES_REPORTS_FOLDER_ID=<folder id>`
   - `MONTHLY_SALES_REPORT_RECIPIENTS=<emails, comma separated>`. Optional: **not set means sam@love-lab.com**, for now. The email uses the existing Resend setup (`RESEND_API_KEY`, `SENDER_EMAIL`).
   - `MONTHLY_SALES_REPORT_ALERT_TO=<email>`: who gets the problem alerts (see below). **Not set means sam@love-lab.com.**
3. **Chrome for the PDF.** The PDF is printed by headless Chromium through `puppeteer-core`, which does not download a browser.
   - On the server: `apt install chromium` (or google-chrome).
   - If it lives somewhere other than `/usr/bin/chromium`, `/usr/bin/chromium-browser` or `/usr/bin/google-chrome`, set `CHROME_PATH`.
4. **Schedule.** Pick one of these:
   - **Server crontab** (same as the other crons). Add this line to `CRON_BLOCK` in `scripts/install-server-cron.sh` and re-run it:
     ```
     0 7 1 * * ${SERVER_SCRIPTS}/run-cron.sh /api/cron/monthly-sales-report >/dev/null 2>&1
     ```
   - **n8n (chosen by Rafi, 25/09/2026).** The workflow is ready at `n8n/monthly-sales-report.workflow.json`. See the n8n section below.
5. **First run by hand.** Run this and check `drive.webViewLink` and `email.sent` in the response:
   ```
   GET /api/cron/monthly-sales-report?month=2026-09
   ```

## Running it locally (no server needed)

```
node scripts/monthly-sales-report.mjs --month 2026-09 --source supabase          # files in out/
node scripts/monthly-sales-report.mjs --month 2026-09 --source supabase --drive  # + Drive, if configured
```

- `--source supabase` reads `.env.local`. It needs `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, and it only reads.
- `--source sample` uses invented data, and that data is never uploaded to Drive.

## How the figures are defined

- **Sales:** confirmed orders only. No drafts, quotes, deleted orders, samples, consignment or internal stock moves (the app's own `EXCLUDED_ORDER_CHANNELS`).
- **Amounts:** net of VAT and shipping, the same base as the commission ledger. The Analytics page shows amounts including VAT, so it will read a little higher.
- **Month:** the order's typed date (else the day it was entered). The Analytics page uses the entry date, so late-entered orders can sit in different months on the two.
- **Commission owed:** `agent_commissions` on the month's sales, including bonuses, minus cancelled.
- **Commission paid:** `agent_payments` made in the month.
- **Fairs:** events of type `fair`.
  - "LoveLab keeps" = fair revenue minus agent commission.
  - Stand and travel costs are not recorded, so they are not deducted.

## Code

- `lib/monthlySalesReport/` holds everything:
  - data sources (`supabase`, `sample`)
  - `buildReportData` (pure figures)
  - `renderEmail` and `renderPdfHtml`
  - `htmlToPdf`
  - `drive` (PDF → Drive)
  - `emailDelivery` (HTML + PDF → email)
  - `run` (all steps together)
- `app/api/cron/monthly-sales-report/route.js` is the cron endpoint.
- `scripts/monthly-sales-report.mjs` is the CLI.
- Tests are in `lib/monthlySalesReport/__tests__/` and `app/api/__tests__/cron-monthly-sales-report.test.js`.
- The CLI never emails. Emails go out only from the cron route, and only to `MONTHLY_SALES_REPORT_RECIPIENTS`.

## n8n workflow

The file `n8n/monthly-sales-report.workflow.json` is imported **inactive**. It has four steps:

1. **Schedule:** 1st of the month, 07:00, Europe/Brussels.
2. **GET** `/api/cron/monthly-sales-report`. The app builds the previous month, puts the PDF in Drive and emails the HTML with the PDF attached.
3. **Check:** HTTP 200, and the PDF is in Drive, and the email went out (or no recipients are set yet).
4. **Success:** a log entry in the run history. **Otherwise:** an alert email with what failed and the likely cause.

**To import it:**

1. In n8n: *Workflows → Import from file* → pick the file.
2. **Credential "LoveLab CRON_SECRET (x-vercel-cron-secret)"** (Header Auth):
   - Name: `x-vercel-cron-secret`
   - Value: the server's `CRON_SECRET`
   - The commission-report workflow already uses this same credential, so reuse it if it exists.
3. **Gmail credential** for the alert. The alert goes to `N8N_SALES_REPORT_ALERT_TO`, then `N8N_ALERT_TO`, and otherwise to sam@love-lab.com.
4. Confirm the workflow timezone is Europe/Brussels (*Settings*).
5. Click **Execute workflow** once by hand and check the result (PDF in Drive, email received). Only then switch it **Active**.

**It only works once the report code is deployed.** Before this branch is merged and live, the GET returns 404 and the workflow sends the alert.

## Alerts: what happens when something goes wrong

Every run checks itself, and `MONTHLY_SALES_REPORT_ALERT_TO` (Sam until set) gets an email when something is off.

| Situation | What gets delivered | Alert |
|---|---|---|
| Database can't be read (e.g. a column was renamed) | nothing | ⚠️ "problem", with the database error |
| The PDF can't be made (e.g. no Chromium on the server) | nothing | ⚠️ "problem" |
| The report contradicts itself (totals don't add up) | **nothing** — Sam and the executives never see a wrong report | ⚠️ "problem", naming the total that doesn't add up |
| Drive or email fails | the other channel still goes out | ⚠️ "problem", saying what was and wasn't delivered |
| Suspicious data — a €0 order, an amount entered in cents, a typed date the report can't read, a new order channel, an order pointing to a deleted fair, an agent with no profile, a month with suddenly no sales | delivered | ℹ️ "data needs a look", listing each case (amounts, dates and fair names only, never client names) |
| The app is down or doesn't answer | nothing | the **n8n** workflow's own alert (the app can't send anything when it's down) |

Checked against the real data (Jun–Sep 2026):

- June, July and August pass cleanly.
- September raises two warnings: the €0 order at Les Journées d'Achats (07/09), and 3 online B2C orders on 16/09 recorded at €0.75, €0.75 and €1.50 whose lines total €75, €75 and €150.

The local script prints the same checks (`✓ all checks passed`, `! data warning: …`).
