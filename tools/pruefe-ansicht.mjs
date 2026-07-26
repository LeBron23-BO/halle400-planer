// Prueft die 2D-Ansicht (T7): passt der GANZE Grundriss ins Bild, und laesst
// er sich zoomen — am Rechner wie am Handy.
//
// Voraussetzung: der Auslieferungs-Server laeuft.
//   node tools/serve-local.mjs --port 3301
//   node tools/pruefe-ansicht.mjs [--port 3301] [--plan halle400]
// Exit 0 = alle Pruefungen bestanden, 1 = mindestens eine durchgefallen.
//
// WARUM DAS NOETIG IST: die Halle ist 78 m lang. Vor T7 war der Massstab eine
// Konstante, wodurch am Rechner nur 38 % und am Handy 10 % der Halle sichtbar
// waren — ohne jede Abhilfe. Ein spaeterer Umbau darf das nicht unbemerkt
// zurueckdrehen.
//
// Playwright liegt nicht im Projekt; Pfad ueber PLAYWRIGHT_PFAD ueberschreibbar.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PW_STANDARD = 'file:///C:/Users/dania/.gemini/node_modules/playwright/index.js'
const { chromium } = (await import(process.env.PLAYWRIGHT_PFAD || PW_STANDARD)).default

const arg = (name, standard) => {
  const i = process.argv.indexOf(name)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : standard
}
const PORT = arg('--port', '3301')
const PLAN = arg('--plan', 'halle400')

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'h400-ansicht-'))
const log = (s) => {
  console.log(s)
  fs.appendFileSync(`${DIR}/bericht.txt`, s + '\n')
}

const L = { zoomIn: 'Näher heran', zoomOut: 'Weiter weg', fit: 'Ganze Halle zeigen' }

/** Oeffnet den 2D-Editor und legt die Messhilfen im Browser bereit. */
async function oeffne(browser, breite, hoehe, mobil) {
  const page = await browser.newPage({
    viewport: { width: breite, height: hoehe },
    hasTouch: mobil,
    isMobile: mobil
  })
  await page.goto(`http://localhost:${PORT}/?plan=${PLAN}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(6000)
  // Der Umschalter ist ein Radix-Switch und steht auf 3D. JS-Klick + Poll:
  // die three.js-rAF-Schleife laesst die Seite nie idle werden.
  await page.evaluate(() => {
    // Die Ansichts-Umschaltung ist seit X3 eine Leiste mit drei Feldern
  // (2D | 3D | Axonometrie) statt eines Schalters: ein Schalter kennt nur zwei
  // Zustaende, und die Axonometrie ist der dritte. Gesucht wird der Knopf mit
  // der Aufschrift "2D" — auf schmalen Anzeigen heisst er genauso.
  ;[...document.querySelectorAll('button')]
    .find((b) => b.textContent.trim() === '2D')
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await page.waitForFunction(
    () => {
      const c = document.getElementById('floorplanner-canvas')
      return !!c && c.offsetParent !== null && c.width > 100
    },
    { timeout: 15000 }
  )
  await page.waitForTimeout(2500)

  await page.evaluate(() => {
    // Umriss des GEZEICHNETEN Inhalts.
    // Der Alpha-Test ist entscheidend: ein Canvas ohne Hintergrund liefert fuer
    // unbemalte Flaechen RGB 0,0,0 bei alpha 0 — ohne ihn waere das Bild per
    // Definition immer randlos voll. Rastergrau (#f1f1f1) und Raumfuellung
    // (#f9f9f9) sind ausgeschlossen, Waende (#dddddd) und Text zaehlen.
    window.__umriss = () => {
      const el = document.getElementById('floorplanner-canvas')
      const d = el.getContext('2d').getImageData(0, 0, el.width, el.height).data
      let minX = 1e9
      let maxX = -1
      let minY = 1e9
      let maxY = -1
      for (let y = 0; y < el.height; y++) {
        for (let x = 0; x < el.width; x++) {
          const i = (y * el.width + x) * 4
          if (d[i + 3] > 10 && (d[i] < 230 || d[i + 1] < 230 || d[i + 2] < 230)) {
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y
          }
        }
      }
      return { cw: el.width, ch: el.height, minX, maxX, minY, maxY }
    }
  })
  return page
}

const klick = (page, label) =>
  page.evaluate(
    (l) =>
      document.querySelector(`[aria-label="${l}"]`)?.dispatchEvent(new MouseEvent('click', { bubbles: true })),
    label
  )

const browser = await chromium.launch()
const pruefungen = []

// --- 1) Passt der ganze Grundriss ins Bild? ---
for (const [name, breite, hoehe, mobil] of [
  ['Rechner', 1440, 900, false],
  ['Handy', 390, 780, true]
]) {
  const page = await oeffne(browser, breite, hoehe, mobil)
  const u = await page.evaluate(() => window.__umriss())
  const luft = {
    links: u.minX,
    rechts: u.cw - 1 - u.maxX,
    oben: u.minY,
    unten: u.ch - 1 - u.maxY
  }
  // Klebt der Inhalt am Rand, ist er abgeschnitten.
  const passt = luft.links >= 3 && luft.rechts >= 3 && luft.oben >= 3 && luft.unten >= 3
  log(
    `${name} ${breite}x${hoehe}: Plan x ${u.minX}..${u.maxX} von ${u.cw}, ` +
      `Luft L/R/O/U = ${luft.links}/${luft.rechts}/${luft.oben}/${luft.unten}`
  )
  pruefungen.push([`${name}: ganzer Grundriss im Bild`, passt])
  await page.screenshot({ path: `${DIR}/einpassen_${name}.png` })
  await page.close()
}

// --- 2) Laesst sich zoomen? ---
// Gemessen wird die HOEHE des Plans, nicht die Breite: die Halle ist 78 m lang
// und laeuft beim Hineinzoomen sofort aus dem Bild — die Breitenmessung
// saettigt dann bei der Fensterbreite und zeigt faelschlich "keine Aenderung".
const page = await oeffne(browser, 1440, 900, true)
const hoehe = async () => {
  const u = await page.evaluate(() => window.__umriss())
  return u.maxY < 0 ? 0 : u.maxY - u.minY
}

const eingepasst = await hoehe()
log(`\neingepasst:        Planhoehe ${eingepasst} px`)

await klick(page, L.zoomIn)
await page.waitForTimeout(250)
await klick(page, L.zoomIn)
await page.waitForTimeout(250)
const nachRein = await hoehe()
log(`2x naeher heran:   Planhoehe ${nachRein} px`)

await klick(page, L.fit)
await page.waitForTimeout(400)
const zurueck = await hoehe()
log(`wieder einpassen:  Planhoehe ${zurueck} px`)

// Dreimal rasten: ein einzelnes Rasten zoomt um 10 % und laege genau auf der
// Nachweisgrenze der auf ganze Pixel gerundeten Messung.
await page.mouse.move(720, 450)
for (let i = 0; i < 3; i++) {
  await page.mouse.wheel(0, -120)
  await page.waitForTimeout(120)
}
await page.waitForTimeout(400)
const nachRad = await hoehe()
log(`Mausrad 3x:        Planhoehe ${nachRad} px`)

await klick(page, L.fit)
await page.waitForTimeout(400)

// Zwei-Finger-Spreizen (die Handy-Geste)
await page.evaluate(() => {
  const el = document.getElementById('floorplanner-canvas')
  const r = el.getBoundingClientRect()
  const t = (id, x, y) => new Touch({ identifier: id, target: el, clientX: r.x + x, clientY: r.y + y })
  const feuer = (typ, punkte) =>
    el.dispatchEvent(
      new TouchEvent(typ, {
        bubbles: true,
        cancelable: true,
        touches: punkte,
        targetTouches: punkte,
        changedTouches: punkte
      })
    )
  feuer('touchstart', [t(1, 600, 450), t(2, 800, 450)])
  for (let i = 1; i <= 5; i++) feuer('touchmove', [t(1, 600 - i * 30, 450), t(2, 800 + i * 30, 450)])
  feuer('touchend', [])
})
await page.waitForTimeout(400)
const nachPinch = await hoehe()
log(`Finger gespreizt:  Planhoehe ${nachPinch} px`)
await page.screenshot({ path: `${DIR}/zoom.png` })

pruefungen.push(
  ['Heranzoomen vergroessert den Plan', nachRein > eingepasst * 1.3],
  ['Einpassen stellt den Ueberblick wieder her', Math.abs(zurueck - eingepasst) < 20],
  ['Mausrad zoomt (3 Rastungen = rund 33 %)', nachRad > eingepasst * 1.2],
  ['Zwei-Finger-Spreizen zoomt', nachPinch > eingepasst * 1.1]
)

log('\n--- URTEIL ---')
let allesGut = true
for (const [name, ok] of pruefungen) {
  log(`${ok ? 'BESTANDEN' : 'DURCHGEFALLEN'}  ${name}`)
  if (!ok) allesGut = false
}
log(`\nGESAMT: ${allesGut ? 'BESTANDEN' : 'DURCHGEFALLEN'}`)
log(`Bericht + Bildschirmfotos: ${DIR}`)

await browser.close()
process.exit(allesGut ? 0 : 1)
