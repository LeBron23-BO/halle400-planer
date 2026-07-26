// Prueft die Ausstattung (A1): wird sie gezeichnet, sitzt sie an der richtigen
// Stelle, und schaltet die Lesbarkeitsstufe mit dem Zoom?
//
// Voraussetzung: der Auslieferungs-Server laeuft.
//   node tools/serve-local.mjs --port 3301
//   node tools/pruefe-ausstattung.mjs [--port 3301] [--plan halle400]
// Exit 0 = alle Pruefungen bestanden, 1 = mindestens eine durchgefallen.
//
// WIE HIER GEMESSEN WIRD — und warum so:
// Die Ausstattung bekommt eine EIGENE Linienfarbe (#8a9099), die sonst nirgends
// im Bild vorkommt: Waende sind #dddddd, Ecken #cccccc, Raster #f1f1f1,
// Raumfuellung #f9f9f9, Beschriftung schwarz. Dadurch laesst sich jedes
// Ausstattungs-Pixel eindeutig von der Bausubstanz trennen — ohne diesen Trick
// koennte man nur "mehr Pixel als vorher" messen, und das beweist nichts ueber
// die Lage.
//
// Der eigentliche Genauigkeits-Beweis ist Pruefung 2: die gezeichnete
// Ausstattung muss in DEMSELBEN Koordinatensystem sitzen wie die Waende. Ein
// Offset, ein Faktor- oder ein Achsentauschfehler wuerde die Zeichen sonst
// plausibel aussehen lassen und trotzdem an die falsche Stelle setzen — genau
// die Klasse Fehler, die dem Projekt schon einmal eine falsche Kalibrierung
// eingetragen hat (docs/plan-befunde.md, Abschnitt 2).
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

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'h400-ausstattung-'))
const log = (s) => {
  console.log(s)
  fs.appendFileSync(`${DIR}/bericht.txt`, s + '\n')
}

const L = { zoomIn: 'Näher heran', fit: 'Ganze Halle zeigen' }

async function oeffne(browser, breite, hoehe, mobil) {
  const page = await browser.newPage({
    viewport: { width: breite, height: hoehe },
    hasTouch: mobil,
    isMobile: mobil
  })
  await page.goto(`http://localhost:${PORT}/?plan=${PLAN}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(6000)
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
    // Trennt Ausstattung (eigene Linienfarbe) von Bausubstanz und liefert
    // beider Umrisse — nur so ist die Lage der einen RELATIV zur anderen
    // pruefbar, unabhaengig von Zoom und Fenstergroesse.
    window.__messe = () => {
      const el = document.getElementById('floorplanner-canvas')
      const d = el.getContext('2d').getImageData(0, 0, el.width, el.height).data
      const nah = (v, soll, tol) => Math.abs(v - soll) <= tol
      let aus = { n: 0, minX: 1e9, maxX: -1, minY: 1e9, maxY: -1, sx: 0, sy: 0, spalten: [] }
      let bau = { n: 0, minX: 1e9, maxX: -1, minY: 1e9, maxY: -1 }
      for (let y = 0; y < el.height; y++) {
        for (let x = 0; x < el.width; x++) {
          const i = (y * el.width + x) * 4
          if (d[i + 3] <= 10) continue
          const r = d[i]
          const g = d[i + 1]
          const b = d[i + 2]
          // Ausstattungslinie #7d8a9c = 125/138/156.
          // Der Blaustich-Test (b - r) ist der eigentliche Trenner: die
          // Wand-Kante #888888 und jedes Antialiasing zwischen Schwarz und
          // Weiss sind NEUTRAL grau (b - r = 0) und fallen dadurch heraus.
          // Ohne ihn zaehlte die Pruefung Waende als Moebel und bestand
          // trotzdem — ein Messfehler, der wie ein Erfolg aussieht.
          if (b - r >= 12 && nah(r, 125, 22) && nah(g, 138, 22) && nah(b, 156, 22)) {
            aus.n++
            aus.sx += x
            aus.sy += y
            if (x < aus.minX) aus.minX = x
            if (x > aus.maxX) aus.maxX = x
            if (y < aus.minY) aus.minY = y
            if (y > aus.maxY) aus.maxY = y
          }
          // Bausubstanz: alles deutlich Dunkle ausser Raster/Raumfuellung
          if (r < 230 || g < 230 || b < 230) {
            bau.n++
            if (x < bau.minX) bau.minX = x
            if (x > bau.maxX) bau.maxX = x
            if (y < bau.minY) bau.minY = y
            if (y > bau.maxY) bau.maxY = y
          }
        }
      }
      if (aus.n > 0) {
        aus.cx = aus.sx / aus.n
        aus.cy = aus.sy / aus.n
      }
      // Wie viele Ausstattungs-Pixel liegen in jedem Zehntel der Bausubstanz?
      // Das ist der Vollstaendigkeits-Nachweis: ein leeres Zehntel bedeutet
      // einen Hallenabschnitt, der nie erfasst wurde — eine Luecke, die eine
      // blosse Gesamtzahl niemals sichtbar machen wuerde.
      const spalten = new Array(10).fill(0)
      if (bau.maxX > bau.minX) {
        for (let y = 0; y < el.height; y++) {
          for (let x = 0; x < el.width; x++) {
            const i = (y * el.width + x) * 4
            if (d[i + 3] <= 10) continue
            const r = d[i]
            const g = d[i + 1]
            const b = d[i + 2]
            if (b - r >= 12 && nah(r, 125, 22) && nah(g, 138, 22) && nah(b, 156, 22)) {
              const k = Math.min(9, Math.max(0, Math.floor(((x - bau.minX) / (bau.maxX - bau.minX)) * 10)))
              spalten[k]++
            }
          }
        }
      }
      aus.spalten = spalten
      return { cw: el.width, ch: el.height, aus, bau }
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

const messe = (page) => page.evaluate(() => window.__messe())

// Nach A2..A4 ist die GANZE Halle erfasst. Der Schwerpunkt muss deshalb
// ungefaehr mittig liegen, und die Zeichen muessen sich ueber nahezu die
// volle Laenge erstrecken.
const SOLL_CX_MIN = 0.35
const SOLL_CX_MAX = 0.65
const SOLL_ABDECKUNG = 0.85

const ergebnisse = []
const pruefe = (name, ok, zusatz = '') => {
  ergebnisse.push({ name, ok })
  log(`${ok ? 'BESTANDEN ' : 'DURCHGEF. '} ${name}${zusatz ? '  ' + zusatz : ''}`)
}

const browser = await chromium.launch()
try {
  // ---- Rechner ---------------------------------------------------------
  const pc = await oeffne(browser, 1440, 900, false)
  await klick(pc, L.fit)
  await pc.waitForTimeout(900)
  const eingepasst = await messe(pc)
  await pc.screenshot({ path: `${DIR}/1-eingepasst.png` })

  const b = eingepasst.bau
  const a = eingepasst.aus
  const relCx = a.n > 0 ? (a.cx - b.minX) / (b.maxX - b.minX) : -1
  log(`eingepasst 1440x900: Ausstattung ${a.n} Pixel, Schwerpunkt x-relativ ${relCx.toFixed(3)}`)
  log(`  Bau-Umriss x ${b.minX}..${b.maxX}, Ausstattung x ${a.minX}..${a.maxX}`)

  pruefe('Ausstattung wird ueberhaupt gezeichnet', a.n > 200, `${a.n} Pixel`)
  pruefe(
    'Ausstattung sitzt im richtigen Laengsabschnitt',
    relCx >= SOLL_CX_MIN && relCx <= SOLL_CX_MAX,
    `${relCx.toFixed(3)} (Soll ${SOLL_CX_MIN}..${SOLL_CX_MAX})`
  )
  // Vollstaendigkeit: die Zeichen muessen fast die ganze Hallenlaenge decken
  // UND in JEDEM Zehntel vorkommen. Eine blosse Gesamtzahl kann gross und
  // trotzdem lueckenhaft sein — 289 Zeichen, alle im selben Drittel, saehen
  // in einer Summe genauso aus wie 289 gleichmaessig verteilte.
  const relMin = a.n > 0 ? (a.minX - b.minX) / (b.maxX - b.minX) : -1
  const relMax = a.n > 0 ? (a.maxX - b.minX) / (b.maxX - b.minX) : -1
  const abdeckung = relMax - relMin
  const leere = a.spalten.map((v, i) => (v === 0 ? i : -1)).filter((i) => i >= 0)
  log(`  Ausstattung x-relativ ${relMin.toFixed(3)}..${relMax.toFixed(3)} (Abdeckung ${(abdeckung * 100).toFixed(0)} %)`)
  log(`  Zeichen je Zehntel: ${a.spalten.join(' · ')}`)
  pruefe(
    'Ausstattung deckt nahezu die ganze Hallenlaenge',
    abdeckung >= SOLL_ABDECKUNG,
    `${(abdeckung * 100).toFixed(0)} % (Soll >= ${SOLL_ABDECKUNG * 100} %)`
  )
  pruefe(
    'Kein Hallenabschnitt ohne Ausstattung',
    leere.length === 0,
    leere.length ? `leere Zehntel: ${leere.join(', ')}` : 'alle 10 Zehntel belegt'
  )
  pruefe(
    'Ausstattung liegt innerhalb der Bausubstanz',
    a.n > 0 && a.minY >= b.minY - 2 && a.maxY <= b.maxY + 2
  )

  // ---- Detailstufe beim Hineinzoomen -----------------------------------
  for (let i = 0; i < 3; i++) {
    await klick(pc, L.zoomIn)
    await pc.waitForTimeout(450)
  }
  const nah = await messe(pc)
  await pc.screenshot({ path: `${DIR}/2-herangezoomt.png` })
  log(`herangezoomt: Ausstattung ${nah.aus.n} Pixel`)
  pruefe(
    'Heranzoomen zeigt mehr Ausstattung (Detailstufe)',
    nah.aus.n > a.n,
    `${a.n} -> ${nah.aus.n} Pixel`
  )
  await pc.close()

  // ---- Handy -----------------------------------------------------------
  const handy = await oeffne(browser, 390, 780, true)
  await klick(handy, L.fit)
  await handy.waitForTimeout(900)
  const mob = await messe(handy)
  await handy.screenshot({ path: `${DIR}/3-handy.png` })
  log(`Handy 390x780 eingepasst: Ausstattung ${mob.aus.n} Pixel`)
  pruefe(
    'Am Handy bleibt die Ausstattung als Umriss sichtbar',
    mob.aus.n > 30,
    `${mob.aus.n} Pixel`
  )
  await handy.close()
} finally {
  await browser.close()
}

log('')
const durch = ergebnisse.filter((e) => !e.ok)
log(durch.length === 0 ? 'GESAMT: BESTANDEN' : `GESAMT: ${durch.length} DURCHGEFALLEN`)
log(`Bericht + Bildschirmfotos: ${DIR}`)
process.exit(durch.length === 0 ? 0 : 1)
