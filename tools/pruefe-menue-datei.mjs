// W13, Abschnitte G-I: DAS MENUE IN DER ECHTEN DOPPELKLICK-DATEI.
//
// Wird von `pruefe-menue.mjs` gerufen (dort stehen A-F, die reine Rechnung).
// Getrennte Datei, damit der schnelle Teil schnell bleibt: A-F brauchen keinen
// Browser und laufen in unter einer Sekunde.
//
// WARUM DAS HIER NOETIG IST, obwohl A-F gruen sind
// Weil eine gruene Rechnung nichts darueber sagt, ob der Nutzer sie ERREICHT —
// und genau das war der Befund von W13. `zusammenlegenPlanen` war seit W12
// vollstaendig und gemessen, und trotzdem konnte niemand zwei Raeume
// zusammenlegen: es fuehrte kein Weg dorthin. Hier wird deshalb der WEG
// gemessen, mit echten Zeiger- und Beruehrungs-Ereignissen, und das Ergebnis
// am MODELL abgelesen (`raeumeAnzahl`), nicht an einer Meldung.
//
// DREI REGELN, uebernommen aus `pruefe-schutz.mjs` und `pruefe-finger.mjs`:
// 1. Echte Ereignisse (`page.mouse`, CDP `Input.dispatchTouchEvent`) — nur die
//    gehen durch die Treffer-Ermittlung des Browsers. `dispatchEvent` auf dem
//    Canvas saehe eine Flaeche mit `pointer-events:none` als scharf an.
//    Knoepfe der Huelle werden per `dispatchEvent` geklickt: die Zeichenschleife
//    laesst die Seite nie zur Ruhe kommen, ein wartender `page.click` liefe in
//    den Timeout, obwohl er wirkt.
// 2. Jede Pruefung hat eine Gegenprobe.
// 3. Bildkoordinaten werden UNMITTELBAR vor dem Griff neu gelesen — ein Zug
//    verschiebt die Ansicht, und alte Punkte zeigen danach woandershin.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { werkstattAufschliessen } from './werkstatt-auf.mjs'

const PW_STANDARD = 'file:///C:/Users/dania/.gemini/node_modules/playwright/index.js'
const HIER = path.dirname(fileURLToPath(import.meta.url))
const WURZEL = path.resolve(HIER, '..')
const DATEI = path.join(WURZEL, 'Halle400-Modell.html')

/** Bearbeiten an UND in den Grundriss — zwei Griffe, wie eine Hand (W7). */
async function bearbeitenAn(page) {
  await werkstattAufschliessen(page)
  await page.evaluate(() => {
    if (!window.__planerDatei.bearbeitet()) {
      document.getElementById('btnBearbeiten').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    }
    if (window.__planerDatei.ansicht() !== 'plan') {
      document.getElementById('btnAnsichtPlan').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    }
  })
  await page.waitForTimeout(400)
}

/** Ein Antippen mit der MAUS an einer Bildkoordinate des Canvas. */
async function tippen(page, bildX, bildY) {
  const kasten = await page.evaluate(() => {
    const r = document.getElementById('grundriss-canvas').getBoundingClientRect()
    return { left: r.left, top: r.top }
  })
  await page.mouse.move(kasten.left + bildX, kasten.top + bildY)
  await page.mouse.down()
  await page.mouse.up()
  await page.waitForTimeout(220)
}

/**
 * Ein echter LANGDRUCK (Handy-Weg) — CDP, nicht `dispatchEvent` (W8).
 *
 * Am Telefon oeffnet ein kurzer Tipp KEIN Menue, und das ist gemessen begruendet
 * (W13, `pruefe-finger.mjs` D1): unter jedem Punkt liegt mindestens ein Raum,
 * das Menue erschiene also bei jeder Beruehrung und laege danach unter dem
 * Daumen — die naechste Zwei-Finger-Geste waere verloren, weil das besitzende
 * Element beim Aufsetzen feststeht. Der Langdruck ist die absichtliche Geste.
 */
async function fingerLangdruck(page, cdp, bildX, bildY) {
  const kasten = await page.evaluate(() => {
    const r = document.getElementById('grundriss-canvas').getBoundingClientRect()
    return { left: r.left, top: r.top }
  })
  const x = kasten.left + bildX
  const y = kasten.top + bildY
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y, radiusX: 12, radiusY: 12, force: 1 }]
  })
  // LANGDRUCK_MS ist 500 — mit Puffer warten, ohne den Finger zu bewegen.
  await page.waitForTimeout(750)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(260)
}

/**
 * Sucht einen Raum, der WIRKLICH einen Nachbarn hat — im echten Halle-400-Plan.
 *
 * Nicht der erste beste: gemessen wird ueber das Menue selbst (gibt es einen
 * `raeume-verbinden`-Eintrag?). Einen Nachbarn im Gate nachzurechnen waere eine
 * zweite Wahrheit ueber die Nachbarschaft — und die erste, die driftet.
 */
async function raumMitNachbarFinden(page) {
  const punkte = await page.evaluate(() => window.__planerDatei.raumPunkte())
  for (const p of punkte) {
    await tippen(page, p.bildX, p.bildY)
    const eintraege = await page.evaluate(() => window.__planerDatei.menueEintraege())
    if (eintraege.some((e) => e.handlung === 'raeume-verbinden')) return p
    await page.keyboard.press('Escape')
    await page.waitForTimeout(90)
  }
  return null
}

export async function fahre({ log, pruefe }) {
  if (!fs.existsSync(DATEI)) {
    pruefe(false, `G0 die Doppelklick-Datei fehlt (${DATEI}) — erst "node tools/baue-planer-datei.mjs"`)
    return
  }
  const { chromium } = (await import(process.env.PLAYWRIGHT_PFAD || PW_STANDARD)).default
  const browser = await chromium.launch()
  const URL = pathToFileURL(DATEI).href

  /** Frisches Fenster mit GESPERRTEM Netz — die Datei muss ohne auskommen. */
  async function fenster(opt = {}) {
    const ctx = await browser.newContext({
      viewport: opt.viewport || { width: 1440, height: 900 },
      hasTouch: !!opt.touch,
      isMobile: !!opt.touch
    })
    await ctx.route('**/*', (route) => {
      const u = route.request().url()
      if (u.startsWith('file://') || u.startsWith('data:') || u.startsWith('blob:')) return route.continue()
      return route.abort()
    })
    const page = await ctx.newPage()
    const fehlerAufDerSeite = []
    page.on('pageerror', (e) => fehlerAufDerSeite.push(String(e).slice(0, 200)))
    await page.goto(URL, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => window.__bereit === true, { timeout: 30000 })
    return { ctx, page, fehlerAufDerSeite }
  }

  /* ══════════ G) AM RECHNER — der Weg vom Griff bis zum verbundenen Raum ═══ */

  log('\n── G) Die echte Datei am Rechner ───────────────────────────────')
  {
    const { ctx, page, fehlerAufDerSeite } = await fenster()
    await bearbeitenAn(page)

    // G1 Das Werkzeug ist der STANDARD (Möbel verschieben) — es wird für den
    // ganzen Abschnitt keines gewählt. Das ist der Kern der Prüfung: ohne
    // Werkzeugkunde.
    const werkzeugAmStart = await page.evaluate(() =>
      document.getElementById('wzMove').getAttribute('aria-pressed')
    )
    pruefe(werkzeugAmStart === 'true', 'G1 es ist das Standard-Werkzeug gewählt, keines gesucht')

    // G2 Ein Griff auf einen Raum öffnet das Menü.
    const raum = await raumMitNachbarFinden(page)
    pruefe(raum !== null, 'G2 ein Raum mit Nachbarn ist per Antippen erreichbar')

    if (raum) {
      const offen = await page.evaluate(() => window.__planerDatei.menueOffen())
      pruefe(offen, 'G3 das Menü steht offen')

      // G4 Es steht AM Objekt und nicht unten mittig — gemessen am Abstand
      // zwischen Griffpunkt und Menü-Kasten.
      const kasten = await page.evaluate(() => window.__planerDatei.menueKasten())
      const canvas = await page.evaluate(() => {
        const r = document.getElementById('grundriss-canvas').getBoundingClientRect()
        return { left: r.left, top: r.top }
      })
      const dx = Math.abs(kasten.left - (canvas.left + raum.bildX))
      const dy = Math.abs(kasten.top - (canvas.top + raum.bildY))
      pruefe(dx < 400 && dy < 400, `G4 das Menü steht am Griffpunkt (${Math.round(dx)}/${Math.round(dy)} px)`)

      // G5 Es bleibt VOLLSTÄNDIG im Bild — ein Menü, dessen untere Hälfte unter
      // dem Fensterrand liegt, ist der halbe Weg.
      pruefe(
        kasten.left >= 0 &&
          kasten.top >= 0 &&
          kasten.left + kasten.width <= 1440 + 1 &&
          kasten.top + kasten.height <= 900 + 1,
        'G5 das Menü liegt vollständig im Bild'
      )

      // G6 DER GANZE WEG: Verbinden → Nutzung → Bestätigen. Gemessen wird die
      // RAUMZAHL am Modell, vorher und nachher — nicht die Meldung darüber.
      const vorher = await page.evaluate(() => window.__planerDatei.raeumeAnzahl())
      const s1 = await page.evaluate(() => window.__planerDatei.menueWaehlen('raeume-verbinden'))
      await page.waitForTimeout(200)
      pruefe(s1, 'G6a Schritt 1: Verbinden gewählt')

      const nutzungen = await page.evaluate(() => window.__planerDatei.menueEintraege())
      pruefe(nutzungen.length > 0 && nutzungen.every((e) => e.handlung === 'nutzung'),
        `G6b Schritt 2: die Nutzungswahl steht da (${nutzungen.length} Arten)`)

      const s2 = await page.evaluate(() => window.__planerDatei.menueWaehlen('nutzung'))
      await page.waitForTimeout(300)
      pruefe(s2, 'G6c Schritt 2 gewählt')

      // G7 Die Zahlen stehen VOR der Zustimmung da.
      const titel = await page.evaluate(() => window.__planerDatei.menueTitel())
      const bestaetigung = await page.evaluate(() => window.__planerDatei.menueEintraege())
      const hinweisText = await page.evaluate(() => {
        const h = document.getElementById('objektMenueHinweis')
        return h.hidden ? '' : h.textContent
      })
      pruefe(/Wirklich verbinden/.test(titel ?? ''), 'G7a Schritt 3: die Rückfrage steht da')
      pruefe(/m²/.test(hinweisText), `G7b sie nennt die Fläche vorher — "${hinweisText.slice(0, 80)}"`)
      pruefe(
        bestaetigung.length === 2 && bestaetigung[0].handlung === 'ab',
        'G7c Abbrechen steht zuerst, die folgenreiche Wahl nicht zuerst'
      )

      const s3 = await page.evaluate(() => window.__planerDatei.menueWaehlen('los'))
      await page.waitForTimeout(600)
      pruefe(s3, 'G7d Schritt 3 bestätigt')

      // G8 DER BEWEIS: der Kern zählt danach EINEN Raum weniger.
      const nachher = await page.evaluate(() => window.__planerDatei.raeumeAnzahl())
      pruefe(
        nachher === vorher - 1,
        `G8 der Plan zählt danach einen Raum weniger (${vorher} → ${nachher})`
      )

      // G9 Das Menü ist danach zu — es gehört zu einem Raum, den es nicht mehr gibt.
      const nochOffen = await page.evaluate(() => window.__planerDatei.menueOffen())
      pruefe(!nochOffen, 'G9 danach ist das Menü zu')

      // G10 EIN Rückgängig macht die ganze Handlung zurück, nicht drei.
      await page.evaluate(() => document.getElementById('btnUndo').dispatchEvent(new MouseEvent('click', { bubbles: true })))
      await page.waitForTimeout(500)
      const zurueck = await page.evaluate(() => window.__planerDatei.raeumeAnzahl())
      pruefe(zurueck === vorher, `G10 ein Rückgängig stellt beide Räume wieder her (${nachher} → ${zurueck})`)
    }

    pruefe(fehlerAufDerSeite.length === 0, `G11 keine Fehler auf der Seite${fehlerAufDerSeite.length ? ' — ' + fehlerAufDerSeite[0] : ''}`)
    await ctx.close()
  }

  /* ══════════ H) AM HANDY — 390 x 800, echte Beruehrungen ═════════════════ */

  log('\n── H) Die echte Datei am Handy (390 × 800) ─────────────────────')
  {
    const { ctx, page, fehlerAufDerSeite } = await fenster({
      viewport: { width: 390, height: 800 },
      touch: true
    })
    const cdp = await ctx.newCDPSession(page)
    await bearbeitenAn(page)

    const punkte = await page.evaluate(() => window.__planerDatei.raumPunkte())
    // Einen Raum wählen, der im Bild liegt — bei 390 px ist das nicht jeder.
    const sichtbar = punkte.filter((p) => p.bildX > 20 && p.bildX < 370 && p.bildY > 20 && p.bildY < 600)
    pruefe(sichtbar.length > 0, `H1 es liegen Räume im Handy-Bild (${sichtbar.length})`)

    let getroffen = null
    for (const p of sichtbar.slice(0, 12)) {
      await fingerLangdruck(page, cdp, p.bildX, p.bildY)
      const offen = await page.evaluate(() => window.__planerDatei.menueOffen())
      if (offen) { getroffen = p; break }
    }
    pruefe(getroffen !== null, 'H2 ein Langdruck öffnet das Menü')

    if (getroffen) {
      // H3 Das Menü passt ins Handy-Bild. Das ist die Prüfung, an der W8 zwei
      // Funde gemacht hat („Löschen lag bei 390 px ausserhalb der Anzeige").
      const kasten = await page.evaluate(() => window.__planerDatei.menueKasten())
      pruefe(
        kasten.left >= 0 && kasten.left + kasten.width <= 390 + 1,
        `H3 das Menü passt in die Breite (${Math.round(kasten.left)} + ${Math.round(kasten.width)} von 390)`
      )
      pruefe(
        kasten.top >= 0 && kasten.top + kasten.height <= 800 + 1,
        `H4 und in die Höhe (${Math.round(kasten.top)} + ${Math.round(kasten.height)} von 800)`
      )

      // H5 Jeder Eintrag ist mit dem Daumen zu treffen — 44 px ist die Grenze,
      // unter der eine Fingerkuppe danebengreift.
      const hoehen = await page.evaluate(() =>
        Array.prototype.map.call(
          document.getElementById('objektMenueListe').children,
          (k) => k.getBoundingClientRect().height
        )
      )
      pruefe(
        hoehen.length > 0 && hoehen.every((h) => h >= 43.5),
        `H5 jede Zeile ist mindestens 44 px hoch (kleinste ${Math.round(Math.min(...hoehen))})`
      )

      // H6 Die Werkzeugleiste verdeckt es nicht — sie liegt tiefer im Stapel.
      const verdeckt = await page.evaluate(() => {
        const m = document.getElementById('objektMenue').getBoundingClientRect()
        const punkt = document.elementFromPoint(m.left + m.width / 2, m.top + 8)
        return !document.getElementById('objektMenue').contains(punkt)
      })
      pruefe(!verdeckt, 'H6 die Werkzeugleiste verdeckt das Menü nicht')
    }

    pruefe(fehlerAufDerSeite.length === 0, `H7 keine Fehler auf der Seite${fehlerAufDerSeite.length ? ' — ' + fehlerAufDerSeite[0] : ''}`)
    await ctx.close()
  }

  /* ══════════ I) KEINE REGRESSION ═════════════════════════════════════════ */

  log('\n── I) Keine Regression ─────────────────────────────────────────')
  {
    const { ctx, page } = await fenster()
    await bearbeitenAn(page)

    // I1 Die Werkzeugleiste ist unverändert bedienbar. Sie ist nicht der Fehler
    // gewesen — sie war nur der einzige Weg.
    await page.evaluate(() => document.getElementById('wzWand').dispatchEvent(new MouseEvent('click', { bubbles: true })))
    await page.waitForTimeout(150)
    const gedrueckt = await page.evaluate(() => document.getElementById('wzWand').getAttribute('aria-pressed'))
    pruefe(gedrueckt === 'true', 'I1 die Werkzeugleiste schaltet weiterhin')

    // I2 Ein Werkzeugwechsel nimmt ein offenes Menü zurück.
    const punkte = await page.evaluate(() => window.__planerDatei.raumPunkte())
    await tippen(page, punkte[0].bildX, punkte[0].bildY)
    const warOffen = await page.evaluate(() => window.__planerDatei.menueOffen())
    await page.evaluate(() => document.getElementById('wzDraw').dispatchEvent(new MouseEvent('click', { bubbles: true })))
    await page.waitForTimeout(150)
    const nachWechsel = await page.evaluate(() => window.__planerDatei.menueOffen())
    pruefe(warOffen && !nachWechsel, 'I2 ein Werkzeugwechsel schliesst das Menü')

    // I3 GEGENPROBE zum ganzen Abschnitt: im ZEICHNEN-Werkzeug öffnet ein Klick
    // KEIN Menü — dort setzt er einen Punkt, und diese Bedeutung darf ihm
    // niemand nehmen.
    await tippen(page, punkte[0].bildX + 30, punkte[0].bildY + 30)
    const imZeichnen = await page.evaluate(() => window.__planerDatei.menueOffen())
    pruefe(!imZeichnen, 'I3 im Zeichnen-Werkzeug öffnet ein Klick KEIN Menü')

    // I4 Escape schliesst das Menü.
    await page.evaluate(() => document.getElementById('wzMove').dispatchEvent(new MouseEvent('click', { bubbles: true })))
    await page.waitForTimeout(150)
    await tippen(page, punkte[0].bildX, punkte[0].bildY)
    const offenVorEsc = await page.evaluate(() => window.__planerDatei.menueOffen())
    await page.keyboard.press('Escape')
    await page.waitForTimeout(150)
    const offenNachEsc = await page.evaluate(() => window.__planerDatei.menueOffen())
    pruefe(offenVorEsc && !offenNachEsc, 'I4 Escape schliesst das Menü')

    // I5 Ein ZUG öffnet KEIN Menü — sonst bekäme der Nutzer nach jedem
    // Verschieben ein Fenster, das er nicht gerufen hat.
    const kasten = await page.evaluate(() => {
      const r = document.getElementById('grundriss-canvas').getBoundingClientRect()
      return { left: r.left, top: r.top }
    })
    await page.mouse.move(kasten.left + punkte[0].bildX, kasten.top + punkte[0].bildY)
    await page.mouse.down()
    await page.mouse.move(kasten.left + punkte[0].bildX + 90, kasten.top + punkte[0].bildY + 60, { steps: 8 })
    await page.mouse.up()
    await page.waitForTimeout(250)
    const nachZug = await page.evaluate(() => window.__planerDatei.menueOffen())
    pruefe(!nachZug, 'I5 ein Zug öffnet KEIN Menü')

    await ctx.close()
  }

  await browser.close()
}
