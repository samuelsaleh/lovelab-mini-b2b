# doc-translate

Admin "Translate to…" for LoveLab PDFs: the text changes language, the layout does not.

- `pdf/` reads a PDF into paragraphs (`extract.mjs`) and writes translations back in place (`render.mjs`) with MuPDF (WASM, AGPL). Only text is removed and redrawn; images and graphics are untouched.
- `translator.js` sends paragraphs to Claude in batches (keeps `**bold**` markers, line breaks, brand names, a length cap) and asks for shorter versions of what overflows.
- `engine.js` ties them together: extract → translate → render → shorten what does not fit (twice) → flags.
- `fonts/` static Inter, Montserrat, Cormorant Garamond, Playfair Display (SIL OFL) and Arimo (Apache 2.0). Latin, Greek, Cyrillic only.
- Route: `app/api/doc-translate`. Button: `app/components/TranslateMenu.jsx` in the Resources card.

Tests: `npx jest lib/doc-translate` (orchestration, Claude batches) and `npm run test:pdf` (real PDF work; MuPDF is ESM + WASM so it runs under node:test, not jest).

Known limits: text inside images is not translated; rotated pages are skipped; Vercel caps a function response at 4.5 MB (the translated catalogue is ~8.8 MB), so large files need storage and a download link.
