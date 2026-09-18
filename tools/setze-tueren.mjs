// Schreibt eine TUERLISTE IN WELTKOORDINATEN in einen Plan (H1).
//
//   node tools/setze-tueren.mjs --liste <tueren.json> --plan <plan.json>
//   node tools/setze-tueren.mjs --liste … --plan … --schreibe [--ziel <datei>]
//
// TROCKENLAUF IST DER STANDARD — wie bei `uebernimm-bearbeitung.py`. Ohne
// `--schreibe` wird gerechnet und berichtet, aber keine Datei angefasst.
//
// ─── WOZU ES DAS GIBT ──────────────────────────────────────────────────────
// Eine Tuer wird aus einer Zeichnung an einem ORT gemessen: „x = 4067 cm,
// y = 712 cm". Das Modell fuehrt sie aber an einer WAND: `wandId` + `lage`
// (cm von der Start-Ecke bis zur Mitte). Dazwischen fehlt genau eine
// Uebersetzung, und die ist der einzige Grund fuer dieses Werkzeug.
//
// ─── WARUM HIER KEINE GEOMETRIE STEHT ──────────────────────────────────────
// Die Uebersetzung ist NICHT nachgebaut. Sie ist die VERSOEHNUNG des Kerns
// (`Floorplan.versoehneOeffnungen` → `wandAmAnker`), und die gibt es seit W4:
// eine Oeffnung mit `anker` und ohne brauchbare `wandId` sucht sich beim
// naechsten `update()` selbst die Wand, auf der sie sitzt. Genau dafuer wurde
// der Anker gebaut — „in dieser Pipeline ueberlebt keine Kennung ein
// Nachmessen, die einzige dauerhafte Identitaet einer Wand ist ihre
// GEOMETRIE" (W4, Punkt 3).
//
// Dieses Werkzeug legt also nur den Anker und laesst den Kern rechnen. Eine
// eigene Projektion „Punkt auf naechste Wand" haette dieselbe Rechnung ein
// zweites Mal gefuehrt — und zwei Fassungen laufen auseinander, sobald jemand
// eine anfasst. Sichtbar wuerde das erst an einer Tuer in der falschen Wand.
//
// ─── WARUM DER PLAN NICHT DURCH `saveFloorplan` LAEUFT ─────────────────────
// GEMESSEN: `app/public/plaene/hotel400.json` fuehrt an jeder Wand `herkunft`
// und `art` — Felder, die das Modell nicht kennt. Ein Hin-und-Zurueck durch
// `saveFloorplan()` schriebe sie nicht zurueck und loeschte damit den
// Herkunftsnachweis von 681 Waenden. Der Kern wird deshalb nur GEFRAGT; in die
// Datei geschrieben wird allein der Abschnitt `oeffnungen`.
//
// ─── WAS ES NICHT TUT ──────────────────────────────────────────────────────
// Es misst nicht. Die Liste ist eine Vormessung aus einer Zeichnung; dieses
// Werkzeug traegt sie ein und sagt, was dabei NICHT aufgegangen ist. Eine Tuer,
// fuer die keine Wand in Reichweite steht, wird NICHT erfunden und NICHT still
// verworfen — sie steht im Bericht und, wenn geschrieben wird, als `verwaist`
// in der Datei.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { uebersetzeKern, buendleKern, buendleThree, WURZEL } from './buendel-kern.mjs'

const HIER = path.dirname(fileURLToPath(import.meta.url))

/* ── Befehlszeile ──────────────────────────────────────────────────────── */
const argv = process.argv.slice(2)
const wert = (name, standard = null) => {
  const i = argv.indexOf(name)
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : standard
}
const schalter = (name) => argv.includes(name)

const listeDatei = wert('--liste')
const planDatei = wert('--plan')
const schreibe = schalter('--schreibe')
const zielDatei = wert('--ziel', planDatei)

if (!listeDatei || !planDatei) {
  console.error(
    'Aufruf: node tools/setze-tueren.mjs --liste <tueren.json> --plan <plan.json> [--schreibe] [--ziel <datei>]'
  )
  process.exit(2)
}

/* ── Die Liste lesen ───────────────────────────────────────────────────────
   ZWEI FORMATE, EIN WEG. Das eigene Format des Planers ist das mit `anker` —
   dort steht der Ort schon so, wie der Kern ihn versteht. Daneben wird das
   Format der Vormessung angenommen (`x_mitte` / `wand_y`), weil eine Messung
   aus einer waagerechten Wand nun einmal so herausfaellt. Mehr Formate kommen
   NICHT dazu: jedes weitere waere eine Uebersetzung, die man pflegen muss. */
/* HIMMELSRICHTUNG → VORZEICHEN, aber erst SPAETER (siehe `richteAus`).
   `seite` und `anschlag` sind NICHT in Weltrichtungen definiert, sondern
   relativ zur Wand: `seite` ist das Vorzeichen entlang der linken Normalen der
   Richtung Start→Ende, `anschlag` ist die Laibung, an der das Band sitzt. Eine
   Wand kann von Ost nach West laufen — dann kehren sich beide um.
   Die Wandrichtung steht erst nach der Versoehnung fest (vorher weiss niemand,
   WELCHE Wand es ist), deshalb wird hier nur der Wunsch in Weltrichtungen
   mitgefuehrt und nach der Versoehnung umgerechnet. Frueher umgerechnet waere
   es geraten — und eine spiegelverkehrt aufschlagende Tuer sieht richtig aus. */
const NORDEN = -1 // in diesem Plan waechst y nach SUEDEN (gemessen an
// `hotel400.json`: Flur-Nordwand y≈546, Flur-Suedwand y≈712, Loggia Sued y≈1286)

/** Eine Zeile der Vormessung in eine gespeicherte Oeffnung uebersetzen. */
function ausVormessung(t, i) {
  const anker =
    t.anker && Number.isFinite(t.anker.x)
      ? { x: t.anker.x, y: t.anker.y }
      : { x: t.x_mitte, y: t.wand_y }
  if (!Number.isFinite(anker.x) || !Number.isFinite(anker.y)) {
    throw new Error(
      `tueren[${i}]: kein Ort — weder \`anker\` noch \`x_mitte\`/\`wand_y\`. Abbruch.`
    )
  }
  const breite = Number(t.breite ?? t.breite_cm)
  if (!Number.isFinite(breite) || breite <= 0) {
    throw new Error(`tueren[${i}]: unbrauchbare Breite (${JSON.stringify(t.breite ?? t.breite_cm)}).`)
  }
  /* Die Sicherheits-Stufen der Vormessung heissen hoch/mittel/niedrig, die des
     Modells sicher/mittel/schwach. Beide Woerter zu erlauben und EINS davon zu
     speichern ist der ganze Unterschied zwischen einer Uebersetzung und einem
     zweiten Vokabular. */
  const stufe = { hoch: 'sicher', sicher: 'sicher', mittel: 'mittel', niedrig: 'schwach', schwach: 'schwach' }[
    String(t.sicherheit || '').toLowerCase()
  ]
  /* „mehrdeutig" ist in der Vormessung eine ECHTE Angabe: das Symbol liess die
     Richtung nicht erkennen. Dann wird eine Seite gewaehlt — sie muss ja
     gezeichnet werden — UND die Sicherheit faellt mindestens auf `mittel`,
     damit im Bild nicht behauptet wird, was niemand gesehen hat. */
  const aufschlagBekannt = t.aufschlag === 'nach Norden' || t.aufschlag === 'nach Sueden'
  const anschlagBekannt =
    t.anschlagseite === 'Ost' ||
    t.anschlagseite === 'West' ||
    t.anschlag === 'anfang' ||
    t.anschlag === 'ende'
  const o = {
    // Beides VORLAEUFIG — der Kern schreibt sie ueber den Anker um; das ist der
    // eigentliche Zweck dieses Werkzeugs.
    wandId: typeof t.wandId === 'string' ? t.wandId : '',
    lage: Number.isFinite(t.lage) ? t.lage : 0,
    breite,
    art: t.art || 'tuer',
    // Ebenfalls vorlaeufig: `richteAus` setzt beide nach der Wandrichtung.
    seite: t.seite === 1 || t.seite === -1 ? t.seite : 1,
    anschlag: t.anschlag === 'anfang' ? 'anfang' : 'ende',
    anker,
    quelle: t.quelle === 'gesetzt' ? 'gesetzt' : 'gemessen',
    /* Eine mehrdeutige Angabe zieht die Sicherheit herunter, nie hinauf. Die
       Zeichnung MUSS sich fuer eine Seite entscheiden — ein Blatt ohne
       Aufschlagrichtung gibt es nicht —, aber sie soll nicht behaupten, was
       niemand gesehen hat. */
    sicherheit:
      stufe === 'sicher' && !(aufschlagBekannt && anschlagBekannt) ? 'mittel' : stufe || 'sicher'
  }
  if (Number.isFinite(t.hoehe)) o.hoehe = t.hoehe
  if (Number.isFinite(t.bruestung)) o.bruestung = t.bruestung
  if (typeof t.id === 'string' && t.id) o.id = t.id
  return o
}

/**
 * Setzt `seite` und `anschlag` NACH der Versoehnung — aus der WIRKLICHEN
 * Richtung der Wand, auf der die Oeffnung gelandet ist.
 *
 * `modell.oeffnungsGeometrie(o)` liefert den Richtungsvektor (`ex`,`ey`) und
 * die linke Normale (`nx`,`ny`) — dieselben Zahlen, mit denen der Zeichner
 * gleich das Blatt malt. Sie hier zu holen statt sie nachzurechnen ist derselbe
 * Grundsatz wie bei der Versoehnung: EINE Quelle fuer eine Groesse.
 */
function richteAus(modell, o, wunsch) {
  const g = modell.oeffnungsGeometrie(o)
  if (!g) return
  if (wunsch.aufschlag === 'nach Norden' || wunsch.aufschlag === 'nach Sueden') {
    // `ny` ist die y-Komponente der linken Normalen. Das Blatt schlaegt auf der
    // Seite `seite * n` auf; gewuenscht ist ein Vorzeichen in y.
    const zielY = wunsch.aufschlag === 'nach Norden' ? NORDEN : -NORDEN
    if (Math.abs(g.ny) > 1e-6) o.seite = g.ny * zielY > 0 ? 1 : -1
  }
  if (wunsch.anschlagseite === 'Ost' || wunsch.anschlagseite === 'West') {
    // Das Band sitzt an der oestlichen bzw. westlichen Laibung. Welche das ist,
    // haengt daran, wohin die Wand laeuft: `ex > 0` heisst Start im Westen.
    const bandOsten = wunsch.anschlagseite === 'Ost'
    if (Math.abs(g.ex) > 1e-6) o.anschlag = g.ex > 0 === bandOsten ? 'ende' : 'anfang'
  }
}

const rohListe = JSON.parse(fs.readFileSync(path.resolve(listeDatei), 'utf8'))
const zeilen = Array.isArray(rohListe) ? rohListe : rohListe.tueren || rohListe.oeffnungen || []
if (!Array.isArray(zeilen) || zeilen.length === 0) {
  console.error(`In ${listeDatei} steht keine Tuerliste (weder Feld \`tueren\` noch \`oeffnungen\`).`)
  process.exit(2)
}
const gewuenscht = zeilen.map(ausVormessung)

/* ── Den Plan lesen und den KERN fragen ────────────────────────────────── */
const planPfad = path.resolve(planDatei)
const planRoh = fs.readFileSync(planPfad, 'utf8')
const roh = JSON.parse(planRoh)
const fp = roh.floorplan || roh

/* ZEILENENDEN DES ORIGINALS BEIBEHALTEN. GEMESSEN: `hotel400.json` liegt mit
   CRLF vor (die Python-Werkzeuge schreiben im Textmodus unter Windows). Wer
   hier mit `\n` zurueckschreibt, aendert JEDE der 30 000 Zeilen — der Unterschied
   zwischen „54 Tueren dazu" und „ganze Datei neu" ist dann in keinem `git diff`
   mehr zu sehen, und genau daran prueft dieses Projekt seine Exporte. */
const ZEILENENDE = planRoh.includes('\r\n') ? '\r\n' : '\n'

const KERN = new Function(
  `${buendleThree()}\n${buendleKern(uebersetzeKern())}\nreturn { Floorplan, Configuration, configWallThickness };`
)()

/* ── DIE WANDDICKE MUSS DIESELBE SEIN WIE IN DER AUSLIEFERUNG ──────────────
   GEMESSEN, und es hat eine Tuer gekostet: dieses Werkzeug meldete 24 Tueren
   ohne Wand, die fertige Datei fand 23. Die Ursache ist keine Ungenauigkeit,
   sondern eine ANDERE ZAHL. Die Versoehnung sucht im Umkreis
   `Wanddicke/2 + 25 cm` (`VERSOEHNUNG_SUCHWEITE_CM`); `Configuration` steht
   ohne Zutun auf 10 cm (`configuration.ts:30`), Planer und Doppelklick-Datei
   setzen aber 12,5 (`Blueprint3DAppBase.tsx:143`, `baue-planer-datei.mjs`).
   Das sind 30,0 statt 31,25 cm Suchweite — und genau dazwischen lag eine Tuer.

   Ein Werkzeug, das anders rechnet als das Ergebnis, ist schlimmer als keines:
   sein Bericht sieht genau wie eine Messung aus. */
const WAND_DICKE_CM = Number(wert('--wanddicke', '12.5'))
KERN.Configuration.setValue(KERN.configWallThickness, WAND_DICKE_CM)

/* Der ECHTE Konsument: dieselbe `loadFloorplan`, die auch der Planer benutzt.
   Sie ruft `update()`, `update()` ruft `versoehneOeffnungen()`, und DAS ist
   die Uebersetzung Ort → Wand. Nichts davon steht in dieser Datei. */
const modell = new KERN.Floorplan()
modell.loadFloorplan({ ...fp, oeffnungen: gewuenscht })
const fertig = modell.getOeffnungen()

/* Die Reihenfolge bleibt: `uebernehmeOeffnungen` bildet die Liste mit `map`
   ab und die Versoehnung sortiert nicht um. Wer das aendert, bricht diese
   Zuordnung — deshalb wird sie hier geprueft und nicht geglaubt. */
if (fertig.length !== zeilen.length) {
  console.error(
    `Der Kern gab ${fertig.length} Oeffnungen zurueck, hineingegeben wurden ${zeilen.length}. ` +
      'Ohne 1:1-Zuordnung liesse sich die Aufschlagrichtung nicht zuordnen. Abbruch.'
  )
  process.exit(2)
}
fertig.forEach((o, i) => {
  if (o.verwaist) return // ohne Wand gibt es keine Richtung, an der man sie ausrichten koennte
  richteAus(modell, o, zeilen[i])
})

/* ── Bericht ───────────────────────────────────────────────────────────── */
const verwaist = fertig.filter((o) => o.verwaist)
const gesetzt = fertig.filter((o) => !o.verwaist)
const jeStufe = { sicher: 0, mittel: 0, schwach: 0 }
for (const o of fertig) jeStufe[o.sicherheit] = (jeStufe[o.sicherheit] || 0) + 1
const waendeMitTuer = new Set(gesetzt.map((o) => o.wandId))

console.log(`Plan   : ${path.relative(WURZEL, planPfad)}`)
console.log(`Liste  : ${path.relative(WURZEL, path.resolve(listeDatei))} (${gewuenscht.length} Zeilen)`)
console.log('')
console.log(`  ${gesetzt.length.toString().padStart(4)} Oeffnung(en) sitzen auf einer Wand`)
console.log(`  ${waendeMitTuer.size.toString().padStart(4)} verschiedene Waende tragen sie`)
console.log(
  `  ${jeStufe.sicher} sicher · ${jeStufe.mittel} mittel · ${jeStufe.schwach} schwach erkannt`
)
if (verwaist.length > 0) {
  /* WARUM findet eine Oeffnung keine Wand? Es gibt genau zwei Gruende, und sie
     verlangen verschiedene Arbeit:
       (a) an diesem Ort steht ueberhaupt keine Wand   → der ORT ist falsch
           oder die Wand fehlt im Plan
       (b) es steht eine, aber sie ist KUERZER als die Oeffnung → die BREITE
           passt nicht zur Wandteilung (`wandAmAnker` lehnt eine Wand ab, die
           kuerzer ist als die Oeffnung — eine Tuer, die ueber die Laibung
           hinausragt, waere keine)
     Unterschieden wird das, indem der KERN ein zweites Mal gefragt wird —
     dieselbe Versoehnung, nur mit 1 cm Breite. Findet sie dann eine Wand, war
     es (b). Eine eigene „naechste Wand"-Rechnung an dieser Stelle waere die
     zweite Geometrie-Wahrheit, die dieses Werkzeug gerade vermeidet. */
  const probe = new KERN.Floorplan()
  probe.loadFloorplan({
    ...fp,
    oeffnungen: verwaist.map((o) => ({ ...o, breite: 1, wandId: '' }))
  })
  const schmal = probe.getOeffnungen()
  const zuKurz = []
  const keineWand = []
  verwaist.forEach((o, i) => (schmal[i] && !schmal[i].verwaist ? zuKurz : keineWand).push(o))

  console.log('')
  console.log(`  ${verwaist.length} OHNE WAND (verwaist). Sie werden NICHT erfunden und NICHT`)
  console.log('  verworfen; im Plan stehen sie als `verwaist` und werden nicht gezeichnet.')
  const zeig = (titel, liste) => {
    if (liste.length === 0) return
    console.log('')
    console.log(`  ${liste.length} × ${titel}`)
    for (const o of liste.slice(0, 15)) {
      console.log(
        `    · ${o.art} ${o.breite.toFixed(1)} cm bei x=${o.anker.x.toFixed(0)} y=${o.anker.y.toFixed(0)}`
      )
    }
    if (liste.length > 15) console.log(`    · … und ${liste.length - 15} weitere`)
  }
  zeig('KEINE WAND in Reichweite — der Ort trifft keine Wand dieses Plans', keineWand)
  zeig('Wand da, aber KUERZER als die Oeffnung — Breite oder Wandteilung passt nicht', zuKurz)
}

/* ── Schreiben ─────────────────────────────────────────────────────────── */
if (!schreibe) {
  console.log('')
  console.log('TROCKENLAUF — es wurde nichts geschrieben. Mit `--schreibe` wirklich eintragen.')
  process.exit(verwaist.length > 0 ? 1 : 0)
}

/* ── DIE WAND-KENNUNG MUSS MIT IN DIE DATEI ────────────────────────────────
   GEMESSEN, und es war der einzige Fund dieser Welle, den kein Typprüfer
   gesehen hätte: eine Tuer war im Grundriss da und in der Axonometrie NICHT.

   Der Grund steht in `axo-szene.js` seit W4 im Klartext: eine Wand OHNE
   Kennung kann keine Oeffnung tragen, denn die Oeffnung haengt an `Wall.id`.
   Im laufenden Planer faellt das nicht auf — dort kommt der Plan aus
   `saveFloorplan()`, und das schreibt `id` mit (`floorplan.ts:879`). Eine
   Plandatei aus der Messkette hat aber nie eine gesehen: `export_blueprint.py`
   schreibt Waende ohne Kennung, der Kern LEITET sie beim Laden ab
   (`kennungAusWand`), und die Axonometrie liest die Datei DIREKT.
   Also: im Modell gebunden, in der Datei nicht.

   Geschrieben wird die Kennung nur an den Waenden, die wirklich eine Oeffnung
   tragen — nicht an alle 681. Es ist dieselbe Zurueckhaltung, mit der
   `saveFloorplan` `quelle` nur schreibt, wenn sie `gesetzt` ist: eine Angabe,
   die in jeder Zeile steht und in keiner etwas aendert, macht jeden Vergleich
   zweier Plandateien unlesbar.

   Die Kennung wird NICHT hier abgeleitet, sondern beim Kern abgeholt. Eine
   zweite Ableitung („`w-` plus acht Zeichen je Ecke") liefe von
   `kennungAusWand` weg, sobald dort jemand etwas aendert — und dann haenge die
   Tuer an einer Kennung, die es nicht gibt. */
const kennungJeEckenpaar = new Map()
for (const w of modell.getWalls()) {
  kennungJeEckenpaar.set(`${w.getStart().id}|${w.getEnd().id}`, w.id)
}
const tragend = new Set(gesetzt.map((o) => o.wandId))
let benannt = 0
const waendeNeu = fp.walls.map((w) => {
  const kennung = kennungJeEckenpaar.get(`${w.corner1}|${w.corner2}`)
  if (!kennung || !tragend.has(kennung) || w.id === kennung) return w
  benannt++
  return { ...w, id: kennung }
})

/* ── GESCHRIEBEN WIRD IM TEXT, NICHT ÜBER `JSON.stringify` ─────────────────
   GEMESSEN: den ganzen Plan neu zu serialisieren ergab 2145 geänderte und 1188
   entfernte Zeilen für 54 Türen — `JSON.stringify` schreibt `0` wo `0.0` stand.
   Numerisch dasselbe, für einen Menschen aber der Unterschied zwischen einer
   prüfbaren Änderung und „ganze Datei neu". Dieses Projekt prüft seine Exporte
   auf Byte-Gleichheit (W5); ein Werkzeug, das bei jedem Lauf jede Koordinate
   anfasst, macht genau diese Prüfung wertlos.

   Also: der Originaltext bleibt stehen, und es werden nur zwei Dinge
   eingefügt — die Wand-Kennungen und der Abschnitt `oeffnungen`. */

/** Die Grenzen des Werts zu `schluessel` im Text: von der öffnenden bis zur
 *  zugehörigen schliessenden Klammer. Klammern in Zeichenketten zählen nicht
 *  mit — eine `herkunft` wie „Doppellinie [..]" gäbe es sonst falsch. */
function wertGrenzen(text, schluessel, auf, zu) {
  const start = text.indexOf(`"${schluessel}":`)
  if (start < 0) return null
  const von = text.indexOf(auf, start)
  let tiefe = 0
  let inText = false
  for (let i = von; i < text.length; i++) {
    const c = text[i]
    if (inText) {
      if (c === '\\') i++
      else if (c === '"') inText = false
      continue
    }
    if (c === '"') inText = true
    else if (c === auf) tiefe++
    else if (c === zu && --tiefe === 0) return { von, bis: i + 1 }
  }
  return null
}

const ziel = path.resolve(zielDatei)
const wandBereich = wertGrenzen(planRoh, 'walls', '[', ']')
if (!wandBereich) {
  console.error('Abbruch: im Plan ist kein Abschnitt `walls` zu finden.')
  process.exit(2)
}

/* Die Wand-Kennungen: jedes Wand-Objekt im Text aufsuchen und, wenn es eine
   Öffnung trägt, eine `id`-Zeile davor setzen. Gesucht wird über das
   Eckenpaar — dieselbe Identität, über die auch der Kern die Kennung bildet. */
let waendeText = planRoh.slice(wandBereich.von, wandBereich.bis)
let benanntText = 0
for (const [paar, kennung] of kennungJeEckenpaar) {
  if (!tragend.has(kennung)) continue
  const [c1, c2] = paar.split('|')
  const muster = new RegExp(
    `(\\{(\\r?\\n)(\\s*))("corner1": "${c1}",(\\r?\\n)\\s*"corner2": "${c2}")`,
    'g'
  )
  const treffer = waendeText.match(muster)
  if (!treffer || treffer.length !== 1) {
    // Kein eindeutiger Treffer: lieber die Kennung weglassen als sie an die
    // falsche Wand schreiben. Die Öffnung wird dann im Blatt nicht gezeichnet
    // — sichtbar fehlend ist besser als unsichtbar falsch.
    console.error(`  ! Wand ${kennung}: kein eindeutiger Fundort im Text (${treffer ? treffer.length : 0}×)`)
    continue
  }
  waendeText = waendeText.replace(muster, `$1"id": "${kennung}",$2$3$4`)
  benanntText++
}

const einzug = '  '
const nl = ZEILENENDE
const oeffnungenText =
  `${nl}${einzug}"oeffnungen": ` +
  JSON.stringify(fertig.map((o) => ({ ...o })), null, 1)
    .split('\n')
    .join(`${nl}${einzug}`)

const text =
  planRoh.slice(0, wandBereich.von) +
  waendeText +
  ',' +
  oeffnungenText +
  planRoh.slice(wandBereich.bis)
fs.writeFileSync(ziel, text, 'utf8')
// Die Probe aufs Exempel: was geschrieben wurde, muss sich lesen lassen und
// dieselben Zahlen enthalten. Ein Texteingriff, der eine kaputte Datei
// hinterlässt, wäre der schlechteste aller Fehler.
const gegen = JSON.parse(fs.readFileSync(ziel, 'utf8'))
const gfp = gegen.floorplan || gegen
if (gfp.walls.length !== fp.walls.length || (gfp.oeffnungen || []).length !== fertig.length) {
  console.error('Abbruch: die geschriebene Datei stimmt nicht mit dem Gerechneten ueberein.')
  process.exit(2)
}
console.log('')
console.log(`  ${benanntText} Wand/Waende haben eine Kennung bekommen (ohne sie bliebe die`)
console.log('  Oeffnung in der raeumlichen Ansicht unsichtbar — im Grundriss waere sie da).')
console.log(`Geschrieben: ${path.relative(WURZEL, ziel)} (${fertig.length} Oeffnungen, ` +
  `${gfp.walls.length} Waende unveraendert)`)
process.exit(0)
