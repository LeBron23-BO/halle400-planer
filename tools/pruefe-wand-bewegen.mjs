// Prueft WÄNDE BEWEGEN (W12b) — `src/raum/wand-bewegen.js`, ohne Browser.
//
//   node tools/pruefe-wand-bewegen.mjs
//   Exit 0 = alle Pruefungen bestanden, 1 = mindestens eine durchgefallen.
//
// WORUM ES GEHT
// Eine Wand parallel zu verschieben ist NICHT dasselbe wie ein Moebel zu ziehen:
// ihre Endecken haengen an den Nachbarwaenden. Wird sie naiv um 40 cm verschoben,
// reissen dort zwei Luecken auf — und ein Grundriss mit Luecken hat KEINE Raeume
// mehr (`findRooms` sucht geschlossene Ringe). Die Raumnamen fallen weg, die
// Flaechen im Businessplan werden null, und all das ohne Fehlermeldung. Genau
// deshalb wird hier gemessen, dass die Endecken GLEITEN.
//
// FUENF ABSCHNITTE:
//   A) Gleiten an senkrechten Nachbarn   B) Nur quer, nie laengs
//   C) Grenzen (Raum wird nicht zum Spalt)   D) Schiefe und freie Enden
//   E) Der Vorschlag (Umbau-Kennzeichnung, Rueckholbarkeit)
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { WURZEL } from './buendel-kern.mjs'

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'h400-wand-'))
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

const M = await import(pathToFileURL(path.join(WURZEL, 'src/raum/wand-bewegen.js')).href)
const { verschiebeWandParallel, wandVerschiebenPlanen, _wbPruefzugang: W } = M

/* ---------------------------------------------------------------- Baukasten */

// Zwei Raeume nebeneinander, 8 × 3 m, Trennwand auf x = 400.
//   e1(0,0) — e2(400,0) — e3(800,0)
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
  quelle: extra.quelle ?? 'gemessen'
})
const WAENDE = [
  w('n1', 'e1', 'e2'), // Nordwand links
  w('n2', 'e2', 'e3'), // Nordwand rechts
  w('ost', 'e3', 'e4'),
  w('s2', 'e4', 'e5'), // Suedwand rechts
  w('s1', 'e5', 'e6'), // Suedwand links
  w('west', 'e6', 'e1'),
  w('trenn', 'e2', 'e5') // DIE TRENNWAND
]
const TRENN = WAENDE.find((x) => x.id === 'trenn')

/* ==================================== A) Gleiten an senkrechten Nachbarn */

log('')
log('A) GLEITEN — die Endecken rutschen auf den Nachbarwaenden')

const r = verschiebeWandParallel(TRENN, WAENDE, 100, 0)
pruefe(r.ecken.length === 2, `a) beide Endecken bekommen eine neue Lage (${r.ecken.length})`)
pruefe(
  r.ecken.every((e) => e.gleitet === true),
  'a) und BEIDE gleiten (sie haengen an Nord- und Suedwand), keine wird nur mitgenommen'
)
pruefe(
  r.ecken.every((e) => e.x === 500),
  `a) die Wand steht jetzt auf x = 500 (${r.ecken.map((e) => e.x).join(', ')})`
)
pruefe(
  r.ecken.find((e) => e.id === 'e2')?.y === 0 && r.ecken.find((e) => e.id === 'e5')?.y === 300,
  'a) die Ecken bleiben AUF der Nord- bzw. Suedwand (y unveraendert 0 und 300) — ' +
    'genau das haelt den Grundriss geschlossen'
)
pruefe(
  r.ecken.find((e) => e.id === 'e2')?.aufWand === 'n1' ||
    r.ecken.find((e) => e.id === 'e2')?.aufWand === 'n2',
  `a) und es ist benannt, auf welcher Wand sie gleitet (${r.ecken.find((e) => e.id === 'e2')?.aufWand})`
)

// Die Gegenprobe zum ganzen Verfahren: OHNE Gleiten (naive Parallelverschiebung)
// waeren die Ecken von der Nordwand abgerueckt — und dort klafft dann eine Luecke.
const naiv = { x: TRENN.a.x + 100, y: TRENN.a.y + 0 }
pruefe(
  naiv.y === 0 && r.ecken.find((e) => e.id === 'e2').y === 0,
  'a-VORBEDINGUNG) bei einer achsenparallelen Wand faellt naiv und gleitend zusammen — ' +
    'der Unterschied zeigt sich erst bei schiefen Nachbarn (Abschnitt D)'
)

const zurueck = verschiebeWandParallel(TRENN, WAENDE, -150, 0)
pruefe(
  zurueck.ecken.every((e) => e.x === 250),
  `a) in die andere Richtung ebenso (x = ${zurueck.ecken[0].x})`
)

/* ============================================== B) Nur quer, nie laengs */

log('')
log('B) NUR QUER — der Laengsanteil wird verworfen')

const laengs = verschiebeWandParallel(TRENN, WAENDE, 0, 200)
pruefe(
  laengs.quer === 0,
  `b) eine Bewegung ENTLANG der Wand ergibt keine Verschiebung (quer = ${laengs.quer})`
)
pruefe(
  laengs.ecken.every((e) => e.x === 400),
  'b) die Wand bleibt, wo sie war — sonst waeren alle Tueren darin verrutscht ' +
    '(lage ist ein absolutes Mass von der Start-Ecke, W4)'
)

const schraegZug = verschiebeWandParallel(TRENN, WAENDE, 100, 200)
pruefe(
  schraegZug.strecke === 100 && schraegZug.ecken.every((e) => e.x === 500),
  `b) bei einem schraegen Zug wirkt NUR der Querteil (${schraegZug.strecke} cm von 100/200)`
)
// Geprueft wird `strecke` und nicht `quer`: das Vorzeichen von `quer` haengt an
// der Umlaufrichtung der Wand (Normale von e2->e5 zeigt nach -x), und ein Gate,
// das darauf besteht, prueft die Reihenfolge der Ecken statt die Bewegung.
pruefe(
  Math.abs(schraegZug.quer) === schraegZug.strecke,
  `b) und die Anzeige-Groesse ist der Betrag davon (quer ${schraegZug.quer} -> strecke ${schraegZug.strecke})`
)

/* ================================================= C) Grenzen des Raums */

log('')
log('C) GRENZEN — ein Raum wird nicht zum Spalt')

const zuWeit = verschiebeWandParallel(TRENN, WAENDE, 500, 0)
pruefe(
  zuWeit.begrenzt === true,
  'c) ein Zug bis x = 900 (ueber die Aussenwand hinaus) wird BEGRENZT'
)
pruefe(
  zuWeit.ecken.every((e) => e.x === 770),
  `c) und zwar auf 30 cm vor der Ostwand (x = ${zuWeit.ecken[0].x} von 800)`
)
pruefe(
  !!zuWeit.grund && /Spalt|kein Raum/.test(zuWeit.grund),
  'c) mit einem Satz, der es SAGT — nicht stumm verweigert und nicht stumm ausgefuehrt'
)
const zuWeitLinks = verschiebeWandParallel(TRENN, WAENDE, -500, 0)
pruefe(
  zuWeitLinks.begrenzt && zuWeitLinks.ecken.every((e) => e.x === 30),
  `c) nach links ebenso (x = ${zuWeitLinks.ecken[0].x})`
)
const knapp = verschiebeWandParallel(TRENN, WAENDE, 300, 0)
pruefe(
  !knapp.begrenzt && knapp.ecken.every((e) => e.x === 700),
  `c-GEGENPROBE) ein Zug INNERHALB der Grenze wird nicht angetastet (x = ${knapp.ecken[0].x})`
)
const eigeneGrenze = verschiebeWandParallel(TRENN, WAENDE, 500, 0, { mindestAbstand: 100 })
pruefe(
  eigeneGrenze.ecken.every((e) => e.x === 700),
  `c) die Untergrenze ist einstellbar (100 cm -> x = ${eigeneGrenze.ecken[0].x})`
)

/* ======================================== D) Schiefe Nachbarn, freie Enden */

log('')
log('D) SCHIEFE NACHBARN + FREIE ENDEN')

// Ein Raum mit schraeger Nordwand: e2 liegt auf einer Wand, die von (0,0) nach
// (800,-200) laeuft. Verschiebt man die Trennwand um 100 nach rechts, MUSS die
// Ecke der Schraege folgen — also auch in y wandern. Genau hier trennt sich
// Gleiten von naiver Parallelverschiebung.
const S = {
  s1: { x: 0, y: 0 },
  s2: { x: 400, y: -100 },
  s3: { x: 800, y: -200 },
  s4: { x: 800, y: 300 },
  s5: { x: 400, y: 300 },
  s6: { x: 0, y: 300 }
}
const sw = (id, aId, bId) => ({ id, aId, bId, a: S[aId], b: S[bId], quelle: 'gemessen' })
const SCHIEF = [
  sw('sn1', 's1', 's2'),
  sw('sn2', 's2', 's3'),
  sw('sost', 's3', 's4'),
  sw('ss2', 's4', 's5'),
  sw('ss1', 's5', 's6'),
  sw('swest', 's6', 's1'),
  sw('strenn', 's2', 's5')
]
const STRENN = SCHIEF.find((x) => x.id === 'strenn')
const schief = verschiebeWandParallel(STRENN, SCHIEF, 100, 0)
const oben = schief.ecken.find((e) => e.id === 's2')
pruefe(
  !!oben && oben.gleitet && oben.y !== -100,
  `d) an einer SCHRAEGEN Nordwand wandert die Ecke in y mit (${oben?.y} statt -100) — ` +
    'naiv verschoben klaffte hier eine Luecke'
)
pruefe(
  !!oben && Math.abs(oben.y - -125) <= 1,
  `d) und zwar genau auf die Schraege (y = ${oben?.y}, gerechnet -125 bei 100 cm auf 4:1-Neigung)`
)
const untenS = schief.ecken.find((e) => e.id === 's5')
pruefe(
  !!untenS && untenS.y === 300,
  `d) das andere Ende bleibt auf seiner geraden Wand (y = ${untenS?.y})`
)

// Ein freies Wandende: eine Stichwand, die nur an EINEM Ende anschliesst.
const FREI = [
  ...WAENDE,
  { id: 'stich', aId: 'e2', bId: 'frei', a: P.e2, b: { x: 400, y: 150 }, quelle: 'gesetzt' }
]
const stich = FREI.find((x) => x.id === 'stich')
const freiR = verschiebeWandParallel(stich, FREI, 60, 0)
const freiesEnde = freiR.ecken.find((e) => e.id === 'frei')
pruefe(
  !!freiesEnde && freiesEnde.gleitet === false && freiesEnde.x === 460,
  `d) ein FREIES Wandende wird einfach mitgenommen (x = ${freiesEnde?.x}, gleitet = ${freiesEnde?.gleitet})`
)

pruefe(
  W.wbSchnitt({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 50 }, { x: 1, y: 0 }) === null,
  'd) zwei parallele Geraden haben KEINEN brauchbaren Schnittpunkt (null statt einer Fantasiezahl)'
)
pruefe(
  W.wbGleitWand([{ id: 'p', a: { x: 0, y: 0 }, b: { x: 100, y: 0 } }], { x: 1, y: 0 }) === null,
  'd) eine fast parallele Nachbarwand wird als Gleitwand ABGELEHNT — ihr Schnittpunkt ' +
    'laege weit draussen (ein winziger Winkel wirkt wie ein Hebel)'
)

/* ============================================== E) Der Vorschlag */

log('')
log('E) DER VORSCHLAG — Umbau benennen, Rueckholbarkeit sichern')

const v = wandVerschiebenPlanen(TRENN, WAENDE, 100, 0)
pruefe(v.moeglich, 'e) der Vorschlag kommt zustande')
pruefe(v.istUmbau === true, 'e) eine GEMESSENE Wand zu verschieben ist ein UMBAU')
pruefe(
  !!v.umbauSatz && /Blattkopf|Ausdruck/.test(v.umbauSatz),
  'e) und der Satz dazu nennt, wo es steht (Blattkopf, Ausdruck)'
)
pruefe(
  !!v.vorher && v.vorher.a.x === 400 && v.vorher.b.x === 400,
  'e) der GEMESSENE Stand wird mitgeschrieben — sonst waere der Umbau eine Einbahnstrasse ' +
    '(die Ecken-Kennung ist der Hash ihrer Koordinate)'
)

const gezeichnet = { ...TRENN, quelle: 'gesetzt' }
const vg = wandVerschiebenPlanen(gezeichnet, WAENDE, 100, 0)
pruefe(
  vg.moeglich && vg.istUmbau === false && vg.vorher === null && vg.umbauSatz === null,
  'e-GEGENPROBE) eine selbst GEZEICHNETE Wand zu verschieben ist kein Umbau und braucht kein Vorher'
)

const vGrenze = wandVerschiebenPlanen(TRENN, WAENDE, 500, 0)
pruefe(
  vGrenze.moeglich && vGrenze.begrenzt && !!vGrenze.hinweis,
  'e) eine begrenzte Bewegung ist MOEGLICH und traegt den Hinweis mit'
)

const ohneLaenge = wandVerschiebenPlanen(
  { id: 'x', aId: 'a', bId: 'b', a: { x: 5, y: 5 }, b: { x: 5, y: 5 } },
  WAENDE,
  10,
  10
)
pruefe(
  !ohneLaenge.moeglich && !!ohneLaenge.grund,
  'e) eine Wand ohne Laenge wird mit Grund abgelehnt statt durch null geteilt'
)

/* ================================ F) AM ECHTEN KERN — drei Bedienwege, EIN Zug */

// Die Frage, die allein zaehlt: kann man die Wand jetzt WIRKLICH ziehen? Gemessen
// am echten Floorplanner, ueber `zugBeginnen`/`zugSchritt`/`zugBeenden` — genau
// die drei Methoden, die Maus (Grundriss), Blatt (Axonometrie) und Finger (Handy)
// alle benutzen. Geht es hier, geht es in allen drei Bedienwegen.

log('')
log('F) AM ECHTEN KERN — der Zug, den alle drei Bedienwege teilen')

const { buendleKern, buendleThree, uebersetzeKern } = await import('./buendel-kern.mjs')
let K = null
let ladeFehler = null
try {
  const quelle = `${buendleThree()}\n${buendleKern(uebersetzeKern())}`
  K = new Function(`${quelle}\nreturn { Floorplan, Floorplanner, floorplannerModes };`)()
} catch (e) {
  ladeFehler = e.message.split('\n')[0]
}
pruefe(K !== null, `f) der Kern buendelt sich mit der neuen Wand-Rechnung${ladeFehler ? ` — ${ladeFehler}` : ''}`)

if (K) {
  const fp = new K.Floorplan()
  const c = {}
  const setze = (n, x, y) => (c[n] = fp.newCorner(x, y))
  setze('a', 0, 0)
  setze('b', 400, 0)
  setze('d', 800, 0)
  setze('e', 800, 300)
  setze('f', 400, 300)
  setze('g', 0, 300)
  fp.newWall(c.a, c.b)
  fp.newWall(c.b, c.d)
  fp.newWall(c.d, c.e)
  fp.newWall(c.e, c.f)
  fp.newWall(c.f, c.g)
  fp.newWall(c.g, c.a)
  const trennwand = fp.newWall(c.b, c.f)
  fp.update()
  pruefe(fp.getRooms().length === 2, `f) zwei Raeume stehen (${fp.getRooms().length})`)

  // Der Zeichner ohne Leinwand: fuer diesen Zug braucht er keine — `zugBeginnen`
  // und `zugSchritt` rechnen, sie malen nicht.
  const zeichner = Object.create(K.Floorplanner.prototype)
  zeichner.floorplan = fp
  zeichner.view = { draw() {} }
  zeichner.undoManager = { anzahl: 0, snapshot() { this.anzahl++ } }
  zeichner.zeigerStilSetzen = () => {}

  const flaechenVorher = fp.getRooms().map((r) =>
    Math.round(G_flaeche(r.corners) / 10000)
  ).sort((x, y) => x - y)

  const gegriffen = zeichner.zugBeginnen(trennwand.id, 400, 150)
  pruefe(gegriffen === true, 'f) die WAND laesst sich greifen — genau das ging vorher nicht')
  pruefe(
    zeichner.wandZugLaeuft() === trennwand.id,
    'f) und der Zeichner weiss, dass ein Wand-Zug laeuft (fuer die Hinweiszeile)'
  )

  const bewegt = zeichner.zugSchritt(500, 150)
  pruefe(bewegt === true, 'f) ein Schritt um 100 cm quer wirkt')
  pruefe(
    Math.round(trennwand.getStartX()) === 500 && Math.round(trennwand.getEndX()) === 500,
    `f) die Wand steht jetzt auf x = 500 (${Math.round(trennwand.getStartX())}, ${Math.round(trennwand.getEndX())})`
  )
  pruefe(
    Math.round(trennwand.getStartY()) === 0 && Math.round(trennwand.getEndY()) === 300,
    'f) ihre Endecken sind AUF Nord- und Suedwand geblieben — der Grundriss ist nicht aufgerissen'
  )
  pruefe(
    zeichner.undoManager.anzahl === 1,
    `f) EIN Rueckgaengig-Schritt fuer den ganzen Zug (${zeichner.undoManager.anzahl})`
  )
  pruefe(
    trennwand.quelle === 'gesetzt',
    `f) die Wand ist jetzt als UMBAU gekennzeichnet, nicht mehr als Aufmass (${trennwand.quelle})`
  )

  zeichner.zugSchritt(500, 400)
  pruefe(
    Math.round(trennwand.getStartX()) === 500,
    'f) ein Zug ENTLANG der Wand aendert nichts (sonst waeren alle Tueren darin verrutscht)'
  )

  zeichner.zugBeenden()
  pruefe(zeichner.wandZugLaeuft() === null, 'f) nach dem Loslassen laeuft kein Zug mehr')
  pruefe(
    fp.getRooms().length === 2,
    `f) es sind noch ZWEI Raeume — die Wand ist verschoben, nicht entfernt (${fp.getRooms().length})`
  )
  const flaechenNachher = fp.getRooms().map((r) =>
    Math.round(G_flaeche(r.corners) / 10000)
  ).sort((x, y) => x - y)
  pruefe(
    flaechenNachher[0] !== flaechenVorher[0] || flaechenNachher[1] !== flaechenVorher[1],
    `f) und die Raeume haben ihre Groesse GEAENDERT (${flaechenVorher.join('/')} -> ${flaechenNachher.join('/')} m²) — ` +
      'das ist "Raum vergroessern"'
  )
  pruefe(
    flaechenNachher[0] + flaechenNachher[1] === flaechenVorher[0] + flaechenVorher[1],
    'f) die Gesamtflaeche bleibt gleich — was der eine gewinnt, verliert der andere'
  )

  // Der Finger am Handy geht durch DENSELBEN Zug (fingerStart -> zugBeginnen).
  pruefe(
    K.floornerModes === undefined && typeof K.floorplannerModes.WAND === 'number',
    `f) das Wand-Werkzeug ist ein eigener Modus (${K.floorplannerModes.WAND}) — ` +
      'der Finger unterscheidet daran, ob er Moebel oder Waende greift'
  )
}

function G_flaeche(ecken) {
  let s = 0
  for (let i = 0; i < ecken.length; i++) {
    const a = ecken[i]
    const b = ecken[(i + 1) % ecken.length]
    s += a.x * b.y - b.x * a.y
  }
  return Math.abs(s) / 2
}

/* ==================================================================== Schluss */

log('')
log(fehler.length === 0 ? 'ALLE PRUEFUNGEN BESTANDEN' : `DURCHGEFALLEN: ${fehler.length}`)
fehler.forEach((f) => log('  - ' + f))
log(`Bericht: ${BERICHT}`)
process.exit(fehler.length === 0 ? 0 : 1)
