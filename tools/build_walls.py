#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Baut aus den gemessenen Kandidaten die WANDLISTE (T2c) -> data/walls.json.

Haltung
-------
Diese Liste ist bewusst der SICHERE BESTAND, nicht die vollstaendige Wahrheit.
Sie enthaelt nur, was sich belegen laesst; offene Bereiche bleiben offen.
Lieber ein Grundriss mit ehrlichen Luecken als einer, der Waende erfindet,
damit eine Kennzahl gruen wird. Verfeinert wird abschnittsweise, indem
Kandidatennummern in AUFNAHME oder AUSSCHLUSS wandern — jede mit Begruendung.

Vier Quellen
------------
1. AUSSENKONTUR  — Rechteck 0/0 .. 78/15.31 m aus den gemessenen Kanten.
   Vereinfachung mit Ansage: der Bau hat Verspruenge (der Aufzug springt als
   Vorbau nach Norden heraus, Anker y = -1.78 m). Fuer den ersten Import
   traegt das Rechteck; die Verspruenge folgen beim Verfeinern.

2. FLURACHSEN    — y = 5.79 und 8.14 m, aber NUR dort, wo tatsaechlich eine
   Linie gezeichnet ist. Gemessen ueber eine Zeilenprojektion im Streifen
   +-0.25 m um die Achse. Die Flur-Nordwand fehlt zwischen 11 und 23 m —
   dort liegt der offene Kuechen- und Empfangsbereich. Kurze Luecken sind
   Tueroeffnungen und werden ueberbrueckt, lange bleiben offen.

3. TRENNWAENDE   — Kandidaten aus measure_walls.py, streng gefiltert:
   durchlaufend (beruehrt beide Bandraender) UND Spitzenbelegung >= 0.60.
   Die hohe Belegungsschwelle laesst Waende MIT Tuer durchfallen; das ist
   fuer den sicheren Bestand gewollt — sie kommen beim Verfeinern dazu.

4. KURATION      — randnahe Kandidaten gehoeren zur Aussenwand, nicht zu
   einer Trennwand (Regel, kein Einzelfall). Dazu eine benannte
   Ausschlussliste fuer das, was nur die Sichtpruefung erkennt.

Aufruf
------
    python tools/build_walls.py                 # -> data/walls.json
    python tools/build_walls.py --streng 0.5    # mehr Waende, mehr Risiko
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import fitz
import numpy as np

from extract_plan import (
    PDF_STANDARD, X0_DISPLAY, X1_DISPLAY, Y_FLUR_NORD, Y_FLUR_SUED,
    PX_PRO_M, LAENGE_M, TIEFE_M, x_zu_meter, y_zu_meter,
)
from measure_walls import ZOOM, dunkelmaske, messe_alle

BELEG_STRENG = 0.60         # Spitzenbelegung fuer den sicheren Bestand
RANDABSTAND_M = 1.2         # naeher an einer Aussenkante = Teil der Aussenwand
FLUR_STREIFEN_M = 0.25      # halbe Dicke des Suchstreifens um eine Flurachse
FLUR_BELEGT = 0.15          # ab hier gilt ein Meter-Block als gezeichnet
TUER_LUECKE_M = 2.0         # kuerzere Luecke = Tueroeffnung, wird ueberbrueckt
SEGMENT_MIN_M = 1.5         # kuerzere Flur-Segmente sind Rauschen

# Was die Messung nicht von einer Wand unterscheiden kann, die Sichtpruefung
# aber schon. Schluessel = "<zeile>-<nr>" aus measure_walls.py.
AUSSCHLUSS: dict[str, str] = {
    "nord-1": "Treppenwange zwischen den beiden Treppenlaeufen, keine Raumtrennung",
    # Sichtentscheidung 2026-07-23 an data/kacheln10/kand_sued_6_54-64m.png:
    # ein grosser Konferenztisch (x 54.4..56.5 m) steht frei im offenen Bereich,
    # Stuehle auf BEIDEN Laengsseiten. Seine Laengskanten nehmen fast die volle
    # Bandhoehe ein und bestehen dadurch den Durchlauf-Test — eine Wand mitten
    # durch einen ringsum bestuhlten Tisch gibt es nicht.
    "sued-34": "linke Laengskante des freistehenden Konferenztisches, Stuehle beidseitig",
    "sued-36": "rechte Laengskante desselben Tisches — derselbe Koerper wie sued-34",
}

# Umgekehrter Weg: Waende, die der strenge Filter verwirft, die aber am Bild
# eindeutig sind (typisch: Wand mit breiter Tueroeffnung).
AUFNAHME: dict[str, str] = {
    "nord-6": "Ostabschluss des Sanitaerblocks; Ende offen zum Flur, daher rand_unten=0",
    # Sichtentscheidung 2026-07-23 an data/kacheln10/kand_nord_3_27-37m.png:
    # zwischen nord-12 (25.76 m) und nord-16 (32.45 m) liegt eine 6.7 m breite
    # Bueroeinheit. nord-14 teilt sie in zwei Zellen von je rund 3.3 m, jede mit
    # eigenem Schreibtisch — nord-13 und nord-15 liegen MITTEN auf diesen beiden
    # Tischen und sind deshalb keine Waende. Die Belegung 0.47 kommt daher, dass
    # die Wand oben an der Loggia endet statt bis zur Aussenkante durchzulaufen.
    "nord-14": "Trennwand der beiden Nordbueros bei 29.1 m; endet an der Loggia",
}

# Im Overlay auffaellig, aber nicht sicher entschieden. Bleiben vorerst drin —
# mit Kennung, damit die Pruefung beim Verfeinern gezielt moeglich ist.
# sued-34 / sued-36: laufen durch einen grossen Konferenztisch (x 53..57 m), der
# fast die volle Bandhoehe einnimmt. Ein kleinerer Randstreifen scheidet sie
# NICHT aus (geprueft bis 0.12 m), kostet in der Nordzeile aber 20 echte Waende
# — der Randstreifen ist hier also der falsche Hebel.
# Stand 2026-07-23: sued-34/sued-36 sind entschieden (siehe AUSSCHLUSS).
# Neu hier: nord-17 (35.30 m, beleg 0.73) zeigt dasselbe Muster — die Linie
# faellt mit der gestrichelt gezeichneten Mittelfuge eines grossen, ringsum
# bestuhlten Tisches zusammen. Anders als bei sued-34/36 laesst sich am Bild
# NICHT ausschliessen, dass dahinter eine Wand steht. Sie bleibt deshalb drin
# und wird benannt, statt sie auf Verdacht zu entfernen.
ZU_PRUEFEN = {"nord-17"}


def _flur_segmente(maske: np.ndarray, y_display: float) -> list[tuple[float, float]]:
    """Wo ist eine Flurachse tatsaechlich gezeichnet? Meter-Bloecke, dann Segmente."""
    px_pro_m = PX_PRO_M * ZOOM
    dicke = max(2, int(round(FLUR_STREIFEN_M * px_pro_m)))
    reihe = int(round(y_display * ZOOM))
    c0, c1 = int(round(X0_DISPLAY * ZOOM)), int(round(X1_DISPLAY * ZOOM))
    streifen = maske[reihe - dicke:reihe + dicke, c0:c1].any(axis=0)

    n = int(round(px_pro_m))
    belegt = [streifen[i * n:(i + 1) * n].mean() > FLUR_BELEGT
              for i in range((c1 - c0) // n)]

    segmente: list[list[float]] = []
    for meter, ja in enumerate(belegt):
        if not ja:
            continue
        if segmente and meter - segmente[-1][1] <= TUER_LUECKE_M:
            segmente[-1][1] = float(meter + 1)      # Tuerluecke ueberbruecken
        else:
            segmente.append([float(meter), float(meter + 1)])
    return [(a, b) for a, b in segmente if b - a >= SEGMENT_MIN_M]


def baue(pdf: Path = PDF_STANDARD, streng: float = BELEG_STRENG) -> dict:
    seite = fitz.open(pdf)[0]
    maske = dunkelmaske(seite)
    kandidaten = messe_alle(pdf)

    waende: list[dict] = []

    # 1 — Aussenkontur
    ecken = [(0.0, 0.0), (LAENGE_M, 0.0), (LAENGE_M, TIEFE_M), (0.0, TIEFE_M)]
    for i, von in enumerate(ecken):
        waende.append({
            "art": "aussen", "von": list(von), "bis": list(ecken[(i + 1) % 4]),
            "quelle": "T2b gemessene Aussenkanten (Rechteck-Vereinfachung)",
        })

    # 2 — Flurachsen, nur wo gezeichnet
    for name, y_display in (("flur-nord", Y_FLUR_NORD), ("flur-sued", Y_FLUR_SUED)):
        y_m = round(y_zu_meter(y_display), 2)
        for a, b in _flur_segmente(maske, y_display):
            waende.append({
                "art": "flur", "von": [round(a, 2), y_m], "bis": [round(b, 2), y_m],
                "quelle": f"{name}, Zeilenprojektion",
            })

    # 3+4 — Trennwaende, streng gefiltert und kuratiert
    grenzen = {
        "nord": (0.0, round(y_zu_meter(Y_FLUR_NORD), 2)),
        "sued": (round(y_zu_meter(Y_FLUR_SUED), 2), TIEFE_M),
    }
    verworfen: list[dict] = []
    for zeile, liste in kandidaten.items():
        y_oben, y_unten = grenzen[zeile]
        for k in liste:
            kennung = f"{zeile}-{k.nr}"
            randnah = (k.x_m < RANDABSTAND_M
                       or k.x_m > x_zu_meter(X1_DISPLAY) - RANDABSTAND_M)
            if kennung in AUFNAHME:
                grund = None
            elif kennung in AUSSCHLUSS:
                grund = AUSSCHLUSS[kennung]
            elif randnah:
                grund = "randnah — Teil der Aussenwand"
            elif not k.durchlaufend:
                grund = "beruehrt nicht beide Bandraender"
            elif k.beleg < streng:
                grund = f"Belegung {k.beleg} unter {streng} — erst beim Verfeinern"
            else:
                grund = None

            if grund:
                verworfen.append({"kennung": kennung, "x_m": k.x_m, "grund": grund})
                continue
            waende.append({
                "art": "trennwand", "von": [k.x_m, y_oben], "bis": [k.x_m, y_unten],
                "quelle": kennung,
                "beleg": k.beleg,
                "kuratiert": kennung in AUFNAHME,
                "zu_pruefen": kennung in ZU_PRUEFEN,
            })

    return {
        "einheit": "meter",
        "riegel": {"laenge": LAENGE_M, "tiefe": TIEFE_M},
        "stand": "sicherer Bestand — offene Bereiche bleiben offen",
        "waende": waende,
        "verworfen": verworfen,
    }


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--pdf", type=Path, default=PDF_STANDARD)
    p.add_argument("--streng", type=float, default=BELEG_STRENG)
    p.add_argument("--out", type=Path, default=Path("data/walls.json"))
    args = p.parse_args()

    if not args.pdf.exists():
        print(f"PDF nicht gefunden: {args.pdf}")
        return 1

    ergebnis = baue(args.pdf, args.streng)
    nach_art: dict[str, int] = {}
    for w in ergebnis["waende"]:
        nach_art[w["art"]] = nach_art.get(w["art"], 0) + 1

    print(f"{len(ergebnis['waende'])} Waende: "
          + " · ".join(f"{n}x {a}" for a, n in sorted(nach_art.items())))
    for w in ergebnis["waende"]:
        if w["art"] != "trennwand":
            print(f"   {w['art']:9} {w['von']} -> {w['bis']}   {w['quelle']}")
    print("\nTrennwaende:")
    for w in ergebnis["waende"]:
        if w["art"] == "trennwand":
            marke = " (kuratiert)" if w.get("kuratiert") else ""
            print(f"   x={w['von'][0]:6.2f} m  y {w['von'][1]:5.2f}..{w['bis'][1]:5.2f}  "
                  f"beleg={w['beleg']:.2f}  [{w['quelle']}]{marke}")
    print(f"\n{len(ergebnis['verworfen'])} verworfen — Gruende stehen in {args.out}")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(ergebnis, indent=2, ensure_ascii=False),
                        encoding="utf-8")
    print(f"geschrieben: {args.out}")
    print("Gate: python tools/overlay_plan.py --waende  -> data/overlay-check.png ANSEHEN")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
