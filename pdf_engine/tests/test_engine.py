import os
import sys
import tempfile
import unittest

import pymupdf

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import engine  # noqa: E402

FD = engine.FONT_DIR


def make_pdf(path):
    doc = pymupdf.open()
    pg = doc.new_page(width=300, height=300)
    pg.draw_rect(pymupdf.Rect(20, 150, 280, 290), color=None, fill=(0.8, 0.2, 0.2))  # stands in for a photo
    f = os.path.join(FD, "Montserrat-400.ttf")
    b = os.path.join(FD, "Montserrat-700.ttf")
    pg.insert_text((20, 40), "Hello world", fontsize=16, fontname="m4", fontfile=f)
    y = 70
    for line in ("Every piece begins with", "a spark and a story."):
        pg.insert_text((20, y), line, fontsize=10, fontname="m4", fontfile=f)
        y += 15
    pg.insert_text((20, 120), "Bold", fontsize=10, fontname="m7", fontfile=b)
    pg.insert_text((20, 130), "42", fontsize=10, fontname="m4", fontfile=f)
    doc.save(path)


class EngineTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.src = os.path.join(self.tmp, "in.pdf")
        self.out = os.path.join(self.tmp, "out.pdf")
        make_pdf(self.src)

    def units(self):
        return engine.extract(self.src)["pages"][0]["units"]

    def test_extract_groups_lines_into_paragraphs_and_skips_numbers(self):
        texts = [u["text"] for u in self.units()]
        self.assertIn("Hello world", texts)
        self.assertIn("Every piece begins with a spark and a story.", texts)
        self.assertNotIn("42", texts)

    def test_render_replaces_text_and_keeps_graphics(self):
        us = {u["text"]: u["id"] for u in self.units()}
        tr = {"0:%d" % us["Hello world"]: "Bonjour le monde",
              "0:%d" % us["Every piece begins with a spark and a story."]: "Chaque pièce naît d'une étincelle."}
        rep = engine.render(self.src, tr, self.out)
        text = pymupdf.open(self.out)[0].get_text()
        self.assertIn("Bonjour le monde", text)
        self.assertIn("Chaque pièce", text)
        self.assertNotIn("Hello world", text)
        self.assertIn("Bold", text)  # untouched paragraph stays
        self.assertEqual(rep["flags"], [])
        pm = pymupdf.open(self.out)[0].get_pixmap(dpi=72)
        self.assertEqual(pm.pixel(150, 220), (204, 51, 51))  # the filled box survived

    def test_overflow_is_flagged(self):
        us = {u["text"]: u["id"] for u in self.units()}
        long = "Chaque pièce commence par une étincelle, une histoire, un moment, un lien, une émotion, une promesse."
        rep = engine.render(self.src, {"0:%d" % us["Every piece begins with a spark and a story."]: long}, self.out)
        self.assertTrue(any(f["kind"] == "overflow" for f in rep["flags"]))

    def test_untranslated_units_are_left_alone(self):
        rep = engine.render(self.src, {}, self.out)
        self.assertEqual(rep["units"], 0)
        self.assertIn("Hello world", pymupdf.open(self.out)[0].get_text())

    def test_short_lines_are_kept_as_hard_line_breaks(self):
        doc = pymupdf.open()
        pg = doc.new_page(width=300, height=200)
        f = os.path.join(FD, "Montserrat-400.ttf")
        for i, t in enumerate(("Clustered light.", "Light, gathered into one soft shape.")):
            pg.insert_text((20, 40 + 14 * i), t, fontsize=10, fontname="m4", fontfile=f)
        src = os.path.join(self.tmp, "br.pdf")
        doc.save(src)
        u = engine.extract(src)["pages"][0]["units"][0]
        self.assertEqual(u["text"], "Clustered light.\nLight, gathered into one soft shape.")
        rep = engine.render(src, {"0:%d" % u["id"]: "Lumière groupée.\nLa lumière, en forme douce."}, self.out)
        self.assertEqual(rep["flags"], [])
        lines = [l.strip() for l in pymupdf.open(self.out)[0].get_text().splitlines() if l.strip()]
        self.assertEqual(lines, ["Lumière groupée.", "La lumière, en forme douce."])

    def test_adjacent_blocks_that_already_touched_are_not_flagged(self):
        doc = pymupdf.open()
        pg = doc.new_page(width=300, height=200)
        f = os.path.join(FD, "Montserrat-400.ttf")
        pg.insert_text((20, 40), "MULTI SUB-COLLECTION", fontsize=8, fontname="m4", fontfile=f)
        pg.insert_text((20, 49), "Three", fontsize=16, fontname="m4", fontfile=f)
        src = os.path.join(self.tmp, "t.pdf")
        doc.save(src)
        tr = {"0:%d" % u["id"]: u["text"] for u in engine.extract(src)["pages"][0]["units"]}
        self.assertEqual(engine.render(src, tr, self.out)["flags"], [])

    def test_font_mapping(self):
        self.assertEqual(engine._font_key("Montserrat-Bold"), "Montserrat-700")
        self.assertEqual(engine._font_key("Montserrat-Semi-Bold"), "Montserrat-600")
        self.assertEqual(engine._font_key("Cormorant-Garamond-Italic"), "Cormorant-400i")
        self.assertEqual(engine._font_key("PlayfairDisplay-Bold"), "Playfair-700")
        self.assertEqual(engine._font_key("HelveticaLTPro-Bold"), "Arimo-700")
        self.assertEqual(engine._font_key("Whatever"), "Arimo-400")

    def test_bundled_fonts_cover_french_german_greek_cyrillic(self):
        for key in ("Montserrat-400", "Arimo-400", "Inter-400", "Playfair-700", "Cormorant-400"):
            f = engine._font(key)
            for ch in "éèçàüßñœ":
                self.assertTrue(f.has_glyph(ord(ch)), (key, ch))
        for ch in "αβγΩ":
            self.assertTrue(engine._font("Arimo-400").has_glyph(ord(ch)))
        for ch in "ДЖЯ":
            self.assertTrue(engine._font("Montserrat-400").has_glyph(ord(ch)))


if __name__ == "__main__":
    unittest.main()
