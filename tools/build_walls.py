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
#
# DURCHGANG 2026-07-23 (T2c-verfeinern): alle 18 Kacheln aus
# `python tools/plan_tiles.py --kandidaten --breite 10 --aus data/kacheln10`
# einzeln angesehen. Dabei traten drei wiederkehrende Muster auf, die den
# Grossteil der Faelle erklaeren:
#
#   MUSTER A — "ein Tisch, drei Kandidaten": ein ringsum bestuhlter Tisch
#   erzeugt bis zu drei senkrechte Kandidaten (linke Kante, gezeichnete
#   Mittelfuge, rechte Kante). Der Abstand liegt bei 1.4..1.9 m. Beleg:
#   sued-7/8/9, sued-11/12/13, sued-17/18, sued-34/35/36, nord-19/20.
#   GEGENPROBE (mechanisch, unabhaengig vom Auge): zwei benachbarte
#   "Waende" mit weniger als ~1.5 m Abstand umschliessen keinen Raum,
#   sondern einen Koerper. Ein 1.39-m-Raum existiert nicht.
#
#   MUSTER B — Loggia/Terrasse: die beigen Flaechen mit Bepflanzung und
#   Kies sind Aussenbereiche mit freier Moeblierung. Was dort senkrecht
#   misst, ist Pflanzkuebel oder Terrassenmoebel, keine Trennwand.
#   Betrifft die vermeintlichen "Luecken" Nord 45..64 m und Sued 19..32 m —
#   sie sind keine fehlenden Messungen, sondern offene Flaechen.
#
#   MUSTER C — gestrichelt vs. durchgezogen: Waende sind im Plan
#   durchgezogen. Eine gestrichelte Senkrechte ist die Fuge zweier
#   zusammengeschobener Tische (nord-17, sued-35).
AUSSCHLUSS: dict[str, str] = {
    "nord-1": "Treppenwange zwischen den beiden Treppenlaeufen, keine Raumtrennung",

    # --- Nordzeile: offener Bereich Kueche/Teamtable/Aufzug/Empfang (12.7..23.8 m).
    # Zwei unabhaengige Messungen zeigten hier schon, dass keine Wand steht;
    # die Kacheln kand_nord_1/2 bestaetigen es am Bild.
    "nord-7": "Fuge der Kuechenzeile, laeuft weiter durch den Teamtable (Muster A)",
    "nord-8": "rechte Kante des Teamtables",
    "nord-9": "Sesselgruppe der Empfangszone, freistehend",
    "nord-10": "freistehender Tresen, oben und unten ohne Anschluss",

    # --- Nordbueros 25.8..32.5 m (kand_nord_3): nord-14 teilt sie, die
    # beiden Nachbarn liegen auf den Schreibtischen der jeweiligen Zelle.
    "nord-13": "Schreibtisch in der linken Bueroezelle, nicht deren Wand",
    "nord-15": "Schreibtisch in der rechten Bueroezelle, nicht deren Wand",

    # --- nord-17 war ZU_PRUEFEN und ist jetzt entschieden (kand_nord_3, 10 m):
    # die Linie ist GESTRICHELT und liegt mittig in einem Tisch mit Stuehlen
    # auf beiden Laengsseiten. Auf der 20-m-Kachel war das nicht zu sehen.
    "nord-17": "gestrichelte Mittelfuge eines ringsum bestuhlten Tisches (Muster C)",

    # --- nord-19/20 waren AUFGENOMMEN und sind Falsch-Positive (kand_nord_4).
    # Sie stehen 1.39 m auseinander, mitten im 6.86-m-Raum nord-18..nord-21,
    # mit Stuehlen links und rechts davon. Gegenueber im Sueden dasselbe Bild:
    # 7.0-m-Raum sued-23..sued-27 mit einem Tischblock in der Mitte.
    "nord-19": "linke Laengskante des Tischblocks im Raum 38.7..45.6 m (Abstand 1.39 m)",
    "nord-20": "rechte Laengskante desselben Tisches — derselbe Koerper wie nord-19",

    # --- Loggia Nord 45..64 m (kand_nord_5/6): Aussenbereich, keine Luecke.
    "nord-22": "Bepflanzung und Kiesflaeche der Loggia (Muster B)",
    "nord-23": "linke Laengskante des Konferenztisches in der Loggia",
    "nord-24": "rechte Laengskante desselben Tisches",
    "nord-26": "Kante der Schrankreihe, freistehend",
    "nord-27": "linke Kante des Sesselblocks",
    "nord-28": "rechte Kante desselben Sesselblocks",
    "nord-30": "Loggia-Bepflanzung und Terrassenmoebel (Muster B)",

    # --- Ostteil Nord 63..78 m (kand_nord_7/8).
    "nord-32": "schmale freistehende Stuetze, ohne Anschluss nach oben und unten",
    "nord-35": "Tischkante im Ostraum",
    "nord-36": "Regal im Ostraum, kein Raumabschluss",

    # --- Suedzeile West 0..19 m (kand_sued_0/1).
    "sued-2": "linke Kante des Workshop-Tisches (Muster A)",
    "sued-3": "rechte Kante desselben Tisches",
    "sued-5": "Stuhlkranz am runden Tisch",
    "sued-7": "linke Kante des Vierertisches (Muster A)",
    "sued-8": "gezeichnete Mittelfuge desselben Tisches",
    "sued-9": "rechte Kante desselben Tisches",

    # --- Suedzeile 19..32 m: offener Workspace mit Loggia. Der Negativbefund
    # der Vorsitzung ("13-m-Luecke ist wirklich offen") ist damit am Bild belegt.
    "sued-11": "linke Kante des Arbeitsplatz-Blocks (Muster A)",
    "sued-12": "Mittelfuge desselben Blocks",
    "sued-13": "rechte Kante desselben Blocks",
    "sued-14": "Endkante der langen Sitzbank",
    "sued-15": "Mittelfuge des Moebelblocks daneben",
    "sued-16": "rechte Kante desselben Moebelblocks",
    "sued-17": "linke Kante des Doppelschreibtisches",
    "sued-18": "Mittelfuge desselben Schreibtisches",
    "sued-20": "Sitzsaecke im offenen Bereich",
    "sued-21": "Mittelfuge des Tisches bei 35 m",
    "sued-22": "rechte Kante desselben Tisches",

    # --- Suedzeile Mitte 36..55 m (kand_sued_4/5).
    "sued-24": "linke Kante des Schreibtischblocks im Raum 38.9..45.9 m",
    "sued-25": "Mittelfuge DESSELBEN Blocks — war faelschlich aufgenommen",
    "sued-26": "rechte Kante desselben Blocks (Abstand 24->26 nur 1.92 m)",
    "sued-28": "Schreibtischkante am Loggia-Rand",
    "sued-29": "rechte Kante desselben Schreibtisches",
    "sued-31": "linke Kante des dritten Schreibtisches",
    "sued-32": "rechte Kante desselben Schreibtisches",

    # --- Suedzeile Ost 54..78 m (kand_sued_6/8).
    "sued-35": "gestrichelte Mittelfuge des Konferenztisches sued-34/36 (Muster C)",
    "sued-38": "linke Kante des Terrassenmoebels",
    "sued-39": "rechte Kante desselben Moebels",
    "sued-43": "Mitte eines Regalfachs im Lager, keine Raumtrennung",

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
    # Sichtentscheidung 2026-07-23 an data/kacheln10/kand_sued_6_54-64m.png:
    # kraeftige, durchgezogene Senkrechte, die auf halber Bandhoehe ansetzt und
    # bis zur Aussenwand laeuft — sie schliesst die Ost-Loggia nach Westen ab.
    # Genau dieser Ansatz auf halber Hoehe drueckt die Belegung auf 0.56.
    "sued-37": "Westabschluss der Ost-Loggia; setzt auf halber Bandhoehe an",
}

# Im Overlay auffaellig, aber nicht sicher entschieden. Bleiben vorerst drin —
# mit Kennung, damit die Pruefung beim Verfeinern gezielt moeglich ist.
# Stand 2026-07-23 nach dem vollstaendigen Kachel-Durchgang: LEER. Jede der 51
# verworfenen Kennungen und die beiden Falsch-Positiven nord-19/nord-20 sind
# entschieden und stehen mit Grund in AUSSCHLUSS bzw. AUFNAHME.
ZU_PRUEFEN: set[str] = set()


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
