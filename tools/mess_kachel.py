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
    python tools/mess_kachel.py --von 6 --bis 13 --mit-ausstattung

--mit-ausstattung: das mechanische Auge fuer t2 (W20)
-----------------------------------------------------
Bis hierher war der Abgleich "steht das Stueck da, wo es gezeichnet ist?" reines
Augenmass auf zwei nebeneinander gehaltenen Bildern — und Augenmass auf einem
freihaendigen Plan ist genau die Schaetzung, die die Projekt-DNA verbietet. Mit
diesem Schalter wird JEDES Stueck des ausgelieferten Plans als roter Umriss auf
den Ausschnitt gelegt. Deckt sich der Umriss nicht mit dem gezeichneten Moebel,
ist das ein BEFUND und keine Ansichtssache.

Gelesen wird der AUSGELIEFERTE Plan (app/public/plaene/halle400.json), nicht
data/ausstattung.json: gefragt ist, was der Planer wirklich zeigt und was
raum-inventar.mjs zaehlt. Eine nicht neu gebaute Auslieferungsdatei faellt so
im selben Bild auf.
"""
from __future__ import annotations

import argparse
import json
import math
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
MODELL_FARBE = (230, 40, 40)       # der Umriss aus dem Modell — Signalfarbe, weil er NICHT zum Plan gehoert
MODELL_MITTE = (255, 120, 0)
PLAN_AUSGELIEFERT = Path("app/public/plaene/halle400.json")


def lade_ausstattung(plan: Path = PLAN_AUSGELIEFERT) -> list[dict]:
    """Die Stuecke des ausgelieferten Plans. Fehlt die Datei, ist das ein Fehler
    und keine leere Liste — ein stiller Null-Overlay saehe aus wie 'alles passt'."""
    roh = json.loads(plan.read_text(encoding="utf-8"))
    fp = roh.get("floorplan", roh)
    stuecke = fp.get("ausstattung")
    if not stuecke:
        raise SystemExit(f"{plan} traegt keine Ausstattung — Overlay waere eine Luege.")
    return stuecke


def _ecken_cm(s: dict) -> list[tuple[float, float]]:
    """Die vier Ecken eines Stuecks in cm, um seinen Mittelpunkt gedreht."""
    b, t = s.get("breite", 0) / 2.0, s.get("tiefe", 0) / 2.0
    w = float(s.get("drehung") or 0.0)
    co, si = math.cos(w), math.sin(w)
    return [
        (s["x"] + dx * co - dy * si, s["y"] + dx * si + dy * co)
        for dx, dy in ((-b, -t), (b, -t), (b, t), (-b, t))
    ]


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


def mess_kachel(voll: Image.Image, von_m: float, bis_m: float, aus: Path,
                stuecke: list[dict] | None = None) -> Path:
    """Ein Ausschnitt von..bis in x, volle Bauhoehe, mit xy-Raster.

    `stuecke` legt die Modell-Ausstattung als Umriss darueber (--mit-ausstattung)."""
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

    # --- die Modell-Ausstattung als Umriss (W20) ---------------------------
    gezeigt = 0
    if stuecke:
        for s in stuecke:
            ecken = _ecken_cm(s)
            pts = [(meter_zu_x(ex / 100) * ZOOM - x0, meter_zu_y(ey / 100) * ZOOM - y0)
                   for ex, ey in ecken]
            if all(p[0] < 0 or p[0] >= breite for p in pts):
                continue
            gezeigt += 1
            d.polygon(pts, outline=MODELL_FARBE)
            mx = meter_zu_x(s["x"] / 100) * ZOOM - x0
            my = meter_zu_y(s["y"] / 100) * ZOOM - y0
            d.line([(mx - 4, my), (mx + 4, my)], fill=MODELL_MITTE, width=2)
            d.line([(mx, my - 4), (mx, my + 4)], fill=MODELL_MITTE, width=2)
            d.text((pts[0][0] + 2, pts[0][1] + 1), s["typ"][:4], font=fk, fill=MODELL_FARBE)

    d.text((8, 26), f"x {von_m:g}..{bis_m:g} m   Raster 1 m (fein 0,5 m)",
           font=fg, fill=ACHSE_FARBE)
    if stuecke:
        d.text((8, 48), f"rot = {gezeigt} Stueck aus {PLAN_AUSGELIEFERT.name} (Modell, nicht Plan)",
               font=fg, fill=MODELL_FARBE)

    aus.mkdir(parents=True, exist_ok=True)
    # Ein Overlay bekommt einen EIGENEN Namen: die `beleg`-Felder in
    # data/ausstattung.json zeigen auf die reinen Kacheln. Ein Beleg, der
    # ploetzlich das Modell mitzeigt, belegt sich selbst.
    zusatz = "_modell" if stuecke else ""
    ziel = aus / f"x{von_m:g}-{bis_m:g}_y0-{TIEFE_M:g}{zusatz}.png"
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
    p.add_argument("--mit-ausstattung", action="store_true",
                   help="Modell-Stuecke als roten Umriss darueberlegen (Soll-Ist, W20)")
    p.add_argument("--plan", type=Path, default=PLAN_AUSGELIEFERT,
                   help="Quelle der Modell-Stuecke")
    args = p.parse_args()

    if not args.pdf.exists():
        print(f"PDF nicht gefunden: {args.pdf}")
        return 2

    stuecke = lade_ausstattung(args.plan) if args.mit_ausstattung else None
    voll = _render(args.pdf)

    if args.alle:
        a = 0.0
        while a < LAENGE_M:
            b = min(a + args.breite, LAENGE_M)
            print(mess_kachel(voll, a, b, args.aus, stuecke))
            a = b
        return 0

    if args.von is None or args.bis is None:
        print("Entweder --von/--bis oder --alle angeben.")
        return 2

    print(mess_kachel(voll, args.von, args.bis, args.aus, stuecke))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
