// Prueft die Fassung OHNE BEDIENUNG (--nur-modell) — die Datei fuer die Bank,
// in der es nichts zu klicken gibt.
//
//   node tools/baue-planer-datei.mjs --plan hotel400 --nur-modell //        --ziel Hotel400-fuer-die-Bank-nur-Modell.html ...
//   node tools/pruefe-nur-modell.mjs [--datei <name>] [--bilder <ordner>]
// Exit 0 = alle Pruefungen bestanden, 1 = mindestens eine durchgefallen.
//
// FUENF BEHAUPTUNGEN, die hier bewiesen werden:
//
//   0) GANZ ODER GAR NICHT bei der Unterschrift. Mit `--ohne-siegel` kommt der
//      Siegel-Baustein in dieser Fassung ueberhaupt nicht mehr in die Datei
//      (Betreiber-Ansage: „kein signieren. denn ich bin kein architekt.") —
//      dann darf im Quelltext WEDER das Wort noch ein Inhabername stehen, und
//      auch keine Schnitt-Marke uebrig sein. Traegt die Datei das Siegel, muss
//      sie es GANZ tragen: Schluessel, Unterschrift und Pruefroutine. Was hier
//      gemessen wird, ist genau der halbe Zustand, den man nicht sehen kann:
//      auf dem Bildschirm ist beides unsichtbar, im Texteditor nicht.
//
//   1) Die Datei oeffnet unter file:// mit HART gesperrtem Netz (alles ausser
//      file:/data:/blob: wird abgebrochen) und meldet keinen einzigen Fehler.
//   2) Es gibt nichts zum VERSTELLEN. Gezaehlt wird nicht die Absicht, sondern
//      das Ergebnis: genau die sieben Ansichts-Knoepfe der Sichtleiste (H3),
//      namentlich geprueft, 0 Eingabefelder, 0 Werkstatt-Leisten, 0 Menues —
//      und danach zwoelf ECHTE Klicks ueber die Zeichenflaeche, nach denen der
//      DOM derselbe ist. Jeder andere Knopf faellt als FREMD durch.
//   5) Und die sieben Knoepfe WIRKEN — an Blickwinkel und Massstab gemessen,
//      samt "Gesamt", das aus einer verirrten Lage exakt zurueckholt.
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

/* ── 0) GANZ ODER GAR NICHT: die Unterschrift im QUELLTEXT ────────────────
   Am Bildschirm ist der Unterschied nicht zu sehen — ein Siegel ohne Marke
   und gar kein Siegel sehen gleich aus. Gemessen wird deshalb am Text der
   Datei, und die Inhabernamen werden nicht geraten, sondern aus den
   vorhandenen Siegeln gelesen (`data/siegel-*.json`). Ein abgeschriebener
   Name ginge beim naechsten Siegel still daneben. */
const dateiText = fs.readFileSync(DATEI, 'utf8')
const inhaberNamen = (() => {
  const ordner = path.join(WURZEL, 'data')
  if (!fs.existsSync(ordner)) return []
  const aus = new Set()
  for (const n of fs.readdirSync(ordner)) {
    if (!/^siegel.*\.json$/i.test(n)) continue
    try {
      const j = JSON.parse(fs.readFileSync(path.join(ordner, n), 'utf8'))
      if (j && j.inhaber) aus.add(String(j.inhaber))
    } catch (e) { /* kein Siegel, kein Name */ }
  }
  return [...aus]
})()
const wieOft = (nadel) => dateiText.split(nadel).length - 1
const wortDrin = (dateiText.match(/siegel/gi) || []).length
const nameDrin = inhaberNamen.reduce((s, n) => s + wieOft(n), 0)
const markenRest = (dateiText.match(/OHNE-NAMEN-(AB|ZU)/g) || []).length
const werkDrin = ['const SIEGEL =', 'const SIEGEL_SCHLUESSEL =', 'function siegelPruefen()']
  .filter((s) => dateiText.includes(s))
console.log(`\n── Unterschrift im Quelltext ── Wort „Siegel" ${wortDrin}× · Inhabername ${nameDrin}× ` +
  `(gesucht: ${inhaberNamen.length ? inhaberNamen.map((n) => `„${n}"`).join(', ') : 'kein Siegel abgelegt'}) · ` +
  `Baustein-Teile ${werkDrin.length}/3 · Marken-Reste ${markenRest}`)
pruefe(markenRest === 0, `0) keine Schnitt-Marke uebrig geblieben (${markenRest})`)
if (werkDrin.length === 0) {
  // Gebaut mit --ohne-siegel: dann muss die Spur VOLLSTAENDIG fehlen.
  pruefe(wortDrin === 0, `0) ohne Unterschrift gebaut — das Wort „Siegel" steht ${wortDrin}× im Quelltext (soll 0)`)
  pruefe(nameDrin === 0, `0) ohne Unterschrift gebaut — ein Inhabername steht ${nameDrin}× im Quelltext (soll 0)`)
} else {
  // Mit Siegel gebaut: dann muss es GANZ da sein, nicht halb.
  pruefe(werkDrin.length === 3, `0) mit Unterschrift gebaut — der Baustein ist vollstaendig (${werkDrin.length}/3)`)
  pruefe(nameDrin > 0, `0) mit Unterschrift gebaut — der Inhaber steht dabei (${nameDrin}×)`)
}

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
  /* JEDER Knopf mit seinem KENNZEICHEN, nicht nur gezaehlt. Eine Zahl sagt
     nicht, WELCHE Knoepfe dastehen — und genau das ist seit H3 die Frage:
     sieben erlaubte Ansichts-Knoepfe ja, ein achter oder ein anderer nein. */
  knopfKennungen: [...document.querySelectorAll('button')].map((b) =>
    b.dataset.blick !== undefined ? 'blick=' + b.dataset.blick
      : b.dataset.sicht !== undefined ? 'sicht=' + b.dataset.sicht
        : 'FREMD:' + (b.id || b.textContent.replace(/\s+/g, ' ').trim().slice(0, 30))
  ).sort(),
  felder: document.querySelectorAll('input,select,textarea').length,
  /* Die Sichtleiste ist die EINZIGE erlaubte Leiste. Kopfleiste, Standleiste,
     Palette und Tafel bleiben bei null — das sind die Werkstatt-Moebel. */
  sichtleisten: document.querySelectorAll('#sichtleiste.leiste').length,
  leisten: document.querySelectorAll('.leiste:not(#sichtleiste),.kopfleiste,.standleiste,.palette,.tafel').length,
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
/* ── WAS SICH MIT H3 GEAENDERT HAT, UND WAS NICHT ────────────────────────
   Bis hierher galt „0 Schaltflaechen". Der Betreiber hat seither ausdruecklich
   Knoepfe bestellt, mit denen man das Modell aus allen Richtungen ansehen kann
   — ANSEHEN, nicht verstellen. Die Pruefung wird dadurch nicht weicher: aus
   einer Zahl wird eine NAMENTLICHE Liste, und sie wird auf GLEICHHEIT geprueft.

   Was damit weiterhin durchfaellt: ein Bearbeiten-Knopf, ein Namen-Schalter,
   ein Werkzeug, ein zweiter Nord-Knopf, eine Eingabe. Alles, was nicht
   woertlich auf dieser Liste steht, wird als FREMD gemeldet — samt seiner
   Kennung oder Aufschrift, damit man weiss, wo man suchen muss. */
const ERLAUBTE_KNOEPFE = [
  'blick=0', 'blick=1', 'blick=2', 'blick=3',
  'sicht=gesamt', 'sicht=naeher', 'sicht=weiter'
].sort()
const fremdeKnoepfe = bestand.knopfKennungen.filter((k) => !ERLAUBTE_KNOEPFE.includes(k))
pruefe(
  fremdeKnoepfe.length === 0,
  `2) KEIN fremder Knopf im Dokument${fremdeKnoepfe.length ? ' :: ' + fremdeKnoepfe.join(' | ') : ''}`
)
pruefe(
  JSON.stringify(bestand.knopfKennungen) === JSON.stringify(ERLAUBTE_KNOEPFE),
  `2) GENAU die sieben Ansichts-Knoepfe, keiner doppelt, keiner fehlt (${bestand.knopfKennungen.join(' ')})`
)
pruefe(bestand.felder === 0, `2) KEIN Eingabefeld im Dokument (${bestand.felder})`)
pruefe(bestand.sichtleisten === 1, `2) genau EINE Sichtleiste (${bestand.sichtleisten})`)
pruefe(bestand.leisten === 0, `2) KEINE weitere Bedienleiste im Dokument (${bestand.leisten})`)
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

// ── 5) DIE SICHTLEISTE WIRKT (H3) ────────────────────────────────────────
// Gemessen an der SZENE — Blickwinkel, Zoom, Massstab — und nicht am Bild.
// Ein Knopf, der nur aufleuchtet, hat nichts getan; das ist die haeufigste
// Art, wie eine Leiste kaputtgeht, ohne dass es jemand bemerkt.
const lage = () =>
  page.evaluate(() => {
    const b = window.__planerDatei.axoBlick()
    const k = window.__planerDatei.axoKamera()
    return {
      az: +b.az.toFixed(4), el: +b.el.toFixed(4), zoom: +b.zoom.toFixed(4),
      schiebX: +b.schiebX.toFixed(1), schiebY: +b.schiebY.toFixed(1), massstab: +k.massstab.toFixed(2)
    }
  })
const druecke = async (w) => { await page.click(w); await page.waitForTimeout(220) }

await druecke('[data-sicht="gesamt"]')
const anfang = await lage()
console.log('\n── Sichtleiste ──')
console.log(`  Anfangsbild: az=${anfang.az} el=${anfang.el} zoom=${anfang.zoom} Massstab=${anfang.massstab} px/m`)

/* Reihenfolge bewusst NICHT mit Nord zuerst: am Rechner IST Nord das
   Anfangsbild, ein Druck darauf haette also nichts zu tun und die Messung
   waere ein leerer Beweis. Jeder Knopf wird aus einer anderen Lage gedrueckt. */
for (const [name, i] of [['West', '1'], ['Sued', '2'], ['Plan', '3'], ['Nord', '0']]) {
  const wahl = `[data-blick="${i}"]`
  const v = await lage()
  await druecke(wahl)
  const n = await lage()
  const gedreht = Math.abs(n.az - v.az) + Math.abs(n.el - v.el)
  const aktiv = await page.evaluate((w) => document.querySelector(w).getAttribute('aria-pressed'), wahl)
  const allein = await page.evaluate(
    () => [...document.querySelectorAll('[data-blick]')].filter((b) => b.getAttribute('aria-pressed') === 'true').length
  )
  console.log(`  ${name}: az ${v.az} -> ${n.az}, el ${v.el} -> ${n.el}, aktiv=${aktiv}`)
  pruefe(gedreht > 0.05, `5) "${name}" richtet die Kamera neu (${gedreht.toFixed(3)} rad Summe)`)
  pruefe(aktiv === 'true' && allein === 1, `5) "${name}" ist danach der EINZIGE aktive Blick (aktiv=${aktiv}, gleichzeitig ${allein})`)
}

// Die Zoom-Knoepfe am MASSSTAB, nicht nur an der Zoomzahl: der Massstab ist
// das, was der Betrachter sieht (Bildpunkte je Meter).
const zv = await lage()
await druecke('[data-sicht="naeher"]')
const zn = await lage()
await druecke('[data-sicht="weiter"]')
const zw = await lage()
console.log(`  Zoom: ${zv.massstab} -> ${zn.massstab} -> ${zw.massstab} px/m`)
pruefe(zn.massstab > zv.massstab * 1.3, `5) "+" vergroessert den Massstab (${zv.massstab} -> ${zn.massstab} px/m)`)
pruefe(Math.abs(zw.massstab - zv.massstab) < 0.02, `5) "-" nimmt es genau zurueck (${zn.massstab} -> ${zw.massstab} px/m)`)

/* "Gesamt" ist der Rueckweg aus JEDER Lage — also wird vorher absichtlich eine
   verirrte erzeugt: andere Blickrichtung, weit hineingezoomt UND verschoben.
   Ein Knopf, der nur den Blickwinkel zuruecksetzt, faellt hier durch. */
await druecke('[data-blick="3"]')
for (let i = 0; i < 6; i++) await druecke('[data-sicht="naeher"]')
await page.keyboard.down('Shift')
await page.mouse.move(mx, my)
await page.mouse.down()
for (let i = 1; i <= 8; i++) { await page.mouse.move(mx + i * 20, my + i * 12); await page.waitForTimeout(14) }
await page.mouse.up()
await page.keyboard.up('Shift')
await page.waitForTimeout(250)
const verirrt = await lage()
await druecke('[data-sicht="gesamt"]')
const zurueck = await lage()
console.log(`  verirrt: az=${verirrt.az} zoom=${verirrt.zoom} schieb=${verirrt.schiebX}/${verirrt.schiebY}`)
console.log(`  danach:  az=${zurueck.az} zoom=${zurueck.zoom} schieb=${zurueck.schiebX}/${zurueck.schiebY}`)
pruefe(
  verirrt.zoom > 5 && Math.abs(verirrt.schiebX) + Math.abs(verirrt.schiebY) > 50,
  `5) GEGENPROBE: die Lage war vorher wirklich verirrt (zoom ${verirrt.zoom}, schieb ${verirrt.schiebX}/${verirrt.schiebY})`
)
pruefe(
  JSON.stringify(zurueck) === JSON.stringify(anfang),
  `5) "Gesamt" stellt das Anfangsbild EXAKT wieder her (${JSON.stringify(zurueck)})`
)
await page.screenshot({ path: path.join(AUS, 'sichtleiste.png') })

pruefe(konsole.length === 0, `3) bis zum Ende kein Konsolenfehler (${konsole.length})${konsole.length ? ' :: ' + konsole.join(' | ') : ''}`)

await ctx.close()
await browser.close()
console.log(`\n${fehler.length ? 'DURCHGEFALLEN: ' + fehler.length : 'ALLE PRUEFUNGEN BESTANDEN'}`)
console.log(`Bilder: ${path.resolve(AUS)}`)
process.exit(fehler.length ? 1 : 0)
