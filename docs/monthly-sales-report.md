# Monthly sales report

Built by Rafi on branch `claude/rafi-monthly-sales-report`. **Nothing runs on the LoveLab server.** The report runs in Google Apps Script, in Rafi's Google account.

## What it does

On the 1st of each month, around 07:00 Brussels time, a Google Apps Script trigger:

1. **Reads the database, read-only.** It uses Supabase's REST API with GET requests only, so it cannot write anything.
2. **Builds last month's report.** This is the app's own tested code in `lib/monthlySalesReport`, packaged into one file.
3. **Checks itself.** If its totals contradict each other, nothing is delivered and an alert goes out instead.
4. **Saves the PDF, and only the PDF, to Google Drive** in *LoveLab Analytics / Monthly Report*.
   - Files are named `YYYY-MM Month — LoveLab sales report.pdf`, so they sort by month.
   - A re-run replaces that month's PDF. The old copy goes to the Drive trash, where it can be recovered for 30 days.
5. **Emails the brief HTML report with the PDF attached.** It goes to sam@love-lab.com until other recipients are set.
6. **Alerts the script's owner** when anything goes wrong, or when the data looks suspicious (see below).

The PDF is one phone-width page (120 mm) with no page breaks, so it reads properly on an iPhone. It is drawn directly in JavaScript with pdf-lib: no browser and no Chrome. The text font is Liberation Sans (SIL OFL, see `lib/monthlySalesReport/fonts/`), so every name prints with its accents.

## Contents

- **Headline figures:**
  - net sales and the change vs the previous month
  - B2B / B2C
  - agent commission, **shown as a cost** (owed / paid)
  - each fair's revenue on its own line
- **Sales by month (12 months):** the total on every column, plus a B2B / B2C / Total table.
- **Sales by agent:** top 8 in the chart, every agent in the table.
- **B2B vs B2C:** this month and year to date.
- **Each fair this month:** revenue, what LoveLab keeps, commission owed, orders (and how many via agents), clients, average and biggest order.
- **Every fair of the year:** revenue and what LoveLab keeps per fair.

## Definitions

- **Sales:** confirmed orders only. No drafts, quotes, deleted orders, samples, consignment or internal stock moves (`EXCLUDED_ORDER_CHANNELS`).
- **Amounts:** net of VAT and shipping, the same base as the commission ledger. The Analytics page shows amounts including VAT, so it reads a little higher.
- **Month:** the order's typed date, read day/month with French, Dutch and Italian month names; otherwise the entry date in Brussels time. The Analytics page uses the entry date, so an order entered late can sit in a different month there.
- **Commission owed:** `agent_commissions` on the month's sales, including bonuses, excluding cancelled.
- **Commission paid:** `agent_payments` made in the month.
- **Fairs:** events of type `fair`. "LoveLab keeps" = revenue − agent commission. Stand and travel costs are not recorded, so they are not deducted.

## Setup (done once, in Rafi's Google account)

1. **Build:** `npm run build:apps-script`. This writes `out/apps-script/Code.js` and `out/apps-script/appsscript.json`.
   - `npm run check:apps-script` also runs the bundle in a sandbox that has only what Apps Script has. It reads the real database (read-only), fakes Drive and email, and writes the PDF it would have saved to `out/apps-script/`.
2. **Push:** use [clasp](https://github.com/google/clasp) from `out/apps-script`. This needs *Google Apps Script API* switched on at https://script.google.com/home/usersettings.
   ```
   cd out/apps-script
   npx @google/clasp login
   npx @google/clasp create --type standalone --title "LoveLab — Monthly Sales Report"   # first time only
   npx @google/clasp push -f
   ```
   `.clasp.json` holds the script ID. It stays local in `out/`.
3. **Script Properties** (Project Settings → Script Properties). These are private to the script and never in code:

   | Property | Value |
   |---|---|
   | `SUPABASE_URL` | the project URL |
   | `SUPABASE_KEY` | a Supabase secret key (used read-only) |
   | `DRIVE_FOLDER_ID` | the *Monthly Report* folder's ID (the last part of its URL) |
   | `REPORT_RECIPIENTS` | optional, comma separated. **Not set = sam@love-lab.com** |
   | `ALERT_TO` | optional. **Not set = the script's owner** |

4. **Test:** run `testReportToMe`. It builds last month, saves the PDF to Drive, and emails **only you**. The first run asks Google for permission to use Drive, email and web requests.
5. **Schedule:** run `installMonthlyTrigger` once. It sets up the 1st of each month at 07:00 Brussels time.

**Updating it later:** change the code in the repo, then run `npm run build:apps-script` and `npx @google/clasp push -f` from `out/apps-script`.

## Alerts

| Situation | Delivered | Alert to the owner |
|---|---|---|
| Database can't be read (e.g. a column renamed) | nothing | ⚠️ "problem", with the error |
| The report contradicts itself (totals don't add up) | **nothing**, so Sam and the executives never see a wrong report | ⚠️ "problem", naming the total that doesn't add up |
| Drive or email fails | the other one still goes out | ⚠️ "problem", saying what was and wasn't delivered |
| Suspicious data: a €0 order, an amount entered in cents, a typed date it can't read, a new order channel, an order pointing to a deleted fair, an agent with no profile, a month with suddenly no sales | delivered | ℹ️ "data needs a look", listing each case (amounts, dates and fair names only, never client names) |

Apps Script also emails the owner if a scheduled run fails outright. That is Google's own failure notice.

## Running it locally

```
node scripts/monthly-sales-report.mjs --month 2026-08 --source supabase   # needs .env.local; writes out/monthly-sales-report/<month>/
node scripts/monthly-sales-report.mjs --month 2026-08 --source sample     # invented data, stamped SAMPLE
```

The local script never emails. `--drive` uploads through the app's own Google credentials, if they are configured.

## Code

- `lib/monthlySalesReport/`:
  - `dataSources/`: `supabase.js` (supabase-js), `supabaseRest.js` (REST, for Apps Script) and `sample.js`. The two real readers return identical data (checked 25/09/2026).
  - `buildReportData.js`: pure figures
  - `checks.js`: self-checks
  - `renderEmail.js`: the email HTML
  - `pdfDirect.js` + `svgCharts.js`: the PDF
  - `alerts.js`, `recipients.js`, `fileName.js`
  - `appsScript/`: the Apps Script entry (`main.js`) and manifest
- `scripts/build-apps-script.mjs` + `scripts/apps-script-sandbox.mjs`: the Apps Script package and its sandbox check.
- `scripts/monthly-sales-report.mjs`: the local CLI.
- `app/api/cron/monthly-sales-report/route.js`: an optional app endpoint doing the same. **It is not scheduled anywhere**; the Apps Script is what runs monthly.
