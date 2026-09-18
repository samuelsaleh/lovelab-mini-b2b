# LoveLab Certificate ERP sync (B2B → lovelab)

Uses `LOVELAB_API_URL` (same as packing-stock).

## Flows

### Certificate In (receive)
When a movement is confirmed received (`PATCH /api/igi/visits/[id]/received`):

1. Visit closes locally as before.
2. B2B builds stock labels (`name · serial · stones × carat shape`) matching LoveLab `certificate_master`.
3. Posts `POST {LOVELAB_API_URL}/certificate-in` with `external_ref = visit:{id}`.
4. Records idempotency in `igi_receipts` (`pending` → `applied` / `failed`).

A failed ERP push does **not** reopen the visit. Cron retries failed receipts.

### Certificate Out (poll)
Hourly cron `GET /api/cron/igi-certificate-outs` (header `x-vercel-cron-secret: $CRON_SECRET`):

1. Polls `GET /api/certificate-out?since_id=…`
2. Upserts into `igi_certificate_out_sync`, matching models by `LGAJ…` serial in the description.
3. Retries failed `igi_receipts`.

## DigitalOcean crontab (Option B — preferred)

Production is self-hosted on DigitalOcean, not Vercel. `vercel.json` crons do nothing there.

**Option B** keeps `CRON_SECRET` out of crontab: `scripts/run-cron.sh` reads it from the app `.env`.

### One-shot install from your laptop

```bash
export DEPLOY_SSH_PASSWORD='…'   # server root password
./scripts/install-server-cron.sh
```

That uploads `run-cron.sh` to `/var/www/app.lovelab-antwerp.com/scripts/` and installs:

```cron
0 4 * * * …/run-cron.sh /api/cron/health-check
0 6 * * * …/run-cron.sh /api/cron/email-deliveries
0 1 * * * …/run-cron.sh /api/cron/igi-stock
15 * * * * …/run-cron.sh /api/cron/igi-certificate-outs
```

### Manual install on the server

```bash
# copy run-cron.sh to /var/www/app.lovelab-antwerp.com/scripts/ && chmod 750 …
crontab -e
# then add:
15 * * * * /var/www/app.lovelab-antwerp.com/scripts/run-cron.sh /api/cron/igi-certificate-outs >/dev/null 2>&1
```

### Manual cron test

On the server (no secret in the command line history beyond what `.env` already has):

```bash
/var/www/app.lovelab-antwerp.com/scripts/run-cron.sh /api/cron/igi-certificate-outs
```

Or from anywhere if you already exported the secret:

```bash
curl -H "x-vercel-cron-secret: $CRON_SECRET" \
  https://app.lovelab-antwerp.com/api/cron/igi-certificate-outs
```

## Apply DB migration

```sql
-- see supabase/migrations/20260918120000_igi_certificate_out_sync.sql
```
