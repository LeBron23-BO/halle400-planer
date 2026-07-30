// Legt den 2D-Planer-KERN (Modell + Zeichner) zu EINEM Stück Javascript
// zusammen, das ohne Server und ohne Modul-Nachladen läuft.
//
// WARUM ÜBERHAUPT: eine Datei, die per Doppelklick aufgeht, liegt unter
// `file://`. Dort verweigert der Browser jedes Nachladen weiterer Dateien —
// `import` fällt also aus, und mit ihm der übliche Weg, Quelltext zu ordnen.
// Übrig bleibt: alles in EINEN Gültigkeitsbereich legen. Genau das tut
// `baue-bank-ansicht.mjs` schon für die vier Axonometrie-Module; hier kommt
// der Kern dazu, der aus einer Ansicht einen bearbeitbaren Plan macht.
//
// DREI FESTLEGUNGEN, die man kennen muss:
//
// 1. Der Kern wird NICHT abgeschrieben, sondern aus derselben Typescript-
//    Quelle übersetzt, aus der auch der Planer baut (`tsc`, schon im Projekt).
//    Eine zweite, handgepflegte Fassung wäre eine zweite Wahrheit — und die
//    driftet, sobald jemand nur eine der beiden anfasst.
// 2. `three` liefert dem Kern seine Rechen-Vektoren (Vector2/Vector3/Matrix4).
//    Statt den Kern umzuschreiben, kommt der Rechen-Teil von three mit in die
//    Datei (`three.core.min.js`, ~380 KB, ohne Bildschirm-Ausgabe). Der Kern
//    bleibt unangetastet — das ist der billigere Preis.
// 3. Zwei gleichnamige Deklarationen im selben Bereich sind ein harter
//    Syntaxfehler, und zwar erst im Browser der Bank. Deshalb wird auf
//    Namenskollisionen GEPRÜFT und abgebrochen, nicht gehofft.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HIER = path.dirname(fileURLToPath(import.meta.url))
export const WURZEL = path.resolve(HIER, '..')

/** Übersetzungs-Reihenfolge = Abhängigkeitsreihenfolge.
 *
 *  Die Module verweisen teils WECHSELSEITIG aufeinander (corner↔wall↔floorplan).
 *  In einem gemeinsamen Gültigkeitsbereich ist das unschädlich, solange keine
 *  Datei beim EINLESEN schon eine später definierte Klasse benutzt — sie tun es
 *  nur in ihren Methoden, also zur Laufzeit. Die Reihenfolge hier ist trotzdem
 *  von unten nach oben gewählt, damit Konstanten vor ihren Benutzern stehen. */
const KERN = [
  'core/utils.js',
  'core/events.js',
  // dimensioning VOR configuration: die beiden verweisen wechselseitig
  // aufeinander, und `configuration` greift schon beim EINLESEN auf `dimMeter`
  // zu (sein Standardwert für die Maßeinheit). Andersherum bricht die Datei mit
  // „Cannot access 'dimMeter' before initialization" — gemessen, nicht vermutet.
  // `dimensioning` selbst benutzt `Configuration` nur in Funktionen, also erst
  // zur Laufzeit; die Richtung ist damit die einzig tragfähige.
  'core/dimensioning.js',
  'core/configuration.js',
  'core/undo.js',
  'model/corner.js',
  'model/wall.js',
  'model/half_edge.js',
  'model/room.js',
  'model/floorplan.js',
  // W12 — die Brücke „Räume zusammenlegen". NACH floorplan (sie benutzt dessen
  // öffentliche Schnittstelle), VOR den Floorplanner (der sie später aufruft).
  // Ihre reine Rechnung wird über RAUM_MODULE dazugelegt, weil sie Javascript
  // ist und deshalb nicht durch tsc läuft.
  'raum/zusammenlegen-anbindung.js',
  'floorplanner/floorplanner_view.js',
  'floorplanner/floorplanner.js'
]

const IMPORT_ZEILE = /^import\s.*?from\s*['"][^'"]+['"];?[ \t]*$/gm
const IMPORT_NACKT = /^import\s*['"][^'"]+['"];?[ \t]*$/gm
const EXPORT_WORT = /^export\s+(?=(?:const|let|var|function|class|abstract|async|type|interface|enum|default))/gm
const EXPORT_BLOCK = /^export\s*\{[^}]*\}\s*;?[ \t]*$/gm

/** Übersetzt den Kern nach Javascript und gibt das Ausgabe-Verzeichnis zurück. */
export function uebersetzeKern() {
  const tsc = path.join(WURZEL, 'app/node_modules/typescript/bin/tsc')
  if (!fs.existsSync(tsc)) {
    throw new Error(`tsc nicht gefunden: ${tsc} — in app/ zuerst installieren.`)
  }
  const aus = fs.mkdtempSync(path.join(os.tmpdir(), 'h400-kern-'))
  execFileSync(
    process.execPath,
    [
      tsc,
      path.join(WURZEL, 'src/floorplanner/floorplanner.ts'),
      // ZWEITER Einstiegspunkt (W12): die Brücke „Räume zusammenlegen" wird vom
      // Floorplanner noch nicht importiert, muss aber übersetzt werden — sonst
      // fehlt sie im Bündel und damit in der Doppelklick-Datei. tsc folgt nur
      // Importen; eine Datei, die niemand importiert, entsteht nicht von selbst.
      path.join(WURZEL, 'src/raum/zusammenlegen-anbindung.ts'),
      '--target', 'es2020',
      '--module', 'es2020',
      '--moduleResolution', 'node',
      '--skipLibCheck',
      '--outDir', aus
    ],
    { stdio: 'pipe' }
  )
  return aus
}

/** Nimmt einer übersetzten Datei die Modul-Hülle ab. */
export function entkleide(quelle) {
  return quelle
    .replace(IMPORT_ZEILE, '')
    .replace(IMPORT_NACKT, '')
    .replace(EXPORT_BLOCK, '')
    .replace(EXPORT_WORT, '')
}

/** Prüft auf doppelte Namen und wirft mit Fundort, statt still zu überschreiben. */
export function pruefeNamen(text, herkunft, namen) {
  for (const m of text.matchAll(/^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm)) {
    if (namen.has(m[1]) && namen.get(m[1]) !== herkunft) {
      throw new Error(
        `Namenskollision beim Zusammenlegen: "${m[1]}" in ${herkunft} und ${namen.get(m[1])}`
      )
    }
    namen.set(m[1], herkunft)
  }
}

/** Der Rechen-Teil von three, als schlichtes `THREE`-Objekt im selben Bereich.
 *
 *  `three.core.min.js` ist ein ES-Modul: es endet auf einer einzigen
 *  `export{kurz as Lang, …}`-Zeile. Die wird zu einer Objekt-Bildung
 *  umgeschrieben — damit heißt `THREE.Vector3` im Kern weiterhin das, was es
 *  immer hieß, ohne dass eine Zeile Kern-Code angefasst werden muss. */
export function buendleThree() {
  const pfad = path.join(WURZEL, 'app/node_modules/three/build/three.core.min.js')
  if (!fs.existsSync(pfad)) throw new Error(`three fehlt: ${pfad}`)
  const roh = fs.readFileSync(pfad, 'utf8')

  const treffer = roh.match(/export\s*\{([^}]*)\}\s*;?\s*$/)
  if (!treffer) throw new Error('three.core.min.js: erwartete Export-Liste nicht gefunden')

  const paare = treffer[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const teil = s.split(/\s+as\s+/)
      const innen = teil[0].trim()
      const aussen = (teil[1] || teil[0]).trim()
      return `${JSON.stringify(aussen)}:${innen}`
    })

  const ohneExport = roh.slice(0, treffer.index)
  return [
    '/* ══════ three (Rechen-Teil, ohne Bildschirm-Ausgabe) ══════ */',
    '/* eslint-disable */',
    'const THREE = (() => {',
    ohneExport,
    `return {${paare.join(',')}}`,
    '})();'
  ].join('\n')
}

/** Der übersetzte 2D-Kern als ein Stück, mit Kollisions-Prüfung.
 *
 *  Die reine Raum-Rechnung (W12) kommt HIER mit und nicht auf Zuruf der
 *  Aufrufer: `raum/zusammenlegen-anbindung.js` steht in KERN und ruft sie, also
 *  gehört sie zum Kern und nicht zum Beiwerk. Müsste jeder Bauer sie einzeln
 *  dazulegen, hätte einer sie irgendwann nicht — und das fiele nicht beim Bauen
 *  auf, sondern in der ausgelieferten Datei, als Knopf ohne Wirkung. Dieselbe
 *  Lehre steht über AXO_MODULE. */
export function buendleKern(ausDir, namen = new Map()) {
  const teile = [buendleRaum(namen)]
  for (const rel of KERN) {
    const pfad = path.join(ausDir, rel)
    if (!fs.existsSync(pfad)) throw new Error(`Übersetzter Baustein fehlt: ${rel}`)
    const ohne = entkleide(fs.readFileSync(pfad, 'utf8')).trim()
    pruefeNamen(ohne, rel, namen)

    const rest = ohne.match(/^[ \t]*(export|import)[\s{'"*]/m)
    if (rest) {
      const zeile = ohne.slice(0, ohne.indexOf(rest[0])).split('\n').length
      throw new Error(`${rel}:${zeile} — Modul-Syntax übrig: ${rest[0].trim()}`)
    }
    teile.push(`/* ══════ ${rel} ══════ */\n${ohne}`)
  }
  return teile.join('\n\n')
}

/** Die SECHS Axonometrie-Module — dieselben Dateien wie die Planer-Ansicht.
 *
 *  Reihenfolge = Abhaengigkeit: `axo-treffer.js` steht VOR `axo-zeichnen.js`,
 *  das es benutzt; `axo-kennzahlen.js` steht hinter `axo-zyklen.js`, aus dem
 *  es seine Raumableitung bezieht. Wer hier eines vergisst, merkt es NICHT im
 *  Planer (dort laedt `import` nach), sondern erst in der Bank-Datei — und
 *  dort als tote Bedienung ohne Fehlermeldung. Genau darum steht diese Liste
 *  an einer Stelle und wird von den Gates `pruefe-axo-bearbeiten.mjs` und
 *  `pruefe-kennzahlen.mjs` gegen `src/axo/` gehalten. */
export const AXO_MODULE = [
  'axo-kontrakt.js',
  'axo-zyklen.js',
  'axo-kennzahlen.js',
  'axo-treffer.js',
  'axo-szene.js',
  'axo-zeichnen.js'
]

/** Die reine Raum-Rechnung (W12) — Javascript, läuft nicht durch tsc.
 *
 *  Muss VOR dem Kern gebündelt werden: `zusammenlegen-anbindung.js` steht dort
 *  drin und ruft diese Funktionen. Dieselbe Falle wie bei den Axonometrie-
 *  Modulen — wer sie vergisst, merkt es NICHT im Planer (dort lädt `import`
 *  nach), sondern erst in der Doppelklick-Datei, und dort als tote Bedienung
 *  ohne Fehlermeldung. */
// Die Reihenfolge ist NICHT beliebig: `objekt-menue.js` (W13) liest
// `_pruefzugang` und `pruefeZusammenlegen` aus `raum-zusammenlegen.js` schon in
// seinen obersten `const`-Zeilen. Stünde es davor, wäre der Wert dort noch
// `undefined` — und zwar still.
export const RAUM_MODULE = ['raum-zusammenlegen.js', 'wand-bewegen.js', 'objekt-menue.js']

export function buendleRaum(namen = new Map()) {
  const teile = []
  for (const datei of RAUM_MODULE) {
    const pfad = path.join(WURZEL, 'src/raum', datei)
    if (!fs.existsSync(pfad)) throw new Error(`Raum-Modul fehlt: ${pfad}`)
    const ohne = entkleide(fs.readFileSync(pfad, 'utf8')).trim()
    pruefeNamen(ohne, datei, namen)
    teile.push(`/* ══════ ${datei} ══════ */\n${ohne}`)
  }
  return teile.join('\n\n')
}

export function buendleAxo(namen = new Map()) {
  const teile = []
  for (const datei of AXO_MODULE) {
    const pfad = path.join(WURZEL, 'src/axo', datei)
    if (!fs.existsSync(pfad)) throw new Error(`Axonometrie-Modul fehlt: ${pfad}`)
    const ohne = entkleide(fs.readFileSync(pfad, 'utf8')).trim()
    pruefeNamen(ohne, datei, namen)
    teile.push(`/* ══════ ${datei} ══════ */\n${ohne}`)
  }
  return teile.join('\n\n')
}
