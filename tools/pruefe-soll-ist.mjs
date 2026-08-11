// PRUEFE-SOLL-IST (t2 / W20) — steht in jedem Raum das, was das Blatt zeigt?
//
//   node tools/pruefe-soll-ist.mjs
//
// WAS HIER AUF DEM SPIEL STEHT
// Bis W19 war bekannt, WELCHES Stueck in welchem Raum steht (raum-inventar) und
// wie der offene Bereich zugeordnet ist (zonen). Unbeantwortet blieb die Frage,
// auf die es dem Betreiber ankommt: ist der Raum so eingerichtet WIE IM PLAN?
//
// Die Falle dabei ist nicht die Strenge, sondern der Uebereifer. Das Blatt ist
// freihaendig gezeichnet, und data/pdf-soll.json ist eine LESART davon. Ein
// Gate, das jede Lese-Unschaerfe rot meldet, wird nach dem dritten Mal
// abgeschaltet — und meldet danach auch den echten Fehler nicht mehr. Deshalb
// gilt hier:
//
//   * HART geprueft wird nur, was am Overlay BELEGT ist (sicher: true).
//   * Jede Abweichung MUSS unter `abweichungen` benannt sein. Eine neue,
//     unbenannte Abweichung ist rot — stillschweigend gefuellt wird nichts.
//   * Ein Abweichungs-Eintrag, den es im Ist gar nicht mehr gibt, ist EBENFALLS
//     rot. Sonst verrottet die Datei zu einer Liste von Ausreden.
//   * Was NICHT belegt ist, wird sichtbar als UNGEPRUEFT gemeldet statt still
//     als bestanden durchgereicht.
//
// Und wie in pruefe-zonen: jede tragende Zusicherung hat ihre GEGENPROBE. Ein
// Waechter, der nie ausgeloest hat, ist eine Behauptung.
import fs from 'node:fs'
import path from 'node:path'
import { uebersetzeKern, buendleKern, buendleThree, WURZEL } from './buendel-kern.mjs'
import { ladeZonen, ordneZu } from './zonen.mjs'

let fehler = 0
const log = (s) => console.log(s)
function pruefe(bedingung, text) {
  if (bedingung) log(`OK   ${text}`)
  else {
    log(`FEHL ${text}`)
    fehler++
  }
}

const SOLL_DATEI = path.join(WURZEL, 'data/pdf-soll.json')
const soll = JSON.parse(fs.readFileSync(SOLL_DATEI, 'utf8'))

const KERN = new Function(`${buendleThree()}\n${buendleKern(uebersetzeKern())}\nreturn { Floorplan };`)()
const roh = JSON.parse(fs.readFileSync(path.join(WURZEL, 'app/public/plaene/halle400.json'), 'utf8'))
const modell = new KERN.Floorplan()
modell.loadFloorplan(roh.floorplan || roh)
const stuecke = modell.getAusstattung()
const raeume = modell.getRooms()
const geo = JSON.parse(fs.readFileSync(path.join(WURZEL, 'data/plan-geometry.json'), 'utf8'))

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

/** Das IST: Typ-Zaehler je benanntem Raum — dieselbe Rechnung wie raum-inventar. */
function istJeRaum() {
  const karte = new Map()
  for (const r of raeume) {
    const ring = r.corners.map((c) => ({ x: c.x, y: c.y }))
    const namen = geo.beschriftungen
      .filter((b) => imRing({ x: b.anker_x_m * 100, y: b.anker_y_m * 100 }, ring))
      .map((b) => `${b.text}${b.zusatz ? ' ' + b.zusatz : ''}`)
    if (namen.length !== 1) continue // der offene Bereich traegt mehrere — er laeuft ueber die Zonen
    const zaehler = {}
    for (const s of stuecke) {
      if (imRing({ x: s.x, y: s.y }, ring)) zaehler[s.typ] = (zaehler[s.typ] || 0) + 1
    }
    karte.set(namen[0], zaehler)
  }
  return karte
}

/** Das IST je Zone des offenen Bereichs. */
function istJeZone() {
  const karte = new Map()
  const { zonen } = ladeZonen(WURZEL)
  const offen = raeume
    .map((r) => r.corners.map((c) => ({ x: c.x, y: c.y })))
    .filter((ring) => {
      const n = geo.beschriftungen.filter((b) =>
        imRing({ x: b.anker_x_m * 100, y: b.anker_y_m * 100 }, ring)
      ).length
      return n > 1
    })[0]
  if (!offen) return karte
  const drin = stuecke.filter((s) => imRing({ x: s.x, y: s.y }, offen))
  const { jeZone } = ordneZu(drin, zonen)
  for (const z of zonen) {
    const zaehler = {}
    for (const s of jeZone.get(z.name)) zaehler[s.typ] = (zaehler[s.typ] || 0) + 1
    karte.set(z.name, zaehler)
  }
  return karte
}

/** Die Differenzen zwischen einem Soll-Zaehler und einem Ist-Zaehler, im Klartext. */
function differenzen(sollZaehler, istZaehler) {
  const typen = new Set([...Object.keys(sollZaehler || {}), ...Object.keys(istZaehler || {})])
  const raus = []
  for (const t of [...typen].sort()) {
    const s = (sollZaehler || {})[t] || 0
    const i = (istZaehler || {})[t] || 0
    if (s !== i) raus.push(`${t}: ist ${i}, soll ${s}`)
  }
  return raus
}

const IST_RAUM = istJeRaum()
const IST_ZONE = istJeZone()

/* ═══ A · DAS SOLL IST KEINE GEOMETRIE ═════════════════════════════════════ */
log('═══ A · das Soll ist eine Lesart und darf NIE bauen ═══')
// Dieselbe Zusicherung wie fuer zonen.json (pruefe-zonen Abschnitt A) und aus
// demselben Grund: wer eine LESART in eine bauende Kette haengt, hat aus einer
// Vermutung Geometrie gemacht — Projekt-DNA Punkt 1.
const BAUENDE = [
  'tools/export_blueprint.py',
  'tools/build_walls.py',
  'tools/baue-planer-datei.mjs',
  'tools/uebernimm-bearbeitung.py'
]
for (const datei of BAUENDE) {
  const text = fs.readFileSync(path.join(WURZEL, datei), 'utf8')
  pruefe(!text.includes('pdf-soll'), `A1 ${datei} liest pdf-soll.json NICHT`)
}
// GEGENPROBE: dieselbe Suche MUSS in einer Datei anschlagen, die es wirklich liest.
const selbst = fs.readFileSync(path.join(WURZEL, 'tools/pruefe-soll-ist.mjs'), 'utf8')
pruefe(selbst.includes('pdf-soll'), 'A2 Gegenprobe — dieselbe Suche findet den Namen dort, wo er steht')

/* ═══ B · STRUKTUR: JEDER SOLL-EINTRAG EXISTIERT IM IST ════════════════════ */
log('\n═══ B · jeder Soll-Eintrag hat sein Gegenstueck im Plan ═══')
for (const r of soll.raeume) {
  pruefe(IST_RAUM.has(r.name), `B1 Raum "${r.name}" existiert im Plan und traegt genau einen Namens-Anker`)
}
for (const z of soll.zonen) {
  pruefe(IST_ZONE.has(z.name), `B2 Zone "${z.name}" existiert in data/zonen.json`)
}

/* ═══ C · DIE BELEGTEN ZAHLEN, HART GEPRUEFT ══════════════════════════════ */
log('\n═══ C · was am Overlay belegt ist, wird hart geprueft ═══')
const offeneIds = new Set()
const benannt = new Map() // Raum-/Zonenname -> [Abweichungs-Ids]
for (const a of soll.abweichungen) {
  if (String(a.status).startsWith('behoben')) continue
  offeneIds.add(a.id)
  for (const w of a.wo) benannt.set(w, [...(benannt.get(w) || []), a.id])
}

let belegte = 0
let ungeprueft = []
const gedeckt = new Set()
for (const eintrag of [...soll.raeume.map((r) => ['Raum', r]), ...soll.zonen.map((z) => ['Zone', z])]) {
  const [art, e] = eintrag
  const ist = art === 'Raum' ? IST_RAUM.get(e.name) : IST_ZONE.get(e.name)
  if (!e.sicher) {
    ungeprueft.push(`${art} ${e.name}`)
    continue
  }
  belegte++
  const diff = differenzen(e.soll, ist)
  const ids = benannt.get(e.name) || []
  if (diff.length === 0) {
    pruefe(ids.length === 0,
      ids.length === 0
        ? `C1 ${art} "${e.name}" steht wie im Plan (${Object.entries(e.soll).map(([k, v]) => v + 'x ' + k).join(', ') || 'leer'})`
        : `C1 ${art} "${e.name}" passt jetzt — der Eintrag ${ids.join('/')} ist erledigt und gehoert geschlossen`)
  } else {
    for (const id of ids) gedeckt.add(id)
    pruefe(ids.length > 0,
      ids.length > 0
        ? `C2 ${art} "${e.name}" weicht ab und ist benannt (${ids.join('/')}): ${diff.join(' · ')}`
        : `C2 ${art} "${e.name}" weicht UNBENANNT ab: ${diff.join(' · ')} — Eintrag in data/pdf-soll.json abweichungen fehlt`)
  }
}
pruefe(belegte >= 5, `C3 mindestens fuenf Eintraege sind belegt und werden hart geprueft (${belegte})`)

/* ═══ D · KEINE AUSREDEN-LISTE ════════════════════════════════════════════ */
log('\n═══ D · jeder offene Abweichungs-Eintrag hat noch einen Gegenstand ═══')
// Ein Eintrag, der auf einen NICHT belegten Raum zeigt, ist zulaessig (er haelt
// den Befund fest, bevor die Zahl belegt ist) — er muss den Raum aber kennen.
for (const a of soll.abweichungen) {
  if (String(a.status).startsWith('behoben')) continue
  const zeigtInsLeere = a.wo.filter((w) => !IST_RAUM.has(w) && !IST_ZONE.has(w))
  pruefe(zeigtInsLeere.length === 0,
    zeigtInsLeere.length === 0
      ? `D1 ${a.id} zeigt auf vorhandene Raeume/Zonen: ${a.wo.join(', ')}`
      : `D1 ${a.id} zeigt ins Leere: ${zeigtInsLeere.join(', ')}`)
  pruefe(a.befund && a.status && a.beleg,
    `D2 ${a.id} traegt Befund, Beleg und Status — ein Eintrag ohne Beleg ist eine Ausrede`)
}

/* ═══ G · DIE GEGENPROBEN ═════════════════════════════════════════════════ */
log('\n═══ G · die Gegenproben — kann dieser Waechter ueberhaupt ausloesen? ═══')
// G1: eine erfundene Abweichung an einem belegten Raum MUSS als Differenz
// erscheinen. Ohne diese Probe wiese C nur nach, dass die Rechnung schweigt.
const probeRaum = soll.raeume.find((r) => r.sicher && Object.keys(r.soll).length)
const probeIst = { ...IST_RAUM.get(probeRaum.name) }
const ersterTyp = Object.keys(probeRaum.soll)[0]
probeIst[ersterTyp] = (probeIst[ersterTyp] || 0) + 1
pruefe(differenzen(probeRaum.soll, probeIst).length === 1,
  `G1 ein zusaetzliches ${ersterTyp} in "${probeRaum.name}" wird als Differenz erkannt`)

// G2: ein FEHLENDES Stueck ebenso — eine Pruefung, die nur Zuwachs sieht,
// uebersaehe genau den Fall, in dem etwas still verschwindet.
const probeIst2 = { ...IST_RAUM.get(probeRaum.name) }
probeIst2[ersterTyp] = (probeIst2[ersterTyp] || 0) - 1
pruefe(differenzen(probeRaum.soll, probeIst2).length === 1,
  `G2 ein fehlendes ${ersterTyp} in "${probeRaum.name}" wird ebenso erkannt`)

// G3: ein leeres Soll gegen ein leeres Ist ergibt KEINE Differenz — sonst
// meldete das Gate bei Lager und Aufzug ewig einen Fehler, den es nicht gibt.
pruefe(differenzen({}, {}).length === 0, 'G3 leer gegen leer ist keine Abweichung')

// G4: die Zaehlung selbst traegt. Ein Stueck steht in GENAU einem von drei
// Toepfen: benannter Raum, offener Bereich (ueber Zonen), oder ein Raum ohne
// Namens-Anker. Geht die Summe nicht auf, misst dieses Werkzeug etwas anderes
// als raum-inventar — und dann ist jede Zahl darueber wertlos.
const summeRaeume = [...IST_RAUM.values()].reduce(
  (s, z) => s + Object.values(z).reduce((a, b) => a + b, 0), 0)
const summeZonen = [...IST_ZONE.values()].reduce(
  (s, z) => s + Object.values(z).reduce((a, b) => a + b, 0), 0)
const ohneAnker = stuecke.filter((s) => {
  for (const r of raeume) {
    const ring = r.corners.map((c) => ({ x: c.x, y: c.y }))
    if (!imRing({ x: s.x, y: s.y }, ring)) continue
    const n = geo.beschriftungen.filter((b) =>
      imRing({ x: b.anker_x_m * 100, y: b.anker_y_m * 100 }, ring)).length
    if (n === 0) return true
  }
  return false
}).length
pruefe(summeRaeume + summeZonen + ohneAnker === stuecke.length,
  `G4 die Zaehlung geht auf: ${summeRaeume} benannt + ${summeZonen} in Zonen + ${ohneAnker} ohne Namens-Anker = ${stuecke.length}`)

/* ═══ F · WAS NOCH NICHT GEPRUEFT IST, WIRD GENANNT ═══════════════════════ */
log('\n═══ F · die offenen Lesarten — kein Fehler, aber auch kein Freispruch ═══')
log(`   ${ungeprueft.length} Eintraege ohne belegte Stueckzahl:`)
for (const u of ungeprueft) log(`     ${u}`)
// Die groesste offene Luecke ist keine Zahl in dieser Datei, sondern das, was
// gar nicht darin steht: 13 Raeume tragen keinen Namens-Anker, und in ihnen
// steht mehr als ein Drittel der Einrichtung. Sie ueber den naechstliegenden
// Namen zuzuordnen ist die Naeherung, die W18 gemessen verworfen hat.
log(`\n   ${ohneAnker} von ${stuecke.length} Stuecken stehen in Raeumen OHNE Namens-Anker`)
log('   — sie haben kein Soll und koennen keines bekommen, solange kein Name an ihnen haengt.')
log('   Weg dorthin: python tools/mess_kachel.py --von <m> --bis <m> --mit-ausstattung')
log('   und dann die Zahl in data/pdf-soll.json mit sicher:true + beleg eintragen.')

const unbenutzt = [...offeneIds].filter((id) => !gedeckt.has(id))
if (unbenutzt.length) {
  log(`\n   Offene Befunde ohne belegte Gegenzahl (festgehalten, noch nicht messbar): ${unbenutzt.join(', ')}`)
}

log('')
if (fehler) {
  log(`DURCHGEFALLEN — ${fehler} Pruefung(en) rot`)
  process.exit(1)
}
log(`ALLE PRUEFUNGEN BESTANDEN — ${belegte} belegte Eintraege hart geprueft, ${ungeprueft.length} Lesarten offen`)
