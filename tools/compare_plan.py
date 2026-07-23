#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Stellt Original-Plan und Nachbildung untereinander — im GLEICHEN Massstab.

Warum untereinander und nicht uebereinander
-------------------------------------------
Ein Overlay (tools/overlay_plan.py --waende) beantwortet die Frage "sitzt jede
gezeichnete Wand richtig?". Es beantwortet NICHT die Frage "was FEHLT?" — eine
fehlende Wand ist im Overlay unsichtbar, weil dort schlicht nichts liegt.
Zwei Streifen im gleichen Massstab zeigen beides: Versatz und Luecke.

Aufruf
------
    python tools/compare_plan.py                  # -> data/vergleich.png
    python tools/compare_plan.py --zoom 2
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import fitz
from PIL import Image, ImageDraw, ImageFont

from extract_plan import (
    PDF_STANDARD, Y_NORDKANTE, Y_SUEDKANTE, PX_PRO_M, LAENGE_M, TIEFE_M,
    meter_zu_x, meter_zu_y,
)

ABSCHNITTE = [(0.0, 39.0), (39.0, 78.0)]
FARBE_WAND = {"aussen": (20, 20, 20), "flur": (200, 90, 0), "trennwand": (150, 0, 160)}
BESCHRIFTUNG_H = 34


def schrift(groesse: int):
    for name in ("segoeui.ttf", "arial.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, groesse)
        except OSError:
            continue
    return ImageFont.load_default()


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--pdf", type=Path, default=PDF_STANDARD)
    p.add_argument("--walls", type=Path, default=Path("data/walls.json"))
    p.add_argument("--aus", type=Path, default=Path("data/vergleich.png"))
    p.add_argument("--zoom", type=float, default=1.6)
    args = p.parse_args()

    if not args.walls.exists():
        print(f"fehlt: {args.walls} — erst 'python tools/build_walls.py'")
        return 1

    z = args.zoom
    seite = fitz.open(args.pdf)[0]
    pix = seite.get_pixmap(matrix=fitz.Matrix(z, z))
    original = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    waende = json.loads(args.walls.read_text(encoding="utf-8"))["waende"]

    luft = 0.8 * PX_PRO_M
    hoehe = int((Y_SUEDKANTE - Y_NORDKANTE + 2 * luft) * z)
    fb, fk = schrift(int(15 * z)), schrift(int(9 * z))

    streifen: list[Image.Image] = []
    for a, b in ABSCHNITTE:
        x0 = int(meter_zu_x(a) * z)
        x1 = int(meter_zu_x(b) * z)
        y0 = int((Y_NORDKANTE - luft) * z)
        breite = x1 - x0

        # oben: das Original
        oben = original.crop((max(0, x0), max(0, y0), x1, y0 + hoehe)).copy()
        d = ImageDraw.Draw(oben)
        d.rectangle([0, 0, breite, BESCHRIFTUNG_H], fill=(255, 255, 255))
        d.text((8, 6), f"ORIGINAL-PLAN   x {a:.0f}..{b:.0f} m", font=fb, fill=(0, 0, 0))
        streifen.append(oben)

        # unten: die Nachbildung, gleicher Massstab, gleicher Ausschnitt
        unten = Image.new("RGB", (breite, hoehe), (255, 255, 255))
        d = ImageDraw.Draw(unten)
        for m in range(int(a), int(b) + 1, 5):
            px = meter_zu_x(m) * z - x0
            d.line([(px, BESCHRIFTUNG_H), (px, hoehe)], fill=(226, 226, 226), width=1)
            d.text((px + 3, BESCHRIFTUNG_H + 2), f"{m}", font=fk, fill=(170, 170, 170))
        for w in waende:
            va = (meter_zu_x(w["von"][0]) * z - x0, meter_zu_y(w["von"][1]) * z - y0)
            vb = (meter_zu_x(w["bis"][0]) * z - x0, meter_zu_y(w["bis"][1]) * z - y0)
            d.line([va, vb], fill=FARBE_WAND.get(w["art"], (0, 0, 0)),
                   width=max(3, int(4 * z)))
        d.rectangle([0, 0, breite, BESCHRIFTUNG_H], fill=(255, 255, 255))
        d.text((8, 6), f"NACHBILDUNG   {len(waende)} Waende   "
               f"schwarz = Aussenkante · orange = Flur · magenta = Trennwand",
               font=fb, fill=(0, 0, 0))
        streifen.append(unten)

    gesamt = Image.new("RGB", (max(s.width for s in streifen),
                               sum(s.height for s in streifen) + 8 * len(streifen)),
                       (245, 245, 245))
    y = 0
    for s in streifen:
        gesamt.paste(s, (0, y))
        y += s.height + 8

    args.aus.parent.mkdir(parents=True, exist_ok=True)
    gesamt.save(args.aus)
    print(f"geschrieben: {args.aus}  ({gesamt.width}x{gesamt.height})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
