# Halle-400-Planer — Projekt-DNA

## ⛔ OBERSTES PRINZIP: DIE PDF IST DIE GRUNDWAHRHEIT (User-Direktive 2026-07-24, „die Genauigkeit ist die Essenz")

**`C:\Users\dania\Desktop\Nur Büro.pdf` ist die ALLEINIGE Grundwahrheit der Halle-400-Geometrie.**
Verdrahtet als `PDF_STANDARD` in `tools/extract_plan.py` — alle Werkzeuge lesen von dort.

**Maßliche Genauigkeit gegen diese PDF hat oberste Priorität — sie ist die Essenz des gesamten Projekts.** Konkret, verbindlich für JEDE Session:

1. **Jede Wand, jeder Raum-Anker, jede Konturkante, jeder Maßstab wird aus dieser PDF GEMESSEN** — nie geraten, nie aus einer Vorarbeit geerbt ohne Gegenprüfung, nie erfunden, damit eine Kennzahl grün wird. Eine erfundene Wand sieht exakt aus und ist trotzdem falsch — das ist schädlicher als eine ehrliche Lücke.
2. **Vor jeder Aussage über die Geometrie (Vollständigkeit, „fertig", Wandzahl):** `python tools/compare_plan.py` laufen lassen und das Bild ANSEHEN. Zahlen in einer JSON können falsch und trotzdem plausibel sein — erst die Deckung mit dem gezeichneten Plan beweist die Extraktion. Nie „fertig" melden ohne dieses Sicht-Gate.
3. **Bei Konflikt gewinnt die PDF**, nicht die zweite Nachkommastelle und nicht die bequeme Annahme. Der Plan ist freihändig GEZEICHNET, nicht konstruiert: die Wandachse ist die belegungsgewichtete Mittellinie des Duktus, nicht die Pixelkante. Zwei Nachkommastellen suggerieren eine Präzision, die das Original nicht hat. **Gilt auch für die ANZEIGE** (T6): `Dimensioning.cmToMeasure` rundet Meter auf Zentimeter (`3.63 m`), nicht auf Millimeter (`3.625 m`) — die Geometrie ist in cm gemessen, eine dritte Nachkommastelle wäre Scheingenauigkeit.
4. **Was die PDF NICHT hergibt, wird NICHT geraten, sondern explizit als externer Wert gekennzeichnet.** Ein Grundriss enthält keine Wandhöhe → `wallHeight = 300 cm` ist eine gesetzte Nutzer-Angabe (Configuration, `Blueprint3DAppBase.tsx`), kein Messwert aus der PDF. Jeder solche Wert trägt seine Herkunft im Kommentar.
5. **Übernommene Zahlen zuerst gegen die Wirklichkeit prüfen, dann anwenden** — eine geerbte Kalibrierung ist eine Behauptung, kein Messwert (der Bezugsrahmen 78×15 m wurde erst korrekt, als er ÜBER den Plan gelegt statt benutzt wurde).

## Werkzeugkette (CWD = halle400-planer)

```
python tools/extract_plan.py       # Text-Anker + Maßstab aus der PDF -> data/plan-geometry.json
python tools/measure_walls.py      # Trennwand-Kandidaten aus dem Rasterbild
python tools/build_walls.py        # kuratierte Wandliste + Außenkontur -> data/walls.json
python tools/export_blueprint.py   # -> app/public/plaene/halle400.json (blueprint3d-Schema, cm)
python tools/compare_plan.py       # -> data/vergleich.png : Original vs. Nachbildung ANSEHEN
cd app && ./node_modules/.bin/next build && cp out/de.html out/index.html   # statischer Export (T6: Deutsch ist Standardsprache)
node tools/serve-local.mjs         # Auslieferung: PC http://localhost:3301/?plan=halle400
                                   #               Handy https://zen.taild936f8.ts.net:8458/?plan=halle400
node tools/pruefe-undo.mjs         # T5a: Rueckgaengig/Wiederholen am gerenderten Canvas (Exit 0 = bestanden)
```

E2E-Beweis (der einzige, der die Auslieferung wirklich prüft):
```
curl -s http://localhost:3301/plaene/halle400.json | python -c "import sys,json;d=json.load(sys.stdin);f=d['floorplan'];print(len(f['corners']),len(f['walls']))"
```
Stand 2026-07-24 nach T2d: SOLL `76 100`, y-min −352 cm (Aufzug-Vorbau ausgeliefert).

## Hintergrund

Vollständige Befunde, Schwellen-Begründungen und Negativbefunde: `docs/plan-befunde.md`.
Datenmodell (roomMeta, Room-UUID, blueprint3d-Schema): `docs/datenmodell.md`.
