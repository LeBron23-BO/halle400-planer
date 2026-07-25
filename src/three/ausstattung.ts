import * as THREE from 'three'
import type { Floorplan as FloorplanModel } from '../model/floorplan'
import type { AusstattungElement, AusstattungTyp } from '../model/floorplan'

/**
 * A6 — die aus der PDF gemessene Ausstattung als einfache Körper in der
 * 3D-Ansicht.
 *
 * ## Woher die Zahlen kommen (Projekt-DNA Punkt 1 und 4)
 *
 * Grundfläche und Lage jedes Körpers sind GEMESSEN: `x`, `y`, `breite`,
 * `tiefe` und `drehung` stammen unverändert aus `data/ausstattung.json`, also
 * aus `Nur Büro.pdf`. Dieselbe Quelle speist den 2D-Grundriss — es gibt keine
 * zweite, abweichende Ablage.
 *
 * Die HÖHE dagegen ist in keinem Grundriss enthalten. Ein Grundriss ist ein
 * waagerechter Schnitt; er sagt, wo ein Tisch steht, nicht wie hoch er ist.
 * Jede Höhe in `HOEHE_CM` ist deshalb eine GESETZTE Angabe nach üblichen
 * Möbelmaßen und trägt ihre Herkunft im Kommentar — genau wie
 * `wallHeight = 300 cm` in der Configuration. Sie ist ausdrücklich KEIN
 * Messwert und darf nie als solcher zitiert werden.
 *
 * ## Warum eigene Körper statt Möbelmodelle
 *
 * Aus demselben Grund wie im 2D-Zeichner: der Upstream-Katalog ist eine
 * Wohnungseinrichtung ohne Treppe, Sanitär, Küchenzeile oder Aufzug, und ein
 * einziges Modell wiegt 3,6 MB auf einem fremden CDN. Bei 289 Elementen wären
 * das dutzende MB Fremdanfragen je Aufruf. Ein Quader an gemessener Stelle
 * sagt die Wahrheit über Lage und Ausdehnung; ein fotorealistisches Sofa an
 * geratener Stelle sähe besser aus und wäre falsch.
 */

/**
 * Gesetzte Bauhöhen in cm — KEINE Messwerte aus der PDF (siehe Klassen-Kopf).
 * Grundlage sind übliche Möbel- und Sanitärmaße; die Quelle steht je Zeile.
 */
const HOEHE_CM: Record<AusstattungTyp, number> = {
  // Feste Arbeitshöhe nach DIN EN 527-1 (Büroarbeitstisch).
  tisch: 74,
  // Gleiche Arbeitshöhe — die Loggia-Tische sind Sitz-, keine Stehtische.
  rundtisch: 74,
  // Sitzhöhe nach DIN EN 1335 (Bürostuhl, mittlere Einstellung). Bewusst nur
  // die Sitzfläche: eine Lehne wäre eine Formaussage, die der Plan nicht trägt.
  stuhl: 45,
  // Übliche Höhe eines Büro-Aktenschranks bzw. Lagerregals.
  schrank: 200,
  // NUR der Antritt. Die Steigung eines Laufs ist aus einem Grundriss nicht
  // ableitbar (weder Geschosshöhe noch Stufenzahl stehen darin) — eine
  // ansteigende Treppe wäre hier erfunden. Der flache Körper sagt ehrlich:
  // "hier liegt der Treppenlauf", nicht "so hoch steigt er".
  treppe: 15,
  // Oberkante WC-Becken.
  wc: 40,
  // Oberkante Waschtisch (üblicher Montagestandard).
  waschbecken: 85,
  // Arbeitsplattenhöhe der Küchenzeile.
  kochfeld: 90,
  // Kübelpflanze mittlerer Größe, Kübel plus Bewuchs.
  pflanze: 120,
  // Schacht durchgehend bis Oberkante Wand — identisch zur gesetzten
  // wallHeight, damit kein sichtbarer Spalt entsteht.
  aufzug: 300,
  // Untergrund (Loggien-Belag, Kiesbett) — eine Lage, kein Möbel.
  flaeche: 2
}

/**
 * Farben mit ABSICHTLICHEM Blaustich.
 *
 * Das ist keine Geschmacksfrage, sondern die Lehre aus A1: die erste
 * 2D-Möbelfarbe lag innerhalb der Toleranz der Wand-Kantenfarbe, dadurch
 * zählte die Prüfung Wände als Möbel und meldete trotzdem "bestanden". Eine
 * Messgröße braucht eine Eigenschaft, die das Gesuchte EXKLUSIV besitzt.
 *
 * In der 3D-Ansicht sind alle Wandflächen neutral (0xffffff / 0xeeeeee, also
 * b − r = 0) und der Boden ist eine Holztextur (b − r negativ). Ein kräftiger
 * Blaustich ist damit exklusiv. Die Töne sind bewusst DUNKEL gewählt: das
 * HemisphereLight hat Intensität 3.0, ein heller Grundton würde in allen drei
 * Kanälen auf 255 laufen und der Blaustich wäre im gerenderten Bild wieder
 * verschwunden — dieselbe Falle, nur eine Ebene später.
 */
const FARBE: Record<AusstattungTyp, number> = {
  tisch: 0x2e3f5c,
  rundtisch: 0x2e3f5c,
  stuhl: 0x3b4f70,
  schrank: 0x27364f,
  treppe: 0x334662,
  wc: 0x3d5476,
  waschbecken: 0x3d5476,
  kochfeld: 0x27364f,
  pflanze: 0x2f5545, // Grünstich statt Blau — Bewuchs, und weiterhin b ≠ r
  aufzug: 0x27364f,
  flaeche: 0x33465e
}

/** Typen, die als stehender Zylinder statt als Quader gebaut werden. */
const RUND: ReadonlySet<AusstattungTyp> = new Set<AusstattungTyp>(['rundtisch', 'pflanze'])

export class AusstattungThree {
  private readonly scene: THREE.Scene
  private readonly floorplan: FloorplanModel
  /** Eine InstancedMesh je Typ — 289 Körper kosten so ~10 Zeichenaufrufe. */
  private meshes: THREE.InstancedMesh[] = []

  constructor(scene: THREE.Scene, floorplan: FloorplanModel) {
    this.scene = scene
    this.floorplan = floorplan
  }

  /**
   * Baut alle Körper neu. Wird vom FloorplanThree-Redraw gerufen, also auf
   * demselben Weg wie Böden und Wände — dadurch überlebt die Ausstattung ein
   * Rückgängig automatisch, weil UndoManager seine Momentaufnahmen über
   * save/load zieht und das Laden den Redraw auslöst.
   */
  public redraw(): void {
    this.removeFromScene()

    const elemente = this.floorplan.getAusstattung()
    if (elemente.length === 0) return

    // nach Typ bündeln, damit je Typ genau eine InstancedMesh entsteht
    const nachTyp = new Map<AusstattungTyp, AusstattungElement[]>()
    elemente.forEach((el) => {
      const liste = nachTyp.get(el.typ)
      if (liste) liste.push(el)
      else nachTyp.set(el.typ, [el])
    })

    nachTyp.forEach((liste, typ) => {
      const mesh = this.baueTyp(typ, liste)
      if (mesh) {
        this.meshes.push(mesh)
        this.scene.add(mesh)
      }
    })
  }

  /** Alle Körper EINES Typs als eine InstancedMesh. */
  private baueTyp(typ: AusstattungTyp, liste: AusstattungElement[]): THREE.InstancedMesh | null {
    const hoehe = HOEHE_CM[typ]
    if (hoehe === undefined) {
      // Unbekannter Typ: lieber nichts zeichnen als einen erfundenen Körper.
      // Die Datenprüfung in tools/export_blueprint.py bricht bei so etwas
      // ohnehin schon fail-closed ab.
      console.warn(`Ausstattung: keine gesetzte Höhe für Typ "${typ}" — übersprungen`)
      return null
    }

    // Einheits-Geometrie, die pro Element skaliert wird. Der Ursprung liegt
    // MITTIG, darum steht der Körper erst nach dem Höhen-Versatz auf y = 0.
    const geometrie = RUND.has(typ)
      ? new THREE.CylinderGeometry(0.5, 0.5, 1, 24)
      : new THREE.BoxGeometry(1, 1, 1)

    const material = new THREE.MeshPhongMaterial({
      color: FARBE[typ],
      shininess: 5, // matt — ein Glanzlicht würde den Blaustich lokal auswaschen
      flatShading: false
    })

    const mesh = new THREE.InstancedMesh(geometrie, material, liste.length)
    mesh.castShadow = true
    mesh.receiveShadow = true

    const matrix = new THREE.Matrix4()
    const position = new THREE.Vector3()
    const quaternion = new THREE.Quaternion()
    const skalierung = new THREE.Vector3()
    const yAchse = new THREE.Vector3(0, 1, 0)

    liste.forEach((el, i) => {
      // Achsen: die 3D-Welt nutzt x wie der Grundriss, die Grundriss-y-Achse
      // wird zur z-Achse und y ist die Höhe. Genau diese Zuordnung erzeugt
      // Floor.buildFloor über rotation.set(PI/2, 0, 0) — hier steht sie
      // ausgeschrieben, statt sie über eine zweite Drehung nachzuahmen.
      position.set(el.x, hoehe / 2, el.y)

      // Die 2D-Drehung ist mathematisch positiv in der (x, y)-Ebene
      // (floorplanner_view.ausPunkt: x·cos − y·sin / x·sin + y·cos). Eine
      // Drehung um die 3D-y-Achse läuft in der (x, z)-Ebene genau andersherum,
      // deshalb das Minus. Ohne dieses Vorzeichen stünden alle gedrehten
      // Elemente gespiegelt — sichtbar an den 144 Stühlen, die dann von den
      // Tischen weg statt zu ihnen zeigen.
      quaternion.setFromAxisAngle(yAchse, -(el.drehung ?? 0))

      skalierung.set(el.breite, hoehe, el.tiefe)

      matrix.compose(position, quaternion, skalierung)
      mesh.setMatrixAt(i, matrix)
    })

    mesh.instanceMatrix.needsUpdate = true
    // Die Halle ist 78 m lang; ohne eigene Hülle verwirft three.js Instanzen
    // am Rand beim Heranzoomen.
    mesh.computeBoundingSphere()

    return mesh
  }

  public removeFromScene(): void {
    this.meshes.forEach((mesh) => {
      this.scene.remove(mesh)
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
      mesh.dispose()
    })
    this.meshes = []
  }
}
