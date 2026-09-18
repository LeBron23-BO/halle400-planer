"""
DIE EINRICHTUNG DES ZIMMERGESCHOSSES — Moebel und Namen in den Plan einbauen.

    python tools/hotel_einrichten.py            # baut ein und schreibt hotel400.json
    python tools/hotel_einrichten.py --probe    # rechnet alles durch, schreibt NICHTS

WARUM DIESES WERKZEUG UEBERHAUPT EXISTIERT
Die Moebel entstehen an drei verschiedenen Orten: gemessen aus der Handskizze
(data/hotel/moebel-westkopf.json), vorgeschlagen nach ueblichen Massen
(moebel-vorschlag.json) und die Namen (labels-ergaenzung.json). Wer sie von
Hand in den Plan kopiert, verliert frueher oder spaeter eine Herkunft — und
eine Position ohne Herkunft sieht exakt aus, ohne es zu sein.

FAIL-CLOSED, NICHT GUTMUETIG
Jede Pruefung hier bricht ab, statt zu reparieren. Ein Werkzeug, das einen
unbekannten Moebeltyp still weglaesst, liefert einen Plan, der vollstaendig
AUSSIEHT. Genau das darf einer Bank nicht passieren.

DIE AUSNAHME FUER DEN AUFZUG IST BEGRUENDET
Aufzugsschacht und Vorbau liegen VOR der Nordfassade — sie sind ein Anbau und
im Bestandsaufmass darum nicht enthalten. Sie duerfen als einzige ausserhalb
der Gebaeudekontur liegen; jedes andere Stueck draussen ist ein Messfehler.
"""
import json
import sys
from pathlib import Path

WURZEL = Path(__file__).resolve().parent.parent
PLAN = WURZEL / "app/public/plaene/hotel400.json"
QUELLEN = [
    WURZEL / "data/hotel/moebel-westkopf.json",
    WURZEL / "data/hotel/moebel-vorschlag.json",
]
LABELS = WURZEL / "data/hotel/labels-ergaenzung.json"

# Dieselbe Liste wie AusstattungTyp in src/model/floorplan.ts. Sie steht hier
# ein zweites Mal, weil Python das Typescript nicht liest — und wird darum
# gegen die Quelle geprueft, statt ihr zu vertrauen.
ERLAUBT = {
    "tisch", "rundtisch", "stuhl", "schrank", "wc", "waschbecken", "kochfeld",
    "pflanze", "treppe", "aufzug", "flaeche", "matte", "geraet", "liege",
    "bett", "nachttisch", "dusche", "tresen",
}
KONTUR = (0.0, -100.0, 7800.0, 1530.0)   # x_min, y_min, x_max, y_max in cm
DRAUSSEN_ERLAUBT = {"aufzug", "flaeche"}


def fehler(text):
    print(f"ABBRUCH: {text}")
    sys.exit(1)


def typen_gegen_quelle_pruefen():
    """Die doppelte Typenliste gegen src/model/floorplan.ts halten."""
    quelle = (WURZEL / "src/model/floorplan.ts").read_text(encoding="utf-8")
    fehlend = sorted(t for t in ERLAUBT if f"'{t}'" not in quelle)
    if fehlend:
        fehler(f"Diese Typen kennt src/model/floorplan.ts nicht: {fehlend}")
    return len(ERLAUBT)


def stueck_pruefen(e, herkunft):
    for feld in ("typ", "x", "y", "breite", "tiefe"):
        if feld not in e:
            fehler(f"{herkunft}: einem Stueck fehlt '{feld}' -> {e}")
    if e["typ"] not in ERLAUBT:
        fehler(f"{herkunft}: unbekannte Art '{e['typ']}'")
    if not str(e.get("beleg", "")).strip():
        fehler(f"{herkunft}: Stueck ohne Beleg -> {e.get('text', e['typ'])}")
    x0, y0, x1, y1 = KONTUR
    halb_b, halb_t = e["breite"] / 2, e["tiefe"] / 2
    draussen = (e["x"] - halb_b < x0 or e["x"] + halb_b > x1
                or e["y"] - halb_t < y0 or e["y"] + halb_t > y1)
    if draussen and e["typ"] not in DRAUSSEN_ERLAUBT:
        fehler(f"{herkunft}: '{e.get('text', e['typ'])}' liegt ausserhalb des Gebaeudes "
               f"({e['x']:.0f}/{e['y']:.0f})")
    return draussen


def main():
    probe = "--probe" in sys.argv
    anzahl_typen = typen_gegen_quelle_pruefen()

    plan = json.loads(PLAN.read_text(encoding="utf-8"))
    vorher_moebel = len(plan["floorplan"].get("ausstattung", []))
    vorher_namen = len(plan.get("labels", []))

    stuecke, draussen, je_quelle = [], 0, {}
    for q in QUELLEN:
        if not q.exists():
            print(f"  fehlt (uebersprungen): {q.name}")
            continue
        daten = json.loads(q.read_text(encoding="utf-8"))
        elemente = [e for e in daten.get("elemente", []) if isinstance(e, dict)]
        for e in elemente:
            if stueck_pruefen(e, q.name):
                draussen += 1
            e.setdefault("quelle", q.name)
        stuecke.extend(elemente)
        je_quelle[q.name] = len(elemente)

    namen = list(plan.get("labels", []))
    neue_namen = 0
    if LABELS.exists():
        erg = json.loads(LABELS.read_text(encoding="utf-8"))
        eintraege = erg.get("labels", erg if isinstance(erg, list) else [])
        nach_anker = {tuple(l.get("anker_cm", [])): i for i, l in enumerate(namen)}
        for l in eintraege:
            schluessel = tuple(l.get("anker_cm", []))
            if schluessel in nach_anker:
                namen[nach_anker[schluessel]] = l      # ersetzt den alten Namen
            else:
                namen.append(l)
                neue_namen += 1

    print(f"  Typen geprueft:  {anzahl_typen} (gegen src/model/floorplan.ts)")
    for name, n in je_quelle.items():
        print(f"  {name:<28} {n:>4} Stueck")
    print(f"  Ausserhalb (Anbau, erlaubt): {draussen}")
    print(f"  Moebel:  {vorher_moebel} -> {len(stuecke)}")
    print(f"  Namen:   {vorher_namen} -> {len(namen)}  (davon {neue_namen} neu)")

    if probe:
        print("  PROBE — nichts geschrieben.")
        return

    plan["floorplan"]["ausstattung"] = stuecke
    plan["labels"] = namen
    PLAN.write_text(json.dumps(plan, ensure_ascii=False, indent=1), encoding="utf-8")

    # Rueckleseprobe: geschrieben ist nicht dasselbe wie angekommen.
    zurueck = json.loads(PLAN.read_text(encoding="utf-8"))
    if len(zurueck["floorplan"]["ausstattung"]) != len(stuecke):
        fehler("Rueckleseprobe: die Moebel sind nicht angekommen.")
    if len(zurueck["labels"]) != len(namen):
        fehler("Rueckleseprobe: die Namen sind nicht angekommen.")
    print(f"  GESCHRIEBEN und zurueckgelesen: {len(stuecke)} Moebel, {len(namen)} Namen.")


if __name__ == "__main__":
    main()
