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
python tools/mess_kachel.py --von 27 --bis 37   # Lineal: Ausschnitt mit xy-Meterraster (A1..A4)
python tools/compare_plan.py       # -> data/vergleich.png : Original vs. Nachbildung ANSEHEN
cd app && ./node_modules/.bin/next build && cp out/de.html out/index.html   # statischer Export (T6: Deutsch ist Standardsprache)
node tools/serve-local.mjs         # Auslieferung: PC http://localhost:3301/?plan=halle400
                                   #               Handy https://zen.taild936f8.ts.net:8458/?plan=halle400
node tools/pruefe-undo.mjs         # T5a: Rueckgaengig/Wiederholen am gerenderten Canvas (Exit 0 = bestanden)
node tools/pruefe-ansicht.mjs      # T7: ganzer Grundriss im Bild + Zoom (Rechner UND Handy)
node tools/pruefe-ausstattung.mjs  # A1: Ausstattung gezeichnet, an der richtigen Stelle, Stufen schalten
node tools/pruefe-ausstattung-3d.mjs # A6: Koerper in 3D — auf dem Boden, im Gebaeude, undo-fest
node tools/pruefe-loeschen.mjs     # E1: Loeschen per Verweilen + Rueckfrage, Moebel-Fall richtungsgeprueft
node tools/pruefe-zeichnen.mjs     # E2: Ecken-Fang, Winkel-Raster (mit Gegenprobe 20 Grad), Escape
node tools/pruefe-touch.mjs        # E3: Langdruck + Tippen am Handy, echte TouchEvents, 2 Gegenproben
node tools/pruefe-kennungen.mjs   # W2-Fundament: Kennungen an Wand+Ausstattung, undo-fest,
                                  #        Moebel-Vorrang vor der Wand (mit Gegenprobe), gemessen/gesetzt
node tools/pruefe-ziehen.mjs      # W2: das MOEBELZIEHEN — 70 Pruefungen in BEIDEN Welten
                                  #        (Planer auf 3301 UND Doppelklick-Datei unter file://)
                                  #        --nur planer | --nur datei grenzt ein
node tools/pruefe-palette.mjs     # W3: die PALETTE — 66 Pruefungen in der Doppelklick-Datei
                                  #        (Stueck hineinziehen, gestrichelt, EIN Undo, Sichern/Laden)
                                  #        mit GEGENPROBE des Waechters: eine halbe Typ-Kette
                                  #        muss ERKANNT werden
node tools/pruefe-axonometrie.mjs  # X2/X3: 6 Gates — Raumableitung == Planer-Kern, Szene vollstaendig,
                                   #        Bild gezeichnet (mit Gegenprobe), Ansicht folgt dem Grundriss

# Die Doppelklick-Datei fuer die Bank — eine Datei, kein Netz, kein Server
node tools/baue-planer-datei.mjs   # -> Halle400-Modell.html (~670 KB): BEARBEITBAR (W1)
node tools/pruefe-planer-datei.mjs # 10 Gates unter file:// mit GESPERRTEM Netz + echtem Nutzerprofil

# Die reine ANSICHT (E4/X4) — Vorlaeufer, weiterhin baubar, aber nicht mehr das
# Auslieferungsziel. Ohne --ziel ueberschriebe sie die bearbeitbare Datei.
node tools/baue-bank-ansicht.mjs   --ziel /tmp/bank.html   # ~139 KB, nur Axonometrie
node tools/pruefe-bank-ansicht.mjs --datei /tmp/bank.html
```

## Die drei Ansichten (X1-X4, 2026-07-26)

Der Planer zeigt denselben Grundriss auf drei Arten: **2D**-Zeichner (hier wird
bearbeitet), **3D**-Modell und **Axonometrie** — die Planblatt-Ansicht fuer den
Businessplan. Dieselbe Axonometrie ist auch die Bank-Datei.

```
src/axo/axo-kontrakt.js   Farbklima, Projektion, Licht, Beschriftungs-Metrik
                          (Optik aus app/public/uebersicht.html, je Wert belegt)
src/axo/axo-zyklen.js     Raumflaechen aus den Waenden ableiten
src/axo/axo-szene.js      Plandaten -> Koerper (ein ausgezogenes Vieleck je Stueck)
src/axo/axo-zeichnen.js   Koerper -> Canvas-2D (Projektion, Maler, Fuehrungslinien)
```

Drei Festlegungen, die man kennen muss, bevor man hier etwas aendert:

1. **Hoehen kommen NICHT aus `axo-kontrakt.js`.** Sie stehen in
   `src/three/ausstattung.ts` (`OBERKANTE_CM` / `KOERPER_CM`) — dieselbe Tabelle,
   aus der die 3D-Ansicht baut, mit DIN-Belegen und der Doktrin, was NICHT
   gezeichnet wird (keine Stuhllehne, keine Treppensteigung, kein Tisch-Voll-
   koerper). Node-Werkzeuge lesen sie ueber `tools/lies-hoehen.mjs`, die
   React-Ansicht importiert sie. Frei ist allein die FARBE.
2. **Gestutzte Waende sind Absicht.** 1,16 m aussen / 0,94 m innen statt der
   gesetzten 300 cm — der Puppenhaus-Schnitt, der den Blick in die Raeume
   freigibt. Die Ansicht behauptet keine niedrige Halle, sie schneidet sie auf.
3. **In der Axonometrie wird nicht bearbeitet.** In einer schraegen Parallel-
   projektion trifft ein Klick keinen Punkt, sondern einen Sehstrahl; die
   Zielhoehe waere geraten. Bearbeitet wird in 2D, die Axonometrie folgt.

Planer-Ansicht und Bank-Datei benutzen dieselben vier Module — die Bank-Datei
setzt sie nur ohne Modulgrenzen aneinander, weil `file://` kein Nachladen
erlaubt. `pruefe-axonometrie.mjs` G1 misst die Raumableitung zusaetzlich gegen
`floorplan.getRooms()` im laufenden Planer: beide koennen nicht auseinander
laufen, ohne dass ein Gate rot wird.

**Messzugang:** `window.__planer` (gesetzt in `Blueprint3DAppBase.tsx`) gibt den
Pruefwerkzeugen die lebende blueprint3d-Instanz — damit ein Gate das Modell
fragen kann, statt aus Pixeln zu raten.

E2E-Beweis (der einzige, der die Auslieferung wirklich prüft):
```
curl -s http://localhost:3301/plaene/halle400.json | python -c "import sys,json;d=json.load(sys.stdin);f=d['floorplan'];print(len(f['corners']),len(f['walls']))"
```
Stand 2026-07-24 nach T2d: SOLL `76 100`, y-min −352 cm (Aufzug-Vorbau ausgeliefert).

## Die Doppelklick-Datei (W1, 2026-07-26)

`Halle400-Modell.html` ist seit W1 nicht mehr nur Ansicht, sondern **bearbeitbar**:
sie traegt den uebersetzten 2D-Kern (`tools/buendel-kern.mjs`), den Rechen-Teil von
three, die vier Axonometrie-Module und den gemessenen Plan — alles in einer Datei,
weil `file://` kein Nachladen erlaubt. Drei Dinge muss man dazu wissen:

1. **Der eingebaute Plan bleibt unangetastet.** Er ist die Grundwahrheit aus der
   PDF. Der Arbeitsstand des Nutzers liegt daneben (localStorage) und laesst sich
   mit einem Knopf verwerfen.
2. **`file://` ist EIN Ursprung fuer die ganze Festplatte** (gemessen): zwei Kopien
   der Datei in verschiedenen Ordnern teilten sich sonst einen Speicher. Der
   Schluessel traegt darum den Abdruck des eingebauten Plans UND den Ablageort.
   Der Platz ist knapp (~4,8 MB fuer ALLE `file://`-Seiten zusammen) und ein
   Fehlschlag ist still — die Datei meldet ihn deshalb sichtbar.
3. **`fireOnUpdatedRooms` sieht ein Verschieben NICHT.** `Floorplan.update()` laeuft
   nur bei neuer/entfernter Wand, beim Verschmelzen von Ecken und beim Laden
   (`floorplan.ts:207,216,352` · `corner.ts:298,329`); `Corner.move()` benachrichtigt
   nur seine Waende, und `verschiebeAusstattung`/`dreheAusstattung` niemanden. Wer
   eine Ansicht oder ein Sichern daran haengt, verliert genau das Ziehen. Die
   Doppelklick-Datei vergleicht deshalb nach jedem Zeigerende UND jedem Tastenende
   (Q/E drehen) den ausgeschriebenen Grundriss. Im PLANER ist die Luecke anders
   geschlossen — gemessen, nicht vermutet: `handleViewChange` ruft beim Wechsel auf
   3D wie auf Axonometrie `model.floorplan.update()`
   (`Blueprint3DAppBase.tsx:350,367`), und beide Ansichten sind dort mit dem
   2D-Zeichner nie gleichzeitig sichtbar. Ein Zug ist also spaetestens beim
   Hinsehen angekommen (`pruefe-ziehen.mjs` Gate g misst genau das, mit Gegenprobe).

**Messzugang:** `window.__planerDatei` (nur in dieser Datei) — Modellzahlen, Ecken
in Welt- UND Bildkoordinaten, Bild-Pruefsummen, Zeiger-Ereignisse.

## Moebel ziehen (W2, 2026-07-26)

Im Werkzeug **Verschieben** wird ein Moebel unter dem Zeiger gegriffen, folgt der
Bewegung und wird beim Loslassen abgelegt — im Planer wie in der Doppelklick-Datei,
beide aus derselben Quelle (`src/floorplanner/floorplanner.ts`). Fuenf Festlegungen:

1. **Alles laeuft ueber die KENNUNG, nie ueber eine Objektreferenz.** Ein
   Rueckgaengig laedt den Grundriss komplett neu; eine gemerkte Referenz waere
   danach eine Leiche, und jeder Zug daran ginge still ins Leere.
2. **Der Griff-Versatz wird beim Druecken festgehalten.** Ohne ihn spraenge das
   Stueck mit seiner Mitte unter den Zeiger — bei einer 3-m-Tischplatte um
   anderthalb Meter.
3. **Ein Zug = EIN Rueckgaengig-Schritt.** Den Schnappschuss zieht der KERN bei
   Zieh-Beginn (`zugGesichert`), genau wie beim Wand-Ziehen. Huellen ziehen KEINE
   eigenen.
4. **Einrasten** (`EINRAST_WAND_CM = 15`, `EINRAST_RASTER_CM = 5`): naeher als 15 cm
   an einer Wand legt sich der RAND buendig an und die Drehung uebernimmt den
   Wandwinkel — und zwar die der jetzigen am naechsten liegende der vier
   rechtwinkligen Lagen, damit ein laengs gestellter Tisch sich nicht quer dreht.
   Sonst wird auf 5 cm gerundet, immer auf ganze Zentimeter (Projekt-DNA Punkt 3).
   Abschaltbar ueber den Knopf „Einrasten". **KEINE Kollisionspruefung** — Moebel
   duerfen sich ueberlappen, in einer echten Planung tun sie das auch.
5. **Gedreht wird mit Q/E** (15°-Schritte, am Stueck UNTER DEM ZEIGER, auch mitten
   im Ziehen). Begruendung im Code (`dreheAktives`): es gibt in diesem Planer keine
   Auswahl, die einen Klick ueberdauert — ein Knopf in der Leiste braeuchte eine,
   denn auf dem Weg dorthin verlaesst der Zeiger das Moebel. Am Handy gibt es
   deshalb (noch) kein Drehen; dort ist auch das Ziehen von Moebeln offen.

Jedes gezogene oder gedrehte Stueck wird `quelle: 'gesetzt'`, wird im Grundriss
GESTRICHELT gezeichnet, und das Blatt sagt es im Kopf: „N Stueck frei gesetzt —
kein Aufmass" (nur wenn N > 0; der Fusshinweis zieht mit, sonst widerspraeche das
Blatt sich selbst).

## Stuecke hinstellen — die Palette (W3, 2026-07-26)

In der **Doppelklick-Datei** (nur dort) liegt im Bearbeiten-Zustand links eine
Palette. Ein Stueck wird daraus in den Grundriss gezogen und dort abgelegt: es
entsteht mit `quelle: 'gesetzt'`, frischer Kennung und Standardmass und rastet
mit DERSELBEN Rechnung ein wie ein gezogenes (`Floorplanner.stueckAblegen` ruft
`moebelEinrasten` aus W2). Fuenf Festlegungen:

1. **Die Vorschau kommt aus derselben Zeichenvorschrift wie der Grundriss**
   (`Floorplanner.zeichneVorschau` → `FloorplannerView.zeichneAusstattung`, nur
   mit getauschter Welt→Bild-Abbildung). Nachgemalt waere sie eine zweite
   Wahrheit ueber das Aussehen eines Zeichens.
2. **Was "im Grundriss" heisst, entscheidet `elementFromPoint`**, nicht das
   Rechteck des Canvas: die Zeichenflaeche ist bildschirmfuellend, Palette und
   Leisten liegen DARUEBER. Loslassen auf der Palette erzeugt nichts.
3. **Ein Ablegen = EIN Rueckgaengig-Schritt.** Der Schnappschuss wird erst
   gezogen, NACHDEM die Grenze geprueft ist — sonst gaebe es leere Schritte.
4. **`Floorplan.fuegeAusstattungHinzu`** ist der Einzel-Setter, den
   `setAusstattung` einmal ausdruecklich abgelehnt hat. Die alte Begruendung
   ("kein vom Nutzer Stueck fuer Stueck gepflegter Bestand") ist damit endgueltig
   widerlegt und im Code als widerlegt gekennzeichnet. `quelle: 'gesetzt'` ist
   fest verdrahtet: ein zur Laufzeit entstandenes Stueck kann nicht aus der PDF
   stammen.
5. **Am Handy gibt es die Palette nicht** (`@media (max-width:900px)`): das
   Hineinziehen laeuft ueber Maus-Ereignisse. Dieselbe offene Stelle wie beim
   Ziehen vorhandener Moebel (W2).

### Die NEUN Stellen einer Typ-Kette

Ein neuer Ausstattungs-Typ muss ueberall eingetragen werden. Fehlt eine Stelle,
ist der Fehler LAUTLOS und fuehrt in die Irre: der 2D-Zeichner ist **fail-open**
(`default:` malt jeden unbekannten Typ als Rechteck), Axonometrie, 3D und Export
sind **fail-closed**. Das Stueck steht dann im Grundriss und fehlt im Blatt.

| # | Stelle | Datei |
|---|---|---|
| 1 | `AusstattungTyp` | `src/model/floorplan.ts` |
| 2 | `OBERKANTE_CM` **mit Herkunft** | `src/three/ausstattung.ts` |
| 3 | `KOERPER_CM` (nur wenn nicht am Boden) | `src/three/ausstattung.ts` |
| 4 | `FARBE` (Blaustich `b−r ≥ 12`!) + `RUND` | `src/three/ausstattung.ts` |
| 5 | `AUSSTATTUNG_NAME` (deutscher Name) | `src/floorplanner/floorplanner.ts` |
| 6 | eigener `case` in `zeichneAusstattung` | `src/floorplanner/floorplanner_view.ts` |
| 7 | `AUSSTATTUNG_STIL` (sonst `bauformFuer → null`) | `src/axo/axo-kontrakt.js` |
| 8 | `ERLAUBTE_TYPEN` (sonst harter Abbruch) | `tools/export_blueprint.py` |
| 9 | ein Gate, das die halbe Kette rot meldet | `tools/pruefe-palette.mjs` |

Seit W3 ist der `default:`-Zweig in `zeichneAusstattung` **laut**: er meldet
einen unbekannten Typ EINMAL auf der Konsole (nicht je Bild — die Zeichenschleife
laeuft 60-mal je Sekunde) und zeichnet trotzdem weiter. `pruefe-palette.mjs`
beweist mit einer Attrappe, dass diese Meldung wirklich kommt und dass die
Zaehlung `szene.moebel === ausstattung` dabei auseinanderfaellt.

### Die drei neuen Arten und woher ihre Hoehe kommt

| Art | Name | Standardmass | Oberkante | Herkunft der Hoehe |
|---|---|---|---|---|
| `matte` | Matte | 180 × 60 cm | 2 cm | **gesetzte Annahme** — eine ausgerollte Gymnastik-/Yogamatte ist wenige mm bis rund 2 cm dick |
| `geraet` | Fitnessgeraet | 120 × 80 cm | 130 cm | **gesetzte Annahme** — Geraete streuen von 45 cm (Bank) bis ueber 220 cm (Seilzugturm); 130 cm ist die Mitte und bleibt unter Augenhoehe |
| `liege` | Liege | 200 × 70 cm | 65 cm (Koerper 8 cm) | **gesetzte Annahme** — Behandlungsliegen sind hoehenverstellbar, Herstellerangaben meist 60–85 cm |

Fuer keine der drei gibt es eine Norm — anders als beim Buerotisch (DIN EN 527-1)
oder Buerostuhl (DIN EN 1335). Sie stehen deshalb ehrlich als Annahme da. Eine
erfundene DIN-Nummer waere schlimmer als eine offene Annahme: sie saehe belegt
aus. Die Standardmasse sind verbreitete Handelsmasse (`AUSSTATTUNG_VORLAGEN` in
`src/model/floorplan.ts`) — ebenfalls gesetzt, aber nicht beliebig.

**Diese drei Arten kommen in KEINEM gemessenen Plan vor.** Sie entstehen
ausschliesslich dadurch, dass der Nutzer sie hinstellt, und tragen darum immer
`quelle: 'gesetzt'`. `app/public/plaene/halle400.json` bleibt unangetastet.

## Hintergrund

Vollständige Befunde, Schwellen-Begründungen und Negativbefunde: `docs/plan-befunde.md`.
Datenmodell (roomMeta, Room-UUID, blueprint3d-Schema): `docs/datenmodell.md`.
