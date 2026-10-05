# Glossary

Business and code vocabulary, in the order a newcomer meets it.

**Document** — a quote or an order: a PDF in storage plus a `documents` row
with the form state in `metadata`. The unit everything else hangs off.

**Order channel** (`documents.order_channel`) — `b2b` (wholesale to a shop),
`b2c` (direct to a consumer at a fair or online), `internal` (supplier or
manufacturing order, not revenue), `consignment` (goods placed with an agent or
contact to sell, not revenue until reconciled), `delete_from_stock` (gift or
loss write-off, synced to the ERP), `sample` (legacy, merged into drafts).

**Draft** — `documents.status = 'draft'`: an order parked without side effects
(no commission, bonus, notice, ERP sync or revenue). Promoting it to `sent`
fires everything once. Not the same as the **`drafts` table**, which is the
order form's autosave per company name.

**Offre** — a draft with `draft_kind = 'offre'`: a formal written offer, listed
on its own admin page.

**Quick order** — an `agent_commissions` row of type `order` with no document
(`document_id = NULL`, `client_label` instead), so an admin can credit a past
sale without rebuilding it.

**Event / folder** — an `events` row. `type = 'fair'` is a trade fair
(Inhorgenta, Vicenzaoro…), `agent` is one agent's personal folder (one per
agent per organization), `partner` and `other` are catch-alls. Documents are
filed into folders; folder access is granted per user through `event_access`.

**Event permission** — `read` < `edit` < `manage` on one folder. Saving into a
folder needs `edit`; sharing or deleting it needs `manage`.

**Agent** (commercial) — a sales representative paid by commission;
`profiles.is_agent`. **Agent status**: `invited` (never logged in), `active`,
`paused`, `inactive` (trashed).

**Organization** — a partner company / agent team with `owner` and `member`
roles, a fallback commission rate, shared folders and a settlement ledger.

**Commercial assistant** — staff at a fair who can see every order of the fairs
they were granted; `profiles.is_assistant`.

**Employee** — an admin (`profiles.role = 'admin'`). "Commercial admin": an
admin who is also an agent.

**IGI** — the International Gemological Institute in Antwerp, which issues the
diamond certificates. Also the name of the external user type
(`profiles.is_igi`) that can only reach the `/igi` portal.

**Visitor** — a demo account (hard-coded email) that sees admin screens with
revenue masked.

**Commission** — `agent_commissions` row: `order` (automatic per order),
`bonus` (manual), `new_client_bonus`. **Rate**: the agent's own
`commission_rate`, else the organization's. **Config**: a structured scheme
(`flat`, `tiered`, `category`, `complex`) in `agent_commission_config`.

**New-client bonus** — a flat amount the first time an agent brings in a
company (matched on a normalised name). Modes `off`, `manual`, `auto`.

**Customer paid** (`customer_paid_at`) — the shop has paid LoveLab; only then
is the commission payable. **Ready to pay** = pending + customer paid.
**Reported** = included in a monthly report (`report_id`). **Paid** = settled
by an `agent_payments` row.

**Commission report** — the monthly `.xlsx` per agent (or organization) of
customer-paid commissions, archived in storage and Drive, emailed to the office.

**Settlement** — paying out a report: one `agent_payments` row with an
invoice number flips every commission on the report to `paid`.

**Pack** — a pre-built order at a fixed price (≥ €970) with an Excel template.
**Scope**: `global`, `private`, `restricted` (listed agents). **Seed pack**:
one of the catalogue packs, undeletable by owners. **Pack fairs**: the fairs a
pack is filed under.

**Client** — an entry in the shared address book (`clients`), distinct from the
client fields frozen inside a document's metadata.

**DZB** — a German jewellers' purchasing group; `clients.dzb_client_number` is
the shop's membership number, printed on orders.

**Jeweler group** (`clients.jeweler_group`, `documents.metadata.jewelerGroup`)
— `AUCUN`, `SYNALIA`, `MG`, `JOAILLIERS_ORFEVRES`: French purchasing groups.
**Synalia** is the one with a reporting contract: a quarterly turnover ("CA")
Excel for the agent Nicolas.

**Fair assistant** — the card-photo → OCR → translated follow-up email
pipeline. **Batch**: one fair. **Lead**: one extracted contact. **Lead type**:
`shop`, `agent`, `partner`, `other`, choosing the template variant.

**Price list announcement** — the email to all agents, in their language, when
a new price list is published. **Resources**: catalogues, price lists and pack
templates agents can download or email to clients.

**Certificate model** (`igi_models`) — one certificate design, identified by its
LGAJ **serial** (immutable). **Awaiting serial**: LoveLab asked for a new
model, IGI has not numbered it. **Reserved**: IGI reserved a serial before
producing.

**Pool** — IGI's stock of finished certificates for a model: batches − issued
+ count deltas. **Shelf** — LoveLab's stock: `shelf_opening` + ERP Certificate
In − Certificate Out. **Shelf min / order min** — alert levels on the shelf and
on IGI's pool.

**Batch** (IGI) — a production run IGI recorded. **Count** — IGI's correction
of their pool, stored as a delta.

**Visit / movement** — certificates crossing from IGI to LoveLab:
`requested` → `issued` → `closed`. **Lines**: per model, requested / issued /
received. **Correction**: an adjustment visit.

**Description** (IGI) — a stock label as it appears in the ERP, mapped to a
model or classified `packaging`, `in_house`, `ignore`.

**Receipt** (IGI) — the idempotent record of a Certificate In pushed to the ERP.

**Digest** — the scheduled IGI emails: morning (Liuba), weekly (IGI), order
(Alberto).

**ERP** — LoveLab's Laravel back-office at `software.lovelab-antwerp.com`:
stock, parties, memos, certificates.

**Out memo** — an ERP document for jewellery sent out on memo (approval).

**Health event** — a row in `system_health_events` recording something that
went wrong (bounce, failed sync, ghost commission), with admin alerting.

**Schema drift** — differences between `lib/expected-schema.mjs` and the live
database, detected by `npm run check:schema` and the nightly health check.

**Service role** — the Supabase key that bypasses RLS; used by most API routes,
never by the browser.

**RLS** — Row Level Security, Postgres policies that filter rows per user; the
real boundary only for the IGI portal and a few RLS-bound routes.
