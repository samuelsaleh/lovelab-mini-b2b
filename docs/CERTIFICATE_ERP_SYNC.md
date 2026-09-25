# LoveLab Certificate ERP sync (both directions)

Uses `LOVELAB_API_URL` (same as packing-stock / certificate-stock).

## Flows

| Direction | Trigger | What |
|-----------|---------|------|
| **B2B → ERP In** | IGI visit **received** | Immediate `POST /api/certificate-in` |
| **ERP → B2B In** | Cron every **10 min** | Full reconcile of certificate-in (add / update / **delete**) |
| **ERP → B2B Out** | Cron every **10 min** | Full reconcile of certificate-out (add / update / **delete**) |
| **Shelf** | Cron every **10 min** (+ nightly) | `GET certificate-stock` → snapshots (secondary) |
| **Models → ERP masters** | Model rename / serial assign + cron | `POST /api/certificate-master` with stock labels |
| **B2B → ERP Out** | When B2B originates an out | `POST /api/certificate-out` |

**On our shelf** = **opening shelf** + Certificate In − Certificate Out  
Example: opening 755, In 5, Out 2 → **758**.

Opening shelf is set on Models (seeded once from packing snapshots). Deletes in ERP remove matching B2B sync rows on the next cron run.

Failed B2B→ERP In receipts are retried on the same cron.

## DigitalOcean crontab

```cron
*/10 * * * * /var/www/app.lovelab-antwerp.com/scripts/run-cron.sh /api/cron/igi-certificate-outs >/dev/null 2>&1
0 * * * * /var/www/app.lovelab-antwerp.com/scripts/run-cron.sh /api/cron/igi-mail >/dev/null 2>&1
```

The hourly `igi-mail` line is the scheduled certificate emails (Liuba every
morning at 07:00, IGI every Friday at 14:00, Alberto every second Friday).
The route reads the Antwerp clock itself and sends each mail at most once a
day (`igi_digest_sends`), so the hour it runs at does not matter.

## Apply DB migrations (Supabase)

```sql
-- igi_certificate_out_sync + igi_certificate_in_sync
-- see supabase/migrations/20260918120000_igi_certificate_out_sync.sql
-- see supabase/migrations/20260918140000_igi_certificate_in_sync.sql
```

## Manual test

```bash
/var/www/app.lovelab-antwerp.com/scripts/run-cron.sh /api/cron/igi-certificate-outs
```

Expect JSON with `ins` / `outs` including `mode: "full"` and a `deleted` count when ERP rows were removed.
