# Monthly Sales Report — Design (as built)

**Date:** 2026-09-24, updated 2026-09-25 to match what was built
**Author:** Rafi (with Claude)
**Branch:** `claude/rafi-monthly-sales-report`. Branch only: no merge to `main`, no PR.
**Operations guide:** [`docs/monthly-sales-report.md`](../../monthly-sales-report.md) covers setup, alerts and n8n.

## Goal

Every month, LoveLab gets a sales report for Sam and the executives in two forms:

1. **Email (HTML):** a very brief overview.
2. **PDF:** more detail, with charts and the complete tables. It is phone-first: one page, 120 mm wide, with no page breaks, so it reads properly in the Drive app on an iPhone.

The PDF alone goes into Google Drive ("LoveLab Analytics / Monthly Report"). The email is the HTML body with the PDF attached. Until the recipient list is configured, both the email and the alerts go to sam@love-lab.com.

## Content

- **Headline figures:**
  - net sales and the change vs the previous month (no year-over-year)
  - B2B / B2C
  - agent commission, **always shown as a cost to LoveLab** (−€, "owed" vs "paid")
  - each fair's revenue on its own line (never added together)
- **Sales by month, 12 months:** the total on every column, and a B2B / B2C / Total table.
- **Sales by agent:** top 8 in the chart, the rest in a note, every agent in the table.
- **B2B vs B2C:** this month and year to date.
- **Fairs this month:** one block per fair with:
  - revenue, "LoveLab keeps", commission owed
  - orders (and how many came via agents), clients
  - average and biggest order
  - a note when the fair itself was held in an earlier month
- **All fairs of the year:** revenue and "LoveLab keeps" per fair.

## Definitions

- **Sale:** a non-deleted, non-draft `order` outside `EXCLUDED_ORDER_CHANNELS`.
- **Amount:** net of VAT and shipping, the same as the commission base.
- **Month:** the typed order date, read day/month with FR/NL/IT month names; otherwise the entry date in Brussels time.
- **Fair:** an event of type `fair`. "LoveLab keeps" = revenue − commission; no cost data exists.
- **Commission owed:** `agent_commissions` on the month's sales, including bonuses, excluding cancelled ones.
- **Commission paid:** `agent_payments` in the month.

## Architecture

```
n8n (1st, 07:00 Brussels) ──GET──▶ /api/cron/monthly-sales-report
                                     ├─ dataSources/supabase.js   read-only, paged by id
                                     ├─ buildReportData.js        pure figures
                                     ├─ checks.js                 self-checks: errors block delivery, warnings alert
                                     ├─ renderEmail.js / renderPdfHtml.js + svgCharts.js → htmlToPdf.js
                                     ├─ drive.js                  PDF → Drive (never deletes, replaces a same-name PDF)
                                     ├─ emailDelivery.js          HTML + PDF → email
                                     └─ alerts.js                 problems → alert email
```

- The CLI `scripts/monthly-sales-report.mjs` runs the same pipeline locally. It never emails, and it uploads to Drive only with `--drive`.
- Sample data (`dataSources/sample.js`) is never uploaded or emailed.

## Decisions log

| Date | Decision |
|---|---|
| 24/09 | Fair "profit" = revenue − commission (no cost data). Show commission earned and paid. |
| 24/09 | No same-month-last-year comparison. |
| 25/09 | Portrait, then phone-first (single long page). |
| 25/09 | Commission is labelled as a cost everywhere. |
| 25/09 | Each fair shown separately, plus every fair of the year. |
| 25/09 | Figures on the sales-by-month chart and a B2B / B2C table. |
| 25/09 | Delivery: Google Drive (Sam's preference), PDF only; email = HTML + PDF attached. |
| 25/09 | n8n is the monthly trigger; the report logic stays in the app. |
| 25/09 | Self-checks and alert emails; independent code review fixes (dates, paging, Drive safety, auth). |
| 25/09 | Drive folder: "LoveLab Analytics / Monthly Report" in Rafi's Drive, PDFs directly inside. |
| 25/09 | Email and alert recipients: sam@love-lab.com until the real list is set. |
