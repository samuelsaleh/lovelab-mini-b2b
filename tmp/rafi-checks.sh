#!/bin/bash
# Read-only checks for Rafi's 3 pre-merge questions. Prints no secret values.
APP=/var/www/app.lovelab-antwerp.com/public_html

echo "== 1. ANTHROPIC_API_KEY in server .env =="
if grep -qE '^ANTHROPIC_API_KEY=.{20,}' "$APP/.env"; then
  echo "set in $APP/.env (value hidden, length $(grep -E '^ANTHROPIC_API_KEY=' "$APP/.env" | cut -d= -f2- | wc -c))"
else
  echo "MISSING or empty in $APP/.env"
fi
PMID=$(pm2 id app-lovelab-antwerp 2>/dev/null | tr -d '[] ')
if [ -n "$PMID" ] && pm2 env "$PMID" 2>/dev/null | grep -q '^ANTHROPIC_API_KEY='; then
  echo "also present in the running pm2 process env"
else
  echo "NOT in the running pm2 process env (pm2 restart --update-env needed)"
fi

echo
echo "== 2. deploy script (forced command on the deploy key) =="
for f in /root/.ssh/authorized_keys /home/*/.ssh/authorized_keys; do
  [ -f "$f" ] && grep -o 'command="[^"]*"' "$f" | sed "s|^|$f: |"
done
DS=$(cat /root/.ssh/authorized_keys /home/*/.ssh/authorized_keys 2>/dev/null | grep -o 'command="[^"]*"' | sed 's/command="//;s/"$//' | awk '{print $1}' | sort -u)
for s in $DS; do
  if [ -f "$s" ]; then
    echo "--- $s (npm/git/pm2 lines) ---"
    grep -nE 'npm|git |pm2|build' "$s"
  else
    echo "deploy script $s not found"
  fi
done
echo "--- node/npm ---"; node -v; npm -v
echo "--- mupdf already installed? ---"; ls "$APP/node_modules/mupdf/package.json" 2>/dev/null && grep '"version"' "$APP/node_modules/mupdf/package.json" || echo "mupdf not in node_modules yet"

echo
echo "== 3. memory / CPU / limits =="
free -h
echo "cpus: $(nproc)"
echo "swap:"; swapon --show || echo "no swap"
echo "--- pm2 ---"
pm2 describe app-lovelab-antwerp 2>/dev/null | grep -iE 'exec mode|instances|restarts|max memory|node.js version|memory'
pm2 status
echo "--- node heap limit ---"
node -e 'console.log("heap_size_limit MB:", Math.round(require("v8").getHeapStatistics().heap_size_limit/1048576))'
echo "--- other memory users (top 8 RSS) ---"
ps -eo rss,comm --sort=-rss | awk 'NR==1 || NR<=9 {printf "%6d MB  %s\n", $1/1024, $2}'
echo "--- disk ---"
df -h /var/www
echo "--- apache timeouts ---"
grep -nE '^\s*(Timeout|ProxyTimeout)' /etc/apache2/apache2.conf /etc/apache2/sites-available/app.lovelab-antwerp.com*.conf 2>/dev/null
echo "== done =="
