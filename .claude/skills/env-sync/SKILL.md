---
name: env-sync
description: How to change an environment variable (API key, secret, webhook signing secret) on the LoveLab production server. Use whenever a key must be added, replaced or rotated on app.lovelab-antwerp.com - ANTHROPIC_API_KEY, RESEND_API_KEY, RESEND_WEBHOOK_SECRET, CRON_SECRET, Google Drive credentials and the rest. Also use when something in production fails with "not configured", "API key is invalid", "Webhook not configured" or a 503 that points at a missing key, because the cause is almost always a variable missing from the server's .env.
---

# Changing an environment variable in production

## Where the values live

Production runs on its own server, not on Vercel, at
`/var/www/app.lovelab-antwerp.com/public_html`, under pm2 as `app-lovelab-antwerp`.
Its environment is a plain `.env` file in that directory.

`.env` is in `.gitignore`. Nothing about it travels with a normal
`git push` to main, so the GitHub Actions deploy never updates a key. That is
deliberate: secrets do not belong in the repository, where they would be
readable by anyone with access and would stay in the history forever.

`scripts/sync-env.sh` is the bridge. It copies named keys from a **local**
`.env` to the server's `.env` over SSH and restarts the app.

## Running it

From a checkout of this repo, on a machine with normal internet access:

```bash
export DEPLOY_SSH_PASSWORD='...'        # the server's root password, from the password manager
./scripts/sync-env.sh --list            # which keys differ (never prints values)
./scripts/sync-env.sh RESEND_WEBHOOK_SECRET
./scripts/sync-env.sh KEY1 KEY2         # several at once
```

The key must exist in the local `.env` first. The script refuses an empty
value rather than blanking out a working production one.

What it does per key: base64 the value, hand it to `set-env-key.sh` on the
server, then `pm2 restart app-lovelab-antwerp --update-env`. The restart is
a few seconds of downtime, in fork mode, with no zero-downtime handover.
A plain restart without `--update-env` would keep the old environment and the
change would look ignored.

`NEXT_PUBLIC_*` keys are baked in at build time, so the script runs
`npm run build` on the server before restarting. That takes minutes, not
seconds.

`NEXT_PUBLIC_SITE_URL`, `ALLOWED_HOSTS` and `PORT` are protected: they are
meant to differ between a laptop and production, so they are skipped unless
`--force` is passed. Think twice before forcing one.

## It cannot be run from a Claude Code cloud session

A cloud session is sandboxed: its only way out is an HTTPS proxy, and a
direct SSH connection is blocked. Tunnelling SSH through that proxy is a
containment escape and the session refuses to do it, whoever asks. So this
script runs from a laptop, or the server admin does it by hand.

What a cloud session *can* do is everything up to that line: say exactly
which key is missing, prepare the value, and check the result afterwards.

## Checking it worked

The script prints the site's status code at the end. Expect 200.

For a specific key, test the thing that needs it:

```bash
# RESEND_WEBHOOK_SECRET: 401 means the secret is set (signature rejected),
# 503 "Webhook not configured" means it is still missing.
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  https://app.lovelab-antwerp.com/api/webhooks/resend \
  -H 'content-type: application/json' -d '{}'
```

`ANTHROPIC_API_KEY`: open Admin, Fair Assistant, Outreach. A red banner
saying the server's AI key is missing or invalid means it is still wrong.
The banner clears and Send switches back on when the key is good.

## Rules

Never commit a secret, and never paste one into a file that is not
`.gitignore`d. If a secret has been through a chat, a screenshot or an email,
rotate it once it is in place. The same goes for the server password: prefer
a key-based login over a root password.

Do not replace a key that is already working just because it appears in a
list. Overwriting a live `RESEND_API_KEY` with a different account's key
stops the emails.
