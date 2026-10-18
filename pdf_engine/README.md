# pdf_engine

Rewrites the text of a PDF in another language while leaving everything else
(photos, shapes, layout) untouched. Used by the admin "Translate to…" menu.

- `engine.py`: `extract(pdf)` lists the translatable paragraphs; `render(pdf, translations)` writes them back in place and reports overflows.
- `cli.py`: `python3 pdf_engine/cli.py extract in.pdf` / `render in.pdf translations.json out.pdf`. JSON on stdout.
- `fonts/`: static instances of Inter, Montserrat, Cormorant Garamond, Playfair Display (SIL OFL) and Arimo (Apache 2.0). Covers Latin, Greek and Cyrillic.
- Needs `pip install -r pdf_engine/requirements.txt` (PyMuPDF is AGPL: licence decision for the repo owner).
- Tests: `python3 -m unittest discover -s pdf_engine/tests`.
