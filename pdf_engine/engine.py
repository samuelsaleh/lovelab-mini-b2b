"""Extract translatable paragraphs from a PDF and write translations back in place.

Only text is removed and redrawn: images and vector graphics are left as they are.
A paragraph keeps its position, alignment, font size, colour and line spacing.
"""
import os
import re
from collections import Counter

import pymupdf

FONT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts")
FALLBACK = "Arimo-400"


def _font_key(name, italic_hint=False):
    n = name.lower()
    semi = "semi" in n or "demi" in n or "medium" in n
    bold = not semi and ("bold" in n or "black" in n or "heavy" in n)
    ital = "italic" in n or "ital" in n or "oblique" in n or italic_hint
    if "playfair" in n:
        return "Playfair-700" if bold or semi else "Playfair-400"
    if "cormorant" in n:
        w = 700 if bold else 600 if semi else 400
        if ital:
            return "Cormorant-%di" % (600 if w >= 600 else 400)
        return "Cormorant-%d" % w
    if "montserrat" in n:
        return "Montserrat-%d" % (700 if bold else 600 if semi else 400)
    if "inter" in n:
        return "Inter-%d" % (700 if bold else 600 if semi else 400)
    return "Arimo-700" if bold else "Arimo-400"


_fonts = {}


def _font(key):
    if key not in _fonts:
        _fonts[key] = pymupdf.Font(fontfile=os.path.join(FONT_DIR, key + ".ttf"))
    return _fonts[key]


def _font_for(name, text):
    """Bundled font for an original font name, falling back to Arimo for missing glyphs."""
    key = _font_key(name)
    f = _font(key)
    if all(f.has_glyph(ord(c)) for c in text if not c.isspace()):
        return key, True
    bold = key.endswith("700")
    alt = "Arimo-700" if bold else "Arimo-400"
    f2 = _font(alt)
    return alt, all(f2.has_glyph(ord(c)) for c in text if not c.isspace())


def _color(c):
    return ((c >> 16 & 255) / 255, (c >> 8 & 255) / 255, (c & 255) / 255)


def _lines_of(pg):
    out = []
    for b in pg.get_text("dict")["blocks"]:
        if b["type"] != 0:
            continue
        for l in b["lines"]:
            sp = [s for s in l["spans"] if s["text"].strip()]
            if not sp:
                continue
            out.append(dict(
                bbox=list(l["bbox"]), base=sp[0]["origin"][1],
                spans=[dict(t=s["text"], font=s["font"], size=s["size"], color=s["color"],
                            flags=s["flags"]) for s in sp]))
    return out


def _aligned(a, b, tol=2.5):
    A, B = a["bbox"], b["bbox"]
    r = set()
    if abs(A[0] - B[0]) < tol:
        r.add("left")
    if abs((A[0] + A[2]) / 2 - (B[0] + B[2]) / 2) < tol:
        r.add("center")
    if abs(A[2] - B[2]) < tol:
        r.add("right")
    return r


def _group(pg):
    """Regroup PDF text lines into paragraphs with an alignment."""
    L = _lines_of(pg)
    units, cur = [], None
    for l in L:
        size = l["spans"][0]["size"]
        if cur:
            p = cur["lines"][-1]
            gap = l["base"] - p["base"]
            poss = _aligned(p, l) if cur["align"] is None else cur["align"] & _aligned(p, l)
            if 0 < gap <= 1.95 * size and abs(size - p["spans"][0]["size"]) < 0.3 and poss:
                cur["lines"].append(l)
                cur["align"] = poss
                continue
        cur = dict(lines=[l], align=None)
        units.append(cur)
    if not units:
        return []
    xs0 = min(l["bbox"][0] for u in units for l in u["lines"])
    xs1 = max(l["bbox"][2] for u in units for l in u["lines"])
    centres = [(l["bbox"][0] + l["bbox"][2]) / 2 for u in units if len(u["lines"]) > 1
               and u["align"] and "center" in u["align"] and "left" not in u["align"] for l in u["lines"]]
    for i, u in enumerate(units):
        u["id"] = i
        if u["align"] is None or len(u["align"]) > 1:
            b = u["lines"][0]["bbox"]
            c = (b[0] + b[2]) / 2
            if u["align"] is None:
                u["align"] = ("center" if any(abs(c - x) < 3 for x in centres)
                              else "left" if abs(b[0] - xs0) < 3
                              else "right" if abs(b[2] - xs1) < 3 else "center")
            else:
                u["align"] = [a for a in ("center", "left", "right") if a in u["align"]][0]
        else:
            u["align"] = next(iter(u["align"]))
        c = Counter()
        for l in u["lines"]:
            for s in l["spans"]:
                c[s["font"]] += len(s["t"])
        u["base_font"] = c.most_common(1)[0][0]
        widths = [l["bbox"][2] - l["bbox"][0] for l in u["lines"]]
        maxw = max(widths)
        # a line that stops well short of the others (and is not the last) is a hard line break
        u["breaks"] = [i for i in range(len(widths) - 1) if widths[i] < 0.8 * maxw]
        txt = ""
        for i, l in enumerate(u["lines"]):
            for s in l["spans"]:
                txt += "**%s**" % s["t"] if s["font"] != u["base_font"] else s["t"]
            txt += "\n" if i in u["breaks"] else " "
        u["en"] = txt.replace("** **", " ").replace("****", "").strip()
        toks = u["en"].replace("**", "").split()
        u["letter"] = (len(u["lines"]) == 1 and len(toks) >= 3
                       and sum(1 for t in toks if len(t) <= 2) / len(toks) >= 0.7)
        if u["letter"]:
            u["clean"] = _letter_clean(pg, u)
    return units


def _letter_clean(pg, unit):
    """Rebuild 'A FIRST' from a letter-spaced line: gaps wider than the letter gap are word breaks."""
    bb = pymupdf.Rect(unit["lines"][0]["bbox"])
    chars = []
    for b in pg.get_text("rawdict", clip=bb)["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                chars += [c for c in s["chars"] if c["c"].strip()]
    chars.sort(key=lambda c: c["bbox"][0])
    if len(chars) < 2:
        return _plain(unit["en"])
    gaps = [chars[i + 1]["bbox"][0] - chars[i]["bbox"][2] for i in range(len(chars) - 1)]
    med = sorted(gaps)[len(gaps) // 2]
    out = chars[0]["c"]
    for i, g in enumerate(gaps):
        if g > med * 2.2 and g - med > 1.0:
            out += " "
        out += chars[i + 1]["c"]
    return out


def _plain(s):
    return s.replace("**", "").replace("\n", " ")


def extract(pdf_path):
    doc = pymupdf.open(pdf_path)
    pages = []
    for pn, pg in enumerate(doc):
        units = []
        for u in _group(pg):
            plain = _plain(u["en"])
            if len(re.findall(r"[^\W\d_]", plain)) < 2:  # digits, symbols or a single letter: nothing to translate
                continue
            item = dict(id=u["id"], text=u["en"], chars=len(plain), lines=len(u["lines"]),
                        align=u["align"], letter_spaced=u["letter"])
            if u["letter"]:
                item["text"] = u["clean"]
                item["chars"] = len(item["text"])
            units.append(item)
        pages.append(dict(page=pn, width=pg.rect.width, height=pg.rect.height, units=units))
    return dict(pages=pages)


def render(pdf_path, translations, out_path):
    """translations: {"<page>:<id>": "translated text with **bold** markers"}."""
    doc = pymupdf.open(pdf_path)
    flags, count = [], 0
    for pn, pg in enumerate(doc):
        units = _group(pg)
        todo = []
        for u in units:
            fr = translations.get("%d:%d" % (pn, u["id"]))
            if fr is None or not fr.strip():
                continue
            todo.append((u, fr))
        if not todo:
            continue
        for u, _ in todo:
            for l in u["lines"]:
                r = pymupdf.Rect(l["bbox"])
                r.y0 += 1.2
                r.y1 -= 1.2
                r.x0 += 0.3
                r.x1 -= 0.3
                pg.add_redact_annot(r, fill=False)
        pg.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE,
                            graphics=pymupdf.PDF_REDACT_LINE_ART_NONE,
                            text=pymupdf.PDF_REDACT_TEXT_REMOVE)
        placed = []
        for u, fr in todo:
            info = _draw_unit(pg, pn, u, fr, pg_units=units)
            flags += info["flags"]
            placed.append((u, info["rect"]))
            count += 1
        # collisions: a new text area must not run into another paragraph more than the original did
        def area(a, b):
            i = a & b
            return 0 if i.is_empty else i.width * i.height

        for u, rect in placed:
            orig = pymupdf.Rect(
                min(l["bbox"][0] for l in u["lines"]), min(l["bbox"][1] for l in u["lines"]),
                max(l["bbox"][2] for l in u["lines"]), max(l["bbox"][3] for l in u["lines"]))
            for v in units:
                if v is u:
                    continue
                vr = pymupdf.Rect(
                    min(l["bbox"][0] for l in v["lines"]), min(l["bbox"][1] for l in v["lines"]),
                    max(l["bbox"][2] for l in v["lines"]), max(l["bbox"][3] for l in v["lines"]))
                if area(rect, vr) > area(orig, vr) + 3 and not any(
                        f["page"] == pn and f["id"] == u["id"] and f["kind"] == "overflow" for f in flags):
                    flags.append(dict(page=pn, id=u["id"], kind="overflow",
                                      detail="text runs into the next block"))
            pr = pg.rect
            if rect.x0 < -1 or rect.x1 > pr.width + 1 or rect.y1 > pr.height + 1:
                flags.append(dict(page=pn, id=u["id"], kind="overflow", detail="text leaves the page"))
    doc.save(out_path, garbage=3, deflate=True)
    return dict(units=count, flags=flags)


def _runs(fr, base_key, alt_key, base_col, alt_col):
    runs = []
    for i, part in enumerate(fr.split("**")):
        if part:
            runs.append((part, alt_key if i % 2 else base_key, alt_col if i % 2 else base_col))
    words, glue = [], False
    for txt, k, c in runs:
        for p in re.findall(r"\S+|\s+", txt):
            if p.isspace():
                glue = False
                continue
            if glue and words:
                words[-1].append((p, k, c))
            else:
                words.append([(p, k, c)])
            glue = True
    return words


def _draw_unit(pg, pn, u, fr, pg_units):
    flags = []
    L = u["lines"]
    size = L[0]["spans"][0]["size"]
    base_span = next(s for l in L for s in l["spans"] if s["font"] == u["base_font"])
    alt_span = next((s for l in L for s in l["spans"] if s["font"] != u["base_font"]), None)
    plain = _plain(fr)
    base_key, ok = _font_for(u["base_font"], plain)
    alt_key = _font_for(alt_span["font"], plain)[0] if alt_span else base_key
    if not ok:
        flags.append(dict(page=pn, id=u["id"], kind="glyph", detail="font lacks some characters"))
    base_col = _color(base_span["color"])
    alt_col = _color(alt_span["color"]) if alt_span else base_col
    x0 = min(l["bbox"][0] for l in L)
    x1 = max(l["bbox"][2] for l in L)
    W = x1 - x0
    cx = sum((l["bbox"][0] + l["bbox"][2]) / 2 for l in L) / len(L)
    al = u["align"]
    n = len(L)
    top = min(l["bbox"][1] for l in L)

    def put(x, y, text, key, sz, col):
        pg.insert_text((x, y), text, fontsize=sz, fontname=key,
                       fontfile=os.path.join(FONT_DIR, key + ".ttf"), color=col)

    if u["letter"]:
        f = _font(base_key)
        # tracking: the spacing that makes the original label fill its original width
        orig_chars = len(u["clean"])
        nat = f.text_length(u["clean"], size)
        track = (W - nat) / max(orig_chars - 1, 1)
        wfr = sum(f.text_length(c, size) + track for c in plain) - track
        xs = x0 if al == "left" else x1 - wfr if al == "right" else cx - wfr / 2
        x = xs
        for ch in plain:
            put(x, L[0]["base"], ch, base_key, size, base_col)
            x += f.text_length(ch, size) + track
        return dict(flags=flags, rect=pymupdf.Rect(xs, top, xs + wfr, L[0]["bbox"][3]))

    segs = fr.split("\n")
    if len(segs) != len(u["breaks"]) + 1:
        if len(segs) > 1:
            flags.append(dict(page=pn, id=u["id"], kind="linebreaks", detail="line breaks not kept"))
        segs = [fr.replace("\n", " ")]
    carry = False
    seg_words = []
    for sg in segs:
        if carry:
            sg = "**" + sg
        carry = sg.count("**") % 2 == 1
        if carry:
            sg += "**"
        seg_words.append(_runs(sg, base_key, alt_key, base_col, alt_col))
    if not any(seg_words):
        return dict(flags=flags, rect=pymupdf.Rect(x0, top, x1, top))
    lead = (L[-1]["base"] - L[0]["base"]) / (n - 1) if n > 1 else 0

    def ww(w, sz):
        return sum(_font(k).text_length(t, sz) for t, k, c in w)

    def width(ws, sz):
        return sum(ww(w, sz) for w in ws) + _font(base_key).text_length(" ", sz) * (len(ws) - 1)

    chosen = None
    for scale in (1.0, 0.98, 0.96, 0.95):
        sz = size * scale
        lines = []
        for words in seg_words:
            cur = [[]]
            if n == 1:
                cur = [words]
            else:
                for w in words:
                    trial = cur[-1] + [w]
                    if cur[-1] and width(trial, sz) > W + 0.5:
                        cur.append([w])
                    else:
                        cur[-1] = trial
            lines += cur
        if len(lines) <= n and all(width(l, sz) <= W + 0.5 or n == 1 for l in lines):
            chosen = (sz, lines, scale)
            break
    if not chosen:
        chosen = (size * 0.95, lines, 0.95)
    sz, lines, scale = chosen
    if scale < 1.0:
        flags.append(dict(page=pn, id=u["id"], kind="shrunk", detail="font reduced by %d%%" % round((1 - scale) * 100)))
    if len(lines) > n:
        flags.append(dict(page=pn, id=u["id"], kind="overflow", detail="%d lines instead of %d" % (len(lines), n)))
    xmin, xmax = 1e9, -1e9
    for i, ln in enumerate(lines):
        w = width(ln, sz)
        xs = x0 if al == "left" else x1 - w if al == "right" else cx - w / 2
        xmin, xmax = min(xmin, xs), max(xmax, xs + w)
        y = L[0]["base"] + i * (lead if lead else 0)
        x = xs
        for wd in ln:
            for t, k, c in wd:
                put(x, y, t, k, sz, c)
                x += _font(k).text_length(t, sz)
            x += _font(base_key).text_length(" ", sz)
    lh = lead if lead else (L[0]["bbox"][3] - L[0]["bbox"][1])
    bottom = L[0]["bbox"][1] + (len(lines) - 1) * lh + (L[0]["bbox"][3] - L[0]["bbox"][1])
    return dict(flags=flags, rect=pymupdf.Rect(xmin, top, xmax, bottom))

