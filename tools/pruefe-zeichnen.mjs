// Prueft das Wand-Zeichnen (E2) am GERENDERTEN Canvas — nicht am Code.
//
// Voraussetzung: der Auslieferungs-Server laeuft.
//   node tools/serve-local.mjs --port 3301
//   node tools/pruefe-zeichnen.mjs [--port 3301] [--plan halle400]
// Exit 0 = alle Pruefungen bestanden, 1 = mindestens eine durchgefallen.
//
// WAS BEWIESEN WIRD:
//   1. Zeichnen erzeugt ueberhaupt eine Wand (das Bild aendert sich).
//   2. Eine LEICHT schraege Strecke (3°) rastet auf die Waagerechte ein.
//   3. GEGENPROBE: eine DEUTLICH schraege Strecke (20°) bleibt schraeg.
//      Ohne diese Gegenprobe bestuende auch eine Fassung, die stumpf jede
//      Wand waagerecht macht — und die waere schlimmer als gar kein Einrasten,
//      weil sich keine schraege Wand mehr zeichnen liesse.
//   4. Escape beendet den Streckenzug, ohne das Werkzeug wegzunehmen.
//
// WIE die Neigung gemessen wird: aus dem DIFFERENZBILD (nachher minus vorher)
// werden nur die neu hinzugekommenen Pixel genommen. Deren Hoehenausdehnung im
// mittleren Drittel der Strecke ist das Mass — die Enden bleiben aussen vor,
// weil dort Eckpunkte und Massangaben sitzen, die die Box aufblaehen wuerden.
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

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'h400-zeichnen-'))
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

const L = { zeichnen: 'Wände zeichnen', undo: 'Rückgängig' }

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('console', (m) => {
  if (m.type() === 'error') log('CONSOLE-ERR: ' + m.text().slice(0, 160))
})
page.on('pageerror', (e) => log('PAGE-ERR: ' + String(e).slice(0, 160)))

await page.goto(`http://localhost:${PORT}/?plan=${PLAN}`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)
log('SCHRITT 1: Seite geladen')

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
log('SCHRITT 2: 2D-Editor offen')

await page.evaluate(() => {
  const c = () => document.getElementById('floorplanner-canvas')
  window.__maus = (typ, x, y) => {
    const el = c()
    const r = el.getBoundingClientRect()
    el.dispatchEvent(new MouseEvent(typ, { bubbles: true, clientX: r.x + x, clientY: r.y + y }))
  }
  window.__mausWeg = () => window.__maus('mousemove', 2, 2)

  // Rohbild als Zahlenfolge — fuer den Vorher/Nachher-Vergleich.
  window.__bild = () => {
    const el = c()
    const d = el.getContext('2d').getImageData(0, 0, el.width, el.height)
    // Nur ein Graustufen-Abzug: das spart Speicher und reicht, um NEUE Tinte
    // zu erkennen.
    const g = new Uint8Array(el.width * el.height)
    for (let i = 0, p = 0; i < d.data.length; i += 4, p++) {
      g[p] = d.data[i + 3] > 10 ? (d.data[i] + d.data[i + 1] + d.data[i + 2]) / 3 : 255
    }
    return { w: el.width, h: el.height, g: Array.from(g) }
  }
})

/**
 * Wo liegt die neue Tinte? Vergleicht zwei Abzuege und liefert die
 * Hoehenausdehnung im MITTLEREN Drittel zwischen zwei x-Grenzen.
 */
const neueTinte = (vorher, nachher, x1, x2) => {
  const w = vorher.w
  const von = Math.round(x1 + (x2 - x1) * 0.35)
  const bis = Math.round(x1 + (x2 - x1) * 0.65)
  let minY = 1e9
  let maxY = -1
  let n = 0
  for (let y = 0; y < vorher.h; y++) {
    for (let x = von; x <= bis; x++) {
      const p = y * w + x
      // "neu dunkel geworden": vorher hell, jetzt deutlich dunkler
      if (vorher.g[p] - nachher.g[p] > 40) {
        n++
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  return { n, minY, maxY, hoehe: n === 0 ? -1 : maxY - minY }
}

const werkzeug = async (titel) =>
  page.evaluate((t) => {
    const b = [...document.querySelectorAll('button')].find(
      (x) => (x.getAttribute('title') || x.innerText || '').includes(t)
    )
    if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return !!b
  }, titel)

/**
 * Zieht einen Streckenzug: setzt Punkt A, faehrt nach B, setzt Punkt B.
 * Der Zeichner setzt den Punkt auf mouseup OHNE Bewegung dazwischen — deshalb
 * ist jeder Punkt ein eigenes down/up, und die Fahrt liegt dazwischen.
 */
const ziehe = async (ax, ay, bx, by) => {
  await page.evaluate((p) => {
    window.__maus('mousemove', p.ax, p.ay)
    window.__maus('mousedown', p.ax, p.ay)
    window.__maus('mouseup', p.ax, p.ay)
  }, { ax, ay })
  await page.waitForTimeout(250)
  // Fahrt in Schritten, damit updateTarget wirklich laeuft (und die
  // Live-Laenge gezeichnet wird).
  await page.evaluate((p) => {
    for (let i = 1; i <= 12; i++) {
      window.__maus('mousemove', p.ax + ((p.bx - p.ax) * i) / 12, p.ay + ((p.by - p.ay) * i) / 12)
    }
  }, { ax, ay, bx, by })
  await page.waitForTimeout(250)
  await page.evaluate((p) => {
    window.__maus('mousedown', p.bx, p.by)
    window.__maus('mouseup', p.bx, p.by)
  }, { bx, by })
  await page.waitForTimeout(350)
}

const zeichenModus = await werkzeug(L.zeichnen)
pruefe(zeichenModus, `SCHRITT 3: Werkzeug "${L.zeichnen}" gewaehlt`)
await page.waitForTimeout(400)

// --- Leere Flaeche suchen: unterhalb des Grundrisses ist Platz (die Halle
// liegt im oberen Bereich, darunter ist Rand). Wir zeichnen im unteren Drittel.
const YBASIS = 760
const XA = 300
const XB = 900

// ---- 4: eine LEICHT schraege Strecke (3°) muss einrasten ------------------
const vor1 = await page.evaluate(() => window.__bild())
const dy3 = Math.round((XB - XA) * Math.tan((3 * Math.PI) / 180)) // ~31 px
await ziehe(XA, YBASIS, XB, YBASIS + dy3)
// Streckenzug BEENDEN, bevor gemessen wird. Sonst zieht der Zeichner weiter
// eine Vorschau-Linie vom letzten Punkt zum Zeiger — und `__mausWeg` schiebt
// den in die Ecke (2,2), was eine Diagonale quer durch das ganze Bild ergibt.
// Erst gemessen: 398 px "Wandhoehe", in Wahrheit die Vorschau.
await page.keyboard.press('Escape')
await page.waitForTimeout(200)
await page.evaluate(() => window.__mausWeg())
await page.waitForTimeout(250)
const nach1 = await page.evaluate(() => window.__bild())
await page.screenshot({ path: `${DIR}/A_3grad.png` })
const t1 = neueTinte(vor1, nach1, XA, XB)
log(`SCHRITT 4: 3°-Strecke (Ziel-Versatz ${dy3} px) -> neue Tinte ${t1.n} Pixel, Hoehe ${t1.hoehe} px`)
pruefe(t1.n > 0, 'SCHRITT 4: Zeichnen erzeugt ueberhaupt eine Wand')
// Waagerecht: die Hoehe im mittleren Drittel entspricht der Wandstaerke,
// nicht dem Versatz. Grosszuegig 12 px, der Versatz waere 31/3*... deutlich mehr.
pruefe(
  t1.hoehe >= 0 && t1.hoehe < 14,
  `SCHRITT 4: 3° rastet auf die WAAGERECHTE ein (Hoehe ${t1.hoehe} px < 14)`
)

// zuruecknehmen (der Zug ist oben schon per Escape beendet)
for (let i = 0; i < 2; i++) {
  await werkzeug(L.undo)
  await page.waitForTimeout(400)
}

// ---- 5: GEGENPROBE — 20° darf NICHT einrasten -----------------------------
await werkzeug(L.zeichnen)
await page.waitForTimeout(300)
const vor2 = await page.evaluate(() => window.__bild())
const dy20 = Math.round((XB - XA) * Math.tan((20 * Math.PI) / 180)) // ~218 px
await ziehe(XA, YBASIS - 220, XB, YBASIS - 220 + dy20)
// Streckenzug BEENDEN, bevor gemessen wird. Sonst zieht der Zeichner weiter
// eine Vorschau-Linie vom letzten Punkt zum Zeiger — und `__mausWeg` schiebt
// den in die Ecke (2,2), was eine Diagonale quer durch das ganze Bild ergibt.
// Erst gemessen: 398 px "Wandhoehe", in Wahrheit die Vorschau.
await page.keyboard.press('Escape')
await page.waitForTimeout(200)
await page.evaluate(() => window.__mausWeg())
await page.waitForTimeout(250)
const nach2 = await page.evaluate(() => window.__bild())
await page.screenshot({ path: `${DIR}/B_20grad.png` })
const t2 = neueTinte(vor2, nach2, XA, XB)
log(`SCHRITT 5: 20°-Strecke (Ziel-Versatz ${dy20} px) -> neue Tinte ${t2.n} Pixel, Hoehe ${t2.hoehe} px`)
pruefe(
  t2.hoehe > 40,
  `SCHRITT 5: GEGENPROBE — 20° bleibt SCHRAEG (Hoehe ${t2.hoehe} px > 40), es wird nicht stumpf alles begradigt`
)

// ---- 6+7: Escape — ZWEI Stufen, beide mit messbarer Wirkung ---------------
//
// Der naheliegende Test waere "ist das Werkzeug nach Escape noch gewaehlt?" —
// der besteht aber auch, wenn Escape gar nichts tut. Deshalb wird die erste
// Stufe am BILD gemessen: solange ein Zug laeuft, zieht der Zeichner eine
// Vorschau-Linie zum Zeiger. Verschwindet sie, ist der Zug wirklich beendet.

const knopfFarbe = () =>
  page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) =>
      (x.getAttribute('title') || x.innerText || '').includes('Wände zeichnen')
    )
    return b ? getComputedStyle(b).backgroundColor : null
  })

await werkzeug(L.zeichnen)
await page.waitForTimeout(300)
const farbeAktiv = await knopfFarbe()

// einen Punkt setzen und den Zeiger weit wegfahren -> lange Vorschau-Linie
await page.evaluate(() => {
  window.__maus('mousemove', 400, 700)
  window.__maus('mousedown', 400, 700)
  window.__maus('mouseup', 400, 700)
})
await page.waitForTimeout(250)
await page.evaluate(() => window.__maus('mousemove', 1100, 300))
await page.waitForTimeout(250)
const mitVorschau = await page.evaluate(() => window.__bild())
await page.screenshot({ path: `${DIR}/C_vorschau.png` })

await page.keyboard.press('Escape')
await page.waitForTimeout(350)
// Zeiger an dieselbe Stelle: waere der Zug NICHT beendet, entstuende die
// Vorschau-Linie sofort neu und der Unterschied bliebe klein.
await page.evaluate(() => window.__maus('mousemove', 1100, 300))
await page.waitForTimeout(250)
const ohneVorschau = await page.evaluate(() => window.__bild())
await page.screenshot({ path: `${DIR}/D_nach_escape.png` })

let verschwunden = 0
for (let p = 0; p < mitVorschau.g.length; p++) {
  if (ohneVorschau.g[p] - mitVorschau.g[p] > 40) verschwunden++
}
log(`SCHRITT 6: nach Escape verschwundene Tinte = ${verschwunden} Pixel`)
pruefe(verschwunden > 300, `SCHRITT 6: Escape beendet den Zug — die Vorschau-Linie ist weg (${verschwunden} Pixel)`)

const farbeNachErstem = await knopfFarbe()
pruefe(
  farbeNachErstem === farbeAktiv,
  `SCHRITT 6: das Werkzeug bleibt dabei gewaehlt (${farbeNachErstem})`
)

await page.keyboard.press('Escape')
// Auf den ZUSTAND warten statt auf eine Frist von 400 ms. Laeuft die Frist
// hier ab, bleibt die Farbe die alte und die Pruefung darunter wird rot — das
// Gate wird durch das Warten also nicht weicher.
//
// EHRLICHER BEFUND (2026-07-26, gemessen mit je drei Laeufen): Dieser Schritt
// ist WACKELIG und war es schon vorher. Am Stand 0758d28 — vor der
// Axonometrie, in einem eigenen Arbeitsbaum gebaut und gemessen — bestand er
// ebenfalls nur zwei von drei Malen, mit genau derselben Meldung. Das laengere
// Warten hat daran nichts geaendert; die Ursache liegt also NICHT im Timing der
// Anzeige, sondern darin, dass das zweite Escape gelegentlich nicht ankommt
// oder nicht wirkt. Das ist ein offener Punkt an E2, kein Testfehler und keine
// Folge der Axonometrie. Wer ihn angeht, sucht in
// src/floorplanner/floorplanner.ts:506-520.
await page
  .waitForFunction(
    (aktiv) => {
      const b = [...document.querySelectorAll('button')].find((x) =>
        (x.getAttribute('title') || x.innerText || '').includes('Wände zeichnen')
      )
      return !!b && getComputedStyle(b).backgroundColor !== aktiv
    },
    farbeAktiv,
    { timeout: 5000 }
  )
  .catch(() => {})
const farbeNachZweitem = await knopfFarbe()
log(`SCHRITT 7: Knopffarbe aktiv=${farbeAktiv} -> nach zweitem Escape=${farbeNachZweitem}`)
pruefe(
  farbeNachZweitem !== null && farbeNachZweitem !== farbeAktiv,
  'SCHRITT 7: ein zweites Escape legt das Werkzeug zurueck (Leiste zeigt es an)'
)

await browser.close()
log('')
log(fehler.length === 0 ? 'ALLE PRUEFUNGEN BESTANDEN' : `DURCHGEFALLEN: ${fehler.length}`)
fehler.forEach((f) => log('  - ' + f))
log(`Bilder + Bericht: ${DIR}`)
process.exit(fehler.length === 0 ? 0 : 1)
