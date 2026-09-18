// Prueft die Fassung OHNE BEDIENUNG (--nur-modell) — die Datei fuer die Bank,
// in der es nichts zu klicken gibt.
//
//   node tools/baue-planer-datei.mjs --plan hotel400 --nur-modell //        --ziel Hotel400-fuer-die-Bank-nur-Modell.html ...
//   node tools/pruefe-nur-modell.mjs [--datei <name>] [--bilder <ordner>]
// Exit 0 = alle Pruefungen bestanden, 1 = mindestens eine durchgefallen.
//
// VIER BEHAUPTUNGEN, die hier bewiesen werden:
//
//   1) Die Datei oeffnet unter file:// mit HART gesperrtem Netz (alles ausser
//      file:/data:/blob: wird abgebrochen) und meldet keinen einzigen Fehler.
//   2) Es gibt NICHTS zum Anklicken. Gezaehlt wird nicht die Absicht, sondern
//      das Ergebnis: 0 Schaltflaechen, 0 Eingabefelder, 0 Leisten, 0 Menues —
//      und danach zwoelf ECHTE Klicks ueber die ganze Flaeche, nach denen der
//      DOM derselbe ist.
//   3) Das Modell laesst sich weiter DREHEN und ZOOMEN. Ein 3D-Modell, das man
//      nicht drehen kann, ist ein Bild — gemessen am Blickwinkel UND an der
//      Zahl geaenderter Bildpunkte, nicht per Augenschein.
//   4) Ein Standbild der Startansicht wird abgelegt.
//
// WARUM `page.mouse.click` UND NICHT `dispatchEvent`: `dispatchEvent` ruft die
// Zuhoerer eines Elements direkt auf und fragt nie, ob dieses Element ueberhaupt
// getroffen werden kann (s. „Die Haertung", W6). Fuer die Frage „reagiert hier
// irgendetwas auf eine Hand?" ist genau das die falsche Messgroesse.
//
// WARUM ZWEI ZAHLEN BEIM DOM-VERGLEICH: `classList.add('zieht')` beim Druecken
// und `remove` beim Loslassen hinterlassen am Canvas ein LEERES `class=""`.
// Das ist die Spur der Dreh-Geste und kein Zustand — deshalb wird beides
// gezaehlt und beides genannt: der volle Unterschied und der Zustands-
// Unterschied. Nur den bequemeren zu melden waere eine halbe Messung.
import fs from 'node:fs'
import os from 'node:os'
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
const DATEI = path.resolve(WURZEL, arg('--datei', 'Hotel400-fuer-die-Bank-nur-Modell.html'))
const AUS = arg('--bilder', fs.mkdtempSync(path.join(os.tmpdir(), 'h400-nur-modell-')))
if (!fs.existsSync(DATEI)) {
  console.error(`Die Datei fehlt (${DATEI}) — erst "node tools/baue-planer-datei.mjs ... --nur-modell".`)
  process.exit(1)
}

const fehler = []
const pruefe = (b, t) => { console.log(`${b ? 'OK  ' : 'FEHL'} ${t}`); if (!b) fehler.push(t) }

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } })

// ── HARTE NETZSPERRE: alles ausser file:/data:/blob: wird abgebrochen ──────
const blockiert = []
await ctx.route('**/*', (route) => {
  const url = route.request().url()
  if (url.startsWith('file://') || url.startsWith('data:') || url.startsWith('blob:')) return route.continue()
  blockiert.push(url)
  return route.abort()
})

const konsole = []
const page = await ctx.newPage()
page.on('console', (m) => { if (m.type() === 'error') konsole.push(m.text().slice(0, 200)) })
page.on('pageerror', (e) => konsole.push('PAGE-ERR: ' + String(e).slice(0, 200)))
page.on('requestfailed', (r) => { if (!r.url().startsWith('file://')) konsole.push('NETZ: ' + r.url().slice(0, 120)) })

await page.goto(pathToFileURL(DATEI).href)
await page.waitForFunction(() => window.__bereit === true, { timeout: 30000 })
// Das Siegel wird ASYNCHRON geprueft und schreibt danach in den Blattkopf.
// Ohne diese Ruhe waere jeder spaetere Unterschied ein Siegel-Nachtrag und
// kein Klick-Effekt — die Messung misst sonst sich selbst.
await page.waitForTimeout(2500)

pruefe(konsole.length === 0, `1) keine Konsolen-/Seitenfehler (${konsole.length})${konsole.length ? ' :: ' + konsole.join(' | ') : ''}`)
pruefe(blockiert.length === 0, `1) keine Anfrage nach draussen (${blockiert.length} blockiert)`)

// ── 4) Standbild der Startansicht ─────────────────────────────────────────
await page.screenshot({ path: path.join(AUS, 'start.png') })

// ── Bestandsaufnahme: was steht ueberhaupt noch da? ───────────────────────
const bestand = await page.evaluate(() => ({
  knoepfe: document.querySelectorAll('button').length,
  felder: document.querySelectorAll('input,select,textarea').length,
  leisten: document.querySelectorAll('.leiste,.kopfleiste,.standleiste,.palette,.tafel').length,
  dialoge: document.querySelectorAll('.frage,.objektmenue').length,
  sichtbar: [...document.querySelectorAll('body > *, #blatt > *, header.kopf > *')]
    .filter((e) => e.checkVisibility && e.checkVisibility({ opacityProperty: true, visibilityProperty: true }))
    .map((e) => (e.tagName + (e.id ? '#' + e.id : '') + (e.className ? '.' + String(e.className).split(' ').join('.') : ''))),
  titel: document.querySelector('header.kopf h1') ? document.querySelector('header.kopf h1').textContent : null,
  unter: document.getElementById('unterzeile') ? document.getElementById('unterzeile').textContent : null,
  siegel: document.getElementById('siegelDruck') ? document.getElementById('siegelDruck').textContent : null,
  hinweis: document.querySelector('.hinweis') ? document.querySelector('.hinweis').textContent.replace(/\s+/g, ' ').trim() : null,
  planWeg: (() => { const p = document.getElementById('plan'); if (!p) return 'FEHLT'
    const s = getComputedStyle(p); return `${s.visibility}/${s.pointerEvents}/${p.checkVisibility({ opacityProperty: true, visibilityProperty: true })}` })()
}))
console.log('\n── Bestand ──')
console.log(JSON.stringify(bestand, null, 1))
pruefe(bestand.knoepfe === 0, `2) KEINE Schaltflaeche im Dokument (${bestand.knoepfe})`)
pruefe(bestand.felder === 0, `2) KEIN Eingabefeld im Dokument (${bestand.felder})`)
pruefe(bestand.leisten === 0, `2) KEINE Bedienleiste im Dokument (${bestand.leisten})`)
pruefe(bestand.dialoge === 0, `2) KEIN Menue und keine Rueckfrage im Dokument (${bestand.dialoge})`)
pruefe(bestand.planWeg.startsWith('hidden/none/false'), `2) der Grundriss-Zeichner ist unerreichbar (${bestand.planWeg})`)

// ── 2) KLICK-PROBE ────────────────────────────────────────────────────────
// Der Abdruck traegt JEDES Element mit allen Attributen, seinem hidden-Zustand
// und seiner Textlaenge. Ein neues Menue, eine gesetzte Auswahl, ein
// aria-pressed, ein eingeblendeter Kasten — alles schlaegt hier durch.
const abdruckNehmen = () => page.evaluate(() => {
  const liste = [...document.querySelectorAll('body *')]
  return {
    // VOLL: jedes Attribut, Zeichen fuer Zeichen.
    voll: liste.map((e) => {
      const at = [...e.attributes].map((a) => a.name + '=' + a.value).sort().join(';')
      return e.tagName + '|' + at + '|' + (e.hidden ? 'H' : 'S') + '|' + (e.tagName === 'SCRIPT' ? 0 : e.textContent.length)
    }),
    // ZUSTAND: dasselbe, aber ohne LEERE Attributwerte. Ein `class=""` ist kein
    // Zustand — es ist die Spur, die `classList.remove` hinterlaesst.
    zustand: liste.map((e) => {
      const at = [...e.attributes].filter((a) => a.value !== '').map((a) => a.name + '=' + a.value).sort().join(';')
      return e.tagName + '|' + at + '|' + (e.hidden ? 'H' : 'S') + '|' + (e.tagName === 'SCRIPT' ? 0 : e.textContent.length)
    }),
    anzahl: liste.length,
    auswahl: String(document.getSelection()),
    aktiv: document.activeElement ? document.activeElement.tagName + '#' + document.activeElement.id : null
  }
})

const vorher = await abdruckNehmen()
const canvasKasten = await page.evaluate(() => {
  const r = document.getElementById('axo-canvas').getBoundingClientRect()
  return { x: r.left, y: r.top, w: r.width, h: r.height }
})
// 12 Stellen ueber die ganze Flaeche: 3 Reihen x 4 Spalten. Sie liegen damit
// zwangslaeufig auf Waenden, auf Moebeln und in Zwischenraeumen — welches ist
// egal, denn NICHTS davon darf antworten.
const stellen = []
for (let r = 1; r <= 3; r++) for (let s = 1; s <= 4; s++) {
  stellen.push([Math.round(canvasKasten.x + canvasKasten.w * s / 5), Math.round(canvasKasten.y + canvasKasten.h * r / 4)])
}
for (const [x, y] of stellen) {
  await page.mouse.click(x, y)          // echte Treffer-Ermittlung, kein dispatchEvent
  await page.waitForTimeout(60)
}
await page.waitForTimeout(400)
const nachher = await abdruckNehmen()

const zaehle = (a, b) => {
  let d = Math.abs(a.length - b.length)
  const zeig = []
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) { d++; if (zeig.length < 5) zeig.push(`${a[i].slice(0, 100)}  ->  ${b[i].slice(0, 100)}`) }
  }
  return { d, zeig }
}
const voll = zaehle(vorher.voll, nachher.voll)
const zustand = zaehle(vorher.zustand, nachher.zustand)
console.log('\n── Klick-Probe ──')
console.log(`  ${stellen.length} Klicks: ${stellen.map(([a, b]) => a + '/' + b).join(' ')}`)
console.log(`  Elemente vorher ${vorher.anzahl}, nachher ${nachher.anzahl}`)
console.log(`  Unterschiede voll: ${voll.d}   davon ZUSTAND: ${zustand.d}`)
if (voll.zeig.length) console.log('  ' + voll.zeig.join('\n  '))
pruefe(vorher.anzahl === nachher.anzahl, `2) kein Element entstanden oder verschwunden (${vorher.anzahl} -> ${nachher.anzahl})`)
pruefe(zustand.d === 0, `2) nach 12 Klicks NULL Zustands-Unterschiede im DOM (${zustand.d}; voll gezaehlt ${voll.d})`)
pruefe(nachher.auswahl === '' && vorher.auswahl === '', `2) keine Auswahl entstanden ("${nachher.auswahl}")`)
pruefe(konsole.length === 0, `2) die Klicks haben keinen Fehler ausgeloest (${konsole.length})`)
await page.screenshot({ path: path.join(AUS, 'nach-12-klicks.png') })

// ── 3) ZIEHEN ────────────────────────────────────────────────────────────
const blickVor = await page.evaluate(() => JSON.parse(JSON.stringify(window.__planerDatei.axoBlick())))
await page.evaluate(() => window.__planerDatei.axoMerken())
const mx = Math.round(canvasKasten.x + canvasKasten.w / 2)
const my = Math.round(canvasKasten.y + canvasKasten.h / 2)
await page.mouse.move(mx, my)
await page.mouse.down()
for (let i = 1; i <= 12; i++) { await page.mouse.move(mx + i * 14, my + i * 4); await page.waitForTimeout(16) }
await page.mouse.up()
await page.waitForTimeout(500)
const blickNachZug = await page.evaluate(() => JSON.parse(JSON.stringify(window.__planerDatei.axoBlick())))
const pixelZug = await page.evaluate(() => window.__planerDatei.axoAenderung(24))
console.log('\n── Ziehen ──')
console.log(`  Blick vor:  az=${blickVor.az.toFixed(4)} el=${blickVor.el.toFixed(4)} zoom=${blickVor.zoom.toFixed(4)}`)
console.log(`  Blick nach: az=${blickNachZug.az.toFixed(4)} el=${blickNachZug.el.toFixed(4)} zoom=${blickNachZug.zoom.toFixed(4)}`)
console.log(`  geaenderte Bildpunkte: ${pixelZug && pixelZug.n}`)
pruefe(Math.abs(blickNachZug.az - blickVor.az) > 0.05, `3) Ziehen dreht den Blickwinkel (az ${blickVor.az.toFixed(3)} -> ${blickNachZug.az.toFixed(3)})`)
pruefe(pixelZug && pixelZug.n > 5000, `3) und das BILD folgt (${pixelZug && pixelZug.n} geaenderte Bildpunkte)`)
await page.screenshot({ path: path.join(AUS, 'nach-ziehen.png') })

// ── 3) ZOOMEN ────────────────────────────────────────────────────────────
await page.evaluate(() => window.__planerDatei.axoMerken())
await page.mouse.move(mx, my)
await page.mouse.wheel(0, -600)
await page.waitForTimeout(500)
const blickNachZoom = await page.evaluate(() => JSON.parse(JSON.stringify(window.__planerDatei.axoBlick())))
const pixelZoom = await page.evaluate(() => window.__planerDatei.axoAenderung(24))
console.log('\n── Zoomen ──')
console.log(`  zoom ${blickNachZug.zoom.toFixed(4)} -> ${blickNachZoom.zoom.toFixed(4)}, geaenderte Bildpunkte ${pixelZoom && pixelZoom.n}`)
pruefe(blickNachZoom.zoom > blickNachZug.zoom * 1.05, `3) Rad zoomt (${blickNachZug.zoom.toFixed(3)} -> ${blickNachZoom.zoom.toFixed(3)})`)
pruefe(pixelZoom && pixelZoom.n > 5000, `3) und das BILD folgt (${pixelZoom && pixelZoom.n} geaenderte Bildpunkte)`)

// Zwei Finger (Handy) — dieselbe Geste ueber echte Zeiger-Ereignisse.
await page.evaluate(() => window.__planerDatei.axoMerken())
const zweiFinger = await page.evaluate(({ mx, my }) => {
  const c = document.getElementById('axo-canvas')
  const ev = (typ, id, x, y) => c.dispatchEvent(new PointerEvent(typ, { bubbles: true, pointerId: id, pointerType: 'touch', clientX: x, clientY: y, isPrimary: id === 1 }))
  ev('pointerdown', 1, mx - 60, my); ev('pointerdown', 2, mx + 60, my)
  for (let i = 1; i <= 8; i++) { ev('pointermove', 1, mx - 60 - i * 10, my); ev('pointermove', 2, mx + 60 + i * 10, my) }
  ev('pointerup', 1, mx - 140, my); ev('pointerup', 2, mx + 140, my)
  return JSON.parse(JSON.stringify(window.__planerDatei.axoBlick()))
}, { mx, my })
console.log(`  zwei Finger: zoom ${blickNachZoom.zoom.toFixed(4)} -> ${zweiFinger.zoom.toFixed(4)}`)
pruefe(zweiFinger.zoom > blickNachZoom.zoom * 1.05, `3) zwei Finger zoomen (${blickNachZoom.zoom.toFixed(3)} -> ${zweiFinger.zoom.toFixed(3)})`)
await page.screenshot({ path: path.join(AUS, 'nach-zoom.png') })

pruefe(konsole.length === 0, `3) bis zum Ende kein Konsolenfehler (${konsole.length})${konsole.length ? ' :: ' + konsole.join(' | ') : ''}`)

await ctx.close()
await browser.close()
console.log(`\n${fehler.length ? 'DURCHGEFALLEN: ' + fehler.length : 'ALLE PRUEFUNGEN BESTANDEN'}`)
console.log(`Bilder: ${path.resolve(AUS)}`)
process.exit(fehler.length ? 1 : 0)
