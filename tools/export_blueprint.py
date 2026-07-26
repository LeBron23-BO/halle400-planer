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

Die Bearbeitung des Nutzers (W5)
--------------------------------
Der Export erzeugt die Zieldatei NEU. Damit er die Bearbeitung des Nutzers
nicht ueberschreibt, gilt zweierlei: ein WAECHTER liest die vorhandene
Zieldatei und bricht ab, wenn darin ungedeckte Setzungen stehen
(`pruefe_zieldatei`), und `data/gesetzt.json` wird ganz zuletzt ADDITIV
aufgelegt (`wende_gesetzt_an`). Die gemessenen Quellen — walls.json,
ausstattung.json, plan-geometry.json — bleiben dabei unberuehrt.

Aufruf
------
    python tools/export_blueprint.py
    python tools/export_blueprint.py --walls data/walls.json --out data/x.json
    python tools/export_blueprint.py --ohne-gesetzt        # rein gemessener Stand
    python tools/export_blueprint.py --verwerfe-setzungen  # Waechter uebergehen
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
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


def _js_runde(wert: float) -> int:
    """Rundet wie `Math.round` in Javascript (halbe Werte AUFWAERTS).

    Pythons `round` rundet kaufmaennisch zur geraden Zahl (`round(196.5)` = 196,
    `Math.round(196.5)` = 197). Die Kennungen unten entstehen im Browser — hier
    muss dieselbe Rechnung stehen, sonst hiesse dasselbe Moebel in den beiden
    Welten anders.
    """
    return math.floor(wert + 0.5)


def kennung_aus_ausstattung(el: dict) -> str:
    """Spiegel von `kennungAusAusstattung` (src/model/floorplan.ts:371).

    Die Kennung eines Ausstattungs-Zeichens wird aus Art und Ort abgeleitet, und
    zwar EINMAL beim Laden. Ein verschobenes Stueck traegt darum weiterhin die
    Kennung seines MESSORTES — das ist die Bruecke, ueber die eine Verschiebung
    ihr Messstueck wiederfindet.
    """
    return f"a-{el['typ']}-{_js_runde(float(el['x']))}-{_js_runde(float(el['y']))}"


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


def lade_labels(geometry_pfad: Path) -> list[dict]:
    """Liest die PDF-Beschriftungen als Raum-Label-Anker (cm).

    Die Ankerpunkte kommen in Metern aus der PDF (plan-geometry.json). Hier
    werden sie mit DERSELBEN METER_ZU_CM-Umrechnung wie die Waende ins
    cm-System des Grundriss-JSON gebracht — verifiziert: Anker und Waende
    teilen ein Koordinatensystem (kein Offset, keine Spiegelung), der
    Aufzug-Anker liegt bei y<0 sauber im Nord-Vorbau.

    Die Zuordnung Label->Raum passiert bewusst NICHT hier, sondern zur
    Laufzeit per Punkt-in-Polygon — so bleibt sie robust gegen spaetere
    Editier-Aenderungen an den Waenden (Raum-UUIDs sind dann nicht stabil).
    """
    if not geometry_pfad.exists():
        print(f"warnung: {geometry_pfad} fehlt — keine Raum-Label exportiert")
        return []
    geo = json.loads(geometry_pfad.read_text(encoding="utf-8"))
    labels: list[dict] = []
    for b in geo.get("beschriftungen", []):
        labels.append({
            "text": b["text"],
            "zusatz": b.get("zusatz", ""),
            "seite": b.get("seite", ""),
            "anker_cm": [_raste(b["anker_x_m"] * METER_ZU_CM),
                         _raste(b["anker_y_m"] * METER_ZU_CM)],
        })
    return labels


# Muss mit `AusstattungTyp` in src/model/floorplan.ts uebereinstimmen. Fehlt ein
# Typ hier, bricht der Export hart ab (fail-closed, siehe lade_ausstattung).
#
# Die drei W3-Typen stehen bewusst mit drin, obwohl sie in KEINER gemessenen
# Quelle vorkommen und der Export sie darum nie sieht: eine vom Nutzer
# gesicherte Datei traegt sie, und wenn diese Datei je wieder durch die
# Werkzeugkette laeuft, soll sie nicht an ihnen zerbrechen. Ein Typ, der im
# Planer erzeugt werden kann, aber im Export verboten ist, waere eine Sackgasse.
ERLAUBTE_TYPEN = {
    "tisch", "rundtisch", "stuhl", "schrank", "treppe", "wc",
    "waschbecken", "kochfeld", "pflanze", "aufzug", "flaeche",
    "matte", "geraet", "liege",
}


def lade_ausstattung(pfad: Path) -> list[dict]:
    """Liest die gemessene Ausstattung (A1) und prueft sie fail-closed.

    Sie wandert in den `floorplan`-Zweig, NICHT nach `items`: dort landet, was
    `Model.loadSerialized` an `Floorplan.loadFloorplan` durchreicht — dadurch
    erbt sie die erprobte Speicher-/Lade-Mechanik und uebersteht damit auch das
    Rueckgaengig, das seine Momentaufnahmen ueber genau diesen Pfad zieht.

    Geprueft wird streng, weil ein Tippfehler sonst lautlos ein unsichtbares
    Moebel erzeugt: unbekannter Typ, fehlende Pflichtzahl oder eine Ausdehnung
    <= 0 brechen den Export ab, statt einen halben Plan auszuliefern.
    """
    if not pfad.exists():
        print(f"warnung: {pfad} fehlt — keine Ausstattung exportiert")
        return []
    roh = json.loads(pfad.read_text(encoding="utf-8"))
    elemente = roh.get("elemente", roh if isinstance(roh, list) else [])
    sauber: list[dict] = []
    for i, e in enumerate(elemente):
        # Blosse Zeichenketten sind Abschnitts-Trenner ("--- A2 WEST ---").
        # Die Quelldatei wird von Hand gepflegt und waechst auf mehrere hundert
        # Zeilen; eine Gliederung darin ist Sorgfalt, kein Schmutz.
        if isinstance(e, str):
            continue
        typ = e.get("typ")
        if typ not in ERLAUBTE_TYPEN:
            raise SystemExit(f"ausstattung[{i}]: unbekannter Typ {typ!r}")
        for feld in ("x", "y", "breite", "tiefe"):
            if not isinstance(e.get(feld), (int, float)):
                raise SystemExit(f"ausstattung[{i}] ({typ}): {feld} fehlt oder ist keine Zahl")
        if e["breite"] <= 0 or e["tiefe"] <= 0:
            raise SystemExit(f"ausstattung[{i}] ({typ}): Ausdehnung muss > 0 sein")
        eintrag = {
            "typ": typ,
            "x": _raste(e["x"]), "y": _raste(e["y"]),
            "breite": _raste(e["breite"]), "tiefe": _raste(e["tiefe"]),
        }
        if e.get("drehung"):
            eintrag["drehung"] = round(float(e["drehung"]), 4)
        for feld in ("text", "beleg"):
            if e.get(feld):
                eintrag[feld] = e[feld]
        sauber.append(eintrag)
    return sauber


# ══════════════════════════════════════════════════════════════════════════
#  DIE SETZUNGS-SCHICHT (W5) — was der Nutzer gesetzt hat, und der Waechter
#  davor. Alles ab hier ist ADDITIV: es liest data/gesetzt.json und beruehrt
#  keine der gemessenen Quellen (walls.json, ausstattung.json,
#  plan-geometry.json). Die PDF bleibt die alleinige Grundwahrheit.
# ══════════════════════════════════════════════════════════════════════════

GESETZT_ABSCHNITTE = ("verschiebungen", "neue_stuecke", "entfernt",
                      "oeffnungen", "raumnamen")


def leere_setzungen() -> dict:
    return {"verschiebungen": [], "neue_stuecke": [], "entfernt": [],
            "oeffnungen": [], "raumnamen": {}}


def lade_gesetzt(pfad: Path) -> dict:
    """Liest die Setzungs-Schicht — was der Nutzer im Planer gesetzt hat.

    Fehlt die Datei, ist das der NORMALFALL und kein Fehler: dann gibt es keine
    Bearbeitung, und der Export liefert genau den gemessenen Stand.

    Fuenf GETRENNTE Abschnitte, kein gemeinsamer Eimer: nur so kann der Export
    „neu hingestellt" von „verschoben" unterscheiden. In einem Eimer waere ein
    verschobenes Messstueck von einem neuen nicht mehr zu trennen, und der
    Export schriebe es zweimal — einmal an seinem Messort, einmal an seinem
    neuen.

    Geprueft wird streng: ein unbekannter Abschnitt ist ein Tippfehler, und ein
    Tippfehler taete hier still gar nichts (die Setzung waere weg, ohne dass
    jemand es merkt).
    """
    if not pfad.exists():
        return leere_setzungen()
    try:
        roh = json.loads(pfad.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise SystemExit(f"{pfad} ist nicht lesbar ({e}). Abbruch — es wurde "
                         f"nichts geschrieben.")
    if not isinstance(roh, dict):
        raise SystemExit(f"{pfad}: erwartet wird ein Objekt mit den Abschnitten "
                         f"{', '.join(GESETZT_ABSCHNITTE)}")
    unbekannt = set(roh) - set(GESETZT_ABSCHNITTE) - {"_stand"}
    if unbekannt:
        raise SystemExit(f"{pfad}: unbekannter Abschnitt {sorted(unbekannt)} — "
                         f"erlaubt sind {', '.join(GESETZT_ABSCHNITTE)}")
    gesetzt = leere_setzungen()
    for a in GESETZT_ABSCHNITTE:
        if a not in roh:
            continue
        erwartet = dict if a == "raumnamen" else list
        if not isinstance(roh[a], erwartet):
            raise SystemExit(f"{pfad}: Abschnitt {a!r} muss "
                             f"{'ein Objekt' if erwartet is dict else 'eine Liste'} sein")
        gesetzt[a] = roh[a]
    return gesetzt


def zaehle_setzungen(plan: dict) -> dict:
    """Was in einer FERTIGEN Plandatei an Nutzer-Arbeit steckt.

    Vier Merkmale, die ein rein gemessener Plan nicht haben kann:
    gesetzte Moebel, Oeffnungen, hash-untreue Ecken und Raumnamen. Die
    Ecken-Kennung IST der Hash ihrer Koordinate (`ecken_id`) — eine gezeichnete
    Ecke traegt eine GUID, eine verschobene gemessene behaelt ihre alte Kennung.
    Beides faellt aus dem Hash und ist damit byte-genau erkennbar, auch ohne
    ein `quelle`-Feld an der Wand.
    """
    fp = plan.get("floorplan") or {}
    ecken = []
    for cid, c in (fp.get("corners") or {}).items():
        try:
            treu = cid == ecken_id(float(c["x"]), float(c["y"]))
        except (KeyError, TypeError, ValueError):
            treu = False
        if not treu:
            ecken.append(cid)
    return {
        "moebel": [e for e in (fp.get("ausstattung") or [])
                   if e.get("quelle") == "gesetzt"],
        "oeffnungen": list(fp.get("oeffnungen") or []),
        "ecken": ecken,
        "raumnamen": dict(fp.get("roomMeta") or {}),
    }


def ungedeckte_setzungen(plan: dict, gesetzt: dict) -> list[str]:
    """Welche Setzungen in der Zieldatei stehen, die `data/gesetzt.json` NICHT
    hergibt — genau die wuerde ein neuer Export still ueberschreiben.

    BEWUSSTE GRENZE: geloeschte Messstuecke werden hier NICHT gezaehlt. Ein
    Loeschen unterdrueckt nur die Anzeige, die Messung selbst bleibt in
    data/ausstattung.json stehen und kaeme beim naechsten Export zurueck — das
    ist wiederherstellbar und damit kein stiller Verlust. Es hier zu pruefen
    hiesse ausserdem, jede NEUE Messung als „fehlendes Stueck" zu melden und
    einen voellig richtigen Export zu blockieren.
    """
    stand = zaehle_setzungen(plan)
    gedeckte_moebel = {e.get("id") for e in gesetzt["verschiebungen"]}
    gedeckte_moebel |= {e.get("id") for e in gesetzt["neue_stuecke"]}
    gedeckte_oeffnungen = {o.get("id") for o in gesetzt["oeffnungen"]}

    offen: list[str] = []
    fremd = [e for e in stand["moebel"] if e.get("id") not in gedeckte_moebel]
    if fremd:
        beispiel = " · ".join(f"{e.get('typ','?')} bei "
                              f"{e.get('x','?')}/{e.get('y','?')}" for e in fremd[:3])
        offen.append(f"{len(fremd)} von Hand gesetzte(s) Moebelstueck(e) — {beispiel}")
    fremd_o = [o for o in stand["oeffnungen"] if o.get("id") not in gedeckte_oeffnungen]
    if fremd_o:
        beispiel = " · ".join(f"{o.get('art','?')} an Wand {str(o.get('wandId',''))[:12]}"
                              for o in fremd_o[:3])
        offen.append(f"{len(fremd_o)} Tuer/Fenster/Durchgang — {beispiel}")
    # Ecken sind NIE gedeckt: data/gesetzt.json traegt keine Geometrie. Eine
    # hash-untreue Ecke ist eine Behauptung ueber das Aufmass, und die darf nur
    # die PDF machen (Projekt-DNA, oberstes Prinzip).
    if stand["ecken"]:
        offen.append(f"{len(stand['ecken'])} gezeichnete oder verschobene Ecke(n) — "
                     f"{' · '.join(stand['ecken'][:3])}")
    fremde_namen = [k for k in stand["raumnamen"] if k not in gesetzt["raumnamen"]]
    if fremde_namen:
        beispiel = " · ".join(str(stand["raumnamen"][k].get("name", "?"))
                              for k in fremde_namen[:3])
        offen.append(f"{len(fremde_namen)} Raumname(n) — {beispiel}")
    return offen


def wende_gesetzt_an(plan: dict, gesetzt: dict) -> dict:
    """Legt die Setzungs-Schicht ZULETZT auf den fertigen Plan (W5, Schritt 4).

    Additiv und in dieser Reihenfolge: verschieben, entfernen, anhaengen,
    Oeffnungen, Raumnamen. `lade_ausstattung` bleibt dabei UNANGETASTET — sie
    darf `id` und `quelle` weiter wegschneiden. Flosse der Rueckweg durch sie
    hindurch, machte der naechste Lauf aus jeder Setzung still ein Aufmass (beim
    Laden ist der Standard `'gemessen'`, src/model/floorplan.ts:829), und die
    Trennung zwischen Messung und Annahme waere dahin.

    Jede Verschiebung traegt ihren Messort als `erwartet` mit. Passt der nicht
    mehr zur Quelle, wird sie NICHT angewendet, sondern gemeldet: die Messung
    hat sich geaendert, und eine Setzung auf ein Stueck zu schieben, das
    woanders steht, waere eine stille Falschaussage.
    """
    bericht = {"verschoben": 0, "entfernt": 0, "neu": 0,
               "oeffnungen": 0, "raumnamen": 0, "warnungen": []}
    ausstattung = plan["floorplan"]["ausstattung"]

    # Die Kennung entsteht beim Laden aus Art und MESSORT (kennungAusAusstattung,
    # src/model/floorplan.ts:371). Genau darum findet eine Verschiebung ihr
    # Stueck wieder, obwohl es laengst woanders steht.
    nach_id: dict[str, dict] = {}
    for e in ausstattung:
        nach_id.setdefault(kennung_aus_ausstattung(e), e)

    for v in gesetzt["verschiebungen"]:
        el = nach_id.get(v.get("id"))
        erwartet = v.get("erwartet") or {}
        if el is None:
            bericht["warnungen"].append(
                f"Verschiebung {v.get('id')}: dieses Messstueck gibt es nicht "
                f"mehr — nicht angewendet")
            continue
        if (el["typ"] != erwartet.get("typ")
                or abs(el["x"] - float(erwartet.get("x0", 1e9))) > 0.5
                or abs(el["y"] - float(erwartet.get("y0", 1e9))) > 0.5):
            bericht["warnungen"].append(
                f"Verschiebung {v.get('id')}: die Messung steht jetzt bei "
                f"{el['x']:.0f}/{el['y']:.0f} statt {erwartet.get('x0')}/"
                f"{erwartet.get('y0')} — nicht angewendet")
            continue
        # Die Kennung wird AUSDRUECKLICH mitgeschrieben. Ohne sie leitete der
        # Planer sie beim Laden aus dem NEUEN Ort ab, und beim naechsten
        # Rueckweg faende die Verschiebung ihr Messstueck nicht mehr wieder.
        el["id"] = v["id"]
        el["x"], el["y"] = _raste(float(v["x"])), _raste(float(v["y"]))
        if v.get("drehung") is not None:
            el["drehung"] = round(float(v["drehung"]), 4)
        el["quelle"] = "gesetzt"
        bericht["verschoben"] += 1

    if gesetzt["entfernt"]:
        # Verschobene Stuecke tragen ihre Kennung jetzt AUSDRUECKLICH (oben
        # gesetzt) — sie werden hier also an ihrer Herkunfts-Kennung erkannt und
        # nicht versehentlich an der eines fremden Stuecks, das zufaellig an
        # ihrem neuen Ort steht.
        weg = set(gesetzt["entfernt"])
        behalten = [e for e in ausstattung
                    if (e.get("id") or kennung_aus_ausstattung(e)) not in weg]
        bericht["entfernt"] = len(ausstattung) - len(behalten)
        plan["floorplan"]["ausstattung"] = ausstattung = behalten

    for neu in gesetzt["neue_stuecke"]:
        typ = neu.get("typ")
        if typ not in ERLAUBTE_TYPEN:
            raise SystemExit(f"gesetzt.json/neue_stuecke: unbekannter Typ {typ!r}")
        for feld in ("x", "y", "breite", "tiefe"):
            if not isinstance(neu.get(feld), (int, float)):
                raise SystemExit(f"gesetzt.json/neue_stuecke ({typ}): {feld} fehlt")
        eintrag = {"id": neu.get("id") or kennung_aus_ausstattung(neu),
                   "quelle": "gesetzt", "typ": typ,
                   "x": _raste(neu["x"]), "y": _raste(neu["y"]),
                   "breite": _raste(neu["breite"]), "tiefe": _raste(neu["tiefe"])}
        if neu.get("drehung"):
            eintrag["drehung"] = round(float(neu["drehung"]), 4)
        if neu.get("text"):
            eintrag["text"] = neu["text"]
        ausstattung.append(eintrag)
        bericht["neu"] += 1

    if gesetzt["oeffnungen"]:
        # Mit `anker`, sonst stirbt die Versoehnung: in dieser Pipeline
        # ueberlebt keine Wand-Kennung ein Nachmessen (sie wird aus dem
        # Eckenpaar abgeleitet, die Ecken aus der Koordinate). Der Anker ist die
        # einzige dauerhafte Spur zum gesetzten Ort.
        plan["floorplan"]["oeffnungen"] = gesetzt["oeffnungen"]
        bericht["oeffnungen"] = len(gesetzt["oeffnungen"])
    if gesetzt["raumnamen"]:
        plan["floorplan"]["roomMeta"] = gesetzt["raumnamen"]
        bericht["raumnamen"] = len(gesetzt["raumnamen"])

    # Die Fassung wird NUR geschrieben, wenn die Schicht wirklich etwas
    # hineingelegt hat. Ohne Setzungen ist die Datei genau das, was sie seit T3
    # ist — und bleibt byte-identisch, was das Gate misst. Mit Setzungen traegt
    # sie Kennungen, `quelle` und womoeglich Oeffnungen und IST damit eine
    # Fassung-3-Datei; das zu verschweigen hiesse, einen aelteren Planer die
    # Tueren still wegwerfen zu lassen (src/model/floorplan.ts, PLAN_FASSUNG).
    if any(bericht[k] for k in ("verschoben", "neu", "oeffnungen", "raumnamen")):
        plan["floorplan"]["formatVersion"] = 3
    return bericht


def pruefe_zieldatei(out: Path, gesetzt: dict, verwerfen: bool) -> None:
    """DER WAECHTER (W5, Schritt 1) — fail-closed vor dem Schreiben.

    Der Export erzeugt die Zieldatei NEU. Ohne diese Pruefung ueberschreibt der
    naechste Lauf jede Bearbeitung des Nutzers, lautlos und ohne Rueckweg. Der
    Waechter liest deshalb die VORHANDENE Zieldatei und bricht ab, sobald darin
    Arbeit steckt, die die Quellen nicht hergeben.

    Er ruehrt die Zieldatei NICHT an — er liest sie nur. Was er schuetzt, darf
    er nicht selbst anfassen.
    """
    if verwerfen or not out.exists():
        return
    try:
        vorhanden = json.loads(out.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise SystemExit(
            f"ABBRUCH — {out} ist nicht lesbar ({e}).\n"
            f"Es wurde nichts geschrieben. Bitte die Datei ansehen; wenn sie "
            f"kaputt ist:\n"
            f"    python tools/export_blueprint.py --verwerfe-setzungen")
    offen = ungedeckte_setzungen(vorhanden, gesetzt)
    if not offen:
        return
    raise SystemExit(
        "\n".join([
            "",
            f"ABBRUCH — in {out} steckt Arbeit, die die Quellen nicht hergeben:",
            *[f"    · {z}" for z in offen],
            "",
            "Ein neuer Export wuerde sie ueberschreiben. Deshalb wurde NICHTS",
            "geschrieben. So geht es weiter — einer von zwei Wegen:",
            "",
            "  1) Die Bearbeitung BEHALTEN. Die gesicherte Datei uebernehmen,",
            "     dann neu exportieren:",
            "         python tools/uebernimm-bearbeitung.py            (zeigt nur an)",
            "         python tools/uebernimm-bearbeitung.py --schreibe (uebernimmt)",
            "         python tools/export_blueprint.py",
            "",
            "  2) Die Bearbeitung WEGWERFEN (sie ist dann weg):",
            "         python tools/export_blueprint.py --verwerfe-setzungen",
            "",
            "Wenn keine gesicherte Datei da ist, ist die Zieldatei selbst der",
            "letzte Stand: erst wegkopieren (z. B. nach",
            "data/arbeitsstand-notfall.json), dann Weg 2.",
        ]))


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--walls", type=Path, default=Path("data/walls.json"))
    p.add_argument("--ausstattung", type=Path, default=Path("data/ausstattung.json"),
                   help="gemessene Ausstattung (A1)")
    p.add_argument("--gesetzt", type=Path, default=Path("data/gesetzt.json"),
                   help="Setzungs-Schicht des Nutzers (W5)")
    p.add_argument("--ohne-gesetzt", action="store_true",
                   help="die Setzungs-Schicht NICHT anwenden — der rein gemessene Stand")
    p.add_argument("--verwerfe-setzungen", action="store_true",
                   help="den Waechter uebergehen und die Zieldatei ueberschreiben")
    # Zielort ist bewusst das Verzeichnis, aus dem die App liest. Eine Kopie
    # unter data/ waere eine zweite Wahrheit, die beim naechsten Lauf driftet.
    p.add_argument("--out", type=Path,
                   default=Path("app/public/plaene/halle400.json"))
    p.add_argument("--geometry", type=Path,
                   default=Path("data/plan-geometry.json"),
                   help="PDF-Beschriftungen fuer die Raum-Label")
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

    plan["labels"] = lade_labels(args.geometry)
    print(f"{len(plan['labels'])} Raum-Label(s) aus {args.geometry}")

    plan["floorplan"]["ausstattung"] = lade_ausstattung(args.ausstattung)
    if plan["floorplan"]["ausstattung"]:
        arten: dict[str, int] = {}
        for e in plan["floorplan"]["ausstattung"]:
            arten[e["typ"]] = arten.get(e["typ"], 0) + 1
        print(f"{len(plan['floorplan']['ausstattung'])} Ausstattungs-Zeichen "
              f"({' · '.join(f'{k} {v}' for k, v in sorted(arten.items()))})")

    # Die Setzungs-Schicht wird auch bei --ohne-gesetzt GELESEN, nur nicht
    # angewendet: der Waechter braucht sie, um zu wissen, was in der Zieldatei
    # gedeckt ist. Was in gesetzt.json steht, ist wiederherstellbar — der
    # Waechter darf deswegen nicht darauf bestehen.
    gesetzt = lade_gesetzt(args.gesetzt)

    # DIE EINZIGE NAHT (W5). Hier, ganz zuletzt, kommt die Bearbeitung des
    # Nutzers auf den fertigen gemessenen Plan — nach labels und ausstattung,
    # additiv, ohne eine der Quellen zu beruehren.
    if not args.ohne_gesetzt:
        b = wende_gesetzt_an(plan, gesetzt)
        if any(b[k] for k in ("verschoben", "entfernt", "neu", "oeffnungen", "raumnamen")):
            print(f"Setzungen aus {args.gesetzt}: {b['verschoben']} verschoben · "
                  f"{b['entfernt']} entfernt · {b['neu']} neu · "
                  f"{b['oeffnungen']} Oeffnung(en) · {b['raumnamen']} Raumname(n)")
        for w in b["warnungen"]:
            print(f"  WARNUNG: {w}")

    pruefe_zieldatei(args.out, gesetzt, args.verwerfe_setzungen)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(plan, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"geschrieben: {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
