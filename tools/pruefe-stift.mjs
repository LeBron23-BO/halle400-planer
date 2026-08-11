// Prueft DIE WERKZEUG-SCHICHT DES STIFTS (W17) — `src/raum/wunsch-werkzeuge.js`.
//
//   node tools/pruefe-stift.mjs
//   Exit 0 = alle Pruefungen bestanden, 1 = mindestens eine durchgefallen.
//
// WORUM ES GEHT
// Diese Schicht ist das Einzige zwischen einem Sprachmodell und dem Grundriss.
// Sie wird nicht danach beurteilt, ob sie gute Ketten durchlaesst — das tut
// jede Funktion, die `true` zurueckgibt — sondern danach, ob sie schlechte
// AUFHAELT. Jede Pruefung hier hat darum eine Gegenprobe, und die Angriffs-
// werte sind keine erfundenen Sonderfaelle, sondern GEMESSENE Befunde aus der
// ausgelieferten Datei: `x=null` erzeugt NaN-Geometrie, `x=1e8` wirft
// RangeError, `x=1e12` friert den Tab 68 Sekunden ein.
//
// FUENF ABSCHNITTE:
//   A) Die bewachten Doppelungen (Typen, Nutzungen)
//   B) Zahlen — die gemessenen Angriffswerte
//   C) Der Ring: nur im umfahrenen Bereich
//   D) Das Aufmass: kein Anschluss an eine gemessene Ecke
//   E) Fail-closed: ein schlechter Schritt verwirft die GANZE Kette
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { WURZEL } from './buendel-kern.mjs'

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'h400-stift-'))
const BERICHT = path.join(DIR, 'bericht.txt')
fs.writeFileSync(BERICHT, '')
const log = (s) => {
  console.log(s)
  fs.appendFileSync(BERICHT, s + '\n')
}
const fehler = []
const pruefe = (bedingung, satz) => {
  log(`${bedingung ? 'OK  ' : 'FEHL'} ${satz}`)
  if (!bedingung) fehler.push(satz)
}

const W = await import(pathToFileURL(path.join(WURZEL, 'src/raum/wunsch-werkzeuge.js')).href)
const { WZ_TYPEN, WZ_NUTZUNGEN, WZ_OEFFNUNGEN, pruefeKette, wzZahl, wzImRing } = W

const RZ = await import(pathToFileURL(path.join(WURZEL, 'src/raum/raum-zusammenlegen.js')).href)
const { NUTZUNGEN } = RZ

/* ══════════════════ A · DIE BEWACHTEN DOPPELUNGEN ══════════════════ */
log('\n=== A · Typen und Nutzungen decken sich mit ihren Urfassungen ===')

// Gelesen wird der Quelltext, nicht eine nachgebaute Kopie — geprueft werden
// soll ja gerade, ob die Urfassung noch dasselbe sagt.
//
// Der Block traegt Kommentare mit Leerzeilen darin. Abgegrenzt wird deshalb an
// der naechsten `export`-Zeile, und gezaehlt werden NUR Zeilen der Form
// `| 'name'` — ein `'wc'` in einem Kommentar zaehlt sonst mit, und die Pruefung
// meldet 75 Arten statt 14 (gemessen beim ersten Lauf).
const FP = fs.readFileSync(path.join(WURZEL, 'src/model/floorplan.ts'), 'utf8')
const AB = FP.indexOf('export type AusstattungTyp')
const BIS = FP.indexOf('\nexport ', AB + 10)
const TYP_BLOCK = FP.slice(AB, BIS > 0 ? BIS : undefined)
const TYPEN_ECHT = [...TYP_BLOCK.matchAll(/^\s*\|\s*'([a-z]+)'/gm)].map((m) => m[1])

pruefe(TYPEN_ECHT.length > 0, `AusstattungTyp aus floorplan.ts gelesen (${TYPEN_ECHT.length} Arten)`)
pruefe(
  TYPEN_ECHT.length === WZ_TYPEN.length && TYPEN_ECHT.every((t) => WZ_TYPEN.includes(t)),
  `Die Typenliste der Werkzeug-Schicht deckt sich mit AusstattungTyp ` +
    `(hier ${WZ_TYPEN.length}, dort ${TYPEN_ECHT.length})`
)
// GEGENPROBE: derselbe Vergleich, angewandt auf eine verbogene Liste, MUSS
// die Abweichung finden. Ohne sie hiesse "gruen" nur, dass zwei Listen zufaellig
// gleich lang sind.
{
  const verbogen = WZ_TYPEN.filter((t) => t !== 'liege').concat(['dusche'])
  const deckt =
    TYPEN_ECHT.length === verbogen.length && TYPEN_ECHT.every((t) => verbogen.includes(t))
  pruefe(deckt === false, 'Gegenprobe: eine vertauschte Art wird vom selben Vergleich gefunden')
}
pruefe(!WZ_TYPEN.includes('dusche'), 'Es gibt KEINE Dusche — ein Badezimmer entsteht aus wc + waschbecken')

const NUTZ_ECHT = Object.keys(NUTZUNGEN)
pruefe(
  NUTZ_ECHT.length === WZ_NUTZUNGEN.length && NUTZ_ECHT.every((n) => WZ_NUTZUNGEN.includes(n)),
  `Die Nutzungsliste deckt sich mit NUTZUNGEN (${WZ_NUTZUNGEN.join(', ')})`
)

/* ══════════════════ B · ZAHLEN ══════════════════ */
log('\n=== B · Die gemessenen Angriffswerte kommen nicht durch ===')

const RING = [
  { x: 0, y: 0 },
  { x: 1000, y: 0 },
  { x: 1000, y: 600 },
  { x: 0, y: 600 }
]
const WELT = { ring: RING, waende: [], moebel: [], gemesseneEcken: [] }

const setz = (args) => ({ werkzeuge: [{ werkzeug: 'stueck_setzen', args }] })

pruefe(wzZahl(500) === 500, 'Eine normale Zahl geht durch')
for (const [wert, name] of [
  [null, 'null'],
  ['abc', 'Text'],
  ['300', 'Zahl als Text'],
  [NaN, 'NaN'],
  [Infinity, 'Infinity'],
  [1e8, '1e8 (wirft RangeError im Zeichner)'],
  [1e12, '1e12 (friert den Tab 68 s ein)']
]) {
  pruefe(wzZahl(wert) === null, `${name} wird abgelehnt`)
  const k = pruefeKette(setz({ typ: 'wc', x: wert, y: 100 }), WELT)
  pruefe(k.gueltig === false, `… und eine Kette mit ${name} als Koordinate ist ungueltig`)
}

// GEGENPROBE zur ganzen Gruppe: dieselbe Kette mit brauchbarer Zahl MUSS gueltig
// sein — sonst lehnt die Schicht schlicht alles ab und die Pruefungen oben
// waeren wertlos.
pruefe(
  pruefeKette(setz({ typ: 'wc', x: 100, y: 100 }), WELT).gueltig === true,
  'GEGENPROBE: mit brauchbarer Koordinate ist dieselbe Kette gueltig'
)

/* ══════════════════ C · DER RING ══════════════════ */
log('\n=== C · Nur im umfahrenen Bereich ===')

pruefe(wzImRing({ x: 500, y: 300 }, RING) === true, 'Ein Punkt in der Mitte liegt im Ring')
pruefe(wzImRing({ x: 1500, y: 300 }, RING) === false, 'Ein Punkt daneben liegt nicht im Ring')
pruefe(
  pruefeKette(setz({ typ: 'wc', x: 1500, y: 300 }), WELT).gueltig === false,
  'Ein Stueck ausserhalb des Bereichs wird abgelehnt — darum hat niemand gebeten'
)
pruefe(
  pruefeKette(setz({ typ: 'wc', x: 500, y: 300 }), WELT).gueltig === true,
  'GEGENPROBE: dasselbe Stueck innerhalb wird angenommen'
)

/* ══════════════════ D · DAS AUFMASS ══════════════════ */
log('\n=== D · Kein Anschluss an eine gemessene Ecke ===')

const MIT_ECKE = { ...WELT, gemesseneEcken: [{ x: 200, y: 200 }], fangToleranz: 20 }
const wand = (x1, y1, x2, y2) => ({
  werkzeuge: [{ werkzeug: 'wand_zeichnen', args: { x1, y1, x2, y2 } }]
})

const nah = pruefeKette(wand(205, 200, 800, 200), MIT_ECKE)
pruefe(
  nah.gueltig === false && /GEMESSENEN Ecke/.test(nah.grund),
  `Eine Wand, die 5 cm neben einer gemessenen Ecke endet, wird abgelehnt — ` +
    `sie wuerde sie absorbieren (grund: ${(nah.grund || '').slice(0, 50)}…)`
)
pruefe(
  pruefeKette(wand(400, 200, 800, 200), MIT_ECKE).gueltig === true,
  'GEGENPROBE: 200 cm entfernt ist dieselbe Wand in Ordnung'
)
pruefe(
  pruefeKette(wand(205, 200, 800, 200), WELT).gueltig === true,
  'GEGENPROBE 2: ohne gemessene Ecke in der Naehe ebenfalls in Ordnung — ' +
    'die Ablehnung kommt WIRKLICH von der Ecke'
)

// Ein gemessenes Stueck wird nicht auf Zuruf entfernt.
const MIT_MOEBEL = {
  ...WELT,
  moebel: [
    { id: 'm-gemessen', typ: 'stuhl', quelle: 'gemessen' },
    { id: 'm-gesetzt', typ: 'stuhl', quelle: 'gesetzt' }
  ]
}
const weg = (id) => ({ werkzeuge: [{ werkzeug: 'stueck_entfernen', args: { id } }] })
pruefe(
  pruefeKette(weg('m-gemessen'), MIT_MOEBEL).gueltig === false,
  'Ein GEMESSENES Stueck wird nicht auf Zuruf entfernt'
)
pruefe(
  pruefeKette(weg('m-gesetzt'), MIT_MOEBEL).gueltig === true,
  'GEGENPROBE: ein frei gesetztes Stueck darf weg'
)
pruefe(
  pruefeKette(weg('gibt-es-nicht'), MIT_MOEBEL).gueltig === false,
  'Ein Stueck, das es nicht gibt, wird abgelehnt statt still uebersprungen'
)

/* ══════════════════ E · FAIL-CLOSED ══════════════════ */
log('\n=== E · Ein schlechter Schritt verwirft die GANZE Kette ===')

const gemischt = {
  werkzeuge: [
    { werkzeug: 'stueck_setzen', args: { typ: 'wc', x: 100, y: 100 } },
    { werkzeug: 'stueck_setzen', args: { typ: 'waschbecken', x: 200, y: 100 } },
    { werkzeug: 'stueck_setzen', args: { typ: 'dusche', x: 300, y: 100 } }
  ]
}
const g = pruefeKette(gemischt, WELT)
pruefe(g.gueltig === false, 'Zwei gute und ein unbekannter Typ: die Kette faellt GANZ')
pruefe(
  Array.isArray(g.wirkung) && g.wirkung.length === 0,
  'Und es bleibt keine halbe Wirkung uebrig — halb ist schlimmer als gar nicht (W3)'
)
pruefe(/dusche/.test(g.grund || ''), `Der Grund nennt den Uebeltaeter ("${(g.grund || '').slice(0, 60)}…")`)

// GEGENPROBE: dieselbe Kette ohne den dritten Schritt MUSS durchgehen.
const zweiGut = { werkzeuge: gemischt.werkzeuge.slice(0, 2) }
const gg = pruefeKette(zweiGut, WELT)
pruefe(gg.gueltig === true && gg.wirkung.length === 2, 'GEGENPROBE: ohne ihn gehen beide durch')

// DIE GEPRUEFTE KETTE MUSS ZURUECKKOMMEN. Ohne sie hat die Bedienung eine
// Beschreibung und nichts zum Anwenden — gemessen meldete sie dann
// "Uebernommen - 0 Stueck hingestellt", also einen Erfolg ohne Wirkung.
pruefe(
  Array.isArray(gg.werkzeuge) && gg.werkzeuge.length === 2,
  `Die gepruefte Kette kommt mit zurueck (${gg.werkzeuge ? gg.werkzeuge.length : 'fehlt'} Schritte)`
)
pruefe(
  gg.werkzeuge && gg.werkzeuge[0] && gg.werkzeuge[0].werkzeug === 'stueck_setzen',
  '… und sie ist die Kette, die geprueft wurde (nicht eine andere)'
)
pruefe(
  pruefeKette(gemischt, WELT).werkzeuge === undefined,
  'GEGENPROBE: eine ABGELEHNTE Kette gibt keine Werkzeuge heraus'
)

// Leere und unsinnige Antworten
pruefe(pruefeKette(null, WELT).gueltig === false, 'Gar keine Antwort ist ungueltig')
pruefe(pruefeKette({}, WELT).gueltig === false, 'Eine Antwort ohne Werkzeuge ist ungueltig')
pruefe(
  pruefeKette({ werkzeuge: [] }, WELT).gueltig === false,
  'Eine leere Kette ist ungueltig — und sagt warum'
)
pruefe(
  pruefeKette({ werkzeuge: [{ werkzeug: 'rm_rf', args: {} }] }, WELT).gueltig === false,
  'Ein erfundenes Werkzeug wird abgelehnt'
)
pruefe(
  pruefeKette(
    { werkzeuge: Array.from({ length: 100 }, () => ({ werkzeug: 'stueck_setzen', args: { typ: 'wc', x: 1, y: 1 } })) },
    WELT
  ).gueltig === false,
  'Eine masslos lange Kette wird abgelehnt'
)

// Die ANNAHME kommt durch — sie ist der Satz, der eine geratene Zahl
// offenlegt. Und es gibt bewusst KEIN Feld fuer eine Norm.
const mitAnnahme = pruefeKette(
  { annahme: 'Fuer 20 Personen 2 WC und 2 Waschbecken angenommen.', werkzeuge: zweiGut.werkzeuge },
  WELT
)
pruefe(
  mitAnnahme.gueltig === true && /20 Personen/.test(mitAnnahme.annahme || ''),
  'Die Annahme des Modells kommt bei der Vorschau an'
)

/* ══════════════════ F · DIE BEDIENUNG, OHNE DAS MODELL ══════════════════
   Der Endpunkt wird hier durch eine FESTE Antwort ersetzt. Das ist kein
   Abkuerzen, sondern der Kern: ein Gate, das ein Sprachmodell befragt, misst
   das Modell — die Bedienung will aber wissen, ob SIE aus einer gueltigen
   Antwort die richtige Wirkung macht. Und es waere nicht wiederholbar:
   derselbe Wunsch liefert morgen andere Stellen.

   Gemessen wird am MODELL des Planers (`ausstattung().length`), nicht an der
   Meldung darueber — eine Meldung ist die Behauptung des Werkzeugs ueber sich
   selbst. */
log('\n=== F · Die Bedienung: Vorschau, Uebernehmen, EIN Rueckgaengig ===')
{
  const PW = process.env.PLAYWRIGHT_PFAD || 'file:///C:/Users/dania/.gemini/node_modules/playwright/index.js'
  const { chromium } = (await import(PW)).default
  const { werkstattAufschliessen } = await import(
    pathToFileURL(path.join(WURZEL, 'tools/werkstatt-auf.mjs')).href
  )

  const ANTWORT = {
    gueltig: true,
    grund: null,
    annahme: 'Fuer 20 Personen 2 WC und 2 Waschbecken angenommen.',
    wirkung: ['wc hinstellen', 'wc hinstellen', 'waschbecken hinstellen', 'waschbecken hinstellen'],
    werkzeuge: [
      { werkzeug: 'stueck_setzen', args: { typ: 'wc', x: 0, y: 0 } },
      { werkzeug: 'stueck_setzen', args: { typ: 'wc', x: 0, y: 0 } },
      { werkzeug: 'stueck_setzen', args: { typ: 'waschbecken', x: 0, y: 0 } },
      { werkzeug: 'stueck_setzen', args: { typ: 'waschbecken', x: 0, y: 0 } }
    ]
  }

  const browser = await chromium.launch()
  const seite = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  const seitenfehler = []
  seite.on('pageerror', (e) => seitenfehler.push(String(e)))

  // Die Datei wird unter http:// geladen — ueber eine abgefangene Route. Damit
  // ist `location.protocol` http, der Stift also ueberhaupt vorhanden, ohne
  // dass ein echter Server laufen muss.
  const DATEI = fs.readFileSync(path.join(WURZEL, 'Halle400-Modell.html'), 'utf8')
  await seite.route('**/*', async (route) => {
    const u = route.request().url()
    if (u.endsWith('/wunsch')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(ANTWORT)
      })
    }
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: DATEI })
  })

  await seite.goto('http://localhost:9977/', { waitUntil: 'domcontentloaded' })
  await seite.waitForFunction(() => window.__planerDatei, null, { timeout: 30000 })
  await werkstattAufschliessen(seite)
  await seite.evaluate(() => {
    for (const id of ['btnBearbeiten', 'btnAnsichtPlan']) {
      const k = document.getElementById(id)
      if (k) k.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    }
  })
  await seite.waitForTimeout(300)

  // Einen RAUM treffen. Der kleinste Treffer gewinnt (W13), und die Raum-Mitte
  // kann auf einer Wand liegen — deshalb wird gesucht statt geraten.
  const punkte = await seite.evaluate(() => window.__planerDatei.raumPunkte())
  let getroffen = false
  for (let i = 0; i < Math.min(punkte.length, 14); i++) {
    const z = punkte[i]
    await seite.mouse.move(z.bildX, z.bildY)
    await seite.mouse.down()
    await seite.mouse.up()
    await seite.waitForTimeout(200)
    const h = (await seite.evaluate(() => window.__planerDatei.menueEintraege())).map(
      (x) => x.handlung
    )
    if (h.includes('raum-wunsch')) {
      getroffen = true
      break
    }
    await seite.keyboard.press('Escape')
    await seite.waitForTimeout(90)
  }
  pruefe(getroffen, 'F1 der Wunsch-Eintrag steht im Raum-Menue (ueber http)')

  if (getroffen) {
    const vorher = await seite.evaluate(() => window.__planerDatei.ausstattung().length)
    await seite.evaluate(() => window.__planerDatei.menueWaehlen('raum-wunsch'))
    await seite.waitForTimeout(300)
    pruefe(
      await seite.evaluate(() => !document.getElementById('wunschFrage').hidden),
      'F2 das Eingabefeld erscheint'
    )

    await seite.fill('#wunschText', 'Badezimmer fuer 20 Personen')
    await seite.evaluate(() =>
      document.getElementById('btnWunschJa').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    )
    await seite.waitForFunction(() => !document.getElementById('wunschVorschau').hidden, null, {
      timeout: 20000
    })

    const waehrend = await seite.evaluate(() => window.__planerDatei.ausstattung().length)
    pruefe(waehrend === vorher, `F3 die VORSCHAU aendert nichts (${vorher} -> ${waehrend})`)
    pruefe(
      /angenommen/.test(
        await seite.evaluate(() => document.getElementById('wunschVorschauText').textContent)
      ),
      'F4 die Annahme steht in der Rueckfrage — die geschaetzte Zahl ist offengelegt'
    )

    await seite.evaluate(() =>
      document.getElementById('btnVorschauJa').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    )
    await seite.waitForTimeout(700)
    const nachher = await seite.evaluate(() => window.__planerDatei.ausstattung().length)
    pruefe(nachher === vorher + 4, `F5 Uebernehmen stellt die vier Stuecke hin (${vorher} -> ${nachher})`)

    await seite.keyboard.press('Control+z')
    await seite.waitForTimeout(600)
    const zurueck = await seite.evaluate(() => window.__planerDatei.ausstattung().length)
    pruefe(
      zurueck === vorher,
      `F6 EIN Rueckgaengig stellt genau den Stand von vorher her (${nachher} -> ${zurueck}) — ` +
        `nicht vier halbe Schritte`
    )
    // GEGENPROBE: ein zweites Rueckgaengig darf von DIESER Kette nichts mehr
    // wegnehmen — sonst waere sie doch in Einzelschritte zerfallen.
    await seite.keyboard.press('Control+z')
    await seite.waitForTimeout(500)
    const nochmal = await seite.evaluate(() => window.__planerDatei.ausstattung().length)
    pruefe(
      nochmal === zurueck,
      `F6-GEGENPROBE: ein zweites Rueckgaengig nimmt nichts weiteres von dieser Kette ` +
        `(${zurueck} -> ${nochmal})`
    )
  }

  pruefe(
    seitenfehler.length === 0,
    `F7 keine Seitenfehler (${seitenfehler.length}${seitenfehler.length ? ': ' + seitenfehler[0].slice(0, 120) : ''})`
  )
  await browser.close()
}

/* ══════════════════ ERGEBNIS ══════════════════ */
log('\n' + '='.repeat(64))
if (fehler.length === 0) {
  log(`BESTANDEN — alle Pruefungen gruen. Bericht: ${BERICHT}`)
  process.exit(0)
}
log(`DURCHGEFALLEN — ${fehler.length} Pruefung(en):`)
for (const f of fehler) log(`  - ${f}`)
log(`Bericht: ${BERICHT}`)
process.exit(1)
