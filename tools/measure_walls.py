#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Misst Trennwand-KANDIDATEN aus dem Rasterbild des Plans (T2c).

Warum ein eigenes Werkzeug neben extract_plan.py
------------------------------------------------
extract_plan.py wertet die EXAKTEN Ebenen aus (Text + Vektor-Fuehrungslinien).
Fuer die Waende gibt es keine solche Ebene — nachgeprueft am 2026-07-23:

    get_drawings() liefert 56 senkrechte Linien. 18 davon sind die
    Fuehrungslinien. Die uebrigen 38 liegen ALLE bei y 1200..1210 (Anzeige),
    das entspricht 27.5..27.9 m — also weit unterhalb der Suedkante (15.31 m),
    im Planstempel. Von den 317 Bezier-Kurven liegen 245 ebenfalls dort, der
    Rest sind Buchstaben-Rundungen der Beschriftungen (Ausdehnung < 10 px).

Ergebnis: die Waende existieren AUSSCHLIESSLICH als Pixel. Dieses Werkzeug
liefert deshalb bewusst KANDIDATEN mit Messwerten, keine fertige Wandliste —
die Entscheidung "Wand oder Moebel" faellt am Bild (siehe plan_tiles.py).

Verfahren
---------
1. Render bei 3x, dunkel = Grauwert < 150.
2. Fuehrungslinien tilgen. Sie reichen bis in die Raeume hinein und
   verfaelschen sonst jede Spaltensumme — die exakte Ebene saeubert die
   unscharfe.
3. Je Zeile (Nord = Nordkante..Flur, Sued = Flur..Suedkante) die
   Spaltenbelegung bilden: Anteil dunkler Pixel ueber die Bandhoehe.
4. Spalten oberhalb der Schwelle zu Clustern verschmelzen. Der Radius ist in
   METERN angegeben, nicht in Pixeln — sonst driftet er mit dem Zoom.
   Grund fuer den grossen Radius: der Freihand-Duktus zeichnet jede Wand als
   Doppellinie, beide Striche gehoeren zu EINER Wand.
5. Je Cluster messen:
     x_m        Wandachse = belegungsgewichteter Schwerpunkt (Mittellinie des
                Duktus, NICHT die Pixelkante — der Plan ist gezeichnet, nicht
                konstruiert).
     beleg      Spitzenbelegung. Eine Wand MIT Tueroeffnung erreicht keine
                hohe Belegung, deshalb ist das allein kein Kriterium.
     rand_oben / rand_unten
                Beruehrt der Cluster den oberen bzw. unteren Bandrand? Eine
                Trennwand laeuft von der Aussenwand bis zum Flur durch, ein
                Tisch steht frei. Das ist der staerkste mechanische Filter.

Was der Filter NICHT kann (gemessen, nicht vermutet)
---------------------------------------------------
Bei Schwelle 0.30 / Radius 0.60 m ueberleben 30 Nord- und 26 Sued-Kandidaten
fuer 18 benannte Bereiche. Zwei Ursachen, beide im Plan selbst:
  * Der Riegel ist nicht durchgehend zweizeilig. Zwischen x 12 und 65 m
    stimmt das Modell Nordzeile/Flur/Suedzeile; West (0..12) und Ost (65..78)
    sind verwinkelt (Treppenhaus, Sanitaer, Kueche, Lager).
  * Zwischen x 12.7 und 23.8 m gibt es in der Nordzeile GAR KEINE Trennwand —
    Kueche, Teamtable, Aufzug und Empfang liegen in einem offenen Bereich.
    Ein Gate "jeder Anker liegt in genau einem Fach" ist deshalb unerfuellbar,
    solange offene Zonen nicht als solche gefuehrt werden.

Aufruf
------
    python tools/measure_walls.py                    # Kandidaten auf stdout
    python tools/measure_walls.py --json data/wall-candidates.json
    python tools/measure_walls.py --schwelle 0.35 --radius 0.5
"""
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass, asdict
from pathlib import Path

import fitz
import numpy as np

from extract_plan import (
    PDF_STANDARD, X0_DISPLAY, X1_DISPLAY, Y_NORDKANTE, Y_SUEDKANTE,
    Y_FLUR_NORD, Y_FLUR_SUED, PX_PRO_M, x_zu_meter, sammle_leader,
)

ZOOM = 3.0                  # Render-Vergroesserung; alles Weitere rechnet in Metern
GRAU_SCHWELLE = 150         # darunter gilt ein Pixel als Zeichnung
SCHWELLE = 0.30             # Mindest-Spaltenbelegung fuer einen Kandidaten
RADIUS_M = 0.60             # Verschmelzungsradius (Doppellinien-Duktus)
RANDSTREIFEN_M = 0.45       # Dicke des Randstreifens fuer den Durchlauf-Test
LEADER_TILGUNG_PX = 3       # halbe Breite des getilgten Streifens im Render

ZEILEN = {
    "nord": (Y_NORDKANTE, Y_FLUR_NORD),
    "sued": (Y_FLUR_SUED, Y_SUEDKANTE),
}


@dataclass
class Kandidat:
    """Eine gemessene senkrechte Struktur — noch KEINE bestaetigte Wand."""
    nr: int
    zeile: str
    x_m: float          # belegungsgewichtete Mittellinie
    breite_m: float     # Ausdehnung des Clusters
    beleg: float        # Spitzenbelegung 0..1
    rand_oben: bool
    rand_unten: bool

    @property
    def durchlaufend(self) -> bool:
        return self.rand_oben and self.rand_unten


def dunkelmaske(seite: fitz.Page, zoom: float = ZOOM) -> np.ndarray:
    """Rasterbild als bool-Maske, Fuehrungslinien getilgt."""
    pix = seite.get_pixmap(matrix=fitz.Matrix(zoom, zoom), colorspace=fitz.csGRAY)
    grau = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width)
    maske = grau < GRAU_SCHWELLE
    for lx, *_ in sammle_leader(seite, seite.rect.width):
        spalte = int(round(lx * zoom))
        links = max(0, spalte - LEADER_TILGUNG_PX)
        maske[:, links:spalte + LEADER_TILGUNG_PX + 1] = False
    return maske


def messe_zeile(
    maske: np.ndarray, zeile: str, *, zoom: float = ZOOM,
    schwelle: float = SCHWELLE, radius_m: float = RADIUS_M,
    randstreifen_m: float = RANDSTREIFEN_M,
) -> list[Kandidat]:
    """Bandprojektion einer Zeile -> Kandidatenliste."""
    y_oben, y_unten = ZEILEN[zeile]
    px_pro_m = PX_PRO_M * zoom
    r0, r1 = int(round(y_oben * zoom)), int(round(y_unten * zoom))
    band = maske[r0:r1, :]
    if band.shape[0] < 2:
        return []

    belegung = band.sum(axis=0) / band.shape[0]
    c0, c1 = int(round(X0_DISPLAY * zoom)), int(round(X1_DISPLAY * zoom))

    # Verschmelzen: benachbarte Treffer innerhalb des Radius sind EINE Wand.
    cluster: list[list[int]] = []
    for spalte in range(c0, c1):
        if belegung[spalte] <= schwelle:
            continue
        if cluster and spalte - cluster[-1][-1] <= radius_m * px_pro_m:
            cluster[-1].append(spalte)
        else:
            cluster.append([spalte])

    rand = max(2, int(round(randstreifen_m * px_pro_m)))
    oben, unten = band[:rand, :], band[-rand:, :]

    kandidaten = []
    for nr, gruppe in enumerate(cluster):
        a, b = gruppe[0], gruppe[-1]
        gewicht = belegung[a:b + 1]
        mitte_px = float((np.arange(a, b + 1) * gewicht).sum() / gewicht.sum())
        kandidaten.append(Kandidat(
            nr=nr,
            zeile=zeile,
            x_m=round(x_zu_meter(mitte_px / zoom), 2),
            breite_m=round((b - a) / px_pro_m, 2),
            beleg=round(float(gewicht.max()), 2),
            rand_oben=bool(oben[:, a:b + 1].any()),
            rand_unten=bool(unten[:, a:b + 1].any()),
        ))
    return kandidaten


def messe_alle(pdf: Path = PDF_STANDARD, **kw) -> dict[str, list[Kandidat]]:
    seite = fitz.open(pdf)[0]
    maske = dunkelmaske(seite, zoom=kw.get("zoom", ZOOM))
    return {zeile: messe_zeile(maske, zeile, **kw) for zeile in ZEILEN}


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--pdf", type=Path, default=PDF_STANDARD)
    p.add_argument("--schwelle", type=float, default=SCHWELLE)
    p.add_argument("--radius", type=float, default=RADIUS_M, help="in Metern")
    p.add_argument("--json", type=Path, help="Kandidaten hierhin schreiben")
    args = p.parse_args()

    if not args.pdf.exists():
        print(f"PDF nicht gefunden: {args.pdf}")
        return 1

    alle = messe_alle(args.pdf, schwelle=args.schwelle, radius_m=args.radius)
    for zeile, kandidaten in alle.items():
        durch = sum(1 for k in kandidaten if k.durchlaufend)
        print(f"\n=== {zeile}: {len(kandidaten)} Kandidaten, {durch} durchlaufend")
        for k in kandidaten:
            marke = "||" if k.durchlaufend else "  "
            print(f"  {marke} [{k.nr:2}] x={k.x_m:6.2f} m  breite={k.breite_m:4.2f} m  "
                  f"beleg={k.beleg:.2f}  rand {int(k.rand_oben)}{int(k.rand_unten)}")

    print("\n|| = beruehrt beide Bandraender (Wand-Verdacht) — KEINE Bestaetigung.")
    print("   Entscheidung am Bild: python tools/plan_tiles.py --kandidaten")

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(
            {z: [asdict(k) for k in ks] for z, ks in alle.items()},
            indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"\ngeschrieben: {args.json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
