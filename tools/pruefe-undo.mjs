// Prueft Rueckgaengig/Wiederholen (T5a) am GERENDERTEN Canvas — nicht am Code.
//
// Voraussetzung: der Auslieferungs-Server laeuft.
//   node tools/serve-local.mjs --port 3301
//   node tools/pruefe-undo.mjs [--port 3301] [--plan halle400]
// Exit 0 = alle Pruefungen bestanden, 1 = mindestens eine durchgefallen.
//
// WARUM PIXEL-TINTE statt einer Zustands-Abfrage: sie misst, was der Nutzer
// WIRKLICH sieht. Dass die Wiederherstellung auf Abweichung 0 landet, beweist
// zugleich, dass die Ansicht nicht gesprungen ist — ein verschobener Ausschnitt
// ergaebe bei identischer Geometrie ein anderes Bild.
//
// Der Bericht wird INKREMENTELL geschrieben: ein Fehler im letzten Schritt darf
// die vorher gewonnenen Befunde nicht mitreissen.
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

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'h400-undo-'))
const BERICHT = `${DIR}/bericht.txt`
fs.writeFileSync(BERICHT, '')
const log = (s) => {
  console.log(s)
  fs.appendFileSync(BERICHT, s + '\n')
}

// Beschriftungen der Oberflaeche (Deutsch ist seit T6 die Standardsprache).
const L = {
  loeschen: 'Wände löschen',
  bewegen: 'Wände bewegen',
  undo: 'Rückgängig',
  redo: 'Wiederholen'
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('console', (m) => {
  if (m.type() === 'error') log('CONSOLE-ERR: ' + m.text().slice(0, 160))
})
page.on('pageerror', (e) => log('PAGE-ERR: ' + String(e).slice(0, 160)))

await page.goto(`http://localhost:${PORT}/?plan=${PLAN}`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)
log('SCHRITT 1: Seite geladen')

// --- in den 2D-Editor. Der Umschalter ist ein Radix-Switch (role="switch"),
// er steht auf 3D. JS-Klick + Poll statt page.click: die three.js-rAF-Schleife
// laesst die Seite nie idle werden, ein wartender Klick liefe in den Timeout,
// OBWOHL er wirkt. ---
await page.evaluate(() => {
  document.querySelector('[role="switch"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
})
await page.waitForFunction(
  () => {
    const c = document.getElementById('floorplanner-canvas')
    return !!c && c.offsetParent !== null && c.width > 100
  },
  { timeout: 15000 }
)
await page.waitForTimeout(1500)
const geo = await page.evaluate(() => {
  const c = document.getElementById('floorplanner-canvas')
  return { w: c.width, h: c.height }
})
log('SCHRITT 2: 2D-Editor offen, Canvas ' + JSON.stringify(geo))

// --- Hilfsfunktionen im Browser-Kontext ---
await page.evaluate(() => {
  const c = () => document.getElementById('floorplanner-canvas')

  // Der Floorplanner hoert direkt auf mousedown/mousemove/mouseup des Canvas.
  window.__maus = (typ, x, y) => {
    const el = c()
    const r = el.getBoundingClientRect()
    el.dispatchEvent(new MouseEvent(typ, { bubbles: true, clientX: r.x + x, clientY: r.y + y }))
  }

  // Tinte = Zahl der Pixel, die nicht Hintergrund sind: wieviel ist gezeichnet.
  window.__tinte = () => {
    const el = c()
    const d = el.getContext('2d').getImageData(0, 0, el.width, el.height).data
    let n = 0
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] < 240 || d[i + 1] < 240 || d[i + 2] < 240) n++
    }
    return n
  }

  // Zeiger aus dem Weg — ein Hover-Highlight verfaelscht jede Messung.
  window.__mausWeg = () => window.__maus('mousemove', 2, 2)
})

const tinte = async () => {
  await page.evaluate(() => window.__mausWeg())
  await page.waitForTimeout(120)
  return page.evaluate(() => window.__tinte())
}

const A = await tinte()
log(`SCHRITT 3: Ausgangs-Tinte A = ${A}`)
await page.screenshot({ path: `${DIR}/A_start.png` })

// --- eine Wand finden: Hover hebt sie hervor, die Tinte aendert sich ---
const treffer = await page.evaluate((g) => {
  const ruhe = window.__tinte()
  const funde = []
  for (let y = 40; y < g.h - 40 && funde.length < 6; y += 12) {
    for (let x = 40; x < g.w - 40 && funde.length < 6; x += 12) {
      window.__maus('mousemove', x, y)
      if (Math.abs(window.__tinte() - ruhe) > 300) funde.push({ x, y })
    }
  }
  window.__mausWeg()
  return funde
}, geo)
log('SCHRITT 4: Wand-Kandidaten (Hover-Highlight) = ' + JSON.stringify(treffer))

if (treffer.length === 0) {
  log('ABBRUCH: keine Wand per Hover gefunden')
  await browser.close()
  process.exit(1)
}
const ziel = treffer[0]

const klick = (label) =>
  page.evaluate(
    (l) =>
      document.querySelector(`[aria-label="${l}"]`)?.dispatchEvent(new MouseEvent('click', { bubbles: true })),
    label
  )

// --- Loeschen ---
await klick(L.loeschen)
await page.waitForTimeout(400)
await page.evaluate((z) => {
  window.__maus('mousemove', z.x, z.y) // setzt activeWall
  window.__maus('mousedown', z.x, z.y) // loescht im DELETE-Modus
  window.__maus('mouseup', z.x, z.y)
}, ziel)
await page.waitForTimeout(400)
const B = await tinte()
log(`SCHRITT 5: nach LOESCHEN bei (${ziel.x},${ziel.y}) -> Tinte B = ${B}  (Delta zu A: ${B - A})`)
await page.screenshot({ path: `${DIR}/B_geloescht.png` })

const knopfZustand = await page.evaluate(
  (l) => ({
    undo: document.querySelector(`[aria-label="${l.undo}"]`)?.disabled,
    redo: document.querySelector(`[aria-label="${l.redo}"]`)?.disabled
  }),
  L
)
log('SCHRITT 6: Schaltflaechen nach dem Loeschen (ausgegraut?) = ' + JSON.stringify(knopfZustand))

// --- Rueckgaengig per Schaltflaeche ---
await klick(L.undo)
await page.waitForTimeout(600)
const C = await tinte()
log(`SCHRITT 7: nach RUECKGAENGIG (Schaltflaeche) -> Tinte C = ${C}  (Abweichung zu A: ${C - A})`)
await page.screenshot({ path: `${DIR}/C_zurueck.png` })

// --- Wiederholen ---
await klick(L.redo)
await page.waitForTimeout(600)
const D = await tinte()
log(`SCHRITT 8: nach WIEDERHOLEN -> Tinte D = ${D}  (Abweichung zu B: ${D - B})`)

// --- Rueckgaengig per Tastatur (echte Tasten) ---
await page.keyboard.press('Control+z')
await page.waitForTimeout(600)
const E = await tinte()
log(`SCHRITT 9: nach STRG+Z (Tastatur) -> Tinte E = ${E}  (Abweichung zu A: ${E - A})`)

// --- Ziehen: viele Bewegungen muessen EIN Undo-Schritt sein ---
await klick(L.bewegen)
await page.waitForTimeout(300)
await page.evaluate((z) => {
  window.__maus('mousemove', z.x, z.y)
  window.__maus('mousedown', z.x, z.y)
  for (let i = 1; i <= 25; i++) window.__maus('mousemove', z.x + i * 2, z.y + i * 2)
  window.__maus('mouseup', z.x + 50, z.y + 50)
}, ziel)
await page.waitForTimeout(500)
const F = await tinte()
log(`SCHRITT 10: nach ZIEHEN (25 Bewegungsschritte) -> Tinte F = ${F}  (Abweichung zu A: ${F - A})`)
await page.screenshot({ path: `${DIR}/F_gezogen.png` })

await page.keyboard.press('Control+z')
await page.waitForTimeout(600)
const G = await tinte()
log(`SCHRITT 11: EIN Strg+Z nach dem Ziehen -> Tinte G = ${G}  (Abweichung zu A: ${G - A})`)
await page.screenshot({ path: `${DIR}/G_zug_zurueck.png` })

const nochUndo = await page.evaluate(
  (l) => document.querySelector(`[aria-label="${l.undo}"]`)?.disabled,
  L
)
log(`SCHRITT 12: Rueckgaengig jetzt ausgegraut (Historie leer)? = ${nochUndo}`)

// --- Urteil ---
const tol = Math.max(200, Math.round(A * 0.002))
const pruefungen = [
  ['Loeschen veraendert das Bild', Math.abs(B - A) > tol],
  ['Rueckgaengig stellt exakt den Ausgangszustand her', Math.abs(C - A) <= tol],
  ['Wiederholen stellt den geloeschten Zustand her', Math.abs(D - B) <= tol],
  ['Strg+Z wirkt wie die Schaltflaeche', Math.abs(E - A) <= tol],
  ['Ziehen veraendert das Bild', Math.abs(F - A) > tol],
  ['EIN Strg+Z nimmt das ganze Ziehen zurueck', Math.abs(G - A) <= tol],
  ['Historie ist danach leer (Schaltflaeche aus)', nochUndo === true]
]
log(`\n--- URTEIL (Toleranz ${tol} Pixel) ---`)
let allesGut = true
for (const [name, ok] of pruefungen) {
  log(`${ok ? 'BESTANDEN' : 'DURCHGEFALLEN'}  ${name}`)
  if (!ok) allesGut = false
}
log(`\nGESAMT: ${allesGut ? 'BESTANDEN' : 'DURCHGEFALLEN'}`)
log(`Bericht + Bildschirmfotos: ${DIR}`)

await browser.close()
process.exit(allesGut ? 0 : 1)
