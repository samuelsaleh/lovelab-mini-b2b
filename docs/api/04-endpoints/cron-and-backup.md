# Cron routes and backup

All are `GET`, require the header `x-vercel-cron-secret: <CRON_SECRET>`
(401 otherwise, including when the secret is unset on the server), have no
rate limit, and are called by the **server's crontab** through
`scripts/run-cron.sh` (installed by `scripts/install-server-cron.sh`). The
`crons` block in `vercel.json` lists the same five but is inert: Vercel only
redirects now. Details of each job: [../07-background-jobs.md](../07-background-jobs.md).

| Schedule | Path | Returns |
|---|---|---|
| `0 4 * * *` | `/api/cron/health-check` | `{ "ok": true, "summary": { "ghost_commissions": 0, "duplicate_agent_events": 0, "schema_drift": { … }, "events_written": 0 } }` |
| `0 6 * * *` | `/api/cron/email-deliveries` | `{ "checked": 12, "updated": 3, "bounced": 0, "errors": [ … ] }` |
| `0 1 * * *` | `/api/cron/igi-stock` | `{ "ok": true, "snapshot_date": "…", "rows": 98 }` |
| `*/10 * * * *` | `/api/cron/igi-certificate-outs` | `{ "ins": { "mode": "full", "added", "updated", "deleted" }, "outs": { … }, "shelf": { … }, "masters": { … }, "receipts": { "retried", "applied", "failed" } }`; 500 if ins, outs or receipts fail |
| `0 * * * *` | `/api/cron/igi-mail[?force=morning\|weekly\|order]` | `{ "sent": [ … ] }` or `{ "skipped": true, "reason": "off-hour" }` |
| not scheduled | `/api/backup` | `{ "ok": true, "folder": "…", "tables": 30, "files": 412 }` or `{ "skipped": true, "reason": "no drive credentials" }`; RL 5 |

Manual run from the server:

```bash
/var/www/app.lovelab-antwerp.com/scripts/run-cron.sh /api/cron/igi-certificate-outs
```

`run-cron.sh` reads `CRON_SECRET` out of the app's `.env` without sourcing it
and refuses any path outside `/api/cron/*` (so `/api/backup` has to be called
by hand with the header).
