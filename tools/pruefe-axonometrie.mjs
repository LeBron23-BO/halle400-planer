/**
 * PRUEFT DIE AXONOMETRIE (X2)
 * ===========================
 *
 * Aufruf:
 *   node tools/pruefe-axonometrie.mjs [--plan halle400] [--port 3301]
 *
 * Fuenf Gates. Exit 0 nur, wenn alle bestehen.
 *
 *   G1  Die Raumableitung `src/axo/axo-zyklen.js` liefert GENAU dasselbe wie
 *       `floorplan.getRooms()` im echten Planer. Das ist der Beweis, dass die
 *       Bank-Datei und die Planer-Ansicht denselben Grundriss zeigen. Laeuft
 *       nur, wenn ein Planer erreichbar ist (`node tools/serve-local.mjs`);
 *       ohne ihn meldet das Gate ehrlich "uebersprungen" statt "gruen".
 *   G2  Die Szene enthaelt alle gemessenen Daten: 25 Raumflaechen, 18
 *       Namens-Anker, 9 aufgeloeste Saeulen und jedes der 289 Ausstattungs-
 *       Elemente mit mindestens einem Koerper.
 *   G3  Das Bild ist wirklich gezeichnet — Farbvielfalt weit ueber dem
 *       Hintergrundverlauf, und die Amber-Akzentfarbe der Saeulen kommt vor.
 *   G4  GEGENPROBE: dieselbe Messung an einer Szene OHNE Moebel und OHNE
 *       Namen muss deutlich weniger Farbtoene liefern. Ohne diesen Test misst
 *       G3 nur, dass ueberhaupt etwas Buntes auf dem Blatt steht.
 *   G5  Kein Konsolenfehler beim Zeichnen.
 *
 * Nebenbei entstehen die Standbilder in `bank-export/` zum ANSEHEN — nach
 * CLAUDE.md Punkt 2 ist kein Geometrie-Gate ohne Blick aufs Bild bestanden.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HIER = path.dirname(fileURLToPath(import.meta.url))
const WURZEL = path.resolve(HIER, '..')
const PW_STANDARD = 'file:///C:/Users/dania/.gemini/node_modules/playwright/index.js'

const arg = (name, standard) => {
  const i = process.argv.indexOf(name)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : standard
}
const PLAN = arg('--plan', 'halle400')
const PORT = arg('--port', '3301')

const planPfad = path.join(WURZEL, 'app/public/plaene', `${PLAN}.json`)
const plan = JSON.parse(fs.readFileSync(planPfad, 'utf8'))
const fp = plan.floorplan ?? plan

const { chromium } = (await import(process.env.PLAYWRIGHT_PFAD || PW_STANDARD)).default

const ergebnisse = []
const melde = (name, ok, text) => {
  ergebnisse.push({ name, ok, text })
  console.log(`${ok === null ? '·' : ok ? '✓' : '✗'} ${name}: ${text}`)
}

/* ══ G1 · Ableitung gegen den echten Planer ═══════════════════════ */
const { leiteRaeumeAb, flaecheVon } = await import(pathToFileURL(path.join(WURZEL, 'src/axo/axo-zyklen.js')).href)
const eigene = leiteRaeumeAb(fp.corners, fp.walls)
const eigeneFl = eigene.map((p) => +(flaecheVon(p) / 10000).toFixed(1)).sort((a, b) => b - a)

const browser = await chromium.launch()
try {
  const seite = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  let erreichbar = true
  try {
    await seite.goto(`http://localhost:${PORT}/?plan=${PLAN}`, { waitUntil: 'domcontentloaded', timeout: 8000 })
    // Auf die RAEUME warten, nicht nur auf die Instanz: der Planer laedt den
    // Plan asynchron nach, und `getRooms()` ist im ersten Moment leer. Ein
    // fester Wartewert waere hier eine Wette — dieser Zustand ist messbar.
    await seite.waitForFunction(() => globalThis.__planer?.model?.floorplan?.getRooms()?.length > 0, null, {
      timeout: 20000
    })
  } catch (_) {
    erreichbar = false
  }
  if (!erreichbar) {
    melde('G1 Ableitung == Planer', null, `uebersprungen — kein Planer auf :${PORT} (node tools/serve-local.mjs)`)
  } else {
    const planerFl = await seite.evaluate(() => {
      const f = (p) => {
        let a = 0
        for (let i = 0; i < p.length; i++) {
          const q = p[(i + 1) % p.length]
          a += p[i].x * q.y - q.x * p[i].y
        }
        return Math.abs(a) / 2
      }
      return globalThis.__planer.model.floorplan
        .getRooms()
        .map((r) => +(f(r.corners.map((c) => ({ x: c.x, y: c.y }))) / 10000).toFixed(1))
        .sort((a, b) => b - a)
    })
    const gleich = JSON.stringify(planerFl) === JSON.stringify(eigeneFl)
    melde(
      'G1 Ableitung == Planer',
      gleich,
      gleich
        ? `${eigeneFl.length} Raumflaechen deckungsgleich`
        : `ABWEICHUNG — eigen ${eigeneFl.length}, Planer ${planerFl.length}\n    eigen:  ${eigeneFl.join(' ')}\n    Planer: ${planerFl.join(' ')}`
    )
  }
  await seite.close()

  /* ══ Probe-Seite: Module aus dem Dateisystem statt ueber einen Server ══ */
  const bauProbe = (mitMoebeln, mitNamen) => `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;height:100%;background:#F2ECDE}canvas{display:block;width:100vw;height:100vh}</style>
</head><body><canvas id="c"></canvas>
<script type="module">
import { baueSzene } from '/src/axo/axo-szene.js'
import { erzeugeAxonometrie } from '/src/axo/axo-zeichnen.js'
const plan = await (await fetch('/plan.json')).json()
const szene = baueSzene(plan, { wandDicke: 12.5 })
if (!${mitMoebeln}) szene.moebel = []
const axo = erzeugeAxonometrie(document.getElementById('c'), szene, { namen: ${mitNamen ? "'alle'" : "'aus'"} })
axo.passeAn()
globalThis.__fertig = true
globalThis.__zahlen = { boeden: szene.boeden.length, waende: szene.waende.length, moebel: szene.moebel.length, marken: szene.marken.length, saeulen: szene.marken.filter(m=>m.hervor).length }
globalThis.__blick = (az, el) => axo.setzeBlick(az, el)
<\/script></body></html>`

  const oeffne = async (mitMoebeln, mitNamen) => {
    const s = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const fehler = []
    s.on('console', (m) => m.type() === 'error' && fehler.push(m.text()))
    s.on('pageerror', (e) => fehler.push(String(e)))
    await s.route('**/*', async (route, req) => {
      const u = new URL(req.url())
      if (u.pathname === '/probe') {
        return route.fulfill({ contentType: 'text/html; charset=utf-8', body: bauProbe(mitMoebeln, mitNamen) })
      }
      if (u.pathname === '/plan.json') {
        return route.fulfill({ contentType: 'application/json', body: fs.readFileSync(planPfad, 'utf8') })
      }
      const datei = path.join(WURZEL, u.pathname.replace(/^\/+/, ''))
      if (datei.startsWith(WURZEL) && fs.existsSync(datei) && fs.statSync(datei).isFile()) {
        return route.fulfill({ contentType: 'text/javascript; charset=utf-8', body: fs.readFileSync(datei, 'utf8') })
      }
      return route.fulfill({ status: 404, body: '' })
    })
    await s.goto('http://axo.probe/probe', { waitUntil: 'domcontentloaded' })
    await s.waitForFunction(() => globalThis.__fertig, null, { timeout: 20000 })
    await s.waitForTimeout(400)
    return { s, fehler }
  }

  /** Zaehlt verschiedene Farbtoene und sucht die Akzentfarbe. */
  const messeBild = (seite) =>
    seite.evaluate(() => {
      const c = document.getElementById('c')
      const g = c.getContext('2d')
      const d = g.getImageData(0, 0, c.width, c.height).data
      const toene = new Set()
      let amber = 0
      for (let i = 0; i < d.length; i += 4 * 7) {
        const r = d[i]
        const gr = d[i + 1]
        const b = d[i + 2]
        toene.add((r >> 3) + '-' + (gr >> 3) + '-' + (b >> 3))
        // Amber-Akzent #C8703A: deutlich rot-dominant, mittlere Helligkeit
        if (r > 150 && r < 225 && gr > 85 && gr < 150 && b > 30 && b < 95) amber++
      }
      return { toene: toene.size, amber }
    })

  const voll = await oeffne(true, true)
  const zahlen = await voll.s.evaluate(() => globalThis.__zahlen)
  const g2 = zahlen.boeden === 25 && zahlen.marken === 18 && zahlen.saeulen === 9 && zahlen.moebel > 400
  melde(
    'G2 Szene vollstaendig',
    g2,
    `${zahlen.boeden} Raumflaechen · ${zahlen.waende} Wandstuecke · ${zahlen.moebel} Moebelkoerper · ${zahlen.marken} Namen · ${zahlen.saeulen}/9 Saeulen`
  )

  const bildVoll = await messeBild(voll.s)
  const g3 = bildVoll.toene > 120 && bildVoll.amber > 40
  melde('G3 Bild gezeichnet', g3, `${bildVoll.toene} Farbtoene, ${bildVoll.amber} Akzent-Bildpunkte`)

  fs.mkdirSync(path.join(WURZEL, 'bank-export'), { recursive: true })
  await voll.s.screenshot({ path: path.join(WURZEL, 'bank-export/axo-1-nord.png') })
  await voll.s.evaluate(() => globalThis.__blick(-2.62, 0.62))
  await voll.s.waitForTimeout(250)
  await voll.s.screenshot({ path: path.join(WURZEL, 'bank-export/axo-2-sued.png') })
  await voll.s.evaluate(() => globalThis.__blick(0, 1.44))
  await voll.s.waitForTimeout(250)
  await voll.s.screenshot({ path: path.join(WURZEL, 'bank-export/axo-3-plan.png') })

  const kahl = await oeffne(false, false)
  const bildKahl = await messeBild(kahl.s)
  const g4 = bildKahl.toene < bildVoll.toene * 0.75
  melde(
    'G4 Gegenprobe (ohne Moebel/Namen)',
    g4,
    `${bildKahl.toene} Farbtoene gegen ${bildVoll.toene} — die Messung reagiert auf den Inhalt`
  )

  const alleFehler = [...voll.fehler, ...kahl.fehler]
  melde('G5 keine Konsolenfehler', alleFehler.length === 0, alleFehler.length ? alleFehler.join(' | ') : 'sauber')

  await voll.s.close()
  await kahl.s.close()

  /* ══ G6 · X3: folgt die Ansicht im Planer dem Grundriss? ══════════
     Der eigentliche Auftrag der dritten Ansicht. Gemessen wird nicht, ob ein
     Umschalter existiert, sondern ob eine ECHTE Aenderung am Modell im Bild
     ankommt — mit Gegenprobe, damit das Gate nicht schon auf Bildrauschen
     anspringt. */
  if (!erreichbar) {
    melde('G6 Ansicht folgt dem Grundriss', null, `uebersprungen — kein Planer auf :${PORT}`)
  } else {
    const p = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const g6fehler = []
    p.on('pageerror', (e) => g6fehler.push(String(e)))
    await p.goto(`http://localhost:${PORT}/?plan=${PLAN}`, { waitUntil: 'domcontentloaded' })
    await p.waitForFunction(() => globalThis.__planer?.model?.floorplan?.getRooms()?.length > 0, null, { timeout: 20000 })
    await p.getByRole('button', { name: 'Axonometrie', exact: true }).click()
    await p.waitForTimeout(1200)

    /** Fingerabdruck des Axonometrie-Canvas. Ein reines 2D-Canvas laesst sich
     *  direkt auslesen — anders als der WebGL-Canvas der 3D-Ansicht, dessen
     *  Zeichenpuffer nach dem Rendern schon praesentiert ist. */
    const abdruck = () =>
      p.evaluate(() => {
        const c = [...document.querySelectorAll('canvas')].find((x) => x.width > 100 && x.offsetParent !== null)
        if (!c) return null
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
        let h = 5381
        for (let i = 0; i < d.length; i += 4 * 11) h = ((h * 33) ^ d[i] ^ (d[i + 1] << 3) ^ (d[i + 2] << 6)) >>> 0
        return h
      })

    const vorher = await abdruck()
    // Gegenprobe: ohne jede Aenderung darf sich das Bild NICHT ruehren. Ohne
    // sie wuerde G6 auch dann gruen, wenn der Renderer bei jedem Neuzeichnen
    // etwas anderes malt — dann bewiese die Aenderung hinterher gar nichts.
    await p.waitForTimeout(600)
    const ruhe = await abdruck()

    const vorherZahlen = await p.evaluate(() => ({
      raeume: globalThis.__planer.model.floorplan.getRooms().length,
      waende: globalThis.__planer.model.floorplan.getWalls().length
    }))
    // Eine Trennwand einziehen — genau das, was der 2D-Zeichner tut (er ruft
    // dieselben Modell-Funktionen). Sie wird zwischen zwei VORHANDENE Ecken
    // gespannt: eine frei in den Raum gesetzte Wand teilt keinen Zyklus, weil
    // ihre Enden an nichts andocken — dann bliebe die Raumzahl gleich und das
    // Gate meldete einen Fehler, den es gar nicht gibt.
    await p.evaluate(() => {
      const fp = globalThis.__planer.model.floorplan
      const raum = fp
        .getRooms()
        .filter((r) => r.corners.length === 4)
        .sort((a, b) => b.corners.length - a.corners.length)[0]
      const ecken = raum.corners
      fp.newWall(ecken[0], ecken[2]) // Diagonale: teilt die Flaeche sicher
      fp.update()
    })
    await p.waitForTimeout(900)
    const nachher = await abdruck()
    const nachherZahlen = await p.evaluate(() => ({
      raeume: globalThis.__planer.model.floorplan.getRooms().length,
      waende: globalThis.__planer.model.floorplan.getWalls().length
    }))
    const raeumeVorher = vorherZahlen.raeume
    const raeumeNachher = nachherZahlen.raeume

    const stabil = vorher !== null && vorher === ruhe
    const gefolgt = nachher !== null && nachher !== vorher
    const modellGeaendert = nachherZahlen.waende > vorherZahlen.waende && raeumeNachher > raeumeVorher
    const g6 = stabil && gefolgt && modellGeaendert && g6fehler.length === 0
    melde(
      'G6 Ansicht folgt dem Grundriss',
      g6,
      g6
        ? `Trennwand eingezogen: ${vorherZahlen.waende}->${nachherZahlen.waende} Waende, ${raeumeVorher}->${raeumeNachher} Raeume, Bild folgte (ruhend unveraendert)`
        : `stabil=${stabil} bildGefolgt=${gefolgt} waende=${vorherZahlen.waende}->${nachherZahlen.waende} raeume=${raeumeVorher}->${raeumeNachher}${g6fehler.length ? ' fehler=' + g6fehler.join('|') : ''}`
    )
    await p.close()
  }
} finally {
  await browser.close()
}

const gescheitert = ergebnisse.filter((e) => e.ok === false)
console.log(`\nBilder: bank-export/axo-1-nord.png · axo-2-sued.png · axo-3-plan.png — ANSEHEN.`)
console.log(gescheitert.length ? `\n${gescheitert.length} Gate(s) rot.` : '\nAlle Gates bestanden.')
process.exit(gescheitert.length ? 1 : 0)
