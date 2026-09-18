#!/usr/bin/env bash
# Install Option-B cron runner on DigitalOcean and register crontab entries.
# Secret is read from the server's .env by run-cron.sh — never written into crontab.
#
# Usage (from laptop, in this repo):
#   export DEPLOY_SSH_PASSWORD='…'
#   ./scripts/install-server-cron.sh

set -euo pipefail

SERVER_HOST="46.101.98.106"
SERVER_USER="root"
SERVER_SCRIPTS="/var/www/app.lovelab-antwerp.com/scripts"
SERVER_APP_DIR="/var/www/app.lovelab-antwerp.com/public_html"
LOCAL_RUNNER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/run-cron.sh"

if [ -z "${DEPLOY_SSH_PASSWORD:-}" ]; then
  echo "Set DEPLOY_SSH_PASSWORD in your shell first, e.g.:" >&2
  echo "  export DEPLOY_SSH_PASSWORD='...'" >&2
  exit 1
fi

if ! command -v sshpass >/dev/null; then
  echo "sshpass is required (brew install hudochenkov/sshpass/sshpass)." >&2
  exit 1
fi

if [ ! -f "$LOCAL_RUNNER" ]; then
  echo "Missing $LOCAL_RUNNER" >&2
  exit 1
fi

ssh_cmd() {
  # -n: never read stdin (safe inside loops / when no remote script is piped)
  SSHPASS="$DEPLOY_SSH_PASSWORD" sshpass -e ssh -n -o StrictHostKeyChecking=accept-new "${SERVER_USER}@${SERVER_HOST}" "$@"
}

ssh_stdin() {
  # same as ssh_cmd but allows piping a remote script on stdin
  SSHPASS="$DEPLOY_SSH_PASSWORD" sshpass -e ssh -o StrictHostKeyChecking=accept-new "${SERVER_USER}@${SERVER_HOST}" "$@"
}

echo "Ensuring ${SERVER_SCRIPTS} exists…"
ssh_cmd "mkdir -p '${SERVER_SCRIPTS}'"

echo "Uploading run-cron.sh → ${SERVER_SCRIPTS}/run-cron.sh"
SSHPASS="$DEPLOY_SSH_PASSWORD" sshpass -e scp -o StrictHostKeyChecking=accept-new \
  "$LOCAL_RUNNER" "${SERVER_USER}@${SERVER_HOST}:${SERVER_SCRIPTS}/run-cron.sh"
ssh_cmd "chmod 750 '${SERVER_SCRIPTS}/run-cron.sh'"

# Cron lines: secret comes from .env via the runner (Option B).
CRON_BLOCK="# LoveLab B2B crons (Option B — CRON_SECRET from ${SERVER_APP_DIR}/.env)
0 4 * * * ${SERVER_SCRIPTS}/run-cron.sh /api/cron/health-check >/dev/null 2>&1
0 6 * * * ${SERVER_SCRIPTS}/run-cron.sh /api/cron/email-deliveries >/dev/null 2>&1
0 1 * * * ${SERVER_SCRIPTS}/run-cron.sh /api/cron/igi-stock >/dev/null 2>&1
15 * * * * ${SERVER_SCRIPTS}/run-cron.sh /api/cron/igi-certificate-outs >/dev/null 2>&1"

echo "Merging crontab entries (idempotent)…"
ssh_stdin "bash -s" <<REMOTE
set -euo pipefail
tmp=\$(mktemp)
crontab -l 2>/dev/null | grep -v 'run-cron.sh /api/cron/' | grep -v '# LoveLab B2B crons' > "\$tmp" || true
cat >> "\$tmp" <<'CRON'
${CRON_BLOCK}
CRON
crontab "\$tmp"
rm -f "\$tmp"
echo '--- crontab ---'
crontab -l
REMOTE

echo
echo "Smoke-testing certificate-outs cron once…"
# Prefer /usr/bin/head — some Mac setups shadow `head` with an HTTP HEAD helper.
ssh_cmd "${SERVER_SCRIPTS}/run-cron.sh /api/cron/igi-certificate-outs" | /usr/bin/head -c 500
echo
echo "Done. Hourly job runs at :15 past each hour."
