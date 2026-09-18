# LoveLab Certificate ERP sync (both directions)

Uses `LOVELAB_API_URL` (same as packing-stock).

## Flows

| Direction | Trigger | What |
|-----------|---------|------|
| **B2B → ERP In** | IGI visit **received** | Immediate `POST /api/certificate-in` (`external_ref=visit:…`) |
| **ERP → B2B In** | Cron every **10 min** | Poll `GET /api/certificate-in?since_id=` → `igi_certificate_in_sync` |
| **ERP → B2B Out** | Cron every **10 min** | Poll `GET /api/certificate-out?since_id=` → `igi_certificate_out_sync` |
| **B2B → ERP Out** | When B2B originates an out | `POST /api/certificate-out` (`postCertificateOut`) |

Failed B2B→ERP In receipts are retried on the same cron.

### Certificate In (B2B receive → ERP)
1. Visit closes locally.
2. Stock labels match LoveLab `certificate_master` (`name · serial · stones × carat shape`).
3. Posts with `external_ref = visit:{id}`.
4. Idempotency in `igi_receipts`.

### Certificate In/Out (ERP → B2B poll)
Cron `GET /api/cron/igi-certificate-outs` every 10 minutes:

1. Polls new Certificate **In** rows → `igi_certificate_in_sync`
2. Polls new Certificate **Out** rows → `igi_certificate_out_sync`
3. Matches models by `LGAJ…` serial in the description
4. Retries failed `igi_receipts`

## DigitalOcean crontab (every 10 minutes)

```cron
*/10 * * * * /var/www/app.lovelab-antwerp.com/scripts/run-cron.sh /api/cron/igi-certificate-outs >/dev/null 2>&1
```

Re-install from laptop:

```bash
export DEPLOY_SSH_PASSWORD='…'
./scripts/install-server-cron.sh
```

## Apply DB migrations (Supabase)

```sql
-- igi_certificate_out_sync
-- see supabase/migrations/20260918120000_igi_certificate_out_sync.sql

-- igi_certificate_in_sync
-- see supabase/migrations/20260918140000_igi_certificate_in_sync.sql
```

## Manual test

```bash
/var/www/app.lovelab-antwerp.com/scripts/run-cron.sh /api/cron/igi-certificate-outs
```

Expect JSON with `ins`, `outs`, and `receipts` keys.
