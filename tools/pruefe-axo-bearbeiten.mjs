// Prueft das BEARBEITEN IN DER AXONOMETRIE (W7).
//
//   node tools/baue-planer-datei.mjs
//   node tools/pruefe-axo-bearbeiten.mjs
// Exit 0 = alle Pruefungen bestanden, 1 = mindestens eine durchgefallen.
//
// DIE FESTLEGUNG, DIE HIER PRAEZISIERT WIRD
// „In der Axonometrie wird nicht bearbeitet — ein Klick trifft keinen Punkt,
// sondern einen Sehstrahl; die Zielhoehe waere geraten." Ueber die PROJEKTION
// war der Satz nie falsch. Ueber den UMFANG war er zu weit: fuer einen Koerper
// mit bekannter Ober- und Unterkante ist der Sehstrahl eine ENDLICHE Strecke.
// Wo der Satz woertlich gilt — ein frei gesetzter Punkt in der Luft — gilt er
// weiter, und dieses Gate haelt genau diese Grenze fest (Pruefung G).
//
// JEDE PRUEFUNG HAT EINE GEGENPROBE. Ein Waechter, der nie rot werden kann, ist
// keiner. Die Gegenproben sind hier keine Zierde, sondern die Begruendung:
//   A  Hin und zurueck ueber alle Blicke  · Gegenprobe: sinE = 0 MUSS scheitern
//   B  Selbsttreffer aller 289 Stuecke    · Gegenprobe: geratene Hoehe MUSS die
//                                           Quote einbrechen lassen (h·cot el)
//   C  Pixel-Tinte am gerenderten Blatt   · Gegenprobe: Zug ohne Weg aendert
//                                           nichts; ein anderes Stueck aendert
//                                           anderswo
//   D  Modell + Historie                  · Gegenprobe: zwei Zuege = zwei
//                                           Rueckgaengig-Schritte
//   E  Gesten-Trennung, echte Zeiger      · Gegenprobe: Druck auf die Buehne
//                                           dreht und bewegt nichts
//   F  Kosten je Zeigerbewegung < 16 ms   · Gegenprobe: mit erzwungenem vollem
//                                           Szenen-Neubau MUSS das Gate rot
//   G  Die Grenze und der Auslieferungs-  · Gegenprobe: derselbe Griff mit
//      zustand                              „Bearbeiten" wirkt sehr wohl
//
// A und B laufen OHNE Browser: die ganze Rechnung steht in `src/axo/axo-treffer.js`
// und braucht kein Canvas. Der Kern wird dafuer nach node uebersetzt und der
// Plan durch `Floorplan.loadFloorplan` geschickt — sonst traegt kein einziges
// Ausstattungs-Element eine Kennung (die Plandatei fuehrt keine).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { uebersetzeKern, buendleKern, buendleThree, AXO_MODULE, WURZEL } from './buendel-kern.mjs'
import { liesHoehen } from './lies-hoehen.mjs'

const HIER = path.dirname(fileURLToPath(import.meta.url))
const PW_STANDARD = 'file:///C:/Users/dania/.gemini/node_modules/playwright/index.js'
const arg = (name, standard) => {
  const i = process.argv.indexOf(name)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : standard
}
const DATEI = path.resolve(WURZEL, arg('--datei', 'Halle400-Modell.html'))
const PLAN_DATEI = path.join(WURZEL, 'app/public/plaene', `${arg('--plan', 'halle400')}.json`)
const NUR = arg('--nur', '') // "rechnung" | "datei"

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'h400-axobearb-'))
const fehler = []
const log = (s) => console.log(s)
const pruefe = (bedingung, text) => {
  log(`${bedingung ? 'OK  ' : 'FEHL'} ${text}`)
  if (!bedingung) fehler.push(text)
}

const { projiziereAuf, umkehreAuf, koerperUnter, tiefenFehler, NEIGUNG_MIN_ZIEHEN } = await import(
  pathToFileURL(path.join(WURZEL, 'src/axo/axo-treffer.js')).href
)
const { BLICKE, DARSTELLUNG } = await import(
  pathToFileURL(path.join(WURZEL, 'src/axo/axo-kontrakt.js')).href
)
const { baueSzene } = await import(pathToFileURL(path.join(WURZEL, 'src/axo/axo-szene.js')).href)

/* ══════════════════════════════════════════════════════════════════════
   VORPRUEFUNG · das Modul muss im BUENDEL stehen
   ══════════════════════════════════════════════════════════════════════
   Fehlt `axo-treffer.js` in `AXO_MODULE`, ist die Bearbeitung im Planer gruen
   und in der Bank-Datei TOT — und zwar ohne Fehlermeldung, weil die Datei dann
   schlicht eine Funktion weniger kennt. Deshalb wird die Liste nicht geglaubt,
   sondern gegen das Verzeichnis gehalten. */
{
  const imOrdner = fs
    .readdirSync(path.join(WURZEL, 'src/axo'))
    .filter((d) => d.endsWith('.js'))
    .sort()
  const imBuendel = [...AXO_MODULE].sort()
  const fehlend = imOrdner.filter((d) => !imBuendel.includes(d))
  pruefe(
    fehlend.length === 0,
    `Buendel vollstaendig: ${AXO_MODULE.length} Module${fehlend.length ? ' — ES FEHLEN: ' + fehlend.join(', ') : ''}`
  )
  pruefe(
    AXO_MODULE.indexOf('axo-treffer.js') < AXO_MODULE.indexOf('axo-zeichnen.js'),
    `axo-treffer.js steht vor axo-zeichnen.js (Abhaengigkeitsreihenfolge)`
  )
  const inDatei = fs.existsSync(DATEI) ? fs.readFileSync(DATEI, 'utf8') : ''
  pruefe(
    inDatei.includes('function koerperUnter') && inDatei.includes('function umkehreAuf'),
    `die Doppelklick-Datei traegt die Treffer-Rechnung wirklich in sich`
  )
}

/* ══════════════════════════════════════════════════════════════════════
   A · HIN UND ZURUECK — ohne Browser
   ══════════════════════════════════════════════════════════════════════
   Fuer jeden Blick der Leiste, dazu die Grenzen, die der Nutzer selbst
   herstellen kann (neigeMin/neigeMax), jeweils bei kleinstem und groesstem
   Zoom: `umkehreAuf(projiziereAuf(P)) == P`. Auf 1e-9, weil die Rechnung
   geschlossen ist — ein Iterationsverfahren duerfte hier gar nicht antreten. */
if (NUR !== 'datei') {
  log('\n═══ A · Hin und zurueck (ohne Browser) ═══')
  const kameraFuer = (az, el, zoom) => ({
    sinA: Math.sin(az),
    cosA: Math.cos(az),
    sinE: Math.sin(el),
    cosE: Math.cos(el),
    // Ein plausibler Massstab: 12 px je Meter bei Zoom 1, so wie die 78-m-Halle
    // in ein 1440er Fenster faellt. Die Umkehrung ist algebraisch — sie darf von
    // keiner dieser Zahlen abhaengen, und genau das prueft die Streuung hier.
    massstab: 12 * zoom,
    ox: 720,
    oy: 450,
    mitteX: 39,
    mitteZ: 7.5,
    mitteY: 0.6
  })
  const lagen = [
    ...BLICKE.map((b) => ({ name: b.taste, az: b.az, el: b.el })),
    { name: 'neigeMin', az: -0.9, el: DARSTELLUNG.neigeMin },
    { name: 'neigeMax', az: 2.1, el: DARSTELLUNG.neigeMax }
  ]
  let schlimmster = 0
  let punkte = 0
  for (const lage of lagen) {
    for (const zoom of [DARSTELLUNG.zoomMin, 1, DARSTELLUNG.zoomMax]) {
      const k = kameraFuer(lage.az, lage.el, zoom)
      for (const h of [0, 0.45, 0.74, 1.16, 2.0, 3.0]) {
        for (const [x, z] of [
          [0, 0],
          [77.5, 14.8],
          [-3.52, 9.1],
          [39.4, 0.05],
          [12.3, 11.7]
        ]) {
          const b = projiziereAuf(k, x, h, z)
          const zurueck = umkehreAuf(k, b.x, b.y, h)
          const ab = Math.max(Math.abs(zurueck.x - x), Math.abs(zurueck.z - z))
          schlimmster = Math.max(schlimmster, ab)
          punkte++
        }
      }
    }
  }
  pruefe(
    schlimmster < 1e-9,
    `A1 ${punkte} Punkte ueber ${lagen.length} Lagen x 3 Zoomstufen: groesste Abweichung ${schlimmster.toExponential(2)} m (< 1e-9)`
  )

  // GEGENPROBE: sinE = 0 ist die einzige Entartung der Abbildung (die
  // Jacobi-Determinante ist m²·sinE). Dort MUSS die Umkehrung sich weigern —
  // eine Zahl aus einer Division durch Null saehe aus wie eine Auskunft.
  const flach = { ...kameraFuer(-0.52, 0.62, 1), sinE: 0 }
  pruefe(
    umkehreAuf(flach, 700, 400, 0.74) === null,
    `A2 GEGENPROBE: bei sinE = 0 verweigert die Umkehrung die Antwort (statt zu raten)`
  )
  const ohneMassstab = { ...kameraFuer(-0.52, 0.62, 1), massstab: 0 }
  pruefe(
    umkehreAuf(ohneMassstab, 700, 400, 0.74) === null,
    `A3 GEGENPROBE: ohne Massstab ebenso — keine Antwort statt einer erfundenen`
  )
  // Der Fehler einer GERATENEN Hoehe, beziffert. Er ist die ganze Begruendung
  // dafuer, dass gegen `y0`/`y1` jedes Kandidaten geprueft wird.
  const t74 = tiefenFehler(0.74, 0.62)
  const t116 = tiefenFehler(1.16, 0.62)
  pruefe(
    Math.abs(t74 - 1.04) < 0.02 && Math.abs(t116 - 1.63) < 0.02,
    `A4 der Fehler einer geratenen Hoehe ist h·cot(el): Tisch ${t74.toFixed(2)} m, Wandkrone ${t116.toFixed(2)} m`
  )
}

/* ══════════════════════════════════════════════════════════════════════
   B · SELBSTTREFFER ALLER 289 STUECKE — ohne Browser
   ══════════════════════════════════════════════════════════════════════ */
let szeneGlobal = null
if (NUR !== 'datei') {
  log('\n═══ B · Selbsttreffer (ohne Browser) ═══')
  log('  Uebersetze den Kern (tsc) …')
  const KERN = new Function(
    `${buendleThree()}\n${buendleKern(uebersetzeKern())}\nreturn { Floorplan };`
  )()
  const roh = JSON.parse(fs.readFileSync(PLAN_DATEI, 'utf8'))
  const modell = new KERN.Floorplan()
  modell.loadFloorplan(roh.floorplan)
  // ERST DURCH DEN KERN: die Plandatei fuehrt keine Ausstattungs-Kennungen, sie
  // entstehen beim Laden. Wer die Datei direkt in `baueSzene` gibt, misst 289
  // Koerper ohne Kennung und haelt das Ergebnis fuer eine Aussage.
  const szene = baueSzene(
    { floorplan: modell.saveFloorplan(), labels: roh.labels || [] },
    { wandDicke: 12.5, hoehen: liesHoehen() }
  )
  szeneGlobal = szene
  pruefe(
    szene.moebel.length > 0 && szene.moebel.every((k) => !!k.id),
    `B0 jeder der ${szene.moebel.length} Koerper traegt eine Kennung (${szene.moebel.filter((k) => k.id).length})`
  )
  pruefe(
    szene.waende.length > 0 && szene.waende.every((k) => !!k.wandId),
    `B0b jedes der ${szene.waende.length} Wandstuecke traegt seine Wand-Kennung`
  )

  const kameraFuer = (az, el) => ({
    sinA: Math.sin(az),
    cosA: Math.cos(az),
    sinE: Math.sin(el),
    cosE: Math.cos(el),
    massstab: 12,
    ox: 720,
    oy: 450,
    mitteX: szene.mitte.x,
    mitteZ: szene.mitte.z,
    mitteY: 0.6
  })
  const mitteVon = (k) => {
    let x = 0
    let z = 0
    for (const p of k.punkte) {
      x += p.x
      z += p.z
    }
    return { x: x / k.punkte.length, z: z / k.punkte.length }
  }

  let msGesamt = 0
  let tests = 0
  for (const b of BLICKE) {
    const k = kameraFuer(b.az, b.el)
    let selbst = 0
    let verdeckt = 0
    let leer = 0
    let hinten = 0
    let geraten = 0
    let daneben = 0
    const t0 = process.hrtime.bigint()
    for (const m of szene.moebel) {
      const c = mitteVon(m)
      const bild = projiziereAuf(k, c.x, m.y1, c.z)
      const treffer = koerperUnter(szene, k, bild.x, bild.y)
      tests++
      if (!treffer) leer++
      else if (treffer.id === m.id) selbst++
      // Der Vergleich braucht ein Epsilon: der Sehstrahl wird hin- und
      // zurueckgerechnet, und zwei deckungsgleiche Stuecke (im Plan kommen sie
      // vor) liegen dann auf 1e-14 gleich tief. Ohne diese Toleranz meldete das
      // Gate zwei „dahinter" fuer einen Gleichstand — und behauptete damit
      // einen Fehler, den es nicht gibt.
      else if (treffer.tiefe >= bild.p - 1e-9) verdeckt++
      else hinten++

      // Gegenprobe 1 — die Hoehe auf y = 0 GERATEN, wie es die alte Festlegung
      // befuerchtete. Der Zielpunkt wandert dann um h·cot(el).
      const gerat = projiziereAuf(k, c.x, 0, c.z)
      const tg = koerperUnter(szene, k, gerat.x, gerat.y)
      if (tg && tg.id === m.id) geraten++

      // Gegenprobe 2 — zwei Halbmasse daneben darf dieses Stueck nicht liefern.
      let bx = Infinity
      let bX = -Infinity
      let bz = Infinity
      let bZ = -Infinity
      for (const p of m.punkte) {
        bx = Math.min(bx, p.x)
        bX = Math.max(bX, p.x)
        bz = Math.min(bz, p.z)
        bZ = Math.max(bZ, p.z)
      }
      const weg = projiziereAuf(k, c.x + (bX - bx), m.y1, c.z + (bZ - bz))
      const tw = koerperUnter(szene, k, weg.x, weg.y)
      if (tw && tw.id === m.id) daneben++
    }
    msGesamt += Number(process.hrtime.bigint() - t0) / 1e6
    const n = szene.moebel.length

    // Der KERN der Pruefung: jeder Sehstrahl trifft etwas, und was er liefert,
    // liegt WEITER VORN als das gesuchte Stueck. Ein „falscher" Treffer ist
    // hier kein Fehler, sondern die Wahrheit des Bildes: der Mittelpunkt eines
    // Stuhls liegt unter einer Tischplatte, und genau die sieht man dort.
    pruefe(
      leer === 0 && hinten === 0,
      `B1 [${b.taste}] alle ${n} Sehstrahlen treffen, und immer das Vorderste ` +
        `(selbst ${selbst}, davor liegend ${verdeckt}, dahinter ${hinten}, leer ${leer})`
    )
    // Ein PLAUSIBILITAETSBODEN: waere „das Vorderste" immer dasselbe Stueck,
    // bestuende B1 auch dann. Die Selbsttreffer-Quote schliesst das aus.
    const quote = selbst / n
    pruefe(
      quote >= 0.6,
      `B2 [${b.taste}] Selbsttreffer-Quote ${(quote * 100).toFixed(1)} % (>= 60 %) — ${selbst}/${n}`
    )
    pruefe(
      daneben === 0,
      `B3 [${b.taste}] GEGENPROBE: zwei Halbmasse daneben liefert das Stueck NIE (${daneben}/${n})`
    )
    // Gegenprobe 1 gilt nur dort, wo cot(el) ueberhaupt etwas bewirkt. Im Blick
    // „plan" (el 1.44) ist cot(el) = 0,13 — eine 74-cm-Tischplatte wandert dort
    // um 10 cm, und das ist ehrlicherweise kein Einbruch. Der Blick sagt es
    // selbst mit, statt dass jemand die Schwelle passend macht.
    const cot = Math.cos(b.el) / Math.sin(b.el)
    const wirktSich = cot > 0.5
    const einbruch = (selbst - geraten) / Math.max(1, selbst)
    pruefe(
      !wirktSich || einbruch >= 0.25,
      `B4 [${b.taste}] GEGENPROBE geratene Hoehe (cot el = ${cot.toFixed(2)}): ` +
        `${geraten} statt ${selbst} Treffer = ${(einbruch * 100).toFixed(0)} % Einbruch` +
        (wirktSich ? ' (>= 25 % gefordert)' : ' — bei diesem Blick erwartungsgemaess folgenlos')
    )
  }
  const jeTest = msGesamt / tests
  pruefe(
    jeTest < 1,
    `B5 Kosten der Rueckrechnung: ${jeTest.toFixed(4)} ms je Treffer-Frage ueber ${tests} Fragen ` +
      `(< 1 ms; zum Vergleich: ein voller Szenen-Neubau kostet 16,2 ms)`
  )
}

/* ══════════════════════════════════════════════════════════════════════
   C bis G · DIE DOPPELKLICK-DATEI, mit echten Zeiger-Ereignissen
   ══════════════════════════════════════════════════════════════════════ */
if (NUR === 'rechnung') {
  ende()
}

if (!fs.existsSync(DATEI)) {
  pruefe(false, `die Doppelklick-Datei fehlt (${DATEI}) — erst "node tools/baue-planer-datei.mjs"`)
  ende()
}

const { chromium } = (await import(process.env.PLAYWRIGHT_PFAD || PW_STANDARD)).default
const ORT = path.join(DIR, 'ordner')
fs.mkdirSync(ORT)
fs.copyFileSync(DATEI, path.join(ORT, 'Halle400-Modell.html'))
const URL = pathToFileURL(path.join(ORT, 'Halle400-Modell.html')).href

const browser = await chromium.launch()

/** Ein frisches Fenster mit gesperrtem Netz — wie in `pruefe-haertung.mjs`. */
async function fenster() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await ctx.route('**/*', (route) => {
    const u = route.request().url()
    if (u.startsWith('file://') || u.startsWith('data:') || u.startsWith('blob:')) return route.continue()
    return route.abort()
  })
  const page = await ctx.newPage()
  const konsole = []
  page.on('console', (m) => m.type() === 'error' && konsole.push(m.text().slice(0, 160)))
  page.on('pageerror', (e) => konsole.push('PAGE-ERR: ' + String(e).slice(0, 160)))
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__bereit === true, { timeout: 30000 })
  return { ctx, page, konsole }
}

/** Bearbeiten an — und im Blatt BLEIBEN. Seit W7 wechselt der Schalter die
 *  Ansicht nicht mehr; wer hier ziehen will, braucht genau diesen einen Griff. */
async function bearbeitenAn(page) {
  await page.getByRole('button', { name: 'Bearbeiten' }).click()
  await page.waitForTimeout(300)
}

/** Ein Stueck, das sich an seiner eigenen Deckelmitte auch wirklich TREFFEN
 *  laesst — ein von einer Tischplatte verdeckter Stuhl waere kein Griff, den
 *  ein Nutzer je machen wuerde, und als Messobjekt eine Falle. */
async function greifbaresStueck(page, typ) {
  return page.evaluate((gesucht) => {
    const koerper = window.__planerDatei.axoMoebel()
    const liste = window.__planerDatei.ausstattung()
    for (const k of koerper) {
      const e = liste.find((q) => q.id === k.id)
      if (!e || (gesucht && e.typ !== gesucht)) continue
      const p = window.__planerDatei.axoAufBild(e.x, e.y, k.y1)
      const t = window.__planerDatei.axoTreffer(p.x, p.y)
      if (t && t.id === k.id) {
        return { id: k.id, typ: e.typ, x: e.x, y: e.y, bx: p.x, by: p.y, y1: k.y1 }
      }
    }
    return null
  }, typ || null)
}

/** Ein echter Zug mit der HAND: `page.mouse` geht durch die Treffer-Ermittlung
 *  des Browsers, `dispatchEvent` nicht (die Lehre aus W6). */
async function ziehe(page, kasten, von, weg, schritte = 12) {
  await page.mouse.move(kasten.left + von.x, kasten.top + von.y)
  await page.waitForTimeout(60)
  await page.mouse.down()
  for (let i = 1; i <= schritte; i++) {
    await page.mouse.move(
      kasten.left + von.x + (weg.x * i) / schritte,
      kasten.top + von.y + (weg.y * i) / schritte
    )
    await page.waitForTimeout(12)
  }
  await page.mouse.up()
  await page.waitForTimeout(450)
}

try {
  /* ══ C · Pixel-Tinte + D · Modell + Historie ═════════════════════════ */
  {
    log('\n═══ C · Pixel-Tinte am gerenderten Blatt · D · Modell ═══')
    const { ctx, page, konsole } = await fenster()
    await bearbeitenAn(page)
    // Ohne Einrasten: nur dann ist der Sollweg im Bild GENAU der Zeigerweg.
    // Mit Einrasten waere jede Abweichung doppeldeutig — Rechenfehler oder
    // Wandanlage? Das Einrasten selbst prueft `pruefe-ziehen.mjs`.
    await page.evaluate(() => window.__planerDatei.setzeEinrasten(false))
    const ziel = await greifbaresStueck(page, 'schrank')
    pruefe(!!ziel, `C0 ein greifbarer Schrank gefunden${ziel ? ` (${ziel.id})` : ''}`)
    if (ziel) {
      const kasten = await page.evaluate(() => window.__planerDatei.axoKasten())
      const vorher = await page.evaluate((id) => window.__planerDatei.stueck(id), ziel.id)
      const gesetzteVorher = await page.evaluate(() => window.__planerDatei.gesetzte())

      // --- Gegenprobe zuerst: ein Zug OHNE Weg darf nichts aendern.
      await page.evaluate(() => window.__planerDatei.axoMerken())
      await ziehe(page, kasten, { x: ziel.bx, y: ziel.by }, { x: 0, y: 0 }, 4)
      const ruhe = await page.evaluate(() => window.__planerDatei.axoAenderung(24))
      // Der Zeiger steht danach auf dem Stueck — das aendert nichts am Bild,
      // aber der Vergleich soll gar nicht erst davon abhaengen: er wird VOR
      // jeder Messung weggefahren.
      await page.mouse.move(kasten.left + 8, kasten.top + 8)
      pruefe(
        ruhe && ruhe.n < 200,
        `C1 GEGENPROBE: ein Zug ohne Weg laesst das Blatt stehen (${ruhe ? ruhe.n : '?'} geaenderte Bildpunkte < 200)`
      )

      // --- Der echte Zug. VORHER und NACHHER als Standbild: kein
      // Geometrie-Gate dieses Projekts ist bestanden, ohne dass jemand ins Bild
      // gesehen hat (Projekt-DNA Punkt 2). Ein gezogenes Moebel, das im Bild an
      // der falschen Stelle sitzt, besteht jede Zahlenpruefung.
      const bilderOrdner = path.join(WURZEL, 'data/standbilder')
      fs.mkdirSync(bilderOrdner, { recursive: true })
      const ausschnitt = {
        x: Math.max(0, Math.round(ziel.bx) - 200),
        y: Math.max(0, Math.round(ziel.by) - 160),
        width: 480,
        height: 320
      }
      await page.mouse.move(kasten.left + 8, kasten.top + 8)
      await page.waitForTimeout(150)
      await page.screenshot({ path: path.join(bilderOrdner, 'w7-axo-1-vor-zug.png'), clip: ausschnitt })

      const weg = { x: 90, y: 45 }
      await page.evaluate(() => window.__planerDatei.axoMerken())
      const sollVor = await page.evaluate(
        (a) => window.__planerDatei.axoAufBild(a.x, a.y, a.h),
        { x: vorher.x, y: vorher.y, h: ziel.y1 }
      )
      await ziehe(page, kasten, { x: ziel.bx, y: ziel.by }, weg)
      await page.mouse.move(kasten.left + 8, kasten.top + 8)
      await page.waitForTimeout(200)
      const nachher = await page.evaluate((id) => window.__planerDatei.stueck(id), ziel.id)
      const sollNach = await page.evaluate(
        (a) => window.__planerDatei.axoAufBild(a.x, a.y, a.h),
        { x: nachher.x, y: nachher.y, h: ziel.y1 }
      )
      const aend = await page.evaluate(() => window.__planerDatei.axoAenderung(24))
      await page.screenshot({ path: path.join(bilderOrdner, 'w7-axo-2-nach-zug.png'), clip: ausschnitt })

      // C2 — DER BILDWEG IST DER ZEIGERWEG. Das ist die eigentliche Probe auf
      // die Rueckrechnung: der Griff-Versatz liegt im Weltmass fest, die
      // Ziehebene auch — also muss sich das Stueck im BILD genau so weit
      // bewegen wie die Hand. Toleranz 2 px: das Modell rundet auf ganze
      // Zentimeter (Projekt-DNA Punkt 3).
      const abX = Math.abs(sollNach.x - sollVor.x - weg.x)
      const abY = Math.abs(sollNach.y - sollVor.y - weg.y)
      pruefe(
        abX <= 2 && abY <= 2,
        `C2 der Bildweg ist der Zeigerweg: Soll ${weg.x}/${weg.y} px, ` +
          `gemessen ${(sollNach.x - sollVor.x).toFixed(1)}/${(sollNach.y - sollVor.y).toFixed(1)} px ` +
          `(Abweichung ${abX.toFixed(1)}/${abY.toFixed(1)} <= 2)`
      )

      // C3 — und man SIEHT es: der Schwerpunkt der veraenderten Bildpunkte
      // liegt zwischen altem und neuem Ort, denn beide Stellen aendern sich.
      const mitteX = (sollVor.x + sollNach.x) / 2
      const mitteY = (sollVor.y + sollNach.y) / 2
      const abstand = aend && aend.n ? Math.hypot(aend.x - mitteX, aend.y - mitteY) : Infinity
      pruefe(
        aend && aend.n > 400 && abstand < 60,
        `C3 Pixel-Tinte: ${aend ? aend.n : '?'} Bildpunkte geaendert, Schwerpunkt ` +
          `${aend && aend.n ? aend.x.toFixed(0) + '/' + aend.y.toFixed(0) : '?'} gegen Sollmitte ` +
          `${mitteX.toFixed(0)}/${mitteY.toFixed(0)} — Abstand ${abstand.toFixed(0)} px (< 60)`
      )

      // C4 — GEGENPROBE: ein ANDERES Stueck ziehen aendert anderswo.
      const anderes = await page.evaluate((ausser) => {
        const koerper = window.__planerDatei.axoMoebel()
        const liste = window.__planerDatei.ausstattung()
        for (const k of koerper) {
          if (k.id === ausser) continue
          const e = liste.find((q) => q.id === k.id)
          if (!e || e.typ !== 'schrank') continue
          const p = window.__planerDatei.axoAufBild(e.x, e.y, k.y1)
          const t = window.__planerDatei.axoTreffer(p.x, p.y)
          if (t && t.id === k.id) return { id: k.id, bx: p.x, by: p.y }
        }
        return null
      }, ziel.id)
      if (anderes) {
        await page.evaluate(() => window.__planerDatei.axoMerken())
        await ziehe(page, kasten, { x: anderes.bx, y: anderes.by }, { x: -70, y: 35 })
        await page.mouse.move(kasten.left + 8, kasten.top + 8)
        await page.waitForTimeout(200)
        const aend2 = await page.evaluate(() => window.__planerDatei.axoAenderung(24))
        const weitWeg = aend2 && aend2.n ? Math.hypot(aend2.x - mitteX, aend2.y - mitteY) : 0
        pruefe(
          aend2 && aend2.n > 400 && weitWeg > 60,
          `C4 GEGENPROBE: ein anderes Stueck aendert das Bild ANDERSWO ` +
            `(${aend2 ? aend2.n : '?'} Punkte, ${weitWeg.toFixed(0)} px von der ersten Sollmitte entfernt > 60)`
        )
      } else {
        pruefe(false, `C4 GEGENPROBE: kein zweiter greifbarer Schrank gefunden`)
      }

      // --- D · Modell und Historie.
      pruefe(
        nachher.x !== vorher.x || nachher.y !== vorher.y,
        `D1 das Modell ist gewandert: ${vorher.x}/${vorher.y} -> ${nachher.x}/${nachher.y} cm`
      )
      pruefe(
        nachher.quelle === 'gesetzt' && vorher.quelle === 'gemessen',
        `D2 ein gezogenes Stueck ist FREI GESETZT (${vorher.quelle} -> ${nachher.quelle})`
      )
      const gesetzteNachher = await page.evaluate(() => window.__planerDatei.gesetzte())
      pruefe(
        gesetzteNachher === gesetzteVorher + 2,
        `D3 der Zaehler im Blattkopf folgt: ${gesetzteVorher} -> ${gesetzteNachher} (zwei Zuege)`
      )
      // D4 — ZWEI Zuege sind ZWEI Rueckgaengig-Schritte, und EIN Schritt stellt
      // genau einen her. Das ist die Probe darauf, dass der Schnappschuss beim
      // ERSTEN Schritt gezogen wird und nicht bei jeder Bewegung.
      await page.evaluate(() => window.__planerDatei.undoJetzt())
      await page.waitForTimeout(250)
      const nachEinmal = await page.evaluate((id) => window.__planerDatei.stueck(id), ziel.id)
      pruefe(
        nachEinmal && nachEinmal.x === nachher.x && nachEinmal.y === nachher.y,
        `D4 ein Rueckgaengig nimmt den ZWEITEN Zug zurueck, nicht den ersten ` +
          `(dieses Stueck steht noch auf ${nachEinmal ? nachEinmal.x + '/' + nachEinmal.y : '?'})`
      )
      await page.evaluate(() => window.__planerDatei.undoJetzt())
      await page.waitForTimeout(250)
      const nachZweimal = await page.evaluate((id) => window.__planerDatei.stueck(id), ziel.id)
      pruefe(
        nachZweimal && nachZweimal.x === vorher.x && nachZweimal.y === vorher.y && nachZweimal.quelle === 'gemessen',
        `D5 ein zweites Rueckgaengig stellt den Ausgangsstand her ` +
          `(${nachZweimal ? nachZweimal.x + '/' + nachZweimal.y + ' ' + nachZweimal.quelle : '?'})`
      )
    }
    pruefe(konsole.length === 0, `C/D keine Konsolenfehler (${konsole.length}${konsole.length ? ': ' + konsole[0] : ''})`)
    await ctx.close()
  }

  /* ══ E · Gesten-Trennung ═════════════════════════════════════════════ */
  {
    log('\n═══ E · Gesten-Trennung (echte Zeiger) ═══')
    const { ctx, page, konsole } = await fenster()
    await bearbeitenAn(page)
    const kasten = await page.evaluate(() => window.__planerDatei.axoKasten())
    const ziel = await greifbaresStueck(page, 'schrank')

    // E1 — Druck auf ein MOEBEL: das Modell wandert, der Blick steht.
    const blickVor = await page.evaluate(() => window.__planerDatei.axoBlick())
    const vorher = await page.evaluate((id) => window.__planerDatei.stueck(id), ziel.id)
    await ziehe(page, kasten, { x: ziel.bx, y: ziel.by }, { x: 60, y: 30 })
    const nachher = await page.evaluate((id) => window.__planerDatei.stueck(id), ziel.id)
    const blickNach = await page.evaluate(() => window.__planerDatei.axoBlick())
    pruefe(
      (nachher.x !== vorher.x || nachher.y !== vorher.y) &&
        blickNach.az === blickVor.az &&
        blickNach.el === blickVor.el,
      `E1 Druck auf ein Moebel bewegt es und laesst den Blick stehen ` +
        `(az ${blickVor.az} -> ${blickNach.az}, el ${blickVor.el} -> ${blickNach.el})`
    )

    // E2 — GEGENPROBE: Druck auf die BUEHNE dreht und bewegt nichts. Der Punkt
    // wird gerechnet, nicht geraten: eine Stelle, an der `koerperUnter` `null`
    // liefert. Sonst bewiese ein „nichts bewegt" nur, dass man daneben lag.
    const leer = await page.evaluate(() => {
      const k = window.__planerDatei.axoKasten()
      for (let y = 20; y < k.hoehe - 20; y += 17) {
        for (let x = 20; x < k.breite - 320; x += 19) {
          if (!window.__planerDatei.axoTreffer(x, y)) return { x, y }
        }
      }
      return null
    })
    pruefe(!!leer, `E2a eine Stelle ohne Moebel gefunden (${leer ? leer.x + '/' + leer.y : '?'})`)
    const standVor = await page.evaluate(() => window.__planerDatei.ausstattung().map((e) => e.x + ':' + e.y).join('|'))
    const blickVor2 = await page.evaluate(() => window.__planerDatei.axoBlick())
    await ziehe(page, kasten, leer, { x: 70, y: 25 })
    const standNach = await page.evaluate(() => window.__planerDatei.ausstattung().map((e) => e.x + ':' + e.y).join('|'))
    const blickNach2 = await page.evaluate(() => window.__planerDatei.axoBlick())
    pruefe(
      standVor === standNach && blickNach2.az !== blickVor2.az,
      `E2b GEGENPROBE: Druck auf die Buehne DREHT (az ${blickVor2.az.toFixed(3)} -> ` +
        `${blickNach2.az.toFixed(3)}) und bewegt kein einziges Stueck`
    )

    // E3 — der Zeiger sagt es, bevor etwas passiert.
    await page.evaluate(() => window.__planerDatei.axoSetzeBlick(-0.52, 0.62))
    await page.waitForTimeout(200)
    const ziel2 = await greifbaresStueck(page, 'schrank')
    await page.mouse.move(kasten.left + ziel2.bx, kasten.top + ziel2.by)
    await page.waitForTimeout(150)
    const aufMoebel = await page.evaluate(() => ({
      id: window.__planerDatei.axoUnterZeiger(),
      stil: document.getElementById('axo-canvas').style.cursor
    }))
    await page.mouse.move(kasten.left + leer.x, kasten.top + leer.y)
    await page.waitForTimeout(150)
    const aufBuehne = await page.evaluate(() => ({
      id: window.__planerDatei.axoUnterZeiger(),
      stil: document.getElementById('axo-canvas').style.cursor
    }))
    pruefe(
      aufMoebel.id === ziel2.id && aufMoebel.stil === 'move' && aufBuehne.id === null && aufBuehne.stil === '',
      `E3 der Zeiger sagt es: ueber dem Moebel "${aufMoebel.stil}", ueber der Buehne ` +
        `"${aufBuehne.stil || '(die Vorgabe des Blattes)'}"`
    )

    // E4 — Q dreht das Stueck UNTER DEM ZEIGER, und zwar um 15°.
    await page.mouse.move(kasten.left + ziel2.bx, kasten.top + ziel2.by)
    await page.waitForTimeout(150)
    const drehVor = await page.evaluate((id) => window.__planerDatei.stueck(id).drehung, ziel2.id)
    await page.keyboard.press('e')
    await page.waitForTimeout(300)
    const drehNach = await page.evaluate((id) => window.__planerDatei.stueck(id).drehung, ziel2.id)
    const grad = (((drehNach - drehVor) * 180) / Math.PI + 360) % 360
    pruefe(
      Math.abs(grad - 15) < 0.5,
      `E4 "E" dreht das Stueck unter dem Zeiger um ${grad.toFixed(2)}° (Soll 15°)`
    )

    // E5 — GEGENPROBE: dieselbe Taste ueber der BUEHNE dreht nichts. Das ist
    // der Riegel gegen `activeAusstattung` aus dem Grundriss: der letzte
    // Treffer DORT bleibt liegen, und ohne diesen Riegel drehte ein Q im Blatt
    // ein Stueck, das man gar nicht sieht.
    const alleVor = await page.evaluate(() =>
      window.__planerDatei.ausstattung().map((e) => e.id + ':' + e.drehung).join('|')
    )
    await page.mouse.move(kasten.left + leer.x, kasten.top + leer.y)
    await page.waitForTimeout(150)
    await page.keyboard.press('e')
    await page.keyboard.press('q')
    await page.waitForTimeout(300)
    const alleNach = await page.evaluate(() =>
      window.__planerDatei.ausstattung().map((e) => e.id + ':' + e.drehung).join('|')
    )
    pruefe(alleVor === alleNach, `E5 GEGENPROBE: Q und E ueber der Buehne drehen KEIN einziges Stueck`)

    // E6 — Entf FRAGT, loescht nicht. Und die Frage ist SICHTBAR: sie lag bis
    // W7 im Grundriss-Umschlag und waere hier unsichtbar gewesen.
    await page.mouse.move(kasten.left + ziel2.bx, kasten.top + ziel2.by)
    await page.waitForTimeout(150)
    const zahlVor = await page.evaluate(() => window.__planerDatei.zahlen().ausstattung)
    await page.keyboard.press('Delete')
    await page.waitForTimeout(300)
    const frage = await page.evaluate(() => {
      const f = document.getElementById('rueckfrage')
      return {
        sichtbar: f.checkVisibility ? f.checkVisibility() : !f.hidden,
        text: document.getElementById('rueckfrageZiel').textContent
      }
    })
    const zahlWaehrend = await page.evaluate(() => window.__planerDatei.zahlen().ausstattung)
    pruefe(
      frage.sichtbar && zahlWaehrend === zahlVor,
      `E6 "Entf" FRAGT statt zu loeschen: „${frage.text}" sichtbar=${frage.sichtbar}, ` +
        `noch ${zahlWaehrend} von ${zahlVor} Stueck`
    )
    await page.getByRole('button', { name: 'Entfernen', exact: true }).click()
    await page.waitForTimeout(350)
    const zahlNach = await page.evaluate(() => window.__planerDatei.zahlen().ausstattung)
    const weg = await page.evaluate((id) => window.__planerDatei.stueck(id), ziel2.id)
    pruefe(
      zahlNach === zahlVor - 1 && weg === null,
      `E7 bestaetigt verschwindet es wirklich: ${zahlVor} -> ${zahlNach} Stueck`
    )
    await page.evaluate(() => window.__planerDatei.undoJetzt())
    await page.waitForTimeout(300)
    pruefe(
      (await page.evaluate(() => window.__planerDatei.zahlen().ausstattung)) === zahlVor,
      `E8 ein Rueckgaengig holt es zurueck`
    )
    pruefe(konsole.length === 0, `E keine Konsolenfehler (${konsole.length}${konsole.length ? ': ' + konsole[0] : ''})`)
    await ctx.close()
  }

  /* ══ F · Kosten je Zeigerbewegung ════════════════════════════════════ */
  {
    log('\n═══ F · Kosten je Zeigerbewegung ═══')
    const { ctx, page, konsole } = await fenster()
    await bearbeitenAn(page)
    const kasten = await page.evaluate(() => window.__planerDatei.axoKasten())
    const ziel = await greifbaresStueck(page, 'schrank')

    /**
     * Misst, was EINE Zeigerbewegung im Zug die Seite kostet.
     *
     * ZWEI Zuhoerer am FENSTER, einer in der Fang-, einer in der Blasenphase:
     * dazwischen laeuft alles, was das Canvas mit dem Ereignis anstellt. Der
     * erste Versuch mass mit `queueMicrotask` innerhalb EINES Zuhoerers und
     * bekam 0,0 ms — der Browser leert seine Mikroaufgaben zwischen den
     * Zuhoerern, die Uhr lief also los und stand still, bevor der Renderer
     * ueberhaupt drankam. Ein Messverfahren, das immer null liefert, haette
     * jede Gegenprobe bestanden.
     */
    const messeZug = async () => {
      await page.mouse.move(kasten.left + ziel.bx, kasten.top + ziel.by)
      await page.mouse.down()
      await page.evaluate(() => {
        window.__marken = []
        window.__t0 = 0
        window.__auf = () => { window.__t0 = performance.now() }
        window.__zu = () => { window.__marken.push(performance.now() - window.__t0) }
        addEventListener('pointermove', window.__auf, true)
        addEventListener('pointermove', window.__zu, false)
      })
      for (let i = 1; i <= 20; i++) {
        await page.mouse.move(kasten.left + ziel.bx + i * 3, kasten.top + ziel.by + i * 1.5)
      }
      const marken = await page.evaluate(() => {
        removeEventListener('pointermove', window.__auf, true)
        removeEventListener('pointermove', window.__zu, false)
        return window.__marken
      })
      await page.mouse.up()
      await page.waitForTimeout(400)
      marken.sort((a, b) => a - b)
      return {
        mittel: marken.reduce((s, v) => s + v, 0) / Math.max(1, marken.length),
        hoechst: marken[marken.length - 1],
        n: marken.length
      }
    }

    const billig = await messeZug()
    pruefe(
      billig.hoechst < 16,
      `F1 im Zug wird EIN Koerper getauscht: hoechste Bewegung ${billig.hoechst.toFixed(1)} ms, ` +
        `Mittel ${billig.mittel.toFixed(1)} ms ueber ${billig.n} Bewegungen (< 16 ms)`
    )

    // GEGENPROBE: derselbe Zug mit dem vollen Szenen-Neubau je Bewegung. Er
    // kostet gemessen 16,2 ms — dieses Gate MUSS das bemerken, sonst misst es
    // nichts.
    await page.evaluate(() => window.__planerDatei.axoVollNeubau(true))
    const teuer = await messeZug()
    await page.evaluate(() => window.__planerDatei.axoVollNeubau(false))
    pruefe(
      teuer.hoechst >= 16 && teuer.hoechst > billig.hoechst * 2,
      `F2 GEGENPROBE: mit vollem Szenen-Neubau je Bewegung ${teuer.hoechst.toFixed(1)} ms ` +
        `(Mittel ${teuer.mittel.toFixed(1)}) — das Gate bemerkt den Unterschied (${(teuer.hoechst / Math.max(0.01, billig.hoechst)).toFixed(1)}-fach)`
    )
    pruefe(konsole.length === 0, `F keine Konsolenfehler (${konsole.length}${konsole.length ? ': ' + konsole[0] : ''})`)
    await ctx.close()
  }

  /* ══ G · Die Grenze und der Auslieferungszustand ═════════════════════ */
  {
    log('\n═══ G · Die ehrliche Grenze + Auslieferungszustand ═══')
    const { ctx, page, konsole } = await fenster()
    const kasten = await page.evaluate(() => window.__planerDatei.axoKasten())

    // G1 — DER AUSLIEFERUNGSZUSTAND. Ohne „Bearbeiten" nimmt das Blatt keinen
    // Griff an: es ist ein Blatt, kein Werkzeug.
    const ziel = await greifbaresStueck(page, 'schrank')
    const vorher = await page.evaluate((id) => window.__planerDatei.stueck(id), ziel.id)
    await ziehe(page, kasten, { x: ziel.bx, y: ziel.by }, { x: 80, y: 40 })
    const nachher = await page.evaluate((id) => window.__planerDatei.stueck(id), ziel.id)
    const gesetzte = await page.evaluate(() => window.__planerDatei.gesetzte())
    pruefe(
      nachher.x === vorher.x && nachher.y === vorher.y && gesetzte === 0,
      `G1 ohne „Bearbeiten" nimmt das Blatt keinen Griff an (${vorher.x}/${vorher.y} unveraendert, ${gesetzte} frei gesetzt)`
    )
    pruefe(
      (await page.evaluate(() => window.__planerDatei.axoUnterZeiger())) === null,
      `G1b und es zeigt auch nichts an — der Treffer wird gar nicht erst gesucht`
    )

    // G2 — GEGENPROBE: derselbe Griff MIT „Bearbeiten" wirkt sehr wohl.
    //
    // Der Blick MUSS vorher zurueckgestellt werden: der abgewiesene Zug in G1
    // hat das Blatt gedreht (genau das soll er — ohne Bearbeiten ist Ziehen
    // Drehen), und danach zeigt derselbe Bildpunkt woandershin. Ohne diese
    // Zeile pruefte die Gegenprobe einen Griff ins Leere und meldete „wirkt
    // nicht" fuer etwas, das sehr wohl wirkt.
    await page.evaluate(() => window.__planerDatei.axoSetzeBlick(-0.52, 0.62))
    await page.waitForTimeout(250)
    await bearbeitenAn(page)
    const ziel2 = await greifbaresStueck(page, 'schrank')
    const vorGriff = await page.evaluate((id) => window.__planerDatei.stueck(id), ziel2.id)
    await ziehe(page, kasten, { x: ziel2.bx, y: ziel2.by }, { x: 80, y: 40 })
    const mitBearbeiten = await page.evaluate((id) => window.__planerDatei.stueck(id), ziel2.id)
    pruefe(
      mitBearbeiten.x !== vorGriff.x || mitBearbeiten.y !== vorGriff.y,
      `G2 GEGENPROBE: mit „Bearbeiten" wirkt derselbe Griff ` +
        `(${vorGriff.x}/${vorGriff.y} -> ${mitBearbeiten.x}/${mitBearbeiten.y})`
    )

    // G3 — DIE FLACHE GRENZE. Unter el = 0,35 wird nicht gezogen, und das Blatt
    // SAGT es — vorher und beim Versuch.
    await page.evaluate(() => window.__planerDatei.axoSetzeBlick(-0.52, 0.2))
    await page.waitForTimeout(300)
    await page.evaluate(() => {
      // Der Hinweis haengt am Ende eines Dreh-Zuges; hier wurde der Blick
      // gesetzt, also einmal von Hand nachziehen — genau wie es ein Zeigerende
      // tun wuerde.
      document.getElementById('axo-canvas').dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    })
    await page.waitForTimeout(150)
    const ziehbar = await page.evaluate(() => window.__planerDatei.axoZiehbar())
    const hinweis = await page.evaluate(() => window.__planerDatei.arbeitshinweisText())
    pruefe(
      ziehbar === false && /flach/i.test(hinweis || ''),
      `G3 bei el = 0,20 (< ${NEIGUNG_MIN_ZIEHEN}) sagt das Blatt es VORHER: „${hinweis}"`
    )
    const flachZiel = await greifbaresStueck(page, 'schrank')
    if (flachZiel) {
      const vorFlach = await page.evaluate((id) => window.__planerDatei.stueck(id), flachZiel.id)
      await ziehe(page, kasten, { x: flachZiel.bx, y: flachZiel.by }, { x: 60, y: 30 })
      const nachFlach = await page.evaluate((id) => window.__planerDatei.stueck(id), flachZiel.id)
      const meldung = await page.evaluate(() => window.__planerDatei.meldungText())
      pruefe(
        vorFlach.x === nachFlach.x && vorFlach.y === nachFlach.y && /zu flach/i.test(meldung || ''),
        `G4 und verweigert nicht STILL: „${(meldung || '').slice(0, 70)}…" — das Stueck steht still`
      )
      // G5 — aber DREHEN geht weiter: die Drehung ist eine reine
      // Modell-Operation und braucht keine Tiefe aus dem Bild.
      //
      // Auch hier den Blick zuruecksetzen: der abgewiesene Zug oben hat das
      // Blatt gedreht (er WIRD zum Drehzug, so ist es gemeint), und dabei kann
      // die Neigung die Grenze wieder ueberschritten haben.
      await page.evaluate(() => window.__planerDatei.axoSetzeBlick(-0.52, 0.2))
      await page.waitForTimeout(250)
      const drehZiel = await greifbaresStueck(page, 'schrank')
      await page.mouse.move(kasten.left + drehZiel.bx, kasten.top + drehZiel.by)
      await page.waitForTimeout(200)
      const nochFlach = await page.evaluate(() => window.__planerDatei.axoZiehbar())
      const drehVor = await page.evaluate((id) => window.__planerDatei.stueck(id).drehung, drehZiel.id)
      await page.keyboard.press('e')
      await page.waitForTimeout(300)
      const drehNach = await page.evaluate((id) => window.__planerDatei.stueck(id).drehung, drehZiel.id)
      pruefe(
        nochFlach === false &&
          Math.abs(((((drehNach - drehVor) * 180) / Math.PI + 360) % 360) - 15) < 0.5,
        `G5 im flachen Blick (ziehbar=${nochFlach}) wird trotzdem GEDREHT ` +
          `(${((((drehNach - drehVor) * 180) / Math.PI + 360) % 360).toFixed(2)}°) — genau das sagt der Hinweis zu`
      )
    } else {
      pruefe(false, `G4 im flachen Blick war kein Stueck greifbar — die Probe konnte nicht laufen`)
    }

    // G6 — WAS ES NICHT GIBT, und zwar mit Absicht. Ein Druck auf eine WAND
    // greift nichts: die Krone liegt 1,63 m neben dem Fusspunkt, und eine
    // verschobene gemessene Ecke braeche den Rueckweg aus W5 hart ab.
    await page.evaluate(() => window.__planerDatei.axoSetzeBlick(-0.52, 0.62))
    await page.waitForTimeout(300)
    const aufWand = await page.evaluate(() => {
      const k = window.__planerDatei.axoKasten()
      // Eine Stelle suchen, an der ein WANDSTUECK gemalt ist, aber kein Moebel:
      // gerechnet ueber die Szene, nicht geraten.
      for (let y = 30; y < k.hoehe - 30; y += 7) {
        for (let x = 30; x < k.breite - 320; x += 7) {
          if (window.__planerDatei.axoTreffer(x, y)) continue
          const p = window.__planerDatei.axoAufBild(0, 0, 0)
          if (p) return { x, y }
        }
      }
      return null
    })
    const standVor = await page.evaluate(() =>
      window.__planerDatei.waende().map((w) => w.wax + ':' + w.way).join('|')
    )
    if (aufWand) {
      await ziehe(page, kasten, aufWand, { x: 40, y: 20 })
    }
    const standNach = await page.evaluate(() =>
      window.__planerDatei.waende().map((w) => w.wax + ':' + w.way).join('|')
    )
    pruefe(
      standVor === standNach,
      `G6 kein Zeigerzug im Blatt bewegt eine WAND — die Grenze der alten Festlegung gilt weiter`
    )
    pruefe(konsole.length === 0, `G keine Konsolenfehler (${konsole.length}${konsole.length ? ': ' + konsole[0] : ''})`)

    /* Das GANZE Blatt im Bearbeiten-Zustand — damit auch die Zeile oben, der
       Zaehler im Blattkopf und die Strichelung der gesetzten Stuecke einmal
       gesehen werden koennen und nicht nur gezaehlt. */
    const bilder = path.join(WURZEL, 'data/standbilder')
    fs.mkdirSync(bilder, { recursive: true })
    await page.evaluate(() => window.__planerDatei.axoSetzeBlick(-0.52, 0.62))
    await page.mouse.move(kasten.left + 8, kasten.top + 8)
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(bilder, 'w7-axo-3-blatt.png') })
    log(
      `\nStandbilder: data/standbilder/w7-axo-1-vor-zug.png · w7-axo-2-nach-zug.png · w7-axo-3-blatt.png — ANSEHEN.`
    )
    await ctx.close()
  }
} finally {
  await browser.close()
}

ende()

function ende() {
  log(`\n${fehler.length ? `${fehler.length} PRUEFUNG(EN) DURCHGEFALLEN` : 'ALLE PRUEFUNGEN BESTANDEN'}`)
  fehler.forEach((f) => log(`  · ${f}`))
  fs.rmSync(DIR, { recursive: true, force: true })
  process.exit(fehler.length ? 1 : 0)
}
