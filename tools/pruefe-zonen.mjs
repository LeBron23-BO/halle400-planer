// PRUEFE-ZONEN (W19) — die Zuordnungs-Schicht des offenen Bereichs.
//
//   node tools/pruefe-zonen.mjs
//
// WAS HIER AUF DEM SPIEL STEHT
// Die Zonen sind der Ersatz fuer Waende, die es nicht gibt. Genau deshalb sind
// sie die gefaehrlichste Datei des Projekts: sie sehen aus wie eine Messung,
// sind aber eine Kuration. Ein stiller Fehler hier faellt niemandem auf — eine
// Stueckzahl, die um drei danebenliegt, sieht genauso plausibel aus wie die
// richtige. Deshalb hat hier JEDE Zusicherung eine Gegenprobe, die beweist,
// dass der Waechter ueberhaupt ausloesen KANN.
//
// Die wichtigste Zusicherung ist A1: die Zonen aendern am Grundriss nichts.
// Wer sie je in den Export haengt, hat aus einer Zuordnung eine erfundene Wand
// gemacht — und damit das oberste Prinzip des Projekts gebrochen.
import fs from 'node:fs'
import path from 'node:path'
import { uebersetzeKern, buendleKern, buendleThree, WURZEL } from './buendel-kern.mjs'
import { ladeZonen, ordneZu, inZone } from './zonen.mjs'

let fehler = 0
const log = (s) => console.log(s)
function pruefe(bedingung, text) {
  if (bedingung) log(`OK   ${text}`)
  else {
    log(`FEHL ${text}`)
    fehler++
  }
}

const KERN = new Function(`${buendleThree()}\n${buendleKern(uebersetzeKern())}\nreturn { Floorplan };`)()
const roh = JSON.parse(fs.readFileSync(path.join(WURZEL, 'app/public/plaene/halle400.json'), 'utf8'))
const modell = new KERN.Floorplan()
modell.loadFloorplan(roh.floorplan || roh)
const stuecke = modell.getAusstattung()
const geo = JSON.parse(fs.readFileSync(path.join(WURZEL, 'data/plan-geometry.json'), 'utf8'))
const { zonen, flurachsen } = ladeZonen(WURZEL)

function imRing(p, ring) {
  let drin = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if ((a.y > p.y) !== (b.y > p.y)) {
      const x = ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
      if (p.x < x) drin = !drin
    }
  }
  return drin
}
function flaeche(ring) {
  let s = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) s += (ring[j].x + ring[i].x) * (ring[j].y - ring[i].y)
  return Math.abs(s / 2)
}
const offenRing = modell
  .getRooms()
  .map((r) => r.corners.map((c) => ({ x: c.x, y: c.y })))
  .sort((a, b) => flaeche(b) - flaeche(a))[0]
const imOffenen = stuecke.filter((s) => imRing({ x: s.x, y: s.y }, offenRing))

/* ═══ A · DIE ZONEN BAUEN NICHTS ═══════════════════════════════════════════ */
log('\n═══ A · die Zonen bauen nichts ═══')
// Wer data/zonen.json liest, entscheidet, ob sie Zuordnung bleibt oder Geometrie
// wird. Erlaubt sind Auswertungs-Werkzeuge. Verboten ist JEDE Kette, die den
// Grundriss, den Export oder die ausgelieferte Datei erzeugt.
const VERBOTEN = [
  'tools/export_blueprint.py',
  'tools/build_walls.py',
  'tools/baue-planer-datei.mjs',
  'tools/uebernimm-bearbeitung.py'
]
const leser = VERBOTEN.filter((rel) => {
  const p = path.join(WURZEL, rel)
  return fs.existsSync(p) && fs.readFileSync(p, 'utf8').includes('zonen.json')
})
pruefe(
  leser.length === 0,
  `A1 keine bauende Kette liest zonen.json (geprueft: ${VERBOTEN.length} Dateien)` +
    (leser.length ? ` — GELESEN VON: ${leser.join(', ')}` : '')
)
pruefe(
  fs.readFileSync(path.join(WURZEL, 'tools/raum-inventar.mjs'), 'utf8').includes('zonen.mjs'),
  `A1b die Auswertung liest sie sehr wohl — sonst waere die Schicht gebaut und unbenutzt`
)
// GEGENPROBE zu A1: der Test muss einen Leser auch WIRKLICH finden koennen.
const selbstText = fs.readFileSync(path.join(WURZEL, 'tools/pruefe-zonen.mjs'), 'utf8')
pruefe(
  selbstText.includes('zonen.json'),
  `A1-GEGENPROBE: dieselbe Suche findet 'zonen.json' in dieser Datei — sie kann also treffen`
)

/* ═══ B · JEDES STUECK LANDET IN GENAU EINER ZONE ══════════════════════════ */
log('\n═══ B · jedes Stueck landet in genau einer Zone ═══')
const { jeZone, ohneZone, mehrdeutig } = ordneZu(imOffenen, zonen)
pruefe(
  ohneZone.length === 0,
  `B1 kein Stueck faellt durch (${imOffenen.length} im offenen Bereich, ${ohneZone.length} ohne Zone` +
    (ohneZone.length ? `: ${ohneZone.map((s) => `${s.typ}@${(s.x / 100).toFixed(2)}m`).join(', ')}` : '') +
    ')'
)
pruefe(
  mehrdeutig.length === 0,
  `B2 keine zwei Zonen ueberlappen (${mehrdeutig.length} mehrdeutig)`
)
const summe = zonen.reduce((s, z) => s + jeZone.get(z.name).length, 0)
pruefe(summe === imOffenen.length, `B3 die Zonen summieren sich auf ${summe} von ${imOffenen.length} Stuecken`)
for (const z of zonen) {
  pruefe(
    jeZone.get(z.name).length === z.gemessen_stuecke,
    `B4 ${z.name}: ${jeZone.get(z.name).length} Stueck (gemessen war ${z.gemessen_stuecke})`
  )
}

// GEGENPROBE zu B1: eine ganze Zone wegnehmen — ihre Stuecke MUESSEN dann
// durchfallen. Ohne diese Probe waere B1 gruen, auch wenn `ordneZu` in
// Wahrheit alles kommentarlos der ersten Zone gaebe.
//
// Zuerst stand hier eine um 1 m verschobene Zonengrenze. Sie lief gruen durch
// die Zuordnung und ROT durch dieses Gate: zwischen 10,99 m (Grenze) und
// 12,60 m (westlichstes Stueck) liegen 1,61 m Luft, ein Meter Verschiebung
// traf also nichts. Der Waechter war in Ordnung, die Probe war zu schwach —
// und eine zu schwache Gegenprobe ist genau der Placebo, den sie verhindern
// soll. Eine fehlende Zone kann dagegen nie folgenlos bleiben.
const ohneKueche = zonen.filter((z) => !z.name.includes('Teamtable'))
const probeB1 = ordneZu(imOffenen, ohneKueche)
pruefe(
  probeB1.ohneZone.length === jeZone.get('Kueche / Teamtable').length && probeB1.ohneZone.length > 0,
  `B1-GEGENPROBE: ohne die Zone "Kueche / Teamtable" fallen genau ihre ` +
    `${probeB1.ohneZone.length} Stuecke durch`
)
// GEGENPROBE zu B2: zwei Zonen absichtlich ueberlappen lassen.
const doppelt = JSON.parse(JSON.stringify(zonen))
const empfang = doppelt.find((z) => z.name === 'Empfang')
empfang.x[0] -= 3.0
const probeB2 = ordneZu(imOffenen, doppelt)
pruefe(
  probeB2.mehrdeutig.length > 0,
  `B2-GEGENPROBE: zwei ueberlappende Zonen ergeben ${probeB2.mehrdeutig.length} mehrdeutige Stueck(e)`
)

/* ═══ C · KEINE ZONE GREIFT IN EINEN GESCHLOSSENEN RAUM ════════════════════ */
log('\n═══ C · keine Zone greift in einen geschlossenen Raum ═══')
// Der scharfe Test: von ALLEN 289 Stuecken duerfen nur die im offenen Bereich
// in eine Zone fallen. Ein Rechteck, das ueber eine echte Wand hinausragt,
// zoege sonst fremde Moebel in eine Zone — und niemand saehe es.
const fremde = stuecke.filter(
  (s) => !imRing({ x: s.x, y: s.y }, offenRing) && zonen.some((z) => inZone(s.x / 100, s.y / 100, z))
)
pruefe(
  fremde.length === 0,
  `C1 von ${stuecke.length} Stuecken faellt keines aus einem geschlossenen Raum in eine Zone` +
    (fremde.length ? ` — ${fremde.map((s) => `${s.typ}@${(s.x / 100).toFixed(2)}m`).join(', ')}` : '')
)
// GEGENPROBE zu C1: eine Zone absichtlich nach Osten aufziehen MUSS fremde
// Stuecke einfangen.
const gross = JSON.parse(JSON.stringify(zonen))
gross.find((z) => z.name === 'Empfang').x[1] = 30.0
const fremdeProbe = stuecke.filter(
  (s) => !imRing({ x: s.x, y: s.y }, offenRing) && gross.some((z) => inZone(s.x / 100, s.y / 100, z))
)
pruefe(
  fremdeProbe.length > 0,
  `C1-GEGENPROBE: eine bis 30 m aufgezogene Zone faengt ${fremdeProbe.length} fremde Stueck(e) ein`
)

/* ═══ D · JEDE ZONE MIT NAMEN TRAEGT IHREN ANKER WIRKLICH ══════════════════ */
log('\n═══ D · jede Zone mit Namen traegt ihren Anker wirklich ═══')
for (const z of zonen.filter((z) => z.anker)) {
  const treffer = geo.beschriftungen.filter(
    (b) => b.text === z.anker && inZone(b.anker_x_m, b.anker_y_m, z)
  )
  pruefe(
    treffer.length >= 1,
    `D1 "${z.name}" enthaelt den Anker "${z.anker}" (${treffer.length} Treffer)`
  )
}
const ohneAnker = zonen.filter((z) => !z.anker).map((z) => z.name)
pruefe(
  ohneAnker.length === 2 && ohneAnker.includes('Treppenhaus West') && ohneAnker.includes('Erschliessung'),
  `D2 genau zwei Zonen tragen bewusst keinen Anker: ${ohneAnker.join(', ')}`
)

/* ═══ E · DIE FLURACHSEN SIND DIE GEMESSENEN ═══════════════════════════════ */
log('\n═══ E · die Flurachsen sind die gemessenen ═══')
// Die Zonen stuetzen sich auf y = 5,79 und 8,14 m. Werden diese Achsen im
// Projekt je neu vermessen, MUSS zonen.json nachziehen — sonst trennt die
// Schicht an einer Linie, die es nicht mehr gibt.
const wallsText = fs.readFileSync(path.join(WURZEL, 'data/walls.json'), 'utf8')
const walls = JSON.parse(wallsText)
const achsenImPlan = [...new Set(walls.waende.filter((w) => w.art === 'flur').map((w) => w.von[1]))].sort(
  (a, b) => a - b
)
pruefe(
  achsenImPlan.length === 2 &&
    Math.abs(achsenImPlan[0] - flurachsen.nord) < 0.005 &&
    Math.abs(achsenImPlan[1] - flurachsen.sued) < 0.005,
  `E1 zonen.json nennt dieselben Flurachsen wie walls.json: ${achsenImPlan.join(' / ')} m`
)

log('')
if (fehler) {
  log(`DURCHGEFALLEN — ${fehler} Pruefung(en) rot`)
  process.exit(1)
}
log('ALLE PRUEFUNGEN BESTANDEN')
