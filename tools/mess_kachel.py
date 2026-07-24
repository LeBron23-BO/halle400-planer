#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Rendert einen Planausschnitt mit BEIDACHSIGEM Meterraster — das Lineal, mit dem
die Ausstattung (A1..A4) aus der PDF abgelesen wird.

Warum es plan_tiles.py nicht ersetzt und nicht ersetzt werden kann
------------------------------------------------------------------
`plan_tiles.py --kandidaten` beantwortet EINE Frage: steht an dieser x-Stelle
eine Wand? Dafuer genuegt ein senkrechtes Raster. Ein Moebelstueck hat aber
zwei Koordinaten und zwei Ausdehnungen — ohne waagerechtes Raster laesst sich
seine Lage nicht ablesen, nur schaetzen. Genau das verbietet die Projekt-DNA:
gemessen, nicht geraten.

Deshalb zeichnet dieses Werkzeug beide Achsen, beschriftet beide in Metern und
legt zusaetzlich die drei bekannten waagerechten Bezugslinien ein (Nordkante,
Flur oben/unten, Suedkante). Damit ist jeder Punkt im Ausschnitt direkt
ablesbar, ohne Zwischenrechnung.

Ablesen
-------
Ein Schreibtisch, dessen Rechteck von x 28.0 bis 29.6 und y 9.4 bis 10.2
reicht, ergibt den Eintrag

    {"typ": "tisch", "x": 2880, "y": 980, "breite": 160, "tiefe": 80,
     "beleg": "mess/x27-37_y0-16.png"}

— Mittelpunkt und Ausdehnung in ZENTIMETERN (das Schema rechnet in cm,
`src/core/dimensioning.ts:16`), Beleg ist der Dateiname dieses Ausschnitts.

Aufruf
------
    python tools/mess_kachel.py --von 27 --bis 37
    python tools/mess_kachel.py --von 0 --bis 10 --aus data/mess
    python tools/mess_kachel.py --alle --breite 10
"""
from __future__ import annotations

import argparse
from pathlib import Path

import fitz
from PIL import Image, ImageDraw, ImageFont

from extract_plan import (
    PDF_STANDARD, X0_DISPLAY, Y_NORDKANTE, Y_SUEDKANTE, Y_FLUR_NORD, Y_FLUR_SUED,
    PX_PRO_M, LAENGE_M, TIEFE_M,
)

ZOOM = 3.0                  # wie plan_tiles.py — dieselbe Ableseschaerfe
RAND_M = 1.2                # Luft um den Ausschnitt, damit Randmoebel sichtbar bleiben
AUS_STANDARD = Path("data/mess")

RASTER_1M = (150, 150, 150)
RASTER_HALB = (215, 215, 215)
ACHSE_FARBE = (200, 0, 0)
BEZUG_FARBE = (0, 110, 200)
TEXT_FARBE = (140, 0, 0)


def meter_zu_x(m: float) -> float:
    """Meter -> Anzeige-x (Umkehrung von extract_plan.x_zu_meter)."""
    return m * PX_PRO_M + X0_DISPLAY


def meter_zu_y(m: float) -> float:
    """Meter -> Anzeige-y (Umkehrung von extract_plan.y_zu_meter)."""
    return m * PX_PRO_M + Y_NORDKANTE


def schrift(groesse: int):
    for name in ("arial.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, groesse)
        except OSError:
            continue
    return ImageFont.load_default()


def _render(pdf: Path) -> Image.Image:
    seite = fitz.open(pdf)[0]
    pix = seite.get_pixmap(matrix=fitz.Matrix(ZOOM, ZOOM))
    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)


def mess_kachel(voll: Image.Image, von_m: float, bis_m: float, aus: Path) -> Path:
    """Ein Ausschnitt von..bis in x, volle Bauhoehe, mit xy-Raster."""
    x0 = int(meter_zu_x(von_m - RAND_M) * ZOOM)
    x1 = int(meter_zu_x(bis_m + RAND_M) * ZOOM)
    y0 = int((Y_NORDKANTE - RAND_M * PX_PRO_M) * ZOOM)
    y1 = int((Y_SUEDKANTE + RAND_M * PX_PRO_M) * ZOOM)
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(voll.width, x1), min(voll.height, y1)

    bild = voll.crop((x0, y0, x1, y1)).convert("RGB")
    d = ImageDraw.Draw(bild)
    fk = schrift(15)
    fg = schrift(19)

    hoehe, breite = bild.height, bild.width

    # --- senkrechtes Raster (x in Metern) ---------------------------------
    m = float(int(von_m - RAND_M))
    while m <= bis_m + RAND_M:
        px = meter_zu_x(m) * ZOOM - x0
        if 0 <= px < breite:
            ganz = abs(m - round(m)) < 1e-6
            d.line([(px, 0), (px, hoehe)], fill=RASTER_1M if ganz else RASTER_HALB, width=1)
            if ganz:
                d.text((px + 3, 4), f"{int(round(m))}", font=fk, fill=TEXT_FARBE)
                d.text((px + 3, hoehe - 22), f"{int(round(m))}", font=fk, fill=TEXT_FARBE)
        m += 0.5

    # --- waagerechtes Raster (y in Metern) --------------------------------
    m = float(int(-RAND_M) - 1)
    while m <= TIEFE_M + RAND_M:
        py = meter_zu_y(m) * ZOOM - y0
        if 0 <= py < hoehe:
            ganz = abs(m - round(m)) < 1e-6
            d.line([(0, py), (breite, py)], fill=RASTER_1M if ganz else RASTER_HALB, width=1)
            if ganz:
                d.text((4, py + 2), f"y{int(round(m))}", font=fk, fill=TEXT_FARBE)
        m += 0.5

    # --- die vier bekannten Bezugslinien ----------------------------------
    for ydisp, name in (
        (Y_NORDKANTE, "Nordkante"),
        (Y_FLUR_NORD, "Flur oben"),
        (Y_FLUR_SUED, "Flur unten"),
        (Y_SUEDKANTE, "Suedkante"),
    ):
        py = ydisp * ZOOM - y0
        if 0 <= py < hoehe:
            d.line([(0, py), (breite, py)], fill=BEZUG_FARBE, width=1)
            d.text((breite - 90, py + 2), name, font=fk, fill=BEZUG_FARBE)

    d.text((8, 26), f"x {von_m:g}..{bis_m:g} m   Raster 1 m (fein 0,5 m)",
           font=fg, fill=ACHSE_FARBE)

    aus.mkdir(parents=True, exist_ok=True)
    ziel = aus / f"x{von_m:g}-{bis_m:g}_y0-{TIEFE_M:g}.png"
    bild.save(ziel)
    return ziel


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--pdf", type=Path, default=PDF_STANDARD)
    p.add_argument("--von", type=float, help="Startmeter in x")
    p.add_argument("--bis", type=float, help="Endmeter in x")
    p.add_argument("--alle", action="store_true", help="ganze Halle in Abschnitten")
    p.add_argument("--breite", type=float, default=10.0, help="Abschnittsbreite bei --alle")
    p.add_argument("--aus", type=Path, default=AUS_STANDARD)
    args = p.parse_args()

    if not args.pdf.exists():
        print(f"PDF nicht gefunden: {args.pdf}")
        return 2

    voll = _render(args.pdf)

    if args.alle:
        a = 0.0
        while a < LAENGE_M:
            b = min(a + args.breite, LAENGE_M)
            print(mess_kachel(voll, a, b, args.aus))
            a = b
        return 0

    if args.von is None or args.bis is None:
        print("Entweder --von/--bis oder --alle angeben.")
        return 2

    print(mess_kachel(voll, args.von, args.bis, args.aus))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
