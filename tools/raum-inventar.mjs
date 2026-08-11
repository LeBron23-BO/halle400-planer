// RAUM-INVENTAR — was steht laut PLANER in welchem Raum? (W18)
//
//   node tools/raum-inventar.mjs
//
// WARUM ES DIESES WERKZEUG BRAUCHT
// Die Frage „ist jeder Raum so eingerichtet wie in der PDF?" laesst sich nur
// beantworten, wenn man weiss, welches Stueck in welchem Raum steht. In den
// Daten steht das NICHT: `ausstattung.json` kennt nur Koordinaten, und die
// Raeume entstehen erst durch die Wand-Verfolgung des Planers.
//
// Eine Naeherung ueber „naechster Namens-Anker in x" wurde probiert und ist
// GEMESSEN unbrauchbar: sie legte zwei Waschbecken in den Aufzug und fuenf
// Schraenke in das Lager, das die PDF ausdruecklich leer zeigt. Der Grund ist
// simpel — sie kennt keine Waende.
//
// Gefragt wird deshalb der KERN selbst (`Floorplan.getRooms()`), also genau
// das, was auch der Planer auf den Bildschirm bringt. Dieselbe Bauweise wie in
// `pruefe-uebernahme.mjs`: der Kern wird uebersetzt, gebuendelt und in node
// ausgefuehrt — kein Browser, keine zweite Fassung der Rechnung.
import fs from 'node:fs'
import path from 'node:path'
import { uebersetzeKern, buendleKern, buendleThree, WURZEL } from './buendel-kern.mjs'
import { ladeZonen, ordneZu } from './zonen.mjs'

const PLAN = path.join(WURZEL, 'app/public/plaene/halle400.json')
const GEO = path.join(WURZEL, 'data/plan-geometry.json')

const kernQuelle = `${buendleThree()}\n${buendleKern(uebersetzeKern())}`
const KERN = new Function(`${kernQuelle}\nreturn { Floorplan };`)()

const roh = JSON.parse(fs.readFileSync(PLAN, 'utf8'))
const f = new KERN.Floorplan()
f.loadFloorplan(roh.floorplan || roh)

const raeume = f.getRooms()
const stuecke = f.getAusstattung()
const geo = JSON.parse(fs.readFileSync(GEO, 'utf8'))

/** Punkt-in-Vieleck, Strahlverfahren — dieselbe Rechnung wie ueberall sonst. */
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
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    s += (ring[j].x + ring[i].x) * (ring[j].y - ring[i].y)
  }
  return Math.abs(s / 2)
}

// Jeder Raum bekommt den Namens-Anker, der IN IHM liegt. Nicht den naechsten:
// ein Anker ausserhalb aller Waende gehoert zu keinem Raum, und das ist eine
// Auskunft und kein Fehler.
const eintraege = raeume.map((r) => {
  const ring = r.corners.map((c) => ({ x: c.x, y: c.y }))
  const namen = geo.beschriftungen
    .filter((b) => imRing({ x: b.anker_x_m * 100, y: b.anker_y_m * 100 }, ring))
    .map((b) => `${b.text}${b.zusatz ? ' ' + b.zusatz : ''}`)
  const drin = stuecke.filter((s) => imRing({ x: s.x, y: s.y }, ring))
  const zaehler = {}
  for (const s of drin) zaehler[s.typ] = (zaehler[s.typ] || 0) + 1
  return {
    name: namen.join(' + ') || '(ohne Beschriftung)',
    m2: Math.round(flaeche(ring) / 10000 * 10) / 10,
    anzahl: drin.length,
    typen: zaehler,
    ring,
    mehrereNamen: namen.length > 1
  }
})

eintraege.sort((a, b) => b.m2 - a.m2)

console.log(`Raeume laut Planer: ${raeume.length} · Ausstattung gesamt: ${stuecke.length}`)
console.log(`Namens-Anker: ${geo.beschriftungen.length}\n`)
for (const e of eintraege) {
  const t = Object.entries(e.typen)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${v}x ${k}`)
    .join(', ')
  console.log(`${String(e.m2).padStart(6)} m²  ${e.name.padEnd(28)} ${String(e.anzahl).padStart(3)}  ${t || '— leer —'}`)
}

const zugeordnet = eintraege.reduce((s, e) => s + e.anzahl, 0)
const ohneNamen = eintraege.filter((e) => e.name === '(ohne Beschriftung)').length
console.log(`\nIn Raeumen: ${zugeordnet} von ${stuecke.length} Stuecken`)
console.log(`Raeume ohne Namens-Anker: ${ohneNamen}`)
const ankerDrin = new Set(eintraege.flatMap((e) => (e.name === '(ohne Beschriftung)' ? [] : e.name.split(' + '))))
const fehlend = geo.beschriftungen
  .map((b) => `${b.text}${b.zusatz ? ' ' + b.zusatz : ''}`)
  .filter((n) => !ankerDrin.has(n))
if (fehlend.length) console.log(`Anker, die in KEINEM Raum liegen: ${fehlend.join(' · ')}`)

/* ── Der offene Bereich, aufgeschluesselt (W19) ─────────────────────────────
   Ein Raum mit mehreren Beschriftungen ist kein Fehler des Planers, sondern
   die Wahrheit der PDF: dort steht keine Wand. Damit die Stueckliste trotzdem
   aufgeht, wird er ueber data/zonen.json ZUGEORDNET — ohne dass eine Wand
   entsteht. Faellt ein Stueck durch, sagt es das; die verworfene Naeherung war
   deshalb unbrauchbar, weil sie immer eine Antwort hatte. */
const offen = eintraege.filter((e) => e.mehrereNamen).sort((a, b) => b.m2 - a.m2)[0]
if (offen) {
  const { zonen } = ladeZonen(WURZEL)
  const drin = stuecke.filter((s) => imRing({ x: s.x, y: s.y }, offen.ring))
  const { jeZone, ohneZone, mehrdeutig } = ordneZu(drin, zonen)
  console.log(`\n── Offener Bereich (${offen.m2} m², ${drin.length} Stueck) nach Zonen ──`)
  console.log(`   keine Wand erfunden — Grenzen und ihre Herkunft stehen in data/zonen.json\n`)
  for (const z of zonen) {
    const liste = jeZone.get(z.name)
    const t = {}
    for (const s of liste) t[s.typ] = (t[s.typ] || 0) + 1
    const typen = Object.entries(t).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v}x ${k}`).join(', ')
    const soll = z.gemessen_stuecke
    const zeichen = liste.length === soll ? ' ' : '!'
    console.log(
      ` ${zeichen} ${z.name.padEnd(20)} ${String(liste.length).padStart(3)}` +
        `${liste.length === soll ? '   ' : ` (gemessen war ${soll})`}  ${typen || '— leer —'}`
    )
  }
  const summe = zonen.reduce((s, z) => s + jeZone.get(z.name).length, 0)
  console.log(`\n   ${summe} von ${drin.length} Stuecken einer Zone zugeordnet`)
  if (ohneZone.length) {
    console.log(`   OHNE ZONE (${ohneZone.length}) — jedes einzeln, damit keines still verschwindet:`)
    for (const s of ohneZone) {
      console.log(`     ${s.typ} bei x=${(s.x / 100).toFixed(2)} m  y=${(s.y / 100).toFixed(2)} m`)
    }
  }
  if (mehrdeutig.length) {
    console.log(`   MEHRDEUTIG (${mehrdeutig.length}) — die Zonen ueberlappen sich, das ist ein Fehler in zonen.json:`)
    for (const m of mehrdeutig) {
      console.log(`     ${m.stueck.typ} bei x=${(m.stueck.x / 100).toFixed(2)} m: ${m.zonen.join(' + ')}`)
    }
  }
}
