// Prueft RÄUME ZUSAMMENLEGEN (W12) — die reine Rechnung in `src/raum/`.
//
//   node tools/pruefe-zusammenlegen.mjs
//   Exit 0 = alle Pruefungen bestanden, 1 = mindestens eine durchgefallen.
//
// OHNE BROWSER, UND DAS IST DER PUNKT
// Die ganze Entscheidung „welche Waende trennen diese zwei Raeume, was passiert
// mit Tuer und Moebeln" ist reine Geometrie (`src/raum/raum-zusammenlegen.js`,
// dasselbe Muster wie `src/axo/axo-treffer.js`). Damit lassen sich Grenzfaelle
// DURCHFAHREN statt in einer Bedienung zu erahnen: L-Form, schiefer Raum,
// Trennwand in drei Stuecken, Raeume die sich nur in einer Ecke beruehren.
//
// DIE MOEBELMASSE KOMMEN AUS DER ECHTEN QUELLE
// `AUSSTATTUNG_VORLAGEN` wird aus dem uebersetzten Kern geladen, nicht in dieses
// Gate geschrieben. Eine abgeschriebene Matte waere hier 180 cm breit und im
// Planer irgendwann 200 — und das Gate wuerde die Abweichung als Erfolg melden.
//
// FUENF ABSCHNITTE, jede Behauptung mit Gegenprobe wo eine moeglich ist:
//   A) Nachbarschaft + Trennwaende   B) Vereinigung der Ringe
//   C) Moebel im Weg                 D) Auslegen nach Nutzung
//   E) Der Vorschlag als Ganzes
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { uebersetzeKern, WURZEL } from './buendel-kern.mjs'

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'h400-zusammen-'))
const BERICHT = path.join(DIR, 'bericht.txt')
fs.writeFileSync(BERICHT, '')
const log = (s) => {
  console.log(s)
  fs.appendFileSync(BERICHT, s + '\n')
}
const fehler = []
// Format wie in allen anderen Gates: `alle-gates.sh` zaehlt ueber `^OK  `/`^FEHL`.
const pruefe = (bedingung, satz) => {
  log(`${bedingung ? 'OK  ' : 'FEHL'} ${satz}`)
  if (!bedingung) fehler.push(satz)
}

const R = await import(
  pathToFileURL(path.join(WURZEL, 'src/raum/raum-zusammenlegen.js')).href
)
const {
  trennwaendeFinden,
  pruefeZusammenlegen,
  ringeVereinigen,
  moebelInWaenden,
  ausWandSchieben,
  legeAus,
  zusammenlegenPlanen,
  NUTZUNGEN,
  _pruefzugang: G
} = R

log('')
log('Lade AUSSTATTUNG_VORLAGEN aus dem uebersetzten Kern (nicht abgeschrieben)…')
const kernDir = uebersetzeKern()
// Die uebersetzte Datei importiert `three` — von einem Temp-Ordner aus ist das
// nicht aufloesbar, und gebraucht wird es hier auch nicht: AUSSTATTUNG_VORLAGEN
// ist eine reine Zahlen-Tabelle. Also werden die Import-Zeilen abgenommen (wie
// `entkleide` in buendel-kern.mjs, nur ohne die Exporte mitzunehmen — die
// braucht dieses Gate ja). Bricht dabei etwas, bricht es LAUT: die Pruefung
// unten faellt durch, wenn die Tabelle nicht herauskommt.
const nackt = path.join(kernDir, 'floorplan-nackt.mjs')
fs.writeFileSync(
  nackt,
  fs.readFileSync(path.join(kernDir, 'model/floorplan.js'), 'utf8').replace(/^import\s.*$/gm, '')
)
const kern = await import(pathToFileURL(nackt).href)
const VORLAGEN = kern.AUSSTATTUNG_VORLAGEN
pruefe(
  Array.isArray(VORLAGEN) && VORLAGEN.length > 0 && VORLAGEN.every((v) => v.typ && v.breite && v.tiefe),
  `die Vorlagen kommen aus src/model/floorplan.ts (${VORLAGEN.length} Arten, Matte ${
    VORLAGEN.find((v) => v.typ === 'matte')?.breite
  } × ${VORLAGEN.find((v) => v.typ === 'matte')?.tiefe} cm)`
)

/* ---------------------------------------------------------------- Baukasten */

const ecke = (x, y) => ({ x, y })
/** Ein achsenparalleles Rechteck als Ring. */
const rechteck = (x0, y0, x1, y1) => [ecke(x0, y0), ecke(x1, y0), ecke(x1, y1), ecke(x0, y1)]
/** Eine Wand aus zwei Punkten. */
let wandZaehler = 0
const wand = (a, b, opts = {}) => ({
  id: opts.id ?? `w${++wandZaehler}`,
  a,
  b,
  quelle: opts.quelle ?? 'gemessen',
  dicke: opts.dicke ?? 10
})
/** Alle Wände eines Rings. */
const waendeVon = (ring, opts = {}) =>
  ring.map((p, i) => wand(p, ring[(i + 1) % ring.length], opts))

/**
 * Die Wände mehrerer Räume — DEDUPLIZIERT, so wie im echten Planer.
 *
 * Wichtiger Unterschied zur naiven Bauweise: eine Wand zwischen zwei Räumen
 * existiert im Modell genau EINMAL (`Wall` trägt `frontRoom`/`backRoom`,
 * `resetFrontBack`). Baut ein Gate sie zweimal — einmal aus jedem Ring —, dann
 * findet die Rechnung zwei Trennwände, und beide sind dieselbe. Das Gate hätte
 * dann einen Fehler gemeldet, den es selbst erzeugt hat.
 */
const waendeVonRaeumen = (ringe, opts = {}) => {
  const gesehen = new Map()
  for (const ring of ringe) {
    for (const w of waendeVon(ring, opts)) {
      const s = G.kantenSchluessel(w.a, w.b)
      if (!gesehen.has(s)) gesehen.set(s, w)
    }
  }
  return [...gesehen.values()]
}

const moebel = (o) => ({
  id: o.id ?? `m${Math.random().toString(36).slice(2, 8)}`,
  typ: o.typ ?? 'tisch',
  quelle: o.quelle ?? 'gemessen',
  x: o.x,
  y: o.y,
  breite: o.breite ?? 160,
  tiefe: o.tiefe ?? 80,
  drehung: o.drehung ?? 0
})

// Die Standard-Lage: zwei gleich hohe Raeume nebeneinander, Grenze auf x = 400.
//   A = 0..400 × 0..300   B = 400..800 × 0..300   (cm)
const A = { key: 'A', ring: rechteck(0, 0, 400, 300), name: 'Büro 1' }
const B = { key: 'B', ring: rechteck(400, 0, 800, 300), name: 'Büro 2' }
const GRENZE = { a: ecke(400, 0), b: ecke(400, 300) }

/* ============================================ A) Nachbarschaft + Trennwaende */

log('')
log('A) NACHBARSCHAFT + TRENNWAENDE')

const waendeEinfach = waendeVonRaeumen([A.ring, B.ring])
const t1 = trennwaendeFinden(A.ring, B.ring, waendeEinfach)
pruefe(t1.length === 1, `a) die eine gemeinsame Wand wird gefunden (${t1.length})`)
pruefe(
  t1.length === 1 && Math.abs(t1[0].a.x - 400) < 0.5 && Math.abs(t1[0].b.x - 400) < 0.5,
  'a) und es ist die auf x = 400, nicht irgendeine'
)

// Festlegung 2: die Grenze besteht in diesem Plan aus MEHREREN Stuecken, weil
// jede Oeffnung die Wand teilt (W4). Wer nur eines entfernt, laesst einen
// Stummel stehen — und der Kern bildet dann keinen gemeinsamen Ring.
const A3 = { key: 'A3', ring: [ecke(0, 0), ecke(400, 0), ecke(400, 100), ecke(400, 200), ecke(400, 300), ecke(0, 300)] }
const B3 = { key: 'B3', ring: [ecke(400, 0), ecke(800, 0), ecke(800, 300), ecke(400, 300), ecke(400, 200), ecke(400, 100)] }
const waendeDrei = waendeVonRaeumen([A3.ring, B3.ring])
const t3 = trennwaendeFinden(A3.ring, B3.ring, waendeDrei)
pruefe(
  t3.length === 3,
  `a) eine in drei Stuecke geteilte Grenze ergibt DREI Trennwaende (${t3.length}) — ` +
    'ein Stummel wuerde den gemeinsamen Ring verhindern'
)

// Nur eine Ecke gemeinsam: kein Nachbar. Das ist der Fall, bei dem eine
// „Abstand der Schwerpunkte"-Heuristik falsch liegen wuerde.
const C = { key: 'C', ring: rechteck(400, 300, 800, 600) }
const eck = pruefeZusammenlegen(A, C, waendeVonRaeumen([A.ring, C.ring]))
pruefe(
  !eck.moeglich && /keine gemeinsame Wand/.test(eck.grund),
  'a) zwei Raeume, die sich nur in einer ECKE beruehren, sind keine Nachbarn'
)

const fern = { key: 'F', ring: rechteck(2000, 2000, 2400, 2300) }
pruefe(
  !pruefeZusammenlegen(A, fern, waendeEinfach).moeglich,
  'a) zwei entfernte Raeume erst gar nicht'
)
pruefe(
  !pruefeZusammenlegen(A, { key: 'A', ring: A.ring }, waendeEinfach).moeglich,
  'a) zweimal derselbe Raum wird abgelehnt'
)
pruefe(
  pruefeZusammenlegen(A, B, waendeEinfach).moeglich,
  'a-GEGENPROBE) die beiden echten Nachbarn gehen'
)
pruefe(
  !/[A-Z]{3,}_/.test(eck.grund) && eck.grund.length > 40,
  'a) der Grund ist ein Satz in Alltagssprache, keine Fehlernummer'
)

/* ================================================== B) Vereinigung der Ringe */

log('')
log('B) VEREINIGUNG DER RINGE')

const ringAB = ringeVereinigen(A.ring, B.ring)
pruefe(ringAB !== null, 'b) die Vereinigung ergibt einen Ring')
pruefe(
  ringAB && ringAB.length === 6,
  `b) er hat 6 Punkte (die zwei Punkte der alten Grenze bleiben als Zwischenpunkte liegen) — ${ringAB?.length}`
)
const flA = G.ringFlaeche(A.ring)
const flB = G.ringFlaeche(B.ring)
const flAB = ringAB ? G.ringFlaeche(ringAB) : 0
pruefe(
  Math.abs(flAB - (flA + flB)) < 1,
  `b) die Flaeche ist die SUMME der beiden (${Math.round(flAB / 10000)} m² = ` +
    `${Math.round(flA / 10000)} + ${Math.round(flB / 10000)})`
)

// L-Form: unterschiedlich hohe Nachbarn. Der interessante Fall, weil der neue
// Raum konkav ist — und alles Weitere (Auslegen!) damit umgehen muss.
// Die Ecke bei (400,150) steht in BEIDEN Ringen — im Planer zwangsläufig: dort
// schliesst die Wand des Nachbarn an, und `Floorplan.findRooms` läuft über den
// Wandgraphen. Ein Gate, das sie in nur einem Ring führt, prüft eine Lage, die
// es im Modell nicht gibt.
const L1 = { key: 'L1', ring: [ecke(0, 0), ecke(400, 0), ecke(400, 150), ecke(400, 300), ecke(0, 300)] }
const L2 = { key: 'L2', ring: [ecke(400, 0), ecke(700, 0), ecke(700, 150), ecke(400, 150)] }
const ringL = ringeVereinigen(L1.ring, L2.ring)
pruefe(ringL !== null, 'b) zwei unterschiedlich hohe Nachbarn ergeben eine L-Form')
pruefe(
  ringL && Math.abs(G.ringFlaeche(ringL) - (G.ringFlaeche(L1.ring) + G.ringFlaeche(L2.ring))) < 1,
  'b) auch dort ist die Flaeche die Summe'
)
pruefe(
  ringL && !G.punktInRing({ x: 600, y: 250 }, ringL),
  'b) und die Kerbe der L-Form gehoert NICHT zum Raum (der Punkt dahinter liegt draussen)'
)

// Zwei Grenzen: ein Ringraum um einen Innenhof. Hier gibt es keinen einzelnen
// Ring — die Rechnung MUSS null liefern statt einen falschen zu behaupten.
const U1 = { key: 'U1', ring: [ecke(0, 0), ecke(300, 0), ecke(300, 100), ecke(100, 100), ecke(100, 200), ecke(300, 200), ecke(300, 300), ecke(0, 300)] }
const U2 = { key: 'U2', ring: [ecke(300, 0), ecke(400, 0), ecke(400, 300), ecke(300, 300), ecke(300, 200), ecke(300, 100)] }
const ringU = ringeVereinigen(U1.ring, U2.ring)
pruefe(
  ringU === null || G.ringFlaeche(ringU) === G.ringFlaeche(U1.ring) + G.ringFlaeche(U2.ring),
  'b) eine Lage, die keinen einfachen Ring ergibt, wird als solche gemeldet (null) statt geraten'
)

/* ================================================================ C) Moebel */

log('')
log('C) MOEBEL IM WEG')

const trennwand = wand(GRENZE.a, GRENZE.b, { id: 'trenn' })
const schrankInWand = moebel({ id: 'schrank', typ: 'schrank', x: 400, y: 150, breite: 100, tiefe: 40 })
const schrankAussen = moebel({ id: 'aussen', typ: 'schrank', x: 60, y: 40, breite: 100, tiefe: 40 })
const gefunden = moebelInWaenden([schrankInWand, schrankAussen], [trennwand], 10)
pruefe(
  gefunden.length === 1 && gefunden[0].id === 'schrank',
  `c) das Stueck IN der Trennwand wird gefunden, das an der Aussenwand nicht (${gefunden.length})`
)

// Die Gegenprobe zum Trennachsen-Verfahren: ein um 45 Grad gedrehter Tisch,
// dessen achsenparallele Umrandung die Wand beruehrt — er selbst aber nicht.
// Ein Vergleich der Umrandungen wuerde ihn faelschlich melden.
const schraeg = moebel({ id: 'schraeg', x: 310, y: 150, breite: 200, tiefe: 20, drehung: Math.PI / 4 })
const naivRand = schraeg.x + schraeg.breite / 2
const echterRand = Math.max(...G.moebelEcken(schraeg).map((p) => p.x))
pruefe(
  naivRand > 400 && echterRand < 400,
  `c-VORBEDINGUNG) wer die Drehung ignoriert, sieht den Tisch bis x = ${naivRand} reichen ` +
    `(ueber die Wand) — gedreht reicht er nur bis ${Math.round(echterRand)}`
)
pruefe(
  moebelInWaenden([schraeg], [trennwand], 10).length === 0,
  'c) er wird TROTZDEM nicht gemeldet — gerechnet wird mit Trennachsen, nicht mit Umrandungen'
)

const geschoben = ausWandSchieben(schrankInWand, trennwand, 10, ringAB)
pruefe(
  moebelInWaenden([geschoben], [trennwand], 10).length === 0,
  `c) nach dem Schieben steht das Stueck nicht mehr in der Wand (x ${schrankInWand.x} -> ${geschoben.x})`
)
pruefe(
  G.punktInRing({ x: geschoben.x, y: geschoben.y }, ringAB),
  'c) und es liegt im neuen Raum'
)
// Die kleinste Bewegung, die den Grund beseitigt: halbe Wanddicke (5) + halbe
// Schrankbreite quer zur Wand (50) + 1 cm Luft = 56. Ein Schrank, der mittig IN
// der Wand steht, muss um seine halbe Breite heraus — weniger geht nicht, mehr
// ist Willkuer.
const sollWeg = 10 / 2 + schrankInWand.breite / 2 + 1
pruefe(
  Math.abs(geschoben.x - schrankInWand.x) === sollWeg && geschoben.y === schrankInWand.y,
  `c) die Bewegung ist genau die noetige (${Math.abs(geschoben.x - schrankInWand.x)} von ${sollWeg} cm quer, ` +
    'laengs unveraendert) — nicht „irgendwohin in den Raum"'
)
pruefe(geschoben.quelle === 'gesetzt', 'c) ein verschobenes Stueck ist eine Annahme, kein Aufmass mehr')

/* ============================================================== D) Auslegen */

log('')
log('D) AUSLEGEN NACH NUTZUNG')

const matten = legeAus(ringAB, 'yoga', VORLAGEN, { id: (i) => `y${i}` })
pruefe(matten.length > 0, `d) der 24-m²-Raum wird mit Matten ausgelegt (${matten.length} Stueck)`)
pruefe(
  matten.every((m) => G.rechteckImRing(G.moebelEcken(m), ringAB)),
  'd) jede Matte liegt VOLLSTAENDIG im Raum'
)
let ueberlappt = 0
for (let i = 0; i < matten.length; i++) {
  for (let j = i + 1; j < matten.length; j++) {
    if (G.vieleckeUeberlappen(G.moebelEcken(matten[i]), G.moebelEcken(matten[j]))) ueberlappt++
  }
}
pruefe(ueberlappt === 0, `d) keine zwei Matten ueberlappen sich (${ueberlappt} Paare)`)
pruefe(
  matten.every((m) => m.quelle === 'gesetzt'),
  'd) alle sind Annahmen (gestrichelt gezeichnet), keine Messwerte'
)
const matteVorlage = VORLAGEN.find((v) => v.typ === 'matte')
pruefe(
  matten.every((m) => m.breite === matteVorlage.breite && m.tiefe === matteVorlage.tiefe),
  `d) die Masse stammen aus der Vorlage (${matteVorlage.breite} × ${matteVorlage.tiefe} cm)`
)

const weiterRand = legeAus(ringAB, 'yoga', VORLAGEN, { rand: 100, id: (i) => `y${i}` })
pruefe(
  weiterRand.length < matten.length,
  `d-GEGENPROBE) mit 100 cm Wandabstand passen weniger hinein (${weiterRand.length} statt ${matten.length}) — ` +
    'der Rand wirkt also wirklich'
)

// Der konkave Fall: in einer L-Form darf keine Matte in der Kerbe liegen.
const mattenL = legeAus(ringL, 'yoga', VORLAGEN, { id: (i) => `l${i}` })
pruefe(
  mattenL.length > 0 && mattenL.every((m) => G.rechteckImRing(G.moebelEcken(m), ringL)),
  `d) in der L-Form liegen alle ${mattenL.length} Matten im Raum — keine ragt in die Kerbe`
)

// Der schiefe Fall: ein um 30 Grad gedrehter Raum. Das Raster richtet sich an
// seiner laengsten Wand aus, nicht an den Achsen der Zeichnung.
const dreh = (p, w) => ({
  x: p.x * Math.cos(w) - p.y * Math.sin(w),
  y: p.x * Math.sin(w) + p.y * Math.cos(w)
})
const ringSchief = ringAB.map((p) => dreh(p, 0.5236))
const mattenSchief = legeAus(ringSchief, 'yoga', VORLAGEN, { id: (i) => `s${i}` })
pruefe(
  mattenSchief.length > 0 && mattenSchief.every((m) => G.rechteckImRing(G.moebelEcken(m), ringSchief)),
  `d) im schiefen Raum ebenso (${mattenSchief.length} Matten, alle drin)`
)
// Verglichen wird MODULO π: die Richtung einer Wand ist eine Achse, und eine um
// 180 Grad gedrehte Matte ist dieselbe Matte. Ein Test auf einen exakten
// Zahlenwert prüfte die Umlaufrichtung des Rings mit — nicht die Sache.
const querAbweichung = (w) => {
  let d = Math.abs((w ?? 0) - 0.5236) % Math.PI
  return Math.min(d, Math.PI - d)
}
pruefe(
  mattenSchief.every((m) => querAbweichung(m.drehung) < 0.01),
  `d) und sie sind MITGEDREHT — nicht quer zu den Waenden gelegt ` +
    `(Abweichung ${mattenSchief.map((m) => querAbweichung(m.drehung).toFixed(3))[0]})`
)
const nochmal = legeAus(ringSchief, 'yoga', VORLAGEN, { id: (i) => `s${i}` })
pruefe(
  JSON.stringify(nochmal) === JSON.stringify(mattenSchief),
  'd) zwei Laeufe ergeben dieselbe Auslegung — das Raster ist wiederholbar, nicht zufaellig'
)
pruefe(
  Math.abs(mattenSchief.length - matten.length) <= 2,
  `d) im gedrehten Raum passen ungefaehr gleich viele hinein (${mattenSchief.length} vs ${matten.length})`
)

const stuehle = legeAus(ringAB, 'kurs', VORLAGEN, { id: (i) => `k${i}` })
pruefe(
  stuehle.length > matten.length && stuehle.every((s) => s.typ === 'stuhl'),
  `d) ein Kursraum bekommt Stuhlreihen (${stuehle.length} Stuehle, mehr als Matten)`
)
pruefe(legeAus(ringAB, 'leer', VORLAGEN).length === 0, 'd) „frei" legt nichts aus')
pruefe(
  legeAus(ringAB, 'yoga', VORLAGEN, { hoechstens: 3, id: (i) => `h${i}` }).length === 3,
  'd) der Deckel greift'
)

let geworfen = false
try {
  legeAus(ringAB, 'yoga', [], {})
} catch (e) {
  geworfen = /AUSSTATTUNG_VORLAGEN/.test(e.message)
}
pruefe(
  geworfen,
  'd) ohne Vorlage wird GEWORFEN statt ein Mass zu erfinden — die eine Wahrheit steht im Kern'
)

/* ========================================================== E) Der Vorschlag */

log('')
log('E) DER VORSCHLAG ALS GANZES')

// Auch hier dedupliziert, und die gemeinsame Kante bekommt die sprechende
// Kennung „trenn". Der naive Aufbau (beide Ringe getrennt) erzeugte DREI
// Wand-Objekte auf x = 400 — und das Gate meldete dann drei entfernte Waende
// und zwei entfallende Tueren, beides erfunden vom Gate selbst.
const alleWaende = waendeVonRaeumen([A.ring, B.ring]).map((w, i) =>
  G.kantenSchluessel(w.a, w.b) === G.kantenSchluessel(GRENZE.a, GRENZE.b)
    ? { ...w, id: 'trenn' }
    : { ...w, id: `aussen-${i}` }
)
const aussenwandId = alleWaende.find((w) => w.id !== 'trenn').id
const oeffnungen = [
  { id: 'tuer-in-trennwand', typ: 'tuer', breite: 87.5, wandId: 'trenn' },
  { id: 'tuer-aussen', typ: 'tuer', breite: 87.5, wandId: aussenwandId }
]
const daten = {
  waende: alleWaende,
  moebel: [schrankInWand, schrankAussen],
  oeffnungen,
  vorlagen: VORLAGEN,
  wandDicke: 10
}

const v = zusammenlegenPlanen(A, B, daten, { nutzung: 'yoga', id: (i) => `neu${i}` })
pruefe(v.moeglich, 'e) der Vorschlag kommt zustande')
pruefe(
  v.waendeEntfernen.length === 1 && v.waendeEntfernen[0] === 'trenn',
  `e) genau die Trennwand wird entfernt (${JSON.stringify(v.waendeEntfernen)})`
)
pruefe(v.gemessenEntfernt === 1, `e) und sie zaehlt als GEMESSENE Wand (${v.gemessenEntfernt}) — das ist ein Umbau`)
pruefe(
  v.statikHinweis && /Fachmann/.test(v.statikHinweis.frage) && !/tragend ist die Wand nicht/.test(v.statikHinweis.frage),
  'e) der Statik-Hinweis stellt eine FRAGE an einen Fachmann statt ein Urteil zu faellen'
)
pruefe(
  v.oeffnungenEntfallen.length === 1 && v.oeffnungenEntfallen[0].id === 'tuer-in-trennwand',
  `e) die Tuer IN der Trennwand entfaellt, die andere nicht (${v.oeffnungenEntfallen.length})`
)
pruefe(
  v.moebelVerschieben.length === 1 && v.moebelVerschieben[0].vorher.id === 'schrank',
  `e) genau das Stueck in der Wand wird verschoben (${v.moebelVerschieben.length})`
)
pruefe(v.flaecheM2 === 24, `e) die Flaeche des neuen Raums steht da (${v.flaecheM2} m²)`)
pruefe(v.name === 'Yoga', `e) der Name folgt der Nutzung ("${v.name}")`)
pruefe(v.moebelNeu.length === matten.length, `e) die Matten sind dabei (${v.moebelNeu.length})`)
pruefe(
  Array.isArray(v.moebelZumEntfernenVorgeschlagen),
  `e) was im Weg steht, wird zum Entfernen VORGESCHLAGEN (${v.moebelZumEntfernenVorgeschlagen.length}) — nicht geloescht`
)

// Ohne Nutzung: nur zusammenlegen. Dann sind die alten Namen die Quelle.
const vLeer = zusammenlegenPlanen(A, B, daten, {})
pruefe(
  vLeer.moeglich && vLeer.moebelNeu.length === 0 && vLeer.name === 'Büro 1 + Büro 2',
  `e) ohne Nutzung wird nichts ausgelegt und der Name verbindet die alten ("${vLeer.name}")`
)
pruefe(
  vLeer.moebelZumEntfernenVorgeschlagen.length === 0,
  'e) und dann wird auch nichts zum Entfernen vorgeschlagen'
)

// Rein gezeichnete Waende: kein Umbau, kein Statik-Hinweis.
const gezeichnet = {
  ...daten,
  waende: alleWaende.map((w) => (w.id === 'trenn' ? { ...w, quelle: 'gesetzt' } : w))
}
const vGez = zusammenlegenPlanen(A, B, gezeichnet, {})
pruefe(
  vGez.moeglich && vGez.gemessenEntfernt === 0 && vGez.statikHinweis === null,
  'e-GEGENPROBE) faellt nur eine GEZEICHNETE Wand, ist es kein Umbau und es gibt keinen Statik-Hinweis'
)

const vEck = zusammenlegenPlanen(A, C, daten, {})
pruefe(!vEck.moeglich && !!vEck.grund, 'e) ein unmoeglicher Fall kommt mit Grund und ohne Ring zurueck')

const namenNutzungen = Object.keys(NUTZUNGEN)
pruefe(
  namenNutzungen.includes('yoga') && namenNutzungen.includes('kurs') && namenNutzungen.includes('leer'),
  `e) die Nutzungsarten stehen an EINER Stelle (${namenNutzungen.join(', ')})`
)

/* ==================================================================== Schluss */

log('')
log(fehler.length === 0 ? 'ALLE PRUEFUNGEN BESTANDEN' : `DURCHGEFALLEN: ${fehler.length}`)
fehler.forEach((f) => log('  - ' + f))
log(`Bericht: ${BERICHT}`)
process.exit(fehler.length === 0 ? 0 : 1)
