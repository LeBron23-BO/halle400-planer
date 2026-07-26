// Prueft den RUECKWEG (W5) — die Bearbeitung des Nutzers zurueck ins Projekt.
//
//   node tools/pruefe-uebernahme.mjs
//   Exit 0 = alle Pruefungen bestanden, 1 = mindestens eine durchgefallen.
//
// WORUM ES GEHT
// `tools/export_blueprint.py` erzeugt `app/public/plaene/halle400.json` NEU.
// Ohne Schutz ueberschreibt der naechste Lauf jede Bearbeitung — zwei Stunden
// Arbeit weg, ohne Warnung. Zugleich ist die PDF die alleinige Grundwahrheit
// der Geometrie: was der Nutzer setzt, darf nie als Aufmass durchgehen. Dieses
// Werkzeug misst beide Seiten dieser Klinge.
//
// OHNE BROWSER, ABER AM ECHTEN KONSUMENTEN
// Die anderen Gates messen am gerenderten Bild und brauchen dafuer Chromium.
// Hier geht es um Dateien und um das, was der KERN beim Laden daraus macht —
// dafuer ist ein Browser unnoetiger Aufwand. Der Kern wird stattdessen mit
// derselben Uebersetzung, aus der auch die Doppelklick-Datei baut
// (`buendel-kern.mjs`), in diesen Node-Prozess geholt. Gemessen wird also an
// `Floorplan.loadFloorplan` selbst und nicht an einer nachgebauten Regel:
// ob ein Stueck nach dem Bau als `gesetzt` gilt, entscheidet der Kern, nicht
// dieses Gate.
//
// ZEHN BEHAUPTUNGEN, jede mit Gegenprobe:
//
//   a) Ohne Setzungen erzeugt der Export den GEMESSENEN Stand, byte-identisch
//      mit `git show HEAD:app/public/plaene/halle400.json`.
//      GEGENPROBE: mit Setzungen MUSS die Datei abweichen.
//   b) Die Uebernahme klassifiziert nach der Tabelle: verschoben (mit `beleg`)
//      / neu (ohne) / geloescht / Oeffnung / Raumname — in getrennten
//      Abschnitten.
//   c) Der Trockenlauf ist der Standard: ohne --schreibe bleibt gesetzt.json
//      unberuehrt. Die Roh-Sicherung entsteht trotzdem.
//   d) Uebernahme -> Export -> die Zahl der Setzungen IM GELADENEN PLAN
//      stimmt mit der Nutzerdatei ueberein.
//      GEGENPROBE: ohne gesetzt.json faellt sie auf 0.
//   e) Alle Ecken der erzeugten Datei sind hash-treu (heute 76/76).
//      GEGENPROBE: eine Ecke um 3 cm verschieben -> das Werkzeug meldet rot.
//   f) Kein Stueck mit `beleg` traegt nach dem Bau `gemessen`, wenn es in den
//      Verschiebungen steht — und der `beleg` bleibt erhalten.
//   g) Eine Attrappe mit einer um 5 cm verschobenen GEMESSENEN Ecke bricht die
//      Uebernahme mit Exit != 0 ab, und gesetzt.json bleibt unveraendert.
//   h) DER WAECHTER: eine Zieldatei mit ungedeckten Setzungen laesst den Export
//      abbrechen (Exit 1) und schreibt NICHTS.
//      GEGENPROBE: mit der passenden gesetzt.json laeuft derselbe Export durch.
//   i) Wand wandert 10 cm (Nachmessen): die Tuer folgt ueber ihren Anker auf die
//      NEUE Wand-Kennung — gemessen daran, dass die Kennung sich wirklich
//      geaendert hat.
//   j) Wand wandert 60 cm: die Tuer wird verwaist, aber NICHT geloescht.
//
// ZEILENENDEN: die Zieldatei traegt auf der Platte CRLF (Pythons `write_text`
// uebersetzt `\n` unter Windows), git speichert sie mit LF. Verglichen wird
// deshalb nach genau der Normalisierung, die git beim Einchecken selbst
// anwendet — und zusaetzlich wird geprueft, dass der Groessenunterschied
// EXAKT der Zahl der Zeilenenden entspricht. Sonst waere „byte-identisch"
// eine Behauptung mit Hintertuer.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { uebersetzeKern, buendleKern, buendleThree, WURZEL } from './buendel-kern.mjs'

const PYTHON = process.env.PYTHON_PFAD || 'python'
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'h400-uebernahme-'))
const BERICHT = path.join(DIR, 'bericht.txt')
fs.writeFileSync(BERICHT, '')
const log = (s) => {
  console.log(s)
  fs.appendFileSync(BERICHT, s + '\n')
}
const fehler = []
const pruefe = (bedingung, text) => {
  const zeile = `${bedingung ? 'OK  ' : 'FEHL'} ${text}`
  log(zeile)
  if (!bedingung) fehler.push(text)
}
const tmp = (name) => path.join(DIR, name)

/* ── Werkzeuge ────────────────────────────────────────────────────────── */

/** Ruft ein Python-Werkzeug und gibt Ausgang UND Ausgabe zurueck — beides
 *  wird gebraucht: der Exit-Code fuer das Gate, die Ausgabe fuer die Meldung
 *  im Fehlerfall. */
function python(...args) {
  try {
    const aus = execFileSync(PYTHON, args, {
      cwd: WURZEL, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
    })
    return { code: 0, aus }
  } catch (e) {
    return { code: e.status ?? -1, aus: `${e.stdout || ''}${e.stderr || ''}` }
  }
}

const jsonLesen = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
/** Bytes als latin1-Zeichenkette — verlustfrei, damit `===` wirklich Bytes
 *  vergleicht und nicht eine Deutung davon. */
const bytes = (b) => Buffer.from(b).toString('latin1')

log('Uebersetze den Kern (tsc) …')
const kernQuelle = `${buendleThree()}\n${buendleKern(uebersetzeKern())}`
const KERN = new Function(`${kernQuelle}\nreturn { Floorplan };`)()
log(`Kern geladen: ${Math.round(kernQuelle.length / 1024)} kB`)

/** DER ECHTE KONSUMENT: eine Plandatei durch `Floorplan.loadFloorplan` jagen
 *  und das fragen, was der Planer selbst zaehlt. */
function ladeModell(datei) {
  const roh = jsonLesen(datei)
  const f = new KERN.Floorplan()
  f.loadFloorplan(roh.floorplan || roh)
  return f
}

function messe(datei) {
  const f = ladeModell(datei)
  return {
    f,
    ecken: f.getCorners().length,
    waende: f.getWalls().length,
    ausstattung: f.getAusstattung().length,
    gesetzte: f.zaehleGesetzte(),
    oeffnungen: f.zaehleOeffnungen(),
    verwaiste: f.zaehleVerwaiste(),
    raumnamen: Object.keys(f.getAllRoomMeta()).length
  }
}

/* ── Die Attrappe: eine Bearbeitung, wie der Nutzer sie macht ─────────────
   Gebaut mit dem KERN, nicht von Hand geschrieben: `verschiebeAusstattung`
   setzt `quelle` und behaelt den `beleg`, `fuegeAusstattungHinzu` kann keinen
   haben, `fuegeOeffnungHinzu` rechnet den Anker. Eine handgeschriebene
   Attrappe waere eine zweite Meinung darueber, wie eine Bearbeitung aussieht —
   und genau die soll hier gemessen werden. */
function baueNutzerdatei(quellPlan, ziel) {
  const roh = jsonLesen(quellPlan)
  const f = new KERN.Floorplan()
  f.loadFloorplan(roh.floorplan)

  const mess = f.getAusstattung().filter((e) => e.beleg && e.quelle === 'gemessen')
  if (mess.length < 3) throw new Error('zu wenige gemessene Stuecke fuer die Attrappe')
  const verschoben = mess[0]
  const gedreht = mess[1]
  const geloescht = mess[2]
  const zielX = verschoben.x + 40
  const zielY = verschoben.y + 25
  f.verschiebeAusstattung(verschoben.id, zielX, zielY)
  f.dreheAusstattung(gedreht.id, 0.7854) // 45 Grad
  f.entferneAusstattung(geloescht.id)

  const matte = f.fuegeAusstattungHinzu({ typ: 'matte', x: 1000, y: 800, breite: 180, tiefe: 60 })
  const liege = f.fuegeAusstattungHinzu({ typ: 'liege', x: 1400, y: 800, breite: 200, tiefe: 70 })

  // Ein langes Stueck der SUEDKONTUR (y = 1531 cm). Lang genug, damit beide
  // Oeffnungen weit von den Enden entfernt sitzen — sonst faende die
  // Versoehnung in Pruefung (j) eine querstehende Wand in Reichweite, und der
  // Beweis „verwaist" waere gar keiner.
  const suedwand = f.getWalls()
    .filter((w) => Math.abs(w.getStartY() - 1531) < 0.5 && Math.abs(w.getEndY() - 1531) < 0.5)
    .map((w) => ({ w, laenge: Math.abs(w.getEndX() - w.getStartX()) }))
    .sort((a, b) => b.laenge - a.laenge)[0]
  if (!suedwand || suedwand.laenge < 900) {
    throw new Error(`keine Suedwand >= 900 cm gefunden (laengste: ${suedwand?.laenge})`)
  }
  const mitte = suedwand.laenge / 2
  const tuer = f.fuegeOeffnungHinzu({
    wandId: suedwand.w.id, lage: mitte, breite: 87.5, art: 'tuer', seite: 1, anschlag: 'anfang'
  })
  const fenster = f.fuegeOeffnungHinzu({
    wandId: suedwand.w.id, lage: mitte + 200, breite: 125, art: 'fenster',
    seite: -1, anschlag: 'ende', bruestung: 90
  })
  if (!tuer || !fenster) throw new Error('Oeffnung liess sich nicht setzen')

  f.setRoomName('pruefe-uebernahme-raum', 'Empfang Nord')

  const daten = { floorplan: f.saveFloorplan(), items: roh.items || [], labels: roh.labels || [] }
  fs.writeFileSync(ziel, JSON.stringify(daten, null, 2), 'utf8')
  return {
    verschoben, gedreht, geloescht, matte, liege, tuer, fenster,
    zielX, zielY, wandId: suedwand.w.id, wandLaenge: suedwand.laenge,
    gesetzteImModell: f.zaehleGesetzte()
  }
}

/** Kopiert data/walls.json und verschiebt die SUEDKONTUR — das ist der Fall,
 *  fuer den der Anker gebaut ist: nach einem Nachmessen bekommt jede Ecke eine
 *  neue Kennung (sie IST der Hash der Koordinate), damit auch jede Wand, und
 *  die Tuer haengt an einer Kennung, die es nicht mehr gibt. */
function waendeVerschoben(dyMeter, ziel) {
  const w = jsonLesen(path.join(WURZEL, 'data/walls.json'))
  let n = 0
  for (const s of w.waende) {
    if (Math.abs(s.von[1] - 15.31) < 1e-6 && Math.abs(s.bis[1] - 15.31) < 1e-6) {
      s.von[1] += dyMeter
      s.bis[1] += dyMeter
      n++
    }
  }
  fs.writeFileSync(ziel, JSON.stringify(w, null, 1), 'utf8')
  return n
}

/* ══════════════════════════════════════════════════════════════════════════
   A · Der gemessene Stand bleibt der gemessene Stand
   ══════════════════════════════════════════════════════════════════════════ */
log('')
const HEAD_STAND = execFileSync('git', ['show', 'HEAD:app/public/plaene/halle400.json'],
  { cwd: WURZEL, maxBuffer: 64 * 1024 * 1024 })
const OHNE = tmp('ohne-gesetzt.json')
const leer = tmp('gesetzt-leer.json')
fs.writeFileSync(leer, JSON.stringify({
  verschiebungen: [], neue_stuecke: [], entfernt: [], oeffnungen: [], raumnamen: {}
}))

const lauf1 = python('tools/export_blueprint.py', '--ohne-gesetzt', '--out', OHNE)
pruefe(lauf1.code === 0, `a) Export --ohne-gesetzt laeuft (Exit ${lauf1.code})`)
const erzeugt = fs.readFileSync(OHNE)
const erzeugtLF = bytes(erzeugt).split('\r\n').join('\n')
const headLF = bytes(HEAD_STAND)
pruefe(erzeugtLF === headLF,
  `a) byte-identisch mit git show HEAD (${headLF.length} Byte, erzeugt ${erzeugt.length} Byte auf der Platte)`)
pruefe(erzeugt.length - headLF.length === bytes(erzeugt).split('\r\n').length - 1,
  `a) der ganze Groessenunterschied sind Zeilenenden (${erzeugt.length - headLF.length} CRLF)`)

/* ══════════════════════════════════════════════════════════════════════════
   B · Die Uebernahme klassifiziert nach der Tabelle
   ══════════════════════════════════════════════════════════════════════════ */
log('')
const NUTZER = tmp('Halle400-Plan-pruefung.json')
const attrappe = baueNutzerdatei(path.join(WURZEL, 'app/public/plaene/halle400.json'), NUTZER)
log(`   Attrappe: ${attrappe.verschoben.typ} verschoben nach ${attrappe.zielX}/${attrappe.zielY}, `
  + `${attrappe.gedreht.typ} gedreht, ${attrappe.geloescht.typ} geloescht, `
  + `Matte + Liege gesetzt, Tuer + Fenster an Wand ${attrappe.wandId} `
  + `(${attrappe.wandLaenge.toFixed(0)} cm), 1 Raumname`)

const GESETZT = tmp('gesetzt.json')
const SICHERUNG = tmp('sicherung')
fs.mkdirSync(SICHERUNG, { recursive: true })

const trocken = python('tools/uebernimm-bearbeitung.py', NUTZER,
  '--ziel', GESETZT, '--sicherung-ordner', SICHERUNG)
pruefe(trocken.code === 0, `c) Trockenlauf laeuft (Exit ${trocken.code})`)
pruefe(!fs.existsSync(GESETZT), 'c) Trockenlauf schreibt gesetzt.json NICHT')
const sicherungen = fs.readdirSync(SICHERUNG).filter((n) => n.startsWith('arbeitsstand-'))
pruefe(sicherungen.length === 1
  && fs.readFileSync(path.join(SICHERUNG, sicherungen[0]), 'utf8') === fs.readFileSync(NUTZER, 'utf8'),
  `c) Roh-Sicherung angelegt und UNVERAENDERT (${sicherungen.join(', ')})`)

const uebernahme = python('tools/uebernimm-bearbeitung.py', NUTZER, '--schreibe',
  '--ziel', GESETZT, '--sicherung-ordner', SICHERUNG)
pruefe(uebernahme.code === 0, `b) Uebernahme --schreibe laeuft (Exit ${uebernahme.code})`)
const g = fs.existsSync(GESETZT) ? jsonLesen(GESETZT) : {}
pruefe(g.verschiebungen?.length === 2,
  `b) 2 Verschiebungen (${g.verschiebungen?.length}) — verschoben UND gedreht, beide mit beleg`)
pruefe(g.neue_stuecke?.length === 2, `b) 2 neue Stuecke (${g.neue_stuecke?.length}) — ohne beleg`)
pruefe(g.entfernt?.length === 1, `b) 1 geloeschtes Messstueck (${g.entfernt?.length})`)
pruefe(g.oeffnungen?.length === 2, `b) 2 Oeffnungen (${g.oeffnungen?.length})`)
pruefe(Object.keys(g.raumnamen || {}).length === 1,
  `b) 1 Raumname (${Object.keys(g.raumnamen || {}).length})`)
pruefe(g.oeffnungen?.every((o) => o.anker && Number.isFinite(o.anker.x)),
  'b) jede Oeffnung traegt ihren anker (ohne ihn stirbt die Versoehnung)')
pruefe(g.verschiebungen?.every((v) => v.erwartet && v.erwartet.typ && Number.isFinite(v.erwartet.x0)),
  'b) jede Verschiebung traegt ihren Messort als `erwartet`')
const vNeu = g.neue_stuecke?.map((s) => s.typ).sort().join(',')
pruefe(vNeu === 'liege,matte', `b) die neuen Stuecke sind matte + liege (${vNeu})`)

/* ══════════════════════════════════════════════════════════════════════════
   D · Uebernahme -> Export -> was der KERN daraus macht
   ══════════════════════════════════════════════════════════════════════════ */
log('')
const MIT = tmp('mit-gesetzt.json')
const lauf2 = python('tools/export_blueprint.py', '--gesetzt', GESETZT, '--out', MIT)
pruefe(lauf2.code === 0, `d) Export MIT Setzungen laeuft (Exit ${lauf2.code})`)
pruefe(bytes(fs.readFileSync(MIT)).split('\r\n').join('\n') !== headLF,
  'a-GEGENPROBE) mit Setzungen weicht die Datei vom gemessenen Stand AB')

const mMit = messe(MIT)
const mOhne = messe(OHNE)
const sollGesetzt = attrappe.gesetzteImModell
pruefe(mMit.gesetzte === sollGesetzt,
  `d) ${mMit.gesetzte} Setzungen im geladenen Plan, ${sollGesetzt} in der Nutzerdatei`)
pruefe(mOhne.gesetzte === 0,
  `d-GEGENPROBE) ohne gesetzt.json faellt die Zahl auf ${mOhne.gesetzte}`)
pruefe(mMit.oeffnungen === 2 && mMit.verwaiste === 0,
  `d) 2 Oeffnungen im geladenen Plan, keine verwaist (${mMit.oeffnungen}/${mMit.verwaiste})`)
pruefe(mOhne.oeffnungen === 0, `d-GEGENPROBE) ohne gesetzt.json 0 Oeffnungen (${mOhne.oeffnungen})`)
pruefe(mMit.raumnamen === 1, `d) 1 Raumname im geladenen Plan (${mMit.raumnamen})`)
pruefe(mMit.ausstattung === mOhne.ausstattung - 1 + 2,
  `d) Stueckzahl exakt: ${mOhne.ausstattung} gemessen − 1 geloescht + 2 neu = ${mMit.ausstattung}`)
pruefe(mMit.ecken === mOhne.ecken && mMit.waende === mOhne.waende,
  `d) Geometrie unangetastet: ${mMit.ecken} Ecken · ${mMit.waende} Waende (wie ohne Setzungen)`)

/* ══════════════════════════════════════════════════════════════════════════
   E · Hash-Treue der Ecken
   ══════════════════════════════════════════════════════════════════════════ */
log('')
const ecken = python('tools/uebernimm-bearbeitung.py', '--nur-ecken', MIT)
pruefe(ecken.code === 0, `e) alle Ecken hash-treu — ${ecken.aus.trim().split('\n')[0]}`)
const VERBOGEN = tmp('ecke-verbogen.json')
const kopie = jsonLesen(MIT)
const ersteEcke = Object.keys(kopie.floorplan.corners)[0]
kopie.floorplan.corners[ersteEcke].y += 3
fs.writeFileSync(VERBOGEN, JSON.stringify(kopie, null, 1), 'utf8')
const eckenRot = python('tools/uebernimm-bearbeitung.py', '--nur-ecken', VERBOGEN)
pruefe(eckenRot.code !== 0,
  `e-GEGENPROBE) eine um 3 cm verschobene Ecke wird ROT (Exit ${eckenRot.code})`)

/* ══════════════════════════════════════════════════════════════════════════
   F · Der beleg ueberlebt, die Herkunft luegt nicht
   ══════════════════════════════════════════════════════════════════════════ */
log('')
const verschobeneIds = new Set(g.verschiebungen.map((v) => v.id))
const imPlan = mMit.f.getAusstattung().filter((e) => verschobeneIds.has(e.id))
pruefe(imPlan.length === verschobeneIds.size,
  `f) beide verschobenen Stuecke sind unter ihrer Herkunfts-Kennung wiederzufinden (${imPlan.length}/${verschobeneIds.size})`)
pruefe(imPlan.every((e) => e.quelle === 'gesetzt'),
  'f) kein verschobenes Stueck traegt nach dem Bau `gemessen`')
pruefe(imPlan.every((e) => !!e.beleg),
  'f) der `beleg` bleibt erhalten — die Spur zurueck zum Messort')
const einVerschoben = imPlan.find((e) => e.id === attrappe.verschoben.id)
pruefe(!!einVerschoben && einVerschoben.x === attrappe.zielX && einVerschoben.y === attrappe.zielY,
  `f) das verschobene Stueck steht am neuen Ort (${einVerschoben?.x}/${einVerschoben?.y}, gewollt ${attrappe.zielX}/${attrappe.zielY})`)
const nochDa = mMit.f.getAusstattung().some((e) => e.id === attrappe.geloescht.id)
pruefe(!nochDa, 'f) das geloeschte Messstueck erscheint nicht wieder')
pruefe(mOhne.f.getAusstattung().some((e) => e.id === attrappe.geloescht.id),
  'f-GEGENPROBE) ohne gesetzt.json steht es wieder da — die Messung ist nicht verloren')

/* ══════════════════════════════════════════════════════════════════════════
   G · Verschobene GEMESSENE Geometrie bricht ab
   ══════════════════════════════════════════════════════════════════════════ */
log('')
const GEZOGEN = tmp('Halle400-Plan-ecke-gezogen.json')
const nutzer = jsonLesen(NUTZER)
const gezogeneEcke = Object.keys(nutzer.floorplan.corners)[0]
nutzer.floorplan.corners[gezogeneEcke].x += 5
fs.writeFileSync(GEZOGEN, JSON.stringify(nutzer, null, 2), 'utf8')
const vorher = fs.readFileSync(GESETZT, 'utf8')
const gezogen = python('tools/uebernimm-bearbeitung.py', GEZOGEN, '--schreibe',
  '--ziel', GESETZT, '--sicherung-ordner', SICHERUNG)
pruefe(gezogen.code !== 0,
  `g) eine um 5 cm gezogene GEMESSENE Ecke bricht die Uebernahme ab (Exit ${gezogen.code})`)
pruefe(gezogen.aus.includes(gezogeneEcke),
  'g) der Abbruch NENNT die betroffene Ecke')
pruefe(fs.readFileSync(GESETZT, 'utf8') === vorher,
  'g) gesetzt.json bleibt dabei unveraendert')

/* ══════════════════════════════════════════════════════════════════════════
   H · Der Waechter
   ══════════════════════════════════════════════════════════════════════════ */
log('')
const ZIEL = tmp('zieldatei.json')
fs.copyFileSync(MIT, ZIEL)
const zielVorher = fs.readFileSync(ZIEL, 'utf8')
const gesperrt = python('tools/export_blueprint.py', '--gesetzt', leer, '--out', ZIEL)
pruefe(gesperrt.code !== 0,
  `h) der Waechter stoppt den Export vor einer bearbeiteten Zieldatei (Exit ${gesperrt.code})`)
pruefe(fs.readFileSync(ZIEL, 'utf8') === zielVorher,
  'h) und es wurde NICHTS geschrieben')
pruefe(/Moebelstueck|Tuer|Raumname/.test(gesperrt.aus),
  'h) die Meldung sagt in Alltagssprache, WAS auf dem Spiel steht')
pruefe(gesperrt.aus.includes('uebernimm-bearbeitung.py')
  && gesperrt.aus.includes('--verwerfe-setzungen'),
  'h) und nennt beide Wege — uebernehmen oder verwerfen')
const gedeckt = python('tools/export_blueprint.py', '--gesetzt', GESETZT, '--out', ZIEL)
pruefe(gedeckt.code === 0,
  `h-GEGENPROBE) mit der passenden gesetzt.json laeuft derselbe Export durch (Exit ${gedeckt.code})`)
const verworfen = python('tools/export_blueprint.py', '--gesetzt', leer, '--out', ZIEL,
  '--verwerfe-setzungen')
pruefe(verworfen.code === 0 && messe(ZIEL).gesetzte === 0,
  'h-GEGENPROBE) --verwerfe-setzungen ueberschreibt bewusst (0 Setzungen danach)')

/* ══════════════════════════════════════════════════════════════════════════
   I/J · Die Wand wird nachgemessen — die Tuer haengt an ihrem Anker
   ══════════════════════════════════════════════════════════════════════════ */
log('')
const originalWandId = jsonLesen(GESETZT).oeffnungen[0].wandId
for (const [dy, erwartetVerwaist, marke] of [[0.10, 0, 'i'], [0.60, 2, 'j']]) {
  const W = tmp(`walls-${dy}.json`)
  const anzahl = waendeVerschoben(dy, W)
  const AUS = tmp(`plan-wand-${dy}.json`)
  const lauf = python('tools/export_blueprint.py', '--walls', W, '--gesetzt', GESETZT, '--out', AUS)
  const m = messe(AUS)
  const neueWandId = m.f.getOeffnungen()[0].wandId
  pruefe(lauf.code === 0 && m.oeffnungen === 2,
    `${marke}) Suedkontur um ${(dy * 100).toFixed(0)} cm nachgemessen (${anzahl} Segmente): `
    + `beide Oeffnungen noch da (${m.oeffnungen}), keine geloescht`)
  pruefe(m.verwaiste === erwartetVerwaist,
    `${marke}) ${m.verwaiste} verwaist (erwartet ${erwartetVerwaist})`)
  if (erwartetVerwaist === 0) {
    pruefe(neueWandId !== originalWandId,
      `${marke}) die Tuer ist ueber ihren Anker auf eine NEUE Wand-Kennung gewandert `
      + `(${originalWandId.slice(0, 16)} -> ${neueWandId.slice(0, 16)})`)
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   K · Die gemessenen Quellen wurden nicht angefasst
   ══════════════════════════════════════════════════════════════════════════ */
log('')
const sauber = execFileSync('git', ['status', '--porcelain',
  'data/walls.json', 'data/ausstattung.json', 'data/plan-geometry.json',
  'app/public/plaene/halle400.json'], { cwd: WURZEL, encoding: 'utf8' }).trim()
pruefe(sauber === '',
  `k) walls.json, ausstattung.json, plan-geometry.json und die Zieldatei sind unveraendert`
  + `${sauber ? ` — ${sauber.replace(/\n/g, ' | ')}` : ''}`)

/* ══════════════════════════════════════════════════════════════════════════
   L · Fassungen und der Schrumpf-Schutz
   ══════════════════════════════════════════════════════════════════════════
   Alles auf KOPIEN, damit die Pruefungen davor nicht nachtraeglich verbogen
   werden. */
log('')
const GESETZT_L = tmp('gesetzt-fassungen.json')
fs.copyFileSync(GESETZT, GESETZT_L)

const ZUKUNFT = tmp('Halle400-Plan-fassung4.json')
const zukunft = jsonLesen(NUTZER)
zukunft.floorplan.formatVersion = 4
fs.writeFileSync(ZUKUNFT, JSON.stringify(zukunft, null, 2), 'utf8')
const lz = python('tools/uebernimm-bearbeitung.py', ZUKUNFT, '--schreibe',
  '--ziel', GESETZT_L, '--sicherung-ordner', SICHERUNG)
pruefe(lz.code !== 0 && /neueren Fassung/.test(lz.aus),
  `l) eine Datei aus Fassung 4 wird ehrlich abgelehnt (Exit ${lz.code})`)

const ALT = tmp('Halle400-Plan-fassung1.json')
const alt = jsonLesen(NUTZER)
delete alt.floorplan.formatVersion
delete alt.floorplan.oeffnungen
alt.floorplan.ausstattung = alt.floorplan.ausstattung.map(
  ({ id, quelle, ...rest }) => rest)
fs.writeFileSync(ALT, JSON.stringify(alt, null, 2), 'utf8')
const la = python('tools/uebernimm-bearbeitung.py', ALT,
  '--ziel', tmp('gesetzt-alt.json'), '--sicherung-ordner', SICHERUNG)
pruefe(la.code === 0 && /Fassung 1: diese Datei KANN keine/.test(la.aus)
  && /1 Raumname/.test(la.aus),
  'l) Fassung 1 sagt ehrlich, dass sie keine Setzungen tragen kann — Raumnamen kommen trotzdem mit')

const KLEINER = tmp('Halle400-Plan-geschrumpft.json')
const kleiner = jsonLesen(NUTZER)
kleiner.floorplan.oeffnungen = kleiner.floorplan.oeffnungen.slice(0, 1)
kleiner.floorplan.ausstattung = kleiner.floorplan.ausstattung.filter((e) => e.typ !== 'liege')
fs.writeFileSync(KLEINER, JSON.stringify(kleiner, null, 2), 'utf8')
const lk = python('tools/uebernimm-bearbeitung.py', KLEINER, '--schreibe',
  '--ziel', GESETZT_L, '--sicherung-ordner', SICHERUNG)
pruefe(lk.code !== 0 && /verloere Eintraege/.test(lk.aus),
  `l) eine AELTERE Sicherung schrumpft gesetzt.json nicht stumm (Exit ${lk.code})`)
const lk2 = python('tools/uebernimm-bearbeitung.py', KLEINER, '--schreibe',
  '--auch-entfernen', '--ziel', GESETZT_L, '--sicherung-ordner', SICHERUNG)
const nachher = jsonLesen(GESETZT_L)
pruefe(lk2.code === 0 && nachher.neue_stuecke.length === 1 && nachher.oeffnungen.length === 1,
  `l-GEGENPROBE) mit --auch-entfernen wird sie uebernommen `
  + `(${nachher.neue_stuecke.length} neu · ${nachher.oeffnungen.length} Oeffnung)`)

log('')
log(fehler.length === 0 ? 'ALLE PRUEFUNGEN BESTANDEN' : `DURCHGEFALLEN: ${fehler.length}`)
fehler.forEach((f) => log('  - ' + f))
log(`Bericht + Dateien: ${DIR}`)
process.exit(fehler.length === 0 ? 0 : 1)
