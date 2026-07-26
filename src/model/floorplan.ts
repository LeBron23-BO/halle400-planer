import * as THREE from 'three'
import { Utils } from '../core/utils'
import { EventEmitter } from '../core/events'
import { Wall } from './wall'
import { Corner } from './corner'
import { Room } from './room'
import { HalfEdge } from './half_edge'

export type FloorTexture = { url: string; scale: number }
export type WallTexture = { url: string; stretch: boolean; scale: number }
/** User-editable per-room metadata. Currently just the room name (T4). */
export type RoomMeta = { name: string }

/**
 * Signatur-Arten der Ausstattung (A1). Bewusst eine geschlossene Liste von
 * GRUNDRISS-ZEICHEN, nicht von Möbelstücken: gezeichnet wird, was der Plan
 * zeigt (ein Rechteck mit vier Kreisen IST das Kochfeld), nicht ein
 * fotorealistisches Modell. Darum trägt jede Art ihre eigene Zeichenvorschrift
 * in `floorplanner_view.zeichneSignatur` — und keine `model_url` auf ein
 * fremdes CDN.
 */
export type AusstattungTyp =
  | 'tisch' // Rechteck — Schreibtisch, Konferenztisch, Teamtable
  | 'rundtisch' // Kreis — Bistrotisch auf den Loggien
  | 'stuhl' // kleines gerundetes Rechteck, zeigt zum zugehörigen Tisch
  | 'schrank' // Rechteck mit Diagonale (Norm-Zeichen für Schrank/Regal)
  | 'treppe' // Stufenband mit Laufrichtung
  | 'wc' // Sanitär: Becken im Kabinen-Rechteck
  | 'waschbecken'
  | 'kochfeld' // Rechteck mit vier Platten
  | 'pflanze' // Kreis mit Zacken — Kübel auf Loggia/in Büros
  | 'aufzug' // Rechteck mit Kreuz (Norm-Zeichen)
  | 'flaeche' // gefüllte Fläche — Loggia, Kiesbett
  // ── W3: die Ausstattung des Gesundheits- und Bewegungs-Konzepts ──────────
  // Diese drei stehen in KEINEM gemessenen Plan: die PDF zeigt das Büro, nicht
  // die Halle im Betrieb. Sie entstehen ausschliesslich dadurch, dass der
  // Nutzer sie hinstellt, und tragen deshalb immer `quelle: 'gesetzt'`.
  // Ausgewählt nach den neun Säulen (Reiz, Aktivierung, Regeneration, Balance,
  // Wissen, Baustoff, Alltag, Vorsorge, Atem) — mehr Arten wären Vorrat auf
  // Verdacht, und ein Zeichen, das niemand setzt, ist nur eine weitere Stelle,
  // an der eine Typ-Kette halb verdrahtet bleiben kann.
  | 'matte' // abgerundetes Rechteck — Gymnastik-/Yogamatte (Atem, Aktivierung)
  | 'geraet' // Rechteck mit markierter Vorderseite — Trainingsgerät (Aktivierung)
  | 'liege' // Rechteck mit Kopfende — Behandlungs-/Massageliege (Regeneration, Balance)

/**
 * Woher ein Ausstattungs-Zeichen kommt — das WICHTIGSTE Feld dieser Struktur.
 *
 * Die PDF ist die alleinige Grundwahrheit (Projekt-DNA, oberstes Prinzip). Ein
 * frei hingestelltes oder verschobenes Stück ist KEIN Aufmaß, sieht aber im
 * Bild genauso aus wie eines. Ohne dieses Feld könnte die Bank ein gezogenes
 * Blatt für eine Messung halten — genau der Fehler, den das ganze Vorhaben
 * nicht machen darf. Darum Pflichtfeld und nicht `optional`: wer ein Stück
 * erzeugt, MUSS sich entscheiden, was es ist.
 */
export type AusstattungQuelle =
  | 'gemessen' // aus `Nur Büro.pdf` abgegriffen, mit `beleg`
  | 'gesetzt' // vom Nutzer hingestellt oder verschoben — eine Annahme, kein Maß

/**
 * EIN Ausstattungs-Zeichen. Koordinaten in cm im selben Bezugsrahmen wie
 * `corners` — dadurch wandert die Ausstattung beim Zoomen automatisch mit der
 * Bausubstanz mit und kann nie gegen sie verrutschen.
 */
export type AusstattungElement = {
  /**
   * Dauerhafte Kennung. Pflichtfeld, weil jede Handlung am Möbel sie braucht:
   * ein Rückgängig lädt den Grundriss komplett neu (`src/core/undo.ts`), danach
   * ist JEDES Element ein neues Objekt. Wer sich eine Objektreferenz gemerkt
   * hat — der Löschvorschlag, das gerade gezogene Stück — hielte danach eine
   * Leiche in der Hand, und Löschen/Verschieben täte still nichts.
   */
  id: string
  /** Aufmaß oder Annahme? Siehe `AusstattungQuelle`. */
  quelle: AusstattungQuelle
  typ: AusstattungTyp
  /** Mittelpunkt in cm. */
  x: number
  y: number
  /** Ausdehnung in cm, VOR der Drehung: `breite` entlang x, `tiefe` entlang y. */
  breite: number
  tiefe: number
  /** Drehung im Bogenmaß um den Mittelpunkt. Fehlt = 0. */
  drehung?: number
  /**
   * Herkunftsnachweis der Messung (z. B. `kacheln10/kand_nord_3_27-37m.png`).
   * Pflichtfeld der Sorgfalt, nicht Zierde: eine Position ohne Beleg ist
   * geraten, und geratene Geometrie sieht exakt aus, ohne es zu sein.
   */
  beleg?: string
  /** Freie Beschriftung, nur in der Detailstufe sichtbar. */
  text?: string
}

/**
 * So darf ein Ausstattungs-Zeichen in einer DATEI liegen: Kennung und Herkunft
 * dürfen fehlen. `app/public/plaene/halle400.json` ist genau so eine Datei —
 * 289 gemessene Stücke ohne Kennung, geschrieben von `tools/export_blueprint.py`,
 * und die ist die Grundwahrheit und wird nicht angefasst. Beim Laden werden
 * beide Felder ergänzt (siehe `loadFloorplan`), im Speicher gibt es sie danach
 * immer.
 */
export type GespeichertesAusstattungElement = Omit<AusstattungElement, 'id' | 'quelle'> & {
  id?: string
  quelle?: AusstattungQuelle
}

/**
 * Was aus der Palette in den Grundriss gezogen werden kann (W3), samt seinem
 * Standardmaß in cm.
 *
 * DIE MASSE SIND GESETZTE HANDELSMASSE, KEINE MESSWERTE. Ein neu hingestelltes
 * Stück ist eine Annahme — es wird `quelle: 'gesetzt'` und im Grundriss
 * gestrichelt gezeichnet. Die Zahlen sind trotzdem nicht beliebig: sie sind die
 * verbreiteten Liefermaße der jeweiligen Ware, damit ein Raum, in den vier
 * Liegen passen sollen, auch wirklich vier fasst.
 *
 * HIER UND NICHT IN DER OBERFLÄCHE, weil beide Auslieferungen (Planer und
 * Doppelklick-Datei) dasselbe hinstellen müssen. Zwei Listen liefen
 * auseinander, sobald jemand nur eine anfasst — und dann hiesse dieselbe Matte
 * in der einen Welt 180 cm und in der anderen 200 cm.
 *
 * Reihenfolge = Reihenfolge in der Palette: erst das Vertraute (Stuhl, Tisch),
 * dann das Neue. Der Nutzer hat Stühle und Tische ausdrücklich genannt.
 */
export const AUSSTATTUNG_VORLAGEN: ReadonlyArray<{
  typ: AusstattungTyp
  breite: number
  tiefe: number
}> = [
  // Deckt sich mit den 144 gemessenen Stühlen der PDF (alle 45 × 45 cm) — ein
  // neu gesetzter Stuhl soll neben einem gemessenen nicht auffallen.
  { typ: 'stuhl', breite: 45, tiefe: 45 },
  // Gängiges Büro-Schreibtischmaß. Die gemessenen Tische reichen von 50 bis
  // 290 cm Breite; 160 × 80 liegt mittig und ist das, was man bestellt.
  { typ: 'tisch', breite: 160, tiefe: 80 },
  // Verbreitetes Handelsmaß einer Yoga-/Gymnastikmatte.
  { typ: 'matte', breite: 180, tiefe: 60 },
  // Stellfläche eines einzelnen Kraft-/Ausdauergeräts ohne Bedienfläche
  // davor — die gehört dem Raum, nicht dem Gerät, und wäre hier erfunden.
  { typ: 'geraet', breite: 120, tiefe: 80 },
  // Verbreitetes Handelsmaß einer Massage-/Behandlungsliege.
  { typ: 'liege', breite: 200, tiefe: 70 }
]

/* ══════════════════════════════════════════════════════════════════════════
   ÖFFNUNGEN — Türen, Fenster, Durchgänge (W4)
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Arten einer Wandöffnung. Geschlossene Liste wie `AusstattungTyp`, und aus
 * demselben Grund: gezeichnet wird ein GRUNDRISS-ZEICHEN, kein Bauteil. Ein
 * Türblatt mit Aufschlagbogen IST die Tür im Plan — ein Modell mit Zarge,
 * Drücker und Bändern wäre eine Formaussage, die ein Grundriss nicht trägt.
 */
export type OeffnungsArt =
  | 'tuer' // Türblatt als Strecke + Viertelkreis-Aufschlagbogen
  | 'doppeltuer' // zwei gespiegelte Blätter, je halbe lichte Weite
  | 'fenster' // zwei dünne Parallelen längs in der Wandstärke
  | 'durchgang' // nur die beiden Laibungen — kein Blatt, keine Schwelle

/**
 * EINE Öffnung in EINER Wand.
 *
 * DREI FESTLEGUNGEN, die man kennen muss, bevor man hier etwas ändert:
 *
 * 1. `wandId` ist der PRIMÄRSCHLÜSSEL, nie eine Objektreferenz. Ein
 *    Rückgängig lädt den Grundriss komplett neu (`src/core/undo.ts`), danach
 *    ist JEDES Wand-Objekt ein neues. Eine gemerkte Referenz wäre eine Leiche,
 *    und die Tür hinge an einer Wand, die es nicht mehr gibt. `Wall.id` selbst
 *    überlebt das: sie wird einmal beim Erzeugen gesetzt (`wall.ts:83`) und nie
 *    neu gerechnet, und `saveFloorplan` schreibt sie mit.
 *
 * 2. `lage` ist ein ABSOLUTES Maß in cm, kein Bruchteil. Eine Tür sitzt 12 cm
 *    von der Ecke, nicht bei 4 % der Wandlänge. Wird die Wand verlängert, bleibt
 *    das Maß erhalten und nicht das Verhältnis (Projekt-DNA Punkt 3). Gemessen
 *    wird von der START-Ecke der Wand bis zur MITTE der Öffnung — die Mitte,
 *    weil sich daran beide Laibungen symmetrisch aufhängen und ein Wechsel der
 *    Breite die Öffnung nicht wandern lässt.
 *
 * 3. KEINE `hoehe`. Ein Grundriss enthält keine (Projekt-DNA Punkt 4). Die
 *    Axonometrie schneidet die Wände auf 1,16 m und sagt das in ihrer Legende;
 *    eine Türhöhe von 2,01 m wäre erfunden und sähe gemessen aus.
 */
export type Oeffnung = {
  /** Dauerhafte Kennung — Pflichtfeld, aus demselben Grund wie bei
   *  `AusstattungElement.id`: jede Handlung (ziehen, wenden, löschen) greift
   *  ausschliesslich über sie zu. */
  id: string
  /** Kennung der tragenden Wand (`Wall.id`). */
  wandId: string
  /** cm von der START-Ecke der Wand bis zur MITTE der Öffnung. */
  lage: number
  /** Lichte Weite in cm. */
  breite: number
  art: OeffnungsArt
  /**
   * Auf welcher Seite die Tür aufschlägt: Vorzeichen entlang der Wand-Normalen
   * (+1 = links der Richtung Start→Ende, −1 = rechts). Bei `fenster` und
   * `durchgang` ohne Wirkung — sie bleibt trotzdem Pflichtfeld, damit ein
   * Wechsel der Art nicht in einen unbestimmten Zustand führt.
   */
  seite: 1 | -1
  /** An welcher Laibung das Band sitzt (die Drehachse des Blattes). */
  anschlag: 'anfang' | 'ende'
  /**
   * Brüstungshöhe in cm — NUR bei `fenster`. Fehlt sie, geht die Öffnung bis
   * zum Boden (bodentiefes Fenster). GESETZTE Annahme, kein Messwert: eine
   * Brüstungshöhe steht in keinem Grundriss.
   */
  bruestung?: number
  /** Aufmaß oder Annahme? Dieselbe Bedeutung wie bei `AusstattungQuelle`. */
  quelle: AusstattungQuelle
  /**
   * ABGELEITETER Weltpunkt der Öffnungsmitte in cm — KEINE zweite Wahrheit.
   *
   * Er wird bei JEDEM Schreiben aus (`wandId`, `lage`) neu gerechnet und
   * ausschliesslich in `versoehneOeffnungen()` gelesen. Ohne ihn sind drei
   * Fälle unrettbar, in denen eine Wand-Kennung kippt: die Wand-TEILUNG
   * (`corner.ts:326-331` erzeugt die zweite Hälfte ohne `id`, die alte Wand
   * behält ihre und wird KÜRZER), die Wand-ENTFERNUNG, und ein NEU-EXPORT, bei
   * dem eine nachgemessene Wand neue Ecken und damit eine neue abgeleitete
   * Kennung bekommt. In dieser Pipeline überlebt keine Kennung ein Nachmessen —
   * die einzige dauerhafte Identität einer Wand ist ihre GEOMETRIE.
   */
  anker: { x: number; y: number }
  /**
   * Die Wand ist weg und in Reichweite des Ankers stand keine andere. Die
   * Öffnung wird dann NICHT gezeichnet und NICHT gelöscht: still zu entsorgen,
   * was der Nutzer gesetzt hat, wäre der schlimmere Fehler. Er erfährt es über
   * die Leiste und kann die Wand zurückholen (Strg+Z).
   */
  verwaist?: boolean
}

/** So darf eine Öffnung in einer DATEI liegen: Kennung, Herkunft und Anker
 *  dürfen fehlen und werden beim Laden ergänzt (siehe `uebernehmeOeffnungen`). */
export type GespeicherteOeffnung = Omit<Oeffnung, 'id' | 'quelle' | 'anker'> & {
  id?: string
  quelle?: AusstattungQuelle
  anker?: { x: number; y: number }
}

/**
 * Was sich einsetzen lässt, samt lichter Weite in cm (W4).
 *
 * DIE MASSE SIND GESETZTE ANNAHMEN, KEINE MESSWERTE — dieselbe Ehrlichkeit wie
 * bei `AUSSTATTUNG_VORLAGEN`. `Nur Büro.pdf` zeigt Wände, keine Türblätter; was
 * hier steht, ist ein Vorschlag für den Nutzer und trägt darum immer
 * `quelle: 'gesetzt'`.
 *
 * Die Zahlen sind trotzdem nicht beliebig: 87,5 cm ist das verbreitete
 * Baurichtmaß einer Türöffnung im Büro- und Wohnbau (die übliche Reihe lautet
 * 62,5 / 75 / 87,5 / 100 / 112,5 cm), die Doppeltür ist genau das Doppelte.
 * Eine DIN-Nummer steht hier bewusst NICHT: eine erfundene Norm sähe belegt aus
 * und wäre schlimmer als eine offene Annahme (dieselbe Regel wie bei Matte,
 * Gerät und Liege in W3).
 *
 * Reihenfolge = Reihenfolge in der Leiste: erst das Häufigste.
 */
export const OEFFNUNGS_VORLAGEN: ReadonlyArray<{
  art: OeffnungsArt
  breite: number
  bruestung?: number
}> = [
  { art: 'tuer', breite: 87.5 },
  { art: 'doppeltuer', breite: 175 },
  // 90 cm Brüstung ist die verbreitete Höhe eines Bürofensters — gesetzte
  // Annahme. In der Axonometrie bleibt darunter ein Brüstungsblock stehen,
  // sonst sähe ein Fenster aus wie ein Durchgang.
  { art: 'fenster', breite: 125, bruestung: 90 },
  { art: 'durchgang', breite: 100 }
]

/**
 * Wie nah zwei Öffnungen derselben Wand sich kommen dürfen (cm). Null wäre
 * mathematisch richtig und baulich falsch: zwischen zwei Öffnungen steht immer
 * ein Stück Wand. 5 cm ist bewusst knapp — die Regel soll den Fehlgriff fangen
 * (zwei ineinander liegende Türen), nicht eine dichte Fensterreihe verbieten.
 */
export const OEFFNUNG_MINDESTABSTAND_CM = 5

/**
 * Wie weit die Versöhnung um den Anker herum nach einer Ersatzwand sucht —
 * ZUSÄTZLICH zur halben Wanddicke. 25 cm deckt den Fall ab, für den der Anker
 * gebaut ist (die geteilte Wand: die neue Hälfte liegt exakt auf derselben
 * Achse, der Abstand ist rechnerisch null), lässt aber Luft für eine Wand, die
 * beim Verschmelzen von Ecken ein paar Zentimeter gewandert ist. Grösser
 * gewählt zöge eine Tür auf die NACHBARWAND um — schlimmer als eine ehrlich
 * verwaiste Tür, denn eine falsch umgezogene sieht richtig aus.
 */
export const VERSOEHNUNG_SUCHWEITE_CM = 25

/**
 * Fassung des Speicherformats. Erhöhen, sobald ein Feld dazukommt, auf das sich
 * etwas VERLÄSST — nicht bei jeder Kleinigkeit.
 *
 *   1  bis W1: Ecken, Wände (nur über ihre Ecken), Texturen, roomMeta,
 *      Ausstattung ohne Kennung
 *   2  ab W2-Fundament: Wände und Ausstattung tragen `id`, Ausstattung `quelle`
 *   3  ab W4: `oeffnungen` — Türen, Fenster und Durchgänge, die an `Wall.id`
 *      hängen. Genau der Fall, den der Text unten seit W1 als Beispiel nennt.
 *
 * WOZU: eine Datei aus einer NEUEREN Fassung enthält Felder, die dieser Planer
 * nicht kennt. Er würde sie klaglos öffnen und beim nächsten Sichern still
 * wegwerfen — der Nutzer verlöre seine Türen und merkte es erst Wochen später.
 * Lieber ehrlich ablehnen (siehe `loadFloorplan`).
 */
export const PLAN_FASSUNG = 3

export interface SavedFloorplan {
  /** Fassung des Formats; fehlt in allen Dateien bis W1 und heisst dann 1. */
  formatVersion?: number
  corners: Record<string, { x: number; y: number }>
  walls: Array<{
    /** Dauerhafte Kennung der Wand. Fehlt in Dateien bis W1 — dann wird sie
     *  beim Laden stabil vergeben. Woran eine Tür sich bindet (T3a). */
    id?: string
    corner1: string
    corner2: string
    frontTexture?: WallTexture
    backTexture?: WallTexture
  }>
  wallTextures?: unknown[]
  floorTextures?: Record<string, FloorTexture>
  newFloorTextures?: Record<string, FloorTexture>
  /** User room/label names keyed by a stable label key (see app/lib/roomNaming). */
  roomMeta?: Record<string, RoomMeta>
  /** Ausstattungs-Zeichen (A1) — gemessene wie gesetzte. */
  ausstattung?: GespeichertesAusstattungElement[]
}

/**
 * Sorgt dafür, dass eine Kennung im Grundriss nur EINMAL vorkommt.
 *
 * Nötig, weil die Kennungen fehlender Angaben aus dem INHALT abgeleitet werden
 * (siehe unten) und zwei gleiche Stühle an derselben Stelle denselben Vorschlag
 * ergäben. Der Zusatz ist zählend und nicht zufällig, damit die Ableitung
 * wiederholbar bleibt: dieselbe Datei ergibt dieselben Kennungen.
 */
function eindeutigeKennung(vorschlag: string, vergeben: Set<string>): string {
  let kennung = vorschlag
  let n = 2
  while (vergeben.has(kennung)) {
    kennung = `${vorschlag}#${n}`
    n++
  }
  vergeben.add(kennung)
  return kennung
}

/**
 * Kennung für ein Ausstattungs-Zeichen ohne eigene — aus dem INHALT abgeleitet,
 * nicht aus einem Zufallswert und nicht aus der Position in der Liste.
 *
 * WARUM NICHT `Utils.guid()`: dieselbe Datei ergäbe bei jedem Öffnen andere
 * Kennungen. Alles, was sich daran bindet (ein Löschvorschlag, später eine
 * Tür), zeigte nach einem Neustart ins Leere. WARUM NICHT der Listen-Index:
 * käme in der PDF-Auswertung ein Stück hinzu, verschöbe sich jede folgende
 * Kennung — dasselbe Möbel hiesse dann anders. Ort und Art verschieben sich
 * nicht. (Ecken bekommen ihre Kennung genauso aus der Datei statt neu erzeugt,
 * siehe `newCorner`.)
 */
function kennungAusAusstattung(el: GespeichertesAusstattungElement): string {
  return `a-${el.typ}-${Math.round(el.x)}-${Math.round(el.y)}`
}

/** Kennung für eine Wand ohne eigene — aus dem Eckenpaar, das sie beim Laden
 *  verbindet. Ab dann bleibt sie fest, auch wenn die Wand später an anderen
 *  Ecken hängt: genau darum geht es. Die ersten acht Zeichen der Ecken-UUIDs
 *  reichen zur Unterscheidung; auf Gleichheit prüft `eindeutigeKennung`. */
function kennungAusWand(corner1: string, corner2: string): string {
  return `w-${corner1.slice(0, 8)}-${corner2.slice(0, 8)}`
}

/** */
const defaultFloorPlanTolerance = 10.0

/**
 * A Floorplan represents a number of Walls, Corners and Rooms.
 */
export class Floorplan {
  /** */
  private walls: Wall[] = []

  /** */
  private corners: Corner[] = []

  /** */
  private rooms: Room[] = []

  /** */
  private new_wall_callbacks = new EventEmitter<Wall>()

  /** */
  private new_corner_callbacks = new EventEmitter<Corner>()

  /** */
  private redraw_callbacks = new EventEmitter<void>()

  /** */
  private updated_rooms = new EventEmitter<void>()

  /** */
  public roomLoadedCallbacks = new EventEmitter<void>()

  /**
   * Floor textures are owned by the floorplan, because room objects are
   * destroyed and created each time we change the floorplan.
   * floorTextures is a map of room UUIDs (string) to a object with
   * url and scale attributes.
   */
  private floorTextures: Record<string, FloorTexture> = {}

  /**
   * User-defined room/label names, keyed by a stable label key (the PDF anchor
   * position — see app/lib/roomNaming). Persisted on the same axis as
   * floorTextures, but deliberately NOT pruned on room changes: the key is
   * anchored to the PDF label, not to a derived room, so it survives wall edits.
   */
  private roomMeta: Record<string, RoomMeta> = {}

  /**
   * Aus der PDF gemessene Ausstattung (A1). Liegt bewusst auf DERSELBEN Achse
   * wie `roomMeta` — dadurch erbt sie die erprobte Speicher-/Lade-Mechanik und
   * übersteht damit auch das Rückgängig, das seine Momentaufnahmen über
   * `saveFloorplan`/`loadFloorplan` zieht (siehe `src/core/undo.ts`). Eine
   * eigene, daneben laufende Ablage wäre beim ersten Strg+Z verschwunden.
   */
  private ausstattung: AusstattungElement[] = []

  /** Constructs a floorplan. */
  constructor() {}

  // hack
  public wallEdges(): HalfEdge[] {
    const edges: HalfEdge[] = []

    this.walls.forEach((wall) => {
      if (wall.frontEdge) {
        edges.push(wall.frontEdge)
      }
      if (wall.backEdge) {
        edges.push(wall.backEdge)
      }
    })
    return edges
  }

  // hack
  public wallEdgePlanes(): THREE.Mesh[] {
    const planes: THREE.Mesh[] = []
    this.walls.forEach((wall) => {
      if (wall.frontEdge) {
        if (wall.frontEdge.plane) {
          planes.push(wall.frontEdge.plane)
        }
      }
      if (wall.backEdge) {
        if (wall.backEdge.plane) {
          planes.push(wall.backEdge.plane)
        }
      }
    })
    return planes
  }

  // @ts-ignore - floorPlanes is declared but not used, keeping for future use
  private floorPlanes(): THREE.Mesh[] {
    return Utils.map(this.rooms, (room: Room) => room.floorPlane).filter(
      (plane): plane is THREE.Mesh => plane !== null
    )
  }

  public fireOnNewWall(callback: (wall: Wall) => void): void {
    this.new_wall_callbacks.add(callback)
  }

  public fireOnNewCorner(callback: (corner: Corner) => void): void {
    this.new_corner_callbacks.add(callback)
  }

  public fireOnRedraw(callback: () => void): void {
    this.redraw_callbacks.add(callback)
  }

  public fireOnUpdatedRooms(callback: () => void): void {
    this.updated_rooms.add(callback)
  }

  /**
   * Creates a new wall.
   * @param start The start corner.
   * @param end he end corner.
   * @param id Vorhandene Kennung (nur beim Laden), sonst entsteht eine neue.
   * @returns The new wall.
   */
  public newWall(start: Corner, end: Corner, id?: string): Wall {
    const wall = new Wall(start, end, id)
    this.walls.push(wall)
    const scope = this
    wall.fireOnDelete(() => {
      scope.removeWall(wall)
    })
    this.new_wall_callbacks.fire(wall)
    this.update()
    return wall
  }

  /** Removes a wall.
   * @param wall The wall to be removed.
   */
  private removeWall(wall: Wall) {
    Utils.removeValue(this.walls, wall)
    this.update()
  }

  /**
   * Creates a new corner.
   * @param x The x coordinate.
   * @param y The y coordinate.
   * @param id An optional id. If unspecified, the id will be created internally.
   * @returns The new corner.
   */
  public newCorner(x: number, y: number, id?: string): Corner {
    const corner = new Corner(this, x, y, id)
    this.corners.push(corner)
    corner.fireOnDelete(() => {
      this.removeCorner(corner)
    })
    this.new_corner_callbacks.fire(corner)
    return corner
  }

  /** Removes a corner.
   * @param corner The corner to be removed.
   */
  private removeCorner(corner: Corner) {
    Utils.removeValue(this.corners, corner)
  }

  /** Gets the walls. */
  public getWalls(): Wall[] {
    return this.walls
  }

  /** Gets the corners. */
  public getCorners(): Corner[] {
    return this.corners
  }

  /** Gets the rooms. */
  public getRooms(): Room[] {
    return this.rooms
  }

  public overlappedCorner(x: number, y: number, tolerance?: number): Corner | null {
    tolerance = tolerance || defaultFloorPlanTolerance
    for (let i = 0; i < this.corners.length; i++) {
      if (this.corners[i].distanceFrom(x, y) < tolerance) {
        return this.corners[i]
      }
    }
    return null
  }

  public overlappedWall(x: number, y: number, tolerance?: number): Wall | null {
    tolerance = tolerance || defaultFloorPlanTolerance
    for (let i = 0; i < this.walls.length; i++) {
      if (this.walls[i].distanceFrom(x, y) < tolerance) {
        return this.walls[i]
      }
    }
    return null
  }

  // import and export -- cleanup

  public saveFloorplan(): SavedFloorplan {
    const floorplan: SavedFloorplan = {
      formatVersion: PLAN_FASSUNG,
      corners: {},
      walls: [],
      wallTextures: [],
      floorTextures: {},
      newFloorTextures: {},
      roomMeta: {},
      ausstattung: []
    }

    this.corners.forEach((corner) => {
      floorplan.corners[corner.id] = {
        x: corner.x,
        y: corner.y
      }
    })

    this.walls.forEach((wall) => {
      floorplan.walls.push({
        // Die Kennung MUSS mitgeschrieben werden, sonst nützt sie nichts: das
        // Rückgängig fährt über genau diesen Weg (saveFloorplan -> JSON ->
        // loadFloorplan), und was hier fehlt, ist danach für immer weg.
        id: wall.id,
        corner1: wall.getStart().id,
        corner2: wall.getEnd().id,
        frontTexture: wall.frontTexture,
        backTexture: wall.backTexture
      })
    })
    floorplan.newFloorTextures = this.floorTextures
    floorplan.roomMeta = this.roomMeta
    floorplan.ausstattung = this.ausstattung
    return floorplan
  }

  public loadFloorplan(floorplan: SavedFloorplan | null): void {
    // VOR dem reset() prüfen: eine abgelehnte Datei darf den Grundriss, der
    // gerade offen ist, nicht mitreissen. Wer eine Datei aus einer neueren
    // Fassung öffnet, soll seinen Stand behalten und eine Erklärung bekommen.
    const fassung = floorplan?.formatVersion ?? 1
    if (fassung > PLAN_FASSUNG) {
      throw new Error(
        `Dieser Grundriss stammt aus einer neueren Fassung des Planers ` +
          `(Format ${fassung}, dieser Planer kennt ${PLAN_FASSUNG}). Er wird ` +
          `nicht geöffnet, weil dabei Angaben still verloren gingen — etwa ` +
          `Türen, die an einer Wand hängen. Bitte den Planer aktualisieren.`
      )
    }

    this.reset()

    const corners: Record<string, Corner> = {}
    if (floorplan == null || !('corners' in floorplan) || !('walls' in floorplan)) {
      return
    }
    for (const id in floorplan.corners) {
      const corner = floorplan.corners[id]
      corners[id] = this.newCorner(corner.x, corner.y, id)
    }
    const scope = this
    // Vergebene Kennungen für Wände und Ausstattung getrennt: sie leben in
    // getrennten Listen, und eine Wand namens wie ein Stuhl stört niemanden.
    const wandKennungen = new Set<string>()
    floorplan.walls.forEach((wall) => {
      // Eine Wand, deren Ecke im Plan fehlt, ueberspringen statt daran zu
      // zerbrechen: `new Wall(undefined, …)` warf einen TypeError und liess die
      // Anwendung mit halb geladenem Grundriss stehen. Die Ursache solcher
      // Plaene ist behoben (Corner.removeAll), aber ein VORHER gespeicherter
      // Stand liegt weiterhin in der Datenbank des Nutzers — der muss sich
      // oeffnen lassen, wenn auch ohne diese eine Wand.
      if (!corners[wall.corner1] || !corners[wall.corner2]) {
        console.warn(
          `[Floorplan] Wand ohne gueltige Ecke uebersprungen (${wall.corner1} -> ${wall.corner2})`
        )
        return
      }
      const kennung = eindeutigeKennung(
        wall.id || kennungAusWand(wall.corner1, wall.corner2),
        wandKennungen
      )
      const newWall = scope.newWall(corners[wall.corner1], corners[wall.corner2], kennung)
      if (wall.frontTexture) {
        newWall.frontTexture = wall.frontTexture
      }
      if (wall.backTexture) {
        newWall.backTexture = wall.backTexture
      }
    })

    if (floorplan.newFloorTextures) {
      this.floorTextures = floorplan.newFloorTextures
    }
    this.roomMeta = floorplan.roomMeta ?? {}
    this.ausstattung = this.uebernehmeAusstattung(floorplan.ausstattung ?? [])

    this.update()
    this.roomLoadedCallbacks.fire()
  }

  public getFloorTexture(uuid: string): FloorTexture | null {
    if (uuid in this.floorTextures) {
      return this.floorTextures[uuid]
    } else {
      return null
    }
  }

  public setFloorTexture(uuid: string, url: string, scale: number): void {
    this.floorTextures[uuid] = {
      url: url,
      scale: scale
    }
  }

  /** The whole name-override map — read access for runtime label resolution. */
  public getAllRoomMeta(): Record<string, RoomMeta> {
    return this.roomMeta
  }

  /** Die gemessene Ausstattung — Lesezugriff für den 2D-Zeichner (A1). */
  public getAusstattung(): AusstattungElement[] {
    return this.ausstattung
  }

  /** EIN Stück über seine Kennung — der einzige zulässige Weg, eines
   *  wiederzufinden. Über eine gemerkte Objektreferenz geht es NICHT: nach
   *  einem Rückgängig ist die Liste komplett neu aufgebaut. */
  public findeAusstattung(id: string): AusstattungElement | null {
    return this.ausstattung.find((el) => el.id === id) ?? null
  }

  /**
   * Ersetzt die Ausstattung vollständig und ergänzt fehlende Kennungen.
   *
   * FRÜHER STAND HIER, die Ausstattung sei „eine zusammenhängende Messung aus
   * der PDF, kein vom Nutzer Stück für Stück gepflegter Bestand" — als
   * Begründung dafür, dass es keinen Einzel-Setter gibt. W1.5 hat diese
   * Begründung bereits als überholt gekennzeichnet, weil der Nutzer Möbel
   * verschieben darf. Mit W3 ist sie vollends widerlegt: der Nutzer STELLT
   * jetzt Stücke hin, einzeln, aus der Palette. Der Einzel-Setter heisst
   * `fuegeAusstattungHinzu` und steht direkt darunter.
   *
   * Diese Methode BLEIBT trotzdem, und zwar für das, wofür sie gedacht war:
   * eine ganze Liste auf einmal übernehmen (Laden, Zurückspielen). Sie ersetzt
   * den Bestand VOLLSTÄNDIG — wer ein einzelnes Stück hinzufügen will und dafür
   * die ganze Liste durchreicht, vergibt bei jedem Aufruf alle Kennungen neu.
   *
   * Was ebenfalls BLEIBT, ist der wahre Kern der alten Regel: die gemessenen
   * Stücke sind Grundwahrheit aus der PDF und tragen `quelle: 'gemessen'`. Was
   * der Nutzer anfasst oder neu hinstellt, ist `'gesetzt'` und damit eine
   * Annahme — sichtbar getrennt, damit nie eine Annahme als Aufmaß durchgeht.
   */
  public setAusstattung(elemente: GespeichertesAusstattungElement[]): void {
    this.ausstattung = this.uebernehmeAusstattung(elemente)
  }

  /**
   * Stellt EIN Stück hin (W3) — der Einzel-Setter, den `setAusstattung` oben
   * einmal ausdrücklich abgelehnt hat.
   *
   * `quelle: 'gesetzt'` ist FEST VERDRAHTET und nicht dem Aufrufer überlassen,
   * aus demselben Grund wie bei `verschiebeAusstattung`: ein Stück, das zur
   * Laufzeit entsteht, kann unmöglich aus der PDF stammen — dort steht das Büro,
   * nicht die Halle im Betrieb. Es als Aufmaß zu führen wäre die eine Lüge, die
   * dieses Projekt sich nicht leisten kann. Ein `beleg` wird deshalb auch nicht
   * übernommen: es gibt keinen.
   *
   * Die Kennung wird gegen die BEREITS VERGEBENEN geprüft, nicht gegen eine
   * leere Menge. Zwei gleiche Stühle an derselben Stelle ergäben sonst zweimal
   * dieselbe Kennung, und ab da zöge, drehte und löschte jeder Griff am zweiten
   * in Wahrheit den ersten.
   *
   * Gibt das fertige Stück zurück — der Aufrufer braucht seine Kennung, um es
   * gleich einzurasten (`Floorplanner.stueckAblegen`).
   */
  public fuegeAusstattungHinzu(
    neu: Omit<GespeichertesAusstattungElement, 'quelle' | 'beleg'>
  ): AusstattungElement {
    const vergeben = new Set(this.ausstattung.map((el) => el.id))
    const el: AusstattungElement = {
      ...neu,
      id: eindeutigeKennung(neu.id || kennungAusAusstattung(neu), vergeben),
      quelle: 'gesetzt'
    }
    this.ausstattung.push(el)
    return el
  }

  /**
   * Macht aus dem, was in einer Datei stand, vollständige Elemente: jede fehlende
   * Kennung wird stabil vergeben, jede fehlende Herkunft ist `'gemessen'`.
   *
   * Warum 'gemessen' der Standard ist: Dateien ohne dieses Feld stammen aus der
   * Zeit VOR dieser Welle. Damals konnte der Nutzer nichts hinstellen — alles,
   * was darin steht, kommt aus `tools/export_blueprint.py` und damit aus der PDF.
   */
  private uebernehmeAusstattung(
    elemente: GespeichertesAusstattungElement[]
  ): AusstattungElement[] {
    const vergeben = new Set<string>()
    return elemente.map((el) => ({
      ...el,
      id: eindeutigeKennung(el.id || kennungAusAusstattung(el), vergeben),
      quelle: el.quelle ?? 'gemessen'
    }))
  }

  /**
   * Welches Ausstattungs-Zeichen liegt unter diesem Punkt? (E1)
   *
   * Gegenstück zu `overlappedWall`/`overlappedCorner`, das es für die
   * Ausstattung bisher nicht gab — ohne diese Prüfung war ein Möbel im
   * 2D-Zeichner überhaupt nicht treffbar und damit auch nicht löschbar.
   *
   * Der Punkt wird in das lokale System des Elements ZURÜCKgedreht (die
   * Umkehrung von `floorplanner_view.ausPunkt`) und dann gegen das
   * achsenparallele Rechteck geprüft. Runde Zeichen werden bewusst ebenfalls
   * über ihr umschließendes Rechteck getroffen: die Greifzone ist eine
   * Bedienhilfe, keine Geometrie-Aussage — ein Kreis-Test würde in den vier
   * Ecken nur Fehlgriffe erzeugen.
   *
   * Bei Überlappung gewinnt das FLÄCHENKLEINSTE Element. Sonst läge auf einer
   * Loggia immer die große `flaeche` obenauf, und der Stuhl darauf wäre nie
   * anzuklicken — man würde beim Griff nach dem Stuhl die ganze Loggia treffen.
   */
  public overlappedAusstattung(
    x: number,
    y: number,
    tolerance?: number
  ): AusstattungElement | null {
    // `??` und nicht `||`: die Greif-Vorrangkette fragt mit Toleranz 0 („steht
    // der Zeiger WIRKLICH auf dem Möbel?"), und `0 || 10` wären stillschweigend
    // 10 cm gewesen — die Vorrangkette hätte nie gegriffen, ohne dass irgendwo
    // etwas rot geworden wäre.
    const toleranz = tolerance ?? defaultFloorPlanTolerance
    let treffer: AusstattungElement | null = null
    let kleinsteFlaeche = Infinity

    this.ausstattung.forEach((el) => {
      const w = el.drehung ?? 0
      const cos = Math.cos(w)
      const sin = Math.sin(w)
      const rx = x - el.x
      const ry = y - el.y
      // Rückdrehung um -w: die Umkehrung von (dx·cos - dy·sin, dx·sin + dy·cos).
      const dx = rx * cos + ry * sin
      const dy = -rx * sin + ry * cos

      if (
        Math.abs(dx) <= el.breite / 2 + toleranz &&
        Math.abs(dy) <= el.tiefe / 2 + toleranz
      ) {
        const flaeche = el.breite * el.tiefe
        if (flaeche < kleinsteFlaeche) {
          kleinsteFlaeche = flaeche
          treffer = el
        }
      }
    })

    return treffer
  }

  /**
   * Entfernt EIN Ausstattungs-Zeichen (E1) über seine KENNUNG.
   *
   * Vorher lief das über die Objektreferenz, mit der Begründung, ein gemerkter
   * Index könne zwischen Rückfrage und Bestätigung veralten. Das stimmt — die
   * Referenz veraltet aber genauso, nur unauffälliger: `undo.apply()` lädt den
   * Grundriss neu, und danach ist JEDES Element ein neues Objekt. Ein
   * Löschvorschlag, der ein Rückgängig überlebt, träfe dann auf `indexOf() < 0`
   * und täte still gar nichts. Über die Kennung greift er weiterhin.
   *
   * Die PDF bleibt Grundwahrheit: gelöscht wird die ANZEIGE des Nutzers,
   * neu geladen steht wieder alles da. Rückgabe meldet, ob wirklich etwas
   * entfernt wurde (VERIFIED-EFFECT statt stillem No-Op).
   */
  public entferneAusstattung(id: string): boolean {
    const index = this.ausstattung.findIndex((el) => el.id === id)
    if (index < 0) {
      return false
    }
    this.ausstattung.splice(index, 1)
    return true
  }

  /**
   * Verschiebt EIN Ausstattungs-Zeichen an einen neuen Mittelpunkt (cm) — und
   * macht es dabei zu `'gesetzt'`.
   *
   * Der Herkunfts-Wechsel ist hier fest verdrahtet und NICHT dem Aufrufer
   * überlassen: ein gemessenes Stück, das man wegschiebt, steht nicht mehr da,
   * wo es gemessen wurde. Es weiter als Aufmaß zu führen wäre die eine Lüge,
   * die dieses Projekt sich nicht leisten kann. Der `beleg` bleibt erhalten —
   * er sagt, woher das Stück ursprünglich kam, und ist damit die Spur zurück.
   *
   * Rückgabe meldet, ob wirklich etwas bewegt wurde.
   */
  public verschiebeAusstattung(id: string, x: number, y: number): boolean {
    const el = this.findeAusstattung(id)
    if (!el) {
      return false
    }
    el.x = x
    el.y = y
    el.quelle = 'gesetzt'
    return true
  }

  /**
   * Dreht EIN Ausstattungs-Zeichen um seinen Mittelpunkt (Bogenmaß, absolut) —
   * und macht es dabei ebenfalls zu `'gesetzt'`.
   *
   * Eigene Methode statt eines dritten Arguments an `verschiebeAusstattung`:
   * Drehen und Verschieben sind zwei Handlungen und passieren einzeln (Q/E
   * dreht, ohne zu verschieben). Ein optionales Argument hiesse, bei jedem
   * Verschieben eine Drehung mitzuliefern oder still die alte zu behalten —
   * und „still die alte behalten" ist genau die Sorte Nebenwirkung, die man
   * beim Lesen des Aufrufs nicht sieht.
   *
   * Der Herkunfts-Wechsel gilt hier aus demselben Grund wie beim Verschieben:
   * ein gemessenes Stück, das man dreht, steht nicht mehr so, wie es gemessen
   * wurde. Rückgabe meldet, ob wirklich etwas gedreht wurde.
   */
  public dreheAusstattung(id: string, drehung: number): boolean {
    const el = this.findeAusstattung(id)
    if (!el) {
      return false
    }
    el.drehung = drehung
    el.quelle = 'gesetzt'
    return true
  }

  /**
   * Wie viele Stücke der Nutzer frei gesetzt hat — die Zahl, die auf dem
   * Planblatt steht („N Stück frei gesetzt — kein Aufmaß").
   *
   * Hier und nicht in der Oberfläche, weil beide Auslieferungen (Planer und
   * Doppelklick-Datei) dieselbe Zahl nennen müssen: zwei eigene Zählungen
   * liefen auseinander, sobald jemand eine dritte Herkunft einführt.
   */
  public zaehleGesetzte(): number {
    return this.ausstattung.filter((el) => el.quelle === 'gesetzt').length
  }

  /**
   * Sets a user-defined name for a label key. A blank name clears the override,
   * so the PDF-derived default name shows again.
   */
  public setRoomName(key: string, name: string): void {
    const trimmed = name.trim()
    if (trimmed === '') {
      delete this.roomMeta[key]
    } else {
      this.roomMeta[key] = { ...this.roomMeta[key], name: trimmed }
    }
  }

  /** clear out obsolete floor textures */
  private updateFloorTextures(): void {
    const uuids = Utils.map(this.rooms, (room) => room.getUuid())
    for (const uuid in this.floorTextures) {
      if (!Utils.hasValue(uuids, uuid)) {
        delete this.floorTextures[uuid]
      }
    }
  }

  /** */
  private reset(): void {
    const tmpCorners = this.corners.slice(0)
    const tmpWalls = this.walls.slice(0)
    tmpCorners.forEach((corner) => {
      corner.remove()
    })
    tmpWalls.forEach((wall) => {
      wall.remove()
    })
    this.corners = []
    this.walls = []
  }

  /**
   * Update rooms
   */
  public update(): void {
    this.walls.forEach((wall) => {
      wall.resetFrontBack()
    })

    const roomCorners = this.findRooms(this.corners)
    this.rooms = []
    const scope = this
    roomCorners.forEach((corners) => {
      scope.rooms.push(new Room(scope, corners))
    })
    this.assignOrphanEdges()

    this.updateFloorTextures()
    this.updated_rooms.fire()
  }

  /**
   * Returns the center of the floorplan in the y plane
   */
  public getCenter(): THREE.Vector3 {
    return this.getDimensions(true)
  }

  public getSize(): THREE.Vector3 {
    return this.getDimensions(false)
  }

  public getDimensions(center: boolean): THREE.Vector3 {
    const centerFlag = center || false // otherwise, get size

    let xMin = Infinity
    let xMax = -Infinity
    let zMin = Infinity
    let zMax = -Infinity
    this.corners.forEach((corner) => {
      if (corner.x < xMin) xMin = corner.x
      if (corner.x > xMax) xMax = corner.x
      if (corner.y < zMin) zMin = corner.y
      if (corner.y > zMax) zMax = corner.y
    })
    let ret: THREE.Vector3
    if (xMin == Infinity || xMax == -Infinity || zMin == Infinity || zMax == -Infinity) {
      ret = new THREE.Vector3()
    } else {
      if (centerFlag) {
        // center
        ret = new THREE.Vector3((xMin + xMax) * 0.5, 0, (zMin + zMax) * 0.5)
      } else {
        // size
        ret = new THREE.Vector3(xMax - xMin, 0, zMax - zMin)
      }
    }
    return ret
  }

  private assignOrphanEdges(): void {
    // kinda hacky
    // find orphaned wall segments (i.e. not part of rooms) and
    // give them edges
    const orphanWalls = []
    this.walls.forEach((wall) => {
      if (!wall.backEdge && !wall.frontEdge) {
        wall.orphan = true
        const back = new HalfEdge(null, wall, false)
        back.generatePlane()
        const front = new HalfEdge(null, wall, true)
        front.generatePlane()
        orphanWalls.push(wall)
      }
    })
  }

  /*
   * Find the "rooms" in our planar straight-line graph.
   * Rooms are set of the smallest (by area) possible cycles in this graph.
   * @param corners The corners of the floorplan.
   * @returns The rooms, each room as an array of corners.
   */
  public findRooms(corners: Corner[]): Corner[][] {
    function _calculateTheta(
      previousCorner: Corner,
      currentCorner: Corner,
      nextCorner: Corner
    ): number {
      const theta = Utils.angle2pi(
        previousCorner.x - currentCorner.x,
        previousCorner.y - currentCorner.y,
        nextCorner.x - currentCorner.x,
        nextCorner.y - currentCorner.y
      )
      return theta
    }

    function _removeDuplicateRooms(roomArray: Corner[][]): Corner[][] {
      const results: Corner[][] = []
      const lookup: Record<string, boolean> = {}
      const hashFunc = function (corner: Corner) {
        return corner.id
      }
      const sep = '-'
      for (let i = 0; i < roomArray.length; i++) {
        // rooms are cycles, shift it around to check uniqueness
        let add = true
        const room = roomArray[i]
        let str = ''
        for (let j = 0; j < room.length; j++) {
          const roomShift = Utils.cycle(room, j)
          str = Utils.map(roomShift, hashFunc).join(sep)
          if (lookup.hasOwnProperty(str)) {
            add = false
          }
        }
        if (add) {
          results.push(roomArray[i])
          lookup[str] = true
        }
      }
      return results
    }

    function _findTightestCycle(firstCorner: Corner, secondCorner: Corner): Corner[] {
      const stack: {
        corner: Corner
        previousCorners: Corner[]
      }[] = []

      let next: { corner: Corner; previousCorners: Corner[] } | undefined = {
        corner: secondCorner,
        previousCorners: [firstCorner]
      }
      const visited: Record<string, boolean> = {}
      visited[firstCorner.id] = true

      while (next) {
        // update previous corners, current corner, and visited corners
        const currentCorner = next.corner
        visited[currentCorner.id] = true

        // did we make it back to the startCorner?
        if (next.corner === firstCorner && currentCorner !== secondCorner) {
          return next.previousCorners
        }

        const addToStack: Corner[] = []
        const adjacentCorners = next.corner.adjacentCorners()
        for (let i = 0; i < adjacentCorners.length; i++) {
          const nextCorner = adjacentCorners[i]

          // is this where we came from?
          // give an exception if its the first corner and we aren't at the second corner
          if (
            nextCorner.id in visited &&
            !(nextCorner === firstCorner && currentCorner !== secondCorner)
          ) {
            continue
          }

          // nope, throw it on the queue
          addToStack.push(nextCorner)
        }

        const previousCorners = next.previousCorners.slice(0)
        previousCorners.push(currentCorner)
        if (addToStack.length > 1) {
          // visit the ones with smallest theta first
          const previousCorner = next.previousCorners[next.previousCorners.length - 1]
          addToStack.sort(function (a, b) {
            return (
              _calculateTheta(previousCorner, currentCorner, b) -
              _calculateTheta(previousCorner, currentCorner, a)
            )
          })
        }

        if (addToStack.length > 0) {
          // add to the stack
          addToStack.forEach((corner) => {
            stack.push({
              corner: corner,
              previousCorners: previousCorners
            })
          })
        }

        // pop off the next one
        next = stack.pop()
      }
      return []
    }

    // find tightest loops, for each corner, for each adjacent
    // TODO: optimize this, only check corners with > 2 adjacents, or isolated cycles
    const loops: Corner[][] = []

    corners.forEach((firstCorner) => {
      firstCorner.adjacentCorners().forEach((secondCorner) => {
        loops.push(_findTightestCycle(firstCorner, secondCorner))
      })
    })

    // remove duplicates
    const uniqueLoops = _removeDuplicateRooms(loops)
    //remove CW loops
    const uniqueCCWLoops = Utils.removeIf<Corner[]>(uniqueLoops, Utils.isClockwise)

    return uniqueCCWLoops
  }
}
