---
name: api-credentials
description: How to handle an API key, token or password in this project - where the value lives, and how to use one in a command without it ending up in the transcript. Use whenever a task needs a credential (Resend, Anthropic, n8n, Supabase service role, the server password), whenever a new key is created or rotated, and whenever a key has been exposed and needs replacing.
---

# Using a credential without leaking it

## Where values live

- The production app reads everything from the server's `.env`. See the
  `env-sync` skill for putting a value there.
- Values a Claude session needs live in Sam's personal synced skills
  (`my-resend-key`, `my-n8n-key`). Those are attached to his account, not to
  this repository.
- Nothing secret is ever committed here. `.env` is git-ignored; a key in a
  commit is in the history for good, even after it is deleted.

## The rule that matters: never put a secret on a command line

Every command and its output is part of the session transcript. A key pasted
into `curl -H "Authorization: Bearer re_live_..."` is then in the chat, in the
scrollback, and in any screenshot of it. This is how the Resend key was
exposed on 15 Sept 2026, and the storage was never the problem.

Read the value into a variable inside the same command that uses it:

```bash
K=$(grep -oE 're_[A-Za-z0-9_]+' "$SKILL_DIR/SKILL.md" | head -1)
curl -sS -H "Authorization: Bearer $K" https://api.resend.com/domains
```

The same applies when writing one to a file: build the line from the variable,
never type the literal. When reporting back, name the key, never the value:
"used the Claude key, last used 13:14" and not the string itself.

If a command would print a credential, pipe it somewhere harmless first, or
select only the fields needed. Be careful with verbose flags, `env`, and
anything that dumps a whole config.

## One key per consumer

Give each consumer its own key, named after it: the app, n8n, a Claude
session. Then a key can be revoked without stopping the others.

On 15 Sept 2026 the opposite happened. One key from February was in several
places, a script used it to send 295 fake messages from love-lab.com in five
minutes, and killing it stopped every real order confirmation too.

## When a key is exposed

A credential that has been in a chat, a screenshot, an email or a commit is
burned, whether or not anyone used it. Replace it, in this order, so nothing
stops working in between:

1. Create the replacement.
2. Install it where it is needed (for the server, the `env-sync` skill).
3. Confirm the thing that uses it still works.
4. Only then revoke the old one.

Never revoke first and install afterwards. For a provider that sends email or
takes payments, the gap is visible to customers.

## Checking what a key has been doing

Providers record when a key was last used, and usually what it sent. That is
the fastest way to answer "which key did this?". Resend lists keys with a
last-used timestamp at `GET /api-keys` and the sending log at `GET /emails`;
compare the timestamp against the window of whatever you are investigating.
