// Prueft die HAERTUNG (W6) der Doppelklick-Datei — die Fuende, die 411 gruene
// Pruefungen NICHT gesehen haben, weil sie die Datei gelesen und nicht BEDIENT
// haben.
//
//   node tools/baue-planer-datei.mjs
//   node tools/pruefe-haertung.mjs
// Exit 0 = alle Pruefungen bestanden, 1 = mindestens eine durchgefallen.
//
// ZWEI DINGE UNTERSCHEIDEN DIESES WERKZEUG VON DEN ANDEREN
//
// 1. ES BENUTZT ECHTE ZEIGER-EREIGNISSE (`page.mouse`), nicht `dispatchEvent`.
//    Das ist hier keine Feinheit, sondern die ganze Pruefung: `dispatchEvent`
//    ruft die Zuhoerer eines Elements DIREKT auf und fragt nie, ob dieses
//    Element ueberhaupt getroffen werden kann. Genau daran ist K3 fuenf Wellen
//    lang vorbeigemessen worden — mit `dispatchEvent` sieht eine Zeichenflaeche
//    mit `pointer-events:none` aus wie eine scharfe. Nur `page.mouse` geht
//    durch die Treffer-Ermittlung des Browsers, so wie eine Hand.
//
// 2. JEDE PRUEFUNG HAT EINE GEGENPROBE. Eine Pruefung, die nie rot werden kann,
//    ist keine. „Das Moebel bewegt sich nicht" bestuende auch dann, wenn die
//    Koordinaten daneben lagen — deshalb wird DERSELBE Zug mit eingeschaltetem
//    Bearbeiten wiederholt und MUSS dann wirken.
//
// GEPRUEFT WERDEN (Kennungen wie im Befund):
//   K3  ohne „Bearbeiten" ist die Zeichenflaeche taub — Ansehen und Zoomen
//       bleiben
//   K1  „Laden" fragt, bevor es den Stand ersetzt
//   K2  die Formpruefung prueft ZAHLEN; das Laden ist atomar
//   K4  zwei Fenster derselben Datei ueberschreiben sich nicht mehr lautlos
//   M1  frei Gesetztes sieht in der Axonometrie anders aus als Gemessenes
//   M2  Waende tragen eine Herkunft; das Blatt nennt veraenderte Waende
//   M5  der Ausdruck ist ein Blatt und kein Bildschirmfoto
//   M6  ein ungesicherter Zug haelt das Schliessen auf
//   M7  „Zuruecksetzen" stellt den AUSLIEFERUNGSZUSTAND her
//   M8  ein Stand desselben Plans an einem anderen Ablageort wird angeboten
//   G1  Masse stehen deutsch da (5,12 m), mit fester Stellenzahl
//   G2  der Ladehinweis zaehlt am MODELL, nicht in der Datei
//   G4  fremde `items` gehen beim Sichern nicht still verloren
//   MG  Sichtbarkeit wird GEMESSEN (checkVisibility), nicht aus `hidden`
//       geraten — die Messgroesse, auf der 67 Pruefungen fussten
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

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'h400-haertung-'))
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

if (!fs.existsSync(DATEI)) {
  log(`FEHL die Doppelklick-Datei fehlt (${DATEI}) — erst "node tools/baue-planer-datei.mjs"`)
  process.exit(1)
}

/* Zwei ABLAGEORTE. `file://` ist EIN Ursprung fuer die ganze Festplatte, der
   Speicherschluessel traegt deshalb den Ort — M8 laesst sich ohne zwei echte
   Ordner gar nicht messen. */
const ORT_A = path.join(DIR, 'ordner-a')
const ORT_B = path.join(DIR, 'ordner-b')
fs.mkdirSync(ORT_A)
fs.mkdirSync(ORT_B)
fs.copyFileSync(DATEI, path.join(ORT_A, 'Halle400-Modell.html'))
fs.copyFileSync(DATEI, path.join(ORT_B, 'Halle400-Modell.html'))
const URL_A = pathToFileURL(path.join(ORT_A, 'Halle400-Modell.html')).href
const URL_B = pathToFileURL(path.join(ORT_B, 'Halle400-Modell.html')).href

const browser = await chromium.launch()

/** Ein frisches Fenster mit gesperrtem Netz. Jede Pruefung bekommt einen
 *  eigenen Kontext: ein localStorage, den eine Vorpruefung gefuellt hat, waere
 *  ein Messfehler, den man erst nach Stunden findet. */
async function fenster(url, opt = {}) {
  const ctx = await browser.newContext({
    viewport: opt.viewport || { width: 1440, height: 900 },
    acceptDownloads: true
  })
  const draussen = []
  await ctx.route('**/*', (route) => {
    const u = route.request().url()
    if (u.startsWith('file://') || u.startsWith('data:') || u.startsWith('blob:')) return route.continue()
    draussen.push(u)
    return route.abort()
  })
  const page = await ctx.newPage()
  const konsole = []
  page.on('console', (m) => {
    if (m.type() === 'error') konsole.push(m.text().slice(0, 160))
  })
  page.on('pageerror', (e) => konsole.push('PAGE-ERR: ' + String(e).slice(0, 160)))
  await page.goto(url || URL_A, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__bereit === true, { timeout: 30000 })
  return { ctx, page, konsole, draussen }
}

/** Bearbeiten an UND in den Grundriss.
 *
 *  ZWEI Klicks, seit W7 unvermeidlich: der Bearbeiten-Schalter laesst die
 *  Ansicht stehen (ausdruecklicher Nutzerwunsch), und in der Axonometrie wird
 *  nicht bearbeitet. Wer hier ziehen will, muss also beides sagen — genau wie
 *  eine Hand es tun muesste. Das Zusammenziehen in EINEN Helfer ist Absicht:
 *  jede der folgenden Pruefungen will "bearbeitbarer Grundriss", keine will
 *  "Schalter gedrueckt". */
const bearbeitenAn = async (page) => {
  await page.evaluate(() => {
    if (!window.__planerDatei.bearbeitet()) {
      document.getElementById('btnBearbeiten').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    }
    if (window.__planerDatei.ansicht() !== 'plan') {
      document.getElementById('btnAnsichtPlan').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    }
  })
  await page.waitForTimeout(500)
}

/** ECHTES Ziehen mit der Maus — durch die Treffer-Ermittlung des Browsers. */
async function ziehe(page, x1, y1, x2, y2, schritte = 12) {
  await page.mouse.move(x1, y1)
  await page.mouse.down()
  for (let i = 1; i <= schritte; i++) {
    await page.mouse.move(x1 + ((x2 - x1) * i) / schritte, y1 + ((y2 - y1) * i) / schritte)
  }
  await page.mouse.up()
  await page.waitForTimeout(60)
}

/* ══════════════════════════════════════════════════════════════════════
   K3 — OHNE „BEARBEITEN" IST DIE ZEICHENFLAECHE TAUB
   Gemessen wurde: ein Klick auf „Grundriss" genuegte, um ein Moebel zu ziehen;
   danach standen 1 gesetztes Stueck und 84 510 Bytes im Speicher, und der
   Blattkopf sagte dauerhaft „1 Stück frei gesetzt — kein Aufmaß".
   ══════════════════════════════════════════════════════════════════════ */
log('\n── K3: scharf erst mit „Bearbeiten" ──')
{
  const { ctx, page, konsole } = await fenster()

  const start = await page.evaluate(() => ({
    ansicht: window.__planerDatei.ansicht(),
    bearbeitet: window.__planerDatei.bearbeitet(),
    scharf: window.__planerDatei.zeichenflaecheScharf()
  }))
  pruefe(
    start.ansicht === 'axo' && start.bearbeitet === false && start.scharf === false,
    `K3: im Auslieferungszustand nimmt die Zeichenflaeche keine Zeiger-Ereignisse an (${JSON.stringify(start)})`
  )

  // Die Beraterin klickt „Grundriss" — mehr nicht.
  await page.evaluate(() => document.getElementById('btnAnsichtPlan').dispatchEvent(new MouseEvent('click', { bubbles: true })))
  await page.waitForTimeout(400)
  const imPlan = await page.evaluate(() => ({
    ansicht: window.__planerDatei.ansicht(),
    scharf: window.__planerDatei.zeichenflaecheScharf()
  }))
  pruefe(
    imPlan.ansicht === 'plan' && imPlan.scharf === false,
    `K3: auch im Grundriss bleibt sie taub, solange nicht bearbeitet wird (${JSON.stringify(imPlan)})`
  )

  /** Ein Stueck, das wirklich unter dem Zeiger liegt. */
  const ziel = await page.evaluate(() => {
    const a = window.__planerDatei.ausstattung().filter((x) => x.bx > 300 && x.bx < 1300 && x.by > 180 && x.by < 800)
    return a[0] || null
  })
  pruefe(ziel !== null, `K3: ein Stueck zum Anfassen gefunden (${ziel ? ziel.typ + ' ' + ziel.id : 'keins'})`)

  if (ziel) {
    await ziehe(page, ziel.bx, ziel.by, ziel.bx + 80, ziel.by + 60)
    await page.waitForTimeout(900)
    const nachZug = await page.evaluate((id) => ({
      st: window.__planerDatei.stueck(id),
      gesetzte: window.__planerDatei.gesetzte(),
      kopf: window.__planerDatei.gesetztText(),
      bytes: (window.__planerDatei.speicherStand() || '').length
    }), ziel.id)
    pruefe(
      nachZug.st && Math.abs(nachZug.st.x - ziel.x) < 0.001 && Math.abs(nachZug.st.y - ziel.y) < 0.001,
      `K3: ein echter Mauszug bewegt NICHTS (Welt ${ziel.x}/${ziel.y} -> ${nachZug.st?.x}/${nachZug.st?.y})`
    )
    pruefe(
      nachZug.gesetzte === 0 && nachZug.kopf === null,
      `K3: nichts gilt als frei gesetzt, der Blattkopf schweigt (${nachZug.gesetzte}, ${JSON.stringify(nachZug.kopf)})`
    )
    pruefe(nachZug.bytes === 0, `K3: und es wurde NICHTS gespeichert (${nachZug.bytes} Bytes)`)

    /* Der Zug hat die ANSICHT geschoben — das soll er: ansehbar und zoombar
       bleibt das Blatt. Gemessen an der Bild-Lage desselben Weltpunktes. */
    const nachSchub = await page.evaluate((id) => window.__planerDatei.stueck(id), ziel.id)
    pruefe(
      Math.abs(nachSchub.bx - ziel.bx) > 20,
      `K3: der Zug hat statt des Moebels die ANSICHT verschoben (Bild ${Math.round(ziel.bx)} -> ${Math.round(nachSchub.bx)})`
    )

    // Zoomen bleibt ebenfalls: das Rad wirkt, ohne dass etwas scharf waere.
    const zoomVor = await page.evaluate(() => document.getElementById('zoomAnzeige').textContent)
    await page.mouse.move(700, 450)
    await page.mouse.wheel(0, -500)
    await page.waitForTimeout(300)
    const zoomNach = await page.evaluate(() => document.getElementById('zoomAnzeige').textContent)
    pruefe(zoomVor !== zoomNach, `K3: das Rad zoomt weiterhin (${zoomVor} -> ${zoomNach})`)

    /* Am Handy landen die Finger jetzt auf dem UMSCHLAG statt auf dem Canvas.
       Ohne `touch-action:none` DORT zoomte der Browser die ganze Seite, statt
       dass der Grundriss folgt — das Canvas allein reicht seit K3 nicht mehr. */
    const griff = await page.evaluate(() => ({
      umschlag: getComputedStyle(document.getElementById('plan')).touchAction,
      canvas: getComputedStyle(document.getElementById('grundriss-canvas')).touchAction
    }))
    pruefe(
      griff.umschlag === 'none' && griff.canvas === 'none',
      `K3: der Umschlag haelt die Finger-Geste fest, nicht nur das Canvas (${JSON.stringify(griff)})`
    )

    /* ── GEGENPROBE ──────────────────────────────────────────────────────
       DERSELBE Zug mit eingeschaltetem Bearbeiten MUSS wirken. Ohne sie
       bestuende die Pruefung oben auch dann, wenn die Koordinaten daneben
       lagen oder das Ziehen ueberhaupt kaputt waere. */
    await bearbeitenAn(page)
    await page.evaluate(() => window.__planerDatei.setzeWerkzeug(0))
    await page.waitForTimeout(200)
    const scharfJetzt = await page.evaluate(() => window.__planerDatei.zeichenflaecheScharf())
    pruefe(scharfJetzt === true, 'K3: GEGENPROBE — mit „Bearbeiten" ist die Zeichenflaeche scharf')
    /* Gemessen wird die GANZE Liste und nicht dasselbe Stueck: unter dem
       Zeiger liegt hier eine grosse `flaeche`, und der Kern gibt einem
       kleineren Moebel darauf den Vorrang (W2). Welches Stueck gegriffen wird,
       ist nicht die Frage — die Frage ist, ob ueberhaupt etwas gegriffen wird. */
    const vorGegen = await page.evaluate(() => window.__planerDatei.ausstattung())
    const zielB = await page.evaluate((id) => window.__planerDatei.stueck(id), ziel.id)
    await ziehe(page, zielB.bx, zielB.by, zielB.bx + 80, zielB.by + 60)
    await page.waitForTimeout(900)
    const nachGegen = await page.evaluate(() => ({
      liste: window.__planerDatei.ausstattung(),
      gesetzte: window.__planerDatei.gesetzte()
    }))
    const bewegt = nachGegen.liste.filter((s, i) => Math.abs(s.x - vorGegen[i].x) > 1 || Math.abs(s.y - vorGegen[i].y) > 1)
    pruefe(
      bewegt.length === 1 && nachGegen.gesetzte === 1,
      `K3: GEGENPROBE — derselbe Zug bewegt jetzt wirklich ein Stueck (${bewegt.length} bewegt: ${bewegt[0]?.typ}, ${nachGegen.gesetzte} gesetzt)`
    )
  }

  pruefe(konsole.length === 0, `K3: keine Konsolen- oder Seitenfehler (${konsole.length}${konsole.length ? ': ' + konsole[0] : ''})`)
  await ctx.close()
}

/* ══════════════════════════════════════════════════════════════════════
   K1 + K2 + G2 — LADEN: fragen, pruefen, atomar
   ══════════════════════════════════════════════════════════════════════ */
log('\n── K1/K2/G2: Laden ──')
{
  const { ctx, page, konsole } = await fenster()
  await bearbeitenAn(page)

  const gutePfad = path.join(DIR, 'gut.json')
  fs.writeFileSync(gutePfad, JSON.stringify({
    floorplan: {
      corners: { c1: { x: 0, y: 0 }, c2: { x: 400, y: 0 }, c3: { x: 400, y: 300 }, c4: { x: 0, y: 300 } },
      walls: [
        { corner1: 'c1', corner2: 'c2' }, { corner1: 'c2', corner2: 'c3' },
        { corner1: 'c3', corner2: 'c4' }, { corner1: 'c4', corner2: 'c1' }
      ]
    },
    // G4: fremde 3D-Moebel. Sie muessen die Runde ueberleben.
    items: [{ item_name: 'Fremdmoebel', item_type: 1, position: [1, 2, 3] }],
    labels: []
  }))

  const vorher = await page.evaluate(() => window.__planerDatei.zahlen())

  /* ── K2: kaputte Dateien. Jede muss ABGELEHNT werden, BEVOR etwas geladen
     ist — und die Antwort muss innerhalb eines Wimpernschlags kommen. Die
     Fassung von vorher brauchte fuer `1e12` ueber 68 Sekunden und antwortete
     dann gar nicht mehr. */
  const kaputt = [
    ['x ist null', { corners: { a: { x: null, y: 0 }, b: { x: 100, y: 0 } }, walls: [{ corner1: 'a', corner2: 'b' }] }],
    ['x ist Text', { corners: { a: { x: 'abc', y: 0 }, b: { x: 100, y: 0 } }, walls: [{ corner1: 'a', corner2: 'b' }] }],
    ['x ist 1e8', { corners: { a: { x: 0, y: 0 }, b: { x: 1e8, y: 0 } }, walls: [{ corner1: 'a', corner2: 'b' }] }],
    ['x ist 1e12', { corners: { a: { x: 0, y: 0 }, b: { x: 1e12, y: 1e12 } }, walls: [{ corner1: 'a', corner2: 'b' }] }],
    ['Wand ohne Ecke', { corners: { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } }, walls: [{ corner1: 'a', corner2: 'ZZZ' }] }],
    ['Moebel ohne Mass', {
      corners: { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } }, walls: [{ corner1: 'a', corner2: 'b' }],
      ausstattung: [{ typ: 'tisch', x: 10, y: 10, breite: null, tiefe: 60 }]
    }]
  ]
  for (const [name, fp] of kaputt) {
    const pfad = path.join(DIR, 'kaputt-' + name.replace(/\W+/g, '_') + '.json')
    fs.writeFileSync(pfad, JSON.stringify({ floorplan: fp }))
    const t0 = Date.now()
    await page.setInputFiles('#dateiWahl', pfad)
    await page.waitForTimeout(500)
    const erg = await page.evaluate(() => ({
      frage: window.__planerDatei.ladeFrageOffen(),
      meldung: window.__planerDatei.meldungText(),
      zahlen: window.__planerDatei.zahlen()
    }))
    const dauer = Date.now() - t0
    pruefe(
      erg.frage === false && erg.meldung !== null && /NICHTS geladen|kein Grundriss/.test(erg.meldung),
      `K2 (${name}): ehrlich abgelehnt, gar nicht erst angeboten ("${String(erg.meldung).slice(0, 70)}")`
    )
    pruefe(
      erg.zahlen.ecken === vorher.ecken && erg.zahlen.waende === vorher.waende &&
        erg.zahlen.raeume === vorher.raeume && erg.zahlen.ausstattung === vorher.ausstattung,
      `K2 (${name}): ATOMAR — der eigene Grundriss ist unveraendert (${erg.zahlen.ecken}/${erg.zahlen.waende}/${erg.zahlen.raeume})`
    )
    pruefe(dauer < 5000, `K2 (${name}): die Antwort kommt sofort (${dauer} ms, frueher 68 400 ms)`)
  }

  /* ── K1: die gute Datei wird ANGEBOTEN, nicht eingespielt.
     Zugleich die GEGENPROBE zu K2: eine Formpruefung, die alles ablehnt,
     waere kein Schutz, sondern ein Defekt. */
  await page.setInputFiles('#dateiWahl', gutePfad)
  await page.waitForTimeout(500)
  const angeboten = await page.evaluate(() => ({
    frage: window.__planerDatei.ladeFrageOffen(),
    text: window.__planerDatei.ladeFrageText(),
    zahlen: window.__planerDatei.zahlen()
  }))
  pruefe(angeboten.frage === true, `K1: „Laden" FRAGT, bevor es ersetzt ("${angeboten.text}")`)
  pruefe(
    angeboten.text.includes('4 Ecken') && angeboten.text.includes('4 Wände'),
    `K1: die Rueckfrage benennt, was kommt (${JSON.stringify(angeboten.text)})`
  )
  pruefe(
    angeboten.zahlen.ecken === vorher.ecken,
    `K1: waehrend die Frage steht, ist NICHTS ersetzt (${angeboten.zahlen.ecken} Ecken)`
  )

  // Abbrechen laesst wirklich alles stehen.
  await page.evaluate(() => document.getElementById('btnLadeNein').dispatchEvent(new MouseEvent('click', { bubbles: true })))
  await page.waitForTimeout(400)
  const nachNein = await page.evaluate(() => ({
    frage: window.__planerDatei.ladeFrageOffen(),
    zahlen: window.__planerDatei.zahlen()
  }))
  pruefe(
    nachNein.frage === false && nachNein.zahlen.ecken === vorher.ecken && nachNein.zahlen.waende === vorher.waende,
    `K1: „Abbrechen" laedt NICHTS (${nachNein.zahlen.ecken}/${nachNein.zahlen.waende})`
  )

  /* Und mit „Stand ersetzen" wird wirklich geladen — GEGENPROBE zur Rueckfrage.
     Bewusst eine ZWEITE Datei mit demselben Inhalt: dieselbe Datei zweimal in
     dieselbe Auswahl zu legen loest kein zweites `change` aus (gemessen — der
     erste Anlauf dieses Gates blieb genau daran haengen), und dann maesse man
     hier den Nachhall des vorigen Schritts statt eines neuen Ladens. */
  const gutePfad2 = path.join(DIR, 'gut-2.json')
  fs.copyFileSync(gutePfad, gutePfad2)
  await page.setInputFiles('#dateiWahl', gutePfad2)
  await page.waitForTimeout(500)
  pruefe(
    await page.evaluate(() => window.__planerDatei.ladeFrageOffen()),
    'K1: die Rueckfrage kommt auch beim zweiten Anlauf'
  )
  await page.evaluate(() => document.getElementById('btnLadeJa').dispatchEvent(new MouseEvent('click', { bubbles: true })))
  await page.waitForTimeout(900)
  const nachJa = await page.evaluate(() => ({
    zahlen: window.__planerDatei.zahlen(),
    meldung: window.__planerDatei.meldungText()
  }))
  pruefe(
    nachJa.zahlen.ecken === 4 && nachJa.zahlen.waende === 4,
    `K1: GEGENPROBE — mit „Stand ersetzen" wird wirklich geladen (${nachJa.zahlen.ecken}/${nachJa.zahlen.waende})`
  )
  /* G2 — die Meldung zaehlt am MODELL. Frueher las sie die Zahlen aus der
     Datei und meldete „1 Wände", waehrend der Kern null geladen hatte. */
  pruefe(
    nachJa.meldung !== null &&
      nachJa.meldung.includes(nachJa.zahlen.ecken + ' Ecken') &&
      nachJa.meldung.includes(nachJa.zahlen.waende + ' Wände'),
    `G2: der Ladehinweis nennt die Zahlen des MODELLS ("${String(nachJa.meldung).slice(0, 70)}")`
  )

  /* ── G4: die fremden `items` gehen beim Sichern nicht verloren. */
  const [ladung] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.evaluate(() => document.getElementById('btnExport').dispatchEvent(new MouseEvent('click', { bubbles: true })))
  ])
  const raus = path.join(DIR, 'wieder-raus.json')
  await ladung.saveAs(raus)
  const wieder = JSON.parse(fs.readFileSync(raus, 'utf8'))
  pruefe(
    Array.isArray(wieder.items) && wieder.items.length === 1 && wieder.items[0].item_name === 'Fremdmoebel',
    `G4: fremde 3D-Moebel ueberleben Laden und Sichern (${JSON.stringify(wieder.items).slice(0, 60)})`
  )

  pruefe(konsole.length === 0, `K1/K2: keine Konsolen- oder Seitenfehler (${konsole.length}${konsole.length ? ': ' + konsole[0] : ''})`)
  await ctx.close()
}

/* ══════════════════════════════════════════════════════════════════════
   K4 — ZWEI FENSTER DERSELBEN DATEI
   Ein zweites Fenster wird hier nicht simuliert, sondern GEOEFFNET: derselbe
   Ablageort, derselbe Schluessel. Genau so ist der Verlust gemessen worden.
   ══════════════════════════════════════════════════════════════════════ */
log('\n── K4: zwei Fenster ──')
{
  const { ctx, page, konsole } = await fenster()
  await bearbeitenAn(page)
  // Fenster A legt einen Stand ab.
  await page.evaluate(() => {
    const l = window.__planerDatei.ausstattung()
    window.__planerDatei.maus('mousemove', l[0].bx, l[0].by)
  })
  const zielA = await page.evaluate(() => {
    const l = window.__planerDatei.ausstattung().filter((x) => x.bx > 300 && x.bx < 1300 && x.by > 180 && x.by < 800)
    return l[0]
  })
  await ziehe(page, zielA.bx, zielA.by, zielA.bx + 60, zielA.by + 40)
  await page.waitForTimeout(1100)
  const aGespeichert = await page.evaluate(() => JSON.parse(window.__planerDatei.speicherStand()).gesichertAm)
  pruefe(!!aGespeichert, `K4: Fenster A hat abgelegt (${aGespeichert})`)

  // Fenster B: dieselbe Datei, derselbe Ordner, derselbe Schluessel.
  const seiteB = await ctx.newPage()
  await seiteB.goto(URL_A, { waitUntil: 'domcontentloaded' })
  await seiteB.waitForFunction(() => window.__bereit === true, { timeout: 30000 })
  await bearbeitenAn(seiteB)
  const zielB = await seiteB.evaluate(() => {
    const l = window.__planerDatei.ausstattung().filter((x) => x.bx > 300 && x.bx < 1300 && x.by > 180 && x.by < 800)
    return l[1]
  })
  await ziehe(seiteB, zielB.bx, zielB.by, zielB.bx + 60, zielB.by + 40)
  await seiteB.waitForTimeout(1100)
  const bGespeichert = await seiteB.evaluate(() => JSON.parse(window.__planerDatei.speicherStand()).gesichertAm)
  pruefe(bGespeichert !== aGespeichert, `K4: Fenster B hat danach abgelegt (${bGespeichert})`)

  // Und jetzt legt A nach — frueher war B's Stand danach spurlos weg.
  const ziel2 = await page.evaluate(() => {
    const l = window.__planerDatei.ausstattung().filter((x) => x.bx > 300 && x.bx < 1300 && x.by > 180 && x.by < 800)
    return l[2]
  })
  await ziehe(page, ziel2.bx, ziel2.by, ziel2.bx + 60, ziel2.by + 40)
  await page.waitForTimeout(1200)
  const danach = await page.evaluate(() => ({
    imSpeicher: JSON.parse(window.__planerDatei.speicherStand()).gesichertAm,
    fremdErkannt: window.__planerDatei.fremdErkannt(),
    leiste: window.__planerDatei.standleisteText()
  }))
  pruefe(
    danach.imSpeicher === bGespeichert,
    `K4: A ueberschreibt B's Stand NICHT (im Speicher steht weiter ${danach.imSpeicher})`
  )
  pruefe(
    danach.fremdErkannt === true && /anderes Fenster/.test(String(danach.leiste)),
    `K4: und A SAGT es ("${danach.leiste}")`
  )

  // B laedt neu und findet seinen eigenen Stand — nicht A's.
  await seiteB.reload({ waitUntil: 'domcontentloaded' })
  await seiteB.waitForFunction(() => window.__bereit === true, { timeout: 30000 })
  const bNeu = await seiteB.evaluate(() => window.__planerDatei.gesichertAm())
  pruefe(bNeu === bGespeichert, `K4: B findet nach dem Neuladen SEINEN Stand wieder (${bNeu})`)

  /* GEGENPROBE: ohne fremden Schreiber schreibt A ganz normal. Ohne sie
     bestuende die Pruefung oben auch dann, wenn A ueberhaupt nicht mehr
     speicherte. */
  const { ctx: ctx2, page: allein } = await fenster(URL_B)
  await bearbeitenAn(allein)
  const zielC = await allein.evaluate(() => {
    const l = window.__planerDatei.ausstattung().filter((x) => x.bx > 300 && x.bx < 1300 && x.by > 180 && x.by < 800)
    return l[0]
  })
  await ziehe(allein, zielC.bx, zielC.by, zielC.bx + 60, zielC.by + 40)
  await allein.waitForTimeout(1100)
  const alleinStand = await allein.evaluate(() => ({
    bytes: (window.__planerDatei.speicherStand() || '').length,
    fremd: window.__planerDatei.fremdErkannt()
  }))
  pruefe(
    alleinStand.bytes > 1000 && alleinStand.fremd === false,
    `K4: GEGENPROBE — ohne zweites Fenster schreibt es ganz normal (${alleinStand.bytes} Bytes)`
  )
  await ctx2.close()

  pruefe(konsole.length === 0, `K4: keine Konsolen- oder Seitenfehler (${konsole.length}${konsole.length ? ': ' + konsole[0] : ''})`)
  await ctx.close()
}

/* ══════════════════════════════════════════════════════════════════════
   M1 — FREI GESETZTES SIEHT IN DER AXONOMETRIE ANDERS AUS
   Gemessen wurde die Bild-Pruefsumme: 2728510327 vorher wie nachher.
   ══════════════════════════════════════════════════════════════════════ */
log('\n── M1: die Herkunft erreicht das Blatt ──')
{
  const { ctx, page, konsole } = await fenster()
  await page.waitForTimeout(1200)
  const summe = () => page.evaluate(() => window.__planerDatei.bildBlatt().summe)
  const vor = await summe()

  const gekippt = await page.evaluate(() => {
    const roh = window.__planerDatei.ausstattungRoh()
    const i = roh.findIndex((x) => x.typ === 'tisch')
    roh[i].quelle = 'gesetzt'
    window.__planerDatei.setzeAusstattung(roh)
    window.__planerDatei.axoNeuBauen()
    return { id: roh[i].id, typ: roh[i].typ }
  })
  await page.waitForTimeout(1000)
  const nach = await summe()
  pruefe(
    vor !== nach,
    `M1: DASSELBE Stueck an DERSELBEN Stelle sieht als „gesetzt" anders aus (${vor} -> ${nach}, ${gekippt.typ})`
  )

  /* GEGENPROBE: zurueckgekippt muss dasselbe Bild wiederkommen. Ohne sie
     bestuende die Pruefung auch dann, wenn sich das Bild bei JEDEM Neubau
     aendert — das waere Rauschen, kein Unterschied. */
  await page.evaluate(() => {
    const roh = window.__planerDatei.ausstattungRoh()
    const i = roh.findIndex((x) => x.typ === 'tisch')
    roh[i].quelle = 'gemessen'
    window.__planerDatei.setzeAusstattung(roh)
    window.__planerDatei.axoNeuBauen()
  })
  await page.waitForTimeout(1000)
  const zurueck = await summe()
  pruefe(zurueck === vor, `M1: GEGENPROBE — zurueckgekippt kommt genau das alte Bild wieder (${zurueck} === ${vor})`)

  pruefe(konsole.length === 0, `M1: keine Konsolen- oder Seitenfehler (${konsole.length}${konsole.length ? ': ' + konsole[0] : ''})`)
  await ctx.close()
}

/* ══════════════════════════════════════════════════════════════════════
   M2 — WAENDE TRAGEN EINE HERKUNFT
   Gemessen wurde: eine gemessene Wand geloescht (100 -> 99, Raeume 25 -> 24),
   und das Blatt sagte unveraendert „Der Grundriss ist gemessen."
   ══════════════════════════════════════════════════════════════════════ */
log('\n── M2: veraenderte Waende ──')
{
  const { ctx, page, konsole } = await fenster()
  await bearbeitenAn(page)

  const anfang = await page.evaluate(() => ({
    text: window.__planerDatei.grundrissText(),
    fuss: window.__planerDatei.hinweisHerkunft(),
    abw: window.__planerDatei.abweichung(),
    waende: window.__planerDatei.zahlen().waende
  }))
  pruefe(
    anfang.text === null && anfang.abw.gesetzt === 0 && anfang.abw.fehlen === 0 &&
      /Grundriss und Ausstattung sind gemessen/.test(anfang.fuss),
    `M2: GEGENPROBE ZUERST — solange nichts geaendert ist, schweigt die Zeile ("${anfang.fuss}")`
  )

  const wand = await page.evaluate(() => window.__planerDatei.waende()[0].id)
  await page.evaluate((id) => window.__planerDatei.wandLoeschen(id), wand)
  await page.waitForTimeout(900)
  const nachLoeschen = await page.evaluate(() => ({
    text: window.__planerDatei.grundrissText(),
    fuss: window.__planerDatei.hinweisHerkunft(),
    abw: window.__planerDatei.abweichung(),
    waende: window.__planerDatei.zahlen().waende
  }))
  pruefe(
    nachLoeschen.waende === anfang.waende - 1,
    `M2: eine gemessene Wand ist wirklich weg (${anfang.waende} -> ${nachLoeschen.waende})`
  )
  pruefe(
    nachLoeschen.abw.fehlen >= 1 && nachLoeschen.text !== null && /fehlt|fehlen/.test(nachLoeschen.text),
    `M2: das Blatt SAGT es im Kopf ("${nachLoeschen.text}")`
  )
  pruefe(
    !/Grundriss und Ausstattung sind gemessen/.test(nachLoeschen.fuss) &&
      /verändert/.test(nachLoeschen.fuss),
    `M2: und die Fussnote behauptet nicht laenger, der Grundriss sei gemessen ("${nachLoeschen.fuss}")`
  )

  // Rueckgaengig muss die Aussage ebenfalls zuruecknehmen.
  await page.evaluate(() => window.__planerDatei.undoJetzt())
  await page.waitForTimeout(900)
  const nachUndo = await page.evaluate(() => ({
    text: window.__planerDatei.grundrissText(),
    fuss: window.__planerDatei.hinweisHerkunft(),
    waende: window.__planerDatei.zahlen().waende
  }))
  pruefe(
    nachUndo.waende === anfang.waende && nachUndo.text === null &&
      /Grundriss und Ausstattung sind gemessen/.test(nachUndo.fuss),
    `M2: Rueckgaengig nimmt die Aussage mit zurueck (${nachUndo.waende} Waende, "${nachUndo.fuss}")`
  )

  // Eine VERSCHOBENE Wand traegt die Herkunft im Modell — sie reist mit der Datei.
  const wand2 = await page.evaluate(() => window.__planerDatei.waende()[3].id)
  await page.evaluate((id) => { window.__planerDatei.wandVerschieben(id, 40, 40); window.__planerDatei.neuZeichnen() }, wand2)
  await page.waitForTimeout(900)
  const nachSchub = await page.evaluate((id) => ({
    quelle: window.__planerDatei.waendeRoh().find((w) => w.id === id)?.quelle,
    abw: window.__planerDatei.abweichung()
  }), wand2)
  pruefe(
    nachSchub.quelle === 'gesetzt' && nachSchub.abw.gesetzt >= 1,
    `M2: eine verschobene Wand ist „gesetzt" und wird gezaehlt (${nachSchub.quelle}, ${nachSchub.abw.gesetzt})`
  )

  pruefe(konsole.length === 0, `M2: keine Konsolen- oder Seitenfehler (${konsole.length}${konsole.length ? ': ' + konsole[0] : ''})`)
  await ctx.close()
}

/* ══════════════════════════════════════════════════════════════════════
   M5 — DER AUSDRUCK IST EIN BLATT
   ══════════════════════════════════════════════════════════════════════ */
log('\n── M5: das Papier ──')
{
  // A4 quer bei 96 dpi ist rund 1123 x 794 — und damit unter der 900er
  // Grenze, an der die Fussnote bisher verschwand.
  const { ctx, page, konsole } = await fenster(null, { viewport: { width: 1123, height: 794 } })
  await page.waitForTimeout(1000)

  const amBildschirm = await page.evaluate(() => {
    const s = (id) => {
      const e = document.getElementById(id)
      return e ? getComputedStyle(e).display : 'fehlt'
    }
    return { kopfleiste: s('btnBearbeiten'), leiste: s('werkzeuge') }
  })

  await page.emulateMedia({ media: 'print' })
  await page.waitForTimeout(600)
  const imDruck = await page.evaluate(() => {
    const sichtbar = (auswahl) => {
      const e = document.querySelector(auswahl)
      if (!e) return 'fehlt'
      return e.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })
    }
    const h = document.querySelector('.hinweis').getBoundingClientRect()
    return {
      kopfleiste: sichtbar('.kopfleiste'),
      leisten: sichtbar('#werkzeuge'),
      tafel: sichtbar('.tafel'),
      standleiste: sichtbar('.standleiste'),
      bedienhinweis: sichtbar('#hinweisBedienung'),
      fussnote: sichtbar('.hinweis'),
      fussnoteBreite: Math.round(h.width),
      titel: sichtbar('.kopf h1'),
      druckzeile: document.getElementById('druckZeile').textContent
    }
  })
  pruefe(
    imDruck.kopfleiste === false && imDruck.leisten === false && imDruck.standleiste === false,
    `M5: die Bedienelemente sind vom Papier verschwunden (${JSON.stringify(imDruck).slice(0, 90)})`
  )
  pruefe(
    imDruck.fussnote === true && imDruck.fussnoteBreite > 200,
    `M5: die HERKUNFTS-Fussnote steht auf dem Papier (${imDruck.fussnoteBreite} px breit) — sie fehlte unter 900 px ganz`
  )
  pruefe(imDruck.bedienhinweis === false, 'M5: die Bedienhinweise („Ziehen dreht") stehen NICHT auf dem Papier')
  pruefe(imDruck.titel === true, 'M5: der Titel steht auf dem Papier')
  pruefe(
    /Gedruckt am \d/.test(imDruck.druckzeile) && /nicht maßstäblich/.test(imDruck.druckzeile),
    `M5: Datum und Massstabs-Aussage stehen dabei ("${imDruck.druckzeile}")`
  )

  /* W7 — der Arbeitshinweis ist ein BEDIENELEMENT und gehoert damit unter
     dieselbe Regel. Er kann nur hier auffallen: er steht ausschliesslich in
     der Axonometrie, und seit W7 bleibt die Axonometrie beim Einschalten
     stehen — genau der Fall, in dem jemand druckt. Der Druck-Modus laeuft
     noch, die Messung oben ist genommen; dieser Klick stoert sie nicht. */
  await page.evaluate(() => document.getElementById('btnBearbeiten').dispatchEvent(new MouseEvent('click', { bubbles: true })))
  await page.waitForTimeout(400)
  const beimDrucken = await page.evaluate(() => ({
    ansicht: window.__planerDatei.ansicht(),
    hinweis: document.getElementById('arbeitshinweis').checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })
  }))
  pruefe(
    beimDrucken.ansicht === 'axo' && beimDrucken.hinweis === false,
    `M5: auch der Arbeitshinweis („gezeichnet wird im Grundriss") steht NICHT auf dem Papier (${JSON.stringify(beimDrucken)})`
  )

  // GEGENPROBE: am BILDSCHIRM sind die Bedienelemente wieder da.
  await page.emulateMedia({ media: 'screen' })
  await page.waitForTimeout(400)
  const zurueckAmSchirm = await page.evaluate(() =>
    document.querySelector('.kopfleiste').checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })
  )
  pruefe(
    zurueckAmSchirm === true && amBildschirm.kopfleiste !== 'none',
    'M5: GEGENPROBE — am Bildschirm sind die Bedienelemente unveraendert da'
  )

  // Und ein echtes PDF entsteht, statt dass der Druck an etwas zerbricht.
  const pdf = path.join(DIR, 'blatt.pdf')
  await page.pdf({ path: pdf, format: 'A4', landscape: true, printBackground: true })
  pruefe(fs.existsSync(pdf) && fs.statSync(pdf).size > 20000, `M5: ein A4-Blatt entsteht wirklich (${Math.round(fs.statSync(pdf).size / 1024)} KB)`)

  pruefe(konsole.length === 0, `M5: keine Konsolen- oder Seitenfehler (${konsole.length}${konsole.length ? ': ' + konsole[0] : ''})`)
  await ctx.close()
}

/* ══════════════════════════════════════════════════════════════════════
   G1 — DEUTSCHE MASSE
   ══════════════════════════════════════════════════════════════════════ */
log('\n── G1: deutsche Masse ──')
{
  const { ctx, page } = await fenster()
  const m = await page.evaluate(() => ({
    a: window.__planerDatei.masse(512),
    b: window.__planerDatei.masse(580),
    c: window.__planerDatei.masse(500),
    d: window.__planerDatei.masse(1328.4)
  }))
  pruefe(
    m.a === '5,12 m' && m.b === '5,80 m' && m.c === '5,00 m' && m.d === '13,28 m',
    `G1: Komma statt Punkt, feste Stellenzahl (${JSON.stringify(m)})`
  )
  pruefe(
    !m.a.includes('.') && !m.b.includes('.') && !m.c.includes('.'),
    'G1: GEGENPROBE — kein englischer Dezimalpunkt mehr'
  )
  await ctx.close()
}

/* ══════════════════════════════════════════════════════════════════════
   M6 — SCHUTZ BEIM SCHLIESSEN
   ══════════════════════════════════════════════════════════════════════ */
log('\n── M6: der letzte Zug ──')
{
  const { ctx, page, konsole } = await fenster()
  await bearbeitenAn(page)
  const vor = await page.evaluate(() => window.__planerDatei.ungesichert())
  pruefe(vor === false, 'M6: GEGENPROBE ZUERST — ohne eigenen Zug ist nichts ungesichert')

  const ziel = await page.evaluate(() => {
    const l = window.__planerDatei.ausstattung().filter((x) => x.bx > 300 && x.bx < 1300 && x.by > 180 && x.by < 800)
    return l[0]
  })
  await ziehe(page, ziel.bx, ziel.by, ziel.bx + 60, ziel.by + 40)
  // SOFORT nachsehen — das Sichern ist um 600 ms entprellt, genau diese Luecke
  // ist der Fund.
  await page.waitForTimeout(120)
  const sofort = await page.evaluate(() => ({
    ungesichert: window.__planerDatei.ungesichert(),
    bytes: (window.__planerDatei.speicherStand() || '').length
  }))
  pruefe(
    sofort.ungesichert === true && sofort.bytes === 0,
    `M6: unmittelbar nach dem Zug steht er ungesichert im Fenster (${sofort.bytes} Bytes im Speicher)`
  )

  // Der Browser fragt beim Schliessen — gemessen am echten Dialog.
  let dialogText = null
  page.on('dialog', async (d) => {
    dialogText = d.type()
    await d.dismiss()
  })
  const seite2 = await ctx.newPage()
  await seite2.goto('about:blank')
  await page.close({ runBeforeUnload: true }).catch(() => {})
  await seite2.waitForTimeout(1500)
  pruefe(dialogText === 'beforeunload', `M6: das Schliessen wird aufgehalten (Dialog: ${dialogText})`)

  pruefe(konsole.length === 0, `M6: keine Konsolen- oder Seitenfehler (${konsole.length}${konsole.length ? ': ' + konsole[0] : ''})`)
  await ctx.close()
}

/* ══════════════════════════════════════════════════════════════════════
   M7 — „ZURUECKSETZEN" HEISST AUSLIEFERUNGSZUSTAND
   ══════════════════════════════════════════════════════════════════════ */
log('\n── M7: zurueck auf Anfang ──')
{
  const { ctx, page, konsole } = await fenster()
  await bearbeitenAn(page)
  const ziel = await page.evaluate(() => {
    const l = window.__planerDatei.ausstattung().filter((x) => x.bx > 300 && x.bx < 1300 && x.by > 180 && x.by < 800)
    return l[0]
  })
  await ziehe(page, ziel.bx, ziel.by, ziel.bx + 60, ziel.by + 40)
  await page.waitForTimeout(1100)

  /* GEGENPROBE ZUERST: OHNE Zuruecksetzen bringt ein Neustart die Werkzeuge
     wieder — genau das war der Fund („ein Neugier-Klick macht den
     Werkzeugkasten dauerhaft zur Begruessung").

     Seit W7 misst diese Zeile ZWEI getrennte Angaben: der Bearbeiten-Zustand
     liegt im einen Schluessel, die zuletzt angesehene Ansicht im anderen. Sie
     muessen beim OEffnen zusammen ergeben, was der Nutzer zuletzt vor sich
     hatte — hier: Werkzeuge an, Grundriss vorn. */
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__bereit === true, { timeout: 30000 })
  const ohneReset = await page.evaluate(() => ({
    bearbeitet: window.__planerDatei.bearbeitet(),
    ansicht: window.__planerDatei.ansicht()
  }))
  pruefe(
    ohneReset.bearbeitet === true && ohneReset.ansicht === 'plan',
    `M7: GEGENPROBE — ohne Zuruecksetzen kommen Bearbeiten-Zustand UND zuletzt angesehene Ansicht wieder (${JSON.stringify(ohneReset)})`
  )

  await page.evaluate(() => document.getElementById('btnZurueck').dispatchEvent(new MouseEvent('click', { bubbles: true })))
  await page.waitForTimeout(300)
  await page.evaluate(() => document.getElementById('btnZurueckJa').dispatchEvent(new MouseEvent('click', { bubbles: true })))
  await page.waitForTimeout(1000)
  const direkt = await page.evaluate(() => ({
    bearbeitet: window.__planerDatei.bearbeitet(),
    ansicht: window.__planerDatei.ansicht(),
    werkzeuge: window.__planerDatei.werkzeugeSichtbar(),
    scharf: window.__planerDatei.zeichenflaecheScharf(),
    schluessel: Object.keys(localStorage)
  }))
  pruefe(
    direkt.bearbeitet === false && direkt.ansicht === 'axo' && direkt.werkzeuge === false && direkt.scharf === false,
    `M7: sofort danach steht das ruhige Blatt da (${JSON.stringify(direkt).slice(0, 90)})`
  )
  pruefe(
    direkt.schluessel.filter((k) => k.indexOf('halle400-planer-datei') === 0).length === 0,
    `M7: BEIDE Schluessel sind weg, nicht nur der Plan-Schluessel (${JSON.stringify(direkt.schluessel)})`
  )

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__bereit === true, { timeout: 30000 })
  const nachNeustart = await page.evaluate(() => ({
    bearbeitet: window.__planerDatei.bearbeitet(),
    ansicht: window.__planerDatei.ansicht(),
    zahlen: window.__planerDatei.zahlen(),
    gesetzte: window.__planerDatei.gesetzte()
  }))
  pruefe(
    nachNeustart.bearbeitet === false && nachNeustart.ansicht === 'axo' &&
      nachNeustart.zahlen.waende === 100 && nachNeustart.gesetzte === 0,
    `M7: und auch nach einem Neustart — wie am ersten Tag (${JSON.stringify(nachNeustart.zahlen)})`
  )

  pruefe(konsole.length === 0, `M7: keine Konsolen- oder Seitenfehler (${konsole.length}${konsole.length ? ': ' + konsole[0] : ''})`)
  await ctx.close()
}

/* ══════════════════════════════════════════════════════════════════════
   M8 — DIESELBE DATEI, ANDERER ORDNER
   ══════════════════════════════════════════════════════════════════════ */
log('\n── M8: verschoben ──')
{
  // In Ordner A arbeiten und ablegen …
  const { ctx, page, konsole } = await fenster(URL_A)
  await bearbeitenAn(page)
  const ziel = await page.evaluate(() => {
    const l = window.__planerDatei.ausstattung().filter((x) => x.bx > 300 && x.bx < 1300 && x.by > 180 && x.by < 800)
    return l[0]
  })
  await ziehe(page, ziel.bx, ziel.by, ziel.bx + 60, ziel.by + 40)
  await page.waitForTimeout(1200)
  const inA = await page.evaluate(() => ({
    gesetzte: window.__planerDatei.gesetzte(),
    schluessel: window.__planerDatei.schluessel
  }))
  pruefe(inA.gesetzte === 1, `M8: in Ordner A ist ein Stueck frei gesetzt (${inA.gesetzte})`)

  // … und dieselbe Datei in Ordner B oeffnen, als waere sie verschoben worden.
  const seiteB = await ctx.newPage()
  await seiteB.goto(URL_B, { waitUntil: 'domcontentloaded' })
  await seiteB.waitForFunction(() => window.__bereit === true, { timeout: 30000 })
  await seiteB.waitForTimeout(500)
  const inB = await seiteB.evaluate(() => ({
    schluessel: window.__planerDatei.schluessel,
    frage: window.__planerDatei.ortFrageOffen(),
    anderswo: window.__planerDatei.staendeAnderswo(),
    gesetzte: window.__planerDatei.gesetzte()
  }))
  pruefe(inB.schluessel !== inA.schluessel, 'M8: die Kopie hat einen eigenen Speicher-Schluessel (so soll es sein)')
  pruefe(
    inB.frage === true && inB.anderswo === 1,
    `M8: sie BIETET den Stand vom anderen Ablageort an, statt zu schweigen (${JSON.stringify(inB)})`
  )
  pruefe(inB.gesetzte === 0, 'M8: und laedt ihn NICHT von selbst — welche Kopie gilt, weiss nur der Nutzer')

  await seiteB.evaluate(() => document.getElementById('btnOrtJa').dispatchEvent(new MouseEvent('click', { bubbles: true })))
  await seiteB.waitForTimeout(1200)
  const uebernommen = await seiteB.evaluate(() => ({
    gesetzte: window.__planerDatei.gesetzte(),
    frage: window.__planerDatei.ortFrageOffen(),
    meldung: window.__planerDatei.meldungText()
  }))
  pruefe(
    uebernommen.gesetzte === 1 && uebernommen.frage === false,
    `M8: auf Wunsch wird er uebernommen ("${String(uebernommen.meldung).slice(0, 70)}")`
  )

  /* GEGENPROBE: wer an DIESEM Ablageort schon einen eigenen Stand hat, wird
     nicht gefragt — sonst waere die Frage laestig statt hilfreich. */
  await seiteB.reload({ waitUntil: 'domcontentloaded' })
  await seiteB.waitForFunction(() => window.__bereit === true, { timeout: 30000 })
  await seiteB.waitForTimeout(500)
  const zweitesMal = await seiteB.evaluate(() => window.__planerDatei.ortFrageOffen())
  pruefe(zweitesMal === false, 'M8: GEGENPROBE — mit eigenem Stand wird nicht mehr gefragt')

  pruefe(konsole.length === 0, `M8: keine Konsolen- oder Seitenfehler (${konsole.length}${konsole.length ? ': ' + konsole[0] : ''})`)
  await ctx.close()
}

/* ══════════════════════════════════════════════════════════════════════
   MG — DIE MESSGROESSE SELBST
   Die wichtigste Lehre: `element.hidden` ist blind fuer `display:none` aus
   einer Medienabfrage. `paletteSichtbar()` meldete `true` fuer eine Palette,
   die gar nicht zu sehen war — und 67 Pruefungen fussten darauf.
   ══════════════════════════════════════════════════════════════════════ */
log('\n── MG: die Messgroesse ──')
{
  const { ctx, page, konsole } = await fenster(null, { viewport: { width: 1440, height: 900 } })
  await bearbeitenAn(page)
  const breit = await page.evaluate(() => ({
    palette: window.__planerDatei.paletteSichtbar(),
    attribut: !document.getElementById('palette').hidden
  }))
  pruefe(
    breit.palette === true && breit.attribut === true,
    `MG: GEGENPROBE ZUERST — am breiten Fenster ist die Palette wirklich da (${JSON.stringify(breit)})`
  )

  await page.setViewportSize({ width: 390, height: 800 })
  await page.waitForTimeout(700)
  const schmal = await page.evaluate(() => ({
    palette: window.__planerDatei.paletteSichtbar(),
    attribut: !document.getElementById('palette').hidden
  }))
  pruefe(
    schmal.palette === false,
    `MG: am schmalen Fenster meldet die Messung ehrlich „nicht sichtbar" (${JSON.stringify(schmal)})`
  )
  pruefe(
    schmal.attribut === true,
    'MG: … waehrend das ALTE Mass (`hidden`) hier weiterhin `true` sagen wuerde — genau der blinde Fleck'
  )

  pruefe(konsole.length === 0, `MG: keine Konsolen- oder Seitenfehler (${konsole.length}${konsole.length ? ': ' + konsole[0] : ''})`)
  await ctx.close()
}

await browser.close()

log('')
log(fehler.length === 0 ? 'ALLE PRUEFUNGEN BESTANDEN' : `DURCHGEFALLEN: ${fehler.length}`)
fehler.forEach((f) => log('  - ' + f))
log(`Bericht: ${BERICHT}`)
process.exit(fehler.length === 0 ? 0 : 1)
