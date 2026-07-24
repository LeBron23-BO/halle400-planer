// T5a-BEWEIS: Rueckgaengig/Wiederholen am gerenderten Canvas.
// Bericht wird INKREMENTELL geschrieben (Lehre 5: ein Fehler im letzten Schritt
// darf nicht alle vorher gewonnenen Befunde loeschen).
import pw from 'file:///C:/Users/dania/.gemini/node_modules/playwright/index.js'
import fs from 'node:fs'
const { chromium } = pw

const DIR = 'C:/Users/dania/AppData/Local/Temp/claude/C--Users-dania/119ad4fd-dc71-4046-a413-07570daacf6c/scratchpad'
const BERICHT = `${DIR}/undo_beweis.txt`
fs.writeFileSync(BERICHT, '')
const log = (s) => { console.log(s); fs.appendFileSync(BERICHT, s + '\n') }

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('console', (m) => { if (m.type() === 'error') log('CONSOLE-ERR: ' + m.text().slice(0, 160)) })
page.on('pageerror', (e) => log('PAGE-ERR: ' + String(e).slice(0, 160)))

await page.goto('http://localhost:3301/?plan=halle400', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)
log('SCHRITT 1: Seite geladen')

// Deutsche Beschriftungen als Unicode-Escapes — so kann kein Encoding-Problem
// den Selektor stillschweigend ins Leere laufen lassen.
const L = {
  loeschen: 'Wände löschen',
  bewegen: 'Wände bewegen',
  undo: 'Rückgängig',
  redo: 'Wiederholen'
}

// --- in den 2D-Editor. Der Umschalter ist ein Radix-Switch (role="switch"),
// aktuell auf 3D. JS-Klick + Poll; page.click laeuft wegen der
// three.js-rAF-Dauerschleife in Timeout, obwohl der Klick wirkt. ---
await page.evaluate(() => {
  document.querySelector('[role="switch"]')?.dispatchEvent(
    new MouseEvent('click', { bubbles: true })
  )
})
await page.waitForFunction(() => {
  const c = document.getElementById('floorplanner-canvas')
  return !!c && c.offsetParent !== null && c.width > 100
}, { timeout: 15000 })
await page.waitForTimeout(1500)
const geo = await page.evaluate(() => {
  const c = document.getElementById('floorplanner-canvas')
  const r = c.getBoundingClientRect()
  return { w: c.width, h: c.height, rx: r.x, ry: r.y, rw: r.width, rh: r.height }
})
log('SCHRITT 2: 2D-Editor offen, Canvas ' + JSON.stringify(geo))

// --- Hilfsfunktionen im Browser-Kontext ---
await page.evaluate(() => {
  const c = () => document.getElementById('floorplanner-canvas')

  // Synthetisches Mausereignis an den Canvas. Der Floorplanner hoert direkt
  // auf mousedown/mousemove/mouseup des Canvas-Elements.
  window.__maus = (typ, x, y) => {
    const el = c()
    const r = el.getBoundingClientRect()
    el.dispatchEvent(
      new MouseEvent(typ, {
        bubbles: true,
        clientX: r.x + x,
        clientY: r.y + y
      })
    )
  }

  // Tinte = Anzahl der Pixel, die nicht der Hintergrund sind.
  // Misst, wieviel gezeichnet ist — Waende, Raeume, Beschriftung.
  window.__tinte = () => {
    const el = c()
    const ctx = el.getContext('2d')
    const d = ctx.getImageData(0, 0, el.width, el.height).data
    let n = 0
    for (let i = 0; i < d.length; i += 4) {
      // Hintergrund ist einfarbig hell; alles deutlich Dunklere zaehlt.
      if (d[i] < 240 || d[i + 1] < 240 || d[i + 2] < 240) n++
    }
    return n
  }

  // Maus aus dem Weg — ein Hover-Highlight wuerde jede Tinten-Messung verfaelschen.
  window.__mausWeg = () => window.__maus('mousemove', 2, 2)
})

const tinte = async () => {
  await page.evaluate(() => window.__mausWeg())
  await page.waitForTimeout(120)
  return page.evaluate(() => window.__tinte())
}

const A = await tinte()
log(`SCHRITT 3: Ausgangs-Tinte A = ${A}`)
await page.screenshot({ path: `${DIR}/beweis_A_start.png` })

// --- eine Wand finden: Hover erzeugt ein Highlight, die Tinte aendert sich ---
const treffer = await page.evaluate((g) => {
  const ruhe = window.__tinte()
  const funde = []
  const schritt = 12
  for (let y = 40; y < g.h - 40 && funde.length < 6; y += schritt) {
    for (let x = 40; x < g.w - 40 && funde.length < 6; x += schritt) {
      window.__maus('mousemove', x, y)
      const t = window.__tinte()
      // Deutliche Aenderung = die Wand unter dem Zeiger wird hervorgehoben.
      if (Math.abs(t - ruhe) > 300) funde.push({ x, y, delta: t - ruhe })
    }
  }
  window.__mausWeg()
  return { ruhe, funde }
}, geo)
log('SCHRITT 4: Wand-Kandidaten (Hover-Highlight) = ' + JSON.stringify(treffer.funde))

if (treffer.funde.length === 0) {
  log('ABBRUCH: keine Wand per Hover gefunden')
  await browser.close()
  process.exit(1)
}
const ziel = treffer.funde[0]

// --- Loeschen ---
await page.evaluate((l) => {
  document.querySelector(`[aria-label="${l.loeschen}"]`)?.dispatchEvent(
    new MouseEvent('click', { bubbles: true })
  )
}, L)
await page.waitForTimeout(400)
await page.evaluate((z) => {
  window.__maus('mousemove', z.x, z.y) // setzt activeWall
  window.__maus('mousedown', z.x, z.y) // loescht im DELETE-Modus
  window.__maus('mouseup', z.x, z.y)
}, ziel)
await page.waitForTimeout(400)
const B = await tinte()
log(`SCHRITT 5: nach LOESCHEN bei (${ziel.x},${ziel.y}) -> Tinte B = ${B}  (Delta zu A: ${B - A})`)
await page.screenshot({ path: `${DIR}/beweis_B_geloescht.png` })

// --- Zustand der Schaltflaechen ---
const knopfZustand = await page.evaluate((l) => ({
  undo: document.querySelector(`[aria-label="${l.undo}"]`)?.disabled,
  redo: document.querySelector(`[aria-label="${l.redo}"]`)?.disabled
}), L)
log('SCHRITT 6: Schaltflaechen nach dem Loeschen (disabled?) = ' + JSON.stringify(knopfZustand))

// --- Rueckgaengig per Schaltflaeche ---
await page.evaluate((l) => {
  document.querySelector(`[aria-label="${l.undo}"]`)?.dispatchEvent(
    new MouseEvent('click', { bubbles: true })
  )
}, L)
await page.waitForTimeout(600)
const C = await tinte()
log(`SCHRITT 7: nach RUECKGAENGIG (Schaltflaeche) -> Tinte C = ${C}  (Abweichung zu A: ${C - A})`)
await page.screenshot({ path: `${DIR}/beweis_C_zurueck.png` })

// --- Wiederholen ---
await page.evaluate((l) => {
  document.querySelector(`[aria-label="${l.redo}"]`)?.dispatchEvent(
    new MouseEvent('click', { bubbles: true })
  )
}, L)
await page.waitForTimeout(600)
const D = await tinte()
log(`SCHRITT 8: nach WIEDERHOLEN -> Tinte D = ${D}  (Abweichung zu B: ${D - B})`)

// --- Rueckgaengig per Tastatur (echte Tasten, nicht synthetisch) ---
await page.keyboard.press('Control+z')
await page.waitForTimeout(600)
const E = await tinte()
log(`SCHRITT 9: nach STRG+Z (Tastatur) -> Tinte E = ${E}  (Abweichung zu A: ${E - A})`)

// --- Ziehen: viele mousemove-Ereignisse muessen EIN Undo-Schritt sein ---
await page.evaluate((l) => {
  document.querySelector(`[aria-label="${l.bewegen}"]`)?.dispatchEvent(
    new MouseEvent('click', { bubbles: true })
  )
}, L)
await page.waitForTimeout(300)
await page.evaluate((z) => {
  window.__maus('mousemove', z.x, z.y)
  window.__maus('mousedown', z.x, z.y)
  for (let i = 1; i <= 25; i++) {
    window.__maus('mousemove', z.x + i * 2, z.y + i * 2) // 25 Bewegungsschritte
  }
  window.__maus('mouseup', z.x + 50, z.y + 50)
}, ziel)
await page.waitForTimeout(500)
const F = await tinte()
log(`SCHRITT 10: nach ZIEHEN (25 Bewegungsschritte) -> Tinte F = ${F}  (Abweichung zu A: ${F - A})`)
await page.screenshot({ path: `${DIR}/beweis_F_gezogen.png` })

await page.keyboard.press('Control+z')
await page.waitForTimeout(600)
const G = await tinte()
log(`SCHRITT 11: EIN Strg+Z nach dem Ziehen -> Tinte G = ${G}  (Abweichung zu A: ${G - A})`)
await page.screenshot({ path: `${DIR}/beweis_G_zug_zurueck.png` })

const nochUndo = await page.evaluate(
  (l) => document.querySelector(`[aria-label="${l.undo}"]`)?.disabled, L
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

await browser.close()
process.exit(allesGut ? 0 : 1)
