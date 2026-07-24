import type { Floorplan, SavedFloorplan } from '../model/floorplan'
import { EventEmitter } from './events'

/**
 * Rueckgaengig/Wiederholen fuer den Grundriss (T5a).
 *
 * WARUM SNAPSHOTS statt Command-Pattern mit Invers-Operationen:
 * Die mutierenden Aktionen kaskadieren tief und nicht-lokal —
 * `Corner.removeAll()` reisst JEDE angrenzende Wand mit, `mergeWithIntersected()`
 * verschmilzt Ecken beim Ziehen, und `Floorplan.update()` baut danach die
 * gesamte Raumzerlegung (findRooms) neu auf. Eine handgeschriebene Umkehrung
 * jeder dieser Kaskaden waere die fehleranfaelligste Stelle des Projekts.
 * `saveFloorplan()`/`loadFloorplan()` sind dagegen der bereits erprobte
 * Persistenz-Pfad (dieselben Funktionen, die den Plan von Platte laden), und
 * ein Snapshot ist bei 76 Ecken/100 Waenden wenige KB gross.
 *
 * UMFANG — bewusst nur der Grundriss: Ecken, Waende, Wand-/Bodentexturen und
 * die Raumnamen (roomMeta) sind Teil von `saveFloorplan()` und damit abgedeckt.
 * Moebel (scene items) sind es NICHT; sie ueberleben ein Undo unveraendert.
 * BEKANNTE GRENZE: ein wandgebundenes Item (Tuer/Fenster, T3a noch offen)
 * haelt eine Referenz auf sein Wand-Objekt — nach einem Undo existiert diese
 * Wand als NEUES Objekt. Solange nur freistehende Moebel im Einsatz sind, ist
 * das folgenlos; mit T3a muss die Wand-Bindung nach dem Zurueckspielen neu
 * aufgeloest werden.
 */

/** Wie viele Schritte zurueck. 50 Snapshots à wenige KB sind unkritisch. */
const DEFAULT_LIMIT = 50

/**
 * Bewahrt die Ansicht ueber ein Zurueckspielen hinweg. `loadFloorplan()` feuert
 * `roomLoadedCallbacks`, woran der Floorplanner sein `reset()` haengt (Ansicht
 * zentrieren + Modus auf MOVE). Beim Laden eines Plans ist das richtig, beim
 * Undo waere es ein Ansichts-Sprung mitten in der Arbeit — deshalb sichert der
 * Floorplanner seinen Ansichts-Zustand hierueber und stellt ihn danach her.
 */
export interface ViewStateHandler<T = unknown> {
  save(): T
  restore(state: T): void
}

export class UndoManager {
  /** Zustaende VOR den jeweiligen Aenderungen, aeltester zuerst. */
  private undoStack: string[] = []

  /** Zurueckgenommene Zustaende, fuer redo(). */
  private redoStack: string[] = []

  /** Laeuft gerade ein eigenes Zurueckspielen? Schuetzt vor Selbstauslösung. */
  private applying = false

  /** */
  private viewState: ViewStateHandler | null = null

  /** Feuert, wenn sich canUndo/canRedo geaendert haben koennte (UI-Anbindung). */
  public changed = new EventEmitter<void>()

  constructor(
    private floorplan: Floorplan,
    private limit: number = DEFAULT_LIMIT
  ) {
    // Ein echter Plan-Wechsel macht die Historie ungueltig: sonst koennte ein
    // Undo die Waende eines FREMDEN Grundrisses einspielen. Das eigene
    // Zurueckspielen laeuft ueber dieselben Callbacks und ist ausgenommen.
    this.floorplan.roomLoadedCallbacks.add(() => {
      if (!this.applying) {
        this.clear()
      }
    })
  }

  /** Der Floorplanner meldet hier, wie seine Ansicht gesichert/hergestellt wird. */
  public setViewStateHandler(handler: ViewStateHandler | null): void {
    this.viewState = handler
  }

  /**
   * Sichert den Zustand VOR einer Aenderung. Muss unmittelbar vor der Mutation
   * gerufen werden — nicht danach, sonst fehlt der Ausgangszustand.
   * Ein Zug (ein Ziehen, ein Loeschklick) ruft das genau einmal.
   */
  public snapshot(): void {
    if (this.applying) {
      return
    }
    const json = JSON.stringify(this.floorplan.saveFloorplan())

    // Ein Snapshot, der nichts Neues sagt, waere beim Undo ein Leerschritt:
    // der Nutzer druecke Strg+Z und nichts geschieht sichtbar.
    if (this.undoStack[this.undoStack.length - 1] === json) {
      return
    }

    this.undoStack.push(json)
    if (this.undoStack.length > this.limit) {
      this.undoStack.shift()
    }
    // Eine neue Aenderung nach einem Undo verwirft den Vorwaerts-Zweig.
    this.redoStack = []
    this.changed.fire()
  }

  /** Nimmt den letzten Zug zurueck. Gibt zurueck, ob etwas geschehen ist. */
  public undo(): boolean {
    const vorher = this.undoStack.pop()
    if (vorher === undefined) {
      return false
    }
    this.redoStack.push(JSON.stringify(this.floorplan.saveFloorplan()))
    this.apply(vorher)
    this.changed.fire()
    return true
  }

  /** Stellt einen zurueckgenommenen Zug wieder her. */
  public redo(): boolean {
    const nachher = this.redoStack.pop()
    if (nachher === undefined) {
      return false
    }
    this.undoStack.push(JSON.stringify(this.floorplan.saveFloorplan()))
    this.apply(nachher)
    this.changed.fire()
    return true
  }

  /** */
  public canUndo(): boolean {
    return this.undoStack.length > 0
  }

  /** */
  public canRedo(): boolean {
    return this.redoStack.length > 0
  }

  /** Verwirft die gesamte Historie (Plan-Wechsel). */
  public clear(): void {
    if (this.undoStack.length === 0 && this.redoStack.length === 0) {
      return
    }
    this.undoStack = []
    this.redoStack = []
    this.changed.fire()
  }

  /** */
  private apply(json: string): void {
    const ansicht = this.viewState ? this.viewState.save() : undefined
    this.applying = true
    try {
      this.floorplan.loadFloorplan(JSON.parse(json) as SavedFloorplan)
    } finally {
      // Auch bei kaputtem JSON darf die Sperre nicht haengen bleiben, sonst
      // waere jeder weitere Snapshot stumm und die Historie stuende still.
      this.applying = false
    }
    // NACH loadFloorplan: dessen roomLoadedCallbacks haben synchron bereits
    // floorplanner.reset() ausgefuehrt, wir setzen die Ansicht also zuletzt.
    if (this.viewState && ansicht !== undefined) {
      this.viewState.restore(ansicht)
    }
  }
}
