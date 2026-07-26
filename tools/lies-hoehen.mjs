/**
 * Liest die Ausstattungs-Hoehen aus `src/three/ausstattung.ts`.
 *
 * Die Tabelle dort ist die EINZIGE Wahrheit ueber Hoehen in diesem Projekt —
 * jeder Eintrag mit Begruendung (DIN EN 527-1 fuer die Arbeitshoehe, DIN EN
 * 1335 fuer die Sitzhoehe) und mit der Doktrin, was NICHT gezeichnet wird:
 * keine Stuhllehne, keine Treppensteigung, kein Tisch-Vollkoerper — nichts,
 * was ein Grundriss nicht hergibt.
 *
 * Die Node-Werkzeuge koennen die TypeScript-Datei nicht laden, also lesen sie
 * sie. Abgeschrieben wird sie nicht: eine Kopie waere still veraltet, sobald
 * jemand dort eine Hoehe aendert, und Bank-Ansicht und 3D-Modell zeigten
 * verschiedene Moebel.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HIER = path.dirname(fileURLToPath(import.meta.url))
const QUELLE = path.resolve(HIER, '../src/three/ausstattung.ts')

function leseTabelle(quelle, name) {
  const block = quelle.match(new RegExp(`${name}[^=]*=\\s*\\{([\\s\\S]*?)\\n\\}`))
  if (!block) return null
  const werte = {}
  for (const m of block[1].matchAll(/^\s*(\w+)\s*:\s*(\d+(?:\.\d+)?)\s*,?\s*$/gm)) {
    werte[m[1]] = Number(m[2])
  }
  return werte
}

/**
 * @returns {{oberkante:Record<string,number>, koerper:Record<string,number>}} in cm
 */
export function liesHoehen() {
  if (!fs.existsSync(QUELLE)) {
    console.error(`Hoehen-Tabelle nicht gefunden: ${QUELLE} — Abbruch.`)
    console.error('Lieber laut scheitern als ein anderes Modell zeigen als die 3D-Ansicht.')
    process.exit(1)
  }
  const quelle = fs.readFileSync(QUELLE, 'utf8')
  const oberkante = leseTabelle(quelle, 'OBERKANTE_CM')
  const koerper = leseTabelle(quelle, 'KOERPER_CM')
  if (!oberkante || Object.keys(oberkante).length < 5) {
    console.error(`OBERKANTE_CM nicht lesbar oder zu klein (${Object.keys(oberkante || {}).length}) — Abbruch.`)
    process.exit(1)
  }
  return { oberkante, koerper: koerper || {} }
}
