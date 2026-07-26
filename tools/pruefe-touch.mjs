// Prueft die Bedienung AM HANDY (E3) am gerenderten Canvas.
//
// Voraussetzung: der Auslieferungs-Server laeuft.
//   node tools/serve-local.mjs --port 3301
//   node tools/pruefe-touch.mjs [--port 3301] [--plan halle400]
// Exit 0 = alle Pruefungen bestanden, 1 = mindestens eine durchgefallen.
//
// WAS BEWIESEN WIRD:
//   1. LANGDRUCK auf ein Objekt im Loeschen-Werkzeug bringt die Rueckfrage.
//   2. GEGENPROBE kurzes Tippen bringt sie NICHT — sonst waere jede Beruehrung
//      eine Loeschabsicht.
//   3. GEGENPROBE Wischen bringt sie NICHT, auch wenn der Finger lange liegt:
//      wer die Ansicht verschiebt, will nichts loeschen.
//   4. Im Zeichnen-Werkzeug setzen zwei Tipps eine Wand.
//   5. ZWEI Finger verschieben die Ansicht auch dort, wo EIN Finger bearbeitet
//      — ohne das waere der Grundriss am Handy im Zeichnen-Werkzeug
//      unerreichbar, sobald man nicht auf den sichtbaren Ausschnitt zielt.
//
// Echte TouchEvents, kein Maus-Ersatz: der Zeichner unterscheidet die beiden
// Wege ausdruecklich (touchstart ruft preventDefault, gerade damit KEINE
// Maus-Emulation nachkommt). Ein Test mit Maus-Ereignissen wuerde also etwas
// pruefen, das am Handy gar nicht laeuft.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PW_STANDARD = 'file:///C:/Users/dania/.gemini/node_modules/playwright/index.js'
const { chromium, devices } = (await import(process.env.PLAYWRIGHT_PFAD || PW_STANDARD)).default

const arg = (name, standard) => {
  const i = process.argv.indexOf(name)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : standard
}
const PORT = arg('--port', '3301')
const PLAN = arg('--plan', 'halle400')

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'h400-touch-'))
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

const browser = await chromium.launch()
const ctx = await browser.newContext({
  ...devices['Pixel 5'],
  // Der Zeichner braucht Platz; das Pixel-5-Profil bringt Touch + Handy-Groesse.
  viewport: { width: 412, height: 869 },
  hasTouch: true,
  isMobile: true
})
const page = await ctx.newPage()
page.on('pageerror', (e) => log('PAGE-ERR: ' + String(e).slice(0, 160)))

await page.goto(`http://localhost:${PORT}/?plan=${PLAN}`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(7000)
log('SCHRITT 1: Seite am Handy-Format geladen')

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
  { timeout: 20000 }
)
await page.waitForTimeout(2000)
const geo = await page.evaluate(() => {
  const c = document.getElementById('floorplanner-canvas')
  return { w: c.width, h: c.height }
})
log('SCHRITT 2: 2D-Editor offen, Canvas ' + JSON.stringify(geo))

await page.evaluate(() => {
  const c = () => document.getElementById('floorplanner-canvas')

  // ECHTE TouchEvents bauen. `new Touch(...)` verlangt ein target und eine
  // identifier — ohne beides wirft Chromium.
  const punkt = (x, y, id = 1) => {
    const el = c()
    const r = el.getBoundingClientRect()
    return new Touch({
      identifier: id,
      target: el,
      clientX: r.x + x,
      clientY: r.y + y,
      pageX: r.x + x,
      pageY: r.y + y
    })
  }

  window.__finger = (typ, punkte) => {
    const el = c()
    const liste = punkte.map((p, i) => punkt(p.x, p.y, i + 1))
    el.dispatchEvent(
      new TouchEvent(typ, {
        bubbles: true,
        cancelable: true,
        touches: typ === 'touchend' ? [] : liste,
        targetTouches: typ === 'touchend' ? [] : liste,
        changedTouches: liste
      })
    )
  }

  window.__rueckfrage = () => {
    const el = document.querySelector('[role="alertdialog"]')
    return el ? el.innerText.replace(/\s+/g, ' ').trim().slice(0, 90) : null
  }

  window.__knopf = (text) => {
    const b = [...document.querySelectorAll('[role="alertdialog"] button')].find((x) =>
      x.innerText.trim().startsWith(text)
    )
    if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return !!b
  }

  window.__bild = () => {
    const el = c()
    const d = el.getContext('2d').getImageData(0, 0, el.width, el.height).data
    let n = 0
    let sx = 0
    let sy = 0
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 10 && (d[i] < 240 || d[i + 1] < 240 || d[i + 2] < 240)) {
        const p = i / 4
        n++
        sx += p % el.width
        sy += Math.floor(p / el.width)
      }
    }
    return n === 0 ? { n: 0, x: 0, y: 0 } : { n, x: sx / n, y: sy / n }
  }
})

const werkzeug = async (titel) =>
  page.evaluate((t) => {
    const b = [...document.querySelectorAll('button')].find(
      (x) => (x.getAttribute('title') || x.innerText || '').includes(t)
    )
    if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return !!b
  }, titel)

/** Finger aufsetzen, halten, abheben. */
const tippe = async (x, y, halteMs) => {
  await page.evaluate((p) => window.__finger('touchstart', [{ x: p.x, y: p.y }]), { x, y })
  await page.waitForTimeout(halteMs)
  await page.evaluate((p) => window.__finger('touchend', [{ x: p.x, y: p.y }]), { x, y })
  await page.waitForTimeout(250)
}

// ---- Loeschen-Werkzeug ----------------------------------------------------
pruefe(await werkzeug('Wände löschen'), 'SCHRITT 3: Werkzeug "Wände löschen" gewaehlt')
await page.waitForTimeout(500)

// Ein Objekt suchen: der Grundriss fuellt am Handy die Breite; wir tasten eine
// Zeile ab und nehmen den ersten Punkt, an dem ein Langdruck etwas meldet.
let ziel = null
let zielText = null
for (let y = 300; y <= 560 && !ziel; y += 20) {
  for (let x = 40; x <= geo.w - 40 && !ziel; x += 24) {
    await tippe(x, y, 700)
    const t = await page.evaluate(() => window.__rueckfrage())
    if (t) {
      ziel = { x, y }
      zielText = t
      await page.evaluate(() => window.__knopf('Abbrechen'))
      await page.waitForTimeout(150)
    }
  }
}
pruefe(ziel !== null, `SCHRITT 4: LANGDRUCK bringt die Rueckfrage: "${zielText}" bei ${JSON.stringify(ziel)}`)

if (ziel) {
  await page.screenshot({ path: `${DIR}/A_langdruck.png` })

  // ---- GEGENPROBE 1: kurzes Tippen darf nichts ausloesen -------------------
  await tippe(ziel.x, ziel.y, 150)
  const nachKurz = await page.evaluate(() => window.__rueckfrage())
  pruefe(
    nachKurz === null,
    'SCHRITT 5: GEGENPROBE — kurzes Tippen bringt KEINE Rueckfrage'
  )
  if (nachKurz) await page.evaluate(() => window.__knopf('Abbrechen'))

  // ---- GEGENPROBE 2: Wischen darf nichts ausloesen ------------------------
  await page.evaluate((p) => window.__finger('touchstart', [{ x: p.x, y: p.y }]), ziel)
  await page.waitForTimeout(120)
  for (let i = 1; i <= 6; i++) {
    await page.evaluate(
      (p) => window.__finger('touchmove', [{ x: p.x, y: p.y }]),
      { x: ziel.x + i * 12, y: ziel.y }
    )
    await page.waitForTimeout(60)
  }
  await page.waitForTimeout(600) // laenger als der Langdruck
  const nachWisch = await page.evaluate(() => window.__rueckfrage())
  await page.evaluate((p) => window.__finger('touchend', [{ x: p.x, y: p.y }]), ziel)
  await page.waitForTimeout(200)
  pruefe(
    nachWisch === null,
    'SCHRITT 6: GEGENPROBE — Wischen bringt KEINE Rueckfrage (auch wenn der Finger lange liegt)'
  )
  if (nachWisch) await page.evaluate(() => window.__knopf('Abbrechen'))
}

// ---- Zeichnen-Werkzeug: zwei Tipps setzen eine Wand -----------------------
pruefe(await werkzeug('Wände zeichnen'), 'SCHRITT 7: Werkzeug "Wände zeichnen" gewaehlt')
await page.waitForTimeout(400)
const vorZeichnen = await page.evaluate(() => window.__bild())
await tippe(80, 700, 120)
await tippe(330, 700, 120)
// Zug beenden, damit keine Vorschau-Linie die Messung verfaelscht.
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
const nachZeichnen = await page.evaluate(() => window.__bild())
await page.screenshot({ path: `${DIR}/B_getippt.png` })
const dTinte = Math.abs(nachZeichnen.n - vorZeichnen.n)
log(`SCHRITT 8: Tinte ${vorZeichnen.n} -> ${nachZeichnen.n} (Unterschied ${dTinte})`)
pruefe(dTinte > 50, `SCHRITT 8: zwei Tipps setzen eine Wand (Tinte-Unterschied ${dTinte})`)

// ---- ZWEI Finger verschieben die Ansicht, auch im Zeichnen-Werkzeug -------
await werkzeug('Wände zeichnen')
await page.waitForTimeout(300)
const vorSchub = await page.evaluate(() => window.__bild())
await page.evaluate(() =>
  window.__finger('touchstart', [
    { x: 120, y: 400 },
    { x: 260, y: 400 }
  ])
)
await page.waitForTimeout(120)
for (let i = 1; i <= 6; i++) {
  await page.evaluate(
    (d) =>
      window.__finger('touchmove', [
        { x: 120 + d, y: 400 },
        { x: 260 + d, y: 400 }
      ]),
    i * 14
  )
  await page.waitForTimeout(60)
}
await page.evaluate(() => window.__finger('touchend', [{ x: 200, y: 400 }]))
await page.waitForTimeout(400)
const nachSchub = await page.evaluate(() => window.__bild())
await page.screenshot({ path: `${DIR}/C_zweifinger.png` })
const versatz = Math.abs(nachSchub.x - vorSchub.x)
log(`SCHRITT 9: Schwerpunkt x ${vorSchub.x.toFixed(1)} -> ${nachSchub.x.toFixed(1)} (Versatz ${versatz.toFixed(1)})`)
pruefe(
  versatz > 8,
  `SCHRITT 9: ZWEI Finger verschieben die Ansicht auch im Zeichnen-Werkzeug (Versatz ${versatz.toFixed(1)} px)`
)

await browser.close()
log('')
log(fehler.length === 0 ? 'ALLE PRUEFUNGEN BESTANDEN' : `DURCHGEFALLEN: ${fehler.length}`)
fehler.forEach((f) => log('  - ' + f))
log(`Bilder + Bericht: ${DIR}`)
process.exit(fehler.length === 0 ? 0 : 1)
