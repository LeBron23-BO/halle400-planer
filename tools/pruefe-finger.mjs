// Prueft das BEARBEITEN MIT DEM FINGER (Handy-Welle) an der Doppelklick-Datei.
//
//   node tools/baue-planer-datei.mjs
//   node tools/pruefe-finger.mjs [--datei Halle400-Modell.html]
// Exit 0 = alle Pruefungen bestanden, 1 = mindestens eine durchgefallen.
//
// DIE LUECKE, DIE HIER GESCHLOSSEN WIRD
// Bis zur Handy-Welle deckte `bearbeitetMitEinemFinger` nur Zeichnen und
// Loeschen ab: ein Finger auf einem Moebel schob die ANSICHT. Damit war am
// Telefon nichts zu ziehen — weder ein vorhandenes Stueck (W2) noch eines aus
// der Palette (W3) noch etwas im Blatt (W7). Genau das misst dieses Gate.
//
// ECHTE BERUEHRUNGEN, KEIN MAUS-ERSATZ — und auch kein `dispatchEvent`.
// `tools/pruefe-touch.mjs` baut seine `TouchEvent`s von Hand und schickt sie an
// das Canvas; das genuegt fuer den Kern, der `touchstart/move/end` abhoert.
// FUER DAS BLATT genuegt es NICHT: der Renderer hoert `pointerdown/move/up` ab,
// und ein von Hand gebautes `TouchEvent` erzeugt kein einziges Zeiger-Ereignis.
// Ein Gate mit `dispatchEvent` haette dort gruen gemeldet, was am Telefon tot
// ist — die Lehre aus W6 („dispatchEvent ist keine Hand"), nur eine Ebene
// tiefer. Deshalb `Input.dispatchTouchEvent` ueber CDP: das ist der Weg, den
// eine echte Fingerkuppe nimmt, samt Treffer-Ermittlung des Browsers und samt
// der vollen Ereigniskette (pointerdown UND touchstart).
//
// JEDE PRUEFUNG HAT EINE GEGENPROBE:
//   A  Grundriss: Moebel folgt dem Finger  · Gegenprobe: derselbe Wisch auf
//                                             leerer Flaeche bewegt NICHTS und
//                                             schiebt die Ansicht
//   B  Blatt: dasselbe in der Axonometrie  · Gegenprobe: leerer Wisch DREHT nur
//   C  Ein Zug = EIN Rueckgaengig-Schritt  · Gegenprobe: der zweite Schritt
//                                             findet nichts mehr vom Zug
//   D  Zwei Finger zoomen, ohne zu ziehen  · Gegenprobe: EIN Finger an
//                                             derselben Stelle zieht sehr wohl
//   E  Auslieferungszustand: nichts geht   · Gegenprobe: mit „Bearbeiten" schon
//   F  Was in der Hand ist, SIEHT man      · Gegenprobe: ohne Griff aendert
//                                             sich am Bild nichts
//   G  Palette am Handy, mit dem Finger    · Gegenprobe: Loslassen AUF der
//                                             Palette erzeugt nichts
//   H  Die Leiste ist am Handy erreichbar  · Gegenprobe: das Loeschen laeuft
//                                             wirklich durch (Langdruck)
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HIER = path.dirname(fileURLToPath(import.meta.url))
const WURZEL = path.resolve(HIER, '..')
const PW_STANDARD = 'file:///C:/Users/dania/.gemini/node_modules/playwright/index.js'
const arg = (name, standard) => {
  const i = process.argv.indexOf(name)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : standard
}
const DATEI = path.resolve(WURZEL, arg('--datei', 'Halle400-Modell.html'))
const NUR = arg('--nur', '') // "grundriss" | "blatt" | "palette" | "leiste"

/* 390 x 800 — die Anzeige, an der in diesem Vorhaben gemessen wird (W7 hat die
   Handy-Entscheidungen an genau diesem Format getroffen). */
const BREITE = 390
const HOEHE = 800

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'h400-finger-'))
const BERICHT = path.join(DIR, 'bericht.txt')
fs.writeFileSync(BERICHT, '')
const STANDBILDER = path.join(WURZEL, 'data/standbilder')
fs.mkdirSync(STANDBILDER, { recursive: true })

const fehler = []
const log = (s) => {
  console.log(s)
  fs.appendFileSync(BERICHT, s + '\n')
}
const pruefe = (bedingung, text) => {
  log(`${bedingung ? 'OK  ' : 'FEHL'} ${text}`)
  if (!bedingung) fehler.push(text)
}
const ende = () => {
  log('')
  log(fehler.length === 0 ? 'ALLE PRUEFUNGEN BESTANDEN' : `DURCHGEFALLEN: ${fehler.length}`)
  fehler.forEach((f) => log('  - ' + f))
  log(`Bericht: ${BERICHT}`)
  log(`Standbilder: ${STANDBILDER}`)
  process.exit(fehler.length === 0 ? 0 : 1)
}

if (!fs.existsSync(DATEI)) {
  pruefe(false, `die Doppelklick-Datei fehlt (${DATEI}) — erst "node tools/baue-planer-datei.mjs"`)
  ende()
}

const { chromium } = (await import(process.env.PLAYWRIGHT_PFAD || PW_STANDARD)).default

/* Eine eigene Kopie an einem eigenen Ort: `file://` ist EIN Ursprung fuer die
   ganze Festplatte, und der Speicher-Schluessel traegt den Ablageort. Ohne die
   Kopie liefe dieses Gate im selben Speicher wie die Datei des Nutzers. */
const ORT = path.join(DIR, 'ordner')
fs.mkdirSync(ORT)
fs.copyFileSync(DATEI, path.join(ORT, 'Halle400-Modell.html'))
const URL = pathToFileURL(path.join(ORT, 'Halle400-Modell.html')).href

const browser = await chromium.launch()

/** Ein frisches Handy-Fenster mit gesperrtem Netz — wie in `pruefe-haertung.mjs`. */
async function fenster() {
  const ctx = await browser.newContext({
    viewport: { width: BREITE, height: HOEHE },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true
  })
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
  const cdp = await ctx.newCDPSession(page)
  return { ctx, page, konsole, hand: hand(cdp, page) }
}

/**
 * DIE HAND. Jede Beruehrung geht durch `Input.dispatchTouchEvent` — den Weg
 * einer echten Fingerkuppe.
 */
function hand(cdp, page) {
  const punkte = (ps) =>
    ps.map((p, i) => ({ x: Math.round(p.x), y: Math.round(p.y), radiusX: 6, radiusY: 6, force: 1, id: i + 1 }))
  const senden = (typ, ps) => cdp.send('Input.dispatchTouchEvent', { type: typ, touchPoints: punkte(ps) })
  return {
    auf: (ps) => senden('touchStart', ps),
    zu: (ps) => senden('touchMove', ps),
    ab: (ps = []) => senden('touchEnd', ps),
    /**
     * Aufsetzen, in `schritte` Stufen wischen, abheben. Die Stufen sind nicht
     * Zierde: ein einziger Sprung von A nach B waere kein Wischen, sondern ein
     * Versetzen, und liesse jede Zwischenrechnung ungeprueft.
     */
    async wische(von, weg, schritte = 10, ruheMs = 18) {
      await senden('touchStart', [von])
      await page.waitForTimeout(90)
      for (let i = 1; i <= schritte; i++) {
        await senden('touchMove', [{ x: von.x + (weg.x * i) / schritte, y: von.y + (weg.y * i) / schritte }])
        await page.waitForTimeout(ruheMs)
      }
      await senden('touchEnd', [])
      await page.waitForTimeout(420)
    }
  }
}

/** Bearbeiten an UND in den Grundriss — seit W7 zwei getrennte Griffe. */
async function bearbeitenAn(page, ansicht) {
  await page.getByRole('button', { name: 'Bearbeiten' }).click()
  await page.getByRole('button', { name: ansicht === 'axo' ? 'Axonometrie' : 'Grundriss' }).click()
  await page.waitForTimeout(500)
}

/**
 * Ein Moebel nahe der Bildmitte, gross genug fuer eine Fingerkuppe — und die
 * Ansicht so gezoomt, dass es dort auch bleibt (`zoomeAufPunkt` laesst den
 * Weltpunkt unter dem Bildpunkt stehen).
 *
 * Warum nicht das erstbeste: bei eingepasster Halle ist ein Stuhl zwei Pixel
 * breit. Ein Gate, das darauf zielt, misst die Treffgenauigkeit des Gates.
 */
async function zielImGrundriss(page, zoom) {
  return page.evaluate((z) => {
    const liste = window.__planerDatei.ausstattung().filter((e) => e.breite >= 100 && e.tiefe >= 60)
    let best = null
    for (const e of liste) {
      const d = Math.hypot(e.bx - 195, e.by - 400)
      if (!best || d < best.d) best = { e: e, d: d }
    }
    if (!best) return null
    window.__planerDatei.zoomeAufPunkt(z, best.e.bx, best.e.by)
    return window.__planerDatei.stueck(best.e.id)
  }, zoom)
}

/**
 * Ein Punkt auf der Zeichenflaeche, unter dem NICHTS liegt — weder Moebel noch
 * Wand noch Ecke. GERECHNET aus dem Modell und nicht durch Ausprobieren
 * gefunden: ein per Zeiger gesuchter Punkt haette den Zustand, den er messen
 * soll, schon veraendert.
 */
async function leerePunkte(page) {
  return page.evaluate(() => {
    const proCm = window.__planerDatei.proCm()
    const stuecke = window.__planerDatei.ausstattung().map((e) => {
      const halb = (Math.max(e.breite, e.tiefe) / 2) * proCm + 22
      return { x: e.bx, y: e.by, r: halb }
    })
    const waende = window.__planerDatei.waende()
    const nahAnWand = (x, y) => {
      for (const w of waende) {
        const dx = w.bx - w.ax
        const dy = w.by - w.ay
        const l2 = dx * dx + dy * dy || 1
        let t = ((x - w.ax) * dx + (y - w.ay) * dy) / l2
        t = Math.max(0, Math.min(1, t))
        const px = w.ax + t * dx
        const py = w.ay + t * dy
        if (Math.hypot(x - px, y - py) < w.dicke * proCm + 24) return true
      }
      return false
    }
    const raus = []
    for (let y = 170; y <= 560; y += 20) {
      for (let x = 130; x <= 360; x += 20) {
        if (nahAnWand(x, y)) continue
        let frei = true
        for (const s of stuecke) {
          if (Math.hypot(x - s.x, y - s.y) < s.r) {
            frei = false
            break
          }
        }
        if (frei) raus.push({ x: x, y: y })
      }
    }
    return raus
  })
}

/** Der Zustand ALLER Stuecke in einem Wort — Vergleich ohne Ausnahme. */
const standVon = (page) =>
  page.evaluate(() =>
    window.__planerDatei
      .ausstattung()
      .map((e) => e.id + ':' + e.x + ':' + e.y + ':' + (e.drehung || 0))
      .join('|')
  )

try {
  /* ══════════════════════════════════════════════════════════════════════
     A · DER GRUNDRISS — ein Finger zieht das Moebel, nicht die Ansicht
     ══════════════════════════════════════════════════════════════════════ */
  if (NUR === '' || NUR === 'grundriss') {
    log('\n═══ A · Grundriss: ein Finger zieht ein Moebel ═══')
    const { ctx, page, konsole, hand } = await fenster()
    await bearbeitenAn(page, 'plan')
    /* Ohne Einrasten ist der Sollweg im Bild GENAU der Fingerweg. Mit waere
       jede Abweichung doppeldeutig — Rechenfehler oder Wandanlage? Das
       Einrasten selbst prueft `pruefe-ziehen.mjs`. */
    await page.evaluate(() => window.__planerDatei.setzeEinrasten(false))

    const ziel = await zielImGrundriss(page, 1.2)
    pruefe(!!ziel, `A0 ein greifbares Moebel nahe der Bildmitte${ziel ? ` (${ziel.id}, ${ziel.typ})` : ''}`)

    if (ziel) {
      const proCm = await page.evaluate(() => window.__planerDatei.proCm())
      const vor = await page.evaluate((id) => window.__planerDatei.stueck(id), ziel.id)
      const wegPx = { x: 58, y: 46 }

      // --- Die RUECKMELDUNG zuerst (F): nur AUFSETZEN, noch nicht wischen.
      await page.evaluate(() => window.__planerDatei.planMerken())
      await hand.auf([{ x: vor.bx, y: vor.by }])
      await page.waitForTimeout(220)
      const griffBild = await page.evaluate(() => window.__planerDatei.planAenderung(24))
      await page.screenshot({ path: path.join(STANDBILDER, 'finger-1-gegriffen.png') })
      const beiStueck =
        griffBild && griffBild.n > 0 ? Math.hypot(griffBild.x - vor.bx, griffBild.y - vor.by) : null
      log(
        `    Griff-Rueckmeldung: ${griffBild ? griffBild.n : '?'} geaenderte Bildpunkte, ` +
          `Schwerpunkt ${beiStueck === null ? '—' : beiStueck.toFixed(0) + ' px vom Stueck'}`
      )
      pruefe(
        !!griffBild && griffBild.n > 200,
        `F1 das gegriffene Stueck ist ZU SEHEN (${griffBild ? griffBild.n : '?'} geaenderte Bildpunkte > 200)`
      )
      const halbe = (Math.max(vor.breite, vor.tiefe) / 2) * proCm + 20
      pruefe(
        beiStueck !== null && beiStueck < halbe,
        `F2 und zwar AM STUECK (${beiStueck === null ? '—' : beiStueck.toFixed(0)} px vom Mittelpunkt, ` +
          `erlaubt ${halbe.toFixed(0)} px)`
      )

      // --- ...und jetzt der Zug, ohne den Finger abzuheben.
      for (let i = 1; i <= 10; i++) {
        await hand.zu([{ x: vor.bx + (wegPx.x * i) / 10, y: vor.by + (wegPx.y * i) / 10 }])
        await page.waitForTimeout(18)
      }
      const imZug = await page.evaluate((id) => window.__planerDatei.stueck(id), ziel.id)
      await page.screenshot({ path: path.join(STANDBILDER, 'finger-2-im-zug.png') })
      pruefe(
        imZug.x !== vor.x || imZug.y !== vor.y,
        `A1 das Moebel FOLGT dem Finger, noch bevor er abhebt (${vor.x},${vor.y} -> ${imZug.x},${imZug.y})`
      )
      await hand.ab()
      await page.waitForTimeout(420)

      const nach = await page.evaluate((id) => window.__planerDatei.stueck(id), ziel.id)
      const sollX = vor.x + wegPx.x / proCm
      const sollY = vor.y + wegPx.y / proCm
      const abw = Math.hypot(nach.x - sollX, nach.y - sollY)
      log(
        `    Zug: ${vor.x},${vor.y} -> ${nach.x},${nach.y} cm · ` +
          `Soll ${sollX.toFixed(1)},${sollY.toFixed(1)} · Abweichung ${abw.toFixed(2)} cm`
      )
      pruefe(
        abw <= 1.5,
        `A2 es liegt danach DORT, wo losgelassen wurde (${abw.toFixed(2)} cm Abweichung <= 1,5)`
      )
      pruefe(nach.quelle === 'gesetzt', `A3 das gezogene Stueck traegt quelle "gesetzt" (${nach.quelle})`)
      await page.screenshot({ path: path.join(STANDBILDER, 'finger-3-abgelegt.png') })

      // --- C · EIN Zug = EIN Rueckgaengig-Schritt
      pruefe(await page.evaluate(() => window.__planerDatei.kannZurueck()), 'C1 es gibt etwas zurueckzunehmen')
      await page.evaluate(() => window.__planerDatei.undoJetzt())
      await page.waitForTimeout(300)
      const nachEinmal = await page.evaluate((id) => window.__planerDatei.stueck(id), ziel.id)
      pruefe(
        nachEinmal && nachEinmal.x === vor.x && nachEinmal.y === vor.y,
        `C2 EIN Rueckgaengig stellt den GANZEN Zug zurueck (${nachEinmal ? nachEinmal.x + ',' + nachEinmal.y : '—'} statt ${nach.x},${nach.y})`
      )
      pruefe(
        nachEinmal && nachEinmal.quelle === 'gemessen',
        `C3 und es gilt wieder als gemessen (${nachEinmal ? nachEinmal.quelle : '—'})`
      )
      await page.evaluate(() => window.__planerDatei.undoJetzt())
      await page.waitForTimeout(300)
      const nachZweimal = await page.evaluate((id) => window.__planerDatei.stueck(id), ziel.id)
      pruefe(
        nachZweimal && nachZweimal.x === vor.x && nachZweimal.y === vor.y,
        `C4 GEGENPROBE: ein ZWEITES Rueckgaengig findet vom Zug nichts mehr (${nachZweimal ? nachZweimal.x + ',' + nachZweimal.y : '—'}) — der Zug war EIN Schritt`
      )

      // --- A · GEGENPROBE: derselbe Wisch auf LEERER Flaeche
      const leer = await leerePunkte(page)
      pruefe(leer.length > 0, `A4 ein leerer Punkt auf der Zeichenflaeche gefunden (${leer.length} Kandidaten)`)
      if (leer.length) {
        const p = leer[Math.floor(leer.length / 2)]
        const standVorher = await standVon(page)
        const blickVorher = await page.evaluate(() => window.__planerDatei.aufBild(0, 0))
        await hand.wische(p, wegPx)
        const standNachher = await standVon(page)
        const blickNachher = await page.evaluate(() => window.__planerDatei.aufBild(0, 0))
        const schub = Math.hypot(blickNachher.x - blickVorher.x, blickNachher.y - blickVorher.y)
        pruefe(
          standVorher === standNachher,
          'A5 GEGENPROBE: derselbe Wisch auf leerer Flaeche bewegt KEIN Moebel'
        )
        log(`    Ansichts-Schub: ${schub.toFixed(1)} px (gewischt wurden ${Math.hypot(wegPx.x, wegPx.y).toFixed(1)} px)`)
        pruefe(
          schub > 30,
          `A6 GEGENPROBE: er SCHIEBT die Ansicht (${schub.toFixed(1)} px Versatz > 30)`
        )
        await page.screenshot({ path: path.join(STANDBILDER, 'finger-4-leerer-wisch.png') })

        // --- F · GEGENPROBE zur Rueckmeldung: blosses Aufsetzen auf leerer
        //     Flaeche darf das Bild NICHT veraendern.
        await page.evaluate(() => window.__planerDatei.planMerken())
        await hand.auf([p])
        await page.waitForTimeout(220)
        const leerBild = await page.evaluate(() => window.__planerDatei.planAenderung(24))
        await hand.ab()
        await page.waitForTimeout(200)
        pruefe(
          !!leerBild && leerBild.n < 200,
          `F3 GEGENPROBE: Aufsetzen auf leerer Flaeche markiert NICHTS (${leerBild ? leerBild.n : '?'} geaenderte Bildpunkte < 200)`
        )
      }

      // --- D · ZWEI Finger zoomen und ziehen nichts
      const standVorZoom = await standVon(page)
      const zoomVor = await page.evaluate(() => window.__planerDatei.proCm())
      await hand.auf([
        { x: vor.bx - 40, y: vor.by },
        { x: vor.bx + 40, y: vor.by }
      ])
      await page.waitForTimeout(100)
      for (let i = 1; i <= 6; i++) {
        await hand.zu([
          { x: vor.bx - 40 - i * 8, y: vor.by },
          { x: vor.bx + 40 + i * 8, y: vor.by }
        ])
        await page.waitForTimeout(30)
      }
      await hand.ab([{ x: vor.bx + 88, y: vor.by }])
      await hand.ab()
      await page.waitForTimeout(400)
      const zoomNach = await page.evaluate(() => window.__planerDatei.proCm())
      const standNachZoom = await standVon(page)
      log(`    Zoom: ${zoomVor.toFixed(3)} -> ${zoomNach.toFixed(3)} px/cm`)
      pruefe(zoomNach > zoomVor * 1.05, `D1 ZWEI Finger zoomen weiterhin (${zoomVor.toFixed(3)} -> ${zoomNach.toFixed(3)} px/cm)`)
      pruefe(
        standVorZoom === standNachZoom,
        'D2 GEGENPROBE: dabei wird KEIN Moebel bewegt — obwohl beide Finger auf einem liegen'
      )
    }

    pruefe(konsole.length === 0, `A7 keine Konsolen- oder Seitenfehler (${konsole.length}${konsole.length ? ': ' + konsole[0] : ''})`)
    await ctx.close()
  }

  /* ══════════════════════════════════════════════════════════════════════
     B · DAS BLATT — dasselbe Ziehen in der Axonometrie
     ══════════════════════════════════════════════════════════════════════ */
  if (NUR === '' || NUR === 'blatt') {
    log('\n═══ B · Axonometrie: ein Finger zieht ein Moebel ═══')
    const { ctx, page, konsole, hand } = await fenster()
    await bearbeitenAn(page, 'axo')
    await page.evaluate(() => window.__planerDatei.setzeEinrasten(false))

    const kasten = await page.evaluate(() => window.__planerDatei.axoKasten())
    const ziel = await page.evaluate(() => {
      const koerper = window.__planerDatei.axoMoebel()
      const liste = window.__planerDatei.ausstattung()
      for (const k of koerper) {
        const e = liste.find((q) => q.id === k.id)
        if (!e) continue
        const p = window.__planerDatei.axoAufBild(e.x, e.y, k.y1)
        if (p.x < 60 || p.x > 330 || p.y < 150 || p.y > 560) continue
        const t = window.__planerDatei.axoTreffer(p.x, p.y)
        if (t && t.id === k.id) return { id: k.id, typ: e.typ, x: e.x, y: e.y, bx: p.x, by: p.y, y1: k.y1 }
      }
      return null
    })
    pruefe(!!ziel, `B0 ein greifbares Stueck im Blatt${ziel ? ` (${ziel.id}, ${ziel.typ})` : ''}`)

    if (ziel) {
      const von = { x: kasten.left + ziel.bx, y: kasten.top + ziel.by }
      const wegPx = { x: 36, y: 22 }

      // --- Rueckmeldung: nur aufsetzen.
      await page.evaluate(() => window.__planerDatei.axoMerken())
      await hand.auf([von])
      await page.waitForTimeout(250)
      const greiftId = await page.evaluate(() => window.__planerDatei.axoGreift())
      const griffBild = await page.evaluate(() => window.__planerDatei.axoAenderung(18))
      await page.screenshot({ path: path.join(STANDBILDER, 'finger-5-blatt-gegriffen.png') })
      pruefe(greiftId === ziel.id, `B1 der Finger GREIFT im Blatt (${greiftId})`)
      log(`    Griff-Rueckmeldung im Blatt: ${griffBild ? griffBild.n : '?'} geaenderte Bildpunkte`)
      pruefe(
        !!griffBild && griffBild.n > 60,
        `F4 das gegriffene Stueck ist im Blatt ZU SEHEN (${griffBild ? griffBild.n : '?'} geaenderte Bildpunkte > 60)`
      )

      const vor = await page.evaluate((id) => window.__planerDatei.stueck(id), ziel.id)
      for (let i = 1; i <= 10; i++) {
        await hand.zu([{ x: von.x + (wegPx.x * i) / 10, y: von.y + (wegPx.y * i) / 10 }])
        await page.waitForTimeout(20)
      }
      const imZug = await page.evaluate((id) => window.__planerDatei.stueck(id), ziel.id)
      await page.screenshot({ path: path.join(STANDBILDER, 'finger-6-blatt-im-zug.png') })
      pruefe(
        imZug.x !== vor.x || imZug.y !== vor.y,
        `B2 das Stueck FOLGT dem Finger im Blatt (${vor.x},${vor.y} -> ${imZug.x},${imZug.y})`
      )
      await hand.ab()
      await page.waitForTimeout(500)

      const nach = await page.evaluate((id) => window.__planerDatei.stueck(id), ziel.id)
      /* Der SOLLPUNKT kommt aus derselben Umkehrung, die auch der Renderer
         benutzt (`axoRueck` -> `umkehreAuf` auf der Griffhoehe). Ihn hier neu
         zu rechnen waere eine zweite Wahrheit ueber die Projektion — genau die,
         die W7 abgeschafft hat. */
      const soll = await page.evaluate(
        (a) => window.__planerDatei.axoRueck(a.x, a.y, a.h),
        { x: ziel.bx + wegPx.x, y: ziel.by + wegPx.y, h: ziel.y1 }
      )
      const abw = soll ? Math.hypot(nach.x - soll.x, nach.y - soll.y) : null
      log(
        `    Blatt-Zug: ${vor.x},${vor.y} -> ${nach.x},${nach.y} cm · ` +
          `Soll ${soll ? soll.x.toFixed(1) + ',' + soll.y.toFixed(1) : '—'} · ` +
          `Abweichung ${abw === null ? '—' : abw.toFixed(2)} cm`
      )
      pruefe(
        abw !== null && abw <= 3,
        `B3 es liegt danach dort, wo der Finger es losliess (${abw === null ? '—' : abw.toFixed(2)} cm Abweichung <= 3)`
      )
      pruefe(nach.quelle === 'gesetzt', `B4 das gezogene Stueck traegt quelle "gesetzt" (${nach.quelle})`)
      await page.screenshot({ path: path.join(STANDBILDER, 'finger-7-blatt-abgelegt.png') })

      await page.evaluate(() => window.__planerDatei.undoJetzt())
      await page.waitForTimeout(400)
      const zurueck = await page.evaluate((id) => window.__planerDatei.stueck(id), ziel.id)
      pruefe(
        zurueck && zurueck.x === vor.x && zurueck.y === vor.y,
        `C5 EIN Rueckgaengig stellt auch den Blatt-Zug ganz zurueck (${zurueck ? zurueck.x + ',' + zurueck.y : '—'})`
      )
      await page.evaluate(() => window.__planerDatei.undoJetzt())
      await page.waitForTimeout(400)
      const zurueck2 = await page.evaluate((id) => window.__planerDatei.stueck(id), ziel.id)
      pruefe(
        zurueck2 && zurueck2.x === vor.x && zurueck2.y === vor.y,
        `C6 GEGENPROBE: ein zweites Rueckgaengig findet vom Blatt-Zug nichts mehr`
      )

      // --- B · GEGENPROBE: derselbe Wisch auf LEERER Flaeche dreht nur
      const leer = await page.evaluate(() => {
        for (let y = 140; y <= 600; y += 12) {
          for (let x = 20; x <= 370; x += 12) {
            if (!window.__planerDatei.axoTreffer(x, y)) return { x: x, y: y }
          }
        }
        return null
      })
      pruefe(!!leer, `B5 ein leerer Punkt im Blatt gefunden${leer ? ` (${leer.x},${leer.y})` : ''}`)
      if (leer) {
        const standVorher = await standVon(page)
        const blickVorher = await page.evaluate(() => window.__planerDatei.axoBlick())
        await hand.wische({ x: kasten.left + leer.x, y: kasten.top + leer.y }, wegPx)
        const standNachher = await standVon(page)
        const blickNachher = await page.evaluate(() => window.__planerDatei.axoBlick())
        const gedreht = Math.abs(blickNachher.az - blickVorher.az) + Math.abs(blickNachher.el - blickVorher.el)
        pruefe(
          standVorher === standNachher,
          'B6 GEGENPROBE: derselbe Wisch auf leerer Flaeche bewegt KEIN Moebel'
        )
        log(`    Blickaenderung: az ${blickVorher.az.toFixed(3)} -> ${blickNachher.az.toFixed(3)}, el ${blickVorher.el.toFixed(3)} -> ${blickNachher.el.toFixed(3)}`)
        pruefe(gedreht > 0.05, `B7 GEGENPROBE: er DREHT das Blatt (${gedreht.toFixed(3)} rad Summe > 0,05)`)
        await page.screenshot({ path: path.join(STANDBILDER, 'finger-8-blatt-gedreht.png') })
      }

      // --- D · zwei Finger zoomen das Blatt und ziehen nichts
      const standVorZoom = await standVon(page)
      const zoomVor = await page.evaluate(() => window.__planerDatei.axoBlick().zoom)
      await hand.auf([
        { x: von.x - 40, y: von.y },
        { x: von.x + 40, y: von.y }
      ])
      await page.waitForTimeout(100)
      for (let i = 1; i <= 6; i++) {
        await hand.zu([
          { x: von.x - 40 - i * 8, y: von.y },
          { x: von.x + 40 + i * 8, y: von.y }
        ])
        await page.waitForTimeout(30)
      }
      await hand.ab([{ x: von.x + 88, y: von.y }])
      await hand.ab()
      await page.waitForTimeout(400)
      const zoomNach = await page.evaluate(() => window.__planerDatei.axoBlick().zoom)
      const standNachZoom = await standVon(page)
      log(`    Blatt-Zoom: ${zoomVor.toFixed(3)} -> ${zoomNach.toFixed(3)}`)
      pruefe(zoomNach > zoomVor * 1.05, `D3 ZWEI Finger zoomen das Blatt (${zoomVor.toFixed(3)} -> ${zoomNach.toFixed(3)})`)
      pruefe(standVorZoom === standNachZoom, 'D4 GEGENPROBE: dabei wird KEIN Moebel bewegt')
    }

    pruefe(konsole.length === 0, `B8 keine Konsolen- oder Seitenfehler (${konsole.length}${konsole.length ? ': ' + konsole[0] : ''})`)
    await ctx.close()
  }

  /* ══════════════════════════════════════════════════════════════════════
     E · DER AUSLIEFERUNGSZUSTAND — die Bank verstellt nichts
     ══════════════════════════════════════════════════════════════════════
     Das ist die wichtigste Pruefung dieses Gates. Ein Finger-Weg, der die
     Sperre aus K3 umgeht, waere schlimmer als gar kein Finger-Weg: er
     beschaedigte genau die Zusage, auf der dieses Vorhaben beruht. */
  if (NUR === '' || NUR === 'ruhe') {
    log('\n═══ E · Auslieferungszustand: ein Wisch aendert NICHTS ═══')
    const { ctx, page, konsole, hand } = await fenster()

    pruefe(
      (await page.evaluate(() => window.__planerDatei.bearbeitet())) === false,
      'E0 die Datei oeffnet im Auslieferungszustand (Bearbeiten ist AUS)'
    )

    // --- Grundriss, ohne „Bearbeiten"
    await page.getByRole('button', { name: 'Grundriss' }).click()
    await page.waitForTimeout(500)
    const ziel = await zielImGrundriss(page, 1.2)
    pruefe(!!ziel, `E1 ein Moebel im Bild${ziel ? ` (${ziel.id})` : ''}`)
    if (ziel) {
      const standVorher = await standVon(page)
      const gesetzteVorher = await page.evaluate(() => window.__planerDatei.gesetzte())
      await hand.wische({ x: ziel.bx, y: ziel.by }, { x: 58, y: 46 })
      const standNachher = await standVon(page)
      const gesetzteNachher = await page.evaluate(() => window.__planerDatei.gesetzte())
      pruefe(standVorher === standNachher, 'E2 ein Finger-Wisch UEBER EINEM MOEBEL bewegt nichts')
      pruefe(
        gesetzteVorher === gesetzteNachher && gesetzteNachher === 0,
        `E3 und es entsteht kein „frei gesetztes" Stueck (${gesetzteVorher} -> ${gesetzteNachher})`
      )
      pruefe(
        (await page.evaluate(() => window.__planerDatei.kannZurueck())) === false,
        'E4 die Historie ist leer geblieben — es ist wirklich nichts passiert'
      )
      await page.screenshot({ path: path.join(STANDBILDER, 'finger-9-ruhe-grundriss.png') })

      // --- GEGENPROBE: mit „Bearbeiten" wirkt DERSELBE Wisch sehr wohl
      await bearbeitenAn(page, 'plan')
      await page.evaluate(() => window.__planerDatei.setzeEinrasten(false))
      const jetzt = await page.evaluate((id) => window.__planerDatei.stueck(id), ziel.id)
      await hand.wische({ x: jetzt.bx, y: jetzt.by }, { x: 58, y: 46 })
      const standMitBearbeiten = await standVon(page)
      pruefe(
        standMitBearbeiten !== standNachher,
        'E5 GEGENPROBE: MIT „Bearbeiten" bewegt derselbe Wisch das Moebel sehr wohl'
      )
    }

    // --- Blatt, ohne „Bearbeiten"
    await page.getByRole('button', { name: 'Bearbeiten' }).click() // wieder aus
    await page.getByRole('button', { name: 'Axonometrie' }).click()
    await page.waitForTimeout(700)
    pruefe(
      (await page.evaluate(() => window.__planerDatei.bearbeitet())) === false,
      'E6 Bearbeiten ist wieder aus'
    )
    const kasten = await page.evaluate(() => window.__planerDatei.axoKasten())
    const blattZiel = await page.evaluate(() => {
      const koerper = window.__planerDatei.axoMoebel()
      const liste = window.__planerDatei.ausstattung()
      for (const k of koerper) {
        const e = liste.find((q) => q.id === k.id)
        if (!e) continue
        const p = window.__planerDatei.axoAufBild(e.x, e.y, k.y1)
        if (p.x < 60 || p.x > 330 || p.y < 150 || p.y > 560) continue
        const t = window.__planerDatei.axoTreffer(p.x, p.y)
        if (t && t.id === k.id) return { id: k.id, bx: p.x, by: p.y }
      }
      return null
    })
    pruefe(!!blattZiel, `E7 ein Stueck im Blatt${blattZiel ? ` (${blattZiel.id})` : ''}`)
    if (blattZiel) {
      const standVorher = await standVon(page)
      await hand.wische({ x: kasten.left + blattZiel.bx, y: kasten.top + blattZiel.by }, { x: 36, y: 22 })
      const standNachher = await standVon(page)
      pruefe(
        (await page.evaluate(() => window.__planerDatei.axoGreift())) === null,
        'E8 im ruhenden Blatt greift der Finger NICHTS'
      )
      pruefe(standVorher === standNachher, 'E9 und es bewegt sich kein Stueck')
      await page.screenshot({ path: path.join(STANDBILDER, 'finger-10-ruhe-blatt.png') })
    }

    pruefe(konsole.length === 0, `E10 keine Konsolen- oder Seitenfehler (${konsole.length}${konsole.length ? ': ' + konsole[0] : ''})`)
    await ctx.close()
  }

  /* ══════════════════════════════════════════════════════════════════════
     G · DIE PALETTE AM HANDY
     ══════════════════════════════════════════════════════════════════════ */
  if (NUR === '' || NUR === 'palette') {
    log('\n═══ G · Die Palette am Handy ═══')
    const { ctx, page, konsole, hand } = await fenster()
    await bearbeitenAn(page, 'plan')

    /* SICHTBARKEIT ueber `checkVisibility` — die Lehre aus W6: `hidden` sagt
       nur, ob DIESES Attribut gesetzt ist, nichts ueber `display:none` aus
       einer Medienabfrage. Genau daran haingt hier alles. */
    pruefe(
      await page.evaluate(() => window.__planerDatei.paletteSichtbar()),
      'G1 die Palette ist am Handy SICHTBAR'
    )
    const eintraege = await page.evaluate(() => window.__planerDatei.paletteEintraege())
    pruefe(eintraege.length >= 5, `G2 sie traegt ihre Stuecke (${eintraege.length})`)
    /* Jeder Knopf muss unter eine Fingerkuppe passen. 44 px ist das Mass, das
       sich in beiden grossen Bedienrichtlinien wiederfindet; darunter wird ein
       Treffer zum Glueckstreffer. */
    const zuKlein = await page.evaluate(() =>
      Array.prototype.map
        .call(document.querySelectorAll('#paletteLeib .pstueck'), function (k) {
          const r = k.getBoundingClientRect()
          return { n: k.dataset.typ, w: Math.round(r.width), h: Math.round(r.height) }
        })
        .filter(function (e) {
          return e.h < 44 || e.w < 44
        })
    )
    pruefe(
      zuKlein.length === 0,
      `G3 jeder Palettenknopf ist mindestens 44 x 44 px gross${zuKlein.length ? ' — ZU KLEIN: ' + JSON.stringify(zuKlein) : ''}`
    )
    await page.screenshot({ path: path.join(STANDBILDER, 'finger-11-palette.png') })

    const zahlVor = await page.evaluate(() => window.__planerDatei.zahlen().ausstattung)
    const gesetzteVor = await page.evaluate(() => window.__planerDatei.gesetzte())
    const quelle = eintraege.find((e) => e.typ === 'tisch') || eintraege[0]

    // --- GEGENPROBE ZUERST: auf der Palette loslassen erzeugt nichts.
    await hand.auf([{ x: quelle.mitteX, y: quelle.mitteY }])
    await page.waitForTimeout(120)
    await hand.zu([{ x: quelle.mitteX + 4, y: quelle.mitteY + 18 }])
    await page.waitForTimeout(80)
    await hand.ab()
    await page.waitForTimeout(350)
    const zahlNachFehlwurf = await page.evaluate(() => window.__planerDatei.zahlen().ausstattung)
    pruefe(
      zahlNachFehlwurf === zahlVor,
      `G4 GEGENPROBE: auf der PALETTE loslassen erzeugt nichts (${zahlVor} -> ${zahlNachFehlwurf})`
    )

    // --- Und jetzt wirklich hineinziehen.
    const abwurf = { x: 300, y: 430 }
    await hand.auf([{ x: quelle.mitteX, y: quelle.mitteY }])
    await page.waitForTimeout(120)
    const geistDa = await page.evaluate(() => {
      const g = document.getElementById('geist')
      return !!g && g.checkVisibility()
    })
    pruefe(geistDa, 'G5 das Stueck haengt sichtbar am Finger, waehrend es wandert')
    for (let i = 1; i <= 10; i++) {
      await hand.zu([
        { x: quelle.mitteX + ((abwurf.x - quelle.mitteX) * i) / 10, y: quelle.mitteY + ((abwurf.y - quelle.mitteY) * i) / 10 }
      ])
      await page.waitForTimeout(22)
    }
    await page.screenshot({ path: path.join(STANDBILDER, 'finger-12-palette-im-zug.png') })
    await hand.ab()
    await page.waitForTimeout(500)

    const zahlNach = await page.evaluate(() => window.__planerDatei.zahlen().ausstattung)
    const gesetzteNach = await page.evaluate(() => window.__planerDatei.gesetzte())
    pruefe(zahlNach === zahlVor + 1, `G6 genau EIN Stueck ist entstanden (${zahlVor} -> ${zahlNach})`)
    pruefe(
      gesetzteNach === gesetzteVor + 1,
      `G7 und es zaehlt als frei gesetzt (${gesetzteVor} -> ${gesetzteNach})`
    )
    const neu = await page.evaluate(() =>
      window.__planerDatei.ausstattung().filter((e) => e.quelle === 'gesetzt').slice(-1)[0]
    )
    pruefe(!!neu && neu.typ === quelle.typ, `G8 es ist die gewaehlte Art (${neu ? neu.typ : '—'} statt ${quelle.typ})`)
    await page.screenshot({ path: path.join(STANDBILDER, 'finger-13-palette-abgelegt.png') })

    await page.evaluate(() => window.__planerDatei.undoJetzt())
    await page.waitForTimeout(350)
    const zahlZurueck = await page.evaluate(() => window.__planerDatei.zahlen().ausstattung)
    pruefe(zahlZurueck === zahlVor, `G9 EIN Rueckgaengig nimmt das Ablegen ganz zurueck (${zahlNach} -> ${zahlZurueck})`)

    pruefe(konsole.length === 0, `G10 keine Konsolen- oder Seitenfehler (${konsole.length}${konsole.length ? ': ' + konsole[0] : ''})`)
    await ctx.close()
  }

  /* ══════════════════════════════════════════════════════════════════════
     H · DIE WERKZEUGLEISTE IST AM HANDY ERREICHBAR
     ══════════════════════════════════════════════════════════════════════
     GEMESSEN und nicht vermutet: bis zur Handy-Welle lag „Löschen" bei 390 px
     vollstaendig ausserhalb der Anzeige (`.leiste` bricht um, ihre GRUPPEN
     nicht). Damit war das Loeschen-Werkzeug am Telefon unerreichbar — und mit
     ihm der einzige Weg, dort etwas zu entfernen. Ein Knopf, den man nicht
     treffen kann, ist kein Knopf. */
  if (NUR === '' || NUR === 'leiste') {
    log('\n═══ H · Die Werkzeugleiste am Handy ═══')
    const { ctx, page, konsole, hand } = await fenster()
    await bearbeitenAn(page, 'plan')

    const draussen = await page.evaluate((b) => {
      const raus = []
      document.querySelectorAll('#werkzeuge button').forEach(function (k) {
        if (!k.checkVisibility()) return
        const r = k.getBoundingClientRect()
        if (r.left < 0 || r.right > b || r.height < 38) {
          raus.push({ n: k.textContent.trim(), l: Math.round(r.left), r: Math.round(r.right), h: Math.round(r.height) })
        }
      })
      return raus
    }, BREITE)
    pruefe(
      draussen.length === 0,
      `H1 jeder Werkzeugknopf liegt ganz im Bild und ist mindestens 38 px hoch${draussen.length ? ' — DRAUSSEN: ' + JSON.stringify(draussen) : ''}`
    )
    await page.screenshot({ path: path.join(STANDBILDER, 'finger-14-leiste.png') })

    /* Und der Beweis, dass das nicht nur Geometrie ist: mit dem FINGER auf
       „Löschen" tippen, ein Stueck per Langdruck vorschlagen (E3) und die
       Rueckfrage bestaetigen. */
    const knopf = await page.evaluate(() => {
      const k = document.getElementById('wzDelete')
      const r = k.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    })
    await hand.auf([knopf])
    await page.waitForTimeout(80)
    await hand.ab()
    await page.waitForTimeout(350)
    /* 2 = DELETE (`floorplannerModes` in `floorplanner_view.ts`). */
    const werkzeugNach = await page.evaluate(() => window.__planerDatei.werkzeug())
    pruefe(werkzeugNach === 2, `H2 der Finger erreicht „Löschen" und waehlt es (Werkzeug ${werkzeugNach})`)

    const ziel = await zielImGrundriss(page, 1.2)
    pruefe(!!ziel, `H3 ein Moebel zum Loeschen${ziel ? ` (${ziel.id})` : ''}`)
    if (ziel) {
      const zahlVor = await page.evaluate(() => window.__planerDatei.zahlen().ausstattung)

      // --- GEGENPROBE ZUERST: kurzes Tippen loest KEINE Rueckfrage aus.
      await hand.auf([{ x: ziel.bx, y: ziel.by }])
      await page.waitForTimeout(150)
      await hand.ab()
      await page.waitForTimeout(250)
      const nachKurz = await page.evaluate(() => window.__planerDatei.loeschKandidat())
      pruefe(!nachKurz, `H4 GEGENPROBE: kurzes Tippen schlaegt NICHTS zum Loeschen vor (${JSON.stringify(nachKurz)})`)
      if (nachKurz) await page.evaluate(() => window.__planerDatei.loeschungAbbrechen())

      // --- Langdruck: die Rueckfrage kommt.
      await hand.auf([{ x: ziel.bx, y: ziel.by }])
      await page.waitForTimeout(800)
      const kandidat = await page.evaluate(() => window.__planerDatei.loeschKandidat())
      await page.screenshot({ path: path.join(STANDBILDER, 'finger-15-loeschfrage.png') })
      await hand.ab()
      await page.waitForTimeout(250)
      pruefe(
        !!kandidat && kandidat.art === 'ausstattung',
        `H5 LANGDRUCK schlaegt das Stueck zum Loeschen vor (${kandidat ? kandidat.beschreibung : '—'})`
      )
      if (kandidat) {
        await page.evaluate(() => window.__planerDatei.loeschungBestaetigen())
        await page.waitForTimeout(350)
        const zahlNach = await page.evaluate(() => window.__planerDatei.zahlen().ausstattung)
        pruefe(zahlNach === zahlVor - 1, `H6 das Bestaetigen entfernt es wirklich (${zahlVor} -> ${zahlNach})`)
      }
    }

    pruefe(konsole.length === 0, `H7 keine Konsolen- oder Seitenfehler (${konsole.length}${konsole.length ? ': ' + konsole[0] : ''})`)
    await ctx.close()
  }
} finally {
  await browser.close()
}

ende()
