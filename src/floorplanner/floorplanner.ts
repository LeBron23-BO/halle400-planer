import { Floorplan } from '../model/floorplan'
import type { AusstattungElement } from '../model/floorplan'
import { Wall } from '../model/wall'
import { Corner } from '../model/corner'
import { FloorplannerView, floorplannerModes, AUSSTATTUNG_UMRISS_AB } from './floorplanner_view'
import type { UndoManager } from '../core/undo'

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
 * Was gerade zum Löschen vorgeschlagen wird (E1). Bewusst die Objektreferenz
 * und nicht ein Index oder eine ID: zwischen Vorschlag und Bestätigung liegt
 * eine Rückfrage, und in dieser Zeit darf sich die Liste verschieben, ohne dass
 * am Ende das Falsche verschwindet.
 */
export type LoeschZiel =
  | { art: 'ecke'; ecke: Corner; beschreibung: string }
  | { art: 'wand'; wand: Wall; beschreibung: string }
  | { art: 'ausstattung'; element: AusstattungElement; beschreibung: string }

/** Deutsche Namen der Ausstattungs-Zeichen für die Rückfrage (E1). */
const AUSSTATTUNG_NAME: Record<string, string> = {
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
  flaeche: 'Fläche'
}

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

  /** Was der Zeiger gerade überdeckt, auch ohne dass schon verweilt wurde. */
  public activeAusstattung: AusstattungElement | null = null

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
      const el = this.activeAusstattung
      ziel = {
        art: 'ausstattung',
        element: el,
        beschreibung: AUSSTATTUNG_NAME[el.typ] ?? el.typ
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
    } else {
      entfernt = this.floorplan.entferneAusstattung(ziel.element)
    }

    // Der Vorschlag ist verbraucht, und was gelöscht wurde, kann der Zeiger
    // nicht mehr überdecken — sonst schlüge das nächste Verweilen dasselbe
    // (jetzt verschwundene) Objekt erneut vor.
    this.loeschKandidat = null
    this.activeCorner = null
    this.activeWall = null
    this.activeAusstattung = null
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
    this.setMode(floorplannerModes.MOVE)
  }

  /** */
  private updateTarget(): void {
    if (this.mode == floorplannerModes.DRAW && this.lastNode) {
      if (Math.abs(this.mouseX - this.lastNode.x) < snapTolerance) {
        this.targetX = this.lastNode.x
      } else {
        this.targetX = this.mouseX
      }
      if (Math.abs(this.mouseY - this.lastNode.y) < snapTolerance) {
        this.targetY = this.lastNode.y
      } else {
        this.targetY = this.mouseY
      }
    } else {
      this.targetX = this.mouseX
      this.targetY = this.mouseY
    }

    this.view.draw()
  }

  /** */
  private mousedown(): void {
    this.mouseDown = true
    this.mouseMoved = false
    this.zugGesichert = false
    this.lastX = this.rawMouseX
    this.lastY = this.rawMouseY

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

  /** */
  private mousemove(event: MouseEvent): void {
    this.mouseMoved = true

    // update mouse
    this.rawMouseX = event.clientX
    this.rawMouseY = event.clientY

    const rect = this.canvasElement.getBoundingClientRect()
    this.mouseX = (event.clientX - rect.left) * this.cmPerPixel + this.originX * this.cmPerPixel
    this.mouseY = (event.clientY - rect.top) * this.cmPerPixel + this.originY * this.cmPerPixel

    // update target (snapped position of actual mouse)
    if (
      this.mode == floorplannerModes.DRAW ||
      (this.mode == floorplannerModes.MOVE && this.mouseDown)
    ) {
      this.updateTarget()
    }

    // update object target
    if (this.mode != floorplannerModes.DRAW && !this.mouseDown) {
      // Greifzone in Weltkoordinaten umrechnen, damit sie auf dem Bildschirm
      // bei jedem Zoom gleich gross bleibt (T7).
      const toleranz = GREIF_TOLERANZ_PX * this.cmPerPixel
      const hoverCorner: Corner | null = this.floorplan.overlappedCorner(
        this.mouseX,
        this.mouseY,
        toleranz
      )
      const hoverWall: Wall | null = this.floorplan.overlappedWall(
        this.mouseX,
        this.mouseY,
        toleranz
      )
      let draw = false
      if (hoverCorner != this.activeCorner) {
        this.activeCorner = hoverCorner
        draw = true
      }
      // corner takes precendence
      if (this.activeCorner == null) {
        if (hoverWall != this.activeWall) {
          this.activeWall = hoverWall
          draw = true
        }
      } else {
        this.activeWall = null
      }

      // Ausstattung greifen (E1) — BEWUSST nur im Löschen-Werkzeug. Im
      // Verschieben-Modus würde ein hervorgehobenes Möbel nur verwirren, denn
      // bewegen lässt es sich (noch) nicht; und Zeile "panning" unten prüft
      // ausschliesslich Ecke/Wand, bliebe davon also unberührt.
      if (this.mode == floorplannerModes.DELETE) {
        // Nur greifbar, solange die Ausstattung auch GEZEICHNET wird. Ohne
        // diese Kopplung liesse sich beim weit herausgezoomten Blick ein Möbel
        // löschen, das dort gar nicht zu sehen ist — die Rückfrage benennte
        // dann einen „Stuhl", den der Nutzer nirgends findet.
        const sichtbar = this.pixelProCm() >= AUSSTATTUNG_UMRISS_AB
        const hoverAusstattung =
          sichtbar && this.activeCorner == null && this.activeWall == null
            ? this.floorplan.overlappedAusstattung(this.mouseX, this.mouseY, toleranz)
            : null
        if (hoverAusstattung != this.activeAusstattung) {
          this.activeAusstattung = hoverAusstattung
          draw = true
        }
      } else if (this.activeAusstattung != null) {
        this.activeAusstattung = null
        draw = true
      }

      if (draw) {
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
            this.activeCorner != null || this.activeWall != null || this.activeAusstattung != null
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
    if (this.mouseDown && !this.activeCorner && !this.activeWall) {
      this.originX += this.lastX - this.rawMouseX
      this.originY += this.lastY - this.rawMouseY
      this.lastX = this.rawMouseX
      this.lastY = this.rawMouseY
      this.view.draw()
    }

    // dragging
    if (this.mode == floorplannerModes.MOVE && this.mouseDown) {
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

    // drawing
    if (this.mode == floorplannerModes.DRAW && !this.mouseMoved) {
      // Jeder gesetzte Punkt ist ein eigener Zug: beim Zeichnen eines
      // Streckenzugs nimmt Strg+Z Punkt fuer Punkt zurueck, nicht alles auf einmal.
      this.undoManager?.snapshot()
      const corner = this.floorplan.newCorner(this.targetX, this.targetY)
      if (this.lastNode != null) {
        this.floorplan.newWall(this.lastNode, corner)
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
    // Das laufende Verweilen endet mit dem Zeichenbereich — ein OFFENER
    // Vorschlag aber nicht: die Rückfrage liegt ausserhalb des Canvas, der Weg
    // dorthin löst zwangsläufig mouseleave aus und würde sie sonst schliessen.
    this.verweilAbbrechen()
    //scope.setMode(scope.modes.MOVE);
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

  /** */
  private fingerStart(e: TouchEvent): void {
    e.preventDefault()
    if (e.touches.length === 1) {
      this.fingerX = e.touches[0].clientX
      this.fingerY = e.touches[0].clientY
    } else if (e.touches.length === 2) {
      this.fingerAbstand = this.abstandZwischen(e)
    }
  }

  /** */
  private fingerBewegt(e: TouchEvent): void {
    e.preventDefault()
    if (e.touches.length === 1) {
      // Schieben: die Ansicht folgt dem Finger.
      const dx = e.touches[0].clientX - this.fingerX
      const dy = e.touches[0].clientY - this.fingerY
      this.originX -= dx
      this.originY -= dy
      this.fingerX = e.touches[0].clientX
      this.fingerY = e.touches[0].clientY
      this.view.draw()
    } else if (e.touches.length === 2) {
      const abstand = this.abstandZwischen(e)
      if (this.fingerAbstand > 0 && abstand > 0) {
        const rect = this.canvasElement.getBoundingClientRect()
        // Zwischen den beiden Fingern zoomen — dort schaut der Nutzer hin.
        const mitteX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left
        const mitteY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top
        this.zoomeAufPunkt(this.zoom * (abstand / this.fingerAbstand), mitteX, mitteY)
      }
      this.fingerAbstand = abstand
    }
  }

  /** */
  private fingerEnde(): void {
    this.fingerAbstand = 0
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
    this.mode = mode
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
