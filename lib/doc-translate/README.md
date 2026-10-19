# doc-translate

Admin "Translate to…" for LoveLab PDFs: the text changes language, the layout does not.

- `pdf/` reads a PDF into paragraphs (`extract.mjs`) and writes translations back in place (`render.mjs`) with MuPDF (WASM, AGPL). Only text is removed and redrawn; images and graphics are untouched.
- `translator.js` sends paragraphs to Claude in batches (keeps `**bold**` markers, line breaks, brand names, a length cap) and asks for shorter versions of what overflows.
- `engine.js` ties them together: extract → translate → render → shorten what does not fit (twice) → flags.
- `fonts/` static Inter, Montserrat, Cormorant Garamond, Playfair Display (SIL OFL) and Arimo (Apache 2.0). Latin, Greek, Cyrillic only.
- Route: `app/api/doc-translate`. Button: `app/components/TranslateMenu.jsx` in the Resources card.

Tests: `npx jest lib/doc-translate` (orchestration, Claude batches) and `npm run test:pdf` (real PDF work; MuPDF is ESM + WASM so it runs under node:test, not jest).

Known limits: text inside images is not translated; rotated pages are skipped; Vercel caps a function response at 4.5 MB (the translated catalogue is ~8.8 MB), so large files need storage and a download link.

## Jobs and storage

`POST /api/doc-translate` no longer returns the PDF. It writes a job file, answers
`202 { id }` and runs the translation after the response (`after()` in
`app/api/doc-translate/route.js`, up to `maxDuration`). The finished PDF is stored and
`GET /api/doc-translate/[id]` returns the status; when done it carries a 10-minute signed
link, the page count and the number of flagged paragraphs. The Resources card polls every
2 s. A job that stops reporting for 6 min shows as failed.

Nothing to migrate: everything is in the private `documents` bucket the app already uses
(server-side, admin client), under `translations/<job id>/`:
`job.json` (status, who asked, flags) and `<name> — <Language>.pdf`. Nothing deletes old
files yet; they are 3-9 MB each.

The engine (`translateDocument`) is called only from `jobs.js`, so a different engine (e.g. a
managed agent) can replace it without touching routes or UI.
