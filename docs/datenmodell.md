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
  corners: Record<string, { x: number; y: number }>   // Schlüssel = Ecken-ID (UUID)
  walls: Array<{
    corner1: string                                    // ID aus corners
    corner2: string
    frontTexture?: { url: string; stretch: boolean; scale: number }
    backTexture?:  { url: string; stretch: boolean; scale: number }
  }>
  wallTextures?: unknown[]
  floorTextures?: Record<string, { url: string; scale: number }>      // Schlüssel = Raum-UUID
  newFloorTextures?: Record<string, { url: string; scale: number }>
}
```

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

Eine Wand hat **kein** Öffnungs-Array. Eine Türöffnung entsteht dadurch, dass ein
Item vom Typ 7 an der richtigen Stelle in der Wand platziert wird. Die aus dem PDF
extrahierten Türöffnungen (T2) landen also **nicht** im `walls`-Zweig, sondern als
Einträge in `items` — mit `model_url` auf ein Tür-Modell des Katalogs.

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
