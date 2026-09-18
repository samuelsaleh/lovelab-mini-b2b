#!/usr/bin/env bash
# Hit a LoveLab B2B cron route using CRON_SECRET from the app .env.
# Secret stays on disk — never put it in crontab.
#
# Usage (on the DigitalOcean server):
#   /var/www/app.lovelab-antwerp.com/scripts/run-cron.sh /api/cron/igi-certificate-outs
#   APP_DIR=/path SITE_URL=https://… ./scripts/run-cron.sh /api/cron/email-deliveries

set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/app.lovelab-antwerp.com/public_html}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"
SITE_URL="${SITE_URL:-https://app.lovelab-antwerp.com}"
CRON_PATH="${1:-}"

if [ -z "$CRON_PATH" ]; then
  echo "Usage: $0 /api/cron/<name>" >&2
  exit 1
fi

case "$CRON_PATH" in
  /api/cron/*) ;;
  *)
    echo "Refusing path '$CRON_PATH' — must start with /api/cron/" >&2
    exit 1
    ;;
esac

if [ ! -f "$ENV_FILE" ]; then
  echo "Env file not found: $ENV_FILE" >&2
  exit 1
fi

# Read only CRON_SECRET — do not `source` .env (avoids executing it).
CRON_SECRET="$(grep -m1 '^CRON_SECRET=' "$ENV_FILE" | cut -d= -f2- | tr -d '\r' | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")"

if [ -z "$CRON_SECRET" ]; then
  echo "CRON_SECRET missing or empty in $ENV_FILE" >&2
  exit 1
fi

exec curl -sS -H "x-vercel-cron-secret: ${CRON_SECRET}" "${SITE_URL}${CRON_PATH}"
