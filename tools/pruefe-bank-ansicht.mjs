// Prueft die BANK-ANSICHT (E4) unter den Bedingungen der Bank — und erzeugt
// dabei die Standbilder fuer den gedruckten Businessplan.
//
//   node tools/baue-bank-ansicht.mjs      # erst bauen
//   node tools/pruefe-bank-ansicht.mjs    # dann pruefen + Bilder
// Exit 0 = alle Pruefungen bestanden, 1 = mindestens eine durchgefallen.
//
// DIE PRUEFUNG IST DER ZWECK, die Bilder sind das Nebenprodukt: sie entstehen
// aus derselben Datei, die gerade bestanden hat. Ein Standbild aus einer
// anderen Quelle koennte zeigen, was die Bank nie zu sehen bekommt.
//
// DREI BEDINGUNGEN, unter denen geprueft wird:
//   1. file:// — kein Server, kein Node, kein localhost. Genau der Doppelklick.
//   2. NETZ HART GESPERRT — jede Anfrage nach draussen wird abgebrochen. Ohne
//      diese Sperre bestuende die Pruefung auch dann, wenn noch eine CDN-URL im
//      Renderpfad haengt: auf DIESEM Rechner ist das CDN ja erreichbar. Der
//      Fehler zeigte sich erst bei der Bank — also dort, wo niemand mehr
//      nachbessern kann.
//   3. KEIN Konsolenfehler. Eine weisse Seite meldet sich nicht von selbst.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PW_STANDARD = 'file:///C:/Users/dania/.gemini/node_modules/playwright/index.js'
const { chromium } = (await import(process.env.PLAYWRIGHT_PFAD || PW_STANDARD)).default

const HIER = path.dirname(fileURLToPath(import.meta.url))
const WURZEL = path.resolve(HIER, '..')

const arg = (name, standard) => {
  const i = process.argv.indexOf(name)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : standard
}
const DATEI = path.resolve(WURZEL, arg('--datei', 'Halle400-Modell.html'))
const BILDER = path.resolve(WURZEL, arg('--bilder', 'bank-export'))

if (!fs.existsSync(DATEI)) {
  console.error(`Nicht gefunden: ${DATEI}\nErst "node tools/baue-bank-ansicht.mjs" laufen lassen.`)
  process.exit(1)
}
fs.mkdirSync(BILDER, { recursive: true })

const fehler = []
const pruefe = (bedingung, text) => {
  console.log(`${bedingung ? 'OK  ' : 'FEHL'} ${text}`)
  if (!bedingung) fehler.push(text)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })

// --- Netz hart sperren. file:// selbst laeuft weiter, alles andere nicht.
const blockiert = []
await page.route('**/*', (route) => {
  const url = route.request().url()
  if (url.startsWith('file://') || url.startsWith('data:') || url.startsWith('blob:')) {
    return route.continue()
  }
  blockiert.push(url)
  return route.abort()
})

const konsolenFehler = []
page.on('console', (m) => {
  if (m.type() === 'error') konsolenFehler.push(m.text().slice(0, 200))
})
page.on('pageerror', (e) => konsolenFehler.push('PAGE-ERR: ' + String(e).slice(0, 200)))

const url = pathToFileURL(DATEI).href
console.log(`Oeffne wie per Doppelklick: ${url}`)
console.log('Netz: GESPERRT\n')

await page.goto(url, { waitUntil: 'domcontentloaded' })

// Warten, bis der Betrachter sich fertig meldet. Ein fester Timeout wuerde
// hier luegen: er bestuende auch, wenn nie etwas gerendert wird.
let bereit = false
try {
  await page.waitForFunction(() => window.__bereit === true, { timeout: 25000 })
  bereit = true
} catch (_) {
  bereit = false
}
pruefe(bereit, 'SCHRITT 1: der Betrachter meldet sich betriebsbereit')

pruefe(
  blockiert.length === 0,
  `SCHRITT 2: KEINE Anfrage nach draussen (${blockiert.length} blockiert${
    blockiert.length ? ': ' + blockiert.slice(0, 3).join(', ') : ''
  })`
)

pruefe(
  konsolenFehler.length === 0,
  `SCHRITT 3: keine Konsolenfehler (${konsolenFehler.length}${
    konsolenFehler.length ? ': ' + konsolenFehler.slice(0, 2).join(' | ') : ''
  })`
)

const modell = bereit ? await page.evaluate(() => window.__modell) : null
if (modell) {
  console.log(
    `     gebaut: ${modell.wandZahl} Waende, ${modell.moebelZahl} Moebel, ` +
      `${(modell.breite / 100).toFixed(1)} m x ${(modell.tiefe / 100).toFixed(1)} m`
  )
}
pruefe(modell !== null && modell.wandZahl > 50, `SCHRITT 4: die Waende sind gebaut (${modell?.wandZahl})`)
pruefe(modell !== null && modell.moebelZahl > 100, `SCHRITT 5: die Ausstattung ist gebaut (${modell?.moebelZahl})`)

// --- Ist wirklich etwas ZU SEHEN? Ein leerer Betrachter meldet sich genauso
// bereit wie ein voller. Gemessen wird die Farbvielfalt: eine leere Szene
// zeigt nur die Hintergrundfarbe.
const sicht = bereit
  ? await page.evaluate(() => {
      const c = document.querySelector('#buehne canvas')
      const h = document.createElement('canvas')
      h.width = 200
      h.height = 130
      const g = h.getContext('2d')
      g.drawImage(c, 0, 0, 200, 130)
      const d = g.getImageData(0, 0, 200, 130).data
      const toene = new Set()
      for (let i = 0; i < d.length; i += 4) {
        toene.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4))
      }
      return toene.size
    })
  : 0
pruefe(sicht > 12, `SCHRITT 6: das Bild zeigt wirklich etwas (${sicht} verschiedene Farbtoene, nicht nur Hintergrund)`)

// ---- Standbilder fuers Papier ----------------------------------------------
if (bereit) {
  const blicke = [
    { name: '1-uebersicht', drehung: -Math.PI / 4, neigung: 0.62, titel: 'Übersicht (Vogelperspektive schräg)' },
    { name: '2-laengs', drehung: Math.PI, neigung: 0.3, titel: 'Längsansicht' },
    { name: '3-draufsicht', drehung: -Math.PI / 2, neigung: 1.5, titel: 'Draufsicht' },
    { name: '4-quer', drehung: -Math.PI / 2 + 0.5, neigung: 0.45, titel: 'Schrägansicht quer' }
  ]
  for (const b of blicke) {
    await page.evaluate((v) => window.__modell.blick(v.drehung, v.neigung), b)
    await page.waitForTimeout(700)
    const ziel = path.join(BILDER, `${b.name}.png`)
    await page.screenshot({ path: ziel })
    console.log(`     Standbild: ${ziel}  (${b.titel})`)
  }
  const anzahl = fs.readdirSync(BILDER).filter((f) => f.endsWith('.png')).length
  pruefe(anzahl >= 4, `SCHRITT 7: ${anzahl} Standbilder fuer den gedruckten Businessplan erzeugt`)
}

await browser.close()

console.log('')
console.log(fehler.length === 0 ? 'ALLE PRUEFUNGEN BESTANDEN' : `DURCHGEFALLEN: ${fehler.length}`)
fehler.forEach((f) => console.log('  - ' + f))
if (fehler.length === 0) {
  console.log('')
  console.log('Die Bank braucht: NUR diese eine Datei.')
  console.log(`  ${DATEI}`)
  console.log(`Standbilder fuers Papier: ${BILDER}`)
}
process.exit(fehler.length === 0 ? 0 : 1)
