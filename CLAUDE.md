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
                                   #        BRICHT AB, wenn die Zieldatei Arbeit traegt, die die
                                   #        Quellen nicht hergeben (W5-Waechter). --verwerfe-setzungen
                                   #        wirft sie ausdruecklich weg, --ohne-gesetzt laesst die
                                   #        Setzungs-Schicht aus.
python tools/uebernimm-bearbeitung.py            # W5: Bearbeitung zurueck ins Projekt. Ohne Argument
                                   #        die neueste Halle400-Plan-*.json aus dem Download-Ordner
                                   #        (der Handy-Weg). TROCKENLAUF ist der Standard.
python tools/uebernimm-bearbeitung.py --schreibe # -> data/gesetzt.json (fuenf getrennte Abschnitte)
node tools/pruefe-uebernahme.mjs   # W5: der Rueckweg — 51 Pruefungen OHNE Browser (der Kern wird
                                   #        ueber buendel-kern.mjs in node geladen, gemessen wird an
                                   #        Floorplan.loadFloorplan selbst). Haerteste Probe:
                                   #        --ohne-gesetzt ist byte-identisch mit
                                   #        git show HEAD:app/public/plaene/halle400.json
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
node tools/pruefe-tueren.mjs      # W4: TUEREN, FENSTER, DURCHGAENGE — 123 Pruefungen in
                                  #        BEIDEN Welten. Haerteste Probe: Wand teilen, die
                                  #        Oeffnung muss auf der richtigen Haelfte landen —
                                  #        mit abgeschalteter Versoehnung MUSS dieselbe
                                  #        Pruefung FEHLSCHLAGEN.
sh tools/alle-gates.sh            # alle Pruefwerkzeuge nacheinander, je ein Ergebnis
                                  #        (SEQUENTIELL — nebeneinander stoeren sie sich)
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

### „Bearbeiten" wechselt die Ansicht NICHT (W7, 2026-07-27)

Nutzerwunsch, woertlich: *„wenn ich bearbeiten klicke soll die ansicht dieselbe
sein wie die zuletzt angesehene"*. Bis W6 sprang der Schalter in den Grundriss
und beim Ausschalten zurueck aufs Blatt — eine Annahme aus W1. Seither schaltet
er **nur** die Werkzeuge; welche Ansicht vorn ist, entscheiden allein
„Grundriss" und „Axonometrie". Vier Folgen:

1. **In der Axonometrie sind die Werkzeuge nicht zu sehen** — nicht, weil jemand
   sie ausblendet, sondern weil Werkzeugleiste und Palette IM Grundriss-Umschlag
   liegen und dessen Sichtbarkeit erben. Ein toter Knopf kann so gar nicht
   entstehen. An ihrer Stelle steht `#arbeitshinweis`: *„Bearbeiten ist an —
   gezeichnet wird im Grundriss."* Er liegt im Blatt und erbt dessen
   Sichtbarkeit ebenso.
2. **Drei Speicher-Schluessel statt zwei:** `…:plan:`, `…:bearbeiten:` und neu
   `…:ansicht:`. Zwei unabhaengige Angaben brauchen zwei Schluessel — sie in
   einen zu legen hiesse, die abgeschaffte Kopplung durch die Hintertuer wieder
   einzufuehren. „Zuruecksetzen" loescht **alle drei** (M7 bleibt gueltig).
3. **Wer eine Rueckfrage aus dem Grundriss-Umschlag zeigt, muss dorthin
   wechseln.** `btnStandZurueck` sitzt in der Standleiste und ist auch in der
   Axonometrie erreichbar; ohne den ausdruecklichen Wechsel fragte etwas
   Unsichtbares. Derselbe Fallstrick traf `pruefe-planer-datei.mjs` G10.
4. **Jede Pruefung, die bearbeiten will, braucht seither ZWEI Griffe**
   (Schalter + Grundriss) — genau wie eine Hand. `pruefe-haertung.mjs` buendelt
   das in `bearbeitenAn`.

K3 bleibt unberuehrt: `body.bearbeitet` allein macht die Zeichenflaeche scharf.
Dass sie das nun auch tut, waehrend das Blatt vorn ist, aendert nichts — die
ruhende Ansicht ist `visibility:hidden` und nimmt keinen Zeiger an.

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

## Tueren, Fenster, Durchgaenge (W4, 2026-07-26)

Im Werkzeug **Tueren & Fenster** zeigt der Zeiger auf eine Wand, eine
Geister-Oeffnung erscheint auf ihrer Achse, ein Klick setzt sie. Ziehen
verschiebt sie ENTLANG ihrer Wand — nie quer, nie auf eine andere; ein
Wandwechsel ist ein Loeschen plus ein Setzen und sieht auch so aus. **Q** wendet
den Anschlag, **E** die Aufschlagseite (dieselben Tasten wie das Moebeldrehen —
welche Bedeutung sie haben, entscheidet das Werkzeug). Geloescht wird ueber das
vorhandene Loeschen-Werkzeug mit seiner Rueckfrage („diese Tuer (0,88 m breit)").
Sechs Festlegungen:

1. **`wandId` ist der Primaerschluessel, nie eine Objektreferenz** — wie ueberall
   in diesem Planer, seit ein Rueckgaengig den Grundriss komplett neu laedt.
2. **`lage` ist ein absolutes Mass in cm** von der START-Ecke bis zur MITTE, kein
   Bruchteil. Wird die Wand verlaengert, bleibt das Mass, nicht das Verhaeltnis.
3. **`anker` ist eine ABLEITUNG**, bei jedem Schreiben neu gerechnet und NUR in
   der Versoehnung gelesen. Ohne ihn waeren Wand-Teilung, Wand-Entfernung und
   Neu-Export unrettbar: **in dieser Pipeline ueberlebt keine Kennung ein
   Nachmessen — die einzige dauerhafte Identitaet einer Wand ist ihre Geometrie.**
4. **`Floorplan.versoehneOeffnungen()` laeuft am Ende jedes `update()`** und ist
   damit genau dann da, wenn eine Kennung kippt. Findet sie keine Ersatzwand,
   gilt die Oeffnung als `verwaist`: nicht gezeichnet, aber auch **nicht still
   entsorgt** — der Blattkopf sagt es.
5. **Ueberlappung zweier Oeffnungen ist VERBOTEN.** Das kehrt die Regel aus W2
   („keine Kollisionspruefung fuer Moebel") bewusst um, und zwar aus einem
   anderen Grund: ein Stuhl unter einem Tisch ist eine echte Aufstellung, zwei
   ineinander liegende Tueren sind keine Bauaussage, sondern ein Fehlgriff — die
   Wand liesse sich daraus auch nicht mehr zeichnen.
6. **Keine Hoehe.** Ein Grundriss enthaelt keine (Projekt-DNA Punkt 4). Die
   Axonometrie schneidet die Waende auf 1,16 m und **sagt das** im Blattkopf,
   sobald mindestens eine Oeffnung gesetzt ist.

In der **Axonometrie** ist eine Oeffnung schlicht: die Wandkacheln ueber ihrem
Intervall entstehen gar nicht erst (`axo-szene.js`, `wandStuecke`). Kein Eingriff
in `axo-zeichnen.js`, keiner in die Raumableitung. Ein `fenster` mit `bruestung`
laesst darunter einen Bruestungsblock stehen — sonst saehe es aus wie ein
Durchgang. **Gemessen wird das ueber die FLAECHE und das VOLUMEN der Wandkacheln,
nicht ueber ihre ANZAHL:** eine Oeffnung in der Mitte einer 10-m-Wand zerlegt
[0,10] in [0,4.5] und [5.5,10] — bei 3,2 m Kachelbreite sind das zweimal zwei
Kacheln, die Zahl bleibt also gleich.

**Standardmasse** (`OEFFNUNGS_VORLAGEN` in `src/model/floorplan.ts`): Tuer 87,5 ·
Doppeltuer 175 · Fenster 125 (Bruestung 90) · Durchgang 100 cm. Alles GESETZTE
Annahmen — die PDF zeigt Waende, keine Tuerblaetter. 87,5 cm ist das verbreitete
Baurichtmass einer Tueroeffnung (Reihe 62,5 / 75 / 87,5 / 100 / 112,5 cm); eine
DIN-Nummer steht bewusst NICHT dabei, eine erfundene Norm saehe belegt aus.

**Fassung 3** des Speicherformats. Eine Datei aus Fassung 1 oder 2 laedt weiter,
eine aus Fassung 4 wird ehrlich abgelehnt statt halb geoeffnet.

## Die Härtung (W6, 2026-07-26) — was fünf grüne Wellen nicht gesehen haben

Ein Gegner hat die fertige Datei **bedient** statt gelesen und dabei gefunden,
was 411 Prüfungen nicht abdeckten. Die Lehre steht über allem Einzelnen:

> **Die Messgröße begrenzt die Schärfe jeder Prüfung.** `element.hidden` sagt
> nur, ob DIESES Attribut gesetzt ist — nichts über `display:none` aus einer
> Medienabfrage, nichts über einen unsichtbaren Vorfahren. `paletteSichtbar()`
> meldete `true` für eine Palette, die gar nicht zu sehen war, und 67 Prüfungen
> fussten darauf. Alle Sichtbarkeits-Messungen laufen seither über
> `checkVisibility()` bzw. `locator.isVisible()`.
>
> Und: **`dispatchEvent` ist keine Hand.** Es ruft die Zuhörer eines Elements
> direkt auf und fragt nie, ob dieses Element überhaupt getroffen werden kann.
> Deshalb benutzt `tools/pruefe-haertung.mjs` `page.mouse` — nur das geht durch
> die Treffer-Ermittlung des Browsers.

Sieben Festlegungen, die daraus geworden sind:

1. **Scharf erst mit „Bearbeiten"** (K3). `#plan canvas{pointer-events:none}`,
   aufgehoben allein durch `body.bearbeitet`. Der Kern hört Maus, Rad und Finger
   AM CANVAS ab — nimmt es keine Zeiger-Ereignisse an, erreicht ihn keines.
   Ansehen und Zoomen bleiben: die **Lese-Navigation** hängt am Umschlag
   (`#plan`) und ruft ausschliesslich `zoomeAufPunkt` / `verschiebeAnsicht`.
2. **„Laden" fragt** (K1) — dieselbe Rückfrage wie „Zurücksetzen". Vorher ersetzte
   es 292 Stück / 100 Wände durch 0 / 4, leerte die Historie und überschrieb
   sofort den Speicher.
3. **Die Formprüfung prüft ZAHLEN** (K2): `Number.isFinite` und ±100 000 cm für
   jede Ecke, jedes Mass, jede Öffnung. Vorher wurden `null` und `"abc"`
   angenommen, `1e8` warf mitten im Laden, `1e12` antwortete nach 68 400 ms
   nicht mehr. Das Laden ist zusätzlich **atomar**: ein Fehler rollt auf den
   Stand von vorher zurück.
4. **Zwei Fenster überschreiben sich nicht** (K4): vor jedem Schreiben wird der
   abgelegte Zeitstempel mit dem eigenen verglichen; bei Abweichung wird NICHT
   geschrieben, sondern gefragt. Das `storage`-Ereignis ist die Höflichkeit,
   nicht der Schutz — ob es unter `file://` feuert, ist nicht verbürgt.
5. **Die Herkunft erreicht die Axonometrie** (M1). `quelle` kam in `src/axo/*.js`
   vorher NULL mal vor; ein gekipptes Stück ergab exakt dieselbe Prüfsumme.
   Gesetzte Körper treten jetzt zum Bühnengrund hin zurück
   (`DARSTELLUNG.gesetztRueckzug`) und tragen eine gestrichelte Kontur — im
   Farbklima des Blattes, keine Signalfarbe.
6. **Wände tragen `quelle`** (M2, Standard `gemessen`; `Corner.move` und das
   Zeichnen setzen `gesetzt`). Weil eine GELÖSCHTE Wand kein Feld mehr tragen
   kann, misst die Doppelklick-Datei zusätzlich **geometrisch** gegen den
   eingebauten Plan: liegt an der Mitte einer gemessenen Wand noch Mauerwerk?
   Über die Kennung ginge es nicht — eine geteilte Wand trägt zwei neue.
7. **Der Ausdruck ist ein Blatt** (M5): `@media print` (A4 quer), Bedienelemente
   weg, Titel/Datum/Massstabs-Aussage und die **Herkunfts-Fussnote** darauf. Sie
   fiel unter 900 px weg — und ein A4-Blatt ist bei 96 dpi rund 794 px breit.

Kleineres, ebenfalls geschlossen: Masse stehen deutsch da (`5,12 m`, feste
Stellenzahl, G1) · der Ladehinweis zählt am MODELL statt in der Datei (G2) ·
fremde `items` gehen beim Sichern nicht mehr verloren (G4) · `beforeunload` bei
ungesichertem Zug (M6) · „Zurücksetzen" löscht BEIDE Speicher-Schlüssel und
stellt den Auslieferungszustand her (M7) · ein Stand desselben Plans an einem
anderen Ablageort wird beim Start angeboten (M8).

**Offen und bewusst nicht geschlossen:** Möbel und Türen per Finger ziehen; auf
dem BILDSCHIRM bleibt die Fussnote unter 900 px verborgen (die Zähler im
Blattkopf tragen die Aussage dort). Beides gehört in die Handy-Welle.

## Der Rueckweg: die Bearbeitung zurueck ins Projekt (W5, 2026-07-26)

Der Export erzeugt `app/public/plaene/halle400.json` NEU. Zwei Dinge verhindern,
dass er die Bearbeitung des Nutzers ueberschreibt:

1. **Der WAECHTER laeuft vor jedem Schreiben** (`pruefe_zieldatei`). Findet er in der
   vorhandenen Zieldatei Arbeit, die die Quellen nicht hergeben — Moebel mit
   `quelle: 'gesetzt'`, Oeffnungen, hash-untreue Ecken, Raumnamen — bricht er ab und
   schreibt NICHTS, mit einer Anleitung in Alltagssprache. Wegwerfen geht nur
   ausdruecklich: `--verwerfe-setzungen`. Stiller Verlust ist damit unmoeglich.
2. **`data/gesetzt.json` wird ganz zuletzt ADDITIV aufgelegt** (`wende_gesetzt_an`).
   Fuenf getrennte Abschnitte — in EINEM Eimer waere ein verschobenes Messstueck von
   einem neu hingestellten nicht mehr zu trennen, und der Export schriebe es zweimal.

Der `beleg` ist die Trennschaerfe: `gesetzt` MIT `beleg` = verschobenes Messstueck,
`gesetzt` OHNE = neu hingestelltes. Ein verschobenes Stueck fliesst nie als neues
zurueck und nie zurueck in `data/ausstattung.json` — dort steht, wo es GEMESSEN
wurde. `lade_ausstattung` bleibt unangetastet: flosse der Rueckweg durch sie, machte
der naechste Lauf aus jeder Setzung still ein Aufmass (Standard beim Laden ist
`'gemessen'`, `floorplan.ts:829`).

Zwei Dinge fliessen NICHT zurueck. Eine **gezeichnete** Wand wird nur gezaehlt — sie
aendert Raumableitung, Flaechen und damit die Zahlen im Businessplan (eigene Welle).
Eine **verschobene gemessene** Ecke fuehrt zum harten ABBRUCH mit Nennung der Ecke:
die Ecken-Kennung IST der Hash ihrer Koordinate; wer sie zieht, behauptet etwas ueber
das Aufmass — und das darf nur die PDF.

Jede Uebernahme legt die Nutzerdatei unveraendert als `data/arbeitsstand-<datum>.json`
ab und ueberschreibt eine vorhandene Sicherung NIE. Der Trockenlauf ist der Standard;
`--schreibe` schreibt wirklich, `--auch-entfernen` erlaubt eine schrumpfende
Uebernahme.

## Hintergrund

Vollständige Befunde, Schwellen-Begründungen und Negativbefunde: `docs/plan-befunde.md`.
Datenmodell (roomMeta, Room-UUID, blueprint3d-Schema): `docs/datenmodell.md`.
Bauplaene der letzten Wellen: `docs/plan-w4-oeffnungen.md`, `docs/plan-w5-rueckweg.md`.
