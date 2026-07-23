#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Sicht-Vergleich: zeichnet die extrahierte Geometrie ueber den Original-Plan.

Das ist das Gate von T2. Zahlen in einer JSON-Datei koennen falsch sein und
trotzdem plausibel aussehen — erst die Deckung mit dem gezeichneten Plan zeigt,
ob die Extraktion stimmt. Ausgabe ist bewusst ein Bild zum ANSEHEN, kein
weiterer Zahlenreport.

Eingezeichnet werden:
  * das Massstabs-Rechteck (0/0 .. 78/15 m)  — sitzt es auf den Aussenwaenden?
  * jeder Raum-Ankerpunkt mit Namen          — liegt er im richtigen Raum?
  * das Meter-Raster alle 5 m                — stimmt der Massstab durchgehend?

Aufruf
------
    python tools/overlay_plan.py                       # -> data/overlay-check.png
    python tools/overlay_plan.py --zoom 3 --aus x.png
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import fitz
from PIL import Image, ImageDraw, ImageFont

STANDARD_JSON = Path("data/plan-geometry.json")
STANDARD_AUS = Path("data/overlay-check.png")

FARBE_RAHMEN = (0, 120, 220)
FARBE_RASTER = (0, 170, 255)
FARBE_ANKER = (220, 30, 90)
FARBE_TEXT = (150, 0, 60)


def schrift(groesse: int):
    for name in ("segoeui.ttf", "arial.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, groesse)
        except OSError:
            continue
    return ImageFont.load_default()


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--json", type=Path, default=STANDARD_JSON)
    p.add_argument("--aus", type=Path, default=STANDARD_AUS)
    p.add_argument("--zoom", type=float, default=2.0)
    args = p.parse_args()

    if not args.json.exists():
        print(f"fehlt: {args.json} — erst 'python tools/extract_plan.py' laufen lassen")
        return 1

    daten = json.loads(args.json.read_text(encoding="utf-8"))
    dok = fitz.open(daten["quelle"])
    seite = dok[0]

    z = args.zoom
    pix = seite.get_pixmap(matrix=fitz.Matrix(z, z))
    bild = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    zeichne = ImageDraw.Draw(bild)

    # Massstab aus derselben Quelle wie die Extraktion, nicht neu geraten.
    import sys
    sys.path.insert(0, str(Path(__file__).parent))
    from extract_plan import X0_DISPLAY, X1_DISPLAY, Y0_DISPLAY, Y1_DISPLAY, LAENGE_M, TIEFE_M

    def px(x_m: float, y_m: float) -> tuple[float, float]:
        x = X0_DISPLAY + x_m / LAENGE_M * (X1_DISPLAY - X0_DISPLAY)
        y = Y0_DISPLAY + y_m / TIEFE_M * (Y1_DISPLAY - Y0_DISPLAY)
        return x * z, y * z

    # Bezugsrechteck
    o, u = px(0, 0), px(LAENGE_M, TIEFE_M)
    zeichne.rectangle([o, u], outline=FARBE_RAHMEN, width=max(2, int(z)))

    # Meter-Raster
    klein = schrift(int(9 * z))
    for m in range(0, int(LAENGE_M) + 1, 5):
        a, b = px(m, 0), px(m, TIEFE_M)
        zeichne.line([a, b], fill=FARBE_RASTER, width=1)
        zeichne.text((a[0] + 2 * z, o[1] - 14 * z), f"{m}", font=klein, fill=FARBE_RASTER)
    for m in range(0, int(TIEFE_M) + 1, 5):
        a, b = px(0, m), px(LAENGE_M, m)
        zeichne.line([a, b], fill=FARBE_RASTER, width=1)
        zeichne.text((o[0] - 16 * z, a[1] - 6 * z), f"{m}", font=klein, fill=FARBE_RASTER)

    # Raum-Anker
    gross = schrift(int(10 * z))
    r = 4 * z
    for b in daten["beschriftungen"]:
        if b["anker_x_m"] is None:
            continue
        x, y = px(b["anker_x_m"], b["anker_y_m"])
        zeichne.ellipse([x - r, y - r, x + r, y + r], outline=FARBE_ANKER, width=max(2, int(z)))
        zeichne.line([(x - r * 1.8, y), (x + r * 1.8, y)], fill=FARBE_ANKER, width=1)
        zeichne.line([(x, y - r * 1.8), (x, y + r * 1.8)], fill=FARBE_ANKER, width=1)
        versatz = -16 * z if b["seite"] == "nord" else 8 * z
        zeichne.text((x + 6 * z, y + versatz), b["text"], font=gross, fill=FARBE_TEXT)

    args.aus.parent.mkdir(parents=True, exist_ok=True)
    bild.save(args.aus)
    print(f"geschrieben: {args.aus}  ({bild.width}x{bild.height})")
    print("Pruefen: sitzt das blaue Rechteck auf den Aussenwaenden, liegt jeder rote "
          "Anker im benannten Raum?")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
