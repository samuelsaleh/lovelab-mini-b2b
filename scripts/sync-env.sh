#!/bin/bash
# Push specific .env keys from this local repo to the production server
# and restart the app. .env is git-ignored, so nothing about it ever
# reaches production via the normal git push -> GitHub Actions deploy —
# this is the manual bridge for that.
#
# Usage:
#   scripts/sync-env.sh --list              Show which keys differ (no values printed)
#   scripts/sync-env.sh KEY [KEY2 ...]      Push the given key(s) from local .env to the server
#   scripts/sync-env.sh --force KEY ...     Also allow pushing a protected key
#
# Requires DEPLOY_SSH_PASSWORD in your shell environment. Never stored in
# this repo. Example: export DEPLOY_SSH_PASSWORD='...' in your shell profile,
# or set it just for one command: DEPLOY_SSH_PASSWORD='...' scripts/sync-env.sh KEY

set -euo pipefail

SERVER_HOST="46.101.98.106"
SERVER_USER="root"
SERVER_ENV="/var/www/app.lovelab-antwerp.com/public_html/.env"
SERVER_APP_DIR="/var/www/app.lovelab-antwerp.com/public_html"
PM2_APP="app-lovelab-antwerp"
SITE_URL="https://app.lovelab-antwerp.com/login"

LOCAL_ENV="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.env"

# Keys that are SUPPOSED to differ between local dev and production.
# Skipped unless --force is passed.
PROTECTED_KEYS=(NEXT_PUBLIC_SITE_URL ALLOWED_HOSTS PORT)

if [ -z "${DEPLOY_SSH_PASSWORD:-}" ]; then
  echo "Set DEPLOY_SSH_PASSWORD in your shell first, e.g.:" >&2
  echo "  export DEPLOY_SSH_PASSWORD='...'" >&2
  exit 1
fi

if ! command -v sshpass >/dev/null; then
  echo "sshpass is required (brew install hudochenkov/sshpass/sshpass)." >&2
  exit 1
fi

ssh_cmd() {
  # -n: never read stdin. Without this, ssh inside the `while read < file`
  # loop below would consume the rest of the file and the loop would exit
  # after its first iteration.
  SSHPASS="$DEPLOY_SSH_PASSWORD" sshpass -e ssh -n -o StrictHostKeyChecking=accept-new "${SERVER_USER}@${SERVER_HOST}" "$@"
}

get_local_val() { grep -m1 "^$1=" "$LOCAL_ENV" | cut -d= -f2-; }
get_server_val() { ssh_cmd "grep '^$1=' '$SERVER_ENV' 2>/dev/null | cut -d= -f2-" || true; }

is_protected() {
  local k="$1"
  for p in "${PROTECTED_KEYS[@]}"; do
    [ "$k" = "$p" ] && return 0
  done
  return 1
}

if [ "${1:-}" = "--list" ]; then
  echo "Keys that differ between local .env and the server (values never shown):"
  found=0
  while IFS='=' read -r key _rest; do
    [[ "$key" =~ ^[A-Z_][A-Z0-9_]*$ ]] || continue
    lv=$(get_local_val "$key")
    sv=$(get_server_val "$key")
    if [ "$lv" != "$sv" ]; then
      tag=""
      is_protected "$key" && tag=" (protected — expected to differ)"
      echo "  $key$tag"
      found=1
    fi
  done < "$LOCAL_ENV"
  [ "$found" -eq 0 ] && echo "  (none)"
  exit 0
fi

if [ $# -eq 0 ]; then
  sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
fi

FORCE=0
KEYS=()
for arg in "$@"; do
  if [ "$arg" = "--force" ]; then FORCE=1; else KEYS+=("$arg"); fi
done

NEEDS_REBUILD=0
PUSHED=()
for key in "${KEYS[@]}"; do
  if ! [[ "$key" =~ ^[A-Z_][A-Z0-9_]*$ ]]; then
    echo "Skipping '$key': not a valid env var name." >&2
    continue
  fi
  if is_protected "$key" && [ "$FORCE" -ne 1 ]; then
    echo "Skipping $key: protected (differs intentionally between local/prod). Pass --force to override." >&2
    continue
  fi
  val=$(get_local_val "$key")
  if [ -z "$val" ]; then
    echo "Skipping $key: empty/unset in local .env (refusing to blank out a production value)." >&2
    continue
  fi
  b64val=$(printf '%s' "$val" | base64 | tr -d '\n')
  echo "Pushing $key..."
  ssh_cmd "/var/www/app.lovelab-antwerp.com/scripts/set-env-key.sh '$key' '$b64val'"
  PUSHED+=("$key")
  [[ "$key" == NEXT_PUBLIC_* ]] && NEEDS_REBUILD=1
done

if [ ${#PUSHED[@]} -eq 0 ]; then
  echo "Nothing pushed."
  exit 0
fi

if [ "$NEEDS_REBUILD" -eq 1 ]; then
  echo "A NEXT_PUBLIC_* var changed (baked in at build time) — rebuilding..."
  ssh_cmd "cd '$SERVER_APP_DIR' && npm run build"
fi

echo "Restarting app..."
ssh_cmd "pm2 restart $PM2_APP --update-env" >/dev/null

sleep 3  # pm2 restart briefly drops the process (fork mode, no zero-downtime)
echo "Checking site..."
code=$(curl -s -o /dev/null -w "%{http_code}" "$SITE_URL")
echo "$SITE_URL -> $code"
echo "Pushed: ${PUSHED[*]}"
