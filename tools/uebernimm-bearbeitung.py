#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Nimmt die BEARBEITUNG des Nutzers zurueck ins Projekt (W5).

    Halle400-Plan-<datum>.json   (aus der Doppelklick-Datei gesichert)
        -> data/gesetzt.json     (fuenf getrennte Abschnitte)
        -> data/arbeitsstand-<datum>.json  (Roh-Sicherung, unveraendert)

Aufruf
------
    python tools/uebernimm-bearbeitung.py                 # zeigt nur an
    python tools/uebernimm-bearbeitung.py --schreibe      # uebernimmt wirklich
    python tools/uebernimm-bearbeitung.py <datei.json>    # bestimmte Datei
    python tools/uebernimm-bearbeitung.py --nur-ecken <datei.json>

Ohne Dateiangabe wird die NEUESTE `Halle400-Plan-*.json` im Download-Ordner
genommen — das ist der Handy-Weg: Datei herueberkopieren, Befehl ohne Argument.

DER TROCKENLAUF IST DER STANDARD
--------------------------------
Ohne `--schreibe` wird `data/gesetzt.json` NICHT angefasst. Was klassifiziert
wurde, steht als Bericht auf dem Bildschirm und laesst sich pruefen, bevor es
wirkt. Die Roh-Sicherung wird trotzdem angelegt: sie ueberschreibt nichts, sie
legt nur einen zurueckholbaren Stand daneben.

WAS ZURUECKFLIESST — UND WAS NICHT
----------------------------------
| Neu hingestelltes Moebel   | `gesetzt`, KEIN `beleg` | -> neue_stuecke      |
| Verschobenes Messstueck    | `gesetzt`, MIT `beleg`  | -> verschiebungen    |
| Geloeschtes Messstueck     | fehlt gegenueber Quelle | -> entfernt          |
| Tuer / Fenster / Durchgang | floorplan.oeffnungen    | -> oeffnungen        |
| Umbenannter Raum           | floorplan.roomMeta      | -> raumnamen         |
| GEZEICHNETE Wand           | Ecken nicht hash-treu   | -> nur zaehlen (W7)  |
| VERSCHOBENE gemessene Wand | Ecke hash-untreu        | -> HARTER ABBRUCH    |

Der `beleg` ist die Trennschaerfe zwischen „verschoben" und „neu":
`verschiebeAusstattung` setzt `quelle: 'gesetzt'`, laesst den `beleg` aber
ausdruecklich stehen (`src/model/floorplan.ts:919-931`), `fuegeAusstattungHinzu`
kann keinen haben (`:790-802`). Ein verschobenes Messstueck darf NIE als neues
Stueck zurueckfliessen und nie zurueck in `data/ausstattung.json` — dort steht,
wo es GEMESSEN wurde.

Der harte Abbruch bei einer verschobenen gemessenen Ecke ist kein Uebereifer:
die Ecken-Kennung IST der Hash ihrer Koordinate (`export_blueprint.ecken_id`).
Faellt eine Ecke aus dem Hash und stand ihre Kennung vorher in den Quellen,
dann hat jemand das Aufmass verschoben — und eine Aussage ueber das Aufmass
darf in diesem Projekt nur die PDF machen.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

# Liegt im selben Verzeichnis — dadurch wird `ecken_id`, `lade_ausstattung` und
# `ERLAUBTE_TYPEN` GETEILT statt abgeschrieben. Zwei Fassungen derselben
# Rechnung liefen auseinander, sobald jemand nur eine anfasst.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import export_blueprint as ex  # noqa: E402

WURZEL = Path(__file__).resolve().parent.parent

# Pfade werden gegen die PROJEKT-WURZEL aufgeloest, nicht gegen das aktuelle
# Verzeichnis: dieses Werkzeug wird oft aus dem Download-Ordner heraus gerufen
# („Handy-Weg"), und dort gaebe es kein data/.
STANDARD_ZIEL = WURZEL / "data/gesetzt.json"
STANDARD_AUSSTATTUNG = WURZEL / "data/ausstattung.json"
STANDARD_WALLS = WURZEL / "data/walls.json"
STANDARD_SICHERUNG = WURZEL / "data"
DOWNLOAD_MUSTER = "Halle400-Plan-*.json"


def plan_fassung() -> int:
    """Die Fassung des Speicherformats — GELESEN aus dem Kern, nicht kopiert.

    Eine Zahl, die hier noch einmal steht, ist eine zweite Wahrheit: sie bliebe
    auf 3 stehen, waehrend der Planer schon 4 schreibt, und dieses Werkzeug
    lehnte dann gueltige Dateien ab.
    """
    quelle = WURZEL / "src/model/floorplan.ts"
    treffer = re.search(r"PLAN_FASSUNG\s*=\s*(\d+)", quelle.read_text(encoding="utf-8"))
    if not treffer:
        raise SystemExit(f"{quelle}: PLAN_FASSUNG nicht gefunden — Abbruch, "
                         f"statt eine Fassung zu raten.")
    return int(treffer.group(1))


# Die Kennungs-Rechnung wird GETEILT, nicht abgeschrieben: sie steht einmal in
# export_blueprint (`kennung_aus_ausstattung`, Spiegel von
# src/model/floorplan.ts:371). Zwei Fassungen liefen auseinander, und dann faende
# keine einzige Verschiebung ihr Messstueck wieder.
kennung_aus_ausstattung = ex.kennung_aus_ausstattung


def eindeutige_kennung(vorschlag: str, vergeben: set[str]) -> str:
    """Spiegel von `eindeutigeKennung` (src/model/floorplan.ts:348).

    Zaehlend und nicht zufaellig — dieselbe Datei muss dieselben Kennungen
    ergeben. Zwei gleiche Stuehle an derselben Stelle bekommen sonst dieselbe
    Kennung, und ab da traefe jeder Griff am zweiten in Wahrheit den ersten.
    """
    kennung = vorschlag
    n = 2
    while kennung in vergeben:
        kennung = f"{vorschlag}#{n}"
        n += 1
    vergeben.add(kennung)
    return kennung


def kennungen_der_quelle(pfad: Path) -> dict[str, dict]:
    """Die gemessene Ausstattung, nach derselben Kennung geordnet, die der
    Planer ihr beim Laden gibt. DAS ist die Bruecke zurueck: ein verschobenes
    Stueck traegt in der Nutzerdatei noch die Kennung seines MESSORTES, weil sie
    beim Laden vergeben und danach nie neu gerechnet wird.
    """
    vergeben: set[str] = set()
    nach_id: dict[str, dict] = {}
    for e in ex.lade_ausstattung(pfad):
        nach_id[eindeutige_kennung(kennung_aus_ausstattung(e), vergeben)] = e
    return nach_id


def ecken_der_quelle(pfad: Path) -> set[str]:
    """Die Ecken-Kennungen, die das Aufmass hergibt."""
    if not pfad.exists():
        return set()
    return set(ex.baue(json.loads(pfad.read_text(encoding="utf-8")))
               ["floorplan"]["corners"])


def neueste_nutzerdatei(ordner: Path) -> Path | None:
    treffer = sorted(ordner.glob(DOWNLOAD_MUSTER),
                     key=lambda p: p.stat().st_mtime, reverse=True)
    return treffer[0] if treffer else None


def lies_nutzerdatei(pfad: Path) -> dict:
    """Die gesicherte Datei einlesen und grob auf Form pruefen.

    Beide Formen werden angenommen — `{floorplan, items, labels}` (so sichert
    die Doppelklick-Datei) und ein blosser Grundriss. Dieselbe Nachsicht uebt
    ihr `pruefePlan`; eine Datei abzulehnen, die der Planer selbst oeffnet,
    waere die schlechtere Strenge.
    """
    try:
        roh = json.loads(pfad.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise SystemExit(f"{pfad} ist keine lesbare JSON-Datei ({e}).")
    if not isinstance(roh, dict):
        raise SystemExit(f"{pfad}: erwartet wird ein Objekt.")
    fp = roh.get("floorplan") if isinstance(roh.get("floorplan"), dict) else roh
    if not isinstance(fp.get("corners"), dict) or not isinstance(fp.get("walls"), list):
        raise SystemExit(f"{pfad}: das sieht nicht nach einem Grundriss aus "
                         f"(corners/walls fehlen).")
    return fp


def sichere_roh(quelle: Path, ordner: Path, stempel: str) -> Path | None:
    """Legt die Nutzerdatei UNVERAENDERT als data/arbeitsstand-<datum>.json ab.

    Der billigste Teil dieser Welle und der wirksamste: was hier liegt, ist
    immer zurueckholbar, auch wenn eine Uebernahme spaeter schiefgeht. Eine
    vorhandene Sicherung wird NIE ueberschrieben — sonst zerstoerte die
    Rettungsleine den Stand, den sie retten soll. Bei gleichem Inhalt bleibt es
    bei der einen Datei, sonst zaehlt der Name hoch.
    """
    ordner.mkdir(parents=True, exist_ok=True)
    daten = quelle.read_bytes()
    n = 1
    while True:
        name = f"arbeitsstand-{stempel}.json" if n == 1 else f"arbeitsstand-{stempel}-{n}.json"
        ziel = ordner / name
        if not ziel.exists():
            ziel.write_bytes(daten)
            return ziel
        if ziel.read_bytes() == daten:
            return ziel          # schon gesichert — nichts zu tun
        n += 1


class Befund:
    """Was die Klassifikation gefunden hat — Daten, keine Wirkung."""

    def __init__(self) -> None:
        self.verschiebungen: list[dict] = []
        self.neue_stuecke: list[dict] = []
        self.entfernt: list[str] = []
        self.oeffnungen: list[dict] = []
        self.raumnamen: dict = {}
        self.gezeichnete_ecken: list[str] = []
        self.gewanderte_ecken: list[str] = []
        self.gezeichnete_waende = 0
        self.warnungen: list[str] = []


def pruefe_ecken(fp: dict, quell_ecken: set[str], befund: Befund) -> None:
    """Trennt gezeichnete Ecken (zaehlen) von verschobenen gemessenen (Abbruch).

    Beides ist hash-untreu, aber es sind zwei sehr verschiedene Aussagen. Eine
    GEZEICHNETE Ecke traegt eine GUID (`src/model/corner.ts:38,40`) und stand
    nie in den Quellen — sie ist eine Ergaenzung. Eine gemessene Ecke, die
    verschoben wurde, BEHAELT ihre alte Kennung; die steht in den Quellen, und
    ihre Koordinate passt nicht mehr dazu. Das ist eine Behauptung ueber das
    Aufmass.
    """
    for cid, c in (fp.get("corners") or {}).items():
        try:
            treu = cid == ex.ecken_id(float(c["x"]), float(c["y"]))
        except (KeyError, TypeError, ValueError):
            befund.warnungen.append(f"Ecke {cid}: unbrauchbare Koordinate {c!r}")
            continue
        if treu:
            continue
        if cid in quell_ecken:
            befund.gewanderte_ecken.append(
                f"{cid} steht jetzt bei {c['x']:.0f}/{c['y']:.0f} cm")
        else:
            befund.gezeichnete_ecken.append(cid)

    gezeichnet = set(befund.gezeichnete_ecken)
    for w in fp.get("walls") or []:
        if w.get("corner1") in gezeichnet or w.get("corner2") in gezeichnet:
            befund.gezeichnete_waende += 1


def klassifiziere_ausstattung(fp: dict, quelle: dict[str, dict], befund: Befund) -> None:
    vergeben: set[str] = set()
    gesehen: set[str] = set()
    for i, el in enumerate(fp.get("ausstattung") or []):
        if not isinstance(el, dict):
            continue
        kennung = eindeutige_kennung(
            el.get("id") or kennung_aus_ausstattung(el), vergeben)
        gesehen.add(kennung)
        if el.get("quelle") != "gesetzt":
            if kennung not in quelle:
                befund.warnungen.append(
                    f"ausstattung[{i}] ({el.get('typ')}) gilt als gemessen, steht "
                    f"aber nicht in den Quellen — uebergangen")
            continue

        if el.get("beleg"):
            mess = quelle.get(kennung)
            if mess is None:
                befund.warnungen.append(
                    f"ausstattung[{i}] ({el.get('typ')}) ist ein verschobenes "
                    f"Messstueck, dessen Messung nicht mehr in den Quellen steht "
                    f"({kennung}) — NICHT uebernommen")
                continue
            if mess.get("typ") != el.get("typ"):
                befund.warnungen.append(
                    f"ausstattung[{i}]: Art passt nicht zur Messung "
                    f"({el.get('typ')} statt {mess.get('typ')}) — NICHT uebernommen")
                continue
            eintrag = {"id": kennung,
                       "x": ex._raste(float(el["x"])), "y": ex._raste(float(el["y"])),
                       "erwartet": {"x0": mess["x"], "y0": mess["y"],
                                    "typ": mess["typ"]}}
            if el.get("drehung"):
                eintrag["drehung"] = round(float(el["drehung"]), 4)
            befund.verschiebungen.append(eintrag)
            continue

        # Kein `beleg` = neu hingestellt. Streng geprueft, weil ein unbekannter
        # Typ im Export hart abbricht und ein unsichtbares Moebel schlimmer ist
        # als eine ehrliche Ablehnung.
        typ = el.get("typ")
        if typ not in ex.ERLAUBTE_TYPEN:
            raise SystemExit(f"ausstattung[{i}]: unbekannter Typ {typ!r} — Abbruch.")
        for feld in ("x", "y", "breite", "tiefe"):
            if not isinstance(el.get(feld), (int, float)):
                raise SystemExit(f"ausstattung[{i}] ({typ}): {feld} fehlt oder "
                                 f"ist keine Zahl — Abbruch.")
        if el["breite"] <= 0 or el["tiefe"] <= 0:
            raise SystemExit(f"ausstattung[{i}] ({typ}): Ausdehnung muss > 0 sein.")
        neu = {"id": kennung, "typ": typ,
               "x": ex._raste(float(el["x"])), "y": ex._raste(float(el["y"])),
               "breite": ex._raste(float(el["breite"])),
               "tiefe": ex._raste(float(el["tiefe"]))}
        if el.get("drehung"):
            neu["drehung"] = round(float(el["drehung"]), 4)
        if el.get("text"):
            neu["text"] = el["text"]
        befund.neue_stuecke.append(neu)

    befund.entfernt = [k for k in quelle if k not in gesehen]


OEFFNUNG_PFLICHT = ("wandId", "lage", "breite", "art", "seite", "anschlag")


def klassifiziere_oeffnungen(fp: dict, befund: Befund) -> None:
    """Tueren, Fenster, Durchgaenge — IMMER mit `anker`.

    Ohne den Anker stirbt die Versoehnung: in dieser Pipeline ueberlebt keine
    Wand-Kennung ein Nachmessen (die Kennung wird aus dem Eckenpaar abgeleitet,
    die Ecken aus der Koordinate). Der Anker ist die einzige dauerhafte Spur zu
    dem Ort, an den der Nutzer die Tuer gesetzt hat.
    """
    for i, o in enumerate(fp.get("oeffnungen") or []):
        if not isinstance(o, dict):
            continue
        fehlend = [f for f in OEFFNUNG_PFLICHT if o.get(f) is None]
        if fehlend:
            raise SystemExit(f"oeffnungen[{i}]: {', '.join(fehlend)} fehlt — Abbruch.")
        anker = o.get("anker")
        if not isinstance(anker, dict) or "x" not in anker or "y" not in anker:
            raise SystemExit(
                f"oeffnungen[{i}] ({o.get('art')}): kein `anker` — ohne ihn ist "
                f"die Oeffnung nach dem naechsten Nachmessen unrettbar. Abbruch.")
        eintrag = {"id": o.get("id") or f"o-{o.get('art')}-{i}",
                   "wandId": o["wandId"], "lage": round(float(o["lage"]), 2),
                   "breite": round(float(o["breite"]), 2), "art": o["art"],
                   "seite": o["seite"], "anschlag": o["anschlag"],
                   "anker": {"x": round(float(anker["x"]), 2),
                             "y": round(float(anker["y"]), 2)}}
        if o.get("bruestung") is not None:
            eintrag["bruestung"] = round(float(o["bruestung"]), 2)
        if o.get("verwaist"):
            # Nicht still entsorgen: der Nutzer hat sie gesetzt. Der Kern
            # entscheidet beim naechsten Laden neu, ob sie eine Wand findet.
            eintrag["verwaist"] = True
        befund.oeffnungen.append(eintrag)


def klassifiziere_raumnamen(fp: dict, befund: Befund) -> None:
    for schluessel, wert in (fp.get("roomMeta") or {}).items():
        if isinstance(wert, dict) and str(wert.get("name", "")).strip():
            befund.raumnamen[schluessel] = {"name": wert["name"]}


def bericht(befund: Befund, fassung: int, quelle: Path, sicherung: Path | None,
            schreibe: bool) -> None:
    print("")
    print(f"Gelesen: {quelle}  (Fassung {fassung})")
    if sicherung:
        print(f"Roh-Sicherung: {sicherung}")
    print("")
    print(f"  {len(befund.verschiebungen):4d} verschobene(s) Messstueck(e)")
    print(f"  {len(befund.neue_stuecke):4d} neu hingestellte(s) Stueck(e)")
    print(f"  {len(befund.entfernt):4d} geloeschte(s) Messstueck(e)")
    print(f"  {len(befund.oeffnungen):4d} Tuer(en)/Fenster/Durchgang")
    print(f"  {len(befund.raumnamen):4d} Raumname(n)")
    if befund.gezeichnete_ecken:
        print(f"  {len(befund.gezeichnete_ecken):4d} GEZEICHNETE Ecke(n) in "
              f"{befund.gezeichnete_waende} Wand/Waenden — NICHT uebernommen "
              f"(eigene Welle: sie aendern Raeume, Flaechen und die Zahlen im "
              f"Businessplan)")
    if befund.entfernt:
        print("")
        print("  Geloescht heisst: die Messung bleibt in data/ausstattung.json")
        print("  stehen, nur die Anzeige unterdrueckt sie. Wenn seit dieser")
        print("  Sicherung NEU gemessen wurde, steht das Neue hier ebenfalls —")
        print("  dann die betreffende Zeile aus data/gesetzt.json loeschen.")
        for k in befund.entfernt[:12]:
            print(f"    · {k}")
        if len(befund.entfernt) > 12:
            print(f"    · … und {len(befund.entfernt) - 12} weitere")
    for w in befund.warnungen:
        print(f"  WARNUNG: {w}")
    print("")
    if not schreibe:
        print("Trockenlauf — es wurde NICHTS an data/gesetzt.json geaendert.")
        print(f"Uebernehmen mit:  python tools/uebernimm-bearbeitung.py "
              f"\"{quelle}\" --schreibe")


def schrumpfung(alt: dict, neu: Befund) -> list[str]:
    """Was in der bisherigen `gesetzt.json` steht und in der neuen fehlen wuerde.

    Uebernahme ist ersetzend je Abschnitt — aber NIE stumm schrumpfend. Wer
    versehentlich eine aeltere Sicherung einspielt, verlaere sonst die Arbeit
    aus der neueren, ohne dass es jemand sagt.
    """
    verlust: list[str] = []
    paare = [("verschiebungen", {e.get("id") for e in alt["verschiebungen"]},
              {e["id"] for e in neu.verschiebungen}),
             ("neue_stuecke", {e.get("id") for e in alt["neue_stuecke"]},
              {e["id"] for e in neu.neue_stuecke}),
             ("entfernt", set(alt["entfernt"]), set(neu.entfernt)),
             ("oeffnungen", {o.get("id") for o in alt["oeffnungen"]},
              {o["id"] for o in neu.oeffnungen}),
             ("raumnamen", set(alt["raumnamen"]), set(neu.raumnamen))]
    for name, alte, neue in paare:
        weg = sorted(x for x in alte - neue if x is not None)
        if weg:
            verlust.append(f"{name}: {len(weg)} Eintrag/Eintraege fielen weg "
                           f"({', '.join(str(x) for x in weg[:3])}"
                           f"{' …' if len(weg) > 3 else ''})")
    return verlust


def schreibe_gesetzt(befund: Befund, ziel: Path, quelle: Path,
                     auch_entfernen: bool) -> None:
    alt = ex.lade_gesetzt(ziel)
    verlust = schrumpfung(alt, befund)
    if verlust and not auch_entfernen:
        raise SystemExit("\n".join([
            "",
            f"ABBRUCH — {ziel} verloere Eintraege:",
            *[f"    · {z}" for z in verlust],
            "",
            "Vermutlich ist das eine AELTERE Sicherung als die zuletzt",
            "uebernommene. Wenn das Absicht ist:",
            f"    python tools/uebernimm-bearbeitung.py {quelle} --schreibe --auch-entfernen",
        ]))
    inhalt = {
        "_stand": {
            "quelle": quelle.name,
            "uebernommen": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "werkzeug": "tools/uebernimm-bearbeitung.py",
        },
        "verschiebungen": befund.verschiebungen,
        "neue_stuecke": befund.neue_stuecke,
        "entfernt": befund.entfernt,
        "oeffnungen": befund.oeffnungen,
        "raumnamen": befund.raumnamen,
    }
    ziel.parent.mkdir(parents=True, exist_ok=True)
    ziel.write_text(json.dumps(inhalt, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"geschrieben: {ziel}")
    print("Jetzt neu exportieren:  python tools/export_blueprint.py")


def nur_ecken(pfad: Path) -> int:
    """Nur die Hash-Treue der Ecken pruefen — fuer das Gate und fuer den
    schnellen Blick auf eine fremde Datei. Exit 1, sobald eine Ecke aus dem
    Hash faellt."""
    fp = lies_nutzerdatei(pfad)
    ecken = fp.get("corners") or {}
    untreu = [cid for cid, c in ecken.items()
              if cid != ex.ecken_id(float(c["x"]), float(c["y"]))]
    print(f"{len(ecken) - len(untreu)}/{len(ecken)} Ecken hash-treu in {pfad}")
    for cid in untreu[:5]:
        c = ecken[cid]
        print(f"  UNTREU {cid} bei {c['x']:.0f}/{c['y']:.0f} cm")
    return 1 if untreu else 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("datei", type=Path, nargs="?",
                   help="gesicherte Nutzerdatei; ohne Angabe die neueste aus dem "
                        "Download-Ordner")
    p.add_argument("--schreibe", action="store_true",
                   help="data/gesetzt.json wirklich schreiben (sonst Trockenlauf)")
    p.add_argument("--auch-entfernen", action="store_true",
                   help="erlaubt, dass Eintraege aus data/gesetzt.json wegfallen")
    p.add_argument("--ohne-sicherung", action="store_true",
                   help="keine Roh-Sicherung unter data/arbeitsstand-*.json anlegen")
    p.add_argument("--nur-ecken", type=Path, metavar="DATEI",
                   help="nur die Hash-Treue der Ecken pruefen und beenden")
    p.add_argument("--ziel", type=Path, default=STANDARD_ZIEL)
    p.add_argument("--ausstattung", type=Path, default=STANDARD_AUSSTATTUNG)
    p.add_argument("--walls", type=Path, default=STANDARD_WALLS)
    p.add_argument("--sicherung-ordner", type=Path, default=STANDARD_SICHERUNG)
    p.add_argument("--downloads", type=Path,
                   default=Path.home() / "Downloads")
    args = p.parse_args()

    if args.nur_ecken:
        return nur_ecken(args.nur_ecken)

    quelle = args.datei or neueste_nutzerdatei(args.downloads)
    if quelle is None:
        print(f"Keine Datei angegeben und keine {DOWNLOAD_MUSTER} in "
              f"{args.downloads} gefunden.")
        print("In der Doppelklick-Datei auf 'Als Datei sichern' druecken — die "
              "Datei landet im Download-Ordner.")
        return 1
    if not quelle.exists():
        print(f"fehlt: {quelle}")
        return 1

    fp = lies_nutzerdatei(quelle)

    # ZUERST sichern, dann denken: eine Roh-Sicherung, die erst nach der
    # Klassifikation entsteht, fehlt genau dann, wenn die Klassifikation
    # abbricht — also im einzigen Fall, in dem sie wirklich gebraucht wird.
    sicherung = None
    if not args.ohne_sicherung:
        sicherung = sichere_roh(quelle, args.sicherung_ordner,
                                datetime.now().strftime("%Y-%m-%d"))

    hoechste = plan_fassung()
    fassung = fp.get("formatVersion") or 1
    if fassung > hoechste:
        print(f"\nABBRUCH — {quelle} stammt aus einer neueren Fassung des Planers "
              f"(Format {fassung}, dieses Werkzeug kennt {hoechste}).")
        print("Sie wird NICHT uebernommen: die unbekannten Felder gingen dabei")
        print("still verloren. Bitte das Projekt aktualisieren.")
        if sicherung:
            print(f"Die Datei liegt unveraendert als {sicherung}.")
        return 1

    befund = Befund()
    pruefe_ecken(fp, ecken_der_quelle(args.walls), befund)

    if fassung < 2:
        # Fassung 1 kennt weder `id` noch `quelle` noch `oeffnungen`. Ein
        # verschobenes Stueck ist darin von einem gemessenen NICHT zu
        # unterscheiden — es saehe aus wie ein geloeschtes plus ein neues, und
        # der `beleg` wanderte still an die falsche Stelle. Raumnamen gibt es
        # dagegen seit Fassung 1, die kommen mit.
        klassifiziere_raumnamen(fp, befund)
        befund.warnungen.append(
            "Fassung 1: diese Datei KANN keine gesetzten Moebel und keine "
            "Oeffnungen tragen (die Felder gab es noch nicht) — uebernommen "
            "werden nur Raumnamen.")
    else:
        klassifiziere_ausstattung(fp, kennungen_der_quelle(args.ausstattung), befund)
        klassifiziere_oeffnungen(fp, befund)
        klassifiziere_raumnamen(fp, befund)

    bericht(befund, fassung, quelle, sicherung, args.schreibe)

    if befund.gewanderte_ecken:
        print("")
        print("ABBRUCH — in dieser Datei wurde GEMESSENE Geometrie verschoben:")
        for z in befund.gewanderte_ecken[:8]:
            print(f"    · Ecke {z}")
        if len(befund.gewanderte_ecken) > 8:
            print(f"    · … und {len(befund.gewanderte_ecken) - 8} weitere")
        print("")
        print("Die Ecken-Kennung ist der Hash ihrer Koordinate. Faellt eine Ecke")
        print("aus dem Hash und stand ihre Kennung in den Quellen, dann ist das")
        print("eine Aussage ueber das Aufmass — und die darf nur die PDF machen")
        print("(Nur Buero.pdf, Projekt-DNA). Es wurde NICHTS uebernommen.")
        print("")
        print("Wenn die Wand wirklich anders steht: nachmessen und")
        print("data/walls.json aendern, nicht den Grundriss im Planer ziehen.")
        return 1

    if args.schreibe:
        schreibe_gesetzt(befund, args.ziel, quelle, args.auch_entfernen)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
