# Switching the certificates on

Everything is built. This is the one step that makes it appear in the app.

It takes about two minutes and does not need a terminal.

---

## What you are doing, in one sentence

The app keeps its information in a database. That database has tables for orders,
clients and agents — but nothing for certificates yet, because the feature is new.
This creates them and puts Michael's numbers in.

---

## Step 1 — Open the Supabase SQL editor

Go to the LoveLab project in Supabase, and open **SQL Editor** in the left menu.
Click **New query**.

## Step 2 — Paste the file and run it

Copy the whole of `database-migrations/igi-switch-on.sql` into the box and press
**Run**.

It is long, but it is one action. Nothing is saved until it finishes, so there is
no half-done state to worry about.

## Step 3 — Read the last line

A good run ends with:

```
IGI: ALL FIGURES MATCH
```

Above it you will see each figure checked off against Michael's file:

```
ok  models in use                      = 61
ok  reserved serials                   = 15
ok  certificates ordered               = 62999
ok  issued with a model                = 3778
ok  issued with no model               = 3245
ok  unissued at IGI                    = 59221
ok  certificates on the shelf          = 3504
```

**If any figure is wrong it stops and tells you which one, and saves nothing.**
That is deliberate — a wrong opening balance would be inherited by every screen
and every invoice built on top of it, so it is better to fail loudly.

Running the file twice is safe. It corrects rather than duplicates.

---

## Then open the app

**Admin → Certificates.** Six screens:

| | |
|---|---|
| **Dashboard** | 3 504 on the shelf, 59 221 still at IGI, and the 3 245 gap |
| **New request** | Choose models and quantities, send to IGI |
| **Visits** | All 23 movements, and any new one you create |
| **Stock & alerts** | Every model, both sides, both alert levels |
| **Models** | The 61 in use, 15 reserved serials, 3 waiting for a serial |
| **Matching** | Which stock description belongs to which model |

**Six models will already say "Go collect"** — they are below the default alert
level of 25 on the shelf. That is real, and it is the first thing this was built
to tell you.

---

## The shelf figure

The dashboard opens with a reading of LoveLab's shelf taken on 28 August 2026, so
there is something there from the first minute. After that the app reads
`software.love-lab.com` by itself every night at 01:00 and the figure updates
without anyone typing.

To pull a fresh reading straight away rather than waiting for the night:

```
curl -H "x-vercel-cron-secret: $CRON_SECRET" https://<your-app>/api/cron/igi-stock
```

`CRON_SECRET` is the same one the nightly backup already uses.

---

## What still will not work, and why

**Confirming a return does not update LoveLab's own software.** Christelle still
types the arrival there by hand. The endpoint that would do it automatically does
not exist yet — Hardik has to build it. Until then the shelf figure comes only
from the nightly reading, and the app says so rather than pretending otherwise.

**IGI have screens but no accounts yet.** Their five screens are built and the
rules about what they may and may not do are already in the file you pasted.
Nobody at IGI can sign in until you add them, so nothing is exposed in the
meantime. Until you do, LoveLab records both halves of a movement — which is
what happens physically anyway, since Christelle carries the bracelets.

When you are ready, two lines add them:

```sql
insert into allowed_emails (email) values ('...@igi.org'), ('...@igi.org');
update profiles set is_igi = true where email in ('...@igi.org', '...@igi.org');
```

Two accounts, because IGI is a company rather than a person. They then sign in
with the normal email link and land on their own screens — and only those: an
IGI account is refused everywhere else in the app.

**Every IGI-side number is an estimate until the stock count.** Nobody knows the
true per-model remainder yet. The figures come from Michael's file as of 27
August. When the count happens it goes in as new rows rather than overwriting
anything, so nothing is lost.

**The 3 245 stays on the dashboard.** Those are the certificates issued between
16 June and 28 July with no model recorded. Every per-model figure is short by
some part of that number. It stays visible until those movements are
reconstructed, at which point the balances correct themselves.

---

## If something goes wrong

The run is a single transaction — if it stops, nothing was written and you can
safely fix and re-run.

Two other files are worth knowing about:

- `database-migrations/verify-igi-certificates.sql` — checks the rules still hold,
  including that IGI cannot see LoveLab's shelf. Ends with ALL CHECKS PASSED.
- `npm run check:schema` — confirms the live database matches what the code
  expects. Run it after the switch-on; it should report no drift.
