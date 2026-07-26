// Prueft die PLANER-DATEI (W1) unter den Bedingungen der Bank.
//
//   node tools/baue-planer-datei.mjs      # erst bauen
//   node tools/pruefe-planer-datei.mjs    # dann pruefen + Standbilder
// Exit 0 = alle Pruefungen bestanden, 1 = mindestens eine durchgefallen.
//
// DREI BEDINGUNGEN, unter denen geprueft wird — wie schon bei der Bank-Ansicht:
//   1. file:// — kein Server, kein Node, kein localhost. Genau der Doppelklick.
//   2. NETZ HART GESPERRT — jede Anfrage nach draussen wird abgebrochen UND
//      gemeldet. Ohne diese Sperre bestuende die Pruefung auch dann, wenn noch
//      eine CDN-Adresse im Zeichenpfad haengt: auf DIESEM Rechner ist das CDN ja
//      erreichbar. Der Fehler zeigte sich erst bei der Bank.
//   3. KEIN Konsolenfehler. Eine weisse Seite meldet sich nicht von selbst.
//
// UND EINE VIERTE, neu in W1: ein ECHTES Nutzerprofil
// (`launchPersistentContext`). Der Speicher unter `file://` verhaelt sich im
// fluechtigen Kontext anders als beim Doppelklick — gemessen: im fluechtigen
// Kontext sieht ein zweiter Reiter den Stand NICHT, mit echtem Profil schon.
// Waer hier falsch misst, verspricht dem Nutzer eine Bestaendigkeit, die es
// nicht gibt.
//
// WARUM KEIN page.click IN DEN ZEICHNER: die Zeichenschleife laesst die Seite
// nie zur Ruhe kommen, ein wartender Klick laeuft in den Timeout, OBWOHL er
// wirkt. Alle Zeiger-Ereignisse gehen darum ueber `dispatchEvent`, und gewartet
// wird auf einen ZUSTAND, nicht auf eine Frist.
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
const DATEI = path.resolve(WURZEL, arg('--datei', 'Halle400-Modell.html'))

if (!fs.existsSync(DATEI)) {
  console.error(`Nicht gefunden: ${DATEI}\nErst "node tools/baue-planer-datei.mjs" laufen lassen.`)
  process.exit(1)
}

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'h400-planer-'))
const BERICHT = path.join(DIR, 'bericht.txt')
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

// Echtes Nutzerprofil statt fluechtigem Kontext — s. Kopf.
const ctx = await chromium.launchPersistentContext(path.join(DIR, 'profil'), {
  viewport: { width: 1600, height: 1000 },
  acceptDownloads: true
})

const blockiert = []
await ctx.route('**/*', (route) => {
  const url = route.request().url()
  if (url.startsWith('file://') || url.startsWith('data:') || url.startsWith('blob:')) {
    return route.continue()
  }
  blockiert.push(url)
  return route.abort()
})

const konsolenFehler = []
const beobachte = (p) => {
  p.on('console', (m) => {
    if (m.type() === 'error') konsolenFehler.push(m.text().slice(0, 200))
  })
  p.on('pageerror', (e) => konsolenFehler.push('PAGE-ERR: ' + String(e).slice(0, 200)))
  return p
}

const warteBereit = async (p) => {
  try {
    await p.waitForFunction(() => window.__bereit === true, { timeout: 25000 })
    return true
  } catch (_) {
    return false
  }
}

/** Klick auf ein Bedienelement — als echtes Ereignis, ohne auf Ruhe zu warten. */
const klick = (p, id) =>
  p.evaluate((k) => {
    const b = document.getElementById(k)
    if (!b) return false
    b.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return true
  }, id)

/** Zeiger von den Messflaechen wegfahren: die Hervorhebung unter dem Zeiger
 *  faerbt sonst genau die Linien ein, die gleich gezaehlt werden. */
const zeigerWeg = (p) => p.evaluate(() => window.__planerDatei.maus('mousemove', 3, 3))

/** Ist das WIRKLICH zu sehen?
 *  NICHT ueber `offsetParent` messen — das ist bei JEDER `position:fixed`
 *  Angabe null, und alle Leisten dieser Datei liegen fest. Die erste Fassung
 *  dieses Gates meldete darum "unsichtbar" fuer eine Leiste, die im Standbild
 *  daneben deutlich zu sehen war. Playwright entscheidet es richtig: sichtbar
 *  heisst display, visibility UND eine Flaeche groesser null. */
const sichtbar = (p, auswahl) => p.locator(auswahl).isVisible()

const url = pathToFileURL(DATEI).href
const page = beobachte(await ctx.newPage())
log(`Oeffne wie per Doppelklick: ${url}`)
log('Netz: GESPERRT · Profil: echt (wie beim Doppelklick)\n')

await page.goto(url, { waitUntil: 'domcontentloaded' })
const bereit = await warteBereit(page)

/* ══ G1 — die Datei oeffnet und zeigt das Blatt ════════════════════════ */
pruefe(bereit, 'G1: die Datei meldet sich betriebsbereit')
pruefe(
  blockiert.length === 0,
  `G1: KEINE Anfrage nach draussen (${blockiert.length} blockiert${blockiert.length ? ': ' + blockiert.slice(0, 3).join(', ') : ''})`
)
pruefe(
  konsolenFehler.length === 0,
  `G1: keine Konsolen- oder Seitenfehler (${konsolenFehler.length}${konsolenFehler.length ? ': ' + konsolenFehler.slice(0, 2).join(' | ') : ''})`
)
if (!bereit) {
  await ctx.close()
  log('\nABBRUCH: die Datei kam nicht hoch — alles Weitere waere Raten.')
  log(`Bericht: ${BERICHT}`)
  process.exit(1)
}

const auskunft = await page.evaluate(() => ({
  ansicht: window.__planerDatei.ansicht(),
  speicherTraegt: window.__planerDatei.speicherTraegt,
  schluessel: window.__planerDatei.schluessel,
  bauStempel: window.__planerDatei.bauStempel,
  blatt: window.__planerDatei.bildBlatt()
}))
// Den Bau-Zeitpunkt IMMER mitschreiben: ein abgebrochener Bau laesst die alte
// Datei liegen, und dann prueft dieses Werkzeug in bester Absicht das Gestrige.
log(`     geprueft wird der Bau vom ${auskunft.bauStempel}`)
log(`     Speicher traegt: ${auskunft.speicherTraegt} · Schluessel: ${auskunft.schluessel}`)
pruefe(auskunft.ansicht === 'axo', `G1: die Axonometrie ist die Startansicht (${auskunft.ansicht})`)
pruefe(auskunft.blatt.tinte > 5000, `G1: das Blatt ist wirklich gezeichnet (${auskunft.blatt.tinte} Bildpunkte Tinte)`)
await page.screenshot({ path: path.join(DIR, 'A_startansicht.png') })

/* ══ G8-Gegenprobe — ohne Aenderung bleibt das Blatt identisch ═════════
   Zuerst, solange noch nichts verschoben ist. Ein "das Bild aendert sich"
   ohne diese Gegenprobe bestuende auch, wenn es sich BEI JEDEM Hinsehen
   aendert — das waere kein Folgen, sondern Rauschen. */
const blattVorher = auskunft.blatt
await klick(page, 'btnAnsichtPlan')
await page.waitForTimeout(300)
await klick(page, 'btnAnsichtAxo')
await page.waitForTimeout(500)
const blattOhneAenderung = await page.evaluate(() => window.__planerDatei.bildBlatt())
pruefe(
  blattOhneAenderung.summe === blattVorher.summe,
  `G8: GEGENPROBE — ohne Aenderung bleibt das Blatt identisch (Pruefsumme ${blattVorher.summe} -> ${blattOhneAenderung.summe})`
)

/* ══ G2 — im Auslieferungszustand sieht die Bank ein ruhiges Blatt ═════ */
const werkzeugeVorherApi = await page.evaluate(() => window.__planerDatei.werkzeugeSichtbar())
const werkzeugeVorherAuge = await sichtbar(page, '#werkzeuge')
pruefe(
  werkzeugeVorherApi === false && werkzeugeVorherAuge === false,
  'G2: die Werkzeuge sind im Auslieferungszustand NICHT sichtbar'
)
await klick(page, 'btnBearbeiten')
await page.waitForTimeout(400)
const werkzeugeNachher = await page.evaluate(() => ({
  api: window.__planerDatei.werkzeugeSichtbar(),
  ansicht: window.__planerDatei.ansicht()
}))
const werkzeugeNachherAuge = await sichtbar(page, '#werkzeuge')
pruefe(
  werkzeugeNachher.api === true && werkzeugeNachherAuge === true,
  'G2: nach dem Bearbeiten-Schalter sind sie sichtbar'
)
pruefe(werkzeugeNachher.ansicht === 'plan', `G2: der Schalter fuehrt in den Grundriss (${werkzeugeNachher.ansicht})`)
await page.screenshot({ path: path.join(DIR, 'B_bearbeiten.png') })

/* ══ G3 — dasselbe Modell wie im Planer ═══════════════════════════════ */
const zahlen = await page.evaluate(() => window.__planerDatei.zahlen())
log(`     Modell: ${zahlen.ecken} Ecken, ${zahlen.waende} Waende, ${zahlen.raeume} Raeume, ${zahlen.ausstattung} Ausstattung`)
pruefe(zahlen.ecken === 76, `G3: 76 Ecken (${zahlen.ecken})`)
pruefe(zahlen.waende === 100, `G3: 100 Waende (${zahlen.waende})`)
pruefe(zahlen.raeume === 25, `G3: 25 Raeume (${zahlen.raeume})`)

/* ══ G4 — der Maus-Beweis ═════════════════════════════════════════════
   Eine Ecke am UNTEREN Rand des Grundrisses wird nach unten ins Leere
   gezogen. Warum dorthin: `Corner.move` verschmilzt mit allem, was naeher als
   20 cm liegt (corner.ts:301-315) — ein Zug quer durch das Gebaeude koennte die
   Ecke also unterwegs verschlucken, und die Messung maesse etwas anderes als
   das Verschieben. */
const wahl = await page.evaluate(() => {
  const ecken = window.__planerDatei.ecken()
  const passend = ecken.filter(
    (e) =>
      e.bx > 260 && e.bx < 1340 && e.by > 160 && e.by < 800 &&
      !ecken.some((a) => a.id !== e.id && Math.hypot(a.bx - e.bx, a.by - e.by) < 34)
  )
  passend.sort((a, b) => b.by - a.by)
  return passend[0] || null
})
pruefe(wahl !== null, 'G4: eine frei stehende Ecke zum Greifen gefunden')
if (!wahl) {
  await ctx.close()
  log('\nABBRUCH: ohne Greifpunkt ist der Rest Raten.')
  process.exit(1)
}
log(`     gegriffen wird Ecke ${wahl.id.slice(0, 8)} bei Bild(${wahl.bx.toFixed(0)}, ${wahl.by.toFixed(0)}) = Welt(${wahl.x}, ${wahl.y})`)

const ZIEH_X = 60
const ZIEH_Y = 130

// --- GEGENPROBE ZUERST: dieselbe Bewegung OHNE gedrueckte Taste.
await zeigerWeg(page)
await page.waitForTimeout(150)
const bildVorGegenprobe = await page.evaluate(() => window.__planerDatei.bildPlan())
await page.evaluate((p) => {
  const m = window.__planerDatei.maus
  m('mousemove', p.bx, p.by)
  for (let i = 1; i <= 10; i++) m('mousemove', p.bx + (p.dx * i) / 10, p.by + (p.dy * i) / 10)
}, { bx: wahl.bx, by: wahl.by, dx: ZIEH_X, dy: ZIEH_Y })
await page.waitForTimeout(300)
const nachGegenprobe = await page.evaluate((id) => window.__planerDatei.ecke(id), wahl.id)
pruefe(
  nachGegenprobe && nachGegenprobe.x === wahl.x && nachGegenprobe.y === wahl.y,
  `G4: GEGENPROBE — dieselbe Bewegung OHNE gedrueckte Taste verschiebt NICHTS (${nachGegenprobe?.x}, ${nachGegenprobe?.y})`
)

// --- jetzt der echte Zug
await zeigerWeg(page)
await page.waitForTimeout(150)
await page.evaluate((p) => {
  const m = window.__planerDatei.maus
  m('mousemove', p.bx, p.by)
  m('mousedown', p.bx, p.by)
  for (let i = 1; i <= 10; i++) m('mousemove', p.bx + (p.dx * i) / 10, p.by + (p.dy * i) / 10)
  m('mouseup', p.bx + p.dx, p.by + p.dy)
}, { bx: wahl.bx, by: wahl.by, dx: ZIEH_X, dy: ZIEH_Y })
await page.waitForTimeout(400)
await zeigerWeg(page)
await page.waitForTimeout(250)

const gezogen = await page.evaluate((id) => window.__planerDatei.ecke(id), wahl.id)
const bildNachZug = await page.evaluate(() => window.__planerDatei.bildPlan())
const verschobenCm = gezogen ? Math.hypot(gezogen.x - wahl.x, gezogen.y - wahl.y) : 0
log(`     Ecke: Welt(${wahl.x}, ${wahl.y}) -> (${gezogen?.x}, ${gezogen?.y}) = ${verschobenCm.toFixed(0)} cm`)
log(`     Tinte im Zeichner: ${bildVorGegenprobe.tinte} -> ${bildNachZug.tinte} Bildpunkte`)
pruefe(verschobenCm > 100, `G4: die Ecke ist im MODELL verschoben (${verschobenCm.toFixed(0)} cm)`)
pruefe(
  bildNachZug.summe !== bildVorGegenprobe.summe,
  `G4: das BILD hat sich messbar veraendert (Pruefsumme ${bildVorGegenprobe.summe} -> ${bildNachZug.summe})`
)
await page.screenshot({ path: path.join(DIR, 'C_nach_dem_zug.png') })

/* ══ G8 — die Axonometrie folgt dem Grundriss ═════════════════════════
   STEHT HIER und nicht weiter unten: nach dem Zug, aber VOR Rueckgaengig. Ein
   Undo laedt den Grundriss neu und meldet das dem ganzen Haus — die Ansicht
   folgte dann also einem Undo und nicht dem Zug, und das Gate waere gruen,
   obwohl das Verschieben allein nichts bewirkt haette. Genau so war es in der
   ersten Fassung: falsch gruen. */
await klick(page, 'btnAnsichtAxo')
await page.waitForTimeout(700)
const blattNachZug = await page.evaluate(() => window.__planerDatei.bildBlatt())
pruefe(
  blattNachZug.summe !== blattVorher.summe,
  `G8: das Blatt folgt der verschobenen Wand (Pruefsumme ${blattVorher.summe} -> ${blattNachZug.summe})`
)
await page.screenshot({ path: path.join(DIR, 'D_blatt_folgt.png') })
await klick(page, 'btnAnsichtPlan')
await page.waitForTimeout(300)

/* ══ G5 — Rueckgaengig, und zwar in EINEM Schritt ══════════════════════
   Ein Zug ueber viele Bewegungen muss GENAU EIN Undo-Schritt sein. Deshalb
   wird nach dem einen Undo geprueft, dass die Historie LEER ist — waere jede
   Zwischenbewegung ein eigener Schritt, laege dort noch ein Dutzend. */
await klick(page, 'btnUndo')
await page.waitForTimeout(400)
const nachUndo = await page.evaluate((id) => ({
  ecke: window.__planerDatei.ecke(id),
  zurueck: window.__planerDatei.kannZurueck(),
  vor: window.__planerDatei.kannVor()
}), wahl.id)
pruefe(
  nachUndo.ecke && Math.abs(nachUndo.ecke.x - wahl.x) < 0.5 && Math.abs(nachUndo.ecke.y - wahl.y) < 0.5,
  `G5: Rueckgaengig stellt die Ecke her (${nachUndo.ecke?.x}, ${nachUndo.ecke?.y})`
)
pruefe(
  nachUndo.zurueck === false,
  'G5: der ganze Zug war GENAU EIN Schritt — die Historie ist danach leer'
)
await klick(page, 'btnRedo')
await page.waitForTimeout(400)
const nachRedo = await page.evaluate((id) => window.__planerDatei.ecke(id), wahl.id)
pruefe(
  nachRedo && Math.abs(nachRedo.x - gezogen.x) < 0.5 && Math.abs(nachRedo.y - gezogen.y) < 0.5,
  `G5: Wiederholen bringt sie erneut (${nachRedo?.x}, ${nachRedo?.y})`
)

/* ══ G7 — Sichern erzeugt eine Datei, die sich wieder laden laesst ═════ */
let exportPfad = null
try {
  const [ladung] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    klick(page, 'btnExport')
  ])
  exportPfad = path.join(DIR, ladung.suggestedFilename())
  await ladung.saveAs(exportPfad)
} catch (e) {
  log('     Download nicht angekommen: ' + String(e).slice(0, 120))
}
pruefe(exportPfad !== null && fs.existsSync(exportPfad), `G7: "Sichern" legt eine Datei ab (${exportPfad ? path.basename(exportPfad) : 'keine'})`)

if (exportPfad && fs.existsSync(exportPfad)) {
  const inhalt = JSON.parse(fs.readFileSync(exportPfad, 'utf8'))
  const eckenDrin = inhalt.floorplan ? Object.keys(inhalt.floorplan.corners).length : 0
  const waendeDrin = inhalt.floorplan ? inhalt.floorplan.walls.length : 0
  log(`     gesicherte Datei: ${eckenDrin} Ecken, ${waendeDrin} Waende, ${(inhalt.labels || []).length} Namen, ${(fs.statSync(exportPfad).size / 1024).toFixed(0)} KB`)
  pruefe(
    eckenDrin === 76 && waendeDrin === 100 && Array.isArray(inhalt.labels),
    `G7: sie hat das Format des Planers ({floorplan, items, labels}) — ${eckenDrin} Ecken, ${waendeDrin} Waende`
  )

  // Und sie laesst sich WIRKLICH wieder laden: erst zuruecksetzen, dann die
  // Datei einlesen und nachsehen, ob die verschobene Ecke zurueckkommt.
  await klick(page, 'btnZurueck')
  await page.waitForTimeout(200)
  await klick(page, 'btnZurueckJa')
  await page.waitForTimeout(600)
  await page.setInputFiles('#dateiWahl', exportPfad)
  await page.waitForTimeout(900)
  const nachImport = await page.evaluate((id) => ({
    ecke: window.__planerDatei.ecke(id),
    zahlen: window.__planerDatei.zahlen()
  }), wahl.id)
  pruefe(
    nachImport.ecke && Math.abs(nachImport.ecke.x - gezogen.x) < 0.5 && Math.abs(nachImport.ecke.y - gezogen.y) < 0.5,
    `G7: die gesicherte Datei laesst sich wieder laden (Ecke bei ${nachImport.ecke?.x}, ${nachImport.ecke?.y}, ${nachImport.zahlen.ecken} Ecken)`
  )

  // Und Unsinn wird ehrlich abgelehnt statt zu zerbrechen.
  const unsinn = path.join(DIR, 'kein-plan.json')
  fs.writeFileSync(unsinn, JSON.stringify({ hallo: 'welt' }))
  await page.setInputFiles('#dateiWahl', unsinn)
  await page.waitForTimeout(600)
  const abgelehnt = await page.evaluate(() => {
    const m = document.getElementById('meldung')
    return { sichtbar: !m.hidden, text: m.textContent, ecken: window.__planerDatei.zahlen().ecken }
  })
  pruefe(
    abgelehnt.sichtbar && abgelehnt.ecken === 76,
    `G7: eine fremde Datei wird abgelehnt statt zu zerbrechen ("${abgelehnt.text}")`
  )
}

/* ══ G6 — der Stand ueberlebt einen echten Neustart der Seite ══════════
   Gemessen wird NICHT der Schreibbefehl, sondern das Wiedersehen: die Seite
   wird komplett neu geladen. Ein "ich habe geschrieben" ist eine Behauptung. */
await page.waitForTimeout(1200)
const gesichert = await page.evaluate(() => ({
  am: window.__planerDatei.gesichertAm(),
  stand: window.__planerDatei.speicherStand() ? window.__planerDatei.speicherStand().length : 0
}))
log(`     im Browser gesichert: ${gesichert.am} (${(gesichert.stand / 1024).toFixed(0)} KB)`)

await page.reload({ waitUntil: 'domcontentloaded' })
const bereit2 = await warteBereit(page)
pruefe(bereit2, 'G6: die Datei kommt nach dem Neuladen wieder hoch')
const nachNeuladen = await page.evaluate((id) => ({
  ecke: window.__planerDatei.ecke(id),
  zahlen: window.__planerDatei.zahlen(),
  text: document.getElementById('standText').textContent
}), wahl.id)
nachNeuladen.stand = await sichtbar(page, '#standleiste')
log(`     nach dem Neuladen: Ecke(${nachNeuladen.ecke?.x}, ${nachNeuladen.ecke?.y}) · Hinweis "${nachNeuladen.text}"`)
pruefe(
  nachNeuladen.ecke && Math.abs(nachNeuladen.ecke.x - gezogen.x) < 0.5 && Math.abs(nachNeuladen.ecke.y - gezogen.y) < 0.5,
  'G6: die Ecke steht nach dem Neuladen noch an der neuen Stelle'
)
pruefe(nachNeuladen.stand === true, `G6: der Hinweis auf den eigenen Stand ist sichtbar ("${nachNeuladen.text}")`)

// --- GEGENPROBE: zuruecksetzen bringt den gemessenen Plan zurueck.
await klick(page, 'btnBearbeiten')
await page.waitForTimeout(300)
const werkzeugeDa = await page.evaluate(() => window.__planerDatei.werkzeugeSichtbar())
if (!werkzeugeDa) await klick(page, 'btnBearbeiten')
await page.waitForTimeout(200)
await klick(page, 'btnZurueck')
await page.waitForTimeout(250)
await klick(page, 'btnZurueckJa')
await page.waitForTimeout(800)
const nachReset = await page.evaluate((id) => ({
  ecke: window.__planerDatei.ecke(id),
  zahlen: window.__planerDatei.zahlen(),
  stand: window.__planerDatei.speicherStand()
}), wahl.id)
pruefe(
  nachReset.ecke && Math.abs(nachReset.ecke.x - wahl.x) < 0.5 && Math.abs(nachReset.ecke.y - wahl.y) < 0.5,
  `G6: GEGENPROBE — nach dem Zuruecksetzen steht sie wieder am Ursprung (${nachReset.ecke?.x}, ${nachReset.ecke?.y})`
)
pruefe(nachReset.stand === null, 'G6: GEGENPROBE — der eigene Stand ist danach wirklich weg (nicht nur verdeckt)')
pruefe(
  nachReset.zahlen.ecken === 76 && nachReset.zahlen.waende === 100 && nachReset.zahlen.raeume === 25,
  `G6: GEGENPROBE — der gemessene Plan ist vollstaendig zurueck (${nachReset.zahlen.ecken}/${nachReset.zahlen.waende}/${nachReset.zahlen.raeume})`
)

/* ══ G9 — zwei Kopien in zwei Ordnern greifen nicht ineinander ═════════
   `file://` ist EIN Ursprung fuer die ganze Festplatte — gemessen: eine Datei
   in Ordner B liest den Wert, den eine Datei in Ordner A geschrieben hat. Ohne
   Kennzeichnung im Schluessel uebernaehme die Kopie im Download-Ordner still
   die Aenderungen der Arbeitskopie. Genau das wird hier geprueft. */
const ordnerA = path.join(DIR, 'ordnerA')
const ordnerB = path.join(DIR, 'ordnerB')
fs.mkdirSync(ordnerA)
fs.mkdirSync(ordnerB)
fs.copyFileSync(DATEI, path.join(ordnerA, 'Halle400-Modell.html'))
fs.copyFileSync(DATEI, path.join(ordnerB, 'Halle400-Modell.html'))

const seiteA = beobachte(await ctx.newPage())
await seiteA.goto(pathToFileURL(path.join(ordnerA, 'Halle400-Modell.html')).href, { waitUntil: 'domcontentloaded' })
await warteBereit(seiteA)
await klick(seiteA, 'btnBearbeiten')
await seiteA.waitForTimeout(500)
await seiteA.evaluate((p) => {
  const m = window.__planerDatei.maus
  m('mousemove', p.bx, p.by)
  m('mousedown', p.bx, p.by)
  for (let i = 1; i <= 10; i++) m('mousemove', p.bx + (p.dx * i) / 10, p.by + (p.dy * i) / 10)
  m('mouseup', p.bx + p.dx, p.by + p.dy)
}, { bx: wahl.bx, by: wahl.by, dx: ZIEH_X, dy: ZIEH_Y })
await seiteA.waitForTimeout(1400)
const standA = await seiteA.evaluate((id) => ({
  ecke: window.__planerDatei.ecke(id),
  schluessel: window.__planerDatei.schluessel,
  gesichert: !!window.__planerDatei.speicherStand()
}), wahl.id)
pruefe(
  standA.gesichert && standA.ecke && Math.hypot(standA.ecke.x - wahl.x, standA.ecke.y - wahl.y) > 100,
  `G9: in Ordner A wurde verschoben und gesichert (${standA.ecke?.x}, ${standA.ecke?.y})`
)

const seiteB = beobachte(await ctx.newPage())
await seiteB.goto(pathToFileURL(path.join(ordnerB, 'Halle400-Modell.html')).href, { waitUntil: 'domcontentloaded' })
await warteBereit(seiteB)
const standB = await seiteB.evaluate((id) => ({
  ecke: window.__planerDatei.ecke(id),
  schluessel: window.__planerDatei.schluessel
}), wahl.id)
standB.leiste = await sichtbar(seiteB, '#standleiste')
log(`     Schluessel A: ${standA.schluessel}`)
log(`     Schluessel B: ${standB.schluessel}`)
pruefe(standA.schluessel !== standB.schluessel, 'G9: beide Kopien haben eigene Speicher-Schluessel')
pruefe(
  standB.ecke && Math.abs(standB.ecke.x - wahl.x) < 0.5 && Math.abs(standB.ecke.y - wahl.y) < 0.5,
  `G9: die Kopie in Ordner B uebernimmt den fremden Zug NICHT (${standB.ecke?.x}, ${standB.ecke?.y})`
)
pruefe(standB.leiste === false, 'G9: sie zeigt auch keinen fremden "eigenen Stand"')

// Und die Kopie in A behaelt ihren eigenen Stand ueber einen Neustart.
await seiteA.reload({ waitUntil: 'domcontentloaded' })
await warteBereit(seiteA)
const standANeu = await seiteA.evaluate((id) => window.__planerDatei.ecke(id), wahl.id)
pruefe(
  standANeu && Math.abs(standANeu.x - standA.ecke.x) < 0.5,
  `G9: Ordner A behaelt seinen eigenen Stand (${standANeu?.x}, ${standANeu?.y})`
)

/* ══ G10 — die Loesch-Rueckfrage ══════════════════════════════════════
   Sie laeuft auf der unberuehrten Kopie B, damit sie den Zug aus A nicht
   stoert. Zwei Wege werden gemessen, nicht einer: Abbrechen darf NICHTS
   loeschen — ein Gate, das nur "Entfernen entfernt" prueft, bestuende auch
   dann, wenn beide Knoepfe dasselbe taeten. */
await klick(seiteB, 'btnBearbeiten')
await seiteB.waitForTimeout(500)
const wand = await seiteB.evaluate(() => {
  const ecken = window.__planerDatei.ecken()
  const kandidaten = window.__planerDatei.waende()
    .map((w) => ({ x: (w.ax + w.bx) / 2, y: (w.ay + w.by) / 2, laenge: Math.hypot(w.bx - w.ax, w.by - w.ay) }))
    .filter((m) =>
      m.laenge > 60 && m.x > 260 && m.x < 1340 && m.y > 160 && m.y < 800 &&
      !ecken.some((e) => Math.hypot(e.bx - m.x, e.by - m.y) < 30)
    )
  kandidaten.sort((a, b) => b.laenge - a.laenge)
  return kandidaten[0] || null
})
pruefe(wand !== null, 'G10: eine Wand zum Anfassen gefunden')

const tippe = (p, x, y) =>
  p.evaluate((q) => {
    const m = window.__planerDatei.maus
    m('mousemove', q.x, q.y)
    m('mousedown', q.x, q.y)
    m('mouseup', q.x, q.y)
  }, { x, y })

if (wand) {
  await klick(seiteB, 'wzDelete')
  await seiteB.waitForTimeout(300)
  await tippe(seiteB, wand.x, wand.y)
  await seiteB.waitForTimeout(400)
  const frageDa = await sichtbar(seiteB, '#rueckfrage')
  const frageText = await seiteB.evaluate(() => document.getElementById('rueckfrageZiel').textContent)
  pruefe(frageDa && /m lang/.test(frageText), `G10: die Rueckfrage benennt, was verschwindet ("${frageText}")`)
  await seiteB.screenshot({ path: path.join(DIR, 'E_loesch_rueckfrage.png') })

  await klick(seiteB, 'btnAbbrechen')
  await seiteB.waitForTimeout(300)
  const nachAbbruch = await seiteB.evaluate(() => window.__planerDatei.zahlen())
  pruefe(
    (await sichtbar(seiteB, '#rueckfrage')) === false && nachAbbruch.waende === 100,
    `G10: GEGENPROBE — "Abbrechen" loescht NICHTS (${nachAbbruch.waende} Waende)`
  )

  await tippe(seiteB, wand.x, wand.y)
  await seiteB.waitForTimeout(400)
  await klick(seiteB, 'btnEntfernen')
  await seiteB.waitForTimeout(500)
  const nachLoeschen = await seiteB.evaluate(() => window.__planerDatei.zahlen())
  pruefe(
    (await sichtbar(seiteB, '#rueckfrage')) === false && nachLoeschen.waende === 99,
    `G10: "Entfernen" nimmt genau eine Wand weg (${nachLoeschen.waende} Waende)`
  )

  await klick(seiteB, 'btnUndo')
  await seiteB.waitForTimeout(500)
  const nachUndo2 = await seiteB.evaluate(() => window.__planerDatei.zahlen())
  pruefe(
    nachUndo2.waende === 100 && nachUndo2.raeume === 25,
    `G10: Rueckgaengig bringt sie zurueck (${nachUndo2.waende} Waende, ${nachUndo2.raeume} Raeume)`
  )
}

pruefe(
  konsolenFehler.length === 0,
  `G1: auch nach allen Zuegen keine Konsolenfehler (${konsolenFehler.length}${konsolenFehler.length ? ': ' + konsolenFehler.slice(0, 3).join(' | ') : ''})`
)
pruefe(blockiert.length === 0, `G1: auch nach allen Zuegen keine Anfrage nach draussen (${blockiert.length})`)

await ctx.close()

log('')
log(fehler.length === 0 ? 'ALLE PRUEFUNGEN BESTANDEN' : `DURCHGEFALLEN: ${fehler.length}`)
fehler.forEach((f) => log('  - ' + f))
log(`Bilder + Bericht: ${DIR}`)
log('  A_startansicht.png · B_bearbeiten.png · C_nach_dem_zug.png · D_blatt_folgt.png · E_loesch_rueckfrage.png')
process.exit(fehler.length === 0 ? 0 : 1)
