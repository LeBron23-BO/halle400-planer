import { Floorplan, AusstattungElement, AusstattungTyp, Oeffnung } from '../model/floorplan'
import { Wall } from '../model/wall'
import { Corner } from '../model/corner'
import { Room } from '../model/room'
import { HalfEdge } from '../model/half_edge'
import { Dimensioning } from '../core/dimensioning'
import { Utils } from '../core/utils'
import type { Floorplanner } from './floorplanner'

/** */
export const floorplannerModes = {
  /**
   * Möbel verschieben. Seit W9 NUR noch Möbel — Wand-Ecken und Wände sind hier
   * nicht mehr greifbar (s. `WAND`).
   */
  MOVE: 0,
  DRAW: 1,
  DELETE: 2,
  /**
   * Türen, Fenster und Durchgänge setzen (W4). Ein EIGENES Werkzeug und kein
   * Zusatz zum Verschieben: der Zeiger tut hier etwas anderes — er zeigt eine
   * Geister-Öffnung auf der nächsten Wand statt zu greifen. Zwei Bedeutungen in
   * einem Werkzeug hiessen raten, welche gemeint war.
   */
  OEFFNUNG: 3,
  /**
   * WÄNDE VERSCHIEBEN (W9) — Ecken und Wände ziehen, sonst nichts.
   *
   * WARUM EIN EIGENES WERKZEUG UND KEIN ZUSATZ ZUM VERSCHIEBEN: gemessen wurde,
   * dass ein Zug auf eine Wand-Ecke im Verschieben-Werkzeug — dieselbe Geste
   * wie beim Möbelziehen, ohne Werkzeugwechsel und ohne Rückfrage — die
   * Aussenwand um 2,24 m verschob; danach stand auf dem Blatt „kein Aufmaß".
   * Die Greifzone ist im Startzoom 8 px = 41 cm breit, ein Stuhl misst 45 cm
   * (8,9 px): die Fehlertoleranz ist so gross wie der Gegenstand. Solange
   * dieselbe Geste beides bedeuten kann, entscheidet der Zufall, was passiert.
   *
   * Es ist DIESELBE Trennung, die der Finger seit W8 hat: er greift nur
   * Ausstattung, nie Ecke oder Wand (W8 Punkt 3). Dort war die Begründung, dass
   * der Finger nichts überfliegen kann; hier ist sie, dass die Folge eines
   * Fehlgriffs unverhältnismässig ist. Und es ist NICHT das Zeichnen-Werkzeug
   * geworden: dort ist der Ecken-Fang (E2) die tragende Bedienung — wer eine
   * Trennwand an die Aussenwand anschliessen will, DRÜCKT auf deren Ecke.
   * Würde ein Druck dort die Ecke verschieben, wäre genau der wichtigste Fall
   * des Zeichnens nicht mehr zu bedienen.
   */
  WAND: 4
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

/**
 * Füllung des GEGRIFFENEN Ausstattungs-Zeichens (Handy-Welle) — dieselbe Farbe
 * wie der Hover-Rahmen (`#008cba` = 0,140,186), nur sehr schwach. Am Handy
 * liegt die Fingerkuppe auf dem Stück; ohne eine Fläche wäre der Rahmen bei
 * einem 40-cm-Stuhl vollständig verdeckt. Schwächer als die Lösch-Füllung
 * (0,14 gegen 0,22), weil „in der Hand" ein Zustand ist und keine Warnung.
 */
const griffFuellung = 'rgba(0, 140, 186, 0.14)'

/**
 * Ring um eine Ecke, auf die der nächste Zeichenpunkt einrastet (E2). Grün,
 * bewusst NICHT die Hover-Farbe: Hover heisst „das könntest du greifen",
 * Einrasten heisst „hier landet der Punkt wirklich" — zwei verschiedene
 * Aussagen brauchen zwei verschiedene Farben.
 */
const fangFarbe = '#22a04a'

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
 * Strichelung für GESETZTE Ausstattung (Herkunft `'gesetzt'`) — 4 px Strich,
 * 3 px Lücke, in BILDSCHIRM-Pixeln wie die Linienbreite selbst. Die Zahlen sind
 * die kleinsten, bei denen die Lücke bei 1 px Linienbreite noch als Lücke zu
 * sehen ist; grösser gewählt löste sich der Umriss eines 40-cm-Stuhls auf.
 * Gestrichelt heisst in jeder Bauzeichnung „nicht gesichert" — genau das ist
 * gemeint: hier steht eine Annahme, kein Aufmaß aus der PDF.
 */
const GESETZT_STRICH = [4, 3]

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

/* ── Öffnungen: Türen, Fenster, Durchgänge (W4) ──────────────────────────
   Ein GEDÄMPFTES GRÜN (#3f6757, der Sage-Ton des Projekts). Die Farbe ist
   nicht Geschmack, sondern MESSBARKEIT: die Wandkante ist #888888 (r=g=b), die
   Ausstattung #7d8a9c (blaustichig, b−r = 31). Ein Türblatt in einem der beiden
   Töne wäre weder für das Auge noch für eine Prüfung von ihnen zu trennen —
   genau der Fehler, den die Ausstattung in A1 schon einmal gemacht hat. Grün
   (g−r = 40, g−b = 16) ist von beiden eindeutig verschieden. */
const oeffnungLinie = '#3f6757'
/** Der Geist (was entstünde, wenn man klickte) — Amber, die Akzentfarbe. */
const oeffnungGeist = '#c8703a'
/** Der Geist an einer Stelle, an der nichts entstehen kann. */
const oeffnungGeistSperrt = '#a33a2a'
/** Womit die Wandlinie unterbrochen wird: Papierweiss. So sieht eine Öffnung
 *  in jeder Bauzeichnung aus — die Wand ist dort schlicht nicht da. */
const oeffnungFuellung = '#ffffff'
/**
 * Wie breit die Unterbrechung MINDESTENS ist, in BILDSCHIRM-Pixeln.
 *
 * GEMESSEN, nicht geschätzt: `drawWall` malt die Wand als 5 px breite Linie,
 * und zwar unabhängig vom Zoom. Eine Unterbrechung, die nur die echten 12,5 cm
 * Wanddicke abdeckt, ist bei eingepasster Halle (0,045 px/cm) ein halber
 * Bildpunkt breit und lässt die Wandlinie ungerührt durchlaufen — die Tür wäre
 * unsichtbar, obwohl sie im Modell steht. Halbe Linienbreite plus ein Pixel
 * Reserve deckt sie sicher ab.
 */
const OEFFNUNG_MIN_QUER_PX = wallWidth / 2 + 1

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

    // Die Öffnungen liegen ÜBER den Wänden und UNTER den Ecken (W4): sie
    // unterbrechen die Wandlinie, müssen also nach ihr kommen. Vor den Ecken,
    // weil eine Ecke ein Anschlusspunkt ist — sie darf von einem Türblatt nie
    // verdeckt werden, sonst zielt man beim Zeichnen daneben.
    this.drawOeffnungen()

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
        ? this.viewmodel.loeschKandidat.kennung
        : null
    /**
     * WAS IN DER HAND IST, MUSS MAN SEHEN (Handy-Welle).
     *
     * Am Rechner sagt es der Zeiger: er wechselt auf `grabbing`, sobald ein
     * Stück gegriffen ist (`zeigerStilSetzen`). Am Handy gibt es keinen Zeiger,
     * und der Finger verdeckt genau das Stück, um das es geht — es bliebe also
     * ohne jede Rückmeldung, ob der Wisch die Ansicht schiebt oder ein Möbel.
     *
     * Deshalb bekommt das gegriffene Stück einen kräftigeren Rahmen, und zwar
     * in DERSELBEN Farbe wie das blosse Überfahren. Eine neue Farbe wäre eine
     * neue Aussage; hier ist es dieselbe Aussage in einer zweiten Stufe:
     * „greifbar" -> „gegriffen". Der Rahmen liegt um den Umriss und ist damit
     * auch dann noch zu sehen, wenn die Kuppe die Mitte verdeckt.
     */
    const inDerHand = this.viewmodel.zugLaeuft()
    this.floorplan.getAusstattung().forEach((el) => {
      // GESETZT wird gestrichelt gezeichnet, GEMESSEN durchgezogen (Projekt-DNA:
      // die PDF ist die Grundwahrheit). Ein frei hingestelltes Stück sieht sonst
      // aus wie ein Aufmaß — und dann liest die Bank eine Annahme als Messung.
      // Der Strich sitzt hier am Aufruf und nicht in `zeichneAusstattung`: die
      // hat elf Zweige mit eigenem `return`, das Zurücksetzen wäre dort in
      // jedem einzelnen zu wiederholen und beim zwölften vergessen.
      const gesetzt = el.quelle === 'gesetzt'
      if (gesetzt) {
        this.context.setLineDash(GESETZT_STRICH)
      }
      this.zeichneAusstattung(el, detail)
      // Die `flaeche` (Loggia, Kiesbett) wird bewusst OHNE Rand gezeichnet — sie
      // ist Untergrund, kein Möbel. Genau dadurch wäre eine GESETZTE Fläche von
      // einer gemessenen nicht zu unterscheiden, und das ist der eine Fall, den
      // die Strichelung nicht abdecken darf. Sie bekommt ihren Rand deshalb
      // hier, und nur wenn sie gesetzt ist.
      if (gesetzt && el.typ === 'flaeche') {
        this.ausRechteck(el, null, true)
      }
      if (gesetzt) {
        this.context.setLineDash([])
      }
      // Markierung NACH dem Zeichen, damit sie darüber liegt — und bewusst als
      // Rahmen um den Umriss statt als Farbwechsel in jeder der elf
      // Zeichenvorschriften: eine Stelle, die für jede Signatur gilt, kann
      // nicht bei der zwölften vergessen werden.
      if (el.id === kandidat) {
        this.markiereAusstattung(el, 'loeschen')
      } else if (el.id === inDerHand) {
        this.markiereAusstattung(el, 'griff')
      } else if (el.id === this.viewmodel.activeAusstattung) {
        this.markiereAusstattung(el, 'zeiger')
      }
    })
  }

  /**
   * Rahmen um ein Ausstattungs-Zeichen — in drei Stufen:
   *
   *   `zeiger`   der Zeiger liegt darüber (dünn)
   *   `griff`    es ist GEGRIFFEN und folgt gerade (kräftig, zart gefüllt)
   *   `loeschen` es steht zur Löschung an (kräftig, rot gefüllt)
   *
   * Die FARBE des blossen Überfahrens richtet sich nach dem Werkzeug (W2). Rot
   * heisst in dieser Oberfläche „das verschwindet gleich" — im Löschen-Werkzeug
   * genau richtig, im Verschieben-Werkzeug aber eine Drohung, die nicht stimmt:
   * dort wird gegriffen, nicht gelöscht. Seit ein Möbel auch im Verschieben
   * greifbar ist, bekäme man beim blossen Zielen auf einen Stuhl einen roten
   * Rahmen zu sehen und zöge lieber die Hand zurück. Also dieselbe Hover-Farbe
   * wie bei Wand und Ecke (`#008cba`) — „das könntest du greifen".
   *
   * `griff` benutzt GENAU DIESE Farbe weiter und ändert nur ihre Stärke: eine
   * dritte Farbe wäre eine dritte Aussage, gemeint ist aber die zweite Stufe
   * derselben. Die Füllung ist bewusst schwach (0,14) — sie soll die Signatur
   * darunter nicht zudecken, sondern dem Auge sagen, welche Fläche gerade
   * unter der Fingerkuppe liegt.
   */
  private markiereAusstattung(el: AusstattungElement, stufe: 'zeiger' | 'griff' | 'loeschen') {
    const hb = el.breite / 2
    const ht = el.tiefe / 2
    const ecken: Array<[number, number]> = [
      this.ausPunkt(el, -hb, -ht),
      this.ausPunkt(el, hb, -ht),
      this.ausPunkt(el, hb, ht),
      this.ausPunkt(el, -hb, ht)
    ]
    const greifbar = this.viewmodel.mode == floorplannerModes.MOVE
    const loescht = stufe === 'loeschen'
    const gegriffen = stufe === 'griff'
    this.drawPolygon(
      ecken.map((p) => p[0]),
      ecken.map((p) => p[1]),
      loescht || gegriffen,
      loescht ? loeschFuellung : griffFuellung,
      true,
      loescht || !greifbar ? deleteColor : wallColorHover,
      loescht ? 3 : gegriffen ? 3.5 : 2
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
    return [this.bildX(el.x + dx * cos - dy * sin), this.bildY(el.y + dx * sin + dy * cos)]
  }

  /**
   * Abbildung Welt (cm) → Bild (Pixel) für die Ausstattungs-Zeichen (W3).
   *
   * Normalerweise ist das schlicht die des Zeichners. Für die VORSCHAU in der
   * Palette wird sie kurz ausgetauscht, damit DIESELBE Zeichenvorschrift in ein
   * kleines Kästchen malt statt in den Grundriss. Der Umweg lohnt genau
   * deswegen: eine nachgemalte Vorschau wäre eine zweite Wahrheit über das
   * Aussehen eines Zeichens, und der Nutzer zöge irgendwann ein Stück in den
   * Plan, das dort anders aussieht als in der Leiste.
   *
   * `null` heisst: der Zeichner selbst. Der Zweig kostet einen Vergleich je
   * Punkt und läuft nur in `ausPunkt`/`ausEllipse` — nicht in der Wand- oder
   * Raster-Ausgabe, die um Grössenordnungen mehr Punkte hat.
   */
  private abbild: {
    x: (cm: number) => number
    y: (cm: number) => number
    proCm: () => number
  } | null = null

  /** Welt-x (cm) → Bild-x (Pixel), je nach gesetzter Abbildung. */
  private bildX(cm: number): number {
    return this.abbild ? this.abbild.x(cm) : this.viewmodel.convertX(cm)
  }

  /** Welt-y (cm) → Bild-y (Pixel), je nach gesetzter Abbildung. */
  private bildY(cm: number): number {
    return this.abbild ? this.abbild.y(cm) : this.viewmodel.convertY(cm)
  }

  /** Bildpunkte je cm, je nach gesetzter Abbildung. */
  private bildProCm(): number {
    return this.abbild ? this.abbild.proCm() : this.viewmodel.pixelProCm()
  }

  /**
   * Zeichnet EIN Ausstattungs-Zeichen als Vorschau in ein beliebiges Kästchen
   * eines beliebigen Canvas (W3) — für die Palette.
   *
   * Gezeichnet wird mit `zeichneAusstattung`, also mit exakt der Vorschrift des
   * Grundrisses; getauscht wird nur die Abbildung. Immer mit `detail = true`:
   * die Detailstufe des Plans hängt am Zoom, das Kästchen hat keinen — und ohne
   * Details wären Stuhl, Gerät und Liege drei gleiche Rechtecke.
   *
   * GESTRICHELT, weil das hingestellte Stück gestrichelt sein WIRD: die Palette
   * erzeugt `quelle: 'gesetzt'`, und eine durchgezogene Vorschau verspräche ein
   * Aufmaß, das sie nicht liefern kann.
   *
   * @param ziel   Zeichenkontext des Vorschau-Canvas
   * @param vorlage Art und Standardmaß in cm (aus `AUSSTATTUNG_VORLAGEN`)
   * @param kasten Rechteck im Ziel-Canvas, in dem das Zeichen sitzen soll
   */
  public zeichneVorschau(
    ziel: CanvasRenderingContext2D,
    vorlage: { typ: AusstattungTyp; breite: number; tiefe: number },
    kasten: { x: number; y: number; breite: number; hoehe: number }
  ): void {
    // Einpassen mit Rand: das Zeichen soll im Kästchen stehen, nicht an seinen
    // Kanten kleben. Der kleinere der beiden Massstäbe gewinnt, sonst ragte eine
    // 200 cm lange Liege seitlich heraus.
    const proCm = Math.min(kasten.breite / vorlage.breite, kasten.hoehe / vorlage.tiefe) * 0.82
    const mx = kasten.x + kasten.breite / 2
    const my = kasten.y + kasten.hoehe / 2

    const vorherKontext = this.context
    const vorherAbbild = this.abbild
    this.context = ziel
    this.abbild = { x: (cm) => mx + cm * proCm, y: (cm) => my + cm * proCm, proCm: () => proCm }
    ziel.setLineDash(GESETZT_STRICH)
    try {
      this.zeichneAusstattung(
        {
          id: 'vorschau',
          quelle: 'gesetzt',
          typ: vorlage.typ,
          x: 0,
          y: 0,
          breite: vorlage.breite,
          tiefe: vorlage.tiefe
        },
        true
      )
    } finally {
      // Ohne dieses Zurücksetzen malte der nächste Grundriss-Durchlauf in den
      // Vorschau-Canvas — ein Fehler, der erst beim nächsten Neuzeichnen
      // sichtbar würde und dann schwer einer Palette zuzuordnen wäre.
      ziel.setLineDash([])
      this.context = vorherKontext
      this.abbild = vorherAbbild
    }
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

  /**
   * Umriss mit abgerundeten Ecken (W3) — das Zeichen der Matte.
   *
   * Eigene Vorschrift statt `ausRechteck`, weil eine ausgerollte Matte im Plan
   * genau daran zu erkennen ist: sie hat keine scharfen Ecken. Der Radius ist
   * RELATIV zur kürzeren Seite und nicht in cm festgelegt — ein fester Radius
   * verschluckte bei einer schmalen Matte die ganze Kante und wäre bei einer
   * breiten kaum zu sehen.
   *
   * Die Rundung entsteht aus quadratischen Kurven über den Eckpunkt. Auch hier
   * wird in WELTkoordinaten gedreht (`ausPunkt`) und nicht über `context.rotate`,
   * damit das Zeichen wie jedes andere über dieselbe Abbildung läuft.
   */
  private ausRundRechteck(el: AusstattungElement, fuellung: string | null) {
    const hb = el.breite / 2
    const ht = el.tiefe / 2
    const r = Math.min(hb, ht) * 0.35
    const p = (dx: number, dy: number) => this.ausPunkt(el, dx, dy)

    // Ein Rundgang, vier Abschnitte: bis kurz vor die Ecke gerade, dann ÜBER
    // die Ecke hinweg gekrümmt zum Anfang der nächsten Geraden. Ein Zug für
    // Füllung UND Rand — zwei getrennte Pfade wären zwei Umrisse, die bei
    // gestricheltem Rand sichtbar auseinanderlägen.
    const weg: Array<{ bis: [number, number]; ecke: [number, number]; nach: [number, number] }> = [
      { bis: p(hb - r, -ht), ecke: p(hb, -ht), nach: p(hb, -ht + r) },
      { bis: p(hb, ht - r), ecke: p(hb, ht), nach: p(hb - r, ht) },
      { bis: p(-hb + r, ht), ecke: p(-hb, ht), nach: p(-hb, ht - r) },
      { bis: p(-hb, -ht + r), ecke: p(-hb, -ht), nach: p(-hb + r, -ht) }
    ]

    const anfang = p(-hb + r, -ht)
    this.context.beginPath()
    this.context.moveTo(anfang[0], anfang[1])
    for (const abschnitt of weg) {
      this.context.lineTo(abschnitt.bis[0], abschnitt.bis[1])
      this.context.quadraticCurveTo(
        abschnitt.ecke[0],
        abschnitt.ecke[1],
        abschnitt.nach[0],
        abschnitt.nach[1]
      )
    }
    this.context.closePath()

    if (fuellung !== null) {
      this.context.fillStyle = fuellung
      this.context.fill()
    }
    this.context.lineWidth = ausstattungLinienBreite
    this.context.strokeStyle = ausstattungLinie
    this.context.stroke()
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
    const proCm = this.bildProCm()
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

      // ── W3 ────────────────────────────────────────────────────────────────
      case 'matte':
        // Eine Matte ist eine FLÄCHE, kein Polster mit Rand: ein Umriss, sonst
        // nichts. Abgerundet, weil eine ausgerollte Matte genau daran zu
        // erkennen ist. Die Rundung gehört NICHT in die Detailstufe — sie ist
        // das Zeichen selbst und nicht seine Verzierung.
        this.ausRundRechteck(el, ausstattungFuellung)
        return

      case 'geraet':
        this.ausRechteck(el, ausstattungFuellung)
        // Die Vorderseite ist die Seite, auf die man steigt oder sich setzt.
        // Sie wird IMMER gezeichnet, auch ohne Detailstufe — anders als die
        // Stuhllehne. Ein Gerät, dessen Ausrichtung man nicht sieht, ist im
        // Plan wertlos: dann weiss niemand, ob davor noch der Meter Platz ist,
        // den man zum Benutzen braucht.
        //
        // EIN Strich, INNEN. Ein zweiter direkt auf der Vorderkante wäre nur
        // der Umriss doppelt gezeichnet; der Abstand von einem Drittel der
        // Tiefe macht daraus ein erkennbares Band, das auch dann noch als Band
        // zu sehen ist, wenn das Gerät im Bild nur zwanzig Punkte misst.
        this.ausLinie(el, -hb, ht * 0.34, hb, ht * 0.34)
        return

      case 'liege':
        this.ausRechteck(el, ausstattungFuellung)
        if (detail) {
          // Kopfende (lokal -x): der Querstrich sagt, wo der Kopf liegt, und
          // damit auf welcher Seite die Behandlerin steht. Ein Strich, kein
          // zweiter Körper — die Doktrin gilt hier wie überall.
          this.ausLinie(el, -hb * 0.66, -ht, -hb * 0.66, ht)
        }
        return

      case 'tisch':
        this.ausRechteck(el, ausstattungFuellung)
        return

      default:
        // FAIL-OPEN, ABER NICHT MEHR STUMM.
        //
        // Dieser Zweig war die teuerste Falle des Projekts: ein Typ, dessen
        // Kette nur halb verdrahtet ist (Union ja, Höhe/Stil nein), sieht hier
        // völlig richtig aus — ein sauberes Rechteck — und ist in Axonometrie,
        // 3D und Export unsichtbar, weil die alle fail-closed sind. Man sucht
        // dann in der Axonometrie nach einem Fehler, der im Grundriss sitzt.
        //
        // Gezeichnet wird trotzdem weiter: die Ansicht soll nicht sterben, nur
        // weil ein Zeichen fehlt. Aber sie sagt es — EINMAL je Typ, sonst füllt
        // eine Zeichenschleife mit 60 Bildern je Sekunde die Konsole so schnell,
        // dass die Meldung selbst zum Rauschen wird.
        this.meldeUnbekanntenTyp(el.typ)
        this.ausRechteck(el, ausstattungFuellung)
        return
    }
  }

  /**
   * Schon gemeldete unbekannte Typen (W3). Instanz-gebunden und nicht statisch:
   * zwei Zeichner nebeneinander (Planer und eine zweite Ansicht) sollen beide
   * einmal melden — die Meldung gehört zu dem, was DIESE Ansicht zeichnet.
   */
  private gemeldeteTypen = new Set<string>()

  /** Meldet einen Typ ohne eigene Zeichenvorschrift genau einmal. */
  private meldeUnbekanntenTyp(typ: string): void {
    if (this.gemeldeteTypen.has(typ)) {
      return
    }
    this.gemeldeteTypen.add(typ)
    console.warn(
      `Ausstattung: keine Zeichenvorschrift für Typ "${typ}" — als schlichtes Rechteck ` +
        `gezeichnet. Vollständig wird ein Typ erst mit Eintrag in AusstattungTyp, OBERKANTE_CM, ` +
        `FARBE, AUSSTATTUNG_NAME, zeichneAusstattung, AUSSTATTUNG_STIL und ERLAUBTE_TYPEN — ` +
        `fehlt einer davon, ist das Stück hier sichtbar und in der Axonometrie nicht.`
    )
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ÖFFNUNGEN (W4) — Türen, Fenster, Durchgänge
     ═══════════════════════════════════════════════════════════════════════ */

  /** Zeichnet alle Öffnungen und, falls das Werkzeug läuft, den Geist. */
  private drawOeffnungen() {
    const kandidat =
      this.viewmodel.loeschKandidat?.art === 'oeffnung'
        ? this.viewmodel.loeschKandidat.kennung
        : null

    this.floorplan.getOeffnungen().forEach((o) => {
      // Eine VERWAISTE Öffnung wird nicht gezeichnet: ihre Wand gibt es nicht
      // mehr, sie hätte also keinen Ort. Gelöscht wird sie trotzdem nicht —
      // die Leiste sagt, dass sie da ist, und ein Strg+Z holt die Wand zurück.
      if (o.verwaist) {
        return
      }
      this.zeichneOeffnung(o, oeffnungLinie, o.quelle === 'gesetzt')
      if (o.id === kandidat) {
        this.markiereOeffnung(o, true)
      } else if (o.id === this.viewmodel.activeOeffnung) {
        this.markiereOeffnung(o, false)
      }
    })

    // Der GEIST zuletzt, damit er über allem liegt: er ist die Antwort auf
    // „was passiert, wenn ich jetzt klicke" und darf von nichts verdeckt sein.
    const geist = this.viewmodel.geistOeffnung
    if (geist) {
      this.zeichneOeffnung(
        {
          id: '__geist',
          wandId: geist.wandId,
          lage: geist.lage,
          breite: geist.breite,
          art: geist.art,
          seite: geist.seite,
          anschlag: geist.anschlag,
          quelle: 'gesetzt',
          anker: { x: 0, y: 0 }
        },
        geist.passt ? oeffnungGeist : oeffnungGeistSperrt,
        true,
        // Der Geist füllt die Wand NICHT weiss: er soll zeigen, wo etwas
        // entstünde, nicht so tun, als wäre es schon da. Eine Wand, die unter
        // dem Zeiger aufreisst und beim Wegfahren wieder zuwächst, liest sich
        // wie ein Fehler.
        false
      )
    }
  }

  /**
   * EINE Öffnung. Die Reihenfolge ist die einer Bauzeichnung: erst die Wand
   * aufschneiden (weisse Füllung), dann die Laibungen, dann das Zeichen der Art.
   *
   * @param farbe    Linienfarbe — für den Geist eine andere als für das Gesetzte
   * @param gestrich Blatt und Bogen gestrichelt? (`quelle: 'gesetzt'`)
   * @param fuellen  die Wandlinie wirklich unterbrechen?
   */
  private zeichneOeffnung(o: Oeffnung, farbe: string, gestrich: boolean, fuellen = true) {
    const g = this.floorplan.oeffnungsGeometrie(o)
    if (!g) {
      return
    }
    const proCm = this.viewmodel.pixelProCm()
    // Quer zur Wand mindestens so weit, dass die 5 px breite Wandlinie
    // wirklich verschwindet (siehe `OEFFNUNG_MIN_QUER_PX`).
    const quer = Math.max(g.dicke / 2, OEFFNUNG_MIN_QUER_PX / proCm)
    const hb = o.breite / 2

    /** Punkt im lokalen System der Öffnung: `laengs` entlang der Wand,
     *  `q` quer dazu (positiv in Richtung der linken Normalen), beides in cm. */
    const p = (laengs: number, q: number): [number, number] => [
      this.viewmodel.convertX(g.mx + g.ex * laengs + g.nx * q),
      this.viewmodel.convertY(g.my + g.ey * laengs + g.ny * q)
    ]

    if (fuellen) {
      const ecken = [p(-hb, -quer), p(hb, -quer), p(hb, quer), p(-hb, quer)]
      this.drawPolygon(
        ecken.map((e) => e[0]),
        ecken.map((e) => e[1]),
        true,
        oeffnungFuellung,
        false
      )
    }

    // Die beiden Laibungen. IMMER durchgezogen, auch bei `gesetzt`: sie sind
    // die Geometrie der Öffnung, nicht die Aussage über ihre Herkunft. Ohne sie
    // sähe ein Durchgang aus wie ein Loch, das jemand vergessen hat.
    const strich = (a: [number, number], b: [number, number]) =>
      this.drawLine(a[0], a[1], b[0], b[1], ausstattungLinienBreite, farbe)
    strich(p(-hb, -quer), p(-hb, quer))
    strich(p(hb, -quer), p(hb, quer))

    if (gestrich) {
      this.context.setLineDash(GESETZT_STRICH)
    }
    switch (o.art) {
      case 'tuer': {
        // Band an der gewählten Laibung, Blatt senkrecht in den Raum auf der
        // gewählten Seite, Bogen zurück zur anderen Laibung. Das ist die
        // Norm-Darstellung: sie sagt zugleich, wohin die Tür aufschlägt und
        // wie viel Fläche sie dabei braucht.
        const band = o.anschlag === 'anfang' ? -hb : hb
        const gegen = -band
        this.zeichneBlattUndBogen(p, band, gegen, o.breite, o.seite, farbe)
        break
      }
      case 'doppeltuer':
        // Zwei Flügel von je halber lichter Weite, an den beiden Laibungen
        // angeschlagen — `anschlag` hat hier keine Wirkung, beide Seiten sind
        // besetzt. Das Feld bleibt trotzdem gesetzt, damit ein Wechsel der Art
        // nicht in einen unbestimmten Zustand führt.
        this.zeichneBlattUndBogen(p, -hb, 0, hb, o.seite, farbe)
        this.zeichneBlattUndBogen(p, hb, 0, hb, o.seite, farbe)
        break
      case 'fenster': {
        // Zwei dünne Parallelen längs in der Wandstärke — der Blendrahmen. Bei
        // einem Viertel der Dicke, damit sie auch dann noch als zwei Linien zu
        // sehen sind, wenn die Wand im Bild wenige Pixel misst.
        const q = quer / 2
        strich(p(-hb, -q), p(hb, -q))
        strich(p(-hb, q), p(hb, q))
        break
      }
      case 'durchgang':
        // Nur die Laibungen. Ein Durchgang HAT kein Blatt — ihm eines zu
        // geben wäre eine Bauaussage, die niemand getroffen hat.
        break
    }
    if (gestrich) {
      this.context.setLineDash([])
    }
  }

  /**
   * Türblatt als Strecke plus Viertelkreis-Aufschlagbogen.
   *
   * Der Bogen wird über `context.arc` in BILDkoordinaten gezogen und nicht als
   * Punktkette in Weltkoordinaten: ein Kreisbogen bleibt unter der reinen
   * Verschiebung/Streckung dieser Ansicht ein Kreisbogen, eine Kette wäre bei
   * starkem Zoom sichtbar eckig. Die Winkel kommen aus den beiden ECHTEN
   * Endpunkten — dadurch stimmt der Bogen auch bei gedrehter Wand, ohne dass
   * hier irgendwo ein Wandwinkel nachgerechnet würde.
   *
   * @param band  Lage des Bandes entlang der Wand (cm, lokal)
   * @param gegen Lage der gegenüberliegenden Laibung (cm, lokal)
   * @param weite Blattlänge in cm
   * @param seite Aufschlagseite (+1/−1 entlang der Normalen)
   */
  private zeichneBlattUndBogen(
    p: (laengs: number, q: number) => [number, number],
    band: number,
    gegen: number,
    weite: number,
    seite: 1 | -1,
    farbe: string
  ) {
    const drehpunkt = p(band, 0)
    const spitze = p(band, seite * weite)
    const anschlagEnde = p(gegen, 0)

    this.drawLine(
      drehpunkt[0],
      drehpunkt[1],
      spitze[0],
      spitze[1],
      ausstattungLinienBreite,
      farbe
    )

    const radius = Math.hypot(spitze[0] - drehpunkt[0], spitze[1] - drehpunkt[1])
    if (radius < 1) {
      return
    }
    const a1 = Math.atan2(spitze[1] - drehpunkt[1], spitze[0] - drehpunkt[0])
    const a2 = Math.atan2(anschlagEnde[1] - drehpunkt[1], anschlagEnde[0] - drehpunkt[0])
    // Auf −PI..PI normalisieren: sonst zöge der Bogen bei einem Sprung über
    // ±180° den langen Weg über drei Viertel des Kreises.
    let delta = a2 - a1
    while (delta > Math.PI) delta -= 2 * Math.PI
    while (delta < -Math.PI) delta += 2 * Math.PI

    this.context.beginPath()
    this.context.arc(drehpunkt[0], drehpunkt[1], radius, a1, a2, delta < 0)
    this.context.lineWidth = ausstattungLinienBreite
    this.context.strokeStyle = farbe
    this.context.stroke()
  }

  /**
   * Rahmen um eine Öffnung — `fest` heisst: sie steht zur Löschung an.
   * Dieselbe Aufteilung wie bei `markiereAusstattung`, samt derselben
   * Begründung für die Farbe: rot heisst „das verschwindet gleich", blau „das
   * könntest du greifen".
   */
  private markiereOeffnung(o: Oeffnung, fest: boolean) {
    const g = this.floorplan.oeffnungsGeometrie(o)
    if (!g) {
      return
    }
    const proCm = this.viewmodel.pixelProCm()
    // Etwas höher als die Wand dick ist, sonst läge der Rahmen genau auf den
    // Laibungen und wäre von ihnen nicht zu unterscheiden.
    const quer = Math.max(g.dicke, OEFFNUNG_MIN_QUER_PX / proCm) * 1.6
    const hb = o.breite / 2
    const p = (laengs: number, q: number): [number, number] => [
      this.viewmodel.convertX(g.mx + g.ex * laengs + g.nx * q),
      this.viewmodel.convertY(g.my + g.ey * laengs + g.ny * q)
    ]
    const ecken = [p(-hb, -quer), p(hb, -quer), p(hb, quer), p(-hb, quer)]
    const greifbar = this.viewmodel.mode == floorplannerModes.OEFFNUNG
    this.drawPolygon(
      ecken.map((e) => e[0]),
      ecken.map((e) => e[1]),
      fest,
      loeschFuellung,
      true,
      fest || !greifbar ? deleteColor : wallColorHover,
      fest ? 3 : 2
    )
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
    const zx = this.viewmodel.convertX(x)
    const zy = this.viewmodel.convertY(y)

    // Rastet der Punkt gerade auf eine vorhandene Ecke ein (E2), wird das
    // ANGEZEIGT — ein grösserer Ring in der Fangfarbe. Einrasten, das man nicht
    // sieht, hilft wenig: man erführe erst nach dem Klick, ob der Anschluss
    // sass, und müsste im Zweifel zurücknehmen.
    if (this.viewmodel.fangEcke) {
      this.drawCircle(zx, zy, cornerRadiusHover + 5, fangFarbe)
    }
    this.drawCircle(zx, zy, cornerRadiusHover, cornerColorHover)

    if (this.viewmodel.lastNode) {
      const ax = this.viewmodel.convertX(lastNode!.x)
      const ay = this.viewmodel.convertY(lastNode!.y)
      this.drawLine(ax, ay, zx, zy, wallWidthHover, wallColorHover)

      // Live-Länge in Metern (E2). Ohne sie zeichnet man ins Blaue und misst
      // erst hinterher nach. Zwei Nachkommastellen = Zentimeter, dieselbe
      // Genauigkeit wie die Wand-Massangaben (Projekt-DNA Punkt 3).
      const laenge = this.viewmodel.zeichenLaenge()
      if (laenge !== null && laenge > 0) {
        const text = `${(laenge / 100).toFixed(2).replace('.', ',')} m`
        // Mittig auf der Strecke, ein Stück oberhalb — auf der Linie selbst
        // läge die Schrift unter dem Strich und wäre schlecht zu lesen.
        this.zeichneLaengenSchild(text, (ax + zx) / 2, (ay + zy) / 2 - 12)
      }
    }
  }

  /** Meterangabe der gezogenen Strecke, auf hellem Grund lesbar (E2). */
  private zeichneLaengenSchild(text: string, x: number, y: number) {
    this.context.font = 'bold 13px sans-serif'
    this.context.textAlign = 'center'
    this.context.textBaseline = 'middle'
    const breite = this.context.measureText(text).width
    // Hinterlegt, weil die Strecke über Räume, Möbel und das Raster laufen kann
    // — auf hellem Grund allein wäre der Text stellenweise unlesbar.
    this.context.fillStyle = 'rgba(255, 255, 255, 0.92)'
    this.context.fillRect(x - breite / 2 - 5, y - 10, breite + 10, 20)
    this.context.fillStyle = wallColorHover
    this.context.fillText(text, x, y)
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
