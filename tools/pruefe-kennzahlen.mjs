// Prueft RAUMBUCH, STUECKLISTE UND NORM-HINWEISE (W9).
//
//   node tools/pruefe-kennzahlen.mjs
// Exit 0 = alle Pruefungen bestanden, 1 = mindestens eine durchgefallen.
//
// OHNE BROWSER. `src/axo/axo-kennzahlen.js` ist reine Rechnung — kein Canvas,
// kein DOM. Damit laesst sich jede Zahl, die spaeter im Businessplan steht,
// hier nachrechnen, und zwar in Sekunden statt in einem gestarteten Chromium.
// Der Kern wird trotzdem nach node uebersetzt und der Plan durch
// `Floorplan.loadFloorplan` geschickt: die Plandatei fuehrt WEDER
// Wand-Kennungen NOCH Ausstattungs-Kennungen — beide entstehen erst beim Laden
// (`floorplan.ts:728` / `:865`). Wer die Datei direkt hineingibt, misst ein
// Raumbuch ohne Kennungen und haelt das Ergebnis fuer eine Aussage.
//
// JEDE PRUEFUNG HAT EINE GEGENPROBE. Ein Waechter, der nie rot werden kann, ist
// keiner — und bei ZAHLEN ist die Gefahr groesser als anderswo: eine Konstante
// sieht wie ein Messwert aus, solange man sie nur einmal abliest.
//   A  Flaeche unabhaengig gegengerechnet · Gegenprobe: Plan um 10 % gestaucht,
//      (Bounding-Box statt Gauss-Formel)     BEIDE Schaetzer MUESSEN 19 % fallen
//   B  Zuordnung Stueck -> Raum vollstaendig· Gegenprobe: ein Stueck +200 m,
//                                             „ausserhalb" MUSS 1 werden
//   C  Erschliessungszone == baueSzene      · Gegenprobe: ein einzelnes Viereck
//      (die einzige Doppelung dieser Datei)   hat gar keine — Index MUSS -1 sein
//   D  Jeder Hinweis: Ausloeser UND Nicht-  · Gegenproben: Tuer auf 1,00 m
//      Ausloeser, dazu die leere Liste im     schweigt, dasselbe Moebel als
//      Auslieferungszustand                   `gemessen` schweigt
//   E  Stueckliste + deutsche Namen         · Gegenprobe: erfundener Typ MUSS
//      (die Typ-Kette, Stelle 5)              als namenlos auffallen
//   F  Wandkanten eines Zyklus              · Gegenprobe: erfundener Zyklus
//                                             liefert nichts
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { uebersetzeKern, buendleKern, buendleThree, buendleAxo, AXO_MODULE, WURZEL } from './buendel-kern.mjs'
import { liesHoehen } from './lies-hoehen.mjs'

const arg = (name, standard) => {
  const i = process.argv.indexOf(name)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : standard
}
const PLAN_DATEI = path.join(WURZEL, 'app/public/plaene', `${arg('--plan', 'halle400')}.json`)
const DATEI = path.resolve(WURZEL, arg('--datei', 'Halle400-Modell.html'))
const MODUL = path.join(WURZEL, 'src/axo/axo-kennzahlen.js')

const fehler = []
const log = (s) => console.log(s)
const pruefe = (bedingung, text) => {
  log(`${bedingung ? 'OK  ' : 'FEHL'} ${text}`)
  if (!bedingung) fehler.push(text)
}
const kopie = (o) => JSON.parse(JSON.stringify(o))

const { baueRaumbuch, pruefeHinweise, wandKantenVon, WAND_DICKE_CM, LEGENDE_STUHLFLAECHE, FUSSZEILE } =
  await import(pathToFileURL(MODUL).href)
const { baueSzene } = await import(pathToFileURL(path.join(WURZEL, 'src/axo/axo-szene.js')).href)
const { leiteRaeumeAb } = await import(pathToFileURL(path.join(WURZEL, 'src/axo/axo-zyklen.js')).href)

/**
 * Die deutschen Namen aus `src/floorplanner/floorplanner.ts` — GELESEN, nicht
 * abgeschrieben. Genau wie `tools/lies-hoehen.mjs` es mit der Hoehen-Tabelle
 * tut und aus demselben Grund: eine Kopie waere still veraltet, sobald jemand
 * dort einen Namen aendert, und die Stueckliste hiesse dann etwas anderes als
 * die Loesch-Rueckfrage im Planer.
 */
function liesAusstattungNamen() {
  const quelle = fs.readFileSync(path.join(WURZEL, 'src/floorplanner/floorplanner.ts'), 'utf8')
  const block = quelle.match(/AUSSTATTUNG_NAME[^=]*=\s*\{([\s\S]*?)\n\}/)
  if (!block) throw new Error('AUSSTATTUNG_NAME in floorplanner.ts nicht gefunden — Abbruch.')
  const namen = {}
  for (const m of block[1].matchAll(/^\s*(\w+)\s*:\s*'([^']*)'\s*,?\s*$/gm)) namen[m[1]] = m[2]
  return namen
}

/* ══════════════════════════════════════════════════════════════════════
   VORPRUEFUNG · das Modul muss im BUENDEL stehen
   ══════════════════════════════════════════════════════════════════════
   Fehlt `axo-kennzahlen.js` in `AXO_MODULE`, ist das Raumbuch im Planer gruen
   und in der Doppelklick-Datei TOT — ohne Fehlermeldung, weil die Datei dann
   schlicht ein paar Funktionen weniger kennt. Geprueft wird deshalb nicht die
   Liste, sondern das ERGEBNIS des Buendelns: `buendleAxo()` nimmt jedem Modul
   die Import-Huelle ab und bricht bei Namenskollisionen ab. Was danach im Text
   steht, steht auch in der Datei. */
{
  log('═══ Vorpruefung · Buendel ═══')
  pruefe(
    AXO_MODULE.includes('axo-kennzahlen.js'),
    `axo-kennzahlen.js steht in AXO_MODULE (${AXO_MODULE.length} Module)`
  )
  pruefe(
    AXO_MODULE.indexOf('axo-zyklen.js') < AXO_MODULE.indexOf('axo-kennzahlen.js'),
    `axo-zyklen.js steht VOR axo-kennzahlen.js (Abhaengigkeitsreihenfolge)`
  )
  const imOrdner = fs
    .readdirSync(path.join(WURZEL, 'src/axo'))
    .filter((d) => d.endsWith('.js'))
    .sort()
  const fehlend = imOrdner.filter((d) => !AXO_MODULE.includes(d))
  pruefe(
    fehlend.length === 0,
    `Buendel vollstaendig gegen src/axo/${fehlend.length ? ' — ES FEHLEN: ' + fehlend.join(', ') : ''}`
  )
  const gebuendelt = buendleAxo()
  pruefe(
    gebuendelt.includes('function baueRaumbuch') &&
      gebuendelt.includes('function pruefeHinweise') &&
      gebuendelt.includes('function wandKantenVon'),
    `die drei Ausgaenge ueberstehen das Buendeln (Import-Huelle ab, kein Namenskonflikt)`
  )
  // Die Doppelklick-Datei nur pruefen, wenn sie AKTUELLER ist als das Modul —
  // sonst meldete dieses Gate den Bauzustand eines fremden Werkzeugs als
  // eigenen Fehler.
  if (fs.existsSync(DATEI) && fs.statSync(DATEI).mtimeMs >= fs.statSync(MODUL).mtimeMs) {
    pruefe(
      fs.readFileSync(DATEI, 'utf8').includes('function baueRaumbuch'),
      `die Doppelklick-Datei traegt die Rechnung wirklich in sich`
    )
  } else {
    log(`     (Halle400-Modell.html fehlt oder ist aelter als das Modul — nicht geprueft,`)
    log(`      neu bauen mit: node tools/baue-planer-datei.mjs)`)
  }
}

/* ══════════════════════════════════════════════════════════════════════
   DER PLAN — einmal durch den Kern
   ══════════════════════════════════════════════════════════════════════ */
log('\n═══ Plan durch den Kern (tsc) ═══')
const KERN_TEXT = `${buendleThree()}\n${buendleKern(uebersetzeKern())}`
const KERN = new Function(`${KERN_TEXT}\nreturn { Floorplan, AUSSTATTUNG_NAME };`)()
const NAMEN = liesAusstattungNamen()
const roh = JSON.parse(fs.readFileSync(PLAN_DATEI, 'utf8'))
const modell = new KERN.Floorplan()
modell.loadFloorplan(roh.floorplan)
const PLAN = { floorplan: modell.saveFloorplan(), labels: roh.labels || [] }
pruefe(
  PLAN.floorplan.walls.every((w) => !!w.id) && (PLAN.floorplan.ausstattung || []).every((el) => !!el.id),
  `nach dem Laden traegt jede der ${PLAN.floorplan.walls.length} Waende und jedes der ` +
    `${PLAN.floorplan.ausstattung.length} Stuecke eine Kennung`
)
// Die Anzeige-Welle braucht die deutschen Namen AUCH in der Doppelklick-Datei.
// Dort gibt es kein `import` — sie muessen also im gebuendelten Kern stehen.
pruefe(
  Object.keys(KERN.AUSSTATTUNG_NAME || {}).length === Object.keys(NAMEN).length,
  `AUSSTATTUNG_NAME steht im gebuendelten Kern (${Object.keys(KERN.AUSSTATTUNG_NAME || {}).length} Namen) ` +
    `— die Doppelklick-Datei kann sie hereingeben, ohne sie abzuschreiben`
)

const RB = baueRaumbuch(PLAN, { namen: NAMEN })
log(
  `     ${RB.summen.zyklen} Zyklen = ${RB.summen.raeume} Raeume + 1 Erschliessungszone · ` +
    `${RB.summen.stuecke} Stuecke · ${RB.summen.stuehle} Stuehle`
)

/* ══════════════════════════════════════════════════════════════════════
   A · FLAECHE UNABHAENGIG GEGENGERECHNET
   ══════════════════════════════════════════════════════════════════════
   24 der 25 Zyklen sind Vierecke mit achsparallelen Kanten. Fuer die ist die
   Flaeche (xmax-xmin)·(ymax-ymin) — eine Rechnung, die keine einzige Zeile mit
   `flaecheVon` (Gauss'sche Trapezformel) teilt. Stimmen beide ueberein, ist die
   Flaechenspalte des Raumbuchs kein Schreibfehler und keine Konstante. */
log('\n═══ A · Flaeche unabhaengig gegengerechnet ═══')
const ACHSTOLERANZ = 1e-6

function bboxFlaeche(punkte) {
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  for (const p of punkte) {
    x0 = Math.min(x0, p.x)
    x1 = Math.max(x1, p.x)
    y0 = Math.min(y0, p.y)
    y1 = Math.max(y1, p.y)
  }
  return ((x1 - x0) * (y1 - y0)) / 10000 // cm² -> m²
}

function istRechteckAchsparallel(punkte) {
  if (punkte.length !== 4) return false
  for (let i = 0; i < punkte.length; i++) {
    const a = punkte[i]
    const b = punkte[(i + 1) % punkte.length]
    if (Math.abs(a.x - b.x) > ACHSTOLERANZ && Math.abs(a.y - b.y) > ACHSTOLERANZ) return false
  }
  return true
}

const rechteckig = RB.raeume.filter((r) => istRechteckAchsparallel(r.punkte))
pruefe(
  rechteckig.length === 24,
  `A1 ${rechteckig.length} von ${RB.raeume.length} Zyklen sind viereckig und achsparallel (erwartet 24)`
)
let groessteAbweichung = 0
for (const r of rechteckig) {
  groessteAbweichung = Math.max(groessteAbweichung, Math.abs(bboxFlaeche(r.punkte) - r.flaeche))
}
pruefe(
  groessteAbweichung < 1e-6,
  `A2 Gauss-Formel == Bounding-Box bei allen ${rechteckig.length}: groesste Abweichung ` +
    `${groessteAbweichung.toExponential(2)} m²`
)

// GEGENPROBE DER GEGENPROBE: den ganzen Plan linear um 10 % stauchen. Eine
// Flaeche MUSS dann auf 81 % fallen — beide Schaetzer, jeder fuer sich. Bleibt
// eine Zahl stehen, ist sie keine Messung, sondern eine Konstante.
const gestaucht = kopie(PLAN)
for (const id of Object.keys(gestaucht.floorplan.corners)) {
  gestaucht.floorplan.corners[id].x *= 0.9
  gestaucht.floorplan.corners[id].y *= 0.9
}
const RB_KLEIN = baueRaumbuch(gestaucht, { namen: NAMEN })
pruefe(
  RB_KLEIN.raeume.length === RB.raeume.length &&
    RB_KLEIN.raeume.every((r, i) => r.ecken === RB.raeume[i].ecken),
  `A3 die Stauchung veraendert die Zyklen nicht, nur ihre Groesse (${RB_KLEIN.raeume.length} Zyklen)`
)
// Startwert ist der PERFEKTE Wert, nicht 1: gesucht ist die groesste Abweichung
// von 0,81, und mit 1 als Anfang bliebe sie fuer immer bei 1 stehen — das Gate
// meldete dann „0,00 % gefallen" fuer 25 Raeume, die alle richtig gefallen sind.
let schlechtestesVerhaeltnisGauss = 0.81
let schlechtestesVerhaeltnisBbox = 0.81
for (let i = 0; i < RB.raeume.length; i++) {
  const vG = RB_KLEIN.raeume[i].flaeche / RB.raeume[i].flaeche
  const vB = bboxFlaeche(RB_KLEIN.raeume[i].punkte) / bboxFlaeche(RB.raeume[i].punkte)
  if (Math.abs(vG - 0.81) > Math.abs(schlechtestesVerhaeltnisGauss - 0.81)) schlechtestesVerhaeltnisGauss = vG
  if (Math.abs(vB - 0.81) > Math.abs(schlechtestesVerhaeltnisBbox - 0.81)) schlechtestesVerhaeltnisBbox = vB
}
pruefe(
  Math.abs(schlechtestesVerhaeltnisGauss - 0.81) < 1e-9,
  `A4 GEGENPROBE: 10 % Stauchung senkt JEDE Gauss-Flaeche um ` +
    `${((1 - schlechtestesVerhaeltnisGauss) * 100).toFixed(2)} % (erwartet 19,00 %)`
)
pruefe(
  Math.abs(schlechtestesVerhaeltnisBbox - 0.81) < 1e-9,
  `A5 GEGENPROBE: und JEDE Bounding-Box-Flaeche ebenso um ` +
    `${((1 - schlechtestesVerhaeltnisBbox) * 100).toFixed(2)} %`
)
const flur = RB.raeume[RB.erschliessungIndex]
pruefe(
  flur && flur.ecken === 46 && Math.abs(flur.flaeche - 479.9) < 0.1,
  `A6 die Erschliessungszone: ${flur ? flur.ecken : '?'} Ecken, ` +
    `${flur ? flur.flaeche.toFixed(1) : '?'} m² (gemessen 46 / 479,9)`
)

/* ══════════════════════════════════════════════════════════════════════
   B · ZUORDNUNG VOLLSTAENDIG
   ══════════════════════════════════════════════════════════════════════
   Jedes Stueck landet in genau EINEM Topf: geschlossener Raum,
   Erschliessungszone oder ausserhalb. Geht die Summe nicht auf, faellt etwas
   zwischen die Toepfe — und in einer Stueckliste faellt genau das niemandem
   auf, weil eine zu kleine Zahl genauso plausibel aussieht wie die richtige. */
log('\n═══ B · Zuordnung vollstaendig ═══')
const s = RB.summen
pruefe(
  s.inRaeumen + s.inErschliessung + s.ausserhalb === s.stuecke,
  `B1 ${s.inRaeumen} in Raeumen + ${s.inErschliessung} in der Erschliessungszone + ` +
    `${s.ausserhalb} ausserhalb === ${s.stuecke} Stuecke`
)
pruefe(
  s.inRaeumen === 224 && s.inErschliessung === 65 && s.ausserhalb === 0,
  `B2 die gemessenen Zahlen: 224 / 65 / 0`
)
const summeJeRaum = RB.raeume.reduce((a, r) => a + r.stueckeGesamt, 0)
pruefe(
  summeJeRaum === s.inRaeumen + s.inErschliessung,
  `B3 die Histogramme der ${RB.raeume.length} Zyklen summieren sich auf dieselben ${summeJeRaum} Stuecke`
)
pruefe(
  s.namensAnker === 18 && s.ankerInRaeumen === 12,
  `B4 ${s.ankerInRaeumen} von ${s.namensAnker} Namens-Ankern liegen in einem geschlossenen Raum ` +
    `(erwartet 12 von 18, die uebrigen 6 in der Erschliessungszone)`
)

/* ── Jede Raumzeile braucht eine EINDEUTIGE Bezeichnung ──────────────────
   Die PDF beschriftet nur die Haelfte der Raeume. Die andere Haelfte bekommt
   ihren Ort als Namen — und wenn zwei davon gleich hiessen, nennte ein Hinweis
   zweimal denselben Raum, und der Nutzer suchte im falschen. */
const bezeichnungen = RB.raeume.map((r) => r.bezeichnung)
const ohneNamensAnker = RB.raeume.filter((r) => !r.istErschliessung && r.namensAnker.length === 0)
pruefe(
  new Set(bezeichnungen).size === bezeichnungen.length,
  `B7 alle ${bezeichnungen.length} Raumzeilen tragen eine EINDEUTIGE Bezeichnung ` +
    `(${ohneNamensAnker.length} davon ohne Anker in der PDF, benannt nach ihrem Ort)`
)
{
  // GEGENPROBE: zwei gleich grosse Raeume UEBEREINANDER, also auf derselben
  // x-Achse. Mit x allein hiessen beide gleich — genau der Fall, den es im
  // gemessenen Plan (55,62 m / 55,63 m) um einen Zentimeter nicht gibt.
  const uebereinander = {
    floorplan: {
      corners: {
        a: { x: 0, y: 0 },
        b: { x: 400, y: 0 },
        c: { x: 400, y: 300 },
        d: { x: 0, y: 300 },
        e: { x: 400, y: 600 },
        f: { x: 0, y: 600 }
      },
      walls: [
        { id: 'w1', corner1: 'a', corner2: 'b' },
        { id: 'w2', corner1: 'b', corner2: 'c' },
        { id: 'w3', corner1: 'c', corner2: 'd' },
        { id: 'w4', corner1: 'd', corner2: 'a' },
        { id: 'w5', corner1: 'c', corner2: 'e' },
        { id: 'w6', corner1: 'e', corner2: 'f' },
        { id: 'w7', corner1: 'f', corner2: 'd' }
      ],
      ausstattung: []
    },
    labels: []
  }
  const rb = baueRaumbuch(uebereinander, { namen: NAMEN })
  const b = rb.raeume.map((r) => r.bezeichnung)
  pruefe(
    b.length === 2 && b[0] !== b[1] && b.every((t) => t.includes('y =')),
    `B8 GEGENPROBE: zwei Raeume auf derselben x-Achse heissen verschieden ` +
      `(${b.join(' / ')})`
  )
}

// GEGENPROBE: EIN Stueck 200 m nach Osten. Es MUSS als „ausserhalb" auftauchen
// und dem Raum fehlen, in dem es vorher stand.
const verschoben = kopie(PLAN)
verschoben.floorplan.ausstattung[0].x += 20000
const RB_VERSCHOBEN = baueRaumbuch(verschoben, { namen: NAMEN })
pruefe(
  RB_VERSCHOBEN.summen.ausserhalb === 1 &&
    RB_VERSCHOBEN.summen.inRaeumen + RB_VERSCHOBEN.summen.inErschliessung === s.inRaeumen + s.inErschliessung - 1,
  `B5 GEGENPROBE: ein Stueck +200 m -> ausserhalb ${RB_VERSCHOBEN.summen.ausserhalb}, ` +
    `zugeordnet ${RB_VERSCHOBEN.summen.inRaeumen + RB_VERSCHOBEN.summen.inErschliessung} statt ` +
    `${s.inRaeumen + s.inErschliessung}`
)
pruefe(
  RB_VERSCHOBEN.summen.stuecke === s.stuecke,
  `B6 GEGENPROBE: die Stueckliste verliert es NICHT (${RB_VERSCHOBEN.summen.stuecke} Stuecke) — ` +
    `es wird gezeichnet und mitgezaehlt, es gehoert nur zu keinem Raum`
)

/* ══════════════════════════════════════════════════════════════════════
   C · DIE EINZIGE DOPPELUNG: DIE ERSCHLIESSUNGSZONE
   ══════════════════════════════════════════════════════════════════════
   `axo-szene.js` bestimmt sie fuer das BILD, `axo-kennzahlen.js` fuer die
   ZAHLEN — dieselbe Regel an zwei Stellen. Statt die Doppelung schoenzureden,
   wird sie hier gemessen: laufen die beiden auseinander, zeigt das Blatt einen
   anderen Flur als das Raumbuch, und niemand merkte es. */
log('\n═══ C · Erschliessungszone == baueSzene ═══')
const SZENE = baueSzene(PLAN, { wandDicke: WAND_DICKE_CM, hoehen: liesHoehen() })
pruefe(
  SZENE.flurIndex === RB.erschliessungIndex && RB.erschliessungIndex >= 0,
  `C1 flurIndex ${SZENE.flurIndex} === erschliessungIndex ${RB.erschliessungIndex}`
)
pruefe(
  SZENE.raeume.length === RB.raeume.length &&
    Math.abs(SZENE.raeume[SZENE.flurIndex].flaeche - RB.raeume[RB.erschliessungIndex].flaeche) < 1e-9,
  `C2 und es ist wirklich dieselbe Flaeche (${SZENE.raeume[SZENE.flurIndex].flaeche.toFixed(1)} m²), ` +
    `nicht nur derselbe Index`
)
// GEGENPROBE: ein einzelnes Viereck hat gar keine Erschliessungszone. Meldete
// die Regel auch dort eine, waere sie „nimm den ersten Zyklus" und keine Regel.
{
  const einzeln = {
    floorplan: {
      corners: { a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, c: { x: 400, y: 300 }, d: { x: 0, y: 300 } },
      walls: [
        { id: 'w1', corner1: 'a', corner2: 'b' },
        { id: 'w2', corner1: 'b', corner2: 'c' },
        { id: 'w3', corner1: 'c', corner2: 'd' },
        { id: 'w4', corner1: 'd', corner2: 'a' }
      ],
      ausstattung: []
    },
    labels: []
  }
  const rbEinzeln = baueRaumbuch(einzeln, { namen: NAMEN })
  pruefe(
    rbEinzeln.erschliessungIndex === -1 && rbEinzeln.raeume.length === 1,
    `C3 GEGENPROBE: ein einzelner Raum (4 Ecken) hat KEINE Erschliessungszone ` +
      `(Index ${rbEinzeln.erschliessungIndex}) und 12,0 m² ` +
      `(${rbEinzeln.raeume[0]?.flaeche.toFixed(1)})`
  )
  pruefe(
    Math.abs(rbEinzeln.raeume[0].flaeche - 12) < 1e-9,
    `C4 GEGENPROBE: 400 x 300 cm ergibt 12,0 m² — von Hand nachrechenbar`
  )
}

/* ══════════════════════════════════════════════════════════════════════
   D · DIE HINWEISE — Ausloeser UND Nicht-Ausloeser
   ══════════════════════════════════════════════════════════════════════ */
log('\n═══ D · Hinweise ═══')
const artenVon = (h) => h.map((x) => x.art).sort()
const HINWEISE_ROH = pruefeHinweise(PLAN, RB)
pruefe(
  HINWEISE_ROH.length === 0,
  `D1 im AUSLIEFERUNGSZUSTAND ist die Hinweisliste LEER (${HINWEISE_ROH.length}) — ` +
    `0 gesetzte Stuecke, 0 Oeffnungen, und das Aufmass wird nicht bewertet` +
    (HINWEISE_ROH.length ? `: ${artenVon(HINWEISE_ROH).join(', ')}` : '')
)

/** Der Plan mit gesetzten Oeffnungen — auf dem ECHTEN Weg des Modells. */
function planMitOeffnung(breite, art = 'tuer') {
  const raumMitWand = RB.raeume.find((r) => !r.istErschliessung && r.wandIds.length >= 3)
  const wandId = raumMitWand.wandIds[0]
  const m = new KERN.Floorplan()
  m.loadFloorplan(kopie(PLAN.floorplan))
  m.setzeOeffnungen([{ wandId, lage: 100, breite, art, seite: 1, anschlag: 'anfang' }])
  return { plan: { floorplan: m.saveFloorplan(), labels: PLAN.labels }, wandId, raum: raumMitWand }
}

// ── Tuerbreite ────────────────────────────────────────────────────────
{
  const { plan, raum } = planMitOeffnung(87.5)
  const rb = baueRaumbuch(plan, { namen: NAMEN })
  const h = pruefeHinweise(plan, rb)
  const tuer = h.find((x) => x.art === 'tuerbreite')
  pruefe(
    !!tuer && tuer.text.includes('0,88 m') && tuer.text.includes('ASR A2.3 Tabelle 1'),
    `D2 87,5 cm loesen den Tuerbreiten-Hinweis aus, mit Mass und Quelle im Text`
  )
  pruefe(
    !!tuer && tuer.text.includes(raum.bezeichnung) && tuer.betroffen.length === 1,
    `D3 der Hinweis nennt den Raum (‚${raum.bezeichnung}') und genau 1 Betroffenen`
  )
  pruefe(
    !!tuer && tuer.text.includes('Baurichtmaß, keine Fluchtweg-Auslegung'),
    `D4 und er sagt dazu, was er NICHT ist`
  )
}
{
  // GEGENPROBE: dieselbe Tuer auf 1,00 m gezogen — der Hinweis MUSS schweigen.
  const { plan } = planMitOeffnung(100)
  const rb = baueRaumbuch(plan, { namen: NAMEN })
  const h = pruefeHinweise(plan, rb)
  pruefe(
    !h.some((x) => x.art === 'tuerbreite'),
    `D5 GEGENPROBE: dieselbe Tuer mit 1,00 m loest KEINEN Hinweis aus`
  )
}

// ── Raum ohne Tuer ────────────────────────────────────────────────────
{
  const { plan, wandId, raum } = planMitOeffnung(100)
  const rb = baueRaumbuch(plan, { namen: NAMEN })
  const h = pruefeHinweise(plan, rb)
  const ohne = h.find((x) => x.art === 'raum-ohne-tuer')
  const mitTuer = rb.raeume.filter((r) => !r.istErschliessung && r.wandIds.includes(wandId))
  pruefe(
    !!ohne && ohne.betroffen.length === rb.summen.raeume - mitTuer.length,
    `D6 EINE gesetzte Tuer -> ${ohne ? ohne.betroffen.length : '?'} Raeume ohne Tuer ` +
      `(${rb.summen.raeume} Raeume minus ${mitTuer.length} an dieser Wand)`
  )
  pruefe(
    !!ohne && !ohne.betroffen.some((b) => b.text === raum.bezeichnung),
    `D7 und der Raum MIT der Tuer steht nicht darunter`
  )
  pruefe(
    !!ohne && ohne.text.includes('die PDF zeigt Wände, keine Türblätter'),
    `D8 der Text sagt, WAS gezaehlt wird und warum das Aufmass nichts beitraegt`
  )
}
pruefe(
  !HINWEISE_ROH.some((x) => x.art === 'raum-ohne-tuer'),
  `D9 GEGENPROBE: OHNE gesetzte Oeffnung schweigt „Raum ohne Tuer" — sonst meldete der ` +
    `Auslieferungszustand sofort alle ${RB.summen.raeume} Raeume`
)

// ── Moebel in einer Wand ──────────────────────────────────────────────
/** Unabhaengige Zaehlung: Abstand Punkt->Strecke, ohne eine Zeile des Moduls. */
function imWandbandZaehlen(plan, nurGesetzte) {
  const fp = plan.floorplan
  const strecken = fp.walls
    .map((w) => [fp.corners[w.corner1], fp.corners[w.corner2]])
    .filter(([a, b]) => a && b)
  const abstand = (p, a, b) => {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const l2 = dx * dx + dy * dy
    if (l2 < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y)
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2))
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
  }
  return (fp.ausstattung || []).filter(
    (el) =>
      (!nurGesetzte || el.quelle === 'gesetzt') &&
      strecken.some(([a, b]) => abstand({ x: el.x, y: el.y }, a, b) <= WAND_DICKE_CM / 2)
  )
}
const GEMESSEN_IN_WAND = imWandbandZaehlen(PLAN, false)
pruefe(
  GEMESSEN_IN_WAND.length === 4,
  `D10 unabhaengig gezaehlt liegen ${GEMESSEN_IN_WAND.length} GEMESSENE Stuecke im Wandband ` +
    `(erwartet 4: ${GEMESSEN_IN_WAND.map((e) => e.typ).join(', ')})`
)
pruefe(
  !HINWEISE_ROH.some((x) => x.art === 'moebel-in-wand'),
  `D11 DIE DOKTRIN: genau diese 4 werden NICHT gemeldet — sie sind das Aufmass`
)
{
  // AUSLOESER: dieselben 4 Stuecke auf `gesetzt` gekippt. Damit ist bewiesen,
  // dass nicht der Melder fehlt, sondern die Doktrin greift.
  const gekippt = kopie(PLAN)
  for (const el of gekippt.floorplan.ausstattung) {
    if (GEMESSEN_IN_WAND.some((g) => g.id === el.id)) el.quelle = 'gesetzt'
  }
  const rb = baueRaumbuch(gekippt, { namen: NAMEN })
  const h = pruefeHinweise(gekippt, rb)
  const inWand = h.find((x) => x.art === 'moebel-in-wand')
  pruefe(
    !!inWand && inWand.betroffen.length === 4,
    `D12 AUSLOESER: dieselben 4 als „gesetzt" -> Hinweis mit ${inWand ? inWand.betroffen.length : 0} Betroffenen`
  )
  pruefe(
    !!inWand && /\d,\d\d m/.test(inWand.text) && inWand.text.includes('Gemessene Stücke sind ausgenommen'),
    `D13 der Text nennt Typ und Ort in Metern und sagt die Ausnahme dazu`
  )
  pruefe(
    !!inWand && inWand.betroffen.every((b) => !!b.kennung),
    `D14 jeder Betroffene traegt seine Kennung — die Anzeige kann darauf zeigen`
  )
  pruefe(
    rb.summen.gesetzt === 4 && rb.summen.gemessen === RB.summen.stuecke - 4,
    `D15 die Stueckliste trennt sauber: ${rb.summen.gemessen} gemessen / ${rb.summen.gesetzt} gesetzt`
  )
}

// ── Moebel ausserhalb ─────────────────────────────────────────────────
{
  const raus = kopie(PLAN)
  raus.floorplan.ausstattung[0].x += 20000
  raus.floorplan.ausstattung[0].quelle = 'gesetzt'
  const rb = baueRaumbuch(raus, { namen: NAMEN })
  const h = pruefeHinweise(raus, rb)
  const drauss = h.find((x) => x.art === 'moebel-ausserhalb')
  pruefe(
    !!drauss && drauss.betroffen.length === 1 && drauss.text.includes('gehören aber zu keinem Raum'),
    `D16 AUSLOESER: ein gesetztes Stueck +200 m -> „ausserhalb"-Hinweis mit 1 Betroffenem`
  )
  // GEGENPROBE: dasselbe Stueck am selben Ort, aber `gemessen` -> Schweigen.
  const rausGemessen = kopie(raus)
  delete rausGemessen.floorplan.ausstattung[0].quelle
  const rb2 = baueRaumbuch(rausGemessen, { namen: NAMEN })
  const h2 = pruefeHinweise(rausGemessen, rb2)
  pruefe(
    !h2.some((x) => x.art === 'moebel-ausserhalb') && rb2.summen.ausserhalb === 1,
    `D17 GEGENPROBE: dasselbe Stueck als „gemessen" schweigt — obwohl das Raumbuch es ` +
      `weiterhin als ausserhalb fuehrt (${rb2.summen.ausserhalb})`
  )
}

// ── m² je Stuhl ist eine SPALTE, kein Hinweis ─────────────────────────
{
  const mitStuehlen = RB.raeume.filter((r) => r.flaecheJeStuhl !== null)
  const knapp = mitStuehlen.filter((r) => r.flaecheJeStuhl < 8)
  pruefe(
    mitStuehlen.length > 0 && RB.raeume.every((r) => (r.stuehle > 0) === (r.flaecheJeStuhl !== null)),
    `D18 „m² je Stuhl" steht in ${mitStuehlen.length} Raumzeilen und ist ` +
      `${RB.raeume.length - mitStuehlen.length}x null (kein Stuhl = keine Aussage, nicht 0)`
  )
  pruefe(
    knapp.length > 0 && HINWEISE_ROH.length === 0,
    `D19 DIE DOKTRIN: ${knapp.length} Raeume liegen unter 8 m² je Stuhl und erzeugen ` +
      `TROTZDEM keinen Hinweis — ein Konferenzstuhl ist kein Arbeitsplatz`
  )
  pruefe(
    LEGENDE_STUHLFLAECHE.includes('ASR A1.2') &&
      LEGENDE_STUHLFLAECHE.includes('8–10 m²') &&
      LEGENDE_STUHLFLAECHE.includes('zählt Stühle, nicht Arbeitsplätze'),
    `D20 der Vergleichswert steht stattdessen in der Legende — mit Quelle und mit seiner Grenze`
  )
  pruefe(
    FUSSZEILE.includes('DIN 277') && FUSSZEILE.includes('prüft dieses Werkzeug nicht'),
    `D21 die Fusszeile nennt das Bezugsmass der Flaechen und den Umfang des Werkzeugs`
  )
}

/* ══════════════════════════════════════════════════════════════════════
   E · STUECKLISTE UND DIE DEUTSCHEN NAMEN (Typ-Kette, Stelle 5)
   ══════════════════════════════════════════════════════════════════════ */
log('\n═══ E · Stueckliste + Namen ═══')
pruefe(
  RB.stueckliste.reduce((a, z) => a + z.gesamt, 0) === RB.summen.stuecke,
  `E1 die Stueckliste summiert sich auf ${RB.summen.stuecke} Stuecke ` +
    `(${RB.stueckliste.length} Arten)`
)
pruefe(
  RB.summen.gemessen === 289 && RB.summen.gesetzt === 0,
  `E2 gemessen ${RB.summen.gemessen} / gesetzt ${RB.summen.gesetzt} — der Auslieferungszustand`
)
const ohneNamen = RB.stueckliste.filter((z) => z.name === z.typ)
pruefe(
  ohneNamen.length === 0,
  `E3 jede der ${RB.stueckliste.length} Arten traegt ihren deutschen Namen aus AUSSTATTUNG_NAME` +
    (ohneNamen.length ? ` — ES FEHLEN: ${ohneNamen.map((z) => z.typ).join(', ')}` : '')
)
{
  // GEGENPROBE: ein erfundener Typ hat keinen Namen und MUSS auffallen. Sonst
  // stuende in der Stueckliste eines Tages „phantom" und niemand saehe es —
  // genau die Luecke, die die Typ-Kette an Stelle 5 schliesst.
  const mitPhantom = kopie(PLAN)
  mitPhantom.floorplan.ausstattung.push({
    id: 'phantom-1',
    typ: 'phantom',
    x: 1000,
    y: 500,
    breite: 50,
    tiefe: 50,
    drehung: 0
  })
  const rb = baueRaumbuch(mitPhantom, { namen: NAMEN })
  const z = rb.stueckliste.find((x) => x.typ === 'phantom')
  pruefe(
    !!z && z.name === 'phantom',
    `E4 GEGENPROBE: ein Typ ohne Eintrag steht mit seiner technischen Kennung da ` +
      `(sichtbar falsch statt still erfunden) und faellt bei E3 auf`
  )
}
{
  // GEGENPROBE zur Trennung gemessen/gesetzt.
  const einsGekippt = kopie(PLAN)
  einsGekippt.floorplan.ausstattung[0].quelle = 'gesetzt'
  const rb = baueRaumbuch(einsGekippt, { namen: NAMEN })
  pruefe(
    rb.summen.gemessen === 288 && rb.summen.gesetzt === 1,
    `E5 GEGENPROBE: EIN gekipptes Stueck -> ${rb.summen.gemessen} / ${rb.summen.gesetzt}`
  )
}

/* ══════════════════════════════════════════════════════════════════════
   F · WANDKANTEN EINES ZYKLUS
   ══════════════════════════════════════════════════════════════════════ */
log('\n═══ F · Wandkanten ═══')
const geschlossene = RB.raeume.filter((r) => !r.istErschliessung)
pruefe(
  geschlossene.every((r) => r.wandIds.length >= 3),
  `F1 jeder der ${geschlossene.length} Raeume kennt seine Waende ` +
    `(mindestens ${Math.min(...geschlossene.map((r) => r.wandIds.length))} je Raum)`
)
const alleWandIds = new Set(PLAN.floorplan.walls.map((w) => w.id))
pruefe(
  RB.raeume.every((r) => r.wandIds.every((id) => alleWandIds.has(id))),
  `F2 jede genannte Wand-Kennung gibt es wirklich im Grundriss (${alleWandIds.size} Waende)`
)
{
  // Die Zyklen NOCH EINMAL ableiten, diesmal im Gate: nur so liegen die
  // Ecken-KENNUNGEN vor, die `wandKantenVon` uebersetzt. Zugleich beweist der
  // Vergleich, dass die Wandkanten im Raumbuch wirklich zu genau diesem Zyklus
  // gehoeren und nicht zu einem um eins verrutschten.
  const zyklen = leiteRaeumeAb(PLAN.floorplan.corners, PLAN.floorplan.walls)
  pruefe(
    zyklen.length === RB.raeume.length &&
      zyklen.every(
        (z, i) => wandKantenVon(z, PLAN.floorplan.walls).join('|') === RB.raeume[i].wandIds.join('|')
      ),
    `F3 die Wandkanten im Raumbuch gehoeren zum jeweils richtigen Zyklus (alle ${zyklen.length})`
  )
  // GEGENPROBE 1: ein erfundener Zyklus aus Ecken, zwischen denen keine Wand
  // steht, liefert NICHTS. Ohne diese Probe koennte `wandKantenVon` schlicht
  // alle Waende zurueckgeben und saehe genauso richtig aus.
  const erfunden = [
    { id: 'gibt-es-nicht-1', x: 0, y: 0 },
    { id: 'gibt-es-nicht-2', x: 100, y: 0 },
    { id: 'gibt-es-nicht-3', x: 100, y: 100 }
  ]
  pruefe(
    wandKantenVon(erfunden, PLAN.floorplan.walls).length === 0,
    `F4 GEGENPROBE: ein Zyklus ohne echte Waende liefert 0 Kennungen`
  )
  // GEGENPROBE 2: nimmt man dem Grundriss EINE Wand weg, kennt genau der
  // betroffene Zyklus eine weniger — nicht null, nicht alle.
  const einZyklus = zyklen[RB.raeume.findIndex((r) => !r.istErschliessung)]
  const vorher = wandKantenVon(einZyklus, PLAN.floorplan.walls)
  const nachher = wandKantenVon(
    einZyklus,
    PLAN.floorplan.walls.filter((w) => w.id !== vorher[0])
  )
  pruefe(
    nachher.length === vorher.length - 1 && !nachher.includes(vorher[0]),
    `F5 GEGENPROBE: eine Wand weniger -> ${nachher.length} statt ${vorher.length} Kennungen`
  )
}

log(`\n${fehler.length ? `${fehler.length} PRUEFUNG(EN) DURCHGEFALLEN` : 'ALLE PRUEFUNGEN BESTANDEN'}`)
fehler.forEach((f) => log(`  · ${f}`))
process.exit(fehler.length ? 1 : 0)
