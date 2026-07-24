/**
 * Aufloesung der anzuzeigenden Raumnamen aus den PDF-Beschriftungen plus
 * etwaigen User-Umbenennungen.
 *
 * WARUM an der Ankerposition und NICHT an einem abgeleiteten Raum (Befund
 * 2026-07-24, per Laufzeit-Diagnose belegt): blueprint3d leitet Raeume als die
 * kleinsten Zyklen des Wandgraphen ab. Nach der PDF-treuen Wandextraktion bilden
 * 6 der 18 beschrifteten Zonen (Aufzug, Empfang, Teamtable, Workshop-Nord,
 * Workspace-Sued, Break-out) KEINE eigene geschlossene Zelle — sie fallen alle in
 * denselben grossen konkaven Rest-/Flurraum und gingen bei einer Raum-Zuordnung
 * bis auf einen verloren. Der PDF-Ankerpunkt dagegen ist die Grundwahrheit und
 * fuer jede Beschriftung eindeutig. Deshalb haengt der Name an der Ankerposition.
 */

/** Ein aus der PDF exportierter Raum-Label-Anker (cm, siehe export_blueprint.py). */
export interface PlanLabel {
  text: string
  zusatz?: string
  seite?: string
  /** Ankerpunkt in cm — selbes Koordinatensystem wie die Raum-Ecken. */
  anker_cm: [number, number]
}

/** Der aufgeloeste, anzuzeigende Raumname. */
export interface ResolvedLabel {
  /** Stabiler Persistenz-Schluessel (die PDF-Ankerposition, aendert sich nie). */
  key: string
  /** Angezeigter Name: User-Umbenennung, sonst PDF-Default. */
  name: string
  /** PDF-Zusatz (z.B. "6-8 Personen") — nur solange kein User-Override greift. */
  zusatz: string
  anker_cm: [number, number]
  source: 'pdf' | 'user'
}

/**
 * Stabiler Schluessel eines Labels = seine PDF-Ankerposition. Eindeutig (jede
 * Beschriftung hat eine andere Position) und stabil ueber Sessions/Wand-Edits.
 */
export function labelKey(label: PlanLabel): string {
  return `${label.anker_cm[0]},${label.anker_cm[1]}`
}

/**
 * Loest die anzuzeigenden Namen auf: PDF-Default aus dem Label, ueberschrieben
 * durch eine etwaige User-Umbenennung (`overrides`, gekeyt via labelKey).
 * Ein leerer Override loescht sich selbst schon in floorplan.setRoomName —
 * hier gewinnt jeder nicht-leere Override den Default.
 */
export function resolveLabels(
  labels: PlanLabel[],
  overrides: Record<string, { name: string }>
): ResolvedLabel[] {
  return labels.map((l) => {
    const key = labelKey(l)
    const ov = overrides[key]?.name?.trim()
    return {
      key,
      name: ov || l.text,
      zusatz: ov ? '' : l.zusatz ?? '',
      anker_cm: l.anker_cm,
      source: ov ? 'user' : 'pdf'
    }
  })
}
