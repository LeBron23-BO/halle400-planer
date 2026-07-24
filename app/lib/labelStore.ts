/**
 * Persistenz der User-Raumnamen (T4) pro Plan im localStorage.
 *
 * Warum separat und nicht in der Plan-Datei: Der Liefer-URL ?plan=<name> laedt
 * bei jedem Besuch die STATISCHE app/public/plaene/<name>.json neu — die traegt
 * keine User-Overrides und kann auch nicht bei jeder Umbenennung neu gebaut
 * werden. Die Umbenennungen leben deshalb plan-skopiert im localStorage und
 * werden beim Laden in den Plan injiziert (Blueprint3DAppBase), sodass
 * loadFloorplan sie als roomMeta uebernimmt. So uebersteht eine Umbenennung
 * einen Reload — genau das, was der In-Memory-Export allein NICHT beweist.
 */
export type RoomMetaMap = Record<string, { name: string }>

const PREFIX = 'halle400-planer:roomMeta:'

export function loadRoomMeta(planName: string): RoomMetaMap {
  if (typeof window === 'undefined' || !planName) return {}
  try {
    const raw = window.localStorage.getItem(PREFIX + planName)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? (parsed as RoomMetaMap) : {}
  } catch {
    return {}
  }
}

export function saveRoomMeta(planName: string, meta: RoomMetaMap): void {
  if (typeof window === 'undefined' || !planName) return
  try {
    if (Object.keys(meta).length === 0) {
      window.localStorage.removeItem(PREFIX + planName)
    } else {
      window.localStorage.setItem(PREFIX + planName, JSON.stringify(meta))
    }
  } catch {
    // localStorage voll/blockiert (z.B. Privatmodus): die Umbenennung bleibt
    // in-session erhalten, kein Crash.
  }
}
