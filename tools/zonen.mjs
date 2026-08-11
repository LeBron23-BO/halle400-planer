// ZONEN — wem gehoert ein Moebelstueck, wenn es keine Wand gibt? (W19)
//
//   import { ladeZonen, ordneZu } from './zonen.mjs'
//
// WARUM ES DIESE SCHICHT GIBT
// Der offene Bereich des Plans misst 405 m2 — ein Drittel der 1207 m2 des
// ganzen Riegels — und traegt fuenf Beschriftungen. Er ist offen, weil die PDF
// dort ausdruecklich keine Wand zeigt: an der weitesten Stelle 12 m mit
// gemessener Belegung 0,00. Eine Wand zu ergaenzen, damit die Stueckliste
// aufgeht, waere genau die Erfindung, die Projekt-DNA Punkt 1 verbietet.
//
// Diese Schicht baut deshalb NICHTS. Sie ordnet zu. Eine Zone hat keine Waende,
// keine Flaeche im Raumbuch und keinen Eintrag im Export — sie beantwortet
// allein die Frage, zu welcher Beschriftung ein Stueck gehoert. Der Grundriss
// bleibt Zeichen fuer Zeichen derselbe.
//
// FAIL-CLOSED, und das ist der ganze Punkt
// Die verworfene Naeherung ("naechster Namens-Anker in x") war nicht deshalb
// schlecht, weil sie ungenau war, sondern weil sie IMMER eine Antwort gab —
// auch fuer zwei Waschbecken, die sie in den Aufzug legte. Hier gibt es drei
// Ausgaenge: zugeordnet, ohne Zone, mehrdeutig. Die letzten beiden sind
// Befunde und werden gemeldet, nicht stillschweigend auf die naechste Zone
// gerundet.
//
// GRENZEN SIND HALBOFFEN: [von, bis). Ein Stueck genau auf 16,48 m gehoert
// nach Osten, nie in beide Zonen. Ohne diese Festlegung haenge die Antwort an
// der Reihenfolge der Liste — und die ist keine Eigenschaft des Plans.
import fs from 'node:fs'
import path from 'node:path'

/** @typedef {{name: string, x: [number, number], y: [number, number], anker: string|null, erwartete_stuecke: number}} Zone */

/**
 * Zonen aus data/zonen.json lesen. Meter, wie in der Datei.
 * @returns {{zonen: Zone[], flurachsen: {nord: number, sued: number}}}
 */
export function ladeZonen(wurzel) {
  const pfad = path.join(wurzel, 'data/zonen.json')
  const roh = JSON.parse(fs.readFileSync(pfad, 'utf8'))
  if (!Array.isArray(roh.zonen) || roh.zonen.length === 0) {
    throw new Error(`data/zonen.json enthaelt keine Zonen — ohne sie waere jede Zuordnung geraten`)
  }
  for (const z of roh.zonen) {
    const gut =
      typeof z.name === 'string' &&
      Array.isArray(z.x) && z.x.length === 2 && z.x.every(Number.isFinite) &&
      Array.isArray(z.y) && z.y.length === 2 && z.y.every(Number.isFinite) &&
      z.x[0] < z.x[1] && z.y[0] < z.y[1]
    if (!gut) throw new Error(`Zone "${z.name ?? '?'}" hat keine brauchbaren Grenzen`)
  }
  return { zonen: roh.zonen, flurachsen: roh.flurachsen }
}

/** Liegt der Punkt (in METERN) in dieser Zone? Halboffen: [von, bis). */
export function inZone(xm, ym, zone) {
  return xm >= zone.x[0] && xm < zone.x[1] && ym >= zone.y[0] && ym < zone.y[1]
}

/**
 * Stuecke (in ZENTIMETERN, wie im Plan) auf die Zonen verteilen.
 *
 * @returns {{jeZone: Map<string, object[]>, ohneZone: object[], mehrdeutig: object[]}}
 *   `mehrdeutig` ist bei sauberen Zonen immer leer — es ist der Waechter gegen
 *   ueberlappende Rechtecke, nicht ein erwarteter Fall.
 */
export function ordneZu(stuecke, zonen) {
  const jeZone = new Map(zonen.map((z) => [z.name, []]))
  const ohneZone = []
  const mehrdeutig = []
  for (const s of stuecke) {
    const xm = s.x / 100
    const ym = s.y / 100
    const treffer = zonen.filter((z) => inZone(xm, ym, z))
    if (treffer.length === 1) jeZone.get(treffer[0].name).push(s)
    else if (treffer.length === 0) ohneZone.push(s)
    else mehrdeutig.push({ stueck: s, zonen: treffer.map((z) => z.name) })
  }
  return { jeZone, ohneZone, mehrdeutig }
}
