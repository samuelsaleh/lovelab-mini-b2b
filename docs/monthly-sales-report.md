# Monthly sales report — delivery to Google Drive

Built by Rafi on branch `claude/rafi-monthly-sales-report`. Nothing here is live until the branch is merged and deployed.

## What it does

On the 1st of each month, the server crontab calls `/api/cron/monthly-sales-report`, which builds the previous month's sales report from the database (read-only) and delivers it on two channels:

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
3. **Chrome for the PDF.** The PDF is printed by headless Chrome through `puppeteer-core`, which does not download a browser. Chrome is installed once, on the server (DigitalOcean, `root@46.101.98.106`). This does not touch the app.
   ```
   ssh root@46.101.98.106
   . /etc/os-release && echo "$PRETTY_NAME"; uname -m; free -h     # expect Ubuntu/Debian, x86_64, and ~300 MB free
   cd /tmp && wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
   export DEBIAN_FRONTEND=noninteractive
   apt-get update && apt-get install -y ./google-chrome-stable_current_amd64.deb
   rm google-chrome-stable_current_amd64.deb
   google-chrome-stable --version
   google-chrome-stable --headless=new --no-sandbox --disable-gpu --print-to-pdf=/tmp/t.pdf about:blank && ls -la /tmp/t.pdf && rm /tmp/t.pdf
   ```
   - The app finds `/usr/bin/google-chrome-stable` on its own, so there is nothing to configure.
   - If `uname -m` says `aarch64` (ARM), Google Chrome is not available. Instead run `apt-get install -y chromium` and set `CHROME_PATH=/usr/bin/chromium` in the server `.env`.
   - Chrome updates itself with the normal `apt upgrade`.
4. **Schedule.** Add it to the server crontab by re-running `scripts/install-server-cron.sh`, like the other crons. The script already contains this line:
   ```
   0 7 1 * * ${SERVER_SCRIPTS}/run-cron.sh /api/cron/monthly-sales-report >/dev/null 2>&1
   ```
   It runs at 07:00 server time on the 1st. The server clock is probably UTC, which is 08:00 or 09:00 in Antwerp; either way it is already the 1st in Brussels, so it builds the right month.
5. **First run by hand**, on the server. Check `drive.webViewLink` and `email.sent` in the JSON it prints:
   ```
   /var/www/app.lovelab-antwerp.com/scripts/run-cron.sh "/api/cron/monthly-sales-report?month=2026-08"
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
- `app/api/cron/monthly-sales-report/route.js` is the cron endpoint. It is scheduled by `scripts/install-server-cron.sh` (no n8n).
- `scripts/monthly-sales-report.mjs` is the CLI.
- Tests are in `lib/monthlySalesReport/__tests__/` and `app/api/__tests__/cron-monthly-sales-report.test.js`.
- The CLI never emails. Emails go out only from the cron route, and only to `MONTHLY_SALES_REPORT_RECIPIENTS`.


## Alerts: what happens when something goes wrong

Every run checks itself, and `MONTHLY_SALES_REPORT_ALERT_TO` (Sam until set) gets an email when something is off.

| Situation | What gets delivered | Alert |
|---|---|---|
| Database can't be read (e.g. a column was renamed) | nothing | ⚠️ "problem", with the database error |
| The PDF can't be made (e.g. no Chromium on the server) | nothing | ⚠️ "problem" |
| The report contradicts itself (totals don't add up) | **nothing** — Sam and the executives never see a wrong report | ⚠️ "problem", naming the total that doesn't add up |
| Drive or email fails | the other channel still goes out | ⚠️ "problem", saying what was and wasn't delivered |
| Suspicious data — a €0 order, an amount entered in cents, a typed date the report can't read, a new order channel, an order pointing to a deleted fair, an agent with no profile, a month with suddenly no sales | delivered | ℹ️ "data needs a look", listing each case (amounts, dates and fair names only, never client names) |
| The app or server is down on the 1st | nothing | none — the app can't send anything while it's down; the report simply doesn't arrive, which is itself the signal. Re-run the month by hand once it's back. |

Checked against the real data (Jun–Sep 2026):

- June, July and August pass cleanly.
- September raises two warnings: the €0 order at Les Journées d'Achats (07/09), and 3 online B2C orders on 16/09 recorded at €0.75, €0.75 and €1.50 whose lines total €75, €75 and €150.

The local script prints the same checks (`✓ all checks passed`, `! data warning: …`).
