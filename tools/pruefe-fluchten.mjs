// Prueft den FLUCHT-FANG und die AUFRAEUM-HILFE (W15).
//
//   node tools/baue-planer-datei.mjs --plan hotel400 --ziel Hotel400-Modell.html ...
//   node tools/pruefe-fluchten.mjs --datei Hotel400-Modell.html --plan hotel400
// Exit 0 = alle Pruefungen bestanden, 1 = mindestens eine durchgefallen.
//
// NUTZERWUNSCH, WOERTLICH
// „es soll noch einfacher und smarter gearbeitet werden koennen, damit zum
//  beispiel die waende nicht unterschiedlich lang sind, obwohl sie
//  nebeneinander liegen und es nicht der fall sein darf."
//
// WAS HIER GEMESSEN WIRD — und warum in ZENTIMETERN
// Ein Fang ist nur dann bewiesen, wenn drei Zahlen nebeneinander stehen: wo die
// Wand OHNE ihn landet, wo sie MIT ihm landet, und wo sie hingehoert. Eine
// Pruefung, die nur „hat sich etwas veraendert" sagt, kann einen Fang nicht von
// einem Zufall unterscheiden. Jede Fang-Art bekommt darum ihre eigene Messung
// mit Sollwert.
//
//   A  Fang beim ZEICHNEN, ohne Browser     · Gegenprobe: ausgeschaltet MUSS
//      (Ecke / Flucht / Ende / Winkel)        derselbe Punkt roh liegen bleiben
//   B  Die Fangweite in BILDPUNKTEN          · Gegenprobe: in Zentimetern
//                                              gerechnet waere sie beim
//                                              Hineinzoomen 46-mal zu gross
//   C  Aufraeum-Hilfe, reine Rechnung        · Gegenprobe: keine Gruppe darf
//                                              breiter sein als die Toleranz
//   D  Aufraeum-Hilfe an der echten Datei    · Gegenprobe: OHNE Bestaetigung
//                                              bewegt sich NICHTS
//
// A, B und C laufen OHNE Browser: die ganze Rechnung steht in
// `src/raum/fluchten.js` und braucht kein Canvas. D braucht die Datei — dort
// wird die Zusage geprueft, die keine reine Rechnung je beweisen kann: dass das
// Begradigen ohne Knopfdruck unerreichbar ist.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { WURZEL } from './buendel-kern.mjs'
import { werkstattAufschliessen } from './werkstatt-auf.mjs'

const PW_STANDARD = 'file:///C:/Users/dania/.gemini/node_modules/playwright/index.js'
const arg = (name, standard) => {
  const i = process.argv.indexOf(name)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : standard
}
const DATEI = path.resolve(WURZEL, arg('--datei', 'Hotel400-Modell.html'))
const PLAN = arg('--plan', 'hotel400')
const NUR = arg('--nur', '') // "rechnung" | "datei"

const fehler = []
const log = (s) => console.log(s)
const pruefe = (bedingung, text) => {
  log(`${bedingung ? 'OK  ' : 'FEHL'} ${text}`)
  if (!bedingung) fehler.push(text)
}

const F = await import(pathToFileURL(path.join(WURZEL, 'src/raum/fluchten.js')).href)

/** Die Waende des Plans in der Form, die `fluchten.js` liest. */
function planWaende(planName) {
  const roh = JSON.parse(
    fs.readFileSync(path.join(WURZEL, 'app/public/plaene', `${planName}.json`), 'utf8')
  )
  const fp = roh.floorplan || roh
  const C = fp.corners
  return fp.walls
    .filter((w) => C[w.corner1] && C[w.corner2])
    .map((w, i) => ({
      id: w.id || 'w' + i,
      aId: w.corner1,
      bId: w.corner2,
      a: { x: C[w.corner1].x, y: C[w.corner1].y },
      b: { x: C[w.corner2].x, y: C[w.corner2].y }
    }))
}

/* ══════════════════════════════════════════════════════════════════════
   A · DER FANG BEIM ZEICHNEN — je Fang-Art eine Messung in Zentimetern
   ══════════════════════════════════════════════════════════════════════
   Gebaut wird ein kleiner, vollstaendig durchschaubarer Plan: ein Rechteck von
   10 x 4 m und daneben eine zweite senkrechte Wand. Alles darin ist von Hand
   nachrechenbar — anders als am Hotelplan, wo eine Messung zwar echt, aber
   nicht mehr pruefbar waere. Der Hotelplan kommt in C und D dran. */
if (NUR !== 'datei') {
  log('\n═══ A · Fang beim Zeichnen (ohne Browser) ═══')

  //  (0,0) ─────────── (1000,0)
  //    │                  │
  //  (0,400) ───────── (1000,400)
  //                                 und eine zweite Senkrechte bei x = 600:
  //                                 (600,600) ── (600,1000)
  const waende = [
    { id: 'n', aId: 'a', bId: 'b', a: { x: 0, y: 0 }, b: { x: 1000, y: 0 } },
    { id: 'o', aId: 'b', bId: 'c', a: { x: 1000, y: 0 }, b: { x: 1000, y: 400 } },
    { id: 's', aId: 'c', bId: 'd', a: { x: 1000, y: 400 }, b: { x: 0, y: 400 } },
    { id: 'w', aId: 'd', bId: 'a', a: { x: 0, y: 400 }, b: { x: 0, y: 0 } },
    { id: 'z', aId: 'e', bId: 'f', a: { x: 600, y: 600 }, b: { x: 600, y: 1000 } }
  ]
  const kand = F.sammleFangKandidaten(waende)

  /* --- A1 FLUCHT einer bestehenden Wand (dieselbe Achse).
     Der Nutzer zieht eine neue senkrechte Wand und zielt bei x = 993 — sieben
     Zentimeter neben der Ostwand. GEMEINT ist offensichtlich x = 1000. */
  {
    const roh = { x: 993, y: 800 }
    const mit = F.fangePunkt(kand, roh.x, roh.y, 60, true, true)
    const ohne = { x: roh.x, y: roh.y }
    pruefe(
      mit.x === 1000 && mit.fangX && mit.fangX.art === 'flucht',
      `A1 FLUCHT: ohne Fang x = ${ohne.x} cm · mit Fang x = ${mit.x} cm · Soll 1000 cm ` +
        `(Art "${mit.fangX ? mit.fangX.art : 'keine'}", ${Math.abs(mit.x - roh.x)} cm gezogen)`
    )
  }

  /* --- A2 ENDE einer Nachbarwand („so lang wie die daneben").
     DAS ist der gemeldete Fehler. Die Wand bei x = 600 endet bei y = 1000. Wer
     daneben eine zweite zieht und bei y = 1012 loslaesst, bekaeme zwei
     nebeneinanderliegende Waende von 400 und 412 cm Laenge — genau das, was
     „nicht der Fall sein darf". */
  {
    const roh = { x: 800, y: 1012 }
    const mit = F.fangePunkt(kand, roh.x, roh.y, 60, false, true)
    pruefe(
      mit.y === 1000,
      `A2 ENDE: ohne Fang y = ${roh.y} cm · mit Fang y = ${mit.y} cm · Soll 1000 cm ` +
        `(die neue Wand wird damit GENAU so lang wie die Nachbarwand: 400 cm)`
    )
  }

  /* --- A3 die GEBUNDENE Koordinate wird nicht angefasst.
     Hat der Winkel-Fang die Strecke schon auf die Waagerechte gelegt, ist y
     gebunden. Ein Fang dort naehme der ersten Hilfe ihr Ergebnis wieder weg —
     der Nutzer bekaeme fuer zwei eingeschaltete Hilfen ein Ergebnis, das keine
     von beiden wollte. */
  {
    const gebunden = F.fangePunkt(kand, 993, 407, 60, true, false)
    const frei = F.fangePunkt(kand, 993, 407, 60, true, true)
    pruefe(
      gebunden.x === 1000 && gebunden.y === 407 && frei.y === 400,
      `A3 GEBUNDEN: x rastet (${gebunden.x}), y bleibt roh (${gebunden.y} statt ${frei.y}) — ` +
        `der Winkel-Fang behaelt das letzte Wort ueber die Richtung`
    )
  }

  /* --- A4 GEGENPROBE: ausserhalb der Fangweite bleibt alles roh.
     Ein Fang, der IMMER zieht, ist kein Fang, sondern ein Raster. Bei 60 cm
     Weite und 80 cm Abstand darf nichts passieren. */
  {
    const weg = F.fangePunkt(kand, 920, 800, 60, true, true)
    pruefe(
      weg.x === 920 && weg.fangX === null,
      `A4 GEGENPROBE: 80 cm neben der Achse (Fangweite 60) bleibt x roh bei ${weg.x} cm`
    )
  }

  /* --- A5 GEGENPROBE: „nebeneinander" ist eine Bedingung.
     Die Nordwand liegt auf y = 0 und reicht von x = 0 bis 1000. Wer 20 Meter
     weiter rechts bei y = 3 zeichnet, meint NICHT ihre Flucht — dort ist sie
     gar nicht. Ohne diese Bedingung zoege eine Achse quer durch das ganze
     Gebaeude jeden Punkt an, der zufaellig auf ihrer Hoehe liegt. */
  {
    const fern = F.fangePunkt(kand, 3000, 3, 60, false, true)
    const nah = F.fangePunkt(kand, 500, 3, 60, false, true)
    pruefe(
      fern.y === 3 && nah.y === 0,
      `A5 GEGENPROBE NACHBARSCHAFT: 20 m neben der Wand bleibt y roh (${fern.y} cm), ` +
        `neben ihr rastet es (${nah.y} cm)`
    )
  }

  /* --- A6 der VERSATZ beim Wand-Ziehen („buendig").
     Beim Verschieben zaehlt nicht der Endpunkt, sondern der Abstand von der
     eigenen Achse. Die Suedwand (y = 400) wird um 190 cm nach unten gezogen;
     600 cm weiter unten liegt der Anfang der zweiten Senkrechten — nein, dort
     liegt keine parallele Wand. Gepruefte Lage ist die NORDWAND bei y = 0:
     ein Zug um -395 cm bringt die Suedwand auf y = 5, und der Fang legt sie
     buendig auf y = 0. */
  {
    const sued = waende.find((w) => w.id === 's')
    // Normale der Suedwand zeigt in -y (sie laeuft von x=1000 nach x=0).
    const roh = F.fangeVersatz(sued, waende, 395, 60)
    const weit = F.fangeVersatz(sued, waende, 395, 1)
    pruefe(
      roh.gefangen && Math.abs(roh.achse) < 1e-9 && weit.gefangen === false,
      `A6 VERSATZ: Zug um 395 cm ohne Fang -> Achse 5 cm · mit Fang -> Achse ` +
        `${Math.round(roh.achse)} cm · Soll 0 cm (die Nordwand-Flucht). ` +
        `Mit Fangweite 1 cm greift er NICHT (${weit.gefangen})`
    )
  }
}

/* ══════════════════════════════════════════════════════════════════════
   B · DIE FANGWEITE RECHNET IN BILDPUNKTEN, NICHT IN ZENTIMETERN
   ══════════════════════════════════════════════════════════════════════
   Der Nutzer hat danach ausdruecklich gefragt. Die Antwort ist eine Rechnung:
   die Grundansicht quetscht 78 m auf rund 900 Bildpunkte — 8,7 cm je Pixel.
   Eine Weltgroesse von 25 cm (`snapTolerance` im Kern) waere dort 2,9
   Bildpunkte: der Nutzer muesste auf drei Pixel genau zielen. Beim
   Hineinzoomen auf 1:20 (0,19 cm/px) waeren dieselben 25 cm 132 Bildpunkte und
   rissen den Punkt quer durch den Raum. EINE Weltgroesse ist fuer beide
   Zoomstufen die falsche. */
if (NUR !== 'datei') {
  log('\n═══ B · Fangweite in Bildpunkten (die Rechnung) ═══')
  const FLUCHT_FANG_PX = 12
  const uebersicht = 8.7 // cm je Bildpunkt, ganzer Grundriss im Bild
  const detail = 0.19 // cm je Bildpunkt, herangezoomt
  const inPx = (cm, proPx) => cm / proPx
  pruefe(
    inPx(25, uebersicht) < 3,
    `B1 25 cm Weltmass sind in der Uebersicht nur ${inPx(25, uebersicht).toFixed(1)} Bildpunkte — ` +
      `darauf kann eine Hand nicht zielen`
  )
  pruefe(
    inPx(25, detail) > 100,
    `B2 dieselben 25 cm sind herangezoomt ${inPx(25, detail).toFixed(0)} Bildpunkte — ` +
      `der Fang risse den Punkt quer durch den Raum (${(inPx(25, detail) / inPx(25, uebersicht)).toFixed(0)}-mal zu weit)`
  )
  pruefe(
    Math.abs(FLUCHT_FANG_PX * uebersicht - 104) < 2 && Math.abs(FLUCHT_FANG_PX * detail - 2.3) < 0.5,
    `B3 12 Bildpunkte sind in der Uebersicht ${(FLUCHT_FANG_PX * uebersicht).toFixed(0)} cm und ` +
      `herangezoomt ${(FLUCHT_FANG_PX * detail).toFixed(1)} cm — die Zone bleibt auf dem SCHIRM gleich gross`
  )
}

/* ══════════════════════════════════════════════════════════════════════
   C · DIE AUFRAEUM-HILFE, reine Rechnung am ECHTEN Plan
   ══════════════════════════════════════════════════════════════════════ */
let fundC = []
if (NUR !== 'datei') {
  log('\n═══ C · Aufraeum-Hilfe am Plan ' + PLAN + ' (ohne Browser) ═══')
  const waende = planWaende(PLAN)
  fundC = F.findeFluchtFehler(waende)
  const ecken = fundC.reduce((s, f) => s + f.ecken.length, 0)
  const weiteste = fundC.reduce((m, f) => Math.max(m, f.versatz), 0)
  log(`     ${waende.length} Waende · ${fundC.length} Fundstellen · ${ecken} betroffene Eckpunkte`)
  pruefe(fundC.length > 0, `C1 der Plan hat Fluchtfehler, und sie werden gefunden (${fundC.length} Stellen)`)

  /* --- C2 DIE ZUSICHERUNG, mit der man das Werkzeug ueberhaupt anfassen kann:
     KEINE Ecke bewegt sich weiter als die Toleranz. Ohne Breiten-Deckel legt
     eine Verbandssuche (A nah bei B, B nah bei C) im Hotelplan 44 Ecken zu
     EINER Gruppe zusammen, die ueber 105 cm streut — gemessen. Das Begradigen
     zoege dann Waende um einen ganzen Meter und haette mit „diese zwei fluchten
     nicht" nichts mehr zu tun. */
  pruefe(
    weiteste <= F.AUFRAEUM_TOLERANZ_CM,
    `C2 keine Gruppe ist breiter als die Toleranz: weiteste Bewegung ${weiteste} cm ` +
      `(Grenze ${F.AUFRAEUM_TOLERANZ_CM} cm)`
  )
  let verletzt = 0
  for (const s of fundC) for (const e of s.ecken) if (Math.abs(e.nach - e.von) > F.AUFRAEUM_TOLERANZ_CM) verletzt++
  pruefe(verletzt === 0, `C2b und das gilt fuer JEDE einzelne Ecke (${verletzt} Ausreisser)`)

  /* --- C3 GEGENPROBE: auf einem Plan OHNE Fehler findet sie nichts.
     Ein Waechter, der nie leer ausgeht, meldet nur, dass er laeuft. */
  {
    const sauber = [
      { id: 'a', aId: '1', bId: '2', a: { x: 0, y: 0 }, b: { x: 500, y: 0 } },
      { id: 'b', aId: '3', bId: '4', a: { x: 0, y: 300 }, b: { x: 500, y: 300 } },
      { id: 'c', aId: '1', bId: '3', a: { x: 0, y: 0 }, b: { x: 0, y: 300 } },
      { id: 'd', aId: '2', bId: '4', a: { x: 500, y: 0 }, b: { x: 500, y: 300 } }
    ]
    pruefe(
      F.findeFluchtFehler(sauber).length === 0,
      `C3 GEGENPROBE: ein sauberes Rechteck ergibt 0 Fundstellen`
    )
    // ... und mit EINER verzogenen Ecke genau eine.
    const schief = JSON.parse(JSON.stringify(sauber))
    schief[1].a.y = 296
    schief[2].b.y = 296
    const gefunden = F.findeFluchtFehler(schief)
    pruefe(
      gefunden.length === 1 && gefunden[0].versatz === 4,
      `C3b und mit EINER um 4 cm verzogenen Ecke genau eine Stelle ` +
        `(${gefunden.length} Stelle(n), Versatz ${gefunden[0] ? gefunden[0].versatz : '-'} cm)`
    )
  }
}

/* ══════════════════════════════════════════════════════════════════════
   D · AN DER ECHTEN DATEI — und die Zusage, die nur dort zu pruefen ist
   ══════════════════════════════════════════════════════════════════════ */
if (NUR !== 'rechnung') {
  log('\n═══ D · Aufraeum-Hilfe in der Doppelklick-Datei ═══')
  if (!fs.existsSync(DATEI)) {
    pruefe(false, `D0 die Datei fehlt: ${DATEI} — erst "node tools/baue-planer-datei.mjs" laufen lassen`)
  } else {
    const { chromium } = (await import(process.env.PLAYWRIGHT_PFAD || PW_STANDARD)).default
    const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'h400-flucht-'))
    const ctx = await chromium.launchPersistentContext(profil, { args: ['--no-sandbox'] })
    // KEIN Netz: die Datei muss ohne jede Nachladung auskommen (K-Regel).
    await ctx.route('http://**', (r) => r.abort())
    await ctx.route('https://**', (r) => r.abort())
    const page = ctx.pages()[0] || (await ctx.newPage())
    const konsole = []
    page.on('console', (m) => m.type() === 'error' && konsole.push(m.text().slice(0, 160)))
    page.on('pageerror', (e) => konsole.push(String(e).slice(0, 160)))
    await page.goto(pathToFileURL(DATEI).href)
    await page.waitForFunction(() => !!window.__planerDatei, null, { timeout: 30000 })

    /* --- D1 DIE ZUSAGE: ohne „Bearbeiten" ist der Knopf gar nicht erreichbar.
       K3 — die Werkzeugleiste liegt im Grundriss-Umschlag und ist im
       Auslieferungszustand unsichtbar. */
    const knopfRuhe = await page.locator('#btnFluchten').isVisible()
    pruefe(knopfRuhe === false, `D1 im Auslieferungszustand ist „Fluchten pruefen" nicht sichtbar`)

    await werkstattAufschliessen(page)
    await page.click('#btnBearbeiten')
    await page.waitForTimeout(200)
    await page.click('#btnAnsichtPlan')
    await page.waitForTimeout(300)

    const lageAller = () =>
      page.evaluate(() => window.__planerDatei.waende().map((w) => w.wax + ':' + w.way).join('|'))

    const vorher = await lageAller()
    const zahlenVorher = await page.evaluate(() => window.__planerDatei.zahlen())

    /* --- D2 SUCHEN veraendert NICHTS. Das ist der Kern der Zusage: wer den
       Knopf drueckt, riskiert nichts — er bekommt eine Auskunft. */
    await page.evaluate(() => window.__planerDatei.fluchtKnopf())
    await page.waitForTimeout(500)
    const nachSuche = await lageAller()
    const offen = await page.evaluate(() => window.__planerDatei.fluchtFrageOffen())
    const linien = await page.evaluate(() => window.__planerDatei.fluchtLinien())
    pruefe(nachSuche === vorher, `D2 SUCHEN bewegt keinen einzigen Eckpunkt`)
    pruefe(offen === true, `D2b es steht eine Rueckfrage (ohne sie geschieht nichts)`)
    pruefe(linien.length > 0, `D2c und die Fundstellen stehen als Hilfslinien im Plan (${linien.length})`)
    const text = await page.locator('#fluchtFrageUmfang').textContent()
    pruefe(
      /\d+ Stelle/.test(text) && /\d+ Eckpunkt/.test(text) && /\d+ cm/.test(text),
      `D2d die Rueckfrage nennt den UMFANG in Zahlen ("${(text || '').slice(0, 96)}…")`
    )

    /* --- D3 GEGENPROBE: „Abbrechen" laesst alles, wie es war — und raeumt die
       Hilfslinien weg. Eine Linie, die stehen bleibt, behauptet weiter etwas
       ueber einen Zustand, den es nicht mehr gibt. */
    await page.evaluate(() => window.__planerDatei.fluchtNein())
    await page.waitForTimeout(300)
    pruefe(
      (await lageAller()) === vorher,
      `D3 GEGENPROBE: "Abbrechen" bewegt nichts`
    )
    pruefe(
      (await page.evaluate(() => window.__planerDatei.fluchtLinien())).length === 0,
      `D3b und die Hilfslinien sind danach weg`
    )
    pruefe(
      (await page.evaluate(() => window.__planerDatei.kannZurueck())) === false,
      `D3c und die Historie ist unberuehrt — Suchen und Abbrechen sind kein Eingriff`
    )

    /* --- D4 ERST AUF BESTAETIGUNG wird begradigt. Gemessen an einer ECHTEN
       Stelle des Plans: welche Ecke stand vorher wo, und wo steht sie danach. */
    const stellen = await page.evaluate(() => window.__planerDatei.fluchtFehler())
    const probe = stellen.find((s) => s.ecken.length >= 2) || stellen[0]
    const eckeId = probe.ecken[0].id
    const eckeVor = await page.evaluate((id) => window.__planerDatei.ecke(id), eckeId)
    await page.evaluate(() => window.__planerDatei.fluchtKnopf())
    await page.waitForTimeout(300)
    await page.evaluate(() => window.__planerDatei.fluchtJa())
    await page.waitForTimeout(900)
    const eckeNach = await page.evaluate((id) => window.__planerDatei.ecke(id), eckeId)
    const zahlenNach = await page.evaluate(() => window.__planerDatei.zahlen())
    const soll = probe.achse === 'x' ? probe.ziel : probe.ziel
    const istNach = probe.achse === 'x' ? eckeNach.x : eckeNach.y
    const istVor = probe.achse === 'x' ? eckeVor.x : eckeVor.y
    pruefe(
      Math.round(istNach) === Math.round(soll),
      `D4 eine echte Stelle: Ecke ${eckeId.slice(0, 8)} lag auf ${probe.achse} = ${istVor} cm, ` +
        `steht jetzt auf ${istNach} cm · Soll ${soll} cm ` +
        `(Nachbarwand-Flucht, ${Math.abs(istNach - istVor)} cm bewegt)`
    )
    pruefe(
      (await lageAller()) !== vorher,
      `D4b und der Plan ist insgesamt ein anderer als vorher`
    )

    /* --- D5 DER RAUM-WAECHTER: nach dem Eingriff muessen die Raeume noch
       schliessen. Ein Aufraeumen, das einen Raum aufreisst, hat nichts
       aufgeraeumt — es hat den Businessplan entwertet (die Flaechen werden
       null, und zwar ohne Fehlermeldung). */
    pruefe(
      zahlenNach.raeume >= zahlenVorher.raeume,
      `D5 die Raeume schliessen weiterhin (${zahlenVorher.raeume} -> ${zahlenNach.raeume})`
    )
    pruefe(
      zahlenNach.waende === zahlenVorher.waende && zahlenNach.ecken === zahlenVorher.ecken,
      `D5b und es ist keine Bausubstanz verlorengegangen ` +
        `(${zahlenVorher.ecken}/${zahlenVorher.waende} -> ${zahlenNach.ecken}/${zahlenNach.waende})`
    )

    /* --- D6 EIN Rueckgaengig nimmt die GANZE Aufraeumung zurueck. Fuer den
       Nutzer war es EINE Handlung; 34 Schritte fuer einen Knopfdruck machten
       das vorhandene Rueckgaengig unbrauchbar. */
    await page.evaluate(() => window.__planerDatei.undoJetzt())
    await page.waitForTimeout(700)
    pruefe(
      (await lageAller()) === vorher,
      `D6 EIN Rueckgaengig stellt den Stand von vorher vollstaendig her`
    )
    pruefe(
      (await page.evaluate(() => window.__planerDatei.kannZurueck())) === false,
      `D6b und danach ist die Historie leer — es war GENAU EIN Schritt`
    )

    /* ══ E · DER FANG BEIM ZEICHNEN, mit ECHTEN Zeiger-Ereignissen ══════
       A hat die Rechnung gemessen. Hier wird die HAND gemessen: der Zeiger
       faehrt wirklich ueber die Zeichenflaeche, der Kern hoert seine Ereignisse
       ab, und gelesen wird der ZIELPUNKT — also das, was beim Klicken entstuende.
       Zwischen beiden liegt alles, was schiefgehen kann: die Umrechnung
       Bild->Welt, der Zoom, die Reihenfolge der drei Hilfen, der Schalter.

       DIE MESSUNG hat drei Zahlen, wie jede in dieser Datei: wo der Punkt OHNE
       Fang landet, wo MIT, und wo er hingehoert. Der Sollwert ist keine
       Erfindung — es ist die Achse einer Wand, die WIRKLICH im Plan steht. */
    {
      // Zeichnen-Werkzeug greifen — ueber DEN KNOPF, nicht ueber den Kern:
      // ein Gate, das den Modus direkt setzt, prueft eine Bedienung, die es so
      // gar nicht gibt.
      await page.click('#wzDraw')
      await page.waitForTimeout(250)

      /* Eine senkrechte Wand des Plans suchen, auf deren Achse gezielt wird —
         samt dem Massstab, den die Datei selbst benutzt. `waende()` liefert
         BILD- und WELT-Koordinaten derselben Wand; ihr Verhaeltnis IST die
         Abbildung, mit der auch der Kern rechnet. Sie hier nachzubauen waere
         eine zweite Wahrheit ueber den Zoom. */
      const ziel = await page.evaluate(() => {
        const w = window.__planerDatei.waende().find(
          (q) => Math.abs(q.wax - q.wbx) < 1 && Math.abs(q.way - q.wby) > 300
        )
        if (!w) return null
        const pxProCm = (w.by - w.ay) / (w.wby - w.way)
        return {
          id: w.id,
          achse: w.wax,
          bildX: w.ax,
          bildY: (w.ay + w.by) / 2,
          pxProCm
        }
      })
      if (!ziel) {
        pruefe(false, 'E0 keine senkrechte Wand gefunden, auf deren Flucht man zielen koennte')
      } else {
        /* 5 cm NEBEN der Achse zielen — eine Abweichung, die eine freihaendig
           gefuehrte Maus jederzeit produziert und die im Bild bei 1:290 nicht
           einmal einen Bildpunkt ausmacht. Genau der unsichtbare Fehler, um den
           es dem Nutzer geht. */
        const danebenCm = 5
        const bild = { x: ziel.bildX + danebenCm * ziel.pxProCm, y: ziel.bildY }
        const messen = async (fangAn) => {
          await page.evaluate((an) => window.__planerDatei.setzeEinrasten(an), fangAn)
          await page.evaluate((b) => window.__planerDatei.maus('mousemove', b.x, b.y), bild)
          await page.waitForTimeout(150)
          return page.evaluate(() => window.__planerDatei.zeichenZiel())
        }
        const ohne = await messen(false)
        const mit = await messen(true)
        pruefe(
          Math.abs(mit.x - ziel.achse) < 1 && Math.abs(ohne.x - ziel.achse) > 1,
          `E1 ZEICHNEN mit echten Zeiger-Ereignissen: ohne Fang x = ${ohne.x.toFixed(1)} cm · ` +
            `mit Fang x = ${mit.x.toFixed(1)} cm · Soll ${ziel.achse} cm ` +
            `(die Achse der Wand ${String(ziel.id).slice(0, 8)} — ${Math.abs(mit.x - ohne.x).toFixed(1)} cm gezogen)`
        )
        pruefe(
          (await page.evaluate(() => window.__planerDatei.fluchtLinien())).length > 0,
          `E2 und der Fang ZEIGT sich: eine gestrichelte Hilfslinie steht auf der Flucht ` +
            `(ohne Rueckmeldung merkt niemand, dass er gegriffen hat — im Bild sind 5 cm weniger als ein Bildpunkt)`
        )
        pruefe(
          Math.abs(ohne.x - (ziel.achse + danebenCm)) < 2,
          `E3 GEGENPROBE: mit ausgeschaltetem Einrasten bleibt der Punkt roh, wo der Zeiger steht ` +
            `(${ohne.x.toFixed(1)} cm statt ${ziel.achse} cm) — der Fang ist abschaltbar und tut es auch`
        )
      }
    }

    pruefe(konsole.length === 0, `D7 keine Konsolenfehler (${konsole.length}${konsole.length ? ': ' + konsole[0] : ''})`)
    await ctx.close()
  }
}

log('')
if (fundC.length) {
  log(`ZAHL FUER DEN BETREIBER: im Plan "${PLAN}" stecken ${fundC.length} Stellen, an denen`)
  log(`nebeneinanderliegende Waende nicht fluchten — zusammen ${fundC.reduce((s, f) => s + f.ecken.length, 0)} Eckpunkte,`)
  log(`keiner weiter als ${fundC.reduce((m, f) => Math.max(m, f.versatz), 0)} cm von seiner Flucht entfernt.`)
  log('')
}
log(fehler.length === 0 ? 'ALLE PRUEFUNGEN BESTANDEN' : `DURCHGEFALLEN: ${fehler.length}`)
fehler.forEach((f) => log('  - ' + f))
process.exit(fehler.length === 0 ? 0 : 1)
