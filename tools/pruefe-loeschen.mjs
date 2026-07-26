// Prueft das Loeschen per Verweilen (E1) am GERENDERTEN Canvas — nicht am Code.
//
// Voraussetzung: der Auslieferungs-Server laeuft.
//   node tools/serve-local.mjs --port 3301
//   node tools/pruefe-loeschen.mjs [--port 3301] [--plan halle400]
// Exit 0 = alle Pruefungen bestanden, 1 = mindestens eine durchgefallen.
//
// WAS HIER BEWIESEN WIRD, und warum in dieser Reihenfolge:
//   1. Verweilen ueber einem Objekt bringt die Rueckfrage — und zwar NICHT
//      sofort, sondern erst nach der Wartezeit. Beides wird gemessen: dass sie
//      nach 200 ms noch NICHT da ist, ist genauso wichtig wie dass sie nach
//      900 ms da ist. Ohne die Gegenprobe wuerde ein Skript, das die Rueckfrage
//      versehentlich immer zeigt, ebenfalls bestehen.
//   2. Abbrechen laesst den Bestand unveraendert (Pixel-Tinte identisch).
//   3. Bestaetigen entfernt wirklich etwas (Tinte aendert sich).
//   4. Rueckgaengig stellt den Ausgangszustand wieder her (Abweichung 0).
//
// WARUM PIXEL-TINTE statt einer Zustands-Abfrage: sie misst, was der Nutzer
// WIRKLICH sieht. Eine Abfrage des Modells wuerde auch dann gruen melden, wenn
// die Ansicht das Ergebnis gar nicht neu zeichnet.
//
// FALLE, die hier schon einmal Zeit gekostet hat (A6/T7): ein Gate, das rot
// meldet, ist zuerst ein Verdacht gegen das MESSWERKZEUG. Deshalb prueft
// SCHRITT 4 ausdruecklich, dass ueberhaupt ein Objekt unter dem Zeiger lag —
// ohne Treffer waere jede spaetere Aussage ueber das Loeschen wertlos.
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

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'h400-loeschen-'))
const BERICHT = `${DIR}/bericht.txt`
fs.writeFileSync(BERICHT, '')
const log = (s) => {
  console.log(s)
  fs.appendFileSync(BERICHT, s + '\n')
}

const fehler = []
const pruefe = (bedingung, text) => {
  log(`${bedingung ? 'OK  ' : 'FEHL'} ${text}`)
  if (!bedingung) fehler.push(text)
}

// Beschriftungen der Oberflaeche (Deutsch ist seit T6 die Standardsprache).
const L = {
  loeschen: 'Wände löschen',
  undo: 'Rückgängig'
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

// --- in den 2D-Editor. JS-Klick + Poll statt page.click: die three.js-
// rAF-Schleife laesst die Seite nie idle werden, ein wartender Klick liefe in
// den Timeout, OBWOHL er wirkt. ---
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
await page.waitForTimeout(1500)
const geo = await page.evaluate(() => {
  const c = document.getElementById('floorplanner-canvas')
  return { w: c.width, h: c.height }
})
log('SCHRITT 2: 2D-Editor offen, Canvas ' + JSON.stringify(geo))

// --- Hilfsfunktionen im Browser-Kontext ---
await page.evaluate(() => {
  const c = () => document.getElementById('floorplanner-canvas')

  window.__maus = (typ, x, y) => {
    const el = c()
    const r = el.getBoundingClientRect()
    el.dispatchEvent(new MouseEvent(typ, { bubbles: true, clientX: r.x + x, clientY: r.y + y }))
  }

  // Mass des Bildes: Zahl der bemalten Pixel PLUS deren Schwerpunkt. Die Zahl
  // allein genuegt nicht — ein VERSCHOBENES Objekt ergibt fast dieselbe
  // Pixelzahl. Der Alpha-Test ist noetig, weil ein Canvas ohne Hintergrund fuer
  // unbemalte Flaechen RGB 0,0,0 bei alpha 0 liefert.
  window.__mass = () => {
    const el = c()
    const w = el.width
    const d = el.getContext('2d').getImageData(0, 0, w, el.height).data
    let n = 0
    let sx = 0
    let sy = 0
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 10 && (d[i] < 240 || d[i + 1] < 240 || d[i + 2] < 240)) {
        const p = i / 4
        n++
        sx += p % w
        sy += Math.floor(p / w)
      }
    }
    return n === 0 ? { n: 0, x: 0, y: 0 } : { n, x: sx / n, y: sy / n }
  }

  window.__mausWeg = () => window.__maus('mousemove', 2, 2)

  // NUR die Ausstattungs-Tinte (A1-Verfahren): Linienfarbe #7d8a9c = 125/138/156.
  // Der Blaustich-Test (b - r) ist der eigentliche Trenner — Wandkanten und
  // jedes Antialiasing zwischen Schwarz und Weiss sind NEUTRAL grau (b - r = 0)
  // und fallen heraus. Ohne ihn zaehlte die Pruefung Waende als Moebel und
  // bestuende trotzdem: ein Messfehler, der wie ein Erfolg aussieht.
  window.__moebelTinte = () => {
    const el = c()
    const d = el.getContext('2d').getImageData(0, 0, el.width, el.height).data
    const nah = (v, soll, tol) => Math.abs(v - soll) <= tol
    let n = 0
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] <= 10) continue
      const r = d[i]
      const g = d[i + 1]
      const b = d[i + 2]
      if (b - r >= 12 && nah(r, 125, 22) && nah(g, 138, 22) && nah(b, 156, 22)) n++
    }
    return n
  }

  // Steht die Rueckfrage? Gesucht wird die Rolle, nicht ein Text — so bleibt
  // die Pruefung gueltig, wenn jemand die Formulierung aendert.
  window.__rueckfrage = () => {
    const el = document.querySelector('[role="alertdialog"]')
    return el ? el.innerText.replace(/\s+/g, ' ').trim().slice(0, 120) : null
  }

  window.__knopf = (text) => {
    const b = [...document.querySelectorAll('[role="alertdialog"] button')].find((x) =>
      x.innerText.trim().startsWith(text)
    )
    if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return !!b
  }
})

const mass = async () => {
  await page.evaluate(() => window.__mausWeg())
  await page.waitForTimeout(150)
  return page.evaluate(() => window.__mass())
}
const unterschied = (a, b) => Math.abs(a.n - b.n) + 20 * (Math.abs(a.x - b.x) + Math.abs(a.y - b.y))
const zeig = (m) => `${m.n} Pixel, Schwerpunkt ${m.x.toFixed(1)}/${m.y.toFixed(1)}`

// --- Loeschen-Werkzeug waehlen ---
const werkzeugDa = await page.evaluate((titel) => {
  const b = [...document.querySelectorAll('button')].find(
    (x) => (x.getAttribute('title') || x.innerText || '').includes(titel)
  )
  if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  return !!b
}, L.loeschen)
pruefe(werkzeugDa, `Werkzeug "${L.loeschen}" gefunden und gewaehlt`)
await page.waitForTimeout(400)

const A = await mass()
log(`SCHRITT 3: Ausgangsbild A = ${zeig(A)}`)
await page.screenshot({ path: `${DIR}/A_start.png` })

// --- ein greifbares Objekt suchen: Hover hebt es hervor, die Tinte aendert sich
const treffer = await page.evaluate((g) => {
  const ruhe = window.__mass().n
  const funde = []
  for (let y = 40; y < g.h - 40 && funde.length < 8; y += 10) {
    for (let x = 40; x < g.w - 40 && funde.length < 8; x += 10) {
      window.__maus('mousemove', x, y)
      if (Math.abs(window.__mass().n - ruhe) > 40) funde.push({ x, y })
    }
  }
  window.__mausWeg()
  return funde
}, geo)
pruefe(treffer.length > 0, `SCHRITT 4: greifbares Objekt gefunden (${treffer.length} Kandidaten)`)

if (treffer.length === 0) {
  log('ABBRUCH: ohne Treffer ist jede weitere Aussage ueber das Loeschen wertlos.')
  await browser.close()
  log(`Bericht: ${BERICHT}`)
  process.exit(1)
}

const ziel = treffer[Math.floor(treffer.length / 2)]
log(`SCHRITT 5: Ziel = ${JSON.stringify(ziel)}`)

/** Zeiger auf das Ziel setzen und dort ruhen lassen. */
const verweile = async (ms) => {
  // Zwei Bewegungen: die erste bringt den Zeiger hin (und startet die Uhr),
  // die zweite bleibt INNERHALB der Wackel-Toleranz, damit die Uhr weiterlaeuft.
  await page.evaluate((z) => window.__maus('mousemove', z.x, z.y), ziel)
  await page.waitForTimeout(ms)
}

// --- 6: die Rueckfrage kommt NICHT sofort ---
await verweile(200)
const fruh = await page.evaluate(() => window.__rueckfrage())
pruefe(fruh === null, 'SCHRITT 6: nach 200 ms steht noch KEINE Rueckfrage (kein Sofort-Popup)')

// --- 7: nach der Wartezeit kommt sie ---
await page.waitForTimeout(800)
const spaet = await page.evaluate(() => window.__rueckfrage())
pruefe(spaet !== null, `SCHRITT 7: nach ~1 s steht die Rueckfrage: "${spaet}"`)
await page.screenshot({ path: `${DIR}/B_rueckfrage.png` })

// --- 8: Abbrechen laesst den Bestand unangetastet ---
const abbrechenDa = await page.evaluate(() => window.__knopf('Abbrechen'))
pruefe(abbrechenDa, 'SCHRITT 8: Knopf "Abbrechen" vorhanden')
await page.waitForTimeout(300)
const wegNachAbbruch = await page.evaluate(() => window.__rueckfrage())
pruefe(wegNachAbbruch === null, 'SCHRITT 8: Rueckfrage nach Abbrechen geschlossen')
const B = await mass()
pruefe(
  unterschied(A, B) === 0,
  `SCHRITT 8: Abbrechen hat NICHTS geloescht (Abweichung ${unterschied(A, B).toFixed(1)})`
)

// --- 9: erneut verweilen und diesmal bestaetigen ---
await verweile(1100)
const zweiteRueckfrage = await page.evaluate(() => window.__rueckfrage())
pruefe(zweiteRueckfrage !== null, 'SCHRITT 9: Rueckfrage laesst sich erneut ausloesen')

const entfernenDa = await page.evaluate(() => window.__knopf('Entfernen'))
pruefe(entfernenDa, 'SCHRITT 9: Knopf "Entfernen" vorhanden')
await page.waitForTimeout(400)
const C = await mass()
await page.screenshot({ path: `${DIR}/C_geloescht.png` })
log(`SCHRITT 9: Bild nach dem Loeschen C = ${zeig(C)}`)
pruefe(
  unterschied(A, C) > 0,
  `SCHRITT 9: Bestaetigen hat wirklich etwas entfernt (Abweichung ${unterschied(A, C).toFixed(1)})`
)

// --- 10: Rueckgaengig stellt den Ausgangszustand wieder her ---
const undoDa = await page.evaluate((titel) => {
  const b = [...document.querySelectorAll('button')].find(
    (x) => (x.getAttribute('title') || x.innerText || '').includes(titel)
  )
  if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  return !!b
}, L.undo)
pruefe(undoDa, `SCHRITT 10: Knopf "${L.undo}" gefunden`)
await page.waitForTimeout(600)
const D = await mass()
await page.screenshot({ path: `${DIR}/D_undo.png` })
log(`SCHRITT 10: Bild nach Rueckgaengig D = ${zeig(D)}`)
pruefe(
  unterschied(A, D) === 0,
  `SCHRITT 10: Rueckgaengig stellt A exakt wieder her (Abweichung ${unterschied(A, D).toFixed(1)})`
)

// ---------------------------------------------------------------------------
// TEIL 2: ein MOEBEL loeschen.
//
// Der eigentliche Neubeitrag von E1: vorher war Ausstattung im 2D-Zeichner
// ueberhaupt nicht treffbar (es gab kein `overlappedAusstattung`). Teil 1 hat
// eine WAND geloescht — das konnte der Zeichner im Kern schon.
//
// Hier wird zusaetzlich die RICHTUNG geprueft: die Moebel-Tinte muss SINKEN.
// Teil 1 kann nur "das Bild hat sich geaendert" beweisen (die Pixelzahl stieg
// dort sogar, weil mit der Trennwand zwei Raeume verschmelzen und neu
// beschriftet werden). Eine Aenderung ist noch kein Verschwinden.
// ---------------------------------------------------------------------------

// Heranzoomen: bei eingepasster Halle ist ein 160-cm-Tisch sieben Pixel breit.
// Erst nah genug hat ein einzelnes Moebel genug Tinte, um sein Verschwinden
// messbar zu machen — und erst ab 0,03 px/cm ist es ueberhaupt greifbar.
for (let i = 0; i < 6; i++) {
  await page.evaluate((titel) => {
    const b = [...document.querySelectorAll('button')].find(
      (x) => (x.getAttribute('title') || x.innerText || '').includes(titel)
    )
    if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }, 'Näher heran')
  await page.waitForTimeout(200)
}
await page.waitForTimeout(600)
const moebelVorher = await page.evaluate(() => window.__moebelTinte())
log(`SCHRITT 11: herangezoomt, Moebel-Tinte = ${moebelVorher} Pixel`)
await page.screenshot({ path: `${DIR}/E_nah.png` })
pruefe(moebelVorher > 0, 'SCHRITT 11: nach dem Heranzoomen ist Ausstattung sichtbar')

// --- ein MOEBEL suchen: Kandidaten abklappern, bis die Rueckfrage keine
// Wand und keine Ecke nennt. Die Beschreibung ist die ehrlichste Auskunft
// darueber, was getroffen wurde — sie ist genau der Text, den der Nutzer liest.
let moebelPunkt = null
let moebelText = null
const gitterX = [360, 520, 680, 840, 1000, 1160]
const gitterY = [220, 340, 460, 580, 700]
for (const y of gitterY) {
  for (const x of gitterX) {
    if (moebelPunkt) break
    await page.evaluate(() => window.__mausWeg())
    await page.waitForTimeout(60)
    await page.evaluate((p) => window.__maus('mousemove', p.x, p.y), { x, y })
    await page.waitForTimeout(900)
    const t = await page.evaluate(() => window.__rueckfrage())
    if (t && !t.includes('diese Wand') && !t.includes('diese Ecke')) {
      moebelPunkt = { x, y }
      moebelText = t
    }
    if (t) {
      await page.evaluate(() => window.__knopf('Abbrechen'))
      await page.waitForTimeout(120)
    }
  }
  if (moebelPunkt) break
}

pruefe(moebelPunkt !== null, `SCHRITT 12: ein Moebel gefunden und benannt: "${moebelText}"`)

if (moebelPunkt) {
  // Zeiger WEG, bevor gemessen wird. Steht er ueber dem Moebel, ueberdeckt die
  // rote Markierung genau die blaustichigen Linien, die hier gezaehlt werden —
  // der Ausgangswert faellt dann zu niedrig aus und das Loeschen sieht wie ein
  // Zuwachs aus. (Erst gemessen: 6416 statt 6645.)
  await page.evaluate(() => window.__mausWeg())
  await page.waitForTimeout(250)
  const M0 = await page.evaluate(() => window.__moebelTinte())

  // Erst wegbewegen, dann hin: ohne Ortswechsel startet das Verweilen nicht
  // neu. Das ist so gewollt — sonst spraenge die Rueckfrage nach jedem
  // Abbrechen sofort wieder an derselben Stelle auf.
  await page.evaluate((p) => window.__maus('mousemove', p.x, p.y), moebelPunkt)
  await page.waitForTimeout(1000)
  const steht = await page.evaluate(() => window.__rueckfrage())
  pruefe(steht !== null, 'SCHRITT 13: Rueckfrage zum Moebel steht')
  await page.screenshot({ path: `${DIR}/F_moebel_rueckfrage.png` })

  await page.evaluate(() => window.__knopf('Entfernen'))
  await page.waitForTimeout(500)
  await page.evaluate(() => window.__mausWeg())
  await page.waitForTimeout(200)
  const M1 = await page.evaluate(() => window.__moebelTinte())
  await page.screenshot({ path: `${DIR}/G_moebel_weg.png` })
  log(`SCHRITT 13: Moebel-Tinte vorher ${M0} -> nachher ${M1}`)
  pruefe(M1 < M0, `SCHRITT 13: das Moebel ist WIRKLICH verschwunden (${M0} -> ${M1} Pixel)`)

  // Rueckgaengig muss auch die Ausstattung zurueckholen — sie steckt in
  // saveFloorplan(), aber bewiesen ist das erst hier.
  await page.evaluate((titel) => {
    const b = [...document.querySelectorAll('button')].find(
      (x) => (x.getAttribute('title') || x.innerText || '').includes(titel)
    )
    if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }, L.undo)
  await page.waitForTimeout(700)
  await page.evaluate(() => window.__mausWeg())
  await page.waitForTimeout(200)
  const M2 = await page.evaluate(() => window.__moebelTinte())
  await page.screenshot({ path: `${DIR}/H_moebel_zurueck.png` })
  log(`SCHRITT 14: Moebel-Tinte nach Rueckgaengig = ${M2}`)
  pruefe(M2 === M0, `SCHRITT 14: Rueckgaengig holt das Moebel exakt zurueck (${M2} == ${M0})`)
}

await browser.close()

log('')
log(fehler.length === 0 ? 'ALLE PRUEFUNGEN BESTANDEN' : `DURCHGEFALLEN: ${fehler.length}`)
fehler.forEach((f) => log('  - ' + f))
log(`Bilder + Bericht: ${DIR}`)
process.exit(fehler.length === 0 ? 0 : 1)
