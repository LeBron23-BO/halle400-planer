import { Model } from './model/model'
import { Floorplanner } from './floorplanner/floorplanner'
import { Main } from './three/main'
import { UndoManager } from './core/undo'

/** Startup options. */
export interface Options {
  /** */
  widget?: boolean

  /** */
  threeElement?: string

  /** */
  floorplannerElement?: string

  /** The texture directory. */
  textureDir?: string

  /** Enable/disable wheel zoom (default: true). Set to false for logged-out users to allow page scroll. */
  enableWheelZoom?: boolean

  /** Enable continuous rotation even after user interaction (default: false). */
  alwaysSpin?: boolean
}

/** Blueprint3D core application. */
export class Blueprint3d {
  public model: Model

  public three: Main

  public floorplanner?: Floorplanner

  /** Rueckgaengig/Wiederholen fuer den Grundriss (T5a). */
  public undo: UndoManager

  /** Creates an instance.
   * @param options The initialization options.
   */
  constructor(options: Options) {
    this.model = new Model(options.textureDir || '')
    this.three = new Main(this.model, options.threeElement || document.body, undefined, {
      enableWheelZoom: options.enableWheelZoom ?? true,
      alwaysSpin: options.alwaysSpin ?? false
    })

    if (!options.widget) {
      this.floorplanner = new Floorplanner(options.floorplannerElement || '', this.model.floorplan)
    } else {
      this.three.getController().enabled = false
    }

    // NACH dem Floorplanner erzeugen: beide haengen an roomLoadedCallbacks, und
    // beim Zurueckspielen muss erst dessen reset() laufen, damit die Historie
    // die Ansicht danach wiederherstellen kann (Reihenfolge = Registrierung).
    this.undo = new UndoManager(this.model.floorplan)
    this.floorplanner?.setUndoManager(this.undo)
  }
}
