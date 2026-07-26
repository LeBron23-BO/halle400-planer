# Datenmodell des Grundriss-JSON (blueprint3d-modern)

> Ergebnis von T1 des Halle-400-Toolkits. Grundlage für T2 (Geometrie aus dem PDF)
> und T3 (Import ins Fork-Datenmodell).
> Quellen im Code: `src/model/floorplan.ts:11` (`SavedFloorplan`), `src/model/model.ts:7`
> (`SerializedItem`), `src/model/model.ts:55` (`loadSerialized`) / `:66` (`exportSerialized`).

## 1. Top-Level-Form

Ein gespeicherter Plan ist **ein** JSON-Objekt mit genau zwei Zweigen:

```jsonc
{
  "floorplan": { "corners": {…}, "walls": […], "floorTextures": {…} },
  "items":     [ … ]
}
```

`Model.loadSerialized(json)` erwartet exakt diese Form (`{ floorplan, items }`),
`Model.exportSerialized()` erzeugt sie. Referenz-Beispiel im Repo:
`src/templates/example.json`.

## 2. `floorplan` — die Bausubstanz

```ts
interface SavedFloorplan {
  formatVersion?: number                               // fehlt = 1 (alle Dateien bis W1)
  corners: Record<string, { x: number; y: number }>   // Schlüssel = Ecken-ID (UUID)
  walls: Array<{
    id?: string                                        // dauerhafte Wand-Kennung
    corner1: string                                    // ID aus corners
    corner2: string
    frontTexture?: { url: string; stretch: boolean; scale: number }
    backTexture?:  { url: string; stretch: boolean; scale: number }
  }>
  wallTextures?: unknown[]
  floorTextures?: Record<string, { url: string; scale: number }>      // Schlüssel = Raum-UUID
  newFloorTextures?: Record<string, { url: string; scale: number }>
  ausstattung?: Array<{ id?: string; quelle?: 'gemessen' | 'gesetzt'; /* … */ }>
}
```

### Kennungen und Herkunft (Fundament für W2/W4, 2026-07-26)

Drei Festlegungen, ohne die Möbelziehen und Türen still kaputt wären:

1. **Wände und Ausstattung tragen eine `id`, und die steht im Speicherformat.**
   Grund: `UndoManager.apply()` lädt den Grundriss komplett neu
   (`src/core/undo.ts:161`) — danach ist JEDES Objekt ein neues. Wer sich eine
   Objektreferenz gemerkt hat (Löschvorschlag, gezogenes Möbel, später eine Tür),
   hält danach eine Leiche, und die Handlung tut still nichts. Fehlt die Kennung
   in einer Datei, wird sie beim Laden aus dem INHALT abgeleitet
   (`a-<typ>-<x>-<y>`, `w-<ecke1>-<ecke2>`), nie zufällig: dieselbe Datei ergibt
   dieselben Kennungen. Eine Wand behält ihre Kennung, auch wenn sie durch Ziehen
   ihre Ecken wechselt — genau darauf bindet sich eine Tür.
2. **`quelle: 'gemessen' | 'gesetzt'` ist Pflichtfeld der Ausstattung.** Die PDF
   ist die Grundwahrheit; was der Nutzer hinstellt oder verschiebt, ist eine
   Annahme und wird `'gesetzt'` — auch das blosse VERSCHIEBEN eines gemessenen
   Stücks, denn danach steht es nicht mehr dort, wo gemessen wurde. Der 2D-Zeichner
   zeichnet `'gesetzt'` **gestrichelt**. Ohne diese Trennung könnte die Bank ein
   frei gezogenes Blatt für ein Aufmass halten.
3. **`formatVersion` (aktuell 2) wird beim Laden geprüft.** Eine Datei mit HÖHERER
   Fassung wird mit einer deutschen Meldung abgelehnt, statt still Felder zu
   verlieren; der offene Grundriss bleibt dabei unversehrt. Dateien OHNE
   `formatVersion` und ohne Kennungen laden weiterhin — `app/public/plaene/halle400.json`
   ist genau so eine. Beweis: `tools/pruefe-kennungen.mjs`.

**Einheit: Zentimeter.** Belegt durch `src/core/dimensioning.ts:16` — die einzige
Umrechnungsfunktion heißt `cmToMeasure(cm)`, alle Anzeigeeinheiten (m/cm/mm/inch)
werden daraus abgeleitet. Die gespeicherten Zahlen sind also cm, egal welche Einheit
die Oberfläche gerade anzeigt.

Für Halle 400 heißt das: **78 m × 15 m → 7800 × 1500** in Plan-Koordinaten.

**Wand-Standardwerte** (`src/core/configuration.ts:27`): Höhe `250`, Dicke `10` (cm).
Der reale Bau hat andere Werte — beim Import in T3 mitgeben, nicht die Defaults erben.

## 3. `items` — alles, was in den Räumen steht

```ts
interface SerializedItem {
  item_name: string
  item_type: number        // siehe Tabelle
  model_url: string        // 3D-Modell (glTF/obj) — Katalog-Eintrag
  xpos: number; ypos: number; zpos: number   // x/z = Grundrissebene, y = Höhe (cm)
  rotation: number         // Bogenmaß, um die Hochachse
  scale_x: number; scale_y: number; scale_z: number
  fixed: boolean
  resizable?: boolean
  description?: string
}
```

Item-Typen (`src/items/factory.ts:25`):

| Wert | Klasse | Bedeutung |
|---|---|---|
| 1 | FloorItem | abstrakt |
| 2 | WallItem | abstrakt |
| **3** | **InWallItem** | **sitzt IN der Wand → Fenster** |
| **7** | **InWallFloorItem** | **in der Wand, bodenbündig → Tür** |
| 8 | OnFloorItem | steht auf dem Boden (Möbel) |
| 9 | WallFloorItem | an der Wand, bodenbündig (Schrank) |
| 10 | CornerItem | in der Ecke |

### Wichtig für T2/T3: Türen sind keine Wand-Eigenschaft

Eine Wand hat **kein** Öffnungs-Array. Eine Türöffnung entsteht **im Upstream**
dadurch, dass ein Item vom Typ 7 an der richtigen Stelle in der Wand platziert wird
— mit `model_url` auf ein Tür-Modell des Katalogs.

### W4 (2026-07-26): dieser Planer geht einen anderen Weg — `oeffnungen[]`

**Der Item-Weg wurde verworfen, und zwar aus vier gemessenen Gründen:**

1. Der 2D-Zeichner malt `items` **überhaupt nicht** (`FloorplannerView.draw` kennt
   Raster, Räume, Wände, Ecken, Maße — sonst nichts). Eine als Item gepflegte Tür
   wäre im Grundriss unsichtbar, also genau in der Ansicht, in der der Nutzer sie
   setzt. Dasselbe Argument hat schon in A1 gegen Items als Ausstattung entschieden.
2. Ein Item hängt an einer **Objektreferenz** auf seine Wand. Ein Rückgängig lädt
   den Grundriss komplett neu — danach ist jedes Wand-Objekt ein neues, und die
   Referenz zeigt auf eine Leiche (`src/core/undo.ts` sagt das seit T5a im Text
   voraus: „mit T3a muss die Wand-Bindung nach dem Zurückspielen neu aufgelöst
   werden").
3. Jedes Katalog-Modell wiegt Megabytes auf einem fremden CDN. Die
   Doppelklick-Datei hat **kein Netz**.
4. Ein Item trägt eine **Höhe**. Ein Grundriss enthält keine (Projekt-DNA Punkt 4).

Öffnungen liegen deshalb als eigener Zweig **auf derselben Achse wie
`ausstattung`** — und erben damit Speichern, Laden, Rückgängig, Datei-Export und
die Axonometrie-Szene ohne eine weitere Zeile:

```jsonc
"formatVersion": 3,
"oeffnungen": [
  {
    "id": "o-tuer-w-a844d8-210",
    "wandId": "w-a844d8a1-47353fa6",   // PRIMÄRSCHLÜSSEL: Wall.id
    "lage": 210,                        // cm von der START-Ecke bis zur MITTE
    "breite": 87.5,                     // lichte Weite in cm
    "art": "tuer",                      // tuer | doppeltuer | fenster | durchgang
    "seite": 1,                         // Aufschlagseite: Vorzeichen der Normalen
    "anschlag": "anfang",               // wo das Band sitzt
    "bruestung": 90,                    // NUR fenster; fehlt = bodentief
    "quelle": "gesetzt",                // nie 'gemessen' — die PDF zeigt keine
    "anker": { "x": 3402, "y": 814 },   // ABGELEITETER Weltpunkt, s. u.
    "verwaist": false
  }
]
```

**Drei Festlegungen mit Begründung:**

- **`lage` absolut in cm, nicht als Bruchteil.** Eine Tür sitzt 12 cm von der Ecke,
  nicht bei 4 % der Wandlänge. Wird die Wand verlängert, bleibt das MASS erhalten,
  nicht das Verhältnis.
- **`anker` ist eine ABLEITUNG, keine zweite Wahrheit.** Er wird bei jedem
  Schreiben aus (`wandId`, `lage`) neu gerechnet und ausschliesslich in
  `versoehneOeffnungen()` gelesen.
- **Keine `hoehe`.** Die Axonometrie schneidet die Wände auf 1,16 m und sagt das in
  ihrer Legende.

### Warum es die Versöhnung geben MUSS

`Wall.id` wird einmal beim Erzeugen gesetzt (`wall.ts:83`) und nie neu gerechnet;
`Corner.move` fasst nur `x`/`y` an. Eine **verschobene** Wand behält ihre Kennung,
und eine Tür daran ebenso. **Drei Fälle kippen sie trotzdem:**

| Fall | Was passiert | Wo |
|---|---|---|
| **Wand-Teilung** | `newWall(this, wall.getEnd())` erzeugt die zweite Hälfte OHNE `id`, die alte Wand behält ihre und wird KÜRZER | `corner.ts:326-331` |
| **Wand-Entfernung** | die Kennung verschwindet mit der Wand | `corner.ts:341-362`, `:296` |
| **Neu-Export** | eine um 3 cm nachgemessene Wand bekommt neue Ecken-Prüfsummen und damit eine neue abgeleitete Kennung | `tools/export_blueprint.py` |

Daraus folgt die tragende Einsicht dieser Welle: **in dieser Pipeline überlebt
keine Kennung ein Nachmessen. Die einzige dauerhafte Identität einer Wand ist ihre
Geometrie.** Genau dafür ist der Anker da.

`Floorplan.versoehneOeffnungen()` läuft am Ende **jedes** `update()` — und das
läuft bei neuer Wand, entfernter Wand, verschmolzenen Ecken und nach jedem Laden,
also in allen drei Fällen. Je Öffnung: fehlt die Wand ODER liegt `lage ± breite/2`
ausserhalb ihrer Länge, wird über den Anker die nächste Wand innerhalb
`Wanddicke/2 + 25 cm` gesucht. Findet sich keine, gilt die Öffnung als `verwaist` —
sie wird **nicht** gelöscht, sondern nur nicht gezeichnet, und die Blattkopf-Zeile
sagt es.

Abschaltbar ist die Versöhnung **nur für die Gegenprobe des Gates**
(`Floorplan.versoehnungAn`). `tools/pruefe-tueren.mjs` Schritt d teilt dieselbe
Wand zweimal: einmal mit abgeschalteter Versöhnung — dann MUSS die Tür im Nichts
liegen — und einmal mit. Ein Wächter, der nie rot wird, ist kein Wächter.

## 4. Räume: abgeleitet, nicht gespeichert

Es gibt **kein `rooms`-Array**. Räume werden nach jedem Wand-Update aus dem
Wandgraphen berechnet (`Floorplan.updateRooms` → geschlossene Zyklen).

Die Identität eines Raums ist `Room.getUuid()` (`src/model/room.ts:50`):
die **sortierten, kommagetrennten IDs seiner Eckpunkte**. Genau darüber hängt der
Upstream schon heute die Bodentextur an einen Raum (`floorTextures[uuid]`).

**Konsequenz für T4 (Raumnamen + Säulen):** Der saubere, upstream-nahe Weg ist ein
weiteres Wörterbuch auf derselben Achse —

```jsonc
"roomMeta": {
  "<raum-uuid>": { "name": "Die Balance", "pillar": "04" }
}
```

— statt einer neuen Entität. Das erbt die bestehende Persistenz-Mechanik und
übersteht Umbenennungen im Editor. **Bruchstelle, die man kennen muss:** verschiebt
man eine Ecke, bleibt die ID stabil (gut); *löscht* man eine Ecke und setzt sie neu,
ändert sich die Raum-UUID und die Zuordnung reißt ab. T4 braucht deshalb einen
Reparaturpfad (Zuordnung über Raum-Schwerpunkt wiederfinden).

## 5. Was der Upstream NICHT kann (= unsere Bauliste)

| Fähigkeit | Stand |
|---|---|
| JSON-**Export** | vorhanden (`exportSerialized`) |
| JSON-**Import** aus Datei | **fehlt** — `loadSerialized` existiert, aber keine UI dafür → T3 |
| Undo/Redo | **fehlt** (Roadmap) → T5 |
| Mehrfachauswahl, Ausrichten/Verteilen | **fehlt** → T5 |
| Raumnamen | **fehlt** → T4 |
| Bild-Export (PNG) | **fehlt** → T5 |
