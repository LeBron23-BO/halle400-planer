#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Schneidet den Plan in lesbare, meter-beschriftete Kacheln — zum ANSEHEN.

Warum
-----
Der Plan ist eine Freihand-Skizze. Jede Zahl, die aus ihm gewonnen wird,
kann intern stimmig und trotzdem falsch sein — genau so lag die geerbte
Kalibrierung 78 x 15 m daneben, sichtbar erst im Overlay, nie in den Zahlen.
Ein Gesamtbild bei voller Seitenbreite ist zu klein, um Wand von Moebel zu
unterscheiden. Dieses Werkzeug erzeugt deshalb Ausschnitte in einer
Aufloesung, in der die Entscheidung tatsaechlich moeglich ist, mit dem
Meter-Raster als Lineal darueber.

Zwei Ansichten
--------------
  --uebersicht  ganze Bauhoehe, 4 Kacheln — Struktur und Topologie
  --kandidaten  eine Zeile (Nord/Sued) je Kachel, mit den gemessenen
                Wand-Kandidaten aus measure_walls.py eingezeichnet und
                nummeriert. Gruen = beruehrt beide Bandraender, grau = nicht.
                Die Nummern verweisen auf die Kandidatenliste, damit die
                Sicht-Entscheidung eine nachvollziehbare Kennung bekommt.

Aufruf
------
    python tools/plan_tiles.py --uebersicht
    python tools/plan_tiles.py --kandidaten
    python tools/plan_tiles.py --kandidaten --aus tmp/ --breite 15
"""
from __future__ import annotations

import argparse
from pathlib import Path

import fitz
from PIL import Image, ImageDraw, ImageFont

from extract_plan import (
    PDF_STANDARD, Y_NORDKANTE, Y_SUEDKANTE, Y_FLUR_NORD, Y_FLUR_SUED,
    PX_PRO_M, LAENGE_M, TIEFE_M, meter_zu_x, meter_zu_y,
)
from measure_walls import ZEILEN, messe_alle

ZOOM = 3.0
RAND_M = 1.2                # Luft um den Ausschnitt herum

FARBE_METER = (150, 150, 150)
FARBE_METER5 = (200, 0, 0)
FARBE_AUSSEN = (0, 190, 0)
FARBE_FLUR = (255, 150, 0)
FARBE_JA = (0, 170, 0)
FARBE_NEIN = (170, 170, 170)


def schrift(groesse: int):
    for name in ("segoeui.ttf", "arial.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, groesse)
        except OSError:
            continue
    return ImageFont.load_default()


def _render(pdf: Path) -> tuple[Image.Image, fitz.Page]:
    seite = fitz.open(pdf)[0]
    pix = seite.get_pixmap(matrix=fitz.Matrix(ZOOM, ZOOM))
    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples), seite


def _abschnitte(breite_m: float) -> list[tuple[float, float]]:
    """Ueberlappende Abschnitte — eine Wand am Rand darf nicht zerschnitten werden."""
    schritte, ueberlappung = [], 1.0
    start = 0.0
    while start < LAENGE_M:
        ende = min(LAENGE_M, start + breite_m)
        schritte.append((start, ende))
        if ende >= LAENGE_M:
            break
        start = ende - ueberlappung
    # Ein kurzer Rest ergaebe eine unlesbare Zwerg-Kachel — dann lieber die
    # vorletzte etwas verlaengern.
    if len(schritte) > 1 and schritte[-1][1] - schritte[-1][0] < 0.4 * breite_m:
        letzte = schritte.pop()
        schritte[-1] = (schritte[-1][0], letzte[1])
    return schritte


def _meterraster(d: ImageDraw.ImageDraw, x0: int, hoehe: int, a: float, b: float, fk):
    for m in range(int(a), int(b) + 1):
        px = meter_zu_x(m) * ZOOM - x0
        fuenfer = m % 5 == 0
        d.line([(px, 0), (px, hoehe)], fill=FARBE_METER5 if fuenfer else FARBE_METER,
               width=2 if fuenfer else 1)
        d.text((px + 3, 3), f"{m}", font=fk, fill=FARBE_METER5 if fuenfer else FARBE_METER)


def uebersicht(voll: Image.Image, aus: Path, breite_m: float) -> list[Path]:
    fk, fb = schrift(18), schrift(30)
    y0 = int((Y_NORDKANTE - RAND_M * PX_PRO_M) * ZOOM)
    y1 = int((Y_SUEDKANTE + RAND_M * PX_PRO_M) * ZOOM)
    pfade = []
    for i, (a, b) in enumerate(_abschnitte(breite_m)):
        x0 = int(meter_zu_x(a - RAND_M) * ZOOM)
        x1 = int(meter_zu_x(b + RAND_M) * ZOOM)
        k = voll.crop((max(0, x0), max(0, y0), x1, y1)).copy()
        d = ImageDraw.Draw(k)
        _meterraster(d, x0, k.height, a, b, fk)
        for ym, farbe in ((0.0, FARBE_AUSSEN), (TIEFE_M, FARBE_AUSSEN)):
            py = meter_zu_y(ym) * ZOOM - y0
            d.line([(0, py), (k.width, py)], fill=farbe, width=2)
        for ydisp in (Y_FLUR_NORD, Y_FLUR_SUED):
            py = ydisp * ZOOM - y0
            d.line([(0, py), (k.width, py)], fill=FARBE_FLUR, width=2)
        d.text((6, k.height - 34), f"Halle 400   x {a:.0f}..{b:.0f} m   "
               f"gruen = Aussenkante   orange = Flurachsen", font=fb, fill=(0, 0, 0))
        p = aus / f"plan_{i}_{a:.0f}-{b:.0f}m.png"
        k.save(p)
        pfade.append(p)
    return pfade


def kandidaten_kacheln(voll: Image.Image, pdf: Path, aus: Path,
                       breite_m: float) -> list[Path]:
    gemessen = messe_alle(pdf)
    fk, fb = schrift(20), schrift(32)
    pfade = []
    for zeile, (y_oben, y_unten) in ZEILEN.items():
        y0 = int((y_oben - 0.9 * PX_PRO_M) * ZOOM)
        y1 = int((y_unten + 0.9 * PX_PRO_M) * ZOOM)
        for i, (a, b) in enumerate(_abschnitte(breite_m)):
            x0 = int(meter_zu_x(a) * ZOOM)
            x1 = int(meter_zu_x(b) * ZOOM)
            k = voll.crop((max(0, x0), max(0, y0), x1, y1)).copy()
            d = ImageDraw.Draw(k)
            _meterraster(d, x0, k.height, a, b, fk)
            for kand in gemessen[zeile]:
                if not a <= kand.x_m <= b:
                    continue
                px = meter_zu_x(kand.x_m) * ZOOM - x0
                farbe = FARBE_JA if kand.durchlaufend else FARBE_NEIN
                d.line([(px, 30), (px, k.height - 34)], fill=farbe, width=3)
                d.text((px - 9, k.height - 34), f"{kand.nr}", font=fb, fill=farbe)
            d.text((6, 4), f"{zeile.upper()}   x {a:.0f}..{b:.0f} m   "
                   f"gruen = beruehrt beide Bandraender", font=fb, fill=FARBE_METER5)
            p = aus / f"kand_{zeile}_{i}_{a:.0f}-{b:.0f}m.png"
            k.save(p)
            pfade.append(p)
    return pfade


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--pdf", type=Path, default=PDF_STANDARD)
    p.add_argument("--aus", type=Path, default=Path("data/kacheln"))
    p.add_argument("--breite", type=float, default=20.0, help="Kachelbreite in Metern")
    p.add_argument("--uebersicht", action="store_true")
    p.add_argument("--kandidaten", action="store_true")
    args = p.parse_args()

    if not args.pdf.exists():
        print(f"PDF nicht gefunden: {args.pdf}")
        return 1
    if not (args.uebersicht or args.kandidaten):
        args.uebersicht = True

    args.aus.mkdir(parents=True, exist_ok=True)
    voll, _ = _render(args.pdf)

    pfade = []
    if args.uebersicht:
        pfade += uebersicht(voll, args.aus, args.breite)
    if args.kandidaten:
        pfade += kandidaten_kacheln(voll, args.pdf, args.aus, args.breite)

    for p_ in pfade:
        print(p_)
    print(f"\n{len(pfade)} Kacheln — ANSEHEN, nicht nur zaehlen.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
