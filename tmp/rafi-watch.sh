#!/bin/bash
# Read-only watch for the PDF-translate deploy on app.lovelab-antwerp.com.
#   bash /tmp/rafi-watch.sh status          one-shot: did the deploy land, is the app healthy
#   bash /tmp/rafi-watch.sh watch [secs]    stream app logs + child processes + memory during a translation (default 90 s)
# Prints no secret values.
APP=/var/www/app.lovelab-antwerp.com/public_html
MODE=${1:-status}

status() {
  echo "== git on server =="
  git -C "$APP" log -1 --format='%h %s (%cr)'
  git -C "$APP" status --short | sed -n 1,5p
  echo "== mupdf installed? =="
  grep '"version"' "$APP/node_modules/mupdf/package.json" 2>/dev/null || echo "mupdf NOT in node_modules (npm ci did not run or failed)"
  ls "$APP/lib/doc-translate/pdf/worker.mjs" >/dev/null 2>&1 && echo "worker.mjs present" || echo "worker.mjs MISSING"
  ls "$APP/lib/doc-translate/fonts" 2>/dev/null | wc -l | sed 's/^/fonts in lib\/doc-translate\/fonts: /'
  echo "== build =="
  [ -f "$APP/.next/BUILD_ID" ] && echo "BUILD_ID $(cat "$APP/.next/BUILD_ID") built $(date -r "$APP/.next/BUILD_ID" '+%F %T')" || echo "no .next/BUILD_ID"
  echo "== pm2 =="
  pm2 describe app-lovelab-antwerp 2>/dev/null | grep -iE 'status|uptime|restarts|exec cwd|script path|node.js version'
  pm2 status | grep -E 'app-lovelab|id '
  echo "== memory =="
  free -m | sed -n 1,3p
  echo "== last app errors (pm2 err log, 15 lines) =="
  pm2 logs app-lovelab-antwerp --err --lines 15 --nostream 2>/dev/null | grep -v '^\[TAILING\]' | tail -15
  echo "== site =="
  curl -s -o /dev/null -w 'https://app.lovelab-antwerp.com -> %{http_code} in %{time_total}s\n' https://app.lovelab-antwerp.com/
  echo "== done =="
}

watch() {
  SECS=${2:-90}
  echo "watching for $SECS s: pm2 log lines with doc-translate / worker, node child processes, free memory. Start the translation now."
  pm2 logs app-lovelab-antwerp --lines 0 --raw 2>/dev/null | grep --line-buffered -iE 'doc-translate|worker|mupdf|error|429|413' &
  LOGPID=$!
  END=$((SECS + $(date +%s)))
  while [ "$(date +%s)" -lt "$END" ]; do
    CH=$(ps -eo pid,ppid,rss,etimes,args | grep -E 'worker\.mjs' | grep -v grep | awk '{printf "  child pid %s rss %d MB age %ss\n", $1, $3/1024, $4}')
    APPMB=$(ps -eo rss,args | grep -E 'next-server|next start' | grep -v grep | awk '{s+=$1} END {printf "%d", s/1024}')
    printf '%s app %s MB | avail %s MB | swap used %s MB%s\n' "$(date +%T)" "$APPMB" "$(free -m | awk '/Mem:/ {print $7}')" "$(free -m | awk '/Swap:/ {print $3}')" "${CH:+$'\n'$CH}"
    sleep 2
  done
  kill $LOGPID 2>/dev/null
  echo "== pm2 after =="
  pm2 status | grep -E 'app-lovelab'
  echo "== translation jobs in storage (newest first) =="
  echo "(check Admin > Resources > Translate in the browser: the download link should appear)"
  echo "== done =="
}

case "$MODE" in
  status) status ;;
  watch) watch "$@" ;;
  *) echo "usage: $0 status | watch [secs]" ;;
esac
