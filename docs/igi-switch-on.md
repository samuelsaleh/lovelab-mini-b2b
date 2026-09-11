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

**Admin → Certificates**, which opens the certificate application at
`/certificates` — its own space, with its own sidebar and its own look. Five
screens:

| | |
|---|---|
| **Dashboard** | 3 504 on the shelf, 59 221 still at IGI, and the 3 245 gap |
| **Stock** | Every model, both sides, both alert levels — and an "ask for" column with one Send to IGI button |
| **Movements** | All 23 movements, by movement or by day |
| **Models** | The 61 in use, 15 reserved serials, the ones waiting for a serial, a "New model" form, and which stock description belongs to which model |
| **Invoices** | What the movements say, beside what IGI billed |

IGI's side — what is on their screen right now — is a link at the foot of the
sidebar.

The old addresses under `/admin/certificates` still work — they redirect.

**Six models will already say "Go collect"** — they are below the default alert
level of 25 on the shelf. That is real, and it is the first thing this was built
to tell you.

---

## The model names

Every model is written one way: digits rather than words (Multi 3, Linea 5,
Riviera 8), each word starting with a capital (Zaha, Flower Marquise), the
products a certificate serves separated by a slash with a space either side
(Cuty / Cubix / Sienna 1), and the shape in the name for Shapy Shine and Matchy
Fancy (Shapy Shine Pear). A name typed on the Models screen is saved in that
shape whatever the keyboard did, so MULTI MOONLIGHT and Multi Moonlight can no
longer sit on neighbouring rows.

If your database was switched on **before 11 September 2026**, it still holds
the earlier spellings. Paste `database-migrations/igi-model-names.sql` into
the SQL editor and run it — it renames the 59 models in place and ends with:

```
IGI: 0 of 59 models still carry an old name
```

A name you had already changed yourself on the Models screen is left as you
set it. Running the full switch-on file again does the same renames, so a
fresh database needs nothing extra.

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

When you are ready, per person at IGI:

1. In Vercel, Settings → Environment Variables, add their address to
   `IGI_EMAILS` (comma-separated), then redeploy.
2. On your Mac, in the project folder:

   ```
   node --env-file=.env.local scripts/add-igi-user.mjs michael@igi.org "Michael"
   ```

   It prints a temporary password. Send it to them privately.

They sign in at the normal login page with email and password, choose their
own password, and land on their portal — and only that: an IGI account is
refused everywhere else in the app, and is never an admin even if the same
address is also on ADMIN_EMAILS. Two accounts is right, because IGI is a
company rather than a person.

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
