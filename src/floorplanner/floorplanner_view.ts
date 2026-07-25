import { Floorplan, AusstattungElement } from '../model/floorplan'
import { Wall } from '../model/wall'
import { Corner } from '../model/corner'
import { Room } from '../model/room'
import { HalfEdge } from '../model/half_edge'
import { Dimensioning } from '../core/dimensioning'
import { Utils } from '../core/utils'
import type { Floorplanner } from './floorplanner'

/** */
export const floorplannerModes = {
  MOVE: 0,
  DRAW: 1,
  DELETE: 2
}

// grid parameters
const gridSpacing = 20 // pixels
const gridWidth = 1
const gridColor = '#f1f1f1'

// room config
const roomColor = '#f9f9f9'

// wall config
const wallWidth = 5
const wallWidthHover = 7
const wallColor = '#dddddd'
const wallColorHover = '#008cba'
const edgeColor = '#888888'
const edgeColorHover = '#008cba'
const edgeWidth = 1

const deleteColor = '#ff0000'

/**
 * Füllung des zum Löschen vorgeschlagenen Ausstattungs-Zeichens (E1).
 * Durchscheinend, damit die Signatur darunter erkennbar bleibt — wer bestätigen
 * soll, muss ja noch sehen, WAS da verschwindet.
 */
const loeschFuellung = 'rgba(255, 0, 0, 0.22)'

// Ausstattung (A1) — bewusst zurückhaltend: die Bausubstanz muss die
// kräftigste Linie im Bild bleiben, die Möblierung ist Beiwerk.
// Bewusst ein BLAUGRAU, kein neutrales Grau: die Wand-Kante ist #888888
// (r=g=b). Ein neutralgraues Möbel wäre von ihr weder für das Auge noch für
// eine Messung sicher zu trennen — die erste Fassung dieser Prüfung hielt
// prompt jede Wandkante für Ausstattung und meldete trotzdem „bestanden".
// Der Blaustich (b − r = 31) macht den Unterschied eindeutig, ohne laut zu sein.
const ausstattungLinie = '#7d8a9c'
const ausstattungFuellung = '#ffffff'
const ausstattungFlaeche = '#efe7dd' // Loggia/Kiesbett, wie im Plan beige
const ausstattungGruen = '#cfdcc8' // Bepflanzung
const ausstattungLinienBreite = 1

/**
 * Ab wann die Ausstattung DETAILS zeigt (Treppenstufen, Kochfeld-Platten,
 * Stuhl-Lehnen) und ab wann nur noch ihren Umriss. Beides sind Schwellen in
 * BILDSCHIRM-Pixeln pro cm, nicht in Weltmaß — dieselbe Lehre wie bei den
 * Maßangaben und Raumnamen in T7: was mit dem Zoom mitschrumpft, wird bei
 * eingepasster Halle zu Matsch. Bei 0,045 px/cm (Handy, ganze Halle) ist ein
 * 160-cm-Schreibtisch sieben Pixel breit — ein Umriss sagt dort mehr als ein
 * Detail, das zu einem Fleck verklumpt.
 */
const AUSSTATTUNG_DETAIL_AB = 0.3
/**
 * Exportiert, weil der Floorplanner dieselbe Schwelle fürs GREIFEN braucht
 * (E1): was nicht gezeichnet wird, darf auch nicht getroffen und gelöscht
 * werden — sonst verschwände beim weit herausgezoomten Blick ein Möbel, das
 * der Nutzer an dieser Stelle gar nicht sehen konnte.
 */
export const AUSSTATTUNG_UMRISS_AB = 0.03

// corner config
const cornerRadius = 0
const cornerRadiusHover = 7
const cornerColor = '#cccccc'
const cornerColorHover = '#008cba'

/**
 * The View to be used by a Floorplanner to render in/interact with.
 */
export class FloorplannerView {
  /** The canvas element. */
  private canvasElement: HTMLCanvasElement

  /** The 2D context. */
  private context: CanvasRenderingContext2D

  /** Resize handler reference for cleanup */
  private resizeHandler: () => void

  /** */
  constructor(
    private floorplan: Floorplan,
    private viewmodel: Floorplanner,
    private canvas: string
  ) {
    this.canvasElement = document.getElementById(canvas) as HTMLCanvasElement
    this.context = this.canvasElement.getContext('2d') as CanvasRenderingContext2D

    // Bind resize handler for later cleanup
    this.resizeHandler = () => {
      this.handleWindowResize()
    }
    window.addEventListener('resize', this.resizeHandler)
    this.handleWindowResize()
  }

  /** Cleanup method to remove event listeners */
  public destroy() {
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler)
    }
  }

  /** */
  public handleWindowResize() {
    const canvasElement = document.getElementById(this.canvas) as HTMLCanvasElement
    // Check if canvas element exists before accessing parentElement
    if (!canvasElement) {
      console.warn('Canvas element not found:', this.canvas)
      return
    }
    const parent = canvasElement.parentElement
    if (parent) {
      const parentHeight = parent.clientHeight
      const parentWidth = parent.clientWidth
      canvasElement.style.height = parentHeight + 'px'
      canvasElement.style.width = parentWidth + 'px'
      this.canvasElement.height = parentHeight
      this.canvasElement.width = parentWidth
    }
    this.draw()
  }

  /** */
  public draw() {
    this.context.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height)

    this.drawGrid()

    this.floorplan.getRooms().forEach((room) => {
      this.drawRoom(room)
    })

    // Die Ausstattung liegt zwischen Raum und Wand: so überdeckt die kräftige
    // Wandlinie die Möbelkanten, die an sie stoßen — genau wie im gezeichneten
    // Plan. Andersherum lägen Tischkanten über der Wand und ließen sie
    // durchbrochen erscheinen.
    this.drawAusstattung()

    this.floorplan.getWalls().forEach((wall) => {
      this.drawWall(wall)
    })

    this.floorplan.getCorners().forEach((corner) => {
      this.drawCorner(corner)
    })

    if (this.viewmodel.mode == floorplannerModes.DRAW) {
      this.drawTarget(this.viewmodel.targetX, this.viewmodel.targetY, this.viewmodel.lastNode)
    }

    this.floorplan.getWalls().forEach((wall) => {
      this.drawWallLabels(wall)
    })
  }

  /** */
  private drawWallLabels(wall: Wall) {
    // we'll just draw the shorter label... idk
    if (wall.backEdge && wall.frontEdge) {
      if (wall.backEdge.interiorDistance < wall.frontEdge.interiorDistance) {
        this.drawEdgeLabel(wall.backEdge)
      } else {
        this.drawEdgeLabel(wall.frontEdge)
      }
    } else if (wall.backEdge) {
      this.drawEdgeLabel(wall.backEdge)
    } else if (wall.frontEdge) {
      this.drawEdgeLabel(wall.frontEdge)
    }
  }

  /** */
  private drawWall(wall: Wall) {
    const hover = wall === this.viewmodel.activeWall
    let color = wallColor
    if (hover && this.viewmodel.mode == floorplannerModes.DELETE) {
      color = deleteColor
    } else if (hover) {
      color = wallColorHover
    }
    this.drawLine(
      this.viewmodel.convertX(wall.getStartX()),
      this.viewmodel.convertY(wall.getStartY()),
      this.viewmodel.convertX(wall.getEndX()),
      this.viewmodel.convertY(wall.getEndY()),
      hover ? wallWidthHover : wallWidth,
      color
    )
    if (!hover && wall.frontEdge) {
      this.drawEdge(wall.frontEdge, hover)
    }
    if (!hover && wall.backEdge) {
      this.drawEdge(wall.backEdge, hover)
    }
  }

  /** */
  private drawEdgeLabel(edge: HalfEdge) {
    const pos = edge.interiorCenter()
    const length = edge.interiorDistance()
    if (length < 60) {
      // dont draw labels on walls this short
      return
    }
    // Die Schrift skaliert NICHT mit (12 px bleiben 12 px), die Wand aber
    // schon. Beim Herauszoomen auf die ganze Halle laegen sonst hundert
    // Massangaben uebereinander und ergaeben einen unlesbaren Textbrei —
    // deshalb entscheidet die Laenge AUF DEM BILDSCHIRM, nicht die in cm (T7).
    if (length * this.viewmodel.pixelProCm() < 45) {
      return
    }
    this.context.font = 'normal 12px Arial'
    this.context.fillStyle = '#000000'
    this.context.textBaseline = 'middle'
    this.context.textAlign = 'center'
    this.context.strokeStyle = '#ffffff'
    this.context.lineWidth = 4

    this.context.strokeText(
      Dimensioning.cmToMeasure(length),
      this.viewmodel.convertX(pos.x),
      this.viewmodel.convertY(pos.y)
    )
    this.context.fillText(
      Dimensioning.cmToMeasure(length),
      this.viewmodel.convertX(pos.x),
      this.viewmodel.convertY(pos.y)
    )
  }

  /** */
  private drawEdge(edge: HalfEdge, hover: boolean) {
    let color = edgeColor
    if (hover && this.viewmodel.mode == floorplannerModes.DELETE) {
      color = deleteColor
    } else if (hover) {
      color = edgeColorHover
    }
    const corners = edge.corners()

    this.drawPolygon(
      Utils.map(corners, (corner) => {
        return this.viewmodel.convertX(corner.x)
      }),
      Utils.map(corners, (corner) => {
        return this.viewmodel.convertY(corner.y)
      }),
      false,
      null,
      true,
      color,
      edgeWidth
    )
  }

  /** */
  private drawRoom(room: Room) {
    this.drawPolygon(
      Utils.map(room.corners, (corner: Corner) => {
        return this.viewmodel.convertX(corner.x)
      }),
      Utils.map(room.corners, (corner: Corner) => {
        return this.viewmodel.convertY(corner.y)
      }),
      true,
      roomColor
    )
  }

  // ---------------------------------------------------------------- A1
  // Ausstattung: Grundriss-Zeichen statt 3D-Möbel.
  //
  // WARUM HIER UND NICHT ALS `items`: der 2D-Editor zeichnet `items`
  // überhaupt nicht (draw() kennt nur Raster, Räume, Wände, Ecken, Maße) —
  // eine als Item eingepflegte Einrichtung wäre im Grundriss unsichtbar, also
  // genau in der Ansicht, die der PDF entspricht. Dazu trägt der Katalog des
  // Upstreams eine Wohnungs-Einrichtung (Betten, Sofas) ohne Treppe, Sanitär
  // oder Küchenzeile, und jedes Modell wiegt Megabytes auf einem fremden CDN.

  /** Zeichnet die gesamte gemessene Ausstattung. */
  private drawAusstattung() {
    const proCm = this.viewmodel.pixelProCm()
    if (proCm < AUSSTATTUNG_UMRISS_AB) {
      return
    }
    const detail = proCm >= AUSSTATTUNG_DETAIL_AB
    const kandidat =
      this.viewmodel.loeschKandidat?.art === 'ausstattung'
        ? this.viewmodel.loeschKandidat.element
        : null
    this.floorplan.getAusstattung().forEach((el) => {
      this.zeichneAusstattung(el, detail)
      // Markierung NACH dem Zeichen, damit sie darüber liegt — und bewusst als
      // Rahmen um den Umriss statt als Farbwechsel in jeder der elf
      // Zeichenvorschriften: eine Stelle, die für jede Signatur gilt, kann
      // nicht bei der zwölften vergessen werden.
      if (el === kandidat) {
        this.markiereAusstattung(el, true)
      } else if (el === this.viewmodel.activeAusstattung) {
        this.markiereAusstattung(el, false)
      }
    })
  }

  /**
   * Roter Rahmen um ein Ausstattungs-Zeichen (E1). `fest` = es steht zur
   * Löschung an (kräftig, gefüllt), sonst nur der Zeiger darüber (dünn).
   */
  private markiereAusstattung(el: AusstattungElement, fest: boolean) {
    const hb = el.breite / 2
    const ht = el.tiefe / 2
    const ecken: Array<[number, number]> = [
      this.ausPunkt(el, -hb, -ht),
      this.ausPunkt(el, hb, -ht),
      this.ausPunkt(el, hb, ht),
      this.ausPunkt(el, -hb, ht)
    ]
    this.drawPolygon(
      ecken.map((p) => p[0]),
      ecken.map((p) => p[1]),
      fest,
      loeschFuellung,
      true,
      deleteColor,
      fest ? 3 : 2
    )
  }

  /**
   * Rechnet einen Punkt im lokalen System des Elements (dx/dy in cm vom
   * Mittelpunkt, vor Drehung) in Bildschirm-Pixel um. Die Drehung passiert
   * bewusst hier in Weltkoordinaten und nicht über `context.rotate`: so bleibt
   * jede Signatur eine schlichte Punktliste und kann nie gegen den Zoom
   * verrutschen.
   */
  private ausPunkt(el: AusstattungElement, dx: number, dy: number): [number, number] {
    const w = el.drehung ?? 0
    const cos = Math.cos(w)
    const sin = Math.sin(w)
    return [
      this.viewmodel.convertX(el.x + dx * cos - dy * sin),
      this.viewmodel.convertY(el.y + dx * sin + dy * cos)
    ]
  }

  /** Umriss-Rechteck des Elements, wahlweise gefüllt. */
  private ausRechteck(el: AusstattungElement, fuellung: string | null, rand: boolean = true) {
    const hb = el.breite / 2
    const ht = el.tiefe / 2
    const ecken: Array<[number, number]> = [
      this.ausPunkt(el, -hb, -ht),
      this.ausPunkt(el, hb, -ht),
      this.ausPunkt(el, hb, ht),
      this.ausPunkt(el, -hb, ht)
    ]
    this.drawPolygon(
      ecken.map((p) => p[0]),
      ecken.map((p) => p[1]),
      fuellung !== null,
      fuellung,
      rand,
      ausstattungLinie,
      ausstattungLinienBreite
    )
  }

  /** Linie zwischen zwei Punkten im lokalen System des Elements. */
  private ausLinie(
    el: AusstattungElement,
    dx1: number,
    dy1: number,
    dx2: number,
    dy2: number
  ) {
    const a = this.ausPunkt(el, dx1, dy1)
    const b = this.ausPunkt(el, dx2, dy2)
    this.drawLine(a[0], a[1], b[0], b[1], ausstattungLinienBreite, ausstattungLinie)
  }

  /** Ellipse im lokalen System (Mittelpunkt dx/dy, Halbachsen in cm). */
  private ausEllipse(
    el: AusstattungElement,
    dx: number,
    dy: number,
    rx: number,
    ry: number,
    fuellung: string | null
  ) {
    const proCm = this.viewmodel.pixelProCm()
    const m = this.ausPunkt(el, dx, dy)
    this.context.beginPath()
    this.context.ellipse(m[0], m[1], rx * proCm, ry * proCm, el.drehung ?? 0, 0, 2 * Math.PI)
    if (fuellung) {
      this.context.fillStyle = fuellung
      this.context.fill()
    }
    this.context.lineWidth = ausstattungLinienBreite
    this.context.strokeStyle = ausstattungLinie
    this.context.stroke()
  }

  /** Ein einzelnes Ausstattungs-Zeichen. */
  private zeichneAusstattung(el: AusstattungElement, detail: boolean) {
    const hb = el.breite / 2
    const ht = el.tiefe / 2

    switch (el.typ) {
      case 'flaeche':
        // Loggia/Kiesbett: nur Fläche, kein Rand — sie ist Untergrund, kein Möbel.
        this.ausRechteck(el, ausstattungFlaeche, false)
        return

      case 'rundtisch':
        this.ausEllipse(el, 0, 0, hb, ht, ausstattungFuellung)
        return

      case 'pflanze':
        this.ausEllipse(el, 0, 0, hb, ht, ausstattungGruen)
        if (detail) {
          // vier Zacken deuten das Blattwerk an
          for (let i = 0; i < 4; i++) {
            const w = (i * Math.PI) / 2 + Math.PI / 4
            this.ausLinie(el, Math.cos(w) * hb * 0.5, Math.sin(w) * ht * 0.5, Math.cos(w) * hb, Math.sin(w) * ht)
          }
        }
        return

      case 'stuhl':
        this.ausRechteck(el, ausstattungFuellung)
        if (detail) {
          // Lehne: die Kante, die vom zugehörigen Tisch wegzeigt (lokal +y)
          this.ausLinie(el, -hb, ht, hb, ht)
        }
        return

      case 'schrank':
        this.ausRechteck(el, ausstattungFuellung)
        if (detail) {
          this.ausLinie(el, -hb, -ht, hb, ht)
        }
        return

      case 'aufzug':
        this.ausRechteck(el, ausstattungFuellung)
        this.ausLinie(el, -hb, -ht, hb, ht)
        this.ausLinie(el, hb, -ht, -hb, ht)
        return

      case 'treppe': {
        this.ausRechteck(el, ausstattungFuellung)
        if (detail) {
          // Stufen quer zur Laufrichtung (Lauf = lokale x-Achse), rund 28 cm
          // Auftritt — das ist die Norm-Darstellung eines Treppenlaufs.
          const stufen = Math.max(2, Math.round(el.breite / 28))
          for (let i = 1; i < stufen; i++) {
            const dx = -hb + (el.breite * i) / stufen
            this.ausLinie(el, dx, -ht, dx, ht)
          }
        }
        return
      }

      case 'kochfeld': {
        this.ausRechteck(el, ausstattungFuellung)
        if (detail) {
          const rx = el.breite / 8
          const ry = el.tiefe / 8
          for (const sx of [-1, 1]) {
            for (const sy of [-1, 1]) {
              this.ausEllipse(el, (sx * el.breite) / 4, (sy * el.tiefe) / 4, rx, ry, null)
            }
          }
        }
        return
      }

      case 'wc':
        // Kabine als Rechteck, Becken als Ellipse an der Rückwand (lokal -y)
        this.ausRechteck(el, ausstattungFuellung)
        if (detail) {
          this.ausEllipse(el, 0, -ht * 0.25, hb * 0.5, ht * 0.32, null)
        }
        return

      case 'waschbecken':
        this.ausRechteck(el, ausstattungFuellung)
        if (detail) {
          this.ausEllipse(el, 0, 0, hb * 0.62, ht * 0.52, null)
        }
        return

      case 'tisch':
      default:
        this.ausRechteck(el, ausstattungFuellung)
        return
    }
  }

  /** */
  private drawCorner(corner: Corner) {
    const hover = corner === this.viewmodel.activeCorner
    let color = cornerColor
    if (hover && this.viewmodel.mode == floorplannerModes.DELETE) {
      color = deleteColor
    } else if (hover) {
      color = cornerColorHover
    }
    this.drawCircle(
      this.viewmodel.convertX(corner.x),
      this.viewmodel.convertY(corner.y),
      hover ? cornerRadiusHover : cornerRadius,
      color
    )
  }

  /** */
  private drawTarget(x: number, y: number, lastNode: Corner | null) {
    this.drawCircle(
      this.viewmodel.convertX(x),
      this.viewmodel.convertY(y),
      cornerRadiusHover,
      cornerColorHover
    )
    if (this.viewmodel.lastNode) {
      this.drawLine(
        this.viewmodel.convertX(lastNode!.x),
        this.viewmodel.convertY(lastNode!.y),
        this.viewmodel.convertX(x),
        this.viewmodel.convertY(y),
        wallWidthHover,
        wallColorHover
      )
    }
  }

  /** */
  private drawLine(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    width: number,
    color: string
  ) {
    // width is an integer
    // color is a hex string, i.e. #ff0000
    this.context.beginPath()
    this.context.moveTo(startX, startY)
    this.context.lineTo(endX, endY)
    this.context.lineWidth = width
    this.context.strokeStyle = color
    this.context.stroke()
  }

  /** */
  private drawPolygon(
    xArr: number[],
    yArr: number[],
    fill?: boolean,
    fillColor?: string | null,
    stroke?: boolean,
    strokeColor?: string,
    strokeWidth?: number
  ) {
    // fillColor is a hex string, i.e. #ff0000
    fill = fill || false
    stroke = stroke || false
    this.context.beginPath()
    this.context.moveTo(xArr[0], yArr[0])
    for (let i = 1; i < xArr.length; i++) {
      this.context.lineTo(xArr[i], yArr[i])
    }
    this.context.closePath()
    if (fill && fillColor) {
      this.context.fillStyle = fillColor
      this.context.fill()
    }
    if (stroke && strokeColor) {
      this.context.lineWidth = strokeWidth!
      this.context.strokeStyle = strokeColor
      this.context.stroke()
    }
  }

  /** */
  private drawCircle(centerX: number, centerY: number, radius: number, fillColor: string) {
    this.context.beginPath()
    this.context.arc(centerX, centerY, radius, 0, 2 * Math.PI, false)
    this.context.fillStyle = fillColor
    this.context.fill()
  }

  /** returns n where -gridSize/2 < n <= gridSize/2  */
  private calculateGridOffset(n: number): number {
    if (n >= 0) {
      return ((n + gridSpacing / 2.0) % gridSpacing) - gridSpacing / 2.0
    } else {
      return ((n - gridSpacing / 2.0) % gridSpacing) + gridSpacing / 2.0
    }
  }

  /** */
  private drawGrid() {
    const offsetX = this.calculateGridOffset(-this.viewmodel.originX)
    const offsetY = this.calculateGridOffset(-this.viewmodel.originY)
    const width = this.canvasElement.width
    const height = this.canvasElement.height
    for (let x = 0; x <= width / gridSpacing; x++) {
      this.drawLine(
        gridSpacing * x + offsetX,
        0,
        gridSpacing * x + offsetX,
        height,
        gridWidth,
        gridColor
      )
    }
    for (let y = 0; y <= height / gridSpacing; y++) {
      this.drawLine(
        0,
        gridSpacing * y + offsetY,
        width,
        gridSpacing * y + offsetY,
        gridWidth,
        gridColor
      )
    }
  }
}
