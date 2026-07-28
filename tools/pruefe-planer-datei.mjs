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

/* ══ G2 — der Bearbeiten-Schalter LAESST DIE ANSICHT STEHEN ════════════
   W7, auf ausdruecklichen Wunsch des Nutzers: „wenn ich bearbeiten klicke soll
   die ansicht dieselbe sein wie die zuletzt angesehene". Bis dahin sprang der
   Schalter in den Grundriss — genau das hat dieses Gate frueher VERLANGT. Es
   verlangt jetzt das Gegenteil, und zwar aus BEIDEN Ansichten heraus, damit
   die Kopplung nicht bloss die Richtung wechselt.

   Der zweite Teil ist der wichtigere: was der Schalter NICHT anfasst. Ohne
   „Bearbeiten" bleibt die Zeichenflaeche taub (K3) — gemessen mit
   \`page.mouse\`, denn nur die geht durch die Treffer-Ermittlung des Browsers.
   \`dispatchEvent\` ruft die Zuhoerer direkt auf und uebersaehe genau das. */
const werkzeugeVorherApi = await page.evaluate(() => window.__planerDatei.werkzeugeSichtbar())
const werkzeugeVorherAuge = await sichtbar(page, '#werkzeuge')
pruefe(
  werkzeugeVorherApi === false && werkzeugeVorherAuge === false,
  'G2: die Werkzeuge sind im Auslieferungszustand NICHT sichtbar'
)

// --- aus der AXONOMETRIE heraus einschalten (hier steht die Datei gerade).
const vorSchalter = await page.evaluate(() => window.__planerDatei.ansicht())
await klick(page, 'btnBearbeiten')
await page.waitForTimeout(400)
const inAxo = await page.evaluate(() => ({
  ansicht: window.__planerDatei.ansicht(),
  bearbeitet: window.__planerDatei.bearbeitet(),
  werkzeuge: window.__planerDatei.werkzeugeSichtbar(),
  hinweis: window.__planerDatei.arbeitshinweisText()
}))
pruefe(
  vorSchalter === 'axo' && inAxo.ansicht === 'axo',
  `G2: aus der Axonometrie heraus bleibt die Axonometrie stehen (${vorSchalter} -> ${inAxo.ansicht})`
)
pruefe(inAxo.bearbeitet === true, 'G2: der Bearbeiten-Zustand ist trotzdem an')
/* KEINE toten Knoepfe: die Werkzeugleiste liegt im Grundriss-Umschlag und ist
   hier gar nicht zu sehen — an ihrer Stelle steht die ruhige Zeile. */
pruefe(
  inAxo.werkzeuge === false && (await sichtbar(page, '#werkzeuge')) === false,
  'G2: in der Axonometrie ist die Werkzeugleiste NICHT zu sehen (dort wird nicht bearbeitet)'
)
pruefe(
  !!inAxo.hinweis && inAxo.hinweis.indexOf('Grundriss') !== -1,
  `G2: stattdessen sagt eine ruhige Zeile, wo gezeichnet wird ("${inAxo.hinweis}")`
)
await page.screenshot({ path: path.join(DIR, 'B1_bearbeiten_axonometrie.png') })

// --- jetzt in den Grundriss: DA sind die Werkzeuge.
await klick(page, 'btnAnsichtPlan')
await page.waitForTimeout(400)
const imPlan = await page.evaluate(() => ({
  api: window.__planerDatei.werkzeugeSichtbar(),
  ansicht: window.__planerDatei.ansicht(),
  hinweis: window.__planerDatei.arbeitshinweisSichtbar()
}))
pruefe(
  imPlan.api === true && (await sichtbar(page, '#werkzeuge')) === true,
  'G2: im Grundriss sind sie sichtbar'
)
pruefe(imPlan.hinweis === false, 'G2: und die ruhige Zeile ist dort weg — sie gehoert dem Blatt')

// --- GEGENPROBE 1: aus dem GRUNDRISS heraus ausschalten laesst ihn ebenso stehen.
await klick(page, 'btnBearbeiten')
await page.waitForTimeout(400)
const ausImPlan = await page.evaluate(() => ({
  ansicht: window.__planerDatei.ansicht(),
  bearbeitet: window.__planerDatei.bearbeitet(),
  werkzeuge: window.__planerDatei.werkzeugeSichtbar(),
  scharf: window.__planerDatei.zeichenflaecheScharf()
}))
pruefe(
  ausImPlan.ansicht === 'plan' && ausImPlan.bearbeitet === false && ausImPlan.werkzeuge === false,
  `G2: GEGENPROBE — Ausschalten im Grundriss laesst den Grundriss stehen (${JSON.stringify(ausImPlan)})`
)

/* --- GEGENPROBE 2 (K3, die wichtigste): ohne „Bearbeiten" bewegt ein ECHTER
   Mauszug im Grundriss NICHTS am Modell. Dass die Hand wirklich aufs Blatt
   getroffen hat, wird mitgemessen — das Blatt WANDERT (Lese-Navigation), die
   Weltkoordinate bleibt. Eine Gegenprobe, in der gar nichts ankommt, waere
   auch dann gruen, wenn die Maus ins Leere zeigte. */
pruefe(ausImPlan.scharf === false, 'G2: die Zeichenflaeche nimmt ohne „Bearbeiten" keine Zeiger-Ereignisse an')
const vorZug = await page.evaluate(() => {
  const ecken = window.__planerDatei.ecken()
  const passend = ecken.filter((e) => e.bx > 300 && e.bx < 1300 && e.by > 200 && e.by < 780)
  return passend[0] || null
})
pruefe(vorZug !== null, 'G2: eine Ecke im Bild gefunden, an der gezogen werden kann')
if (vorZug) {
  await page.mouse.move(vorZug.bx, vorZug.by)
  await page.mouse.down()
  for (let i = 1; i <= 10; i++) await page.mouse.move(vorZug.bx + i * 6, vorZug.by + i * 5)
  await page.mouse.up()
  await page.waitForTimeout(400)
  const nachZug = await page.evaluate((id) => {
    const e = window.__planerDatei.ecken().find((k) => k.id === id)
    return e ? { x: e.x, y: e.y, bx: e.bx, by: e.by } : null
  }, vorZug.id)
  pruefe(
    nachZug && nachZug.x === vorZug.x && nachZug.y === vorZug.y,
    `G2: GEGENPROBE — ohne „Bearbeiten" verschiebt ein Mauszug im Grundriss NICHTS (Welt ${vorZug.x},${vorZug.y} -> ${nachZug?.x},${nachZug?.y})`
  )
  pruefe(
    nachZug && Math.hypot(nachZug.bx - vorZug.bx, nachZug.by - vorZug.by) > 20,
    `G2: die Hand kam wirklich an — das Blatt ist mitgewandert (Bild ${vorZug.bx.toFixed(0)},${vorZug.by.toFixed(0)} -> ${nachZug?.bx.toFixed(0)},${nachZug?.by.toFixed(0)})`
  )
}

// --- wieder scharf stellen: alles Weitere prueft das Bearbeiten.
await klick(page, 'btnBearbeiten')
await page.waitForTimeout(400)
// Die Lese-Navigation hat die Ansicht verschoben; die ganze Halle wieder ins
// Bild, sonst sucht G4 gleich eine Ecke an einer Stelle, die es nicht mehr gibt.
await klick(page, 'btnEinpassen')
await page.waitForTimeout(400)
const wiederAn = await page.evaluate(() => ({
  bearbeitet: window.__planerDatei.bearbeitet(),
  ansicht: window.__planerDatei.ansicht(),
  scharf: window.__planerDatei.zeichenflaecheScharf()
}))
pruefe(
  wiederAn.bearbeitet === true && wiederAn.ansicht === 'plan' && wiederAn.scharf === true,
  `G2: mit „Bearbeiten" ist sie scharf, und der Grundriss steht weiter (${JSON.stringify(wiederAn)})`
)
await page.screenshot({ path: path.join(DIR, 'B2_bearbeiten_grundriss.png') })

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

/* W10 — DAS WAND-WERKZEUG GREIFEN. Bis hierher lief dieser Zug im
   Verschieben-Werkzeug, weil dort BEIDES ging: Moebel und Bausubstanz. Genau
   das war der schwerste Befund des Bedien-Audits (C2): derselbe Zug, der einen
   Stuhl umstellt, verschob ohne Rueckfrage die Aussenwand um 2,24 m. Seit W10
   sind es zwei Werkzeuge — dieses Gate misst das WAND-Ziehen und sagt das
   jetzt auch. Die Trennung selbst prueft `pruefe-schutz.mjs` A, mit
   Gegenprobe in beide Richtungen. */
await klick(page, 'wzWand')
await page.waitForTimeout(200)
pruefe(
  (await page.evaluate(() => window.__planerDatei.werkzeug())) === 4,
  'G4: das Wand-Werkzeug ist gegriffen (seit W10 zieht nur es Bausubstanz)'
)

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
  await page.waitForTimeout(500)
  // K1: „Laden" fragt seit der Haertung nach, bevor es den Stand ersetzt —
  // genau wie „Zuruecksetzen". Ohne diesen Klick bliebe der alte Stand stehen,
  // und das ist kein Fehler, sondern der Sinn der Rueckfrage.
  pruefe(
    await sichtbar(page, '#ladeFrage'),
    'G7: „Laden" fragt VOR dem Ersetzen nach (K1)'
  )
  await klick(page, 'btnLadeJa')
  await page.waitForTimeout(900)
  /* Das „Zuruecksetzen" zwei Zeilen weiter oben hat den AUSLIEFERUNGSZUSTAND
     hergestellt (M7): ruhiges Blatt, keine Werkzeuge — und seit W7 ist dabei
     auch der gemerkte Ansichts-Schluessel geloescht. Wer weiterarbeiten will,
     greift beides neu; genau das tut hier der Nutzer. Ohne diese zwei Zeilen
     maesse G6 gleich den Neustart eines zurueckgesetzten Blattes und nicht
     den einer laufenden Arbeit. */
  await klick(page, 'btnBearbeiten')
  await klick(page, 'btnAnsichtPlan')
  await page.waitForTimeout(400)
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
  // GEMESSEN statt aus `hidden` geraten: `element.hidden` sagt nichts ueber
  // `display:none` aus einer Medienabfrage und nichts ueber einen unsichtbaren
  // Vorfahren. Genau diese Messgroesse hat einmal `true` fuer etwas gemeldet,
  // das gar nicht zu sehen war.
  const abgelehntSichtbar = await sichtbar(page, '#meldung')
  const abgelehnt = await page.evaluate(() => ({
    text: document.getElementById('meldung').textContent,
    ecken: window.__planerDatei.zahlen().ecken,
    // Und die Rueckfrage darf gar nicht erst kommen: ueber etwas, das ohnehin
    // abgelehnt wird, fragt man nicht.
    frage: window.__planerDatei.ladeFrageOffen()
  }))
  pruefe(
    abgelehntSichtbar && abgelehnt.ecken === 76 && abgelehnt.frage === false,
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

/* WAS genau gemerkt wurde, VOR dem Neuladen — sonst steht bei einem
   Fehlschlag nur da, dass etwas anderes zurueckkam, und nicht, ob es gar nicht
   erst geschrieben wurde. Der Plan-Schluessel wird nur als "(Stand)" gezeigt:
   sein Wert sind 83 KB JSON. */
const gemerktVor = await page.evaluate(() => {
  const o = {}
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    o[k.split(':').slice(0, 2).join(':')] = k.indexOf(':plan:') !== -1 ? '(Stand)' : localStorage.getItem(k)
  }
  return { speicher: o, bearbeitet: window.__planerDatei.bearbeitet(), ansicht: window.__planerDatei.ansicht() }
})
log(`     gemerkt vor dem Neuladen: ${JSON.stringify(gemerktVor)}`)

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

/* W7 — DIE BEIDEN GEMERKTEN ANGABEN PASSEN ZUSAMMEN. Vor dem Neuladen stand
   der bearbeitbare Grundriss da; genau der muss wiederkommen. Sie liegen seit
   W7 in ZWEI Schluesseln (der Schalter zieht die Ansicht nicht mehr mit) —
   gerade deshalb wird hier gemessen, dass sie nicht auseinanderlaufen. */
const gemerkt = await page.evaluate(() => ({
  bearbeitet: window.__planerDatei.bearbeitet(),
  ansicht: window.__planerDatei.ansicht(),
  werkzeuge: window.__planerDatei.werkzeugeSichtbar()
}))
pruefe(
  gemerkt.bearbeitet === true && gemerkt.ansicht === 'plan' && gemerkt.werkzeuge === true,
  `G6: der Neustart bringt Bearbeiten-Zustand UND zuletzt angesehene Ansicht zurueck (${JSON.stringify(gemerkt)})`
)

/* Und der obere Rand traegt beides nebeneinander: der Arbeitshinweis steht in
   der Axonometrie ueber der Standleiste, die hier gerade den eigenen Stand
   meldet. GEMESSEN an den Rechtecken, nicht am Standbild geschaetzt — zwei
   feste Leisten an derselben Stelle liegen sonst uebereinander, und das faellt
   erst dem Nutzer auf. */
await klick(page, 'btnAnsichtAxo')
await page.waitForTimeout(700)
const oben = await page.evaluate(() => {
  const r = (id) => {
    const e = document.getElementById(id)
    if (!e || !e.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })) return null
    const k = e.getBoundingClientRect()
    return { oben: Math.round(k.top), unten: Math.round(k.bottom) }
  }
  return { hinweis: r('arbeitshinweis'), stand: r('standleiste') }
})
pruefe(
  oben.hinweis !== null && oben.stand !== null && oben.hinweis.unten <= oben.stand.oben,
  `G6: Arbeitshinweis und Standleiste stehen untereinander, nicht uebereinander (${JSON.stringify(oben)})`
)
await page.screenshot({ path: path.join(DIR, 'B3_hinweis_und_standleiste.png') })
await klick(page, 'btnAnsichtPlan')
await page.waitForTimeout(400)

// --- GEGENPROBE: zuruecksetzen bringt den gemessenen Plan zurueck.
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
// Werkzeuge EIN und in den Grundriss — seit W7 zwei getrennte Griffe (G2).
// Und seit W10 ein dritter: nur das WAND-Werkzeug zieht Bausubstanz (C2).
await klick(seiteA, 'btnBearbeiten')
await klick(seiteA, 'btnAnsichtPlan')
await seiteA.waitForTimeout(500)
await klick(seiteA, 'wzWand')
await seiteA.waitForTimeout(200)
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
   dann, wenn beide Knoepfe dasselbe taeten.

   Der Wechsel in den Grundriss ist hier nicht Zierat: die Rueckfrage
   `#rueckfrage` liegt IM Grundriss-Umschlag. Seit W7 zieht der
   Bearbeiten-Schalter die Ansicht nicht mehr mit — ohne die zweite Zeile fragte
   hier etwas Unsichtbares, und genau das hat dieses Gate beim ersten Lauf
   gemeldet. */
await klick(seiteB, 'btnBearbeiten')
await klick(seiteB, 'btnAnsichtPlan')
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
log('  A_startansicht.png · B1_bearbeiten_axonometrie.png · B2_bearbeiten_grundriss.png · B3_hinweis_und_standleiste.png · C_nach_dem_zug.png · D_blatt_folgt.png · E_loesch_rueckfrage.png')
process.exit(fehler.length === 0 ? 0 : 1)
