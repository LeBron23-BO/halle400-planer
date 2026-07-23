#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Uebersetzt die Wandliste ins Grundriss-Schema des Forks (T3).

    data/walls.json  (Meter, freie Segmente)
        -> app/public/plaene/halle400.json  ({ floorplan: {corners, walls}, items })

Die App laedt ihn ueber ?plan=halle400 (Blueprint3DAppBase.tsx) — der Export
schreibt deshalb direkt dorthin, statt eine zweite Kopie unter data/ zu pflegen.

Zwei Dinge entscheiden ueber Erfolg oder Misserfolg
---------------------------------------------------
1. GETEILTE ECKEN. blueprint3d kennt kein `rooms`-Array — Raeume werden aus dem
   Wandgraphen abgeleitet (`src/model/room.ts`). Zwei Waende, die sich kreuzen,
   ohne sich eine Ecke zu TEILEN, ergeben ein Strichbild ohne einen einzigen
   Raum. Deshalb werden hier alle Schnittpunkte berechnet und jedes Segment
   dort zerlegt: eine Trennwand, die auf die Aussenwand stoesst, teilt diese.

2. DETERMINISTISCHE IDs. Die Ecken-ID wird aus der Koordinate abgeleitet, nicht
   zufaellig gezogen. Folgen: der git-Diff zeigt echte Geometrie-Aenderungen
   statt neuer Zufallszahlen — und die Raum-UUID (sortierte Ecken-IDs,
   `room.ts:50`) bleibt stabil, solange die Geometrie stabil ist. Genau daran
   haengen spaeter die Raumnamen und die Saeulen-Zuordnung.

Einheit
-------
Das Schema rechnet in ZENTIMETERN (`src/core/dimensioning.ts:16`), die
Wandliste in Metern. Umrechnung an genau einer Stelle: METER_ZU_CM.

Was NICHT ueber dieses JSON geht
--------------------------------
Wandhoehe und -dicke. `thickness` ist zwar eine Wand-Eigenschaft
(`src/model/wall.ts:47`), wird aber aus der globalen Konfiguration
initialisiert und NICHT serialisiert — `SavedFloorplan.walls` kennt nur
corner1/corner2 und Texturen. Beide Werte muessen daher ueber
`Configuration.setValue` gesetzt werden, nicht hier.
Die Hoehe ist aus einem Grundriss ohnehin nicht zu gewinnen; sie bleibt offen,
statt geraten zu werden.

Aufruf
------
    python tools/export_blueprint.py
    python tools/export_blueprint.py --walls data/walls.json --out data/x.json
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

METER_ZU_CM = 100.0
RASTER_CM = 1.0          # Ecken innerhalb 1 cm gelten als dieselbe
EPS = 1e-6


def ecken_id(x_cm: float, y_cm: float) -> str:
    """Stabile ID aus der Koordinate — gleiche Geometrie, gleiche ID."""
    schluessel = f"{round(x_cm / RASTER_CM):d}:{round(y_cm / RASTER_CM):d}"
    h = hashlib.md5(schluessel.encode()).hexdigest()
    return f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"


def _raste(wert: float) -> float:
    return round(wert / RASTER_CM) * RASTER_CM


def teile_an_schnittpunkten(segmente: list[dict]) -> list[tuple[tuple, tuple, dict]]:
    """Zerlegt jedes Segment an allen Kreuzungen mit anderen Segmenten.

    Beschraenkt auf achsparallele Segmente — genau das liefert die Wandliste.
    Ein schraeges Segment wuerde unzerteilt durchgereicht statt still falsch
    behandelt zu werden.
    """
    achsen = []
    for s in segmente:
        (x0, y0), (x1, y1) = s["von_cm"], s["bis_cm"]
        if abs(y0 - y1) < EPS:
            achsen.append(("h", min(x0, x1), max(x0, x1), y0, s))
        elif abs(x0 - x1) < EPS:
            achsen.append(("v", min(y0, y1), max(y0, y1), x0, s))
        else:
            achsen.append(("frei", 0.0, 0.0, 0.0, s))

    stuecke = []
    for art, a, b, fest, s in achsen:
        if art == "frei":
            stuecke.append((tuple(s["von_cm"]), tuple(s["bis_cm"]), s))
            continue

        punkte = {a, b}
        for art2, a2, b2, fest2, _ in achsen:
            if art2 == art or art2 == "frei":
                continue
            # Der andere laeuft quer: sein fester Wert muss auf mir liegen,
            # und meine feste Achse muss in seiner Spanne liegen.
            if a - EPS <= fest2 <= b + EPS and a2 - EPS <= fest <= b2 + EPS:
                punkte.add(fest2)

        sortiert = sorted(punkte)
        for p, q in zip(sortiert, sortiert[1:]):
            if q - p < RASTER_CM:
                continue
            if art == "h":
                stuecke.append(((p, fest), (q, fest), s))
            else:
                stuecke.append(((fest, p), (fest, q), s))
    return stuecke


def baue(wandliste: dict) -> dict:
    segmente = []
    for w in wandliste["waende"]:
        segmente.append({
            **w,
            "von_cm": [_raste(w["von"][0] * METER_ZU_CM), _raste(w["von"][1] * METER_ZU_CM)],
            "bis_cm": [_raste(w["bis"][0] * METER_ZU_CM), _raste(w["bis"][1] * METER_ZU_CM)],
        })

    corners: dict[str, dict] = {}
    walls: list[dict] = []
    gesehen: set[tuple[str, str]] = set()

    for von, bis, quelle in teile_an_schnittpunkten(segmente):
        id_von, id_bis = ecken_id(*von), ecken_id(*bis)
        if id_von == id_bis:
            continue
        corners[id_von] = {"x": von[0], "y": von[1]}
        corners[id_bis] = {"x": bis[0], "y": bis[1]}
        schluessel = tuple(sorted((id_von, id_bis)))
        if schluessel in gesehen:
            continue                       # dieselbe Kante zweimal = eine Wand
        gesehen.add(schluessel)
        walls.append({
            "corner1": id_von, "corner2": id_bis,
            "herkunft": quelle.get("quelle", ""), "art": quelle.get("art", ""),
        })

    return {"floorplan": {"corners": corners, "walls": walls,
                          "wallTextures": [], "floorTextures": {},
                          "newFloorTextures": {}},
            "items": []}


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--walls", type=Path, default=Path("data/walls.json"))
    # Zielort ist bewusst das Verzeichnis, aus dem die App liest. Eine Kopie
    # unter data/ waere eine zweite Wahrheit, die beim naechsten Lauf driftet.
    p.add_argument("--out", type=Path,
                   default=Path("app/public/plaene/halle400.json"))
    args = p.parse_args()

    if not args.walls.exists():
        print(f"fehlt: {args.walls} — erst 'python tools/build_walls.py' laufen lassen")
        return 1

    wandliste = json.loads(args.walls.read_text(encoding="utf-8"))
    plan = baue(wandliste)
    corners, walls = plan["floorplan"]["corners"], plan["floorplan"]["walls"]

    xs = [c["x"] for c in corners.values()]
    ys = [c["y"] for c in corners.values()]
    print(f"{len(corners)} Ecken · {len(walls)} Wandstuecke "
          f"(aus {len(wandliste['waende'])} Segmenten)")
    print(f"Ausdehnung: x {min(xs):.0f}..{max(xs):.0f} cm · y {min(ys):.0f}..{max(ys):.0f} cm")

    # Wie viele Ecken traegt mehr als zwei Waende? Das sind die T-Stoesse —
    # ohne sie entstehen keine Raeume.
    grad: dict[str, int] = {}
    for w in walls:
        grad[w["corner1"]] = grad.get(w["corner1"], 0) + 1
        grad[w["corner2"]] = grad.get(w["corner2"], 0) + 1
    print(f"Ecken nach Grad: " + " · ".join(
        f"{g}er {sum(1 for v in grad.values() if v == g)}"
        for g in sorted(set(grad.values()))))

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(plan, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"geschrieben: {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
