# LoveLab Certificate ERP sync (both directions)

Uses `LOVELAB_API_URL` (same as packing-stock / certificate-stock).

## Flows

| Direction | Trigger | What |
|-----------|---------|------|
| **B2B → ERP In** | IGI visit **received** | Immediate `POST /api/certificate-in` |
| **ERP → B2B In** | Cron every **10 min** | Poll certificate-in → `igi_certificate_in_sync` |
| **ERP → B2B Out** | Cron every **10 min** | Poll certificate-out → `igi_certificate_out_sync` |
| **Shelf** | Cron every **10 min** (+ nightly) | `GET certificate-stock` → snapshots (matched by LGAJ serial) |
| **Models → ERP masters** | Model rename / serial assign + cron | `POST /api/certificate-master` with stock labels |
| **B2B → ERP Out** | When B2B originates an out | `POST /api/certificate-out` |

**On our shelf** = certificate-stock (In − Out), not packing-stock.

Failed B2B→ERP In receipts are retried on the same cron.

## DigitalOcean crontab

```cron
*/10 * * * * /var/www/app.lovelab-antwerp.com/scripts/run-cron.sh /api/cron/igi-certificate-outs >/dev/null 2>&1
```

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

Expect JSON with `ins`, `outs`, `shelf`, `masters`, and `receipts`.
