// EIN Weg, mit dem die Pruefwerkzeuge die Werkstatt aufschliessen.
//
//   import { werkstattAufschliessen, passwortHolen } from './werkstatt-auf.mjs'
//   await werkstattAufschliessen(page)   // vor jedem Klick auf „Bearbeiten"
//
// WARUM ES DAS GEBEN MUSS
// Seit W11 verlangt „Bearbeiten" ein Passwort. Jedes Gate, das etwas
// veraendert, stand danach vor einer Rueckfrage statt vor der Werkzeugleiste —
// und meldete rot, ohne dass an dem, was es prueft, irgendetwas kaputt waere.
//
// ES GIBT KEINE HINTERTUER. Diese Funktion geht denselben Weg wie der Knopf und
// braucht dasselbe Passwort; sie liest es nur woanders her. Ein Schalter, der
// das Schloss fuer Pruefungen aushebelt, saesse in derselben Datei, die den
// Schutz behauptet — und waere damit der Schutz.
//
// WOHER DAS PASSWORT KOMMT (in dieser Reihenfolge)
//   1. HALLE400_PASSWORT aus der Umgebung
//   2. die Datei `Halle400-PASSWORT.txt` im Geheim-Ordner (Desktop) — sie
//      enthaelt NUR das Passwort, eine Zeile, damit sie maschinenlesbar ist
// Beides liegt AUSSERHALB des Repos. Im Repo steht es nirgends, auch nicht in
// alle-gates.sh: eine Datei, die einmal gepusht wurde, ist fuer immer draussen.

import fs from 'node:fs'
import path from 'node:path'
// Der Ordner kommt aus `siegel.mjs` und wird hier NICHT zum zweiten Mal
// festgelegt: bis zum 2026-07-30 stand der Pfad an beiden Stellen, und als der
// Ordner beim Aufraeumen des Schreibtischs nach `Desktop/RightFit/` wanderte,
// war der eine Pfad reparieret und der andere nicht. Ergebnis: sieben Gates
// stuerzten mit „Passwort nicht auffindbar" ab, obwohl das Passwort vollstaendig
// vorhanden war. Zwei Wahrheiten ueber denselben Ort sind eine zu viel.
import { geheimOrdner } from './siegel.mjs'

const GEHEIM = geheimOrdner()
const PASSWORT_DATEI = path.join(GEHEIM, 'Halle400-PASSWORT.txt')

export function passwortHolen() {
  if (process.env.HALLE400_PASSWORT) return process.env.HALLE400_PASSWORT.trim()
  if (fs.existsSync(PASSWORT_DATEI)) {
    const roh = fs.readFileSync(PASSWORT_DATEI, 'utf8')
    // Erste nicht-leere Zeile, die kein Kommentar ist.
    for (const z of roh.split(/\r?\n/)) {
      const s = z.trim()
      if (s && !s.startsWith('#')) return s
    }
  }
  return null
}

/* Schliesst die Werkstatt auf und BEWEIST es. Ein stiller Fehlschlag waere hier
   besonders teuer: das Gate liefe weiter, faende keine Werkzeuge und meldete
   einen Fehler an einer ganz anderen Stelle. */
export async function werkstattAufschliessen(page) {
  const hat = await page.evaluate(() => !!(window.__planerDatei && window.__planerDatei.hatSchloss && window.__planerDatei.hatSchloss()))
  if (!hat) return { noetig: false, offen: true }

  const wort = passwortHolen()
  if (!wort) {
    throw new Error(
      'Die Datei ist verschlossen und das Passwort ist nicht auffindbar.\n' +
      '  Entweder:  HALLE400_PASSWORT="..." vor den Befehl setzen\n' +
      '  oder:      eine Zeile mit dem Passwort in ' + PASSWORT_DATEI + '\n' +
      '  (Kein Gate darf das Schloss umgehen — dann waere es keines.)')
  }
  const e = await page.evaluate((w) => window.__planerDatei.aufschliessen(w), wort)
  if (!e || !e.offen) throw new Error('Das Passwort wurde abgelehnt: ' + ((e && e.grund) || 'unbekannt'))
  return { noetig: true, offen: true }
}
