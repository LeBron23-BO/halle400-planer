# Welle 4 — Türen, Fenster, Durchgänge (Bauplan)

Erarbeitet 2026-07-26, bevor eine Zeile Code entstand. Zwei Annahmen, mit denen
diese Welle gestartet war, haben sich am Code als **falsch** erwiesen — beide zum
Guten. Sie stehen hier zuerst, damit niemand sie erneut als Hindernis behandelt.

## Befund 1 — die Wand-Kennung überlebt das Ziehen

`src/model/wall.ts:83` setzt `this.id = id || Utils.guid()` **einmal beim Erzeugen**
und rechnet sie nie neu. `Corner.move` fasst nur `x`/`y` an (`corner.ts:150-163`).
Eine verschobene Wand behält also ihre Kennung, und ein Rückgängig fährt über
denselben Weg. Die Befürchtung, eine Tür verliere beim Wandzug ihren Anker, ist
gegenstandslos.

`kennungAusWand` (`floorplan.ts:173-175`) ist nur der Notnagel für Dateien **ohne**
`id` — und `app/public/plaene/halle400.json` ist so eine (0 von 100 Wänden tragen
eine). Dort lautet die Kennung `w-<c1[0:8]>-<c2[0:8]>`.

**Drei Fälle kippen die Kennung wirklich:**

- **(a) Wand-Teilung** — `corner.ts:326-331` erzeugt `newWall(this, wall.getEnd())`
  ohne `id`, danach `wall.setEnd(this)`. Die alte Wand behält ihre Kennung, ist aber
  KÜRZER: eine Tür bei 80 % der alten Länge liegt danach im Nichts.
- **(b) Wand-Entfernung** — `corner.ts:341-362` (`removeDuplicateWalls`), `corner.ts:296`.
- **(c) Neu-Export** — eine um 3 cm nachgemessene Wand bekommt neue Ecken-Prüfsummen
  und damit eine neue abgeleitete Kennung.

Daraus folgt die tragende Einsicht dieser Welle: **in dieser Pipeline überlebt keine
Kennung ein Nach-Messen. Die einzige dauerhafte Identität einer Wand ist ihre
Geometrie.** Der geometrische Reparatur-Anker unten ist deshalb kein Beiwerk,
sondern der Mechanismus.

## Befund 2 — die Axonometrie kann Öffnungen, an genau einer Stelle

`axo-szene.js:216-250` baut je Wand über `wandStuecke` (`:60-88`) eine Kachelreihe
von `y0 = 0` bis `y1 = wandAussen (1,16 m) | wandInnen (0,94 m)`
(`axo-kontrakt.js:115-120`). Eine Öffnung ist schlicht: **die Kacheln über dem
Öffnungs-Intervall gar nicht erst erzeugen.** Kein Eingriff in `axo-zeichnen.js`,
keiner in die Raumableitung.

## Datenmodell — parametrisch, mit Doppel-Anker

```ts
export type OeffnungsArt = 'tuer' | 'doppeltuer' | 'fenster' | 'durchgang'
export type Oeffnung = {
  id: string                       // Pflicht, wie AusstattungElement.id
  wandId: string                   // PRIMÄRSCHLÜSSEL: Wall.id, nie eine Objektreferenz
  lage: number                     // cm von der START-Ecke bis zur MITTE
  breite: number                   // cm, lichte Weite
  art: OeffnungsArt
  seite: 1 | -1                    // Aufschlagseite (Vorzeichen der Wand-Normalen)
  anschlag: 'anfang' | 'ende'      // wo das Band sitzt
  bruestung?: number               // cm, NUR fenster; fehlt = bis zum Boden
  quelle: 'gemessen' | 'gesetzt'
  anker: { x: number; y: number }  // ABGELEITETER Weltpunkt, nur zur Reparatur
}
```

Drei Festlegungen mit Begründung:

1. **`lage` absolut in cm, nicht als Bruchteil.** Eine Tür sitzt 12 cm von der Ecke,
   nicht bei 4 %. Wird die Wand gezogen, bleibt das Maß erhalten, nicht das
   Verhältnis (Projekt-DNA Punkt 3).
2. **`anker` ist eine ABLEITUNG, keine zweite Wahrheit.** Er wird bei jedem Schreiben
   aus `(wandId, lage)` neu berechnet und ausschließlich im Versöhnungs-Schritt
   gelesen. Ohne ihn sind die Fälle (a)/(b)/(c) unrettbar.
3. **Keine `hoehe`.** Ein Grundriss enthält keine (Projekt-DNA Punkt 4). Genau das
   sagt die Legende in der Axonometrie.

Abgelegt wird als `SavedFloorplan.oeffnungen?` — auf **derselben Achse wie
`ausstattung`** (`floorplan.ts:131`). Dadurch erben Öffnungen Speichern, Laden,
Rückgängig, den Datei-Export und die Axonometrie-Szene ohne eine weitere Zeile.
Das ist der ganze Architektur-Hebel dieser Welle.

## Die Reparatur-Naht

`floorplan.update()` (`:729-744`) ruft am Ende `versoehneOeffnungen()`. `update()`
läuft bei neuer und entfernter Wand, beim Verschmelzen von Ecken und beim Laden —
also genau in den Fällen (a), (b), (c).

Regel je Öffnung: Wand über `wandId` suchen. Fehlt sie **oder** liegt
`lage ± breite/2` außerhalb `[0, länge]`, dann über `anker` die nächste Wand
innerhalb `wandDicke + 25 cm` suchen und `wandId`/`lage` neu setzen. Findet sich
keine, `verwaist = true` setzen und die Öffnung **nicht** löschen — der Nutzer
erfährt es über die Leiste. Kosten: eine zweistellige Zahl Öffnungen × 100 Wände.

## Darstellung

**Grundriss** (`floorplanner_view.ts`, eigener Durchgang nach `:173`): über dem
Intervall ein Rechteck in Wanddicke mit dem Hintergrund gefüllt (unterbricht die
Wandlinie aus `drawWall:213-220`), zwei Laibungsstriche quer zur Wand, dann je Art —
`tuer` Türblatt als Strecke plus Viertelkreis-Aufschlagbogen, `doppeltuer` zwei
gespiegelte, `fenster` zwei dünne Parallelen längs, `durchgang` nur die Laibungen.
`quelle: 'gesetzt'` zeichnet Blatt und Bogen gestrichelt (`GESETZT_STRICH`).

**Axonometrie**: Wandkacheln über dem Intervall entfallen, die Öffnung geht über die
volle Schnitthöhe. Ein `fenster` mit `bruestung` lässt einen Brüstungsblock stehen.

**Legende**, nur wenn mindestens eine Öffnung gesetzt ist — sonst lernt der Leser,
über die Zeile hinwegzusehen:

> „M Öffnungen gesetzt. Die Ansicht schneidet die Wände auf 1,16 m; Türen und
> Fenster sind darum in der HÖHE nicht maßstäblich, nur in Lage und Breite."

## Bedienung

Werkzeug „Türen & Fenster" wählen; über einer Wand erscheint eine Geister-Öffnung in
der eingestellten Art und Breite, auf die Wandachse projiziert. Klick setzt sie,
Ziehen verschiebt sie **entlang ihrer Wand** — nie quer, nie auf eine andere; ein
Wandwechsel ist ein Löschen plus ein Setzen und soll auch so aussehen. Einrasten
nutzt denselben Schalter und dieselbe Schwelle wie das Möbel-Anlegen (15 cm):
Laibung bündig an die Ecke, oder Wandmitte, sonst 5-cm-Raster. Q wendet den
Anschlag, E die Aufschlagseite. Gelöscht wird über das vorhandene Löschen-Werkzeug
mit seiner Rückfrage („diese Tür (0,89 m breit)").

An einer Ecke wird die Öffnung auf `[breite/2, länge − breite/2]` geklemmt; ist die
Wand kürzer als die Breite, wird nicht gesetzt.

**Überlappung zweier Öffnungen ist verboten.** Das kehrt die Regel aus Welle 2
(„keine Kollisionsprüfung") bewusst um, und zwar aus einem anderen Grund: ein Stuhl
unter einem Tisch ist eine echte Aufstellung, zwei ineinander liegende Türen sind
keine Bauaussage, sondern ein Fehlgriff — die Wand ließe sich daraus auch nicht mehr
zeichnen.

## Gate `tools/pruefe-tueren.mjs`

Aufbau wie `pruefe-ziehen.mjs`, beide Welten, buchstabengleicher Ablauf.

| # | Prüfung | Gegenprobe |
|---|---|---|
| a | Tür gesetzt → im Modell UND als Wandunterbrechung im Bild | Klick neben jede Wand setzt nichts |
| b | Tür überlebt Rückgängig + Wiederholen an derselben Wand, gleiche Lage | ein Rückgängig direkt nach dem Setzen entfernt sie wieder |
| c | Wand um 200 cm verschieben → Wand-Kennung und Lage unverändert | das Bild hat sich geändert (sonst misst b nur Stillstand) |
| d | Wand teilen → die Öffnung liegt danach auf der Hälfte, die sie geometrisch enthält | mit abgeschalteter Versöhnung muss dieselbe Prüfung FEHLSCHLAGEN |
| e | Wand löschen → Öffnung gilt als verwaist, wird nicht gezeichnet, nicht still entsorgt | die Nachbarwand behält ihre Öffnung |
| f | Axonometrie: Wandstück-Zahl sinkt, Bild-Prüfsumme ändert sich | ohne Öffnung bleibt die ruhende Prüfsumme identisch |
| g | zwei Öffnungen überlappen nicht — Setzen wird abgelehnt | 1 cm daneben wird angenommen |
| h | alte Datei ohne Öffnungen (Fassung 1 und 2) lädt weiter, 76 Ecken / 100 Wände | Fassung 4 wird abgelehnt, der offene Plan bleibt unversehrt |
| i | Löschen über Verweilen entfernt sie, Rückgabewert `true` | Abbrechen entfernt nichts |
| j | Blattkopf-Zeile erscheint bei M > 0 und verschwindet bei M = 0 | — |

### Die harten Zahlen im Axonometrie-Gate ableiten, ohne es zu entschärfen

`pruefe-axonometrie.mjs:174-181` hält 25 Raumflächen / 18 Namen / 9 Säulen als
Literale. Ein Durchgang ändert die Raumzahl und färbt das Gate rot, obwohl das
Verhalten richtig ist. Die Zahlen werden deshalb abgeleitet: `boeden` aus der
Raumableitung derselben Plandatei, `marken` aus `plan.labels.length`, `saeulen` aus
`SAEULEN.length`.

Damit die Ableitung nicht zur Selbsterfüllung wird, zwei Klammern: ein
Plausibilitätsboden (mindestens 20 Räume, mindestens 15 Namen — eine leere
Ableitung kann nicht mehr grün werden), und eine Messung mit **einer entfernten
Wand**, die eine KLEINERE Raumzahl liefern muss. G1 (Ableitung == `getRooms()`)
bleibt unberührt.

## Reihenfolge — nach jedem Schritt ist alles grün

1. **Datenmodell still.** Typen, Fassung 3, Speichern/Laden, Zugriffsfunktionen.
   Noch zeichnet nichts. Beweis: Fassung ist 3, eine Datei ohne Öffnungen lädt.
2. **Gate-Zahlen ableiten** — vor jeder Sichtbarkeit. Bleibt
   `pruefe-axonometrie.mjs` hier grün, ist die Deckungsgleichheit mit den bisherigen
   Literalen bewiesen.
3. **Versöhnung + Gate-Rumpf** (b/d/e/h), rein am Modell über den Messzugang. Ab
   hier ist die härteste Frage beantwortet, bevor eine Zeile Oberfläche existiert.
4. **Grundriss zeichnen**, noch ohne Werkzeug (Öffnungen per Messzugang setzen).
5. **Bedienung im Kern** — Werkzeug, Setzen, Ziehen, Q/E, Löschen.
6. **Hüllen** — Knöpfe im Planer und in der Doppelklick-Datei.
7. **Axonometrie** + Legende. Bilder ansehen, nicht nur Exit-Codes lesen.
8. **Brüstung** (optional, eigener Schritt).
9. **Doku** — `CLAUDE.md` und `docs/datenmodell.md`.

## Risiken

| Risiko | Eintritt | Gegenmaßnahme |
|---|---|---|
| Wand-Teilung reißt Öffnungen los | **hoch** — bei jedem Zeichnen auf eine vorhandene Wand | Versöhnung in `update()`, Gate d/e mit erzwungener Gegenprobe |
| Neu-Export ändert abgeleitete Wand-Kennungen | mittel | Kennungen in `export_blueprint.py` explizit mitschreiben — der Diff nennt dann die betroffenen Wände |
| Die Doppelklick-Datei bekommt neuen Code nicht mit | mittel | KEIN neues Kern-Modul anlegen; sonst zwingend in `buendel-kern.mjs` eintragen. Das Gate läuft in beiden Welten, die Lücke wird rot statt still |
| Werkzeugleiste verdeckt den Ansichts-Umschalter | mittel | die gemessene Breiten-Grenze steht als Kommentar in `FloorplannerControls.tsx`; der neue Knopf gehört in dieselbe umbrechende Gruppe |
| Versöhnung kostet Zeit | niedrig | Öffnungen × Wände, zweistellig × 100 |
| Die Legende wird zur Floskel | niedrig | nur bei M > 0 einblenden |
| Der Anker driftet zur zweiten Wahrheit | niedrig | bei jedem Schreiben neu abgeleitet, nur in der Versöhnung gelesen |
