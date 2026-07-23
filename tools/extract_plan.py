#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Extrahiert die Halle-400-Geometrie aus dem Architektur-PDF.

Die Grundwahrheit ist der Plan, nicht das vereinfachte Raster der Axonometrie.
Drei Quellen werden getrennt ausgewertet und erst danach zusammengefuehrt:

  1. TEXT    — die Raumbeschriftungen liegen als echter Text im PDF (nicht als
               Pixel). Das macht die Benennung exakt statt geraten.
  2. LINIEN  — die Fuehrungslinien verbinden jede Beschriftung mit ihrem Raum.
               Ihr planseitiges Ende ist der Raum-Ankerpunkt.
  3. PIXEL   — die Waende sind Rasterbild (45 eingebettete Bilder, Freihand-
               Duktus einer Architekturskizze). Sie werden aus einem hoch-
               aufgeloesten Render ueber eine Projektionsanalyse bestimmt.

Der entscheidende Griff bei (2): die Fuehrungslinie beginnt EXAKT am linken
Rand ihrer Beschriftung (gemessen: 'Toiletten' x0=252.0 <-> Leader x=252.0,
18 von 18 Treffern bei 2 px Toleranz). Die Zuordnung ist damit deterministisch
und braucht keine Abstands-Heuristik.

Koordinaten
-----------
Die Seite hat rotation=90. PyMuPDF liefert Text und Zeichnungen im UNROTIERTEN
System, das Render dagegen in Anzeige-Koordinaten. Aus
page.rotation_matrix = Matrix(0, 1, -1, 0, 2004, 0) folgt:

    display_x = 2004 - y_pdf
    display_y =        x_pdf

Alle Angaben ausserhalb der Umrechnung sind Anzeige-Koordinaten.

Aufruf
------
    python tools/extract_plan.py --stufe text   # Beschriftungen + Anker, kein Schreiben
    python tools/extract_plan.py                # volle Extraktion -> data/plan-geometry.json
"""
from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass, asdict, field
from pathlib import Path

import fitz  # PyMuPDF

PDF_STANDARD = Path(r"C:/Users/dania/Desktop/Nur Büro.pdf")

# --- Massstab (Anzeige-Koordinaten -> Meter) --------------------------------
# GEMESSEN am 2026-07-23 (T2b), nicht mehr aus der Vorarbeit geerbt.
# Verfahren: Render bei 3x, Schwelle Grauwert < 150, Fuehrungslinien vorher
# getilgt (sie reichen bis in die Raeume und verfaelschen jede Projektion),
# dann spaltenweise die aeusserste Zeichnung im Fenster y 430..1000 gesucht.
#
# Die geerbten Werte lagen daneben — sichtbar erst im Overlay, nie in den Zahlen:
#   geerbt  x 105.0 .. 1900.0   y 553.0 .. 899.0
#   gemessen x  94.7 .. 1909.0  Nordkante 561.3  Suedkante 917.3
X0_DISPLAY, X1_DISPLAY = 94.7, 1909.0
Y_NORDKANTE, Y_SUEDKANTE = 561.3, 917.3

# Die Laenge (78 m) ist eine gesetzte Angabe aus der Vorarbeit — der Plan traegt
# KEINE Masskette, sie ist aus dem PDF nicht nachpruefbar. Der Massstab wird
# deshalb auf die Laenge kalibriert und ISOTROP verwendet (ein Architekturplan
# hat in beiden Achsen denselben Massstab). Die Tiefe ist damit ein MESSWERT:
# (917.3 - 561.3) / 23.26 = 15.31 m — nicht die gerundeten 15 m der Vorarbeit.
LAENGE_M = 78.0
PX_PRO_M = (X1_DISPLAY - X0_DISPLAY) / LAENGE_M          # 23.26
TIEFE_M = round((Y_SUEDKANTE - Y_NORDKANTE) / PX_PRO_M, 2)

# Waagerechte Achsen, ebenfalls gemessen (staerkste durchgehende Linien):
Y_FLUR_NORD, Y_FLUR_SUED = 696.0, 750.7   # = 5.79 m und 8.14 m
# Gegenprobe: Flurbreite 2.35 m gegen 2.40 m aus der Vorarbeit — unabhaengig
# bestaetigt, die Kalibrierung stimmt.

# Rueckwaertskompatible Namen (Overlay nutzt sie)
Y0_DISPLAY, Y1_DISPLAY = Y_NORDKANTE, Y_SUEDKANTE

# --- Schwellen, alle an den gemessenen Werten kalibriert --------------------
# Die Wortluecke taugt NICHT als Trenner: innerhalb eines Namens 5.2-5.3 px
# ("Phone|Booth", "Break|out"), zwischen zwei Namen 7.9 px ("Aufzug|Empfang").
# Getrennt wird deshalb strukturell — an den Fuehrungslinien, siehe unten.
ZEILEN_TOLERANZ = 6.0   # eine Textzeile hat identisches y
ZUSATZ_ABSTAND = 30.0   # "6-8 Personen" steht 23.4 px unter seiner Hauptzeile
LEADER_TOLERANZ = 2.0   # Leader-x gegen linken Textrand
FUSSZEILE_AB_Y = 1100.0 # darunter nur noch Titel/Planstempel


def x_zu_meter(x: float) -> float:
    return (x - X0_DISPLAY) / (X1_DISPLAY - X0_DISPLAY) * LAENGE_M


def y_zu_meter(y: float) -> float:
    return (y - Y0_DISPLAY) / (Y1_DISPLAY - Y0_DISPLAY) * TIEFE_M


@dataclass
class Beschriftung:
    """Eine Raumbeschriftung mit ihrem Fuehrungslinien-Anker."""
    text: str
    zusatz: str = ""                  # z.B. "10-12 Personen"
    seite: str = ""                   # "nord" | "sued" — Lage im Riegel
    label_x0: float = 0.0             # linker Textrand = Ansatzpunkt der Fuehrungslinie
    label_y: float = 0.0
    anker_x: float | None = None      # planseitiges Ende der Fuehrungslinie
    anker_y: float | None = None
    anker_x_m: float | None = None
    anker_y_m: float | None = None


@dataclass
class Extraktion:
    quelle: str
    seite_breite: float
    seite_hoehe: float
    massstab_px_pro_m: float
    riegel_m: dict
    beschriftungen: list[Beschriftung] = field(default_factory=list)
    hinweise: list[str] = field(default_factory=list)


def pdf_zu_display(x: float, y: float, breite: float) -> tuple[float, float]:
    """Unrotierte PDF-Koordinate -> Anzeige-Koordinate (rotation=90)."""
    return breite - y, x


# ---------------------------------------------------------------- Text ------
ZUSATZ_MUSTER = re.compile(r"^\d+\s*-\s*\d+$|^Personen$")


def sammle_beschriftungen(
    seite: fitz.Page, breite: float, leader_x: list[float]
) -> list[Beschriftung]:
    """Gruppiert die Woerter zu Raumbeschriftungen.

    Getrennt wird an den Fuehrungslinien: ein Wort, dessen linker Rand auf einem
    Leader-Ansatz liegt, BEGINNT eine neue Beschriftung. Das ist die Struktur des
    Plans selbst und damit belastbarer als jede Pixel-Abstandsschwelle.
    """
    worte = []
    for x0, y0, x1, y1, wort, *_ in seite.get_text("words"):
        # Das Wort-Rechteck mitdrehen: x0/x1 tauschen die Achse mit y0/y1.
        dx0, _ = pdf_zu_display(x0, y1, breite)
        dx1, _ = pdf_zu_display(x1, y0, breite)
        dy = x0
        if dy >= FUSSZEILE_AB_Y:
            continue                      # Planstempel / Buero | Grundriss
        worte.append({"wort": wort, "x0": dx0, "x1": dx1, "y": dy})

    # Zeilen bilden (eine Textzeile hat identisches y).
    worte.sort(key=lambda w: (w["y"], w["x0"]))
    zeilen: list[list[dict]] = []
    for w in worte:
        if zeilen and abs(zeilen[-1][0]["y"] - w["y"]) < ZEILEN_TOLERANZ:
            zeilen[-1].append(w)
        else:
            zeilen.append([w])

    def beginnt_beschriftung(w: dict) -> bool:
        return any(abs(w["x0"] - lx) <= LEADER_TOLERANZ for lx in leader_x)

    # Innerhalb einer Zeile an den Fuehrungslinien-Ansaetzen trennen.
    gruppen: list[dict] = []
    for zeile in zeilen:
        zeile.sort(key=lambda w: w["x0"])
        block = [zeile[0]]
        for w in zeile[1:]:
            if beginnt_beschriftung(w):
                gruppen.append(_block_zu_gruppe(block))
                block = [w]
            else:
                block.append(w)
        gruppen.append(_block_zu_gruppe(block))

    return _zusatz_anhaengen(gruppen)


def _block_zu_gruppe(block: list[dict]) -> dict:
    return {
        "text": " ".join(w["wort"] for w in block),
        "x0": block[0]["x0"],
        "y": block[0]["y"],
        "ist_zusatz": all(ZUSATZ_MUSTER.match(w["wort"]) for w in block),
    }


def _zusatz_anhaengen(gruppen: list[dict]) -> list[Beschriftung]:
    """"6-8 Personen" ist kein Raum, sondern gehoert zur Zeile darueber.

    Erkennungsmerkmal: gleicher linker Textrand, knapp darunter.
    """
    haupt = [g for g in gruppen if not g["ist_zusatz"]]
    zusaetze = [g for g in gruppen if g["ist_zusatz"]]

    ergebnis = [
        Beschriftung(text=g["text"], label_x0=round(g["x0"], 1), label_y=round(g["y"], 1))
        for g in haupt
    ]
    for z in zusaetze:
        passend = [
            b for b in ergebnis
            if abs(b.label_x0 - z["x0"]) < LEADER_TOLERANZ
            and 0 < z["y"] - b.label_y < ZUSATZ_ABSTAND
        ]
        if passend:
            passend[0].zusatz = z["text"]
    return ergebnis


# -------------------------------------------------------------- Linien ------
def sammle_leader(seite: fitz.Page, breite: float) -> list[tuple[float, float, float]]:
    """Fuehrungslinien als (x, y_oben, y_unten) in Anzeige-Koordinaten.

    In der Anzeige verlaufen sie senkrecht (Beschriftung ausserhalb -> Raum
    innerhalb); im unrotierten PDF sind sie deshalb waagerecht.
    """
    linien = []
    for gruppe in seite.get_drawings():
        for eintrag in gruppe["items"]:
            if eintrag[0] != "l":
                continue
            a, b = eintrag[1], eintrag[2]
            ax, ay = pdf_zu_display(a.x, a.y, breite)
            bx, by = pdf_zu_display(b.x, b.y, breite)
            if abs(ax - bx) < 2 and abs(ay - by) > 20:
                linien.append((round((ax + bx) / 2, 1), round(min(ay, by), 1), round(max(ay, by), 1)))
    return linien


def verbinde(beschriftungen: list[Beschriftung], leader, hinweise: list[str]) -> None:
    """Ordnet jeder Beschriftung ihre Fuehrungslinie ueber den linken Textrand zu."""
    mitte_y = (Y0_DISPLAY + Y1_DISPLAY) / 2
    offen = list(leader)

    for b in beschriftungen:
        b.seite = "nord" if b.label_y < mitte_y else "sued"
        treffer = [l for l in offen if abs(l[0] - b.label_x0) <= LEADER_TOLERANZ]
        if not treffer:
            hinweise.append(f"ohne Fuehrungslinie: {b.text!r} (linker Rand x={b.label_x0})")
            continue
        x, y_oben, y_unten = treffer[0]
        offen.remove(treffer[0])

        # Nord: Beschriftung liegt oben, das Linien-Ende zeigt nach unten ins Gebaeude.
        ende_y = y_unten if b.seite == "nord" else y_oben
        b.anker_x, b.anker_y = x, ende_y
        b.anker_x_m = round(x_zu_meter(x), 2)
        b.anker_y_m = round(y_zu_meter(ende_y), 2)

    for rest in offen:
        hinweise.append(f"Fuehrungslinie ohne Beschriftung: x={rest[0]}")


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--pdf", type=Path, default=PDF_STANDARD)
    p.add_argument("--stufe", choices=["text", "voll"], default="voll")
    p.add_argument("--out", type=Path, default=Path("data/plan-geometry.json"))
    args = p.parse_args()

    if not args.pdf.exists():
        print(f"PDF nicht gefunden: {args.pdf}")
        return 1

    dok = fitz.open(args.pdf)
    seite = dok[0]
    breite, hoehe = seite.rect.width, seite.rect.height

    hinweise: list[str] = []
    leader = sammle_leader(seite, breite)
    beschriftungen = sammle_beschriftungen(seite, breite, [l[0] for l in leader])
    verbinde(beschriftungen, leader, hinweise)
    beschriftungen.sort(key=lambda b: (b.seite, b.label_x0))

    ergebnis = Extraktion(
        quelle=str(args.pdf),
        seite_breite=breite,
        seite_hoehe=hoehe,
        massstab_px_pro_m=round((X1_DISPLAY - X0_DISPLAY) / LAENGE_M, 3),
        riegel_m={"laenge": LAENGE_M, "tiefe": TIEFE_M},
        beschriftungen=beschriftungen,
        hinweise=hinweise,
    )

    verortet = sum(1 for b in beschriftungen if b.anker_x_m is not None)
    print(f"{len(leader)} Fuehrungslinien · {len(beschriftungen)} Beschriftungen "
          f"· {verortet} verortet\n")
    for b in beschriftungen:
        anker = (f"x={b.anker_x_m:6.2f} m  y={b.anker_y_m:5.2f} m"
                 if b.anker_x_m is not None else "   -- kein Anker --      ")
        zus = f"  ({b.zusatz})" if b.zusatz else ""
        print(f"  [{b.seite:4}] {anker}   {b.text}{zus}")
    for h in hinweise:
        print(f"  ! {h}")

    if args.stufe == "voll":
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(asdict(ergebnis), indent=2, ensure_ascii=False),
                            encoding="utf-8")
        print(f"\ngeschrieben: {args.out}")
    return 0 if not hinweise else 1


if __name__ == "__main__":
    raise SystemExit(main())
