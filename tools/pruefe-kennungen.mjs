// Prueft das FUNDAMENT fuer das Moebelziehen (W2) am laufenden Planer.
//
// Voraussetzung: der Auslieferungs-Server laeuft.
//   node tools/serve-local.mjs --port 3301
//   node tools/pruefe-kennungen.mjs [--port 3301] [--plan halle400]
// Exit 0 = alle Pruefungen bestanden, 1 = mindestens eine durchgefallen.
//
// VIER BEHAUPTUNGEN, die hier bewiesen werden — und warum jede noetig ist:
//
//   a) JEDES Ausstattungs-Stueck und JEDE Wand traegt nach dem Laden eine
//      Kennung, und keine kommt doppelt vor. Ohne Kennung gibt es nur die
//      Objektreferenz, und die stirbt beim naechsten Rueckgaengig.
//   b) Die Kennung UEBERLEBT ein Rueckgaengig: dasselbe Moebel ist danach
//      ueber dieselbe Kennung auffindbar und steht wieder am alten Ort.
//      `undo.apply()` laedt den Grundriss komplett neu (src/core/undo.ts:161) —
//      genau hier ist bisher jede gehaltene Referenz gestorben.
//   c) In der UEBERSICHT schlaegt ein Moebel-Treffer die Wand dahinter.
//      GEGENPROBE: neben dem Moebel trifft weiterhin die Wand. Ohne die
//      Gegenprobe bestuende auch eine Fassung, die die Waende gar nicht mehr
//      greift — und dann waere der Grundriss nicht mehr zu bearbeiten.
//   d) Ein verschobenes Stueck traegt `quelle: 'gesetzt'`, ein unberuehrtes
//      weiterhin `'gemessen'`. Die PDF ist die Grundwahrheit (Projekt-DNA);
//      eine Annahme darf nie als Aufmass durchgehen.
//
// WAS HIER BEWUSST NICHT GEPRUEFT WIRD: das ZIEHEN selbst. Es gibt es in dieser
// Welle noch nicht. Das Verschieben laeuft darum ueber die Modell-Schnittstelle
// (`verschiebeAusstattung`) — dieselbe, die das Ziehen in Welle 2 benutzen wird.
// Ehrlicher als eine erfundene Geste, die es noch nicht gibt.
//
// WARUM AM LEBENDEN MODELL statt an Pixeln: hier geht es um IDENTITAET, und die
// ist im Bild nicht zu sehen — zwei Stuehle sehen gleich aus, auch wenn der
// eine ein anderer ist. Gemessen wird darum an `window.__planer` (die echte
// blueprint3d-Instanz), und der Treffer-Vorrang ueber echte Zeiger-Ereignisse.
//
// NIE page.click in den 2D-Zeichner: die Zeichenschleife laesst die Seite nie
// idle werden, ein wartender Klick liefe in den Timeout, OBWOHL er wirkt.
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

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'h400-kennungen-'))
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
  bewegen: 'Wände bewegen',
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

// --- in den 2D-Zeichner ---
await page.evaluate(() => {
  ;[...document.querySelectorAll('button')]
    .find((b) => b.textContent.trim() === '2D')
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
})
await page.waitForFunction(
  () => {
    const c = document.getElementById('floorplanner-canvas')
    return !!c && c.offsetParent !== null && c.width > 100 && !!window.__planer
  },
  { timeout: 15000 }
)
await page.waitForTimeout(1500)

// --- Messzugang im Browser: alles laeuft ueber die LEBENDE Instanz ---
await page.evaluate(() => {
  const c = () => document.getElementById('floorplanner-canvas')
  window.__k = {
    fp: () => window.__planer.model.floorplan,
    z: () => window.__planer.floorplanner,
    undo: () => window.__planer.undo,
    /** Weltkoordinate -> Bildschirmpunkt im Canvas (Bedienhilfe der Pruefung). */
    aufBild: (x, y) => ({ x: window.__planer.floorplanner.convertX(x), y: window.__planer.floorplanner.convertY(y) }),
    maus: (typ, x, y) => {
      const el = c()
      const r = el.getBoundingClientRect()
      el.dispatchEvent(new MouseEvent(typ, { bubbles: true, clientX: r.x + x, clientY: r.y + y }))
    },
    /** Was der Zeichner GERADE unter dem Zeiger sieht. */
    treffer: () => {
      const z = window.__planer.floorplanner
      return {
        ausstattung: z.activeAusstattung,
        wand: z.activeWall ? z.activeWall.id : null,
        ecke: z.activeCorner ? z.activeCorner.id : null
      }
    }
  }
  window.__k.mausWeg = () => window.__k.maus('mousemove', 2, 2)
})

const geo = await page.evaluate(() => {
  const c = document.getElementById('floorplanner-canvas')
  return { w: c.width, h: c.height, proCm: window.__k.z().pixelProCm() }
})
log(`SCHRITT 2: 2D-Zeichner offen, Canvas ${geo.w}x${geo.h}, Massstab ${geo.proCm.toFixed(4)} px/cm`)
await page.screenshot({ path: `${DIR}/A_uebersicht.png` })

/* ══ a) Jedes Stueck und jede Wand traegt eine Kennung ═══════════════════ */

const bestand = await page.evaluate(() => {
  const fp = window.__k.fp()
  const aus = fp.getAusstattung()
  const waende = fp.getWalls()
  const ausIds = aus.map((e) => e.id)
  const wandIds = waende.map((w) => w.id)
  return {
    ausZahl: aus.length,
    wandZahl: waende.length,
    ausOhne: aus.filter((e) => !e.id).length,
    wandOhne: waende.filter((w) => !w.id).length,
    ausDoppelt: ausIds.length - new Set(ausIds).size,
    wandDoppelt: wandIds.length - new Set(wandIds).size,
    ohneQuelle: aus.filter((e) => e.quelle !== 'gemessen' && e.quelle !== 'gesetzt').length,
    gemessen: aus.filter((e) => e.quelle === 'gemessen').length,
    gesetzt: aus.filter((e) => e.quelle === 'gesetzt').length,
    fassung: fp.saveFloorplan().formatVersion,
    wandIdImSpeicher: fp.saveFloorplan().walls.filter((w) => !!w.id).length,
    ausIdImSpeicher: (fp.saveFloorplan().ausstattung || []).filter((e) => !!e.id).length,
    beispielAus: ausIds.slice(0, 2),
    beispielWand: wandIds.slice(0, 2),
    alleWandIds: wandIds.join('|')
  }
})
log(`     Bestand: ${bestand.ausZahl} Ausstattung, ${bestand.wandZahl} Waende`)
log(`     Beispiel-Kennungen: ${bestand.beispielAus.join(' · ')} | ${bestand.beispielWand.join(' · ')}`)
pruefe(bestand.ausZahl > 0 && bestand.wandZahl > 0, `a) es gibt ueberhaupt etwas zu pruefen (${bestand.ausZahl}/${bestand.wandZahl})`)
pruefe(bestand.ausOhne === 0, `a) JEDES Ausstattungs-Stueck hat eine Kennung (ohne: ${bestand.ausOhne} von ${bestand.ausZahl})`)
pruefe(bestand.wandOhne === 0, `a) JEDE Wand hat eine Kennung (ohne: ${bestand.wandOhne} von ${bestand.wandZahl})`)
pruefe(bestand.ausDoppelt === 0, `a) keine Ausstattungs-Kennung doppelt (${bestand.ausDoppelt} Doppelte)`)
pruefe(bestand.wandDoppelt === 0, `a) keine Wand-Kennung doppelt (${bestand.wandDoppelt} Doppelte)`)
pruefe(bestand.ohneQuelle === 0, `a) jedes Stueck sagt, woher es kommt (${bestand.gemessen} gemessen, ${bestand.gesetzt} gesetzt)`)
// Die Kennung muss auch im SPEICHERFORMAT stehen — sonst ist sie beim naechsten
// Laden wieder weg, und das Rueckgaengig faehrt genau ueber dieses Format.
pruefe(
  bestand.wandIdImSpeicher === bestand.wandZahl && bestand.ausIdImSpeicher === bestand.ausZahl,
  `a) die Kennungen stehen im Speicherformat (${bestand.wandIdImSpeicher}/${bestand.wandZahl} Waende, ${bestand.ausIdImSpeicher}/${bestand.ausZahl} Stuecke)`
)
pruefe(bestand.fassung >= 2, `a) der gesicherte Grundriss nennt seine Format-Fassung (${bestand.fassung})`)

/* ══ a2) Eine Datei aus einer NEUEREN Fassung wird ehrlich abgelehnt ═════
   Sie traegt Felder, die dieser Stand nicht kennt (spaeter: Tueren an einer
   Wand). Klaglos oeffnen hiesse, sie beim naechsten Sichern still wegzuwerfen.
   Gemessen wird BEIDES: dass abgelehnt wird UND dass der offene Grundriss
   dabei unversehrt bleibt — eine Ablehnung, die den Plan mitreisst, waere die
   schlimmere Variante. */
const abwehr = await page.evaluate(() => {
  const fp = window.__k.fp()
  let meldung = null
  try {
    fp.loadFloorplan({ formatVersion: 99, corners: {}, walls: [] })
  } catch (e) {
    meldung = e && e.message ? e.message : String(e)
  }
  return { meldung, ecken: fp.getCorners().length, waende: fp.getWalls().length }
})
log(`     Abwehr-Meldung: ${abwehr.meldung}`)
pruefe(abwehr.meldung !== null, 'a) eine Datei aus einer neueren Fassung wird abgelehnt statt still verstuemmelt')
pruefe(
  !!abwehr.meldung && /neueren Fassung/.test(abwehr.meldung),
  'a) und die Ablehnung sagt auf Deutsch, warum'
)
pruefe(
  abwehr.ecken === 76 && abwehr.waende === bestand.wandZahl,
  `a) GEGENPROBE: der offene Grundriss bleibt dabei unversehrt (${abwehr.ecken} Ecken, ${abwehr.waende} Waende)`
)

/* ══ c) Der Moebel-Treffer schlaegt die Wand — mit Gegenprobe ════════════
   ZUERST, weil hier noch nichts veraendert ist: der Plan ist der gemessene. */

// Die Lage vermessen: wie viele Stuecke lieaegen mit ihrem MITTELPUNKT in der
// Greifzone einer Wand oder Ecke? Das ist der Befund, um den es geht.
const lage = await page.evaluate(() => {
  const fp = window.__k.fp()
  const z = window.__k.z()
  const c = document.getElementById('floorplanner-canvas')
  const toleranzCm = 8 / z.pixelProCm() // GREIF_TOLERANZ_PX in Weltmass
  const gefaehrdet = []
  fp.getAusstattung().forEach((el) => {
    const wand = fp.overlappedWall(el.x, el.y, toleranzCm)
    const ecke = fp.overlappedCorner(el.x, el.y, toleranzCm)
    if (!wand && !ecke) return
    const p = window.__k.aufBild(el.x, el.y)
    const imBild = p.x > 20 && p.y > 20 && p.x < c.width - 20 && p.y < c.height - 20
    // Nur Stuecke, deren Mitte auch wirklich IN ihrem eigenen Rechteck liegt
    // (das ist immer so) und die gross genug sind, dass der Zeiger sie trifft.
    gefaehrdet.push({
      id: el.id, typ: el.typ, x: el.x, y: el.y, breite: el.breite, tiefe: el.tiefe,
      bx: p.x, by: p.y, imBild, ueberWand: !!wand, ueberEcke: !!ecke
    })
  })
  return {
    toleranzCm,
    zahl: gefaehrdet.length,
    gesamt: fp.getAusstattung().length,
    imBild: gefaehrdet.filter((g) => g.imBild),
  }
})
log(
  `SCHRITT 3: Greifzone in der Uebersicht = ${lage.toleranzCm.toFixed(0)} cm — ` +
    `${lage.zahl} von ${lage.gesamt} Stuecken (${((100 * lage.zahl) / lage.gesamt).toFixed(0)} %) liegen mit ihrer Mitte darin`
)
pruefe(lage.imBild.length > 0, `c) ein Moebel VOR einer Wand im sichtbaren Bereich gefunden (${lage.imBild.length})`)

// Ins Loeschen-Werkzeug: nur dort ist die Ausstattung ueberhaupt greifbar
// (das Ziehen im Verschieben-Werkzeug kommt erst in Welle 2).
const werkzeugDa = await page.evaluate((titel) => {
  const b = [...document.querySelectorAll('button')].find(
    (x) => (x.getAttribute('aria-label') || x.getAttribute('title') || x.innerText || '').includes(titel)
  )
  if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  return !!b
}, L.loeschen)
pruefe(werkzeugDa, `c) Werkzeug "${L.loeschen}" gefunden und gewaehlt`)
await page.waitForTimeout(300)

/** Zeiger auf einen Bildpunkt setzen und sofort ablesen — vor der Rueckfrage
 *  (die kommt erst nach 700 ms Verweilen und wuerde nur stoeren). */
const tasten = async (bx, by) => {
  await page.evaluate(() => window.__k.mausWeg())
  await page.waitForTimeout(60)
  await page.evaluate((p) => window.__k.maus('mousemove', p.bx, p.by), { bx, by })
  await page.waitForTimeout(120)
  const t = await page.evaluate(() => window.__k.treffer())
  await page.evaluate(() => window.__planer.floorplanner.loeschungAbbrechen())
  return t
}

let probe = null
let trefferAufMoebel = null
for (const kandidat of lage.imBild.slice(0, 12)) {
  const t = await tasten(kandidat.bx, kandidat.by)
  if (t.ausstattung === kandidat.id) {
    probe = kandidat
    trefferAufMoebel = t
    break
  }
  log(`     (Kandidat ${kandidat.typ} ${kandidat.id} ergab ${JSON.stringify(t)})`)
}

// Der Kandidat ist mit Absicht einer, der in der Greifzone einer Wand/Ecke
// liegt: nach der ALTEN Reihenfolge (Ecke -> Wand -> Ausstattung) haette hier
// zwingend die Bausubstanz gewonnen. Genau das ist der Befund, der diese Welle
// ausgeloest hat.
pruefe(
  probe !== null,
  `c) auf dem Moebel gewinnt das MOEBEL, nicht die Wand dahinter` +
    (probe
      ? ` — ${probe.typ} "${probe.id}" (liegt in der Greifzone von: ${probe.ueberWand ? 'Wand' : ''}${probe.ueberWand && probe.ueberEcke ? '+' : ''}${probe.ueberEcke ? 'Ecke' : ''}, nach der alten Reihenfolge haette die gewonnen)`
      : ' — kein Kandidat traf')
)
if (probe) {
  pruefe(
    trefferAufMoebel.wand === null && trefferAufMoebel.ecke === null,
    `c) und die Wand/Ecke darunter ist dabei NICHT gegriffen (Wand ${trefferAufMoebel.wand}, Ecke ${trefferAufMoebel.ecke})`
  )
  await page.evaluate((p) => window.__k.maus('mousemove', p.bx, p.by), probe)
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${DIR}/B_moebel_gegriffen.png` })
  await page.evaluate(() => window.__planer.floorplanner.loeschungAbbrechen())
}

// --- GEGENPROBE: NEBEN dem Moebel muss weiterhin die Wand greifen.
// Gesucht wird ein Punkt auf derselben Wand, der in KEINEM Moebel-Rechteck
// liegt. Ohne diese Probe bestuende die Pruefung auch dann, wenn gar keine
// Wand mehr greifbar waere.
let gegenprobe = null
if (probe) {
  gegenprobe = await page.evaluate((p) => {
    const fp = window.__k.fp()
    const z = window.__k.z()
    const c = document.getElementById('floorplanner-canvas')
    const toleranzCm = 8 / z.pixelProCm()
    const wand = fp.overlappedWall(p.x, p.y, toleranzCm)
    if (!wand) return null
    const ax = wand.getStartX(), ay = wand.getStartY()
    const bx = wand.getEndX(), by = wand.getEndY()
    // Die Wand entlangtasten und den ersten Punkt nehmen, der frei von
    // Ausstattung ist und im Bild liegt.
    for (let i = 1; i < 200; i++) {
      const t = i / 200
      const wx = ax + (bx - ax) * t
      const wy = ay + (by - ay) * t
      if (fp.overlappedAusstattung(wx, wy, 0)) continue
      const s = window.__k.aufBild(wx, wy)
      if (s.x < 20 || s.y < 20 || s.x > c.width - 20 || s.y > c.height - 20) continue
      return { wx, wy, bx: s.x, by: s.y, wandId: wand.id }
    }
    return null
  }, probe)
}
pruefe(gegenprobe !== null, 'c) GEGENPROBE: ein freier Punkt auf derselben Wand gefunden')
if (gegenprobe) {
  const t = await tasten(gegenprobe.bx, gegenprobe.by)
  log(`     Gegenprobe bei ${gegenprobe.bx.toFixed(0)}/${gegenprobe.by.toFixed(0)}: ${JSON.stringify(t)}`)
  pruefe(
    t.wand !== null || t.ecke !== null,
    `c) GEGENPROBE: neben dem Moebel greift weiterhin die Wand (Wand ${t.wand}, Ecke ${t.ecke})`
  )
  pruefe(t.ausstattung === null, `c) GEGENPROBE: und dort ist KEIN Moebel gegriffen (${t.ausstattung})`)
}

// Zurueck ins Verschieben-Werkzeug, damit kein Loesch-Vorschlag herumsteht.
await page.evaluate((titel) => {
  const b = [...document.querySelectorAll('button')].find(
    (x) => (x.getAttribute('aria-label') || x.getAttribute('title') || x.innerText || '').includes(titel)
  )
  if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}, L.bewegen)
await page.evaluate(() => window.__k.mausWeg())
await page.waitForTimeout(200)

/* ══ d) Verschieben macht aus GEMESSEN ein GESETZT ═══════════════════════ */

// Ein grosses Stueck, damit die Wirkung auch im Bild zu sehen ist — aber KEINE
// `flaeche`: die wird ohne Rand gezeichnet (sie ist Untergrund, kein Moebel),
// an ihr waere die Strichelung nicht zu sehen.
const vorher = await page.evaluate(() => {
  const fp = window.__k.fp()
  const aus = fp.getAusstattung()
  const gross = aus
    .filter((e) => e.typ !== 'flaeche')
    .sort((a, b) => b.breite * b.tiefe - a.breite * a.tiefe)
  const el = gross[0]
  return {
    id: el.id, typ: el.typ, x: el.x, y: el.y, breite: el.breite, tiefe: el.tiefe,
    quelle: el.quelle, beleg: el.beleg || null,
    gemessen: aus.filter((e) => e.quelle === 'gemessen').length,
    alleIds: aus.map((e) => e.id).join('|')
  }
})
log(`SCHRITT 4: Probestueck = ${vorher.typ} "${vorher.id}" bei ${vorher.x}/${vorher.y}, quelle=${vorher.quelle}`)
pruefe(vorher.quelle === 'gemessen', `d) das unberuehrte Stueck ist "gemessen" (${vorher.quelle})`)

const verschoben = await page.evaluate((p) => {
  // Schnappschuss VOR der Aenderung — genau wie der Kern es beim Ziehen tut.
  window.__k.undo().snapshot()
  const ok = window.__k.fp().verschiebeAusstattung(p.id, p.x + 300, p.y + 200)
  window.__k.z().allesEinpassen() // erzwingt ein Neuzeichnen
  const el = window.__k.fp().findeAusstattung(p.id)
  const aus = window.__k.fp().getAusstattung()
  return {
    gemeldet: ok,
    x: el ? el.x : null, y: el ? el.y : null,
    quelle: el ? el.quelle : null,
    beleg: el ? el.beleg || null : null,
    gemessen: aus.filter((e) => e.quelle === 'gemessen').length,
    gesetzt: aus.filter((e) => e.quelle === 'gesetzt').length
  }
}, vorher)
await page.waitForTimeout(300)
await page.screenshot({ path: `${DIR}/C_verschoben.png` })
log(`     nach dem Verschieben: ${verschoben.x}/${verschoben.y}, quelle=${verschoben.quelle}, beleg=${verschoben.beleg}`)
pruefe(verschoben.gemeldet === true, 'd) das Verschieben meldet Wirkung (nicht still nichts getan)')
pruefe(
  verschoben.x === vorher.x + 300 && verschoben.y === vorher.y + 200,
  `d) das Stueck steht wirklich woanders (${vorher.x}/${vorher.y} -> ${verschoben.x}/${verschoben.y})`
)
pruefe(verschoben.quelle === 'gesetzt', `d) das verschobene Stueck ist jetzt "gesetzt" (${verschoben.quelle})`)
pruefe(
  verschoben.gemessen === vorher.gemessen - 1 && verschoben.gesetzt === 1,
  `d) GEGENPROBE: alle anderen bleiben "gemessen" (${vorher.gemessen} -> ${verschoben.gemessen} gemessen, ${verschoben.gesetzt} gesetzt)`
)
pruefe(verschoben.beleg === vorher.beleg, 'd) der Herkunftsnachweis bleibt erhalten (die Spur zurueck zur PDF)')

/* ══ b) Die Kennung ueberlebt das Rueckgaengig ═══════════════════════════ */

const undoDa = await page.evaluate((titel) => {
  const b = [...document.querySelectorAll('button')].find(
    (x) => (x.getAttribute('aria-label') || x.getAttribute('title') || x.innerText || '').includes(titel)
  )
  if (b && !b.disabled) b.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  return { da: !!b, gesperrt: b ? b.disabled : null }
}, L.undo)
log(`SCHRITT 5: Rueckgaengig-Knopf ${JSON.stringify(undoDa)}`)
pruefe(undoDa.da && undoDa.gesperrt === false, 'b) der Rueckgaengig-Knopf steht bereit')
await page.waitForTimeout(700)
await page.screenshot({ path: `${DIR}/D_zurueck.png` })

const danach = await page.evaluate((p) => {
  const fp = window.__k.fp()
  const el = fp.findeAusstattung(p.id)
  const aus = fp.getAusstattung()
  return {
    gefunden: !!el,
    x: el ? el.x : null, y: el ? el.y : null,
    quelle: el ? el.quelle : null,
    zahl: aus.length,
    alleIds: aus.map((e) => e.id).join('|'),
    waende: fp.getWalls().length,
    wandOhne: fp.getWalls().filter((w) => !w.id).length,
    alleWandIds: fp.getWalls().map((w) => w.id).join('|')
  }
}, vorher)

pruefe(
  danach.gefunden,
  `b) DASSELBE Moebel ist nach dem Rueckgaengig ueber DIESELBE Kennung auffindbar ("${vorher.id}")`
)
pruefe(
  danach.x === vorher.x && danach.y === vorher.y,
  `b) und es steht wieder am gemessenen Ort (${danach.x}/${danach.y} statt ${verschoben.x}/${verschoben.y})`
)
pruefe(danach.quelle === 'gemessen', `b) und gilt wieder als gemessen (${danach.quelle})`)
pruefe(
  danach.alleIds === vorher.alleIds,
  `b) KEINE Kennung hat sich beim Neuladen veraendert (${danach.zahl} Stuecke)`
)
pruefe(
  danach.wandOhne === 0 && danach.waende === bestand.wandZahl,
  `b) auch die Waende tragen nach dem Rueckgaengig noch ihre Kennung (${danach.waende} Waende, ${danach.wandOhne} ohne)`
)

// Und es sind DIESELBEN Wand-Kennungen wie vor dem Zurueckspielen, nicht nur
// gleich VIELE — das ist die Zusage, auf die sich eine Tuer verlassen muss.
pruefe(
  danach.alleWandIds === bestand.alleWandIds,
  'b) jede einzelne Wand-Kennung ist nach dem Rueckgaengig unveraendert'
)

/* ══ e) GESETZT sieht anders aus als GEMESSEN ═══════════════════════════
   Ein Kennzeichen, das nur in den Daten steht, hilft der Bank nicht — sie
   schaut auf ein Blatt. Gemessen wird deshalb die TINTE des Stuecks: gleiche
   Stelle, gleicher Massstab, gleiches Stueck, nur die Herkunft aendert sich.
   Gestrichelt hat Luecken, also weniger Tinte. Ein reiner Blick auf das
   Datenfeld wuerde auch dann bestehen, wenn der Zeichner es ignoriert. */
const strichprobe = await page.evaluate((p) => {
  const fp = window.__k.fp()
  const z = window.__k.z()
  const c = document.getElementById('floorplanner-canvas')

  // Nah heran, damit der Umriss ueberhaupt Striche zeigen kann. Der Ankerpunkt
  // ist das Stueck selbst — so bleibt es nach dem Zoomen an derselben Stelle.
  const vor = window.__k.aufBild(p.x, p.y)
  z.zoomeAufPunkt(2, vor.x, vor.y)
  const mitte = window.__k.aufBild(p.x, p.y)
  const proCm = z.pixelProCm()
  const halb = (Math.max(p.breite, p.tiefe) / 2 + 20) * proCm
  const kasten = {
    x0: Math.max(0, Math.round(mitte.x - halb)),
    y0: Math.max(0, Math.round(mitte.y - halb)),
    x1: Math.min(c.width, Math.round(mitte.x + halb)),
    y1: Math.min(c.height, Math.round(mitte.y + halb))
  }

  // Ein leerer Ausschnitt waere ein Messfehler, der wie ein Erfolg aussieht
  // (0 < 0 ist zwar falsch, 0 Tinte aber schon vorher verdaechtig): lieber
  // ehrlich melden als eine Zahl aus dem Nichts.
  const breitePx = kasten.x1 - kasten.x0
  const hoehePx = kasten.y1 - kasten.y0
  if (breitePx < 20 || hoehePx < 20) {
    return { ok: false, fehler: `Ausschnitt zu klein (${breitePx}x${hoehePx})`, solide: 0, gestrichelt: 0, kasten, proCm, quelle: null }
  }

  // Nur die Ausstattungs-Linienfarbe #7d8a9c zaehlen (A1-Verfahren): der
  // Blaustich (b - r) trennt sie von jeder neutralgrauen Wandkante.
  const tinte = () => {
    const d = c.getContext('2d').getImageData(kasten.x0, kasten.y0, kasten.x1 - kasten.x0, kasten.y1 - kasten.y0).data
    const nah = (v, soll) => Math.abs(v - soll) <= 22
    let n = 0
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] <= 10) continue
      if (d[i + 2] - d[i] >= 12 && nah(d[i], 125) && nah(d[i + 1], 138) && nah(d[i + 2], 156)) n++
    }
    return n
  }

  z.resizeView() // neu zeichnen OHNE die Ansicht zu verstellen
  const solide = tinte()
  // Auf DIESELBE Stelle verschieben: nur die Herkunft aendert sich, sonst nichts.
  const ok = fp.verschiebeAusstattung(p.id, p.x, p.y)
  z.resizeView()
  const gestrichelt = tinte()
  return { ok, solide, gestrichelt, kasten, proCm, quelle: fp.findeAusstattung(p.id).quelle }
}, vorher)
await page.waitForTimeout(200)
await page.screenshot({ path: `${DIR}/E_gestrichelt.png` })
log(
  `SCHRITT 6: Strichprobe an "${vorher.id}" bei ${strichprobe.proCm.toFixed(2)} px/cm — ` +
    `gemessen ${strichprobe.solide} Bildpunkte Tinte, gesetzt ${strichprobe.gestrichelt}`
)
pruefe(strichprobe.ok && strichprobe.quelle === 'gesetzt', 'e) dasselbe Stueck gilt jetzt als gesetzt')
pruefe(strichprobe.solide > 0, `e) das Stueck ist ueberhaupt gezeichnet (${strichprobe.solide} Bildpunkte)`)
pruefe(
  strichprobe.gestrichelt < strichprobe.solide,
  `e) gesetzt wird SICHTBAR anders gezeichnet — gestrichelt, also weniger Tinte (${strichprobe.solide} -> ${strichprobe.gestrichelt})`
)

await browser.close()

log('')
log(fehler.length === 0 ? 'ALLE PRUEFUNGEN BESTANDEN' : `DURCHGEFALLEN: ${fehler.length}`)
fehler.forEach((f) => log('  - ' + f))
log(`Bilder + Bericht: ${DIR}`)
process.exit(fehler.length === 0 ? 0 : 1)
