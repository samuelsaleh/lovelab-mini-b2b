# Price lists, resources, Synalia report, saved reports

| Method | Path | Auth | RL | Purpose |
|---|---|---|---|---|
| GET | `/api/price-lists/announce/recipients` | A | 60 | Agents grouped by language |
| POST | `/api/price-lists/announce/translate` | A | 30 | Translate the note |
| POST | `/api/price-lists/announce/send` | A | 10 | Test or broadcast |
| POST | `/api/resources/send-email` | S | 20 | Email catalogues / price lists / pack templates to a client |
| GET | `/api/synalia-report/preview` | A | 60 | Quarterly totals |
| GET | `/api/synalia-report/export` | A | 30 | Download the xlsx |
| POST | `/api/synalia-report/send` | A | 20 | Generate, archive to Drive, email |
| GET / POST | `/api/reports` | S | 60 / 20 | Saved report configs |
| PUT / DELETE | `/api/reports/[id]` | S (own) | 20 | |

All three groups declare `runtime = 'nodejs'` where they attach files.

## Price list announcements

Emails every agent the new price list PDF with a note in their
`agent_language` (seven languages; `lib/priceListRecipients.js`,
`lib/priceListAnnouncement.js`).

- `GET …/recipients` →
  `{ "total": 31, "byLanguage": { "fr": [ … ], "nl": [ … ], "en": [ … ] }, "counts": { … },
     "fallbackToEnglish": [ … ], "derivedFromCountry": [ … ], "missingEmail": [ … ] }`.
- `POST …/translate { "note", "sourceLang", "targetLang", "collectionIds": [ … ] }`
  → `{ "text": "…" }`; 422 when Claude's back-translation check fails
  (`lib/ai/translateText.js`).
- `POST …/send`:

```json
{ "filePath": "price-lists/2026-10/LoveLab-pricelist-2026-10.pdf",
  "allCollections": true | "collectionIds": [ … ],
  "notes": { "en": "required", "fr": "…", "nl": "…" },
  "recipientIds": [ "…" ],                    // ≤ 500, broadcast
  "testToSelf": true | "testTo": "x@y.be", "testLang": "fr" }   // or a single test copy
```

Sends at 2 per second in a time-boxed loop; each send recorded in
`email_deliveries` (`kind = 'price_list_announcement'`).
`{ "sent", "failed", "skipped", "remaining": [ … ids … ], "results": [ … ] }`; repeat
with `recipientIds = remaining` until empty.

## `POST /api/resources/send-email`

```json
{ "files": [ { "path": "catalogues/2026/LoveLab-catalogue.pdf" }, { "path": "pack-templates/<packId>.xlsx" } ],
  "to": "client@shop.be", "lang": "fr", "contactName": "…",
  "subject": "…", "greeting": "…", "body": "…", "signoff": "…" }
```

Up to 20 files, 30 MB total, from the public resources (`lib/b2b-files.js`,
`lib/catalogues.js`) or the `pack-templates` bucket. Non-admins may only send
the agent-facing resource paths (403 otherwise). CC to the admins.
`{ "sent": true, "id": "…" }`.

## Synalia report

Quarterly turnover for the agent under the SYNALIA contract
(`SYNALIA_AGENT_EMAIL` in `lib/jewelerGroup.js`), based on orders whose
`metadata.jewelerGroup = 'SYNALIA'`.

- `GET …/preview?agent_id=&year=2026&quarter=3` → `{ "period": { … }, "orders": [ … ], "totals": { "ht", "count" } }`.
- `GET …/export?…` → the xlsx.
- `POST …/send { "agent_id", "year", "quarter" }` → builds, uploads to
  `GOOGLE_DRIVE_SYNALIA_REPORTS_FOLDER_ID`, emails `SYNALIA_REPORT_RECIPIENT`
  (default `dionne@love-lab.com`):
  `{ "filename", "period", "totals", "drive": { "fileId", "webViewLink" }, "email": { "id" } }`.

## Saved reports

User-owned report configurations for the Reports page (RLS-bound, own rows;
admins can read all).

`POST /api/reports { "name", "entity_type": "documents | commissions | clients | events", "config": { … ≤ 64 KB } }`
→ `{ "report": { … } }`. `GET` → `{ "reports": [ … ] }`. `PUT …/[id] { "name", "config" }`. `DELETE …/[id]`.
