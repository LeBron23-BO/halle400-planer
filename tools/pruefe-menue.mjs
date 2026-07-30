// Prueft ANFASSEN STATT WERKZEUGKUNDE (W13) — `src/raum/objekt-menue.js`.
//
//   node tools/pruefe-menue.mjs
//   Exit 0 = alle Pruefungen bestanden, 1 = mindestens eine durchgefallen.
//
// WORUM ES GEHT
// Der Nutzer hat in W12 gemeldet: *„ich kann die waende immer noch nicht
// bewegen"* — obwohl das Wand-Werkzeug seit W10 existierte und seit W12b zog.
// Gebaut war es, GEFUNDEN wurde es nicht. Diese Welle dreht die Reihenfolge um:
// erst das Ding anfassen, dann sagt der Plan, was damit geht. Gemessen wird
// deshalb nicht „gibt es die Funktion", sondern „FUEHRT der Weg dorthin".
//
// SECHS ABSCHNITTE:
//   A) Der kleinste Treffer gewinnt (jede Stufe mit Gegenprobe)
//   B) Die Wand kennt ihre zwei Raeume (W13b: Entfernen IST Verbinden)
//   C) Der Raum kennt seine Nachbarn — und sagt ehrlich, wenn er keine hat
//   D) Ueber gemessene Bausubstanz wird nichts beschoenigt
//   E) Kein toter Eintrag: jede Handlung hat einen Schluessel oder eine Auskunft
//   F) DAS BUENDEL — die Rechnung ist in der ausgelieferten Datei WIRKLICH da
//      und aufloesbar. Ohne diesen Abschnitt waere ein `import ... as X` still
//      kaputt: im Planer laedt `import` nach, in der Doppelklick-Datei nicht.
//   G) DIE ECHTE DATEI, am Rechner — ein Griff auf einen Raum oeffnet das Menue
//      OHNE Werkzeugwahl, und der Weg fuehrt bis zum verbundenen Raum. Gemessen
//      wird die RAUMZAHL vor und nach dem Weg, nicht eine Meldung.
//   H) DIE ECHTE DATEI, am Handy (390 x 800) mit ECHTEN Beruehrungen.
//   I) KEINE REGRESSION — Werkzeugleiste bedienbar, Escape schliesst, ein Zug
//      oeffnet KEIN Menue.
//
// --nur rechnung | datei grenzt ein (A-F ohne Browser, G-I mit).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { WURZEL, buendleRaum, RAUM_MODULE } from './buendel-kern.mjs'

const argWert = (name, standard) => {
  const i = process.argv.indexOf(name)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : standard
}
const NUR = argWert('--nur', null)
const laeuft = (name) => !NUR || NUR === name

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'h400-menue-'))
const fehler = []
const log = (s) => console.log(s)
const pruefe = (bedingung, satz) => {
  log(`${bedingung ? 'OK  ' : 'FEHL'} ${satz}`)
  if (!bedingung) fehler.push(satz)
}

const M = await import(pathToFileURL(path.join(WURZEL, 'src/raum/objekt-menue.js')).href)
const { objektAn, menueFuer, nachbarnVon, raeumeAnWand, OM_TOLERANZ, _omPruefzugang } = M

/* ---------------------------------------------------------------- Baukasten */

// Zwei Raeume nebeneinander, je 4 x 3 m, Trennwand auf x = 400.
//   e1(0,0) —— e2(400,0) —— e3(800,0)
//    |    A     |     B      |
//   e6(0,300) — e5(400,300) — e4(800,300)
const P = {
  e1: { x: 0, y: 0 },
  e2: { x: 400, y: 0 },
  e3: { x: 800, y: 0 },
  e4: { x: 800, y: 300 },
  e5: { x: 400, y: 300 },
  e6: { x: 0, y: 300 }
}
const w = (id, aId, bId, extra = {}) => ({
  id,
  aId,
  bId,
  a: P[aId],
  b: P[bId],
  quelle: extra.quelle ?? 'gemessen',
  dicke: extra.dicke ?? 10
})

const WAENDE = [
  w('w-oben-a', 'e1', 'e2'),
  w('w-oben-b', 'e2', 'e3'),
  w('w-rechts', 'e3', 'e4'),
  w('w-unten-b', 'e4', 'e5'),
  w('w-unten-a', 'e5', 'e6'),
  w('w-links', 'e6', 'e1'),
  w('w-trenn', 'e2', 'e5')
]

const RAUM_A = { key: 'A', ring: [P.e1, P.e2, P.e5, P.e6], name: 'Kursraum' }
const RAUM_B = { key: 'B', ring: [P.e2, P.e3, P.e4, P.e5], name: '' }

const ECKEN = Object.entries(P).map(([id, p]) => ({ id, x: p.x, y: p.y }))

const welt = (ueber = {}) => ({
  waende: WAENDE,
  raeume: [RAUM_A, RAUM_B],
  ecken: ECKEN,
  moebel: [],
  oeffnungen: [],
  ...ueber
})

/* =========================================== A) Der kleinste Treffer gewinnt */

log('\n── A) Der kleinste Treffer gewinnt ─────────────────────────────')

// A1 Mitten im Raum A, weit weg von allem: der Raum.
{
  const t = objektAn({ x: 200, y: 150 }, welt())
  pruefe(t?.art === 'raum' && t.id === 'A', 'A1 mitten im Raum trifft den Raum')
}

// A2 Auf der Trennwand: die Wand, nicht der Raum. GEGENPROBE zu A1 — derselbe
// Aufbau, nur der Punkt wandert auf die Wandachse.
{
  const t = objektAn({ x: 400, y: 150 }, welt())
  pruefe(t?.art === 'wand' && t.id === 'w-trenn', 'A2 auf der Wandachse trifft die Wand')
}

// A3 Knapp NEBEN der Wand, ausserhalb der Toleranz: wieder der Raum.
// Das ist die Gegenprobe zu A2 und misst, dass die Toleranz eine Grenze HAT.
{
  const t = objektAn({ x: 400 - OM_TOLERANZ.wand - 5, y: 150 }, welt())
  pruefe(t?.art === 'raum' && t.id === 'A', 'A3 ausserhalb der Wand-Toleranz trifft wieder den Raum')
}

// A4 An einer Ecke: die Ecke schlaegt die zwei Waende, die dort haengen.
{
  const t = objektAn({ x: 400, y: 5 }, welt())
  pruefe(t?.art === 'ecke' && t.id === 'e2', 'A4 an der Ecke trifft die Ecke, nicht die Wand')
}

// A5 Ein Moebel schlaegt alles darunter — auch die Wand, auf der es steht.
{
  const moebel = [{ id: 'm1', typ: 'tisch', x: 400, y: 150, breite: 120, tiefe: 80, drehung: 0 }]
  const t = objektAn({ x: 400, y: 150 }, welt({ moebel }))
  pruefe(t?.art === 'moebel' && t.id === 'm1', 'A5 Moebel schlaegt die Wand darunter')
}

// A6 Zwei Moebel uebereinander: das ZULETZT eingefuegte gewinnt (es liegt oben).
{
  const moebel = [
    { id: 'unten', typ: 'tisch', x: 200, y: 150, breite: 120, tiefe: 80, drehung: 0 },
    { id: 'oben', typ: 'stuhl', x: 200, y: 150, breite: 45, tiefe: 45, drehung: 0 }
  ]
  const t = objektAn({ x: 200, y: 150 }, welt({ moebel }))
  pruefe(t?.art === 'moebel' && t.id === 'oben', 'A6 bei zwei Moebeln gewinnt das obere')
}

// A7 Eine Oeffnung schlaegt ihre Wand.
{
  const oeffnungen = [{ id: 'o1', wandId: 'w-trenn', art: 'tuer', lage: 150, breite: 87.5 }]
  const t = objektAn({ x: 400, y: 150 }, welt({ oeffnungen }))
  pruefe(t?.art === 'oeffnung' && t.id === 'o1', 'A7 Oeffnung schlaegt ihre Wand')
}

// A8 Eine VERWAISTE Oeffnung (ihre Wand gibt es nicht mehr, W4 Punkt 4) ist
// nicht greifbar — sie wird auch nicht gezeichnet. Ein Griff ins Unsichtbare
// waere schlimmer als kein Griff.
{
  const oeffnungen = [{ id: 'o-weg', wandId: 'gibt-es-nicht', art: 'tuer', lage: 150, breite: 87.5 }]
  const t = objektAn({ x: 400, y: 150 }, welt({ oeffnungen }))
  pruefe(t?.art === 'wand', 'A8 eine verwaiste Oeffnung ist NICHT greifbar')
}

// A9 Weit ausserhalb: nichts. Kein erfundener Treffer.
{
  const t = objektAn({ x: 5000, y: 5000 }, welt())
  pruefe(t === null, 'A9 ausserhalb des Plans wird nichts getroffen')
}

// A10 Unbrauchbare Eingabe faellt nicht auf die Nase.
{
  pruefe(objektAn(null, welt()) === null, 'A10a kein Punkt -> kein Treffer')
  pruefe(objektAn({ x: NaN, y: 0 }, welt()) === null, 'A10b NaN -> kein Treffer')
}

/* ================================ B) Die Wand kennt ihre zwei Raeume (W13b) */

log('\n── B) Die Wand kennt ihre zwei Raeume ──────────────────────────')

// B1 Die Trennwand nennt beide Raeume.
{
  const t = raeumeAnWand('w-trenn', welt())
  const keys = t ? [t.a.key, t.b.key].sort().join('') : ''
  pruefe(keys === 'AB', 'B1 die Trennwand kennt Raum A und Raum B')
}

// B2 GEGENPROBE: eine Aussenwand trennt nichts.
{
  pruefe(raeumeAnWand('w-links', welt()) === null, 'B2 eine Aussenwand trennt keine zwei Raeume')
}

// B3 Das Wand-Menue bietet das VERBINDEN an — und zwar als ERSTES. Das ist der
// ganze Punkt von W13b: die Wirkung steht vor der Handlung.
{
  const t = objektAn({ x: 400, y: 150 }, welt())
  const m = menueFuer(t, welt())
  pruefe(m?.eintraege?.[0]?.handlung === 'raeume-verbinden', 'B3 Verbinden steht an erster Stelle')
  pruefe(
    /Kursraum/.test(m?.eintraege?.[0]?.text ?? ''),
    'B3b der Eintrag nennt den Raum beim Namen'
  )
  pruefe(
    m?.eintraege?.[0]?.ziel?.raumA && m?.eintraege?.[0]?.ziel?.raumB,
    'B3c der Eintrag traegt beide Raum-Schluessel mit'
  )
}

// B4 GEGENPROBE: das Menue einer Aussenwand hat KEIN Verbinden.
{
  const t = objektAn({ x: 0, y: 150 }, welt())
  const m = menueFuer(t, welt())
  pruefe(
    !(m?.eintraege ?? []).some((e) => e.handlung === 'raeume-verbinden'),
    'B4 die Aussenwand bietet kein Verbinden an'
  )
}

// B5 Loeschen und Verbinden sind NICHT derselbe Eintrag zweimal: an einer
// Trennwand sagt das Loeschen ausdruecklich, dass es die Raeume NICHT verbindet.
{
  const t = objektAn({ x: 400, y: 150 }, welt())
  const m = menueFuer(t, welt())
  const loeschen = (m?.eintraege ?? []).find((e) => e.handlung === 'wand-loeschen')
  pruefe(/ohne Räume zu verbinden/.test(loeschen?.text ?? ''), 'B5 Loeschen grenzt sich ab')
}

// B6 Mehrere Trennwandstuecke: der Hinweis nennt die Zahl. Wer nur eines
// entfernt, laesst einen Stummel stehen und bekommt KEINEN gemeinsamen Raum
// (W12 Festlegung 2) — das muss vorher dastehen.
{
  // Dieselbe Grenze in zwei Stuecken: e2 -(400,150)- e5.
  const mitte = { x: 400, y: 150 }
  const geteilt = WAENDE.filter((x) => x.id !== 'w-trenn').concat([
    { id: 't1', aId: 'e2', bId: 'm', a: P.e2, b: mitte, quelle: 'gemessen', dicke: 10 },
    { id: 't2', aId: 'm', bId: 'e5', a: mitte, b: P.e5, quelle: 'gemessen', dicke: 10 }
  ])
  const ringA = [P.e1, P.e2, mitte, P.e5, P.e6]
  const ringB = [P.e2, P.e3, P.e4, P.e5, mitte]
  const welt2 = {
    waende: geteilt,
    raeume: [{ key: 'A', ring: ringA, name: 'Kursraum' }, { key: 'B', ring: ringB, name: '' }],
    ecken: ECKEN,
    moebel: [],
    oeffnungen: []
  }
  const t = objektAn({ x: 400, y: 80 }, welt2)
  const m = menueFuer(t, welt2)
  const verbinden = (m?.eintraege ?? []).find((e) => e.handlung === 'raeume-verbinden')
  pruefe(verbinden?.ziel?.trennwaende?.length === 2, 'B6 beide Trennwandstuecke gehen mit')
  pruefe(/2 Wandstücke/.test(verbinden?.hinweis ?? ''), 'B6b der Hinweis nennt die Zahl')
}

/* ============================== C) Der Raum kennt seine Nachbarn — ehrlich */

log('\n── C) Der Raum kennt seine Nachbarn ────────────────────────────')

// C1 Raum A hat genau einen Nachbarn.
{
  const n = nachbarnVon(RAUM_A, welt())
  pruefe(n.length === 1 && n[0].raum.key === 'B', 'C1 Raum A hat genau einen Nachbarn')
}

// C2 Das Raum-Menue bietet ihn an — ohne dass ein Werkzeug gewaehlt wurde.
{
  const t = objektAn({ x: 200, y: 150 }, welt())
  const m = menueFuer(t, welt())
  pruefe(
    (m?.eintraege ?? []).some((e) => e.handlung === 'raeume-verbinden'),
    'C2 Raum antippen fuehrt zum Verbinden'
  )
}

// C3 GEGENPROBE — ein Raum OHNE Nachbarn behauptet keinen. Und er sagt WARUM:
// ein fehlender Eintrag laesst den Nutzer weitersuchen.
{
  const alleine = { waende: WAENDE, raeume: [RAUM_A], ecken: ECKEN, moebel: [], oeffnungen: [] }
  const t = objektAn({ x: 200, y: 150 }, alleine)
  const m = menueFuer(t, alleine)
  pruefe(
    !(m?.eintraege ?? []).some((e) => e.handlung === 'raeume-verbinden'),
    'C3 ohne Nachbarn kein Verbinden-Eintrag'
  )
  pruefe(
    (m?.eintraege ?? []).some((e) => e.handlung === null && /Kein Nachbarraum/.test(e.text)),
    'C3b stattdessen die ehrliche Auskunft'
  )
}

// C4 Ein Raum ohne Namen bekommt KEINEN erfundenen — sondern seine Flaeche.
{
  const t = objektAn({ x: 600, y: 150 }, welt())
  const m = menueFuer(t, welt())
  pruefe(/12,0 m²/.test(m?.titel ?? ''), 'C4 ein namenloser Raum wird ueber seine Flaeche benannt')
}

// C5 Der Titel des benannten Raums nennt Name UND Flaeche.
{
  const t = objektAn({ x: 200, y: 150 }, welt())
  const m = menueFuer(t, welt())
  pruefe(/^Kursraum · 12,0 m²$/.test(m?.titel ?? ''), 'C5 Name und Flaeche stehen im Titel')
}

/* ================= D) Ueber gemessene Bausubstanz wird nichts beschoenigt */

log('\n── D) Gemessene Bausubstanz ────────────────────────────────────')

// D1 Eine gemessene Wand verschieben traegt den Umbau-Hinweis.
{
  const t = objektAn({ x: 400, y: 150 }, welt())
  const m = menueFuer(t, welt())
  const ziehen = (m?.eintraege ?? []).find((e) => e.handlung === 'wand-ziehen')
  pruefe(/Umbau/.test(ziehen?.hinweis ?? ''), 'D1 gemessene Wand verschieben nennt den Umbau')
}

// D2 GEGENPROBE: eine GESETZTE Wand traegt ihn nicht — sonst waere der Hinweis
// Dekoration statt Aussage.
{
  const gesetzt = WAENDE.map((x) => (x.id === 'w-trenn' ? { ...x, quelle: 'gesetzt' } : x))
  const welt2 = { ...welt(), waende: gesetzt }
  const t = objektAn({ x: 400, y: 150 }, welt2)
  const m = menueFuer(t, welt2)
  const ziehen = (m?.eintraege ?? []).find((e) => e.handlung === 'wand-ziehen')
  pruefe(!ziehen?.hinweis, 'D2 eine gesetzte Wand traegt KEINEN Umbau-Hinweis')
  pruefe(/\(gesetzt\)/.test(m?.titel ?? ''), 'D2b der Titel sagt trotzdem, dass sie gesetzt ist')
}

// D3 Beim Verbinden zaehlt der Hinweis die GEMESSENEN Waende, nicht alle.
{
  const t = objektAn({ x: 200, y: 150 }, welt())
  const m = menueFuer(t, welt())
  const verbinden = (m?.eintraege ?? []).find((e) => e.handlung === 'raeume-verbinden')
  pruefe(/[Ee]ine gemessene Wand fällt/.test(verbinden?.hinweis ?? ''), 'D3 die gemessene Wand wird genannt')
}

/* ================================================ E) Kein toter Eintrag */

log('\n── E) Kein toter Eintrag ───────────────────────────────────────')

// E1 Jeder Eintrag hat entweder eine Handlung ODER eine Auskunft — nie beides
// leer. Ein grauer Eintrag ohne Grund ist ein Katalog, keine Bedienung.
{
  const faelle = [
    { p: { x: 200, y: 150 }, was: 'Raum' },
    { p: { x: 400, y: 150 }, was: 'Wand' },
    { p: { x: 0, y: 150 }, was: 'Aussenwand' },
    { p: { x: 400, y: 5 }, was: 'Ecke' }
  ]
  let alleGut = true
  for (const f of faelle) {
    const m = menueFuer(objektAn(f.p, welt()), welt())
    for (const e of m?.eintraege ?? []) {
      if (!e.handlung && !e.hinweis) alleGut = false
    }
    if (!m || (m.eintraege ?? []).length === 0) alleGut = false
  }
  pruefe(alleGut, 'E1 jeder Eintrag traegt eine Handlung oder eine Auskunft')
}

// E2 Eine zu kurze Wand bietet KEIN Tuer-Einsetzen an — dort passt keine.
{
  const kurz = WAENDE.concat([
    { id: 'w-kurz', aId: 'e1', bId: 'e1', a: { x: 0, y: 400 }, b: { x: 60, y: 400 }, quelle: 'gesetzt', dicke: 10 }
  ])
  const welt2 = { ...welt(), waende: kurz }
  const t = objektAn({ x: 30, y: 400 }, welt2)
  const m = menueFuer(t, welt2)
  pruefe(
    !(m?.eintraege ?? []).some((e) => e.handlung === 'wand-oeffnung'),
    'E2 in eine 0,60-m-Wand wird keine Tuer angeboten'
  )
}

// E3 GEGENPROBE zu E2: in die 3-m-Trennwand schon.
{
  const t = objektAn({ x: 400, y: 150 }, welt())
  const m = menueFuer(t, welt())
  pruefe(
    (m?.eintraege ?? []).some((e) => e.handlung === 'wand-oeffnung'),
    'E3 in die 3-m-Wand wird eine Tuer angeboten'
  )
}

// E4 Ein Durchgang bietet keinen Anschlag an — er hat kein Blatt.
{
  const oeffnungen = [{ id: 'o-d', wandId: 'w-trenn', art: 'durchgang', lage: 150, breite: 100 }]
  const welt2 = welt({ oeffnungen })
  const m = menueFuer(objektAn({ x: 400, y: 150 }, welt2), welt2)
  pruefe(
    !(m?.eintraege ?? []).some((e) => e.handlung === 'oeffnung-anschlag'),
    'E4 ein Durchgang hat keinen Anschlag'
  )
}

// E5 GEGENPROBE zu E4: eine Tuer schon.
{
  const oeffnungen = [{ id: 'o-t', wandId: 'w-trenn', art: 'tuer', lage: 150, breite: 87.5 }]
  const welt2 = welt({ oeffnungen })
  const m = menueFuer(objektAn({ x: 400, y: 150 }, welt2), welt2)
  pruefe(
    (m?.eintraege ?? []).some((e) => e.handlung === 'oeffnung-anschlag'),
    'E5 eine Tuer hat einen Anschlag'
  )
}

// E6 Am Handy gibt es kein Q/E (W8) — die Dreh-Eintraege SIND der Ersatz und
// muessen deshalb im Moebel-Menue stehen.
{
  const moebel = [{ id: 'm1', typ: 'matte', x: 200, y: 150, breite: 180, tiefe: 60, drehung: 0 }]
  const welt2 = welt({ moebel })
  const m = menueFuer(objektAn({ x: 200, y: 150 }, welt2), welt2)
  const drehen = (m?.eintraege ?? []).filter((e) => (e.handlung ?? '').startsWith('moebel-drehen'))
  pruefe(drehen.length === 2, 'E6 Drehen in beide Richtungen steht im Moebel-Menue')
}

// E7 Nichts getroffen -> kein Menue. Ein leeres Menue am leeren Fleck waere ein
// Fenster ohne Inhalt.
{
  pruefe(menueFuer(null, welt()) === null, 'E7 ohne Treffer gibt es kein Menue')
}

/* ============================================== F) DAS BUENDEL (Aktivierung) */

log('\n── F) Das Buendel — vorhanden ist nicht aktiviert ──────────────')

// F1 Die Datei steht in RAUM_MODULE. Fehlt sie dort, ist sie im Planer da
// (import laedt nach) und in der Doppelklick-Datei WEG — als tote Bedienung
// ohne Fehlermeldung. Das ist die Lehre aus W12 (buendleKern bringt die
// Rechnung selbst mit, damit kein Bauer sie vergessen kann).
{
  pruefe(RAUM_MODULE.includes('objekt-menue.js'), 'F1 objekt-menue.js steht in RAUM_MODULE')
  pruefe(
    RAUM_MODULE.indexOf('raum-zusammenlegen.js') < RAUM_MODULE.indexOf('objekt-menue.js'),
    'F1b und zwar NACH raum-zusammenlegen.js'
  )
}

// F2 Der springende Punkt: im Buendel gibt es KEINE import-Zeilen mehr. Ein
// umbenannter Import (`as RZ`) waere dort `undefined` — und der Fehler kaeme
// erst beim ersten Griff, nicht beim Laden. Hier wird das Buendel WIRKLICH
// ausgefuehrt und befragt.
{
  const quelle = buendleRaum()
  pruefe(!/^\s*import\s/m.test(quelle), 'F2 das Buendel enthaelt keine import-Zeile mehr')

  const datei = path.join(DIR, 'buendel.mjs')
  fs.writeFileSync(
    datei,
    quelle + '\nexport { objektAn, menueFuer, nachbarnVon, raeumeAnWand }\n'
  )
  let B = null
  let ladeFehler = null
  try {
    B = await import(pathToFileURL(datei).href)
  } catch (e) {
    ladeFehler = e
  }
  pruefe(!ladeFehler, `F3 das Buendel laedt ohne Fehler${ladeFehler ? ` — ${ladeFehler.message}` : ''}`)

  if (B) {
    // F4 Dieselbe Frage wie A2, aber am GEBUENDELTEN Stand. Waere `_pruefzugang`
    // dort nicht aufloesbar, flöge es genau hier.
    const t = B.objektAn({ x: 400, y: 150 }, welt())
    pruefe(t?.art === 'wand' && t.id === 'w-trenn', 'F4 im Buendel trifft der Griff dieselbe Wand')

    // F5 Und der ganze Weg zum Verbinden steht auch dort.
    const m = B.menueFuer(t, welt())
    pruefe(
      (m?.eintraege ?? []).some((e) => e.handlung === 'raeume-verbinden'),
      'F5 im Buendel fuehrt die Wand zum Verbinden'
    )

    // F6 Und der Raum-Weg ebenso — beide Wege, weil beide der Nutzer geht.
    const mr = B.menueFuer(B.objektAn({ x: 200, y: 150 }, welt()), welt())
    pruefe(
      (mr?.eintraege ?? []).some((e) => e.handlung === 'raeume-verbinden'),
      'F6 im Buendel fuehrt auch der Raum zum Verbinden'
    )
  }
}

/* ══════════════════════ G-I) DIE ECHTE DOPPELKLICK-DATEI ═════════════════ */

if (laeuft('datei')) {
  await import('./pruefe-menue-datei.mjs').then((m) => m.fahre({ log, pruefe }))
}

/* ------------------------------------------------------------------- Ende */

log('')
if (fehler.length) {
  log(`DURCHGEFALLEN ${fehler.length} Pruefung(en):`)
  for (const f of fehler) log(`  - ${f}`)
  process.exit(1)
}
log('Alle Pruefungen bestanden.')
process.exit(0)
