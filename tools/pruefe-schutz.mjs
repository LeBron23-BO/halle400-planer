// Prueft den SCHUTZ (W10) — die drei schweren Punkte des Bedien-Audits vom
// 2026-07-27, jeder MIT Gegenprobe.
//
//   node tools/baue-planer-datei.mjs
//   node tools/pruefe-schutz.mjs
// Exit 0 = alle Pruefungen bestanden, 1 = mindestens eine durchgefallen.
//   --nur greifen | stand | zuruecksetzen | leiste   grenzt ein
//
// WORUM ES GEHT (gemessen, nicht vermutet):
//
//   C2  Ein Zug auf eine Wand-Ecke — dieselbe Geste wie beim Moebelziehen, kein
//       Werkzeugwechsel, keine Rueckfrage — verschob die Aussenwand um 2,24 m;
//       danach stand auf dem Blatt „kein Aufmass". Die Greifzone ist im
//       Startzoom 41 cm breit, ein Stuhl misst 45 cm: die Fehlertoleranz ist so
//       gross wie der Gegenstand.
//   C1  Die Datei in einen anderen Ordner kopiert -> vier gesetzte Stuecke
//       wurden null, ohne ein Wort. Die Rettungsmechanik war gebaut und suchte
//       nur unter Staenden DERSELBEN Bau-Fassung — genau die eine Groesse, die
//       ein neuer Bau aendert.
//   C3  „Zuruecksetzen" war endgueltig: danach ist Rueckgaengig abgeschaltet,
//       und die Rueckfrage nannte den Umfang nicht.
//   V7  Beim Werkzeugwechsel bewegten sich 13 von 24 Knoepfen, bis zu 520 px.
//
// ZWEI REGELN, DIE DIESES WERKZEUG VON DEN AELTEREN ERBT:
//
// 1. ECHTE ZEIGER-EREIGNISSE (`page.mouse`). `dispatchEvent` ruft die Zuhoerer
//    eines Elements direkt auf und fragt nie, ob es ueberhaupt getroffen werden
//    kann — eine Zeichenflaeche mit `pointer-events:none` saehe damit scharf
//    aus. Nur die Bedienelemente der Huelle (Knoepfe) werden per `dispatchEvent`
//    geklickt: die Zeichenschleife laesst die Seite nie zur Ruhe kommen, und ein
//    wartender `page.click` liefe in den Timeout, OBWOHL er wirkt.
//
// 2. JEDE PRUEFUNG HAT EINE GEGENPROBE. „Die Ecke bewegt sich nicht" bestuende
//    auch dann, wenn die Bildpunkte danebenlagen. Deshalb wird DERSELBE Zug im
//    Wand-Werkzeug wiederholt und MUSS dort wirken.
//
// EIN MESSFEHLER, DER HIER FAST ENTSTANDEN WAERE, und warum das Verfahren so
// aussieht wie es aussieht: seit C2 schwenkt ein Zug im Verschieben-Werkzeug
// die ANSICHT (es ist ja nichts mehr zu greifen). Bildpunkte, die vor einem Zug
// gelesen wurden, zeigen danach woandershin. Jede Stelle liest ihre
// Bildkoordinaten deshalb UNMITTELBAR vor dem Zug neu — die erste Fassung
// dieses Gates meldete sonst „Gegenprobe bewegt auch nichts" und haette den
// Umbau faelschlich als kaputt gemeldet.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { werkstattAufschliessen } from './werkstatt-auf.mjs'

const PW_STANDARD = 'file:///C:/Users/dania/.gemini/node_modules/playwright/index.js'
const { chromium } = (await import(process.env.PLAYWRIGHT_PFAD || PW_STANDARD)).default

const HIER = path.dirname(fileURLToPath(import.meta.url))
const WURZEL = path.resolve(HIER, '..')
const arg = (name, standard) => {
  const i = process.argv.indexOf(name)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : standard
}
const DATEI = path.resolve(WURZEL, arg('--datei', 'Halle400-Modell.html'))
const NUR = arg('--nur', null)
const laeuft = (name) => !NUR || NUR === name

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'h400-schutz-'))
const BILDER = path.join(WURZEL, 'data/standbilder')
fs.mkdirSync(BILDER, { recursive: true })
const log = (s) => console.log(s)
const fehler = []
const pruefe = (bedingung, text) => {
  log(`${bedingung ? 'OK  ' : 'FEHL'} ${text}`)
  if (!bedingung) fehler.push(text)
}

if (!fs.existsSync(DATEI)) {
  log(`FEHL die Doppelklick-Datei fehlt (${DATEI}) — erst "node tools/baue-planer-datei.mjs"`)
  process.exit(1)
}

/* Zwei ABLAGEORTE und zwei BAU-FASSUNGEN. `file://` ist EIN Ursprung fuer die
   ganze Festplatte; der Speicherschluessel traegt darum Ablageort UND
   Plan-Abdruck. Beides laesst sich nur mit echten Ordnern messen — und die
   zweite Bau-Fassung entsteht, indem der eingebaute Plan-Abdruck ausgetauscht
   wird. Das ist keine Attrappe: genau diese eine Zeile aendert sich, wenn
   `export_blueprint.py` den Plan neu schreibt und die Huelle neu gebaut wird. */
const ROH = fs.readFileSync(DATEI, 'utf8')
const ABDRUCK_ZEILE = /const PLAN_ABDRUCK = "[0-9a-f]+";/
if (!ABDRUCK_ZEILE.test(ROH)) {
  log('FEHL der eingebaute PLAN_ABDRUCK ist nicht zu finden — die Vorlage hat sich geaendert')
  process.exit(1)
}
const ORT_A = path.join(DIR, 'ordner-a')
const ORT_B = path.join(DIR, 'ordner-b')
fs.mkdirSync(ORT_A)
fs.mkdirSync(ORT_B)
const PFAD_A = path.join(ORT_A, 'Halle400-Modell.html')
const PFAD_B = path.join(ORT_B, 'Halle400-Modell.html')
fs.writeFileSync(PFAD_A, ROH, 'utf8')
fs.writeFileSync(PFAD_B, ROH.replace(ABDRUCK_ZEILE, 'const PLAN_ABDRUCK = "ffffffffffff";'), 'utf8')
const URL_A = pathToFileURL(PFAD_A).href
const URL_B = pathToFileURL(PFAD_B).href
const URL_HIER = pathToFileURL(DATEI).href

/* ECHTES Nutzerprofil statt fluechtigem Kontext: der Speicher unter `file://`
   verhaelt sich sonst anders als beim Doppelklick (gemessen in W1 — im
   fluechtigen Kontext sieht ein zweiter Reiter den Stand NICHT). C1 misst
   genau diesen Speicher; mit dem falschen Kontext maesse es nichts. */
let profilZaehler = 0
async function profil() {
  const ctx = await chromium.launchPersistentContext(path.join(DIR, 'profil-' + ++profilZaehler), {
    viewport: { width: 1600, height: 1000 }
  })
  const draussen = []
  await ctx.route('**/*', (route) => {
    const u = route.request().url()
    if (u.startsWith('file://') || u.startsWith('data:') || u.startsWith('blob:')) return route.continue()
    draussen.push(u)
    return route.abort()
  })
  return { ctx, draussen }
}

const konsoleVon = (seite, sammler) => {
  seite.on('console', (m) => {
    if (m.type() === 'error') sammler.push(m.text().slice(0, 160))
  })
  seite.on('pageerror', (e) => sammler.push('PAGE-ERR: ' + String(e).slice(0, 160)))
  return seite
}

async function oeffne(ctx, url, sammler) {
  const seite = konsoleVon(await ctx.newPage(), sammler)
  await seite.goto(url, { waitUntil: 'domcontentloaded' })
  await seite.waitForFunction(() => window.__bereit === true, { timeout: 30000 })
  return seite
}

/** Bearbeiten an UND in den Grundriss — zwei Griffe, seit W7 unvermeidlich.
 *  W11: seit dem Schloss ist der erste Griff eine FRAGE, keine Tat.
 *  `werkstattAufschliessen` umgeht sie nicht — es beantwortet sie mit dem
 *  echten Passwort (Umgebung oder Geheim-Ordner, nie aus dem Repo). Diese EINE
 *  Stelle bedient alle fuenf Aufrufer dieser Funktion. */
const bearbeitenAn = async (seite) => {
  await werkstattAufschliessen(seite)
  await seite.evaluate(() => {
    if (!window.__planerDatei.bearbeitet()) {
      document.getElementById('btnBearbeiten').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    }
    if (window.__planerDatei.ansicht() !== 'plan') {
      document.getElementById('btnAnsichtPlan').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    }
  })
  await seite.waitForTimeout(450)
}

const werkzeug = async (seite, id) => {
  await seite.evaluate((k) => document.getElementById(k).dispatchEvent(new MouseEvent('click', { bubbles: true })), id)
  await seite.waitForTimeout(180)
}

/** ECHTES Ziehen — durch die Treffer-Ermittlung des Browsers. */
async function ziehe(seite, x1, y1, x2, y2, schritte = 10) {
  await seite.mouse.move(x1, y1)
  await seite.waitForTimeout(90)
  await seite.mouse.down()
  for (let i = 1; i <= schritte; i++) {
    await seite.mouse.move(x1 + ((x2 - x1) * i) / schritte, y1 + ((y2 - y1) * i) / schritte)
  }
  await seite.mouse.up()
  await seite.waitForTimeout(80)
}

/** Zeigerstil und Treffer an EINEM Bildpunkt — schweben, dann fragen. */
async function unterZeiger(seite, x, y) {
  await seite.mouse.move(x, y)
  await seite.waitForTimeout(140)
  return seite.evaluate(() => ({
    stil: window.__planerDatei.zeigerStil(),
    treffer: window.__planerDatei.treffer()
  }))
}

/** Eine frei stehende Ecke: keine zweite naeher als 40 px, sonst misst der Zug
 *  ein Verschmelzen (`Corner.move` verschmilzt unter 20 cm) statt ein
 *  Verschieben. */
const freieEcke = (seite) =>
  seite.evaluate(() => {
    const alle = window.__planerDatei.ecken()
    const frei = alle.filter(
      (k) =>
        k.bx > 330 && k.bx < 1270 && k.by > 230 && k.by < 810 &&
        !alle.some((a) => a.id !== k.id && Math.hypot(a.bx - k.bx, a.by - k.by) < 40)
    )
    frei.sort((a, b) => b.by - a.by)
    return frei[0] || null
  })

/* ══════════════════════════════════════════════════════════════════════
   A — DER FEHLGRIFF INS AUFMASS (C2)
   a) Ein Zug auf eine Wand-Ecke im Verschieben-Werkzeug bewegt NICHTS.
      GEGENPROBE: im Wand-Werkzeug bewegt DERSELBE Zug sie sehr wohl.
   ══════════════════════════════════════════════════════════════════════ */
if (laeuft('greifen')) {
  log('\n── A: Wand-Ecken sind im Verschieben-Werkzeug nicht mehr greifbar (C2) ──')
  const { ctx, draussen } = await profil()
  const konsole = []
  const seite = await oeffne(ctx, URL_HIER, konsole)
  await bearbeitenAn(seite)
  await werkzeug(seite, 'wzMove')

  const ecke = await freieEcke(seite)
  pruefe(ecke !== null, 'A: eine frei stehende Wand-Ecke zum Greifen gefunden')
  if (!ecke) {
    await ctx.close()
    log('\nABBRUCH: ohne Greifpunkt ist der Rest Raten.')
    process.exit(1)
  }
  const weltVorher = { x: ecke.x, y: ecke.y }
  log(`     Ecke ${ecke.id.slice(0, 8)} bei Bild(${ecke.bx.toFixed(0)}, ${ecke.by.toFixed(0)}) = Welt(${ecke.x}, ${ecke.y})`)

  const schweben = await unterZeiger(seite, ecke.bx, ecke.by)
  pruefe(
    schweben.treffer.ecke === null && schweben.treffer.wand === null,
    `A: im Verschieben meldet der Treffer weder Ecke noch Wand (${JSON.stringify(schweben.treffer)})`
  )
  pruefe(
    schweben.stil === '',
    `A: und der Zeiger verspricht dort auch keinen Griff (Stil "${schweben.stil}")`
  )

  await ziehe(seite, ecke.bx, ecke.by, ecke.bx + 70, ecke.by + 90)
  const nachMove = await seite.evaluate((id) => window.__planerDatei.ecke(id), ecke.id)
  const bewegtMove = Math.hypot(nachMove.x - weltVorher.x, nachMove.y - weltVorher.y)
  pruefe(
    bewegtMove === 0,
    `A: derselbe Zug wie beim Moebelziehen bewegt die Ecke um ${bewegtMove.toFixed(1)} cm (SOLL 0)`
  )
  const abweichungMove = await seite.evaluate(() => window.__planerDatei.abweichung())
  pruefe(
    abweichungMove.gesetzt === 0 && abweichungMove.fehlen === 0,
    `A: das Blatt meldet danach KEINE veraenderte Wand (${JSON.stringify(abweichungMove)})`
  )
  await seite.screenshot({ path: path.join(BILDER, 'schutz-a1-verschieben-greift-keine-wand.png') })

  /* ── GEGENPROBE ────────────────────────────────────────────────────────
     Bildpunkte FRISCH lesen: der Zug oben hat die Ansicht geschwenkt (nichts
     gegriffen -> schwenken), die alten Bildpunkte zeigen woandershin. */
  await werkzeug(seite, 'wzWand')
  const ecke2 = await seite.evaluate((id) => window.__planerDatei.ecke(id), ecke.id)
  const schwebenWand = await unterZeiger(seite, ecke2.bx, ecke2.by)
  pruefe(
    schwebenWand.treffer.ecke === ecke.id,
    `A: GEGENPROBE — im Wand-Werkzeug findet derselbe Punkt die Ecke (${String(schwebenWand.treffer.ecke).slice(0, 8)})`
  )
  pruefe(
    schwebenWand.stil === 'grab',
    `A: GEGENPROBE — und der Zeiger sagt es (Stil "${schwebenWand.stil}")`
  )
  await ziehe(seite, ecke2.bx, ecke2.by, ecke2.bx + 70, ecke2.by + 90)
  const nachWand = await seite.evaluate((id) => window.__planerDatei.ecke(id), ecke.id)
  const bewegtWand = Math.hypot(nachWand.x - weltVorher.x, nachWand.y - weltVorher.y)
  pruefe(
    bewegtWand > 100,
    `A: GEGENPROBE — im Wand-Werkzeug bewegt derselbe Zug die Ecke um ${bewegtWand.toFixed(0)} cm (SOLL > 100)`
  )
  const abweichungWand = await seite.evaluate(() => window.__planerDatei.abweichung())
  pruefe(
    abweichungWand.gesetzt > 0,
    `A: GEGENPROBE — und DANN sagt das Blatt es auch (${JSON.stringify(abweichungWand)})`
  )
  await seite.screenshot({ path: path.join(BILDER, 'schutz-a2-wandwerkzeug-greift-wand.png') })

  /* Und zurueck: ein Werkzeugwechsel darf die Merkung nicht mitnehmen. Ohne
     das Aufraeumen in `setMode` sperrte eine liegen gebliebene `activeWall`
     im Verschieben das Schwenken — ein Fleck, in dem der Zeiger nichts tut. */
  await seite.evaluate(() => window.__planerDatei.undoJetzt())
  await seite.waitForTimeout(400)
  await werkzeug(seite, 'wzMove')
  const merkung = await seite.evaluate(() => window.__planerDatei.treffer())
  pruefe(
    merkung.ecke === null && merkung.wand === null,
    `A: der Werkzeugwechsel nimmt keine Wand-Merkung mit hinueber (${JSON.stringify(merkung)})`
  )

  pruefe(konsole.length === 0, `A: keine Konsolen- oder Seitenfehler (${konsole.length}${konsole.length ? ': ' + konsole[0] : ''})`)
  pruefe(draussen.length === 0, `A: keine Anfrage nach draussen (${draussen.length})`)
  await ctx.close()
}

/* ══════════════════════════════════════════════════════════════════════
   B — DAS KLEINSTE STUECK GEWINNT, UND DER ZEIGER SAGT ES (V3)
   b) Ein Moebel in der Greifzone einer Wand wird als MOEBEL gegriffen.
      GEGENPROBE: daneben trifft weiterhin die Wand.
   c) Der Zeiger zeigt `grab` ueber einem greifbaren Stueck und nicht daneben.

   GEMESSEN WIRD IM LOESCHEN-WERKZEUG, und das ist Absicht: seit C2 sind Moebel
   und Bausubstanz nur DORT gleichzeitig greifbar. Genau dort ist die
   Vorrang-Regel also noch wirksam — und dort ist ein Fehlgriff am teuersten.
   ══════════════════════════════════════════════════════════════════════ */
if (laeuft('greifen')) {
  log('\n── B: Vorrang nach dem kleinsten Treffer, und der Zeiger meldet ihn (V3) ──')
  const { ctx } = await profil()
  const konsole = []
  const seite = await oeffne(ctx, URL_HIER, konsole)
  await bearbeitenAn(seite)

  /* Ein Stueck suchen, das WIRKLICH in der Greifzone einer Wand steht: sein
     Mittelpunkt muss naeher als die Greifzone (8 px) an einer Wandachse
     liegen. Ohne diese Bedingung maesse die Pruefung einen belanglosen Fall. */
  await werkzeug(seite, 'wzDelete')
  const paar = await seite.evaluate(() => {
    const d = window.__planerDatei
    const proCm = d.proCm()
    const zone = 8 / proCm // Greifzone in cm — dieselbe Rechnung wie im Kern
    const waende = d.waende()
    const abstand = (px, py, w) => {
      const dx = w.wbx - w.wax, dy = w.wby - w.way
      const l2 = dx * dx + dy * dy
      if (l2 === 0) return Math.hypot(px - w.wax, py - w.way)
      let t = ((px - w.wax) * dx + (py - w.way) * dy) / l2
      t = Math.max(0, Math.min(1, t))
      return Math.hypot(px - (w.wax + t * dx), py - (w.way + t * dy))
    }
    for (const el of d.ausstattung()) {
      if (el.bx < 330 || el.bx > 1270 || el.by < 230 || el.by > 810) continue
      for (const w of waende) {
        if (abstand(el.x, el.y, w) > zone) continue
        /* Ein Punkt AUF DERSELBEN WAND, weit genug vom Stueck weg, dass es ihn
           auch mit der vollen Greifzone nicht mehr fassen kann: halbe Diagonale
           des (gedrehten) Rechtecks + Greifzone + eine Handbreit. Nicht
           geraten, sondern aus den Massen des Stuecks gerechnet — feste
           Bildpunkte waeren bei jedem anderen Zoom falsch. */
        const laenge = Math.hypot(w.wbx - w.wax, w.wby - w.way)
        if (laenge < 300) continue
        const ex = (w.wbx - w.wax) / laenge, ey = (w.wby - w.way) / laenge
        /* Eine Reihe von Punkten AUF DERSELBEN WANDACHSE, vom Stueck weg —
           welcher davon taugt, entscheidet gleich der ZEIGER und nicht diese
           Rechnung. Der Fusspunkt ist die Projektion des Stuecks auf die
           Achse, nicht sein Mittelpunkt: sonst truege jeder Probepunkt den
           Querversatz des Stuecks mit und laege am Ende neben der Wand. */
        const tp = ((el.x - w.wax) * ex + (el.y - w.way) * ey)
        const fx = w.wax + ex * tp, fy = w.way + ey * tp
        const halbDiagonale = Math.hypot(el.breite, el.tiefe) / 2
        const reihe = []
        for (const vz of [1, -1]) {
          for (let k = 1; k <= 8; k++) {
            const weg = halbDiagonale + zone + k * 25
            const t = tp + weg * vz
            if (t < laenge * 0.06 || t > laenge * 0.94) continue
            reihe.push({
              wegCm: weg * vz,
              bx: (w.wax + ex * t - el.x) * proCm + el.bx,
              by: (w.way + ey * t - el.y) * proCm + el.by
            })
          }
        }
        if (!reihe.length) continue
        return { stueck: el, wand: w.id, zoneCm: zone, reihe: reihe }
      }
    }
    return null
  })
  pruefe(paar !== null, 'B: ein Moebel gefunden, dessen Mitte IN der Greifzone einer Wand liegt')
  if (paar) {
    log(`     ${paar.stueck.typ} ${paar.stueck.id} · Greifzone ${paar.zoneCm.toFixed(0)} cm · Wand ${paar.wand.slice(0, 8)}`)
    const auf = await unterZeiger(seite, paar.stueck.bx, paar.stueck.by)
    pruefe(
      auf.treffer.ausstattung === paar.stueck.id,
      `B: der Zeiger greift das MOEBEL, nicht die Wand darunter (${JSON.stringify(auf.treffer)})`
    )

    /* GEGENPROBE: DANEBEN auf derselben Wandachse muss weiterhin die WAND (oder
       ihre Ecke) getroffen werden. Ohne diese Haelfte bewiese die Pruefung nur,
       dass Moebel gewinnen — nicht, dass die Wand daneben ueberhaupt noch zu
       greifen ist, und ein Vorrang, der die Wand unbenutzbar macht, waere kein
       Fortschritt.

       GEFRAGT WIRD DER ZEIGER, nicht eine zweite Abstandsrechnung im Gate:
       `overlappedWall` nimmt die ERSTE Wand in Reichweite, nicht die naechste,
       und misst gegen die Achse. Eine nachgebaute Rechnung waere eine zweite
       Wahrheit ueber „was liegt hier?" — die erste Fassung dieses Gates hatte
       genau die und meldete rot fuer einen Punkt, der in Ordnung war. */
    let danebenTrifft = null
    for (const p of paar.reihe) {
      if (p.bx < 5 || p.bx > 1595 || p.by < 5 || p.by > 995) continue
      const t = await unterZeiger(seite, p.bx, p.by)
      if (t.treffer.ausstattung === paar.stueck.id) continue
      if (t.treffer.wand !== null || t.treffer.ecke !== null || t.treffer.oeffnung !== null) {
        danebenTrifft = { weg: p.wegCm, treffer: t.treffer }
        break
      }
    }
    pruefe(
      danebenTrifft !== null,
      `B: GEGENPROBE — daneben auf derselben Wand trifft der Zeiger weiterhin die BAUSUBSTANZ` +
        (danebenTrifft ? ` (${danebenTrifft.weg.toFixed(0)} cm entfernt: ${JSON.stringify(danebenTrifft.treffer)})` : ' — an KEINEM der Probepunkte')
    )
  }

  /* ── c) Der Zeiger als Auskunft, in beiden Werkzeugen, je mit Gegenprobe. */
  await werkzeug(seite, 'wzMove')
  const moebel = await seite.evaluate(() =>
    window.__planerDatei.ausstattung().find((e) => e.bx > 330 && e.bx < 1270 && e.by > 230 && e.by < 810)
  )
  const aufMoebel = await unterZeiger(seite, moebel.bx, moebel.by)
  pruefe(aufMoebel.stil === 'grab', `B/c: ueber einem Moebel sagt der Zeiger "grab" (${aufMoebel.stil})`)
  /* Einen leeren Punkt findet man nur durch Hinsehen: Zeiger hinfahren und den
     Kern fragen, statt eine zweite Treffer-Rechnung im Gate zu fuehren — die
     waere eine zweite Wahrheit ueber „was liegt hier?" und liefe beim ersten
     Nachbessern auseinander. */
  let leerGefunden = null
  for (let x = 350; x <= 1250 && !leerGefunden; x += 61) {
    for (let y = 250; y <= 800 && !leerGefunden; y += 67) {
      const t = await unterZeiger(seite, x, y)
      if (t.treffer.ausstattung === null && t.treffer.wand === null && t.treffer.ecke === null) {
        leerGefunden = { x, y, stil: t.stil }
      }
    }
  }
  pruefe(leerGefunden !== null, 'B/c: ein leerer Punkt im Grundriss gefunden')
  if (leerGefunden) {
    pruefe(
      leerGefunden.stil === '',
      `B/c: GEGENPROBE — ueber Leerraum verspricht der Zeiger nichts (Stil "${leerGefunden.stil}" bei ${leerGefunden.x}/${leerGefunden.y})`
    )
  }
  await seite.screenshot({ path: path.join(BILDER, 'schutz-b-zeiger-und-vorrang.png') })
  pruefe(konsole.length === 0, `B: keine Konsolen- oder Seitenfehler (${konsole.length}${konsole.length ? ': ' + konsole[0] : ''})`)
  await ctx.close()
}

/* ══════════════════════════════════════════════════════════════════════
   C — DIE ARBEIT VERSCHWINDET NICHT MEHR STILL (C1)
   d) Eine Datei-Kopie in einem anderen Ordner FINDET den Stand und bietet ihn
      an — und zwar auch dann, wenn sie eine ANDERE Bau-Fassung ist (genau
      dieser Fall war stumm: der Plan-Abdruck stand im Such-Praefix).
      GEGENPROBE: mit eigenem Stand wird nicht gefragt.
   ══════════════════════════════════════════════════════════════════════ */
if (laeuft('stand')) {
  log('\n── C: kein stiller Verlust — alle Staende werden angeboten (C1) ──')
  const { ctx } = await profil()
  const konsole = []

  // In Ordner A arbeiten …
  const seiteA = await oeffne(ctx, URL_A, konsole)
  await bearbeitenAn(seiteA)
  for (let n = 0; n < 3; n++) {
    const k = await seiteA.evaluate(() =>
      window.__planerDatei.ausstattung().find((e) => e.quelle !== 'gesetzt' && e.bx > 330 && e.bx < 1270 && e.by > 230 && e.by < 810)
    )
    if (!k) break
    await ziehe(seiteA, k.bx, k.by, k.bx + 45, k.by + 45)
  }
  await seiteA.waitForTimeout(1300)
  const inA = await seiteA.evaluate(() => ({
    gesetzte: window.__planerDatei.gesetzte(),
    bytes: (window.__planerDatei.speicherStand() || '').length,
    schluessel: window.__planerDatei.schluessel
  }))
  pruefe(inA.gesetzte === 3, `C: in Ordner A sind 3 Stuecke frei gesetzt (${inA.gesetzte})`)
  pruefe(inA.bytes > 1000, `C: und der Stand liegt im Speicher (${inA.bytes} Bytes)`)
  await seiteA.close()

  // … und die ANDERE BAU-FASSUNG in Ordner B oeffnen.
  const seiteB = await oeffne(ctx, URL_B, konsole)
  await seiteB.waitForTimeout(400)
  const inB = await seiteB.evaluate(() => ({
    schluessel: window.__planerDatei.schluessel,
    gefunden: window.__planerDatei.staendeAnderswo(),
    uebersicht: window.__planerDatei.staendeUebersicht(),
    offen: window.__planerDatei.ortFrageOffen(),
    text: window.__planerDatei.ortFrageText(),
    gesetzte: window.__planerDatei.gesetzte()
  }))
  pruefe(inB.schluessel !== inA.schluessel, 'C: die andere Bau-Fassung hat einen eigenen Speicher-Schluessel (so soll es sein)')
  pruefe(
    inB.gefunden === 1,
    `C: sie FINDET den Stand trotzdem — ueber Bau-Fassungen hinweg (${inB.gefunden}; genau das war stumm)`
  )
  pruefe(
    inB.uebersicht.length === 1 && inB.uebersicht[0].gleicherPlan === false,
    `C: und weiss, dass er aus einer anderen Bau-Fassung stammt (${JSON.stringify(inB.uebersicht[0] || null).slice(0, 120)})`
  )
  pruefe(inB.offen === true, 'C: das Angebot ist WIRKLICH zu sehen (checkVisibility, nicht `hidden`)')
  pruefe(
    /ordner-a/i.test(String(inB.text)),
    `C: es NENNT den Ablageort statt nur „irgendwo" ("${String(inB.text).slice(0, 130)}")`
  )
  pruefe(
    /Bau-Fassung/.test(String(inB.text)),
    'C: und sagt, dass die Bau-Fassung eine andere ist'
  )
  pruefe(inB.gesetzte === 0, 'C: geladen wird NICHTS von selbst — welche Kopie gilt, weiss nur der Nutzer')
  await seiteB.screenshot({ path: path.join(BILDER, 'schutz-c-angebot.png') })

  await seiteB.evaluate(() => document.getElementById('btnOrtJa').dispatchEvent(new MouseEvent('click', { bubbles: true })))
  await seiteB.waitForTimeout(1300)
  const geholt = await seiteB.evaluate(() => ({
    gesetzte: window.__planerDatei.gesetzte(),
    offen: window.__planerDatei.ortFrageOffen(),
    meldung: window.__planerDatei.meldungText()
  }))
  pruefe(
    geholt.gesetzte === 3 && geholt.offen === false,
    `C: auf Wunsch wird er geholt ("${String(geholt.meldung).slice(0, 80)}")`
  )

  /* GEGENPROBE: wer an DIESEM Ablageort einen eigenen Stand hat, wird nicht
     mehr gefragt — sonst waere das Angebot laestig statt hilfreich. */
  await seiteB.reload({ waitUntil: 'domcontentloaded' })
  await seiteB.waitForFunction(() => window.__bereit === true, { timeout: 30000 })
  await seiteB.waitForTimeout(500)
  const nochmal = await seiteB.evaluate(() => ({
    offen: window.__planerDatei.ortFrageOffen(),
    gesetzte: window.__planerDatei.gesetzte()
  }))
  pruefe(nochmal.offen === false, 'C: GEGENPROBE — mit eigenem Stand wird nicht gefragt')
  pruefe(nochmal.gesetzte === 3, `C: GEGENPROBE — und der eigene Stand ist beim Oeffnen da (${nochmal.gesetzte})`)

  pruefe(konsole.length === 0, `C: keine Konsolen- oder Seitenfehler (${konsole.length}${konsole.length ? ': ' + konsole[0] : ''})`)
  await ctx.close()
}

/* ══════════════════════════════════════════════════════════════════════
   D — „ZURUECKSETZEN" NENNT DEN UMFANG UND IST NICHT MEHR ENDGUELTIG (C3)
   e) Die Rueckfrage nennt den Umfang, und der Stand laesst sich danach
      zurueckholen. GEGENPROBE: ohne eigene Arbeit nennt sie keine Zahlen.
   ══════════════════════════════════════════════════════════════════════ */
if (laeuft('zuruecksetzen')) {
  log('\n── D: „Zuruecksetzen" nennt den Umfang und ist rueckholbar (C3) ──')
  const { ctx } = await profil()
  const konsole = []
  const seite = await oeffne(ctx, URL_HIER, konsole)
  await bearbeitenAn(seite)

  /* GEGENPROBE ZUERST: ohne eigene Arbeit gibt es nichts zu nennen. Sie steht
     vorn, weil sie danach nicht mehr herstellbar waere. */
  await seite.evaluate(() => document.getElementById('btnZurueck').dispatchEvent(new MouseEvent('click', { bubbles: true })))
  await seite.waitForTimeout(250)
  const leerUmfang = await seite.evaluate(() => ({
    offen: window.__planerDatei.zurueckFrageOffen(),
    text: window.__planerDatei.zurueckFrageUmfang()
  }))
  pruefe(leerUmfang.offen === true, 'D: GEGENPROBE — die Rueckfrage ist zu sehen')
  pruefe(
    !/\d/.test(leerUmfang.text),
    `D: GEGENPROBE — ohne eigene Arbeit nennt sie KEINE Zahl ("${leerUmfang.text}")`
  )
  await seite.evaluate(() => document.getElementById('btnZurueckNein').dispatchEvent(new MouseEvent('click', { bubbles: true })))
  await seite.waitForTimeout(200)

  // Jetzt wirklich arbeiten: Moebel ziehen UND eine Wand verschieben.
  await werkzeug(seite, 'wzMove')
  for (let n = 0; n < 4; n++) {
    const k = await seite.evaluate(() =>
      window.__planerDatei.ausstattung().find((e) => e.quelle !== 'gesetzt' && e.bx > 330 && e.bx < 1270 && e.by > 230 && e.by < 810)
    )
    if (!k) break
    await ziehe(seite, k.bx, k.by, k.bx + 45, k.by + 45)
  }
  await werkzeug(seite, 'wzWand')
  const ecke = await freieEcke(seite)
  if (ecke) await ziehe(seite, ecke.bx, ecke.by, ecke.bx + 60, ecke.by + 70)
  await seite.waitForTimeout(1300)

  const vorher = await seite.evaluate(() => ({
    gesetzte: window.__planerDatei.gesetzte(),
    abweichung: window.__planerDatei.abweichung(),
    ecken: window.__planerDatei.zahlen().ecken
  }))
  pruefe(vorher.gesetzte === 4, `D: vier Stuecke sind frei gesetzt (${vorher.gesetzte})`)
  pruefe(vorher.abweichung.gesetzt > 0, `D: und mindestens eine Wand ist verschoben (${JSON.stringify(vorher.abweichung)})`)

  await seite.evaluate(() => document.getElementById('btnZurueck').dispatchEvent(new MouseEvent('click', { bubbles: true })))
  await seite.waitForTimeout(250)
  const umfang = await seite.evaluate(() => window.__planerDatei.zurueckFrageUmfang())
  log(`     Umfang: "${umfang}"`)
  pruefe(
    umfang.indexOf(String(vorher.gesetzte) + ' gesetzte Stücke') !== -1,
    `D: die Rueckfrage nennt die gesetzten Stuecke in ZAHLEN ("${umfang}")`
  )
  pruefe(
    umfang.indexOf('Wand') !== -1 || umfang.indexOf('Wände') !== -1,
    'D: und die veraenderten Waende ebenso'
  )
  await seite.screenshot({ path: path.join(BILDER, 'schutz-d1-umfang.png') })

  await seite.evaluate(() => document.getElementById('btnZurueckJa').dispatchEvent(new MouseEvent('click', { bubbles: true })))
  await seite.waitForTimeout(800)
  const danach = await seite.evaluate(() => ({
    gesetzte: window.__planerDatei.gesetzte(),
    abweichung: window.__planerDatei.abweichung(),
    kannZurueck: window.__planerDatei.kannZurueck(),
    sicherung: window.__planerDatei.sicherungBytes(),
    meldung: window.__planerDatei.meldungText()
  }))
  pruefe(
    danach.gesetzte === 0 && danach.abweichung.gesetzt === 0,
    `D: danach steht der gemessene Plan da (${JSON.stringify(danach.abweichung)})`
  )
  pruefe(
    danach.kannZurueck === false,
    'D: und Rueckgaengig ist abgeschaltet — genau darum braucht es die Sicherung'
  )
  pruefe(danach.sicherung > 1000, `D: der Stand von vorher liegt gesichert (${danach.sicherung} Bytes)`)
  pruefe(
    /zurückholen/i.test(String(danach.meldung)),
    `D: und die Meldungszeile BIETET ihn an ("${String(danach.meldung).slice(0, 100)}")`
  )
  await seite.screenshot({ path: path.join(BILDER, 'schutz-d2-meldung-bietet-an.png') })

  await seite.evaluate(() => document.getElementById('btnMeldung').dispatchEvent(new MouseEvent('click', { bubbles: true })))
  await seite.waitForTimeout(1000)
  const geholt = await seite.evaluate(() => ({
    gesetzte: window.__planerDatei.gesetzte(),
    abweichung: window.__planerDatei.abweichung(),
    ecken: window.__planerDatei.zahlen().ecken
  }))
  pruefe(
    geholt.gesetzte === vorher.gesetzte,
    `D: der Stand ist wieder da — ${geholt.gesetzte} gesetzte Stuecke (vorher ${vorher.gesetzte})`
  )
  pruefe(
    geholt.abweichung.gesetzt === vorher.abweichung.gesetzt,
    `D: samt der verschobenen Wand (${JSON.stringify(geholt.abweichung)})`
  )
  pruefe(geholt.ecken === vorher.ecken, `D: und mit derselben Eckenzahl (${geholt.ecken})`)
  pruefe(
    (await seite.evaluate(() => window.__planerDatei.sicherungBytes())) === 0,
    'D: die Sicherung ist danach verbraucht — kein Speicherplatz, den niemand mehr erreicht'
  )

  pruefe(konsole.length === 0, `D: keine Konsolen- oder Seitenfehler (${konsole.length}${konsole.length ? ': ' + konsole[0] : ''})`)
  await ctx.close()
}

/* ══════════════════════════════════════════════════════════════════════
   E — DIE WERKZEUGLEISTE SPRINGT NICHT (V7)
   f) Beim Werkzeugwechsel behalten die Knoepfe ihre Positionen — vorher und
      nachher GEMESSEN. GEGENPROBE: dieselbe Messung mit ausgebautem
      Platzhalter MUSS Bewegung finden, sonst misst das Gate nichts.
   ══════════════════════════════════════════════════════════════════════ */
if (laeuft('leiste')) {
  log('\n── E: die Werkzeugleiste springt nicht mehr (V7) ──')
  for (const masse of [{ width: 1600, height: 1000 }, { width: 390, height: 800 }]) {
    const ctx = await chromium.launchPersistentContext(path.join(DIR, 'leiste-' + masse.width), {
      viewport: masse
    })
    const konsole = []
    const seite = konsoleVon(await ctx.newPage(), konsole)
    await seite.goto(URL_HIER, { waitUntil: 'domcontentloaded' })
    await seite.waitForFunction(() => window.__bereit === true, { timeout: 30000 })
    await bearbeitenAn(seite)

    const positionen = () =>
      seite.evaluate(() => {
        const o = {}
        document.querySelectorAll('#werkzeuge button').forEach((b, i) => {
          const r = b.getBoundingClientRect()
          o[b.id || 'knopf' + i] = [Math.round(r.left), Math.round(r.top)]
        })
        return o
      })

    await werkzeug(seite, 'wzMove')
    const vor = await positionen()
    await werkzeug(seite, 'wzOeffnung')
    await seite.waitForTimeout(250)
    const nach = await positionen()

    let bewegt = 0
    let weiteste = 0
    for (const k of Object.keys(vor)) {
      if (!nach[k]) continue
      const d = Math.hypot(nach[k][0] - vor[k][0], nach[k][1] - vor[k][1])
      if (d > 0.5) {
        bewegt++
        weiteste = Math.max(weiteste, d)
      }
    }
    pruefe(
      bewegt === 0,
      `E (${masse.width} px): kein Knopf bewegt sich beim Werkzeugwechsel (${bewegt} von ${Object.keys(vor).length}, weiteste ${weiteste.toFixed(0)} px)`
    )

    /* Die Arten-Zeile ist trotzdem WIRKSAM geworden — sonst waere „nichts
       bewegt sich" ja auch dann wahr, wenn der Werkzeugwechsel gar nichts
       tut. */
    const arten = await seite.evaluate(() => {
      const e = document.getElementById('oeffnungsArten')
      return {
        sichtbar: e.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true }),
        breite: Math.round(e.getBoundingClientRect().width)
      }
    })
    pruefe(arten.sichtbar === true, `E (${masse.width} px): und die Oeffnungs-Arten sind wirklich da`)

    /* GEGENPROBE: den Platzhalter wieder ausbauen (wie vor V7) — DANN MUSS
       sich etwas bewegen. Ohne diese Probe koennte das Gate gruen sein, weil
       es die falschen Elemente misst. */
    await werkzeug(seite, 'wzMove')
    await seite.evaluate(() => {
      const e = document.getElementById('oeffnungsArten')
      e.classList.remove('platzhalter')
      e.hidden = true
    })
    await seite.waitForTimeout(200)
    const vorAlt = await positionen()
    await seite.evaluate(() => {
      const e = document.getElementById('oeffnungsArten')
      e.hidden = false
      e.inert = false
    })
    await seite.waitForTimeout(250)
    const nachAlt = await positionen()
    let bewegtAlt = 0
    let weitesteAlt = 0
    for (const k of Object.keys(vorAlt)) {
      if (!nachAlt[k]) continue
      const d = Math.hypot(nachAlt[k][0] - vorAlt[k][0], nachAlt[k][1] - vorAlt[k][1])
      if (d > 0.5) {
        bewegtAlt++
        weitesteAlt = Math.max(weitesteAlt, d)
      }
    }
    pruefe(
      bewegtAlt > 0,
      `E (${masse.width} px): GEGENPROBE — ohne Platzhalter bewegen sich ${bewegtAlt} Knoepfe um bis zu ${weitesteAlt.toFixed(0)} px`
    )
    await seite.screenshot({ path: path.join(BILDER, `schutz-e-leiste-${masse.width}.png`) })
    pruefe(konsole.length === 0, `E (${masse.width} px): keine Konsolen- oder Seitenfehler (${konsole.length}${konsole.length ? ': ' + konsole[0] : ''})`)
    await ctx.close()
  }
}

log('')
if (fehler.length) {
  log(`DURCHGEFALLEN — ${fehler.length} Pruefung(en):`)
  fehler.forEach((f) => log('  · ' + f))
  log(`\nStandbilder: ${BILDER}`)
  process.exit(1)
}
log(`BESTANDEN — alle Pruefungen gruen.`)
log(`Standbilder: ${BILDER}`)
process.exit(0)
