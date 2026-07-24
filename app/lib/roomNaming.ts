import type { Room } from '@blueprint3d/model/room'

/**
 * Zuordnung von PDF-Raumnamen zu den aus dem Wandgraphen abgeleiteten Raeumen.
 *
 * Warum ueberhaupt eine Laufzeit-Zuordnung statt einer festen Tabelle:
 * blueprint3d speichert keine Raeume, es berechnet sie nach jeder Wand-Aenderung
 * neu (src/model/floorplan.ts -> findRooms). Die Identitaet eines Raums ist seine
 * Raum-UUID = die sortierten Ecken-IDs (room.ts:50). Loescht der Nutzer eine Ecke
 * und setzt sie neu, aendert sich diese UUID und eine feste Zuordnung risse ab.
 * Der PDF-Ankerpunkt dagegen ist fix — er findet seinen Raum per Punkt-in-Polygon
 * auch nach solchen Editier-Aenderungen wieder.
 */

/** Ein aus der PDF exportierter Raum-Label-Anker (cm, siehe export_blueprint.py). */
export interface PlanLabel {
  text: string
  zusatz?: string
  seite?: string
  /** Ankerpunkt in cm — selbes Koordinatensystem wie die Raum-Ecken. */
  anker_cm: [number, number]
}

/** Der einem Raum zugeordnete Name samt Herkunft. */
export interface ResolvedRoomName {
  name: string
  zusatz: string
  /** 'pdf' = aus der Grundwahrheit abgeleitet, 'user' = im Editor umbenannt. */
  source: 'pdf' | 'user'
}

/** Schwerpunkt (Mittel der Innen-Ecken) eines Raums, in cm. */
export function roomCentroid(room: Room): { x: number; y: number } {
  const pts = room.interiorCorners
  if (pts.length === 0) return { x: 0, y: 0 }
  let sx = 0
  let sy = 0
  for (const p of pts) {
    sx += p.x
    sy += p.y
  }
  return { x: sx / pts.length, y: sy / pts.length }
}

/** Punkt-in-Polygon per Ray-Casting auf einem einfachen Polygon. */
export function pointInPolygon(
  x: number,
  y: number,
  poly: { x: number; y: number }[]
): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x
    const yi = poly[i].y
    const xj = poly[j].x
    const yj = poly[j].y
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/**
 * Ordnet die PDF-Label den aktuellen Raeumen zu und legt die User-Umbenennungen
 * (roomMeta) darueber. Rueckgabe: Raum-UUID -> aufgeloester Name.
 *
 * Reihenfolge der Wahrheit:
 *  1. PDF-Default: Label -> Raum per Punkt-in-Polygon (Innen-Ecken). Faellt ein
 *     Ankerpunkt in keinen Umriss (z.B. dicht an einer Wand), greift als
 *     Reparaturpfad der naechstgelegene Raum-Schwerpunkt.
 *  2. User-Override: ein in roomMeta gesetzter Name sticht den PDF-Default.
 */
export function assignRoomNames(
  rooms: Room[],
  labels: PlanLabel[],
  roomMeta: Record<string, { name: string }>
): Map<string, ResolvedRoomName> {
  const result = new Map<string, ResolvedRoomName>()

  for (const label of labels) {
    const [lx, ly] = label.anker_cm

    // Primaer: welcher Raum-Umriss enthaelt den Ankerpunkt?
    let ziel: Room | null = null
    for (const room of rooms) {
      if (pointInPolygon(lx, ly, room.interiorCorners)) {
        ziel = room
        break
      }
    }
    // Reparaturpfad: naechster Schwerpunkt (Ankerpunkt lag knapp ausserhalb).
    if (!ziel) {
      let best = Infinity
      for (const room of rooms) {
        const c = roomCentroid(room)
        const d = (c.x - lx) ** 2 + (c.y - ly) ** 2
        if (d < best) {
          best = d
          ziel = room
        }
      }
    }
    if (!ziel) continue

    const uuid = ziel.getUuid()
    // Bei (unerwarteter) Kollision zweier Label im selben Raum bleibt der erste
    // Treffer stehen — deterministisch nach Label-Reihenfolge, keine stille Wahl.
    if (result.has(uuid)) continue
    result.set(uuid, {
      name: label.text,
      zusatz: label.zusatz ?? '',
      source: 'pdf'
    })
  }

  // User-Umbenennungen ueberschreiben den Default (leere Namen sind gar nicht
  // erst in roomMeta — setRoomName loescht bei leerer Eingabe).
  for (const uuid in roomMeta) {
    const name = roomMeta[uuid]?.name?.trim()
    if (name) result.set(uuid, { name, zusatz: '', source: 'user' })
  }

  return result
}
