import { Floorplan, OEFFNUNGS_VORLAGEN } from '../model/floorplan'
import type { AusstattungElement, AusstattungTyp, Oeffnung, OeffnungsArt } from '../model/floorplan'
import { Wall } from '../model/wall'
import { Corner } from '../model/corner'
import { FloorplannerView, floorplannerModes, AUSSTATTUNG_UMRISS_AB } from './floorplanner_view'
import type { UndoManager } from '../core/undo'
// @ts-ignore — reine Rechnung in Javascript, wie src/axo/*.js (in node prüfbar)
import { verschiebeWandParallel } from '../raum/wand-bewegen.js'

type FloorplannerMode = (typeof floorplannerModes)[keyof typeof floorplannerModes]

/**
 * Wie lange der Zeiger ruhen muss, bis das Objekt darunter zum Löschen
 * vorgeschlagen wird (E1). 700 ms ist die Mitte zwischen zwei Fehlern: zu kurz
 * und die Rückfrage springt einen beim blossen Hinüberfahren an, zu lang und es
 * fühlt sich kaputt an, weil man nicht weiss, ob noch etwas kommt.
 */
const VERWEIL_MS = 700

/**
 * Wie weit der Zeiger wackeln darf, ohne das Verweilen abzubrechen — in
 * BILDSCHIRM-Pixeln, aus demselben Grund wie `GREIF_TOLERANZ_PX`. Ohne diese
 * Toleranz bricht schon das Zittern der Hand (oder ein Trackpad-Rauschen von
 * 1 px) das Verweilen ab, und die Rückfrage erschiene nie.
 */
const VERWEIL_WACKEL_PX = 4

/**
 * Wie nah der Zeiger einer vorhandenen Ecke kommen muss, damit der neue Punkt
 * exakt auf sie fällt (E2). In BILDSCHIRM-Pixeln, aus demselben Grund wie
 * `GREIF_TOLERANZ_PX`. Grosszügiger als die Greifzone (8 px), weil Fangen ein
 * Angebot ist: daneben zu klicken kostet einen Zug, den Anschluss zu verfehlen
 * kostet eine Wand, die in 3D Licht durchlässt.
 */
const FANG_ECKE_PX = 14

/** Auf welche Winkel eingerastet wird: alle 45°. */
const WINKEL_RASTER = Math.PI / 4

/**
 * Wie weit man daneben zielen darf und trotzdem auf dem glatten Winkel landet:
 * 5°. Grösser gedacht war es zuerst — bei 45°-Raster und 10° Fenster liegen
 * die Fenster aber schon bei einem Viertel des Kreises, und eine bewusst
 * schräge Wand liesse sich kaum noch zeichnen.
 */
const WINKEL_TOLERANZ = (5 * Math.PI) / 180

/**
 * Wie lange ein Finger liegen bleiben muss, bis das Loeschen vorgeschlagen wird
 * (E3). Kuerzer als das Verweilen der Maus (700 ms): Aufsetzen und Halten ist
 * schon eine bewusste Handlung, waehrend die Maus auch beim blossen
 * Hinueberfahren über einem Objekt zur Ruhe kommen kann.
 */
const LANGDRUCK_MS = 500

/**
 * Wie weit ein Finger wandern darf, ohne dass daraus ein Wischen wird (E3).
 * Grosszuegiger als die Maus-Toleranz (4 px), weil eine Fingerkuppe breit ist
 * und beim Aufsetzen fast immer ein paar Pixel rutscht.
 */
const FINGER_WACKEL_PX = 10

/**
 * Was gerade zum Löschen vorgeschlagen wird (E1).
 *
 * Die Ausstattung hängt hier an ihrer KENNUNG, nicht mehr an der Objektreferenz:
 * zwischen Vorschlag und Bestätigung darf ein Rückgängig liegen, und das lädt
 * den Grundriss neu (`src/core/undo.ts`). Eine gemerkte Referenz zeigte danach
 * auf ein Objekt, das in keiner Liste mehr steht — das Entfernen täte still
 * nichts. Ecke und Wand bleiben vorerst Referenzen; sie tragen ihre eigene
 * Lösch-Kaskade (`removeAll`/`remove`) und werden gesondert behandelt.
 */
export type LoeschZiel =
  | { art: 'ecke'; ecke: Corner; beschreibung: string }
  | { art: 'wand'; wand: Wall; beschreibung: string }
  | { art: 'ausstattung'; kennung: string; beschreibung: string }
  // Eine VIERTE Variante genügt, damit das Löschen alles erbt (W4): Verweilen,
  // Langdruck, Rückfrage, Escape und der Undo-Schnappschuss liegen bereits in
  // der gemeinsamen Kette und müssen für Öffnungen nicht noch einmal gebaut
  // werden. Auch sie hängt an der KENNUNG, nicht am Objekt.
  | { art: 'oeffnung'; kennung: string; beschreibung: string }

/**
 * Deutsche Namen der Ausstattungs-Zeichen für die Rückfrage (E1) — und seit W3
 * auch für die Beschriftung der Palette.
 *
 * Ausdrücklich EINE Liste für beides: hiesse dasselbe Zeichen in der Palette
 * „Gerät" und in der Lösch-Rückfrage „Fitnessgerät", müsste der Nutzer beim
 * Bestätigen raten, ob er dasselbe wegwirft, das er hingestellt hat.
 */
export const AUSSTATTUNG_NAME: Record<string, string> = {
  tisch: 'Tisch',
  rundtisch: 'Runder Tisch',
  stuhl: 'Stuhl',
  schrank: 'Schrank',
  treppe: 'Treppe',
  wc: 'WC',
  waschbecken: 'Waschbecken',
  kochfeld: 'Kochfeld',
  pflanze: 'Pflanze',
  aufzug: 'Aufzug',
  flaeche: 'Fläche',
  matte: 'Matte',
  geraet: 'Fitnessgerät',
  liege: 'Liege'
}

/**
 * Deutsche Namen der Öffnungsarten (W4) — für die Werkzeugleiste und die
 * Lösch-Rückfrage. EINE Liste für beides, aus demselben Grund wie bei
 * `AUSSTATTUNG_NAME`.
 */
export const OEFFNUNG_NAME: Record<OeffnungsArt, string> = {
  tuer: 'Tür',
  doppeltuer: 'Doppeltür',
  fenster: 'Fenster',
  durchgang: 'Durchgang'
}

/**
 * Wie die Rückfrage die Öffnung benennt — im AKKUSATIV, weil davor „Entfernen:"
 * steht („diesen Durchgang", nicht „dieser Durchgang"). Die vorhandenen Ziele
 * sagen es genauso („diese Wand", „diese Ecke mit allen Wänden daran"); eine
 * abweichende Beugung an einer von vier Stellen fiele als Fehler auf, ohne
 * einer zu sein.
 */
const OEFFNUNG_ARTIKEL: Record<OeffnungsArt, string> = {
  tuer: 'diese Tür',
  doppeltuer: 'diese Doppeltür',
  fenster: 'dieses Fenster',
  durchgang: 'diesen Durchgang'
}

/**
 * Wie weit der Zeiger von einer Wandachse entfernt sein darf, damit dort eine
 * Öffnung angeboten wird — ZUSÄTZLICH zur halben Wanddicke, in cm.
 *
 * In Weltmaß und nicht in Bildschirm-Pixeln, aus demselben Grund wie beim
 * Einrasten der Möbel: „diese Wand bekommt eine Tür" ist eine AUSSAGE ÜBER DIE
 * PLANUNG. Ob der Nutzer herangezoomt hat, darf nicht entscheiden, welche Wand
 * getroffen wird — sonst finge man in der Übersicht die Nachbarwand.
 */
const OEFFNUNG_FANG_CM = 30

/** how much will we move a corner to make a wall axis aligned (cm) */
const snapTolerance = 25

/**
 * Wie nah der Zeiger an einer Wand/Ecke sein muss, damit sie greifbar wird —
 * in BILDSCHIRM-Pixeln, nicht in Zentimetern (T7).
 *
 * Vorher war das eine feste Weltgroesse (10 cm). Solange der Massstab fest war,
 * ging das auf. Seit die Ansicht standardmaessig den ganzen Grundriss zeigt,
 * waeren 10 cm nur noch rund 2 Pixel — die Waende waeren kaum noch zu treffen.
 * Umgekehrt soll die Zone beim Hineinzoomen nicht mitwachsen, sonst greift man
 * im Detail versehentlich die Nachbarwand. Konstant in Pixeln ist beides
 * richtig: bei Zoom 1 entspricht das rund 16 cm, also etwa dem alten Wert.
 */
const GREIF_TOLERANZ_PX = 8

/**
 * Wie nah der RAND eines Möbels an eine Wand kommen muss, damit es sich bündig
 * anlegt (W2, in cm — hier bewusst NICHT in Bildschirm-Pixeln).
 *
 * Der Unterschied zur Greifzone ist grundsätzlich: die Greifzone ist eine
 * Bedienhilfe für den Zeiger und muss darum auf dem Bildschirm konstant bleiben.
 * Das Anlegen ist dagegen eine AUSSAGE ÜBER DIE PLANUNG — „der Schrank steht an
 * der Wand". Ob der Nutzer dabei nah herangezoomt hat oder die ganze Halle
 * sieht, darf das Ergebnis nicht ändern; sonst legte dasselbe Ziehen bei Zoom 2
 * an und bei Zoom 0,2 nicht.
 *
 * 15 cm ist die Mitte zwischen zwei Fehlern: zu klein und man trifft die Wand in
 * der Übersicht nie (1 Bildpunkt sind dort rund 5 cm), zu gross und ein Stück,
 * das bewusst 20 cm vor der Wand stehen soll, klebt gegen den Willen des
 * Nutzers fest.
 */
const EINRAST_WAND_CM = 15

/**
 * Raster, auf das ohne Wand in der Nähe gerundet wird (cm). 5 cm ist grob genug,
 * dass eine Reihe Stühle von selbst auf einer Linie steht, und fein genug, dass
 * man nichts sichtbar verrückt bekommt. Auf ZENTIMETER wird ohnehin immer
 * gerundet (Projekt-DNA Punkt 3: zwei Nachkommastellen suggerieren eine
 * Präzision, die eine freihändig gezeichnete Vorlage nicht hergibt).
 */
const EINRAST_RASTER_CM = 5

/**
 * Schrittweite beim Drehen (Bogenmass, 15°). Klein genug für eine schräge
 * Aufstellung, gross genug, dass 90° in sechs Anschlägen erreicht ist.
 */
const DREH_SCHRITT = Math.PI / 12

/** Was ueber ein Zurueckspielen hinweg erhalten bleiben muss (T5a). */
type AnsichtsZustand = {
  originX: number
  originY: number
  zoom: number
  mode: FloorplannerMode
}

/**
 * Massstab bei Zoomstufe 1 (T7): 30.48 cm je 15 Pixel = 2.032 cm/Pixel.
 * Das ist der Upstream-Wert und bleibt der Bezugspunkt — gezoomt wird als
 * Faktor DARAUF, damit "Zoom 1" weiterhin das gewohnte Bild ergibt.
 */
const BASIS_CM_PRO_PIXEL = 30.48 / 15.0

/**
 * Zoom-Grenzen. Die untere Grenze muss die ganze Halle auf ein Handy bringen:
 * 78 m auf 390 px sind rund 0.09 — mit 0.04 bleibt Luft fuer noch schmalere
 * Geraete und laengere Grundrisse.
 */
const ZOOM_MIN = 0.04
const ZOOM_MAX = 8

/**
 * Rand, den "Alles einpassen" rundherum frei laesst — in PIXELN, nicht in
 * Prozent. Grund: was ueber die Geometrie hinausragt, sind die Massangaben,
 * und die bleiben konstant 12 px gross. Ein prozentualer Rand schrumpft am
 * Handy mit, der Textueberstand nicht — gemessen blieben dort rechts nur noch
 * 2 px Luft. 32 px decken den halben laengsten Text ab.
 */
const EINPASS_RAND_PX = 32

/**
 * The Floorplanner implements an interactive tool for creation of floorplans.
 */
export class Floorplanner {
  /** */
  public mode: FloorplannerMode = floorplannerModes.MOVE

  /** */
  public activeWall: Wall | null = null

  /** */
  public activeCorner: Corner | null = null

  /** */
  public originX = 0

  /** */
  public originY = 0

  /** drawing state */
  public targetX = 0

  /** drawing state */
  public targetY = 0

  /** drawing state */
  public lastNode: Corner | null = null

  /** */
  // @ts-ignore - wallWidth is declared but not used, keeping for future use
  private wallWidth: number

  /** */
  private modeResetCallbacks: Array<(mode: FloorplannerMode) => void> = []

  /** */
  private canvasElement: HTMLCanvasElement

  /** */
  private view: FloorplannerView

  /** */
  private mouseDown = false

  /** */
  private mouseMoved = false

  /** Rueckgaengig-Historie (T5a). Optional: ohne bleibt alles wie zuvor. */
  private undoManager: UndoManager | null = null

  /**
   * Wurde fuer das laufende Ziehen schon gesichert? Ein Ziehen laeuft ueber
   * hunderte mousemove-Ereignisse — ohne diese Sperre waere jedes einzelne ein
   * eigener Undo-Schritt, und ein einmaliges Strg+Z bewegte die Wand um ein
   * unsichtbares Stueck zurueck statt an ihren Ausgangsort.
   */
  private zugGesichert = false

  /** in ThreeJS coords */
  private mouseX = 0

  /** in ThreeJS coords */
  private mouseY = 0

  /** in ThreeJS coords */
  private rawMouseX = 0

  /** in ThreeJS coords */
  private rawMouseY = 0

  /** mouse position at last click */
  private lastX = 0

  /** mouse position at last click */
  private lastY = 0

  /**
   * Zoomstufe (T7). 1 = der gewohnte Upstream-Massstab, kleiner = weiter weg.
   * Frueher war der Massstab eine Konstante — dadurch war die 78 m lange Halle
   * am Rechner nur zu 38 % und am Handy zu 10 % zu sehen, ohne jede Abhilfe.
   */
  private zoom = 1

  /** Abgeleitet aus dem Zoom — nie direkt setzen. */
  private get cmPerPixel(): number {
    return BASIS_CM_PRO_PIXEL / this.zoom
  }

  /** Abgeleitet aus dem Zoom — nie direkt setzen. */
  private get pixelsPerCm(): number {
    return this.zoom / BASIS_CM_PRO_PIXEL
  }

  /** Meldet Zoomstufe + Einpass-Moeglichkeit an die Oberflaeche. */
  private zoomCallbacks: Array<(zoom: number) => void> = []

  // ------------------------------------------------- Löschen per Verweilen (E1)

  /** Was gerade zum Löschen vorgeschlagen ist — `null` heisst: keine Rückfrage. */
  public loeschKandidat: LoeschZiel | null = null

  /**
   * KENNUNG des Ausstattungs-Zeichens, das der Zeiger gerade überdeckt — auch
   * ohne dass schon verweilt wurde. `null` heisst: keines.
   *
   * Bewusst die Kennung und nicht das Objekt: ein Rückgängig baut die Liste neu
   * auf, eine gehaltene Referenz wäre danach eine Leiche, und jede Handlung
   * daran ginge still ins Leere.
   */
  public activeAusstattung: string | null = null

  /**
   * KENNUNG des Stücks, das gerade GEZOGEN wird (W2) — `null` heisst: es läuft
   * kein Zug. Getrennt von `activeAusstattung` und nicht daraus abgeleitet:
   * `activeAusstattung` sagt nur, was der Zeiger überdeckt, und wird bei jeder
   * Bewegung neu bestimmt. Ein laufender Zug muss aber auch dann bei SEINEM
   * Stück bleiben, wenn der Zeiger es beim schnellen Ziehen kurz verlässt —
   * sonst liesse man das Möbel unterwegs fallen.
   */
  private zugKennung: string | null = null

  /**
   * Wo genau das Möbel ANGEFASST wurde: der Versatz zwischen Zeiger und
   * Mittelpunkt in cm, festgehalten beim Drücken. Ohne ihn spränge das Stück
   * beim Anfassen mit seiner Mitte unter den Zeiger — bei einer 3 m langen
   * Tischplatte ein Sprung von anderthalb Metern, und der Nutzer verlöre genau
   * die Stelle, die er im Blick hatte.
   */
  private zugVersatzX = 0
  private zugVersatzY = 0

  /**
   * Rasten gezogene Möbel ein (W2)? Abschaltbar über die Werkzeugleiste.
   *
   * Standardmässig AN, weil ohne Einrasten jedes Stück krumm und ein paar
   * Zentimeter neben der Wand steht und der Nutzer von Hand ausrichten müsste —
   * mit einer freihändigen Maus ist das nicht zu schaffen. Abschaltbar, weil
   * das Einrasten eine ANNAHME trifft („du willst an die Wand"), und eine
   * Annahme, die sich nicht abstellen lässt, ist ein Zwang.
   */
  public einrasten = true

  /** Meldet der Oberfläche, dass sich `einrasten` geändert hat (Knopfzustand). */
  private einrastCallbacks: Array<(an: boolean) => void> = []

  /**
   * Die vorhandene Ecke, auf die der nächste Punkt gerade einrastet (E2), oder
   * `null`. Die Ansicht hebt sie hervor — Einrasten, das man nicht SIEHT, ist
   * kaum besser als keins: man erfährt sonst erst nach dem Klick, ob der
   * Anschluss saß.
   */
  public fangEcke: Corner | null = null

  /** Läuft, solange der Zeiger über einem löschbaren Objekt ruht. */
  private verweilTimer: ReturnType<typeof setTimeout> | null = null

  /** Zeigerposition, an der das aktuelle Verweilen begann (Bildschirm-Pixel). */
  private verweilX = 0
  private verweilY = 0

  /** Meldet der Oberfläche, dass eine Rückfrage zu zeigen (oder zu schliessen) ist. */
  private loeschAnfrageCallbacks: Array<(ziel: LoeschZiel | null) => void> = []

  /** Add a callback for mode reset */
  public addModeResetCallback(callback: (mode: FloorplannerMode) => void): void {
    this.modeResetCallbacks.push(callback)
  }

  /**
   * Die Oberfläche hängt sich hier ein, um die Rückfrage zu zeigen (E1).
   * Wird mit `null` gerufen, sobald der Vorschlag hinfällig ist — die
   * Rückfrage muss also nie selbst raten, wann sie wieder verschwindet.
   */
  public addLoeschAnfrageCallback(callback: (ziel: LoeschZiel | null) => void): void {
    this.loeschAnfrageCallbacks.push(callback)
  }

  /** Startet das Verweilen neu — bei jeder Zeigerbewegung. */
  private verweilenNeuStarten(screenX: number, screenY: number): void {
    this.verweilAbbrechen()
    this.verweilX = screenX
    this.verweilY = screenY
    this.verweilTimer = setTimeout(() => this.verweilenAbgelaufen(), VERWEIL_MS)
  }

  /** Stoppt das Verweilen, ohne einen bestehenden Vorschlag anzutasten. */
  private verweilAbbrechen(): void {
    if (this.verweilTimer !== null) {
      clearTimeout(this.verweilTimer)
      this.verweilTimer = null
    }
  }

  /**
   * Der Zeiger hat lange genug geruht: was liegt darunter? Die Reihenfolge
   * Ecke → Wand → Ausstattung ist dieselbe wie beim Greifen, damit „was ich
   * hervorgehoben sehe" und „was gelöscht wird" nie auseinanderlaufen.
   */
  private verweilenAbgelaufen(): void {
    this.verweilTimer = null
    if (this.mode != floorplannerModes.DELETE || this.mouseDown) {
      return
    }
    this.loeschVorschlagen()
  }

  /**
   * Schlägt das Objekt unter dem Zeiger zum Löschen vor. Gemeinsamer Weg für
   * das Verweilen und den direkten Klick — beide müssen dieselbe Rückfrage
   * auslösen, sonst gäbe es einen Pfad, der ohne Nachfrage löscht.
   */
  private loeschVorschlagen(): boolean {
    let ziel: LoeschZiel | null = null
    if (this.activeCorner) {
      ziel = { art: 'ecke', ecke: this.activeCorner, beschreibung: 'diese Ecke mit allen Wänden daran' }
    } else if (this.activeWall) {
      ziel = { art: 'wand', wand: this.activeWall, beschreibung: this.wandBeschreibung(this.activeWall) }
    } else if (this.activeAusstattung) {
      // Nachschlagen statt Merken: die Kennung ist beständig, das Objekt nicht.
      // Findet sich nichts, ist das Stück inzwischen weg — dann gibt es auch
      // nichts vorzuschlagen.
      const el = this.floorplan.findeAusstattung(this.activeAusstattung)
      if (el) {
        ziel = {
          art: 'ausstattung',
          kennung: el.id,
          beschreibung: AUSSTATTUNG_NAME[el.typ] ?? el.typ
        }
      }
    }

    // Die Öffnung steht ZULETZT in dieser Kette und trotzdem VORNE beim
    // Greifen (`trefferBestimmen`): sie wird nur dann überhaupt gemerkt, wenn
    // der Zeiger wirklich auf ihr steht — dann ist aber weder Ecke noch Wand
    // noch Möbel gesetzt, und dieser Zweig ist der einzige, der greift.
    if (!ziel && this.activeOeffnung) {
      const o = this.floorplan.findeOeffnung(this.activeOeffnung)
      if (o) {
        ziel = {
          art: 'oeffnung',
          kennung: o.id,
          beschreibung: this.oeffnungsBeschreibung(o)
        }
      }
    }

    if (!ziel) {
      return false
    }
    this.loeschKandidat = ziel
    this.view.draw()
    this.loeschAnfrageCallbacks.forEach((cb) => cb(ziel))
    return true
  }

  /**
   * „diese Wand (3,63 m lang)" — damit die Rückfrage benennt, was verschwindet.
   * Zwei Nachkommastellen in Metern, also Zentimeter: dieselbe Genauigkeit wie
   * `Dimensioning.cmToMeasure` (Projekt-DNA Punkt 3 — eine dritte Stelle wäre
   * Scheingenauigkeit, der Plan ist freihändig gezeichnet).
   */
  private wandBeschreibung(wand: Wall): string {
    const dx = wand.getEndX() - wand.getStartX()
    const dy = wand.getEndY() - wand.getStartY()
    const laengeM = Math.hypot(dx, dy) / 100
    return `diese Wand (${laengeM.toFixed(2).replace('.', ',')} m lang)`
  }

  /**
   * Nimmt den Vorschlag zurück, ohne zu löschen — bei Zeigerbewegung, Escape,
   * Moduswechsel oder wenn die Oberfläche „Abbrechen" meldet.
   */
  public loeschungAbbrechen(): void {
    this.verweilAbbrechen()
    if (this.loeschKandidat === null) {
      return
    }
    this.loeschKandidat = null
    this.view.draw()
    this.loeschAnfrageCallbacks.forEach((cb) => cb(null))
  }

  /**
   * Führt die bestätigte Löschung aus (E1). Der Undo-Schnappschuss wird ERST
   * hier gezogen, nicht schon beim Vorschlagen: ein weggeklickter Vorschlag
   * darf die Historie nicht mit Leerschritten füllen.
   *
   * Rückgabe meldet, ob wirklich etwas verschwunden ist — ein stilles „ist
   * erledigt" ohne gemessene Wirkung wäre eine Behauptung, kein Beweis.
   */
  public loeschungBestaetigen(): boolean {
    const ziel = this.loeschKandidat
    if (!ziel) {
      return false
    }

    this.undoManager?.snapshot()
    let entfernt = false

    if (ziel.art === 'ecke') {
      ziel.ecke.removeAll()
      entfernt = true
    } else if (ziel.art === 'wand') {
      ziel.wand.remove()
      entfernt = true
    } else if (ziel.art === 'oeffnung') {
      entfernt = this.floorplan.entferneOeffnung(ziel.kennung)
    } else {
      entfernt = this.floorplan.entferneAusstattung(ziel.kennung)
    }

    // Der Vorschlag ist verbraucht, und was gelöscht wurde, kann der Zeiger
    // nicht mehr überdecken — sonst schlüge das nächste Verweilen dasselbe
    // (jetzt verschwundene) Objekt erneut vor.
    this.loeschKandidat = null
    this.activeCorner = null
    this.activeWall = null
    this.activeAusstattung = null
    this.activeOeffnung = null
    this.view.draw()
    this.loeschAnfrageCallbacks.forEach((cb) => cb(null))
    return entfernt
  }

  /**
   * Haengt die Rueckgaengig-Historie an (T5a) und meldet ihr, wie die Ansicht
   * ueber ein Zurueckspielen zu retten ist. Ohne diesen Aufruf verhaelt sich
   * der Floorplanner exakt wie zuvor.
   */
  public setUndoManager(undoManager: UndoManager | null): void {
    this.undoManager = undoManager
    if (!undoManager) {
      return
    }
    undoManager.setViewStateHandler({
      save: (): AnsichtsZustand => ({
        originX: this.originX,
        originY: this.originY,
        zoom: this.zoom,
        mode: this.mode
      }),
      restore: (zustand: unknown): void => {
        const a = zustand as AnsichtsZustand
        this.originX = a.originX
        this.originY = a.originY
        // Ohne den Zoom spraenge die Ansicht bei jedem Strg+Z auf
        // "alles einpassen" zurueck, weil reset() das inzwischen tut.
        this.zoom = a.zoom
        // setMode nullt lastNode — genau richtig: die zuletzt gesetzte Ecke
        // kann nach dem Zurueckspielen verschwunden sein, ein Anschluss daran
        // waere ein Geist. setMode zeichnet die Ansicht gleich mit neu.
        this.setMode(a.mode)
      }
    })
  }

  /** Provides jQuery-style Callbacks API for backward compatibility */
  public get modeResetCallbacksAPI(): {
    add: (callback: (mode: FloorplannerMode) => void) => void
  } {
    return {
      add: (callback: (mode: FloorplannerMode) => void) => this.addModeResetCallback(callback)
    }
  }

  /** */
  constructor(
    canvas: string,
    private floorplan: Floorplan
  ) {
    this.canvasElement = document.getElementById(canvas) as HTMLCanvasElement

    this.view = new FloorplannerView(this.floorplan, this, canvas)

    this.wallWidth = 10.0 * this.pixelsPerCm

    // Initialization:

    this.setMode(floorplannerModes.MOVE)

    this.canvasElement.addEventListener('mousedown', () => {
      this.mousedown()
    })
    this.canvasElement.addEventListener('mousemove', (event: MouseEvent) => {
      this.mousemove(event)
    })
    this.canvasElement.addEventListener('mouseup', () => {
      this.mouseup()
    })
    this.canvasElement.addEventListener('mouseleave', () => {
      this.mouseleave()
    })

    // --- Zoom per Mausrad (T7). passive:false, weil preventDefault noetig ist:
    // sonst scrollt die Seite statt zu zoomen.
    this.canvasElement.addEventListener(
      'wheel',
      (e: WheelEvent) => {
        e.preventDefault()
        const rect = this.canvasElement.getBoundingClientRect()
        // Ein Rasten des Rades = 10 %. deltaY ist geraeteabhaengig gross,
        // deshalb nur die Richtung auswerten.
        const faktor = e.deltaY < 0 ? 1.1 : 1 / 1.1
        this.zoomeAufPunkt(this.zoom * faktor, e.clientX - rect.left, e.clientY - rect.top)
      },
      { passive: false }
    )

    // --- Navigation per Finger (T7): schieben mit einem, zoomen mit zweien.
    // BEWUSST nur Navigation — Waende bearbeiten bleibt am Handy ungeloest
    // (eigener Task TOUCH). preventDefault unterdrueckt zugleich die
    // Maus-Emulation des Browsers, sonst loeste ein Tippen ungewollt das
    // Zeichnen- oder Loeschen-Werkzeug aus.
    this.canvasElement.addEventListener('touchstart', (e: TouchEvent) => this.fingerStart(e), {
      passive: false
    })
    this.canvasElement.addEventListener('touchmove', (e: TouchEvent) => this.fingerBewegt(e), {
      passive: false
    })
    this.canvasElement.addEventListener('touchend', () => this.fingerEnde(), { passive: false })
    this.canvasElement.addEventListener('touchcancel', () => this.fingerEnde(), { passive: false })

    document.addEventListener('keyup', (e: KeyboardEvent) => {
      if (e.keyCode == 27) {
        this.escapeKey()
      }
    })

    // --- Drehen mit Q/E (W2). Auf `keydown` und nicht `keyup`, damit Halten
    // wiederholt dreht — eine Vierteldrehung sind sechs Anschläge.
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      // Strg+Z/Y gehören der Historie, und in einem Eingabefeld ist ein „e"
      // ein Buchstabe. Beides hier durchzulassen hiesse, dem Nutzer beim
      // Tippen den Grundriss zu verdrehen.
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return
      }
      const ziel = e.target as HTMLElement | null
      if (
        ziel &&
        (ziel.tagName === 'INPUT' || ziel.tagName === 'TEXTAREA' || ziel.isContentEditable)
      ) {
        return
      }
      const taste = (e.key || '').toLowerCase()
      if (taste !== 'q' && taste !== 'e') {
        return
      }
      // WELCHE Bedeutung die beiden Tasten haben, entscheidet das Werkzeug
      // (W4): im Verschieben drehen sie ein Möbel, im Öffnungs-Werkzeug wenden
      // sie Anschlag (Q) und Aufschlagseite (E). Zwei Bedeutungen für zwei
      // Werkzeuge sind weniger Last als vier Tasten — und ein Möbel gibt es im
      // Öffnungs-Werkzeug ohnehin nicht zu greifen.
      const gewirkt =
        this.mode == floorplannerModes.OEFFNUNG
          ? this.wendeAktiveOeffnung(taste === 'q' ? 'anschlag' : 'seite')
          : this.dreheAktives(taste === 'q' ? -1 : 1)
      if (gewirkt) {
        e.preventDefault()
      }
    })

    floorplan.roomLoadedCallbacks.add(() => {
      this.reset()
    })
  }

  /** */
  private escapeKey(): void {
    // Escape nimmt zuerst die Rückfrage zurück, nicht gleich das Werkzeug (E1).
    // Sonst hätte ein Abbrechen zwei Wirkungen auf einmal, und wer nur „doch
    // nicht löschen" meinte, müsste das Löschen-Werkzeug neu greifen.
    if (this.loeschKandidat) {
      this.loeschungAbbrechen()
      return
    }
    // Beim Zeichnen beendet Escape zuerst den laufenden Streckenzug (E2), ohne
    // das Werkzeug wegzunehmen: nach einer fertigen Wand will man meist gleich
    // die nächste ziehen, nicht erst „Wände zeichnen" neu greifen. Ein zweites
    // Escape legt dann das Werkzeug zurück.
    if (this.mode == floorplannerModes.DRAW && this.lastNode) {
      this.lastNode = null
      this.fangEcke = null
      this.updateTarget()
      return
    }
    this.setMode(floorplannerModes.MOVE)
  }

  /**
   * Wohin der nächste Punkt WIRKLICH gesetzt wird (E2) — zwei Einrastungen,
   * in dieser Reihenfolge:
   *
   * 1. AN EINE VORHANDENE ECKE. Wichtigster Fall: eine neue Trennwand soll an
   *    die Aussenwand anschliessen. Ohne Fang landet der Punkt ein paar
   *    Zentimeter daneben — sichtbar erst in 3D, wo dann Licht durch den Spalt
   *    fällt. Der Fang gewinnt IMMER, denn ein exakter Anschluss ist
   *    wertvoller als ein glatter Winkel.
   *
   * 2. AUF EINEN GLATTEN WINKEL zur zuletzt gesetzten Ecke (0°, 45°, 90°, …).
   *
   * Warum Winkel statt der bisherigen Achsen-Prüfung: vorher wurde x oder y auf
   * die letzte Ecke gezogen, wenn die Differenz unter 25 cm lag. Das ist ein
   * ABSOLUTES Fenster — bei einer 6 m langen Wand entspricht es rund 2,4°, man
   * verfehlt die Waagerechte also fast immer. Ein Winkelfenster ist von der
   * Länge unabhängig: nah an der letzten Ecke ebenso treffsicher wie weit weg.
   */
  private updateTarget(): void {
    if (this.mode != floorplannerModes.DRAW) {
      this.targetX = this.mouseX
      this.targetY = this.mouseY
      this.fangEcke = null
      this.view.draw()
      return
    }

    // --- 1. an eine vorhandene Ecke fangen
    const fangToleranz = FANG_ECKE_PX * this.cmPerPixel
    const fang = this.floorplan.overlappedCorner(this.mouseX, this.mouseY, fangToleranz)
    if (fang && fang !== this.lastNode) {
      this.targetX = fang.x
      this.targetY = fang.y
      this.fangEcke = fang
      this.view.draw()
      return
    }
    this.fangEcke = null

    // --- 2. auf einen glatten Winkel einrasten
    if (this.lastNode) {
      const dx = this.mouseX - this.lastNode.x
      const dy = this.mouseY - this.lastNode.y
      const laenge = Math.hypot(dx, dy)
      if (laenge > 0) {
        const winkel = Math.atan2(dy, dx)
        const gerastet = Math.round(winkel / WINKEL_RASTER) * WINKEL_RASTER
        // Differenz normalisiert auf -PI..PI, sonst gilt der Sprung bei +/-180°
        // als riesige Abweichung und rastet dort nie ein.
        let abweichung = winkel - gerastet
        while (abweichung > Math.PI) abweichung -= 2 * Math.PI
        while (abweichung < -Math.PI) abweichung += 2 * Math.PI

        if (Math.abs(abweichung) <= WINKEL_TOLERANZ) {
          this.targetX = this.lastNode.x + Math.cos(gerastet) * laenge
          this.targetY = this.lastNode.y + Math.sin(gerastet) * laenge
          this.view.draw()
          return
        }
      }
    }

    this.targetX = this.mouseX
    this.targetY = this.mouseY
    this.view.draw()
  }

  /**
   * Länge der Strecke, die gerade gezogen wird (E2) — in cm, `null` wenn nicht
   * gezeichnet wird. Die Ansicht schreibt sie als Meterangabe an die Linie:
   * ohne sie zeichnet man ins Blaue und misst erst hinterher nach.
   */
  public zeichenLaenge(): number | null {
    if (this.mode != floorplannerModes.DRAW || !this.lastNode) {
      return null
    }
    return Math.hypot(this.targetX - this.lastNode.x, this.targetY - this.lastNode.y)
  }

  /** */
  private mousedown(): void {
    this.mouseDown = true
    this.mouseMoved = false
    this.zugGesichert = false
    this.lastX = this.rawMouseX
    this.lastY = this.rawMouseY

    // --- Möbel greifen (W2)
    //
    // Der Griff wird HIER festgehalten und nicht erst bei der ersten Bewegung:
    // `trefferBestimmen` läuft nur, solange die Taste OBEN ist, `mouseX/mouseY`
    // stehen also beim Drücken noch auf derselben Stelle wie beim letzten
    // Hinüberfahren. Wartete man auf die erste Bewegung, wäre der Versatz schon
    // um deren Weg verfälscht — das Möbel spränge um genau diesen Betrag.
    this.zugKennung = null
    if (this.mode == floorplannerModes.MOVE && this.activeAusstattung) {
      // Über DIESELBE Methode wie der Axonometrie-Weg (W7): der Versatz wird
      // an genau einer Stelle gerechnet.
      if (!this.zugBeginnen(this.activeAusstattung, this.mouseX, this.mouseY)) {
        // Das überdeckte Stück gibt es nicht mehr (gelöscht, zurückgespielt).
        // Die Merkung MUSS weg, sonst bliebe sie liegen und sperrte über die
        // Schwenk-Bedingung unten die Ansicht — ein Fleck, in dem der Zeiger
        // nichts mehr bewirkt und niemand wüsste, warum.
        this.activeAusstattung = null
      }
    }
    // --- Eine vorhandene Öffnung greifen (W4). Der Griff-Versatz wird HIER
    // festgehalten, aus demselben Grund wie beim Möbel: sonst spränge eine
    // 1,75 m breite Doppeltür mit ihrer Mitte unter den Zeiger.
    this.zugOeffnung = null
    if (this.mode == floorplannerModes.OEFFNUNG && this.activeOeffnung) {
      const o = this.floorplan.findeOeffnung(this.activeOeffnung)
      const g = o ? this.floorplan.oeffnungsGeometrie(o) : null
      const wand = o ? this.floorplan.findeWand(o.wandId) : null
      if (o && g && wand) {
        this.zugOeffnung = o.id
        const amZeiger =
          (this.mouseX - wand.getStartX()) * g.ex + (this.mouseY - wand.getStartY()) * g.ey
        this.zugOeffnungVersatz = o.lage - amZeiger
        // Der Geist muss weg, solange gezogen wird: sonst stünden zwei
        // Öffnungen im Bild, von denen nur eine existiert.
        this.geistOeffnung = null
      } else {
        this.activeOeffnung = null
      }
    }

    this.zeigerStilSetzen()

    // delete
    if (this.mode == floorplannerModes.DELETE) {
      // Seit E1 löscht der Klick NICHT mehr sofort, sondern schlägt dasselbe
      // vor wie das Verweilen. Vorher war ein Fehlklick unwiederbringlich
      // schnell: ein Griff daneben, und die Wand war weg — der Undo-Schritt
      // rettete zwar die Daten, aber niemand sah, was gerade verschwand.
      this.verweilAbbrechen()
      if (!this.loeschVorschlagen()) {
        // Klick ins Leere: Werkzeug zurücklegen (wie bisher) und einen etwaigen
        // offenen Vorschlag zurücknehmen.
        this.loeschungAbbrechen()
        this.setMode(floorplannerModes.MOVE)
      }
    }
  }

  /**
   * Zeigerposition setzen — aus Bildschirm- werden Weltkoordinaten (E3).
   * Herausgezogen, damit FINGER und MAUS denselben Weg nehmen. Zwei eigene
   * Umrechnungen waeren zwei Wahrheiten, die auseinanderlaufen, sobald jemand
   * am Zoom oder am Ursprung etwas aendert.
   */
  private zeigerSetzen(clientX: number, clientY: number): void {
    this.rawMouseX = clientX
    this.rawMouseY = clientY
    const rect = this.canvasElement.getBoundingClientRect()
    this.mouseX = (clientX - rect.left) * this.cmPerPixel + this.originX * this.cmPerPixel
    this.mouseY = (clientY - rect.top) * this.cmPerPixel + this.originY * this.cmPerPixel
  }

  /**
   * Was liegt unter dem Zeiger? Setzt activeCorner/activeWall/activeAusstattung
   * und meldet, ob sich dabei etwas geaendert hat (E3, aus `mousemove`
   * herausgezogen — der Finger braucht dieselbe Trefferlogik).
   */
  private trefferBestimmen(): boolean {
    // Greifzone in Weltkoordinaten umrechnen, damit sie auf dem Bildschirm
    // bei jedem Zoom gleich gross bleibt (T7).
    const toleranz = GREIF_TOLERANZ_PX * this.cmPerPixel

    // Ausstattung ist greifbar, solange sie auch GEZEICHNET wird (sonst liesse
    // sich Unsichtbares anfassen) — im Löschen-Werkzeug (E1) und seit W2 auch
    // im Verschieben-Werkzeug, wo sie gezogen wird. In beiden Fällen bewirkt
    // ein Griff etwas; im Zeichnen-Werkzeug täte er nichts und nähme nur den
    // Ecken-Fang die Sicht.
    const ausstattungGreifbar =
      (this.mode == floorplannerModes.DELETE || this.mode == floorplannerModes.MOVE) &&
      this.pixelProCm() >= AUSSTATTUNG_UMRISS_AB

    // --- VORRANG: steht der Zeiger WIRKLICH auf einem Möbel? (Toleranz 0)
    //
    // Warum das die alte Reihenfolge (Ecke -> Wand -> Ausstattung) umdreht:
    // die Greifzone von 8 BILDSCHIRM-Pixeln ist in Weltmaß nur bei starkem
    // Zoom klein. In der Übersicht (78 m auf 1400 px) sind es 45 cm, am Handy
    // über 60 cm — gegen die 289 gemessenen Stücke gerechnet greifen dort 18
    // bis 28 % der Möbel die WAND statt sich selbst. Der Nutzer will den Stuhl
    // anfassen und verschiebt gemessene Bausubstanz.
    //
    // Toleranz 0 ist der springende Punkt: der Vorrang gilt nur INNERHALB des
    // (gedrehten) Möbel-Rechtecks. Wer knapp daneben zielt, trifft weiterhin
    // zuerst Ecke und Wand — die Wand bleibt also unverändert gut greifbar,
    // solange kein Möbel im Weg steht.
    //
    // Seit W10 hat diese Kette nur noch im LÖSCHEN-Werkzeug beide Seiten (dort
    // sind Möbel UND Bausubstanz greifbar) — im Verschieben gibt es keine
    // Bausubstanz mehr zu verlieren, im Wand-Werkzeug keine Möbel. Sie bleibt
    // trotzdem hier und wird dort gemessen: das Löschen ist der Fall, in dem
    // ein Fehlgriff am teuersten ist.
    //
    // GRIFF NACH DEM KLEINSTEN TREFFER, nicht nach dem nächstgelegenen: liegt
    // der Zeiger in mehreren Möbel-Rechtecken (Stuhl unter Tisch — in einer
    // echten Aufstellung der Normalfall), gewinnt das mit der kleinsten
    // Fläche. Diese Regel steht in `Floorplan.overlappedAusstattung` und gilt
    // damit für Maus, Finger und Blatt in EINER Fassung.
    const drauf = ausstattungGreifbar
      ? this.floorplan.overlappedAusstattung(this.mouseX, this.mouseY, 0)
      : null

    // --- ÖFFNUNGEN haben den ALLERERSTEN Vorrang (W4), und zwar nur im
    // Löschen- und im Öffnungs-Werkzeug.
    //
    // Warum ganz vorne: eine Öffnung liegt IN einer Wand. Ohne Vorrang gewänne
    // immer die Wand, und eine Tür wäre weder zu löschen noch zu ziehen —
    // stattdessen zöge man die Wand, in der sie sitzt. Warum nur in diesen
    // beiden Werkzeugen: im Wand-Werkzeug soll ein Griff auf die Wand die WAND
    // bewegen (mit der Tür darin), und im Zeichnen nähme der Vorrang dem
    // Ecken-Fang die Sicht.
    const oeffnungGreifbar =
      this.mode == floorplannerModes.DELETE || this.mode == floorplannerModes.OEFFNUNG
    const hoverOeffnung = oeffnungGreifbar
      ? this.floorplan.overlappedOeffnung(this.mouseX, this.mouseY, toleranz)
      : null

    // --- BAUSUBSTANZ ist nur da greifbar, wo ein Griff auch gemeint sein kann
    // (W10). Im VERSCHIEBEN-Werkzeug ist sie es seit W10 NICHT mehr: dort werden
    // Möbel gezogen, und derselbe Zug auf eine Ecke verschob gemessen die
    // Aussenwand um 2,24 m. Wer eine Wand bewegen will, greift das
    // Wand-Werkzeug — dieselbe Trennung, die der Finger seit W8 hat.
    //
    // Die Sperre sitzt HIER und nicht erst im Zug: `activeCorner`/`activeWall`
    // tragen ausser dem Ziehen noch drei Bedeutungen — die Hervorhebung im
    // Bild, den Löschvorschlag und die Schwenk-Sperre in `mousemove`. Würde
    // nur der Zug abgeklemmt, leuchtete die Wand im Verschieben weiter auf und
    // der Plan liesse sich über ihr nicht mehr schwenken: ein Fleck, in dem
    // der Zeiger nichts tut und niemand wüsste, warum.
    const bausubstanzGreifbar =
      this.mode == floorplannerModes.DELETE || this.mode == floorplannerModes.WAND

    const hoverCorner =
      hoverOeffnung || drauf || !bausubstanzGreifbar
        ? null
        : this.floorplan.overlappedCorner(this.mouseX, this.mouseY, toleranz)
    const hoverWall =
      // `hoverOeffnung` MUSS hier stehen, nicht nur bei der Ecke: eine Öffnung
      // liegt IN einer Wand, und ohne diese Zeile gewinnt die Wand jedes Mal.
      // Gemessen, nicht vermutet — genau das meldete das Gate beim ersten Lauf:
      // der Zeiger fand die Tür, die Rückfrage bot trotzdem „diese Wand" an.
      hoverOeffnung || drauf || hoverCorner || !bausubstanzGreifbar // corner takes precendence
        ? null
        : this.floorplan.overlappedWall(this.mouseX, this.mouseY, toleranz)
    // Ausserhalb jedes Möbels gilt die alte Reihenfolge: erst Ecke, dann Wand,
    // und die Ausstattung nur, wenn beides frei ist — dann aber mit der vollen
    // Greifzone, damit ein Möbel auch knapp daneben noch anzufassen ist.
    const hoverAusstattung = drauf
      ? drauf
      : ausstattungGreifbar && !hoverCorner && !hoverWall
        ? this.floorplan.overlappedAusstattung(this.mouseX, this.mouseY, toleranz)
        : null

    let draw = false
    if (hoverCorner != this.activeCorner) {
      this.activeCorner = hoverCorner
      draw = true
    }
    if (hoverWall != this.activeWall) {
      this.activeWall = hoverWall
      draw = true
    }
    // Gemerkt wird die KENNUNG, nicht das Objekt (siehe `activeAusstattung`).
    const kennung = hoverAusstattung ? hoverAusstattung.id : null
    if (kennung != this.activeAusstattung) {
      this.activeAusstattung = kennung
      draw = true
    }
    const oKennung = hoverOeffnung ? hoverOeffnung.id : null
    if (oKennung != this.activeOeffnung) {
      this.activeOeffnung = oKennung
      draw = true
    }

    return draw
  }

  /** */
  private mousemove(event: MouseEvent): void {
    this.mouseMoved = true
    this.zeigerSetzen(event.clientX, event.clientY)

    // update target (snapped position of actual mouse)
    if (
      this.mode == floorplannerModes.DRAW ||
      ((this.mode == floorplannerModes.MOVE || this.mode == floorplannerModes.WAND) &&
        this.mouseDown)
    ) {
      this.updateTarget()
    }

    // update object target
    if (this.mode != floorplannerModes.DRAW && !this.mouseDown) {
      if (this.trefferBestimmen()) {
        this.zeigerStilSetzen()
        this.view.draw()
      }

      // --- Die Geister-Öffnung folgt dem Zeiger (W4). IMMER neu bestimmen und
      // nicht nur bei einem Treffer-Wechsel: sie wandert entlang derselben
      // Wand mit, und ein Treffer-Wechsel findet dabei gar nicht statt.
      if (this.mode == floorplannerModes.OEFFNUNG) {
        this.geistNeuBestimmen()
        this.view.draw()
      }

      // --- Verweilen (E1)
      // Steht bereits eine Rückfrage, bleibt sie stehen, bis entschieden ist.
      // Sie bei Mausbewegung zurückzunehmen wäre naheliegend und FALSCH: der
      // Weg zum Ja-Knopf führt über den Zeichenbereich, die Rückfrage löste
      // sich also genau dann auf, wenn man sie bestätigen will. Weg von ihr
      // kommt man über Escape, einen Klick ins Leere oder das Werkzeug.
      if (this.loeschKandidat === null) {
        // Die Wackel-Toleranz ist nötig, weil eine ruhende Hand trotzdem
        // einzelne Pixel-Ereignisse erzeugt — ohne sie liefe die Uhr nie ab.
        const wackel = Math.hypot(this.rawMouseX - this.verweilX, this.rawMouseY - this.verweilY)
        if (wackel > VERWEIL_WACKEL_PX) {
          const etwasUnterDemZeiger =
            this.activeCorner != null ||
            this.activeWall != null ||
            this.activeAusstattung != null ||
            this.activeOeffnung != null
          if (this.mode == floorplannerModes.DELETE && etwasUnterDemZeiger) {
            this.verweilenNeuStarten(this.rawMouseX, this.rawMouseY)
          } else {
            this.verweilAbbrechen()
            this.verweilX = this.rawMouseX
            this.verweilY = this.rawMouseY
          }
        }
      }
    }

    // panning
    //
    // `!this.activeAusstattung` gehört zwingend dazu, seit ein Möbel gezogen
    // werden kann (W2): sonst wanderte das Möbel UND der Plan unter ihm gleich
    // mit — der Zeiger führte zwei Bewegungen auf einmal aus, und das Stück
    // landete nie dort, wo man es hinzieht. GEMESSEN, nicht vermutet: ohne
    // diese Bedingung legt derselbe Zug das Stück rund doppelt so weit.
    // `!this.zugOeffnung` aus demselben Grund (W4): sonst wanderte die Tür und
    // der Plan unter ihr gleich mit.
    if (
      this.mouseDown &&
      !this.activeCorner &&
      !this.activeWall &&
      !this.activeAusstattung &&
      !this.zugOeffnung
    ) {
      this.originX += this.lastX - this.rawMouseX
      this.originY += this.lastY - this.rawMouseY
      this.lastX = this.rawMouseX
      this.lastY = this.rawMouseY
      this.view.draw()
    }

    // --- Eine gegriffene Öffnung entlang ihrer Wand ziehen (W4). Der
    // Schnappschuss erst hier, nicht schon beim Drücken: ein Druck ohne
    // Bewegung ändert nichts und soll die Historie nicht füllen.
    if (this.mode == floorplannerModes.OEFFNUNG && this.mouseDown && this.zugOeffnung) {
      if (!this.zugGesichert) {
        this.undoManager?.snapshot()
        this.zugGesichert = true
      }
      this.oeffnungZiehen()
      this.view.draw()
    }

    // dragging — MÖBEL im Verschieben-Werkzeug
    //
    // Die Kette „Möbel, sonst Ecke, sonst Wand" ist mit W10 in zwei Werkzeuge
    // zerlegt. Sie stand hier, weil beides dasselbe Werkzeug war; getrennt
    // braucht keiner der beiden Zweige mehr ein `else`, und ein Zug kann schon
    // von der Bauart her nicht mehr das Falsche treffen.
    if (this.mode == floorplannerModes.MOVE && this.mouseDown) {
      // Den Schnappschuss zieht `zugSchritt` selbst (W7), und zwar erst beim
      // ersten Schritt, der WIRKLICH etwas ändert — damit der Axonometrie-Weg
      // dieselbe Regel bekommt und nicht eine zweite daneben.
      if (this.zugKennung) {
        this.moebelZiehen()
        this.view.draw()
      }
    }

    // dragging — BAUSUBSTANZ im Wand-Werkzeug (W10)
    if (this.mode == floorplannerModes.WAND && this.mouseDown) {
      // Erst hier sichern, nicht schon bei mousedown: ein Druck auf eine Wand
      // ohne Bewegung (oder ein Schwenk der Ansicht) aendert nichts und soll
      // die Historie nicht mit Leerschritten fuellen.
      if ((this.activeCorner || this.activeWall) && !this.zugGesichert) {
        this.undoManager?.snapshot()
        this.zugGesichert = true
      }
      if (this.activeCorner) {
        this.activeCorner.move(this.mouseX, this.mouseY)
        this.activeCorner.snapToAxis(snapTolerance)
      } else if (this.activeWall) {
        this.activeWall.relativeMove(
          (this.rawMouseX - this.lastX) * this.cmPerPixel,
          (this.rawMouseY - this.lastY) * this.cmPerPixel
        )
        this.activeWall.snapToAxis(snapTolerance)
        this.lastX = this.rawMouseX
        this.lastY = this.rawMouseY
      }
      this.view.draw()
    }
  }

  /** */
  private mouseup(): void {
    this.mouseDown = false
    // Das gezogene Stück ist abgelegt. Die Merkung MUSS hier fallen, auch wenn
    // gar nichts bewegt wurde — sonst zöge der nächste Druck irgendwo im Bild
    // stillschweigend dasselbe Möbel weiter.
    this.zugBeenden()

    // --- Öffnung: ein beendeter ZUG setzt nichts Neues (W4).
    //
    // Ohne diese Unterscheidung entstünde beim Loslassen einer gerade
    // verschobenen Tür sofort eine zweite an derselben Stelle — und die wäre
    // nach der Überlappungsregel auch noch abgelehnt worden, sodass der Nutzer
    // eine Fehlermeldung für eine Handlung bekäme, die er gar nicht gemacht hat.
    if (this.mode == floorplannerModes.OEFFNUNG) {
      if (this.zugOeffnung) {
        this.zugOeffnung = null
        this.geistNeuBestimmen()
        this.view.draw()
      } else {
        // Nur melden, wenn überhaupt eine Wand angeboten war: ein Klick ins
        // Leere ist kein Fehlversuch, sondern gar kein Versuch.
        const angeboten = this.geistOeffnung !== null
        const gesetzt = this.oeffnungSetzen()
        this.geistNeuBestimmen()
        this.view.draw()
        if (angeboten) {
          this.oeffnungGesetztCallbacks.forEach((cb) => cb(gesetzt))
        }
      }
    }
    this.zeigerStilSetzen()

    // drawing
    if (this.mode == floorplannerModes.DRAW && !this.mouseMoved) {
      // Jeder gesetzte Punkt ist ein eigener Zug: beim Zeichnen eines
      // Streckenzugs nimmt Strg+Z Punkt fuer Punkt zurueck, nicht alles auf einmal.
      this.undoManager?.snapshot()
      const corner = this.floorplan.newCorner(this.targetX, this.targetY)
      if (this.lastNode != null) {
        // M2: eine gezeichnete Wand ist kein Aufmass. Ausdrücklich hier und
        // nicht als Standard im Modell — geladene Wände stammen aus der PDF.
        this.floorplan.newWall(this.lastNode, corner, undefined, 'gesetzt')
      }
      if (corner.mergeWithIntersected() && this.lastNode != null) {
        this.setMode(floorplannerModes.MOVE)
      }
      this.lastNode = corner
    }
  }

  /** */
  private mouseleave(): void {
    this.mouseDown = false
    // Wer den Zeichenbereich verlässt, hat losgelassen — jedenfalls für uns:
    // ein `mouseup` ausserhalb bekommt der Canvas nicht mehr zu sehen. Ohne
    // dieses Aufräumen führte das Möbel beim Wiedereintritt einen Zug fort,
    // den der Nutzer längst beendet hat.
    this.zugBeenden()
    // Die Öffnung ebenso — und ihr Geist auch: er stünde sonst am Bildrand
    // stehen, wo der Zeiger die Fläche verlassen hat.
    this.zugOeffnung = null
    if (this.geistOeffnung) {
      this.geistOeffnung = null
      this.view.draw()
    }
    this.zeigerStilSetzen()
    // Das laufende Verweilen endet mit dem Zeichenbereich — ein OFFENER
    // Vorschlag aber nicht: die Rückfrage liegt ausserhalb des Canvas, der Weg
    // dorthin löst zwangsläufig mouseleave aus und würde sie sonst schliessen.
    this.verweilAbbrechen()
    //scope.setMode(scope.modes.MOVE);
  }

  // ------------------------------------------------- Möbel ziehen + einrasten (W2)

  /**
   * Ein Schritt des laufenden Möbelzugs: Zielpunkt aus Zeiger + Griff-Versatz,
   * dann einrasten, dann setzen — ausschliesslich über die KENNUNG.
   *
   * Warum nicht über die Objektreferenz, die `mousedown` schon in der Hand
   * hatte: zwischen zwei Bewegungen kann ein Rückgängig liegen (Strg+Z lässt
   * sich mit gedrückter Maustaste drücken), und `undo.apply()` lädt den
   * Grundriss komplett neu. Die Referenz zeigte danach auf ein Objekt, das in
   * keiner Liste mehr steht: sichtbar bliebe das Möbel stehen, gemeldet würde
   * nichts, und der Nutzer zöge minutenlang an einer Leiche.
   */
  private moebelAufPunkt(zielX: number, zielY: number): boolean {
    if (!this.zugKennung) {
      return false
    }
    const el = this.floorplan.findeAusstattung(this.zugKennung)
    if (!el) {
      // Das Stück ist unterwegs verschwunden. Den Zug beenden statt bei jeder
      // Bewegung erneut ins Leere zu greifen.
      this.zugKennung = null
      return false
    }
    const drehung = el.drehung ?? 0
    const ziel = this.moebelEinrasten(el, zielX, zielY)
    /**
     * NICHTS SCHREIBEN, WENN SICH NICHTS ÄNDERT (W7).
     *
     * GEMESSEN: ein Druck auf ein Möbel ohne jede Bewegung machte daraus ein
     * `gesetzt`-Stück — im Blatt sichtbar (gestrichelt, zurückgenommen), im
     * Kopf gezählt („1 Stück frei gesetzt"), und im Rückweg ins Projekt eine
     * Setzung, die der Nutzer nie gemacht hat. 798 geänderte Bildpunkte für
     * eine Handlung, die keine war.
     *
     * Und der Schnappschuss hängt daran: er wird erst gezogen, wenn wirklich
     * etwas passiert. Sonst stünde in der Historie ein Schritt, der nichts
     * zurücknimmt — bemerkt erst beim nächsten Strg+Z.
     */
    if (ziel.x === el.x && ziel.y === el.y && ziel.drehung === drehung) {
      return false
    }
    if (!this.zugGesichert) {
      this.undoManager?.snapshot()
      this.zugGesichert = true
    }
    const bewegt = this.floorplan.verschiebeAusstattung(el.id, ziel.x, ziel.y)
    if (ziel.drehung !== drehung) {
      this.floorplan.dreheAusstattung(el.id, ziel.drehung)
    }
    return bewegt || ziel.drehung !== drehung
  }

  /**
   * Der Maus-Weg im Grundriss — Zielpunkt aus Zeiger und Griff-Versatz.
   * Nichts als eine Umrechnung: die Arbeit macht `zugSchritt`, damit der
   * Axonometrie-Weg dieselbe Rechnung benutzt und nicht eine zweite daneben.
   */
  private moebelZiehen(): void {
    this.zugSchritt(this.mouseX, this.mouseY)
  }

  /* ────────────── Der Zug als ÖFFENTLICHE Geste (W7) ──────────────────
     Bis W6 steckte das Möbelziehen ganz in den Maus-Rückrufen dieses Zeichners
     und zog seine Koordinaten aus `this.mouseX`. Für die Axonometrie ist das
     unbrauchbar: dort kommt der Weltpunkt aus einer Rückrechnung des Bildes,
     nicht aus einem Canvas-Zeiger.

     Der billige Weg wäre gewesen, dort ein zweites Ziehen zu schreiben. Genau
     das darf nicht passieren: Einrasten (`moebelEinrasten`), Griff-Versatz und
     der EINE Schnappschuss je Zug sind Festlegungen aus W2, und zwei Fassungen
     davon laufen beim ersten Nachbessern auseinander — im Grundriss rastete es
     dann anders ein als im Blatt, für dieselbe Bewegung. Deshalb drei kurze
     öffentliche Methoden, die BEIDE Wege benutzen. */

  /**
   * Ein Möbelzug beginnt: Kennung merken und den Griff-Versatz festhalten.
   *
   * @param id KENNUNG des Stücks (nie eine Objektreferenz — ein Rückgängig lädt
   *        den Grundriss komplett neu)
   * @param weltX Anfasspunkt in cm
   * @param weltY dito
   * @returns ob wirklich etwas gegriffen wurde
   */
  public zugBeginnen(id: string, weltX: number, weltY: number): boolean {
    const el = this.floorplan.findeAusstattung(id)
    if (!el) {
      // KEIN Möbel? Dann vielleicht eine WAND (W12b).
      //
      // Nutzerwunsch, wörtlich: *„ich kann die wände immer noch nicht bewegen,
      // was die hauptsache meines anliegens war. dies muss genau so entfernt und
      // bewegt werden können wie man es mit den möbeln machen kann."*
      //
      // Diese eine Stelle ist der ganze Hebel: Maus (Grundriss), Blatt
      // (Axonometrie) und Finger (Handy) rufen ALLE `zugBeginnen`/`zugSchritt`/
      // `zugBeenden` — das ist die Festlegung aus W7 Punkt 4 und W8 Punkt 2.
      // Wände hier aufzunehmen heisst deshalb, sie in allen drei Bedienwegen
      // gleichzeitig greifbar zu machen, mit EINER Rechnung. Ein eigener
      // Wand-Zieh-Weg je Bedienung wären drei Fassungen, die beim ersten
      // Nachbessern auseinanderlaufen.
      return this.wandZugBeginnen(id, weltX, weltY)
    }
    this.zugKennung = el.id
    // Ohne den Versatz spränge das Stück mit seiner Mitte unter den Zeiger —
    // bei einer 3-m-Tischplatte um anderthalb Meter (W2 Punkt 2).
    this.zugVersatzX = el.x - weltX
    this.zugVersatzY = el.y - weltY
    this.zugGesichert = false
    this.zeigerStilSetzen()
    return true
  }

  /**
   * Ein Schritt des laufenden Zugs. Der Schnappschuss wird beim ersten Schritt
   * gezogen, DER WIRKLICH ETWAS ÄNDERT (`moebelAufPunkt`) — ein Druck ohne
   * Bewegung soll die Historie nicht mit Leerschritten füllen (W2 Punkt 3).
   */
  public zugSchritt(weltX: number, weltY: number): boolean {
    if (this.zugWandId) {
      return this.wandZugSchritt(weltX, weltY)
    }
    if (!this.zugKennung) {
      return false
    }
    return this.moebelAufPunkt(weltX + this.zugVersatzX, weltY + this.zugVersatzY)
  }

  /** Der Zug ist zu Ende — losgelassen, abgebrochen oder das Fenster verlassen. */
  public zugBeenden(): void {
    if (this.zugWandId) {
      // Der volle Neubau gehört ans ENDE des Zugs, nicht in jede Bewegung: im
      // Zug wandern nur die zwei Ecken, `update()` bildet danach die Räume neu
      // (dieselbe Festlegung wie W7 Punkt 5 für Möbel, dort gemessen 19 ms mit
      // gegen 4 ms ohne). Bei einer Wand ist es zwingender als bei einem Möbel:
      // `update()` leitet die RÄUME ab, und die ändern sich hier wirklich.
      this.floorplan.update()
      this.zugWandId = null
      this.zugWandStart = null
      this.zugWandHinweis = null
    }
    this.zugKennung = null
    this.zugGesichert = false
    this.zeigerStilSetzen()
  }

  /* ────────────── Der WAND-Zug (W12b) ──────────────────────────────────
     Eine Wand ist kein Möbel, und der Unterschied ist keine Förmlichkeit: ein
     Möbel steht IM Raum, eine Wand IST der Raum. Naiv um 40 cm verschoben,
     reisst der Grundriss an ihren Endecken auf — die Nachbarwände bleiben ja
     stehen. Aus einem Grundriss mit Lücken bildet `findRooms` KEINE Räume mehr:
     Raumnamen fallen weg, die Flächen im Businessplan werden null, und all das
     ohne eine einzige Fehlermeldung.

     Gerechnet wird deshalb in `src/raum/wand-bewegen.js` — parallel verschieben
     mit GLEITENDEN Endpunkten, die auf den Achsen der Nachbarwände entlang
     rutschen. Der Grundriss bleibt geschlossen, ein Raum wird grösser, der
     andere kleiner. Das ist, was „Raum vergrössern" bedeutet. */

  private zugWandId: string | null = null
  private zugWandStart: { x: number; y: number } | null = null
  /** Der letzte Grund, warum eine Bewegung begrenzt wurde — die Oberfläche liest ihn. */
  private zugWandHinweis: string | null = null

  private wandZugBeginnen(id: string, weltX: number, weltY: number): boolean {
    const wand = this.floorplan.getWalls().find((w) => w.id === id)
    if (!wand) {
      return false
    }
    this.zugWandId = id
    // Der ANFASSPUNKT, nicht die Wandmitte: gezogen wird relativ dazu, damit die
    // Wand nicht unter dem Zeiger wegspringt (dieselbe Begründung wie der
    // Griff-Versatz bei Möbeln, W2 Punkt 2).
    this.zugWandStart = { x: weltX, y: weltY }
    this.zugGesichert = false
    this.zeigerStilSetzen()
    return true
  }

  /** Die Wände in der Form, die die Rechnung liest — jede genau EINMAL. */
  private wandDatenFuerZug() {
    return this.floorplan.getWalls().map((w) => ({
      id: w.id,
      aId: w.getStart().id,
      bId: w.getEnd().id,
      a: { x: w.getStartX(), y: w.getStartY() },
      b: { x: w.getEndX(), y: w.getEndY() },
      quelle: w.quelle,
      dicke: w.thickness
    }))
  }

  private wandZugSchritt(weltX: number, weltY: number): boolean {
    if (!this.zugWandId || !this.zugWandStart) {
      return false
    }
    const waende = this.wandDatenFuerZug()
    const wand = waende.find((w) => w.id === this.zugWandId)
    if (!wand) {
      return false
    }
    const dx = weltX - this.zugWandStart.x
    const dy = weltY - this.zugWandStart.y
    const ergebnis = verschiebeWandParallel(wand, waende, dx, dy)
    if (ergebnis.ecken.length === 0 || ergebnis.strecke === 0) {
      // Keine Bewegung quer zur Wand: nichts tun und KEINEN Schnappschuss ziehen
      // — ein Druck ohne Wirkung soll die Historie nicht mit Leerschritten
      // füllen (W2 Punkt 3).
      this.zugWandHinweis = ergebnis.grund ?? null
      return false
    }
    if (!this.zugGesichert) {
      this.undoManager?.snapshot()
      this.zugGesichert = true
    }
    const ecken = this.floorplan.getCorners()
    for (const neu of ergebnis.ecken) {
      const ecke = ecken.find((c) => c.id === neu.id)
      // `Corner.move` benachrichtigt seine Wände; die Räume kommen erst beim
      // `update()` in `zugBeenden` (s. dort).
      if (ecke) ecke.move(neu.x, neu.y)
    }
    // Eine verschobene GEMESSENE Wand ist ein UMBAU und keine Messung mehr. Ohne
    // diese Zeile behauptete der Plan weiter, die Wand sei aufgemessen — und das
    // Blatt sagte „kein Aufmass" für die Möbel, aber nichts über die Wand.
    const echteWand = this.floorplan.getWalls().find((w) => w.id === this.zugWandId)
    if (echteWand) echteWand.quelle = 'gesetzt'
    this.zugWandStart = { x: weltX, y: weltY }
    this.zugWandHinweis = ergebnis.begrenzt ? ergebnis.grund ?? null : null
    return true
  }

  /** Läuft gerade ein WAND-Zug? Die Oberfläche fragt das für ihre Hinweiszeile. */
  public wandZugLaeuft(): string | null {
    return this.zugWandId
  }

  /** Der letzte Grund einer begrenzten Wand-Bewegung — oder null. */
  public wandZugHinweis(): string | null {
    return this.zugWandHinweis
  }

  /** Läuft gerade ein Möbelzug? Die Oberfläche fragt das, um Drehen und
   *  Schwenken auszusetzen, solange etwas in der Hand ist. */
  public zugLaeuft(): string | null {
    return this.zugKennung
  }

  /**
   * Wohin ein gezogenes Möbel WIRKLICH gelegt wird (W2) — zwei Hilfen, in
   * dieser Reihenfolge:
   *
   * 1. AN DIE WAND ANLEGEN. Liegt der Rand des Stücks näher als
   *    `EINRAST_WAND_CM` an einer Wandflanke, legt es sich bündig an und
   *    übernimmt den Wandwinkel. Das ist das Verhalten jedes Möbelplaners: ein
   *    Schrank steht AN der Wand, nicht 3 cm davor. Ohne diese Hilfe bliebe
   *    jede Aufstellung krumm, denn eine freihändig geführte Maus trifft eine
   *    Wand auf den Zentimeter nie.
   *
   * 2. AUF DAS RASTER RUNDEN, wenn keine Wand in Reichweite ist. Damit stehen
   *    mehrere Stücke von selbst auf einer Linie.
   *
   * Gerundet wird IMMER auf ganze Zentimeter (Projekt-DNA Punkt 3).
   *
   * KEINE KOLLISIONSPRÜFUNG — bewusst: Möbel dürfen sich überlappen. In einer
   * echten Planung tun sie das auch (der Stuhl steht unter dem Tisch), und eine
   * Sperre würde genau die Aufstellungen verhindern, die gemeint sind.
   */
  private moebelEinrasten(
    el: AusstattungElement,
    x: number,
    y: number
  ): { x: number; y: number; drehung: number } {
    const drehung = el.drehung ?? 0
    if (!this.einrasten) {
      return { x: Math.round(x), y: Math.round(y), drehung }
    }

    // So weit kann ein Rand höchstens vom Mittelpunkt entfernt liegen — die
    // Suchweite, ab der eine Wand überhaupt in Frage kommt.
    const halbMax = Math.max(el.breite, el.tiefe) / 2
    let beste: { x: number; y: number; drehung: number; abweichung: number } | null = null

    this.floorplan.getWalls().forEach((wand) => {
      const ax = wand.getStartX()
      const ay = wand.getStartY()
      const dx = wand.getEndX() - ax
      const dy = wand.getEndY() - ay
      const laenge = Math.hypot(dx, dy)
      if (laenge === 0) {
        return
      }
      // Fusspunkt auf der Wandgeraden. `t` ausserhalb 0..1 heisst: das Stück
      // liegt neben dem Wandende. Eine Wand wirkt nur dort, wo sie steht — ihre
      // Verlängerung ist Luft, und daran anzulegen wäre eine erfundene Wand.
      const t = ((x - ax) * dx + (y - ay) * dy) / (laenge * laenge)
      const rand = halbMax / laenge // ein halbes Möbel Überstand ist noch Anlage
      if (t < -rand || t > 1 + rand) {
        return
      }
      const fx = ax + dx * t
      const fy = ay + dy * t
      // Einheits-Normale der Wand und der VORZEICHENBEHAFTETE Abstand des
      // Mittelpunkts. Das Vorzeichen entscheidet, auf welcher Seite das Stück
      // bleibt: ohne es spränge ein Schrank beim Anlegen durch die Wand.
      const nx = -dy / laenge
      const ny = dx / laenge
      const versatz = (x - fx) * nx + (y - fy) * ny

      // Welche der vier rechtwinkligen Lagen liegt der jetzigen am nächsten?
      // So bleibt die vom Nutzer gewählte Ausrichtung erhalten — ein längs
      // gestellter Tisch dreht sich beim Anlegen nicht quer.
      const winkel = Math.atan2(dy, dx)
      const viertel = Math.round((drehung - winkel) / (Math.PI / 2))
      const gerastet = winkel + viertel * (Math.PI / 2)
      // Quer zur Wand ragt je nach Lage die Tiefe oder die Breite heraus.
      const quer = Math.abs(viertel) % 2 === 0 ? el.tiefe / 2 : el.breite / 2
      const soll = quer + wand.thickness / 2

      const abweichung = Math.abs(versatz) - soll // Abstand des RANDES zur Flanke
      if (Math.abs(abweichung) > EINRAST_WAND_CM) {
        return
      }
      if (beste && Math.abs(beste.abweichung) <= Math.abs(abweichung)) {
        return
      }
      // Genau auf der Achse (versatz === 0) ist keine Seite die richtige —
      // dann die positive nehmen, statt an einem Sonderfall zu zerbrechen.
      const seite = versatz < 0 ? -1 : 1
      beste = {
        x: fx + nx * soll * seite,
        y: fy + ny * soll * seite,
        drehung: gerastet,
        abweichung
      }
    })

    if (beste) {
      const b = beste as { x: number; y: number; drehung: number }
      return { x: Math.round(b.x), y: Math.round(b.y), drehung: b.drehung }
    }
    return {
      x: Math.round(x / EINRAST_RASTER_CM) * EINRAST_RASTER_CM,
      y: Math.round(y / EINRAST_RASTER_CM) * EINRAST_RASTER_CM,
      drehung
    }
  }

  // ------------------------------------------ Türen, Fenster, Durchgänge (W4)

  /**
   * Welche Art das Werkzeug gerade setzt. Öffentlich lesbar, aber nur über
   * `setzeOeffnungsArt` zu ändern — Breite und Brüstung hängen daran und
   * müssten sonst an jeder Aufrufstelle mitgeführt werden.
   */
  public oeffnungsArt: OeffnungsArt = OEFFNUNGS_VORLAGEN[0].art

  /** Lichte Weite der nächsten Öffnung in cm (aus `OEFFNUNGS_VORLAGEN`). */
  public oeffnungsBreite: number = OEFFNUNGS_VORLAGEN[0].breite

  /** Brüstung der nächsten Öffnung in cm, oder `undefined` (bodentief). */
  public oeffnungsBruestung: number | undefined = OEFFNUNGS_VORLAGEN[0].bruestung

  /**
   * Die GEISTER-Öffnung: wo eine Öffnung entstünde, wenn man jetzt klickte.
   * `null` heisst: hier ist keine Wand, die eine tragen kann.
   *
   * Sie wird gezeichnet, BEVOR etwas entsteht — ohne diese Vorschau setzt man
   * eine Tür und sieht erst danach, dass sie an der Nachbarwand gelandet ist.
   */
  public geistOeffnung: {
    wandId: string
    lage: number
    breite: number
    art: OeffnungsArt
    seite: 1 | -1
    anschlag: 'anfang' | 'ende'
    passt: boolean
  } | null = null

  /** KENNUNG der Öffnung unter dem Zeiger, oder `null`. Wie bei der
   *  Ausstattung die Kennung und nicht das Objekt — ein Rückgängig baut die
   *  Liste neu auf. */
  public activeOeffnung: string | null = null

  /** KENNUNG der Öffnung, die gerade GEZOGEN wird. */
  private zugOeffnung: string | null = null

  /**
   * Versatz zwischen Zeiger und Öffnungsmitte ENTLANG DER WAND, in cm,
   * festgehalten beim Drücken. Dasselbe Problem wie beim Möbelgriff: ohne ihn
   * spränge eine 1,75 m breite Doppeltür mit ihrer Mitte unter den Zeiger.
   */
  private zugOeffnungVersatz = 0

  /** Aufschlagseite und Anschlag der NÄCHSTEN Öffnung — Q und E wenden sie
   *  auch dann, wenn noch nichts gesetzt ist (dann gilt es für die Geister-
   *  Öffnung und damit für das, was gleich entsteht). */
  private naechsteSeite: 1 | -1 = 1
  private naechsterAnschlag: 'anfang' | 'ende' = 'anfang'

  /** Meldet der Oberfläche, dass sich Art/Breite geändert haben. */
  private oeffnungsCallbacks: Array<(art: OeffnungsArt) => void> = []

  /** Die Oberfläche hängt sich hier ein, um ihre Knöpfe mitzuführen. */
  public addOeffnungsCallback(callback: (art: OeffnungsArt) => void): void {
    this.oeffnungsCallbacks.push(callback)
  }

  /**
   * Meldet, was ein Klick im Öffnungs-Werkzeug bewirkt hat: die neue Öffnung
   * oder `null`, wenn keine entstehen konnte.
   *
   * Ohne diese Meldung bliebe ein abgelehnter Klick STUMM. Der rote Geist sagt
   * zwar „hier nicht", aber nur solange der Zeiger dort steht — wer trotzdem
   * klickt, hätte sonst gar keine Antwort bekommen. Die Oberfläche entscheidet,
   * wie sie es sagt; der Kern kennt seine beiden Hüllen nicht.
   */
  private oeffnungGesetztCallbacks: Array<(o: Oeffnung | null) => void> = []

  /** Die Oberfläche hängt sich hier ein, um das Ergebnis zu sagen. */
  public addOeffnungGesetztCallback(callback: (o: Oeffnung | null) => void): void {
    this.oeffnungGesetztCallbacks.push(callback)
  }

  /**
   * Wählt die Art der nächsten Öffnung und übernimmt ihr Standardmaß aus
   * `OEFFNUNGS_VORLAGEN` — der einen Liste, die BEIDE Auslieferungen benutzen.
   * Eine eigene Maßtabelle in der Oberfläche liefe auseinander, sobald jemand
   * nur eine anfasst.
   */
  public setzeOeffnungsArt(art: OeffnungsArt): void {
    const vorlage = OEFFNUNGS_VORLAGEN.find((v) => v.art === art)
    if (!vorlage) {
      return
    }
    this.oeffnungsArt = vorlage.art
    this.oeffnungsBreite = vorlage.breite
    this.oeffnungsBruestung = vorlage.bruestung
    this.geistNeuBestimmen()
    this.view.draw()
    this.oeffnungsCallbacks.forEach((cb) => cb(art))
  }

  /**
   * Wohin eine Öffnung WIRKLICH käme (W4) — Wand suchen, auf die Wandachse
   * projizieren, dann einrasten. Gibt `null`, wenn keine Wand in Reichweite
   * ist oder keine die Öffnung fassen kann.
   *
   * DIE REIHENFOLGE DER EINRASTUNGEN ist dieselbe Idee wie beim Möbel-Anlegen:
   * zuerst das, was eine BAUAUSSAGE ist (bündig an der Ecke, mittig in der
   * Wand), zuletzt das schlichte Raster. Eine Tür, die 3 cm neben der Ecke
   * sitzt, ist in einer echten Planung immer ein Versehen.
   */
  public oeffnungsVorschlag(
    x: number,
    y: number,
    breite = this.oeffnungsBreite
  ): { wandId: string; lage: number } | null {
    let beste: { wandId: string; lage: number; abstand: number } | null = null

    this.floorplan.getWalls().forEach((wand) => {
      const ax = wand.getStartX()
      const ay = wand.getStartY()
      const dx = wand.getEndX() - ax
      const dy = wand.getEndY() - ay
      const laenge = Math.hypot(dx, dy)
      // Eine Wand, die kürzer ist als die Öffnung, kann sie nicht tragen —
      // dann lieber gar nichts anbieten als eine Tür, die über beide Ecken
      // hinausragt.
      if (laenge < breite) {
        return
      }
      const t = ((x - ax) * dx + (y - ay) * dy) / (laenge * laenge)
      // Nur DORT, wo die Wand steht: ihre Verlängerung ist Luft. Dieselbe
      // Begründung wie beim Anlegen der Möbel.
      if (t < 0 || t > 1) {
        return
      }
      const fx = ax + dx * t
      const fy = ay + dy * t
      const abstand = Math.hypot(x - fx, y - fy)
      if (abstand > wand.thickness / 2 + OEFFNUNG_FANG_CM) {
        return
      }
      if (beste && beste.abstand <= abstand) {
        return
      }
      beste = { wandId: wand.id, lage: this.oeffnungEinrasten(laenge * t, laenge, breite), abstand }
    })

    // Der Typprüfer verengt `beste` nach der Rückruf-Zuweisung auf `never` —
    // dieselbe Stelle und derselbe Griff wie in `moebelEinrasten`.
    const b = beste as { wandId: string; lage: number } | null
    return b ? { wandId: b.wandId, lage: b.lage } : null
  }

  /**
   * Rastet die Lage entlang der Wandachse ein: Laibung bündig an eine Ecke,
   * Öffnung mittig in der Wand, sonst 5-cm-Raster. Immer geklemmt auf
   * `[breite/2, länge − breite/2]`, damit keine Laibung über eine Ecke ragt.
   *
   * Abschaltbar über DENSELBEN Schalter wie das Möbel-Anlegen (`einrasten`):
   * zwei getrennte Schalter für dieselbe Zusage wären zwei Zustände, die der
   * Nutzer auseinanderhalten müsste. Geklemmt wird trotzdem — das ist keine
   * Hilfe, sondern die Geometrie.
   */
  private oeffnungEinrasten(roh: number, wandLaenge: number, breite: number): number {
    const min = breite / 2
    const max = wandLaenge - breite / 2
    const klemme = (v: number) => Math.max(min, Math.min(max, v))
    if (!this.einrasten) {
      return Math.round(klemme(roh))
    }
    // Kandidaten in der Reihenfolge ihrer Aussagekraft. Der erste, der nah
    // genug liegt, gewinnt — nicht der nächstliegende: bündig an der Ecke
    // schlägt mittig in der Wand, weil eine Tür an der Ecke die häufigere und
    // baulich zwingendere Lage ist (dahinter passt kein Möbel mehr).
    for (const kandidat of [min, max, wandLaenge / 2]) {
      if (Math.abs(roh - kandidat) <= EINRAST_WAND_CM) {
        return Math.round(klemme(kandidat))
      }
    }
    return Math.round(klemme(Math.round(roh / EINRAST_RASTER_CM) * EINRAST_RASTER_CM))
  }

  /** Bestimmt die Geister-Öffnung an der aktuellen Zeigerstelle neu. */
  private geistNeuBestimmen(): void {
    if (this.mode !== floorplannerModes.OEFFNUNG || this.zugOeffnung) {
      this.geistOeffnung = null
      return
    }
    const vorschlag = this.oeffnungsVorschlag(this.mouseX, this.mouseY)
    if (!vorschlag) {
      this.geistOeffnung = null
      return
    }
    this.geistOeffnung = {
      wandId: vorschlag.wandId,
      lage: vorschlag.lage,
      breite: this.oeffnungsBreite,
      art: this.oeffnungsArt,
      seite: this.naechsteSeite,
      anschlag: this.naechsterAnschlag,
      // Eine Öffnung, die sich mit einer vorhandenen überschneidet, wird ROT
      // angeboten statt gar nicht: „hier geht es nicht" ist eine Auskunft,
      // ein verschwundener Geist wäre ein Rätsel.
      passt: this.floorplan.oeffnungPasst(vorschlag.wandId, vorschlag.lage, this.oeffnungsBreite)
    }
  }

  /**
   * Setzt die Öffnung, die der Geist gerade anbietet — EIN Rückgängig-Schritt.
   *
   * Der Schnappschuss wird ERST gezogen, NACHDEM feststeht, dass etwas
   * entsteht: dieselbe Regel wie bei `stueckAblegen`. Ein Rückgängig-Schritt,
   * der nichts zurücknimmt, ist ein Klick ins Leere, den der Nutzer erst beim
   * nächsten Strg+Z bemerkt.
   *
   * Rückgabe ist die neue Öffnung oder `null` — der Aufrufer soll SAGEN
   * können, warum nichts entstand.
   */
  public oeffnungSetzen(): Oeffnung | null {
    const geist = this.geistOeffnung
    if (!geist || !geist.passt) {
      return null
    }
    this.undoManager?.snapshot()
    const o = this.floorplan.fuegeOeffnungHinzu({
      wandId: geist.wandId,
      lage: geist.lage,
      breite: geist.breite,
      art: geist.art,
      seite: geist.seite,
      anschlag: geist.anschlag,
      bruestung: geist.art === 'fenster' ? this.oeffnungsBruestung : undefined
    })
    this.view.draw()
    return o
  }

  /**
   * Ein Schritt des laufenden Öffnungs-Zugs: die Öffnung wandert ENTLANG IHRER
   * WAND mit dem Zeiger. Nie quer, nie auf eine andere Wand — ein Wandwechsel
   * ist ein Löschen plus ein Setzen und soll auch so aussehen.
   */
  private oeffnungZiehen(): void {
    if (!this.zugOeffnung) {
      return
    }
    const o = this.floorplan.findeOeffnung(this.zugOeffnung)
    const g = o ? this.floorplan.oeffnungsGeometrie(o) : null
    if (!o || !g) {
      // Unterwegs verschwunden (gelöscht, zurückgespielt) — den Zug beenden,
      // statt bei jeder Bewegung erneut ins Leere zu greifen.
      this.zugOeffnung = null
      return
    }
    // Zeiger auf die Wandachse projizieren: die Lage ist der Weg von der
    // Start-Ecke bis zum Fusspunkt, zuzüglich des festgehaltenen Griff-Versatzes.
    const wand = this.floorplan.findeWand(o.wandId)
    if (!wand) {
      return
    }
    const roh =
      (this.mouseX - wand.getStartX()) * g.ex +
      (this.mouseY - wand.getStartY()) * g.ey +
      this.zugOeffnungVersatz
    const lage = this.oeffnungEinrasten(roh, g.wandLaenge, o.breite)
    this.floorplan.verschiebeOeffnung(o.id, lage)
  }

  /**
   * Q wendet den Anschlag, E die Aufschlagseite (W4) — an der Öffnung UNTER
   * DEM ZEIGER, sonst an der nächsten, die gesetzt wird.
   *
   * Dieselben Tasten wie das Drehen der Möbel, und aus demselben Grund
   * (`dreheAktives`): es gibt in diesem Planer keine Auswahl, die einen Klick
   * überdauert. Welche Bedeutung sie haben, entscheidet das WERKZEUG — im
   * Verschieben drehen sie ein Möbel, im Öffnungs-Werkzeug wenden sie eine Tür.
   * Zwei Bedeutungen für zwei Werkzeuge sind weniger Last als vier Tasten.
   *
   * Rückgabe meldet, ob wirklich etwas gewendet wurde.
   */
  public wendeAktiveOeffnung(was: 'anschlag' | 'seite'): boolean {
    if (this.mode !== floorplannerModes.OEFFNUNG) {
      return false
    }
    const kennung = this.zugOeffnung ?? this.activeOeffnung
    if (kennung) {
      const vorhanden = this.floorplan.findeOeffnung(kennung)
      if (vorhanden) {
        // Während eines Zuges ist längst gesichert — dieselbe Regel wie beim
        // Drehen eines Möbels mitten im Ziehen.
        if (!(this.mouseDown && this.zugGesichert)) {
          this.undoManager?.snapshot()
        }
        const ok =
          was === 'anschlag'
            ? this.floorplan.wendeAnschlag(kennung)
            : this.floorplan.wendeSeite(kennung)
        this.view.draw()
        return ok
      }
    }
    // Nichts unter dem Zeiger: dann gilt es für die NÄCHSTE Öffnung. Kein
    // Schnappschuss — es hat sich nichts am Grundriss geändert.
    if (was === 'anschlag') {
      this.naechsterAnschlag = this.naechsterAnschlag === 'anfang' ? 'ende' : 'anfang'
    } else {
      this.naechsteSeite = this.naechsteSeite === 1 ? -1 : 1
    }
    this.geistNeuBestimmen()
    this.view.draw()
    return true
  }

  /** „diese Tür (0,88 m breit)" — damit die Rückfrage benennt, was verschwindet. */
  private oeffnungsBeschreibung(o: Oeffnung): string {
    const weite = (o.breite / 100).toFixed(2).replace('.', ',')
    return `${OEFFNUNG_ARTIKEL[o.art]} (${weite} m breit)`
  }

  // --------------------------------------------- Stück aus der Palette (W3)

  /**
   * Legt EIN neues Stück im Grundriss ab — der Abschluss des Zuges aus der
   * Palette in den Plan.
   *
   * Es entsteht mit `quelle: 'gesetzt'` (fest verdrahtet in
   * `Floorplan.fuegeAusstattungHinzu`), bekommt eine frische Kennung und wird
   * dann durch DIESELBE Einrast-Rechnung geschickt wie ein gezogenes Stück
   * (`moebelEinrasten`). Das ist der ganze Punkt: ein abgelegtes Stück soll sich
   * nicht anders verhalten als ein gezogenes — zwei Einrast-Wege wären zwei
   * Ergebnisse für dieselbe Bewegung.
   *
   * AUSSERHALB DER ZEICHENFLÄCHE ENTSTEHT NICHTS, und zwar geprüft BEVOR der
   * Schnappschuss gezogen wird: ein Rückgängig-Schritt, der nichts zurücknimmt,
   * wäre ein Klick ins Leere, den der Nutzer erst beim nächsten Strg+Z bemerkt.
   * Die Prüfung sitzt hier im KERN und nicht in der Oberfläche, damit beide
   * Auslieferungen dieselbe Grenze haben.
   *
   * KEINE Modus-Prüfung: die Palette ist eine eigene Geste und hat mit dem
   * gewählten Werkzeug nichts zu tun. Ein „geht im Zeichnen-Werkzeug nicht"
   * wäre ein stummer Zustand, in dem das Ziehen wirkungslos bliebe, ohne dass
   * jemand sagt, warum.
   *
   * @param bildX Ablagepunkt in Canvas-Pixeln (links oben = 0,0)
   * @param bildY dito
   * @param vorlage Art und Standardmaß in cm (aus `AUSSTATTUNG_VORLAGEN`)
   * @returns das abgelegte Stück oder `null`, wenn nichts entstanden ist
   */
  public stueckAblegen(
    bildX: number,
    bildY: number,
    vorlage: { typ: AusstattungTyp; breite: number; tiefe: number }
  ): AusstattungElement | null {
    if (
      !Number.isFinite(bildX) ||
      !Number.isFinite(bildY) ||
      bildX < 0 ||
      bildY < 0 ||
      bildX > this.canvasElement.width ||
      bildY > this.canvasElement.height
    ) {
      return null
    }
    if (!(vorlage.breite > 0) || !(vorlage.tiefe > 0)) {
      // Ein Stück ohne Ausdehnung wäre unsichtbar und nicht mehr greifbar —
      // dieselbe Strenge wie im Export (`tools/export_blueprint.py`).
      return null
    }

    // Umkehrung von `convertX`/`convertY`.
    const weltX = bildX * this.cmPerPixel + this.originX * this.cmPerPixel
    const weltY = bildY * this.cmPerPixel + this.originY * this.cmPerPixel
    return this.stueckAblegenWelt(weltX, weltY, vorlage)
  }

  /**
   * Dasselbe Ablegen, aber auf einem WELT-Punkt (W7).
   *
   * Der Grundriss rechnet seinen Bildpunkt selbst um; die Axonometrie kann das
   * nicht — dort kommt der Weltpunkt aus der Rückrechnung des Sehstrahls auf
   * y = 0. Das ist eine GESETZTE Annahme und keine geratene: ein neu
   * hingestelltes Stück steht auf dem Boden, und der Puppenhaus-Schnitt legt
   * den Boden vor jeder Wandkrone frei.
   *
   * Die Grenzprüfung (Zeichenfläche) bleibt beim Bild-Weg: in der Welt gibt es
   * keinen Rand, an dem etwas „daneben" wäre.
   */
  public stueckAblegenWelt(
    weltX: number,
    weltY: number,
    vorlage: { typ: AusstattungTyp; breite: number; tiefe: number }
  ): AusstattungElement | null {
    if (!Number.isFinite(weltX) || !Number.isFinite(weltY)) {
      return null
    }
    if (!(vorlage.breite > 0) || !(vorlage.tiefe > 0)) {
      // Ein Stück ohne Ausdehnung wäre unsichtbar und nicht mehr greifbar —
      // dieselbe Strenge wie im Export (`tools/export_blueprint.py`).
      return null
    }

    // Der Schnappschuss GENAU EINMAL und erst jetzt — das Ablegen ist EIN
    // Rückgängig-Schritt, nicht drei (hinstellen, verschieben, drehen).
    this.undoManager?.snapshot()

    const el = this.floorplan.fuegeAusstattungHinzu({
      typ: vorlage.typ,
      x: Math.round(weltX),
      y: Math.round(weltY),
      breite: vorlage.breite,
      tiefe: vorlage.tiefe
    })

    // Einrasten NACH dem Anlegen: `moebelEinrasten` braucht Breite, Tiefe und
    // Drehung des fertigen Stücks, um zu wissen, wie weit sein Rand von der
    // Mitte weg ist.
    const ziel = this.moebelEinrasten(el, weltX, weltY)
    this.floorplan.verschiebeAusstattung(el.id, ziel.x, ziel.y)
    if (ziel.drehung !== (el.drehung ?? 0)) {
      this.floorplan.dreheAusstattung(el.id, ziel.drehung)
    }

    this.view.draw()
    return el
  }

  /**
   * Zeichnet ein Vorschau-Zeichen in ein fremdes Canvas (W3) — für die Palette.
   * Reicht nur durch; die Vorschrift steht im Zeichner, damit Vorschau und
   * Grundriss nicht auseinanderlaufen können.
   */
  public zeichneVorschau(
    ziel: CanvasRenderingContext2D,
    vorlage: { typ: AusstattungTyp; breite: number; tiefe: number },
    kasten: { x: number; y: number; breite: number; hoehe: number }
  ): void {
    this.view.zeichneVorschau(ziel, vorlage, kasten)
  }

  /**
   * Der Zeiger zeigt, dass hier etwas zu greifen ist (W2) — dieselbe Sprache,
   * die die Doppelklick-Datei beim Drehen des Blattes schon spricht
   * (`grab`/`grabbing`).
   *
   * Gesetzt wird INLINE am Canvas und nicht über eine Klasse: der Kern kennt
   * die Stilvorlagen seiner beiden Welten nicht (Planer und Doppelklick-Datei),
   * und zwei Stellen, die dasselbe meinen, laufen auseinander. Ist nichts zu
   * greifen, wird der Inline-Stil LEER gesetzt statt auf `default` — dann gilt
   * wieder, was die Seite selbst vorgibt (Fadenkreuz beim Zeichnen).
   */
  private zeigerStilSetzen(): void {
    let stil = ''
    if (this.mode == floorplannerModes.MOVE) {
      if (this.zugKennung) {
        stil = 'grabbing'
      } else if (this.activeAusstattung) {
        stil = 'grab'
      }
    } else if (this.mode == floorplannerModes.WAND) {
      // W10 — dieselbe Sprache für die Bausubstanz. Sie fehlte ihr bisher als
      // Einziges: über einem Möbel sagte der Zeiger `grab`, über einer Ecke,
      // über einer Wand und über dem Leerraum sagte er dasselbe (nämlich
      // nichts) — gemessen. Wer nicht sieht, dass er gleich Mauerwerk in der
      // Hand hat, kann es auch nicht lassen.
      if (this.mouseDown && (this.activeCorner || this.activeWall)) {
        stil = 'grabbing'
      } else if (this.activeCorner || this.activeWall) {
        stil = 'grab'
      }
    } else if (this.mode == floorplannerModes.OEFFNUNG) {
      // Dieselbe Sprache wie beim Möbel (W4): eine vorhandene Öffnung lässt
      // sich greifen und schieben, überall sonst wird gesetzt.
      if (this.zugOeffnung) {
        stil = 'grabbing'
      } else if (this.activeOeffnung) {
        stil = 'grab'
      }
    }
    if (this.canvasElement.style.cursor !== stil) {
      this.canvasElement.style.cursor = stil
    }
  }

  /**
   * Dreht das Stück unter dem Zeiger um `schritte` mal 15° (W2).
   *
   * WARUM ÜBER DIE TASTATUR (Q/E) UND NICHT ÜBER ZWEI KNÖPFE IN DER LEISTE:
   * gedreht wird immer DAS STÜCK UNTER DEM ZEIGER — das ist dieselbe Regel wie
   * beim Greifen und beim Löschen, es gibt in diesem Planer keine Auswahl, die
   * einen Klick überdauert. Ein Knopf in der Leiste verlangte aber genau die:
   * auf dem Weg zum Knopf verlässt der Zeiger das Möbel, und das Ziel wäre
   * verloren. Man müsste dafür eine Auswahl einführen (anklicken, markiert
   * halten, wieder abwählen) — eine zweite Bedienidee neben dem Ziehen, für
   * eine Drehung um 15°. Die Hand bleibt stattdessen dort, wo die Arbeit ist,
   * und das Drehen läuft AUCH MITTEN IM ZIEHEN: anfassen, drehen, ablegen.
   * BEKANNTE GRENZE: am Handy gibt es keine Tastatur — dort ist auch das Ziehen
   * von Möbeln noch nicht gelöst (der eine Finger schiebt die Ansicht).
   *
   * Rückgabe meldet, ob wirklich gedreht wurde (VERIFIED-EFFECT statt stillem
   * No-Op).
   */
  public dreheAktives(schritte: number): boolean {
    if (this.mode != floorplannerModes.MOVE || !this.activeAusstattung) {
      return false
    }
    return this.dreheStueck(this.activeAusstattung, schritte)
  }

  /**
   * Dreht EIN benanntes Stück um `schritte` mal 15° (W7).
   *
   * Die eigentliche Drehung, seit es zwei Wege dorthin gibt: den Zeiger im
   * Grundriss (`dreheAktives`) und den Griff in der Axonometrie. Eine Drehung
   * ist eine reine Modell-Operation — keine Geometrie im Bild, keine
   * Rückrechnung, keine Annahme über eine Höhe. Sie ist deshalb die einzige
   * der drei Bearbeitungen, die auch bei flach gekipptem Blatt sauber bleibt.
   */
  public dreheStueck(id: string, schritte: number): boolean {
    const el = this.floorplan.findeAusstattung(id)
    if (!el) {
      return false
    }
    // Während eines Zuges ist längst gesichert — die Drehung gehört dann zu
    // DIESEM Zug und darf kein eigener Schritt sein. Ausserhalb ist jede
    // Drehung ein eigener Zug, wie jeder gesetzte Zeichenpunkt auch. Gemessen
    // wird am ZUG und nicht mehr an `mouseDown`: in der Axonometrie gibt es
    // keinen gedrückten Zeiger auf dieser Zeichenfläche, und die Regel gilt
    // trotzdem.
    if (!(this.zugKennung && this.zugGesichert)) {
      this.undoManager?.snapshot()
    }
    const zwei = Math.PI * 2
    const neu = (((el.drehung ?? 0) + schritte * DREH_SCHRITT) % zwei + zwei) % zwei
    const ok = this.floorplan.dreheAusstattung(el.id, neu)
    this.view.draw()
    return ok
  }

  /**
   * Schlägt EIN benanntes Stück zum Löschen vor (W7) — dieselbe Rückfrage, die
   * das Verweilen im Grundriss auslöst.
   *
   * Ausdrücklich über `loeschKandidat` und die vorhandenen Rückrufe und NICHT
   * über `entferneAusstattung`: es darf keinen zweiten Weg geben, auf dem etwas
   * ohne Nachfrage verschwindet. Die Oberfläche fragt, der Kern führt aus —
   * genau wie in E1 festgelegt.
   */
  public loeschStueckVorschlagen(id: string): boolean {
    const el = this.floorplan.findeAusstattung(id)
    if (!el) {
      return false
    }
    const ziel: LoeschZiel = {
      art: 'ausstattung',
      kennung: el.id,
      beschreibung: AUSSTATTUNG_NAME[el.typ] ?? el.typ
    }
    this.loeschKandidat = ziel
    this.view.draw()
    this.loeschAnfrageCallbacks.forEach((cb) => cb(ziel))
    return true
  }

  /** Schaltet das Einrasten um und meldet es der Oberfläche (W2). */
  public setzeEinrasten(an: boolean): void {
    this.einrasten = an
    this.einrastCallbacks.forEach((cb) => cb(an))
  }

  /** Für die Oberfläche: rastet gerade ein? */
  public istEinrasten(): boolean {
    return this.einrasten
  }

  /** Die Oberfläche hängt sich hier ein, um ihren Knopf mitzuführen (W2). */
  public addEinrastCallback(callback: (an: boolean) => void): void {
    this.einrastCallbacks.push(callback)
  }

  // ---------------------------------------------------------------- Zoom (T7)

  /** Fuer die Oberflaeche: aktuelle Zoomstufe (1 = Ausgangsmassstab). */
  public getZoom(): number {
    return this.zoom
  }

  /** Meldet jede Zoom-Aenderung (Anzeige, Schaltflaechen). */
  public addZoomCallback(callback: (zoom: number) => void): void {
    this.zoomCallbacks.push(callback)
  }

  /**
   * Zoomt so, dass der Punkt (screenX, screenY) auf dem Bildschirm stehen
   * bleibt — man zoomt also dorthin, wo der Zeiger steht, statt zur Bildmitte.
   */
  public zoomeAufPunkt(neuerZoom: number, screenX: number, screenY: number): void {
    const ziel = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, neuerZoom))
    if (ziel === this.zoom) {
      return
    }
    // Welt-Koordinate unter dem Ankerpunkt VOR dem Zoom …
    const weltX = (screenX + this.originX) * this.cmPerPixel
    const weltY = (screenY + this.originY) * this.cmPerPixel

    this.zoom = ziel

    // … und danach wieder unter denselben Bildschirmpunkt legen.
    this.originX = weltX * this.pixelsPerCm - screenX
    this.originY = weltY * this.pixelsPerCm - screenY

    this.zoomCallbacks.forEach((cb) => cb(this.zoom))
    this.view.draw()
  }

  /**
   * Schiebt den Ausschnitt um dx/dy BILDPUNKTE — reine Ansicht, kein Modell.
   *
   * Gebraucht wird das, seit die Doppelklick-Datei ihre Zeichenflaeche im
   * Lese-Zustand auf `pointer-events:none` legt (K3): der Kern hoert seine
   * Zeiger-Ereignisse am Canvas ab, und die kommen dort dann nicht mehr an.
   * Ohne diesen einen oeffentlichen Weg muesste die Huelle `originX/originY`
   * von aussen beschreiben und danach selbst ein Neuzeichnen anstossen — zwei
   * Eingriffe in Interna statt einer benannten Handlung. Was hier NICHT
   * passiert, ist der Punkt: keine Ecke, keine Wand, kein Moebel wird
   * angefasst. Ein Lese-Zustand, der ueber diese Tuer etwas veraendern
   * koennte, waere keiner.
   */
  public verschiebeAnsicht(dx: number, dy: number): void {
    this.originX -= dx
    this.originY -= dy
    this.view.draw()
  }

  /** Zoomt um die Bildmitte — fuer die Plus/Minus-Schaltflaechen. */
  public zoomeUmFaktor(faktor: number): void {
    this.zoomeAufPunkt(
      this.zoom * faktor,
      this.canvasElement.clientWidth / 2,
      this.canvasElement.clientHeight / 2
    )
  }

  /**
   * Legt den GANZEN Grundriss ins Bild — der Grund, warum es diesen Zoom gibt.
   * Ohne das sieht man von der 78 m langen Halle nie mehr als einen Ausschnitt.
   */
  public allesEinpassen(): void {
    const ecken = this.floorplan.getCorners()
    const breitePx = this.canvasElement.clientWidth
    const hoehePx = this.canvasElement.clientHeight
    if (ecken.length === 0 || breitePx === 0 || hoehePx === 0) {
      // Nichts zu zeigen (oder Canvas noch ohne Groesse) — auf den
      // Ausgangsmassstab zurueck, damit kein wirrer Zustand stehen bleibt.
      this.zoom = 1
      this.resetOrigin()
      this.zoomCallbacks.forEach((cb) => cb(this.zoom))
      this.view.draw()
      return
    }

    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    ecken.forEach((ecke) => {
      if (ecke.x < minX) minX = ecke.x
      if (ecke.x > maxX) maxX = ecke.x
      if (ecke.y < minY) minY = ecke.y
      if (ecke.y > maxY) maxY = ecke.y
    })

    // Ein Grundriss ohne Ausdehnung in einer Richtung (alle Ecken auf einer
    // Linie) wuerde sonst durch Null teilen.
    const planBreite = Math.max(1, maxX - minX)
    const planHoehe = Math.max(1, maxY - minY)

    // Bei einem sehr kleinen Fenster darf der feste Rand nicht die ganze
    // Flaeche auffressen — dann lieber die Haelfte nutzen als nichts.
    const nutzbarBreite = Math.max(breitePx * 0.5, breitePx - 2 * EINPASS_RAND_PX)
    const nutzbarHoehe = Math.max(hoehePx * 0.5, hoehePx - 2 * EINPASS_RAND_PX)
    const gewuenschtPixelProCm = Math.min(nutzbarBreite / planBreite, nutzbarHoehe / planHoehe)

    this.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, gewuenschtPixelProCm * BASIS_CM_PRO_PIXEL))

    // Mitte des Grundrisses auf die Mitte des Bildes.
    this.originX = ((minX + maxX) / 2) * this.pixelsPerCm - breitePx / 2
    this.originY = ((minY + maxY) / 2) * this.pixelsPerCm - hoehePx / 2

    this.zoomCallbacks.forEach((cb) => cb(this.zoom))
    this.view.draw()
  }

  // ------------------------------------------------------- Finger-Navigation

  /** Abstand des letzten Zwei-Finger-Griffs, fuer das Verhaeltnis beim Zoomen. */
  private fingerAbstand = 0

  /** Letzte Ein-Finger-Position, zum Schieben. */
  private fingerX = 0
  private fingerY = 0

  /** Mitte des Zwei-Finger-Griffs — zum Mitschieben beim Zoomen (E3). */
  private fingerMitteX = 0
  private fingerMitteY = 0

  /** Wo der Finger AUFGESETZT hat — Bezug fuer "wurde gewischt?" (E3). */
  private fingerStartX = 0
  private fingerStartY = 0

  /**
   * Hat der Finger seit dem Aufsetzen mehr als die Wackel-Toleranz zurueckgelegt?
   * Trennt Tippen (setzt einen Punkt) von Wischen (schiebt die Ansicht) und
   * bricht den Langdruck ab.
   */
  private fingerHatGeschoben = false

  /** Laeuft, solange ein Finger auf einem loeschbaren Objekt ruht (E3). */
  private langdruckTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * Haelt der EINE Finger gerade ein MOEBEL? (Handy-Welle)
   *
   * Getrennt von `zugKennung` gefuehrt, obwohl beide zusammen fallen: der Zug
   * gehoert dem KERN und wird auch von der Maus und vom Blatt begonnen. Diese
   * Angabe gehoert dem FINGER und beantwortet die eine Frage, die jedes
   * `touchmove` stellt — schiebe ich die ANSICHT oder das STUECK?
   *
   * Sie wird beim AUFSETZEN entschieden und nie spaeter. Am Handy gibt es kein
   * Schweben: die Absicht laesst sich vorher nicht ablesen, also muss sie im
   * ersten Augenblick feststehen. Sonst begaenne jeder Wisch mehrdeutig, und
   * die ersten Pixel gingen entweder dem Plan oder dem Moebel verloren.
   */
  private fingerGreift = false

  /** */
  private fingerStart(e: TouchEvent): void {
    e.preventDefault()
    if (e.touches.length === 1) {
      this.fingerX = e.touches[0].clientX
      this.fingerY = e.touches[0].clientY
      this.fingerStartX = this.fingerX
      this.fingerStartY = this.fingerY
      this.fingerHatGeschoben = false

      // --- MOEBEL MIT DEM FINGER ZIEHEN (Handy-Welle)
      //
      // Die Absichts-Trennung ist DIESELBE, die die Maus schon hat, nur an
      // einem anderen Augenblick abgelesen: `mousemove` sperrt das Schwenken,
      // solange `activeAusstattung` steht (`mousemove`, Abschnitt „panning"),
      // und `mousedown` greift ueber `zugBeginnen`. Beim Finger fallen Zielen
      // und Druecken in EINEN Augenblick zusammen, also faellt hier auch die
      // Entscheidung: Treffer auf ein Moebel -> ziehen, sonst -> schieben.
      //
      // Gegriffen wird ausschliesslich AUSSTATTUNG, nicht Ecke und nicht Wand.
      // Das ist kein Vergessen, sondern die Lehre aus W5: eine verschobene
      // GEMESSENE Ecke bricht den Rueckweg ins Projekt hart ab. Die Maus darf
      // das, weil sie vorher schwebt und am Rahmen sieht, was sie greift — der
      // Finger sieht nichts und trifft mit einer breiten Kuppe. Am Handy waere
      // das ein stiller Griff ins Aufmass.
      //
      // W10 hat diese Trennung fuer die MAUS nachgezogen (`floorplannerModes.
      // WAND`) — der Finger bleibt damit unveraendert und ist nicht mehr der
      // Sonderfall, sondern die Regel. Im Wand-Werkzeug schiebt er weiterhin
      // nur die Ansicht: `bearbeitetMitEinemFinger` nennt allein Zeichnen und
      // Loeschen. Das ist die bewusst konservative Seite — eine Wand mit der
      // Kuppe zu verschieben bliebe auch mit Werkzeugwahl ein blinder Griff.
      if (this.mode == floorplannerModes.MOVE || this.mode == floorplannerModes.WAND) {
        this.zeigerSetzen(this.fingerX, this.fingerY)
        this.trefferBestimmen()
        // Im Verschieben-Werkzeug greift der Finger MÖBEL, im Wand-Werkzeug
        // WÄNDE — dieselbe Trennung, die die Maus seit W10 hat, jetzt auch für
        // die Kuppe.
        //
        // W8 Punkt 3 hatte Wände für den Finger ausdrücklich ausgeschlossen
        // („ein blinder Griff"), und das Argument war nicht falsch: die Kuppe
        // verdeckt, was sie anfasst. Es trug aber nur, solange eine verschobene
        // Wand den Weg zurück ins Projekt hart abbrechen liess — dann war der
        // blinde Griff nicht nur unscharf, sondern führte in einen abgelehnten
        // Zustand. Seit es die Kategorie UMBAU gibt (W12b), ist er eine
        // Bedienung wie jede andere, und der Nutzer hat sie ausdrücklich
        // verlangt. Die Unschärfe bleibt echt und wird anders beantwortet: das
        // Wand-Werkzeug muss AUSDRÜCKLICH gewählt werden, ein Zug quer zur Wand
        // ist die einzige Wirkung, und beim Loslassen steht die Strecke da.
        this.fingerGreift =
          this.mode == floorplannerModes.WAND
            ? this.activeWall !== null &&
              this.zugBeginnen(this.activeWall.id, this.mouseX, this.mouseY)
            : this.activeAusstattung !== null &&
              this.zugBeginnen(this.activeAusstattung, this.mouseX, this.mouseY)
        if (!this.fingerGreift) {
          // Nichts in der Hand: die Marken MUESSEN weg. Am Handy raeumt kein
          // Wegfahren sie ab — ein liegen gebliebener Rahmen behauptete einen
          // Griff, den es nicht gibt, und die Schwenk-Sperre unten haenge an
          // ihm fest.
          this.activeAusstattung = null
          this.activeCorner = null
          this.activeWall = null
        }
        this.view.draw()
        return
      }

      if (this.bearbeitetMitEinemFinger()) {
        // Der Finger arbeitet: Zeiger dorthin setzen, damit Treffer und
        // Zeichen-Vorschau dieselbe Grundlage haben wie bei der Maus.
        this.zeigerSetzen(this.fingerX, this.fingerY)
        if (this.mode == floorplannerModes.DELETE) {
          if (this.trefferBestimmen()) {
            this.view.draw()
          }
          // Langdruck statt Verweilen (E3): am Handy gibt es kein Schweben,
          // ein Finger liegt entweder auf oder nicht. Kuerzer als das
          // Verweilen der Maus (700 ms), weil Aufsetzen und Halten schon eine
          // bewusste Handlung ist — Hinueberfahren dagegen nicht.
          this.langdruckAbbrechen()
          this.langdruckTimer = setTimeout(() => {
            this.langdruckTimer = null
            if (!this.fingerHatGeschoben) {
              this.loeschVorschlagen()
            }
          }, LANGDRUCK_MS)
        } else {
          this.updateTarget()
        }
      }
    } else if (e.touches.length === 2) {
      // Zweiter Finger: das ist Navigation, keine Bearbeitung. Ein angefangener
      // Langdruck wird damit hinfaellig — und ein angefangener MOEBELZUG
      // ebenso. Zwei Finger heissen in diesem Planer „zoomen", und beides
      // zugleich waere keine Geste. Dieselbe Regel gilt im Blatt
      // (`axo-zeichnen.js`, `pointerdown` bei `zeiger.size > 1`).
      this.langdruckAbbrechen()
      this.fingerZugBeenden()
      this.fingerAbstand = this.abstandZwischen(e)
      this.fingerMitteX = (e.touches[0].clientX + e.touches[1].clientX) / 2
      this.fingerMitteY = (e.touches[0].clientY + e.touches[1].clientY) / 2
    }
  }

  /** */
  private fingerBewegt(e: TouchEvent): void {
    e.preventDefault()
    if (e.touches.length === 1) {
      const x = e.touches[0].clientX
      const y = e.touches[0].clientY

      if (
        Math.hypot(x - this.fingerStartX, y - this.fingerStartY) > FINGER_WACKEL_PX
      ) {
        this.fingerHatGeschoben = true
        this.langdruckAbbrechen()
      }

      // --- Ein Stueck in der Hand: es folgt, die Ansicht steht still.
      //
      // Der Ruecksprung ist die Schwenk-Sperre des Maus-Weges, nur an dieser
      // Stelle: dort steht sie als `!this.activeAusstattung` in der
      // Schwenk-Bedingung. GEMESSEN wurde sie dort — ohne sie legt derselbe
      // Zug das Stueck rund doppelt so weit, weil Moebel UND Plan wandern.
      // Gezogen wird ueber `zugSchritt`, also ueber DIESELBE Einrast-Rechnung
      // wie Maus und Blatt; eine zweite gaebe es hier nicht umsonst, sondern
      // ab dem ersten Nachbessern als zweites Ergebnis fuer dieselbe Bewegung.
      if (this.fingerGreift) {
        this.zeigerSetzen(x, y)
        this.zugSchritt(this.mouseX, this.mouseY)
        this.fingerX = x
        this.fingerY = y
        this.view.draw()
        return
      }

      if (this.bearbeitetMitEinemFinger()) {
        // Im Zeichnen-Werkzeug zieht der Finger die Vorschau, statt die Ansicht
        // zu schieben. Verschoben wird dort mit ZWEI Fingern — sonst gaebe es
        // keine Geste mehr fuers Zeichnen, und beides auf einen Finger zu
        // legen hiesse raten, was gemeint war.
        this.zeigerSetzen(x, y)
        if (this.mode == floorplannerModes.DRAW) {
          this.updateTarget()
        } else if (this.trefferBestimmen()) {
          this.view.draw()
        }
        this.fingerX = x
        this.fingerY = y
        return
      }

      // Schieben: die Ansicht folgt dem Finger.
      const dx = x - this.fingerX
      const dy = y - this.fingerY
      this.originX -= dx
      this.originY -= dy
      this.fingerX = x
      this.fingerY = y
      this.view.draw()
    } else if (e.touches.length === 2) {
      const abstand = this.abstandZwischen(e)
      const rect = this.canvasElement.getBoundingClientRect()
      const mitteX = (e.touches[0].clientX + e.touches[1].clientX) / 2
      const mitteY = (e.touches[0].clientY + e.touches[1].clientY) / 2

      if (this.fingerAbstand > 0 && abstand > 0) {
        // Zwischen den beiden Fingern zoomen — dort schaut der Nutzer hin.
        this.zoomeAufPunkt(
          this.zoom * (abstand / this.fingerAbstand),
          mitteX - rect.left,
          mitteY - rect.top
        )
        // ...und mit der Mitte mitschieben (E3). Ohne das liesse sich im
        // Zeichnen- und Loeschen-Werkzeug die Ansicht ueberhaupt nicht mehr
        // verschieben, seit der eine Finger dort bearbeitet.
        this.originX -= mitteX - this.fingerMitteX
        this.originY -= mitteY - this.fingerMitteY
        this.view.draw()
      }
      this.fingerAbstand = abstand
      this.fingerMitteX = mitteX
      this.fingerMitteY = mitteY
    }
  }

  /** */
  private fingerEnde(): void {
    this.fingerAbstand = 0
    this.langdruckAbbrechen()
    this.fingerZugBeenden()

    // Kurzes Tippen im Zeichnen-Werkzeug setzt einen Punkt (E3) — das
    // Gegenstueck zum Klick. Bei der Maus erledigt das `mouseup`, das am Handy
    // nicht zuverlaessig kommt.
    if (this.mode == floorplannerModes.DRAW && !this.fingerHatGeschoben) {
      this.undoManager?.snapshot()
      const corner = this.floorplan.newCorner(this.targetX, this.targetY)
      if (this.lastNode != null) {
        // M2, wie beim Klick weiter oben: gezeichnet ist gesetzt.
        this.floorplan.newWall(this.lastNode, corner, undefined, 'gesetzt')
      }
      if (corner.mergeWithIntersected() && this.lastNode != null) {
        this.setMode(floorplannerModes.MOVE)
      } else {
        this.lastNode = corner
      }
      this.view.draw()
    }

    this.fingerHatGeschoben = false
  }

  /**
   * Einen laufenden Finger-Moebelzug beenden — losgelassen, zweiter Finger
   * dazugekommen oder Beruehrung abgebrochen.
   *
   * Die MARKE faellt mit dem Finger, und das ist kein Beiwerk: sie ist am Handy
   * die einzige Rueckmeldung, dass etwas in der Hand war (es gibt keinen
   * Zeiger, der `grabbing` zeigen koennte). Bliebe sie liegen, behauptete das
   * Bild dauerhaft einen Griff.
   */
  private fingerZugBeenden(): void {
    if (!this.fingerGreift) {
      return
    }
    this.fingerGreift = false
    this.zugBeenden()
    this.activeAusstattung = null
    // Die Wand-Merkung fällt mit derselben Begründung: `activeWall` treibt die
    // Hervorhebung im Bild, den Löschvorschlag UND die Schwenk-Sperre (W10
    // Punkt 3). Blieb sie nach dem Loslassen stehen, leuchtete die Wand weiter
    // und der Plan über ihr wäre unschwenkbar — am Handy fällt beides sofort auf.
    this.activeWall = null
    this.view.draw()
  }

  /**
   * Arbeitet der EINE Finger gerade, statt die Ansicht zu schieben? In Zeichnen
   * und Loeschen immer.
   *
   * Das Verschieben- und das Wand-Werkzeug stehen bewusst NICHT hier: dort
   * haengt die Antwort nicht am Werkzeug, sondern am TREFFER — Finger auf einem
   * Moebel (bzw. seit W12b auf einer Wand) zieht, Finger auf leerer Flaeche
   * schiebt die Ansicht. Diese Unterscheidung entscheidet `fingerStart` und
   * merkt sie sich in `fingerGreift`; sie hier mit zu beantworten hiesse, den
   * Treffer ein zweites Mal zu bestimmen.
   */
  private bearbeitetMitEinemFinger(): boolean {
    return this.mode == floorplannerModes.DRAW || this.mode == floorplannerModes.DELETE
  }

  /** */
  private langdruckAbbrechen(): void {
    if (this.langdruckTimer !== null) {
      clearTimeout(this.langdruckTimer)
      this.langdruckTimer = null
    }
  }

  /** */
  private abstandZwischen(e: TouchEvent): number {
    const dx = e.touches[0].clientX - e.touches[1].clientX
    const dy = e.touches[0].clientY - e.touches[1].clientY
    return Math.sqrt(dx * dx + dy * dy)
  }

  /** Resets the view - centers and resizes the floorplan */
  public reset(): void {
    this.resizeView()
    // Was der Zeiger überdeckte, gibt es so nicht mehr: `reset()` hängt an
    // `roomLoadedCallbacks`, läuft also nach JEDEM Laden — und nach einem
    // Rückgängig sind Ecken und Wände neue Objekte. `activeCorner`/`activeWall`
    // zeigten sonst auf entfernte Vorgänger, und der nächste Zug bewegte einen
    // Geist: sichtbar passiert nichts, gemeldet wird auch nichts.
    // (`activeAusstattung` und der Löschvorschlag räumt `setMode` gleich mit.)
    this.activeCorner = null
    this.activeWall = null
    this.setMode(floorplannerModes.MOVE)
    // Beim Oeffnen den ganzen Grundriss zeigen statt eines mittigen
    // Ausschnitts im Ausgangsmassstab (T7).
    this.allesEinpassen()
  }

  /** Resizes the view to fit the container */
  public resizeView(): void {
    this.view.handleWindowResize()
  }

  /** Sets the interaction mode */
  public setMode(mode: FloorplannerMode): void {
    this.lastNode = null
    // Ein Werkzeugwechsel nimmt jeden offenen Lösch-Vorschlag zurück (E1):
    // eine Rückfrage, die das Löschen-Werkzeug überlebt, würde nach dem
    // Wechsel etwas anbieten, das der Nutzer gar nicht mehr im Sinn hat.
    this.loeschungAbbrechen()
    this.activeAusstattung = null
    // Ecke und Wand MÜSSEN seit W10 hier mit weg. Vorher waren sie in jedem
    // Werkzeug, in dem sie überhaupt gesetzt wurden, auch greifbar — jetzt
    // nicht mehr: wer aus dem Wand-Werkzeug ins Verschieben wechselt, während
    // der Zeiger auf einer Wand steht, nähme die Merkung mit hinüber. Dort
    // greift sie nichts mehr, sperrt aber über die Schwenk-Bedingung in
    // `mousemove` die Ansicht — genau der Fleck, in dem der Zeiger nichts
    // bewirkt und niemand wüsste, warum (dieselbe Begründung wie in `reset`).
    this.activeCorner = null
    this.activeWall = null
    // Ein Werkzeugwechsel beendet auch einen laufenden Möbelzug (W2) —
    // `setMode` läuft unter anderem nach jedem Rückgängig, und danach ist das
    // gezogene Stück ein anderes Objekt. Der FINGER muss mit: bliebe seine
    // Merkung stehen, schöbe der nächste Wisch ein Möbel, das der Nutzer nie
    // angefasst hat (Handy-Welle).
    this.zugKennung = null
    this.fingerGreift = false
    // Dasselbe für die Öffnungen (W4). Der Geist MUSS mit: er zeigt eine
    // Öffnung, die es nicht gibt — nach dem Wechsel auf ein anderes Werkzeug
    // wäre er ein Versprechen, das der Zeiger dort nicht einlöst.
    this.zugOeffnung = null
    this.activeOeffnung = null
    this.geistOeffnung = null
    this.mode = mode
    this.zeigerStilSetzen()
    this.modeResetCallbacks.forEach((callback) => callback(mode))
    this.updateTarget()
  }

  /** Sets the origin so that floorplan is centered */
  public resetOrigin(): void {
    const centerX = this.canvasElement.clientWidth / 2.0
    const centerY = this.canvasElement.clientHeight / 2.0
    const centerFloorplan = this.floorplan.getCenter()
    this.originX = centerFloorplan.x * this.pixelsPerCm - centerX
    this.originY = centerFloorplan.z * this.pixelsPerCm - centerY
  }

  /** Pixel je Zentimeter beim aktuellen Zoom — der View entscheidet damit,
   *  ob eine Massangabe auf dem Bildschirm ueberhaupt noch Platz hat (T7). */
  public pixelProCm(): number {
    return this.pixelsPerCm
  }

  /** Convert from THREEjs coords to canvas coords. */
  public convertX(x: number): number {
    return (x - this.originX * this.cmPerPixel) * this.pixelsPerCm
  }

  /** Convert from THREEjs coords to canvas coords. */
  public convertY(y: number): number {
    return (y - this.originY * this.cmPerPixel) * this.pixelsPerCm
  }
}
