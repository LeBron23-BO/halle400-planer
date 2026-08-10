// Prueft DIE NEUN SAEULEN (W14) — `src/raum/saeulen.js`, ohne Browser.
//
//   node tools/pruefe-saeulen.mjs
//   Exit 0 = alle Pruefungen bestanden, 1 = mindestens eine durchgefallen.
//
// WORUM ES GEHT
// Die neun Saeulen stehen ZWEIMAL im Projekt: fachlich in `src/raum/saeulen.js`
// (die Auswahl beim Zusammenlegen) und zeichnerisch in
// `src/axo/axo-kontrakt.js` (Beschriftung und Farbe im Blatt). Die Doppelung
// ist unvermeidbar — `buendel-kern.mjs` entfernt beim Buendeln jede
// Import-Zeile und legt Raum- und Axonometrie-Module in getrennte Abschnitte,
// ein Verweis darueber hinweg waere in der Doppelklick-Datei still `undefined`
// (derselbe Fallstrick, den W13 mit `import { x as y }` gefunden hat).
//
// Unvermeidbar heisst nicht unbewacht. Laeuft eine der beiden Listen davon,
// waehlt der Nutzer im Menue eine Saeule, die im Blatt anders heisst — und
// niemand merkt es, weil beide Seiten fuer sich stimmig bleiben. Genau das
// findet Abschnitt A.
//
// Der zweite stille Fehler sitzt eine Ebene tiefer: eine Saeule verweist auf
// eine Belegung, und `legeAus` WIRFT, wenn zu deren Typ keine Vorlage mit
// Massen existiert. Im Menue sieht man davon nichts — der Eintrag steht da,
// und erst der Klick darauf bricht ab. Abschnitt C prueft jede Kette bis zur
// Vorlage durch, statt sich auf den Namen zu verlassen.
//
// VIER ABSCHNITTE:
//   A) Die bewachte Doppelung (Namen, Rollen, Reihenfolge)
//   B) Die Auswahl (neun plus Ausgang, „Noch offen" zuletzt)
//   C) Jede Saeule fuehrt bis zu einer Vorlage mit Massen
//   D) Nachschlagen raet nicht (mit Gegenproben)
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { WURZEL } from './buendel-kern.mjs'

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'h400-saeulen-'))
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

const S = await import(pathToFileURL(path.join(WURZEL, 'src/raum/saeulen.js')).href)
const { SAEULEN_WAHL, OHNE_SAEULE, saeulenWahl, saeuleNach, nutzungFuerSaeule, saeulenText } = S

const RZ = await import(
  pathToFileURL(path.join(WURZEL, 'src/raum/raum-zusammenlegen.js')).href
)
const { NUTZUNGEN } = RZ

const AXO = await import(pathToFileURL(path.join(WURZEL, 'src/axo/axo-kontrakt.js')).href)
const { SAEULEN: AXO_SAEULEN } = AXO

/* Die Vorlagen stehen in `src/model/floorplan.ts` und laufen nicht durch node.
   Gelesen wird deshalb der Quelltext — das ist hier kein Notbehelf, sondern
   genau richtig: geprueft werden soll, ob die Datei die Masse HERGIBT, und
   nicht, ob eine nachgebaute Kopie sie hat. */
const FP_QUELLE = fs.readFileSync(path.join(WURZEL, 'src/model/floorplan.ts'), 'utf8')
const VORLAGEN_TYPEN = new Set(
  [...FP_QUELLE.matchAll(/\{\s*typ:\s*'([a-z]+)'\s*,\s*breite:\s*\d+\s*,\s*tiefe:\s*\d+\s*\}/g)].map(
    (m) => m[1]
  )
)

/* ══════════════════════ A · DIE BEWACHTE DOPPELUNG ══════════════════════ */
log('\n=== A · Die bewachte Doppelung: saeulen.js gegen axo-kontrakt.js ===')

pruefe(
  Array.isArray(AXO_SAEULEN) && AXO_SAEULEN.length === 9,
  `axo-kontrakt.js fuehrt neun Saeulen (gefunden: ${AXO_SAEULEN?.length})`
)
pruefe(
  SAEULEN_WAHL.length === 9,
  `saeulen.js fuehrt neun Saeulen (gefunden: ${SAEULEN_WAHL.length})`
)

// Reihenfolge, Nummer, Name und Rolle muessen Zeile fuer Zeile decken. Nur die
// Menge zu vergleichen liesse eine Vertauschung durch — und im Blatt stuende
// dann Nummer 03 an Saeule 04.
for (let i = 0; i < Math.min(SAEULEN_WAHL.length, AXO_SAEULEN?.length ?? 0); i++) {
  const a = SAEULEN_WAHL[i]
  const b = AXO_SAEULEN[i]
  pruefe(
    a.n === b.n && a.name === b.name && a.rolle === b.rolle,
    `Saeule ${i + 1}: "${a.n} ${a.name} (${a.rolle})" deckt sich mit dem Kontrakt ` +
      `("${b.n} ${b.name} (${b.rolle})")`
  )
}

// GEGENPROBE: der Vergleich muss eine Abweichung auch WIRKLICH finden. Ohne
// sie wuesste niemand, ob oben nur neunmal `true` gegen `true` stand.
{
  const verbogen = SAEULEN_WAHL.map((s, i) => (i === 4 ? { ...s, name: 'Verbogen' } : s))
  const findetAbweichung = verbogen.some(
    (s, i) => s.name !== AXO_SAEULEN[i].name || s.rolle !== AXO_SAEULEN[i].rolle
  )
  pruefe(findetAbweichung, 'Gegenprobe: ein verbogener Name WIRD gefunden')
}

/* ══════════════════════ B · DIE AUSWAHL ══════════════════════ */
log('\n=== B · Die Auswahl im Menue ===')

const wahl = saeulenWahl()
pruefe(wahl.length === 10, `Die Auswahl hat zehn Eintraege: neun Saeulen plus Ausgang (${wahl.length})`)
pruefe(
  wahl[wahl.length - 1] === OHNE_SAEULE,
  '„Noch offen" steht ZULETZT — es ist der Ausweg, nicht der Vorschlag'
)
pruefe(
  OHNE_SAEULE.nutzung === null,
  '„Noch offen" bringt keine Belegung mit'
)
pruefe(
  nutzungFuerSaeule(OHNE_SAEULE) === 'leer',
  '„Noch offen" uebersetzt nach `leer` — `legeAus` kennt kein null'
)
pruefe(
  nutzungFuerSaeule(null) === 'leer',
  'Auch ohne Wahl wird `leer` geliefert statt undefined'
)

// Der Text, der im Menue steht. Er muss die Nummer tragen, denn das Haus
// spricht in Nummern; und er darf beim Ausgang NICHT so tun, als sei er eine.
pruefe(
  saeulenText(SAEULEN_WAHL[8]) === '09 · Yoga (Der Atem)',
  `Menuetext einer Saeule nennt Nummer, Name und Rolle ("${saeulenText(SAEULEN_WAHL[8])}")`
)
pruefe(
  saeulenText(OHNE_SAEULE) === 'Noch offen',
  `Der Ausgang traegt keine Nummer ("${saeulenText(OHNE_SAEULE)}")`
)

/* ══════════════════════ C · JEDE KETTE BIS ZUR VORLAGE ══════════════════════ */
log('\n=== C · Saeule -> Nutzung -> Typ -> Vorlage mit Massen ===')

for (const s of SAEULEN_WAHL) {
  const schluessel = nutzungFuerSaeule(s)
  const regel = NUTZUNGEN[schluessel]
  pruefe(
    regel != null,
    `Saeule ${s.n} (${s.name}) verweist auf eine bekannte Nutzung ("${schluessel}")`
  )
  if (!regel) continue
  pruefe(
    regel.typ != null && VORLAGEN_TYPEN.has(regel.typ),
    `Nutzung "${schluessel}" fuehrt auf Typ "${regel.typ}", und dafuer gibt es eine ` +
      `Vorlage mit Massen — sonst wirft legeAus erst beim Klick`
  )
}

// GEGENPROBE: eine Nutzung, deren Typ keine Vorlage hat, MUSS auffallen.
pruefe(
  !VORLAGEN_TYPEN.has('sprungbrett'),
  'Gegenprobe: ein erfundener Typ hat keine Vorlage und wuerde hier durchfallen'
)

// Die drei Saeulen an der Liege sind der Grund, warum Saeule und Belegung
// getrennt sind. Faellt das zusammen, ist der Entwurf verloren gegangen.
{
  const anDerListe = SAEULEN_WAHL.filter((s) => s.nutzung === 'behandlung').map((s) => s.name)
  pruefe(
    anDerListe.length === 3,
    `Drei Saeulen teilen sich die Liege und bleiben doch unterscheidbar ` +
      `(${anDerListe.join(', ')})`
  )
}

/* ══════════════════════ D · NACHSCHLAGEN RAET NICHT ══════════════════════ */
log('\n=== D · saeuleNach findet oder gibt null — nie etwas Geratenes ===')

pruefe(saeuleNach('09')?.name === 'Yoga', 'Nummer "09" findet Yoga')
pruefe(saeuleNach('Yoga')?.n === '09', 'Name "Yoga" findet Nummer 09')
pruefe(saeuleNach('yoga')?.n === '09', 'Gross-/Kleinschreibung ist egal')
pruefe(saeuleNach('  IHHT  ')?.n === '01', 'Umschliessende Leerzeichen stoeren nicht')
pruefe(saeuleNach('Noch offen') === OHNE_SAEULE, '„Noch offen" ist nachschlagbar')

// Die Gegenproben sind hier die eigentliche Pruefung: ein Nachschlagen, das
// IMMER etwas liefert, waere in einem getippten Wunsch („mach daraus einen
// Wellnessbereich") eine erfundene Aussage ueber das Haus.
pruefe(saeuleNach('Wellness') === null, 'Gegenprobe: ein unbekannter Name gibt null')
pruefe(saeuleNach('99') === null, 'Gegenprobe: eine unbekannte Nummer gibt null')
pruefe(saeuleNach('') === null, 'Gegenprobe: leerer Text gibt null')
pruefe(saeuleNach(null) === null, 'Gegenprobe: null gibt null')
pruefe(saeuleNach(undefined) === null, 'Gegenprobe: undefined gibt null')

/* ══════════════════════ ERGEBNIS ══════════════════════ */
log('\n' + '='.repeat(64))
if (fehler.length === 0) {
  log(`BESTANDEN — alle Pruefungen gruen. Bericht: ${BERICHT}`)
  process.exit(0)
}
log(`DURCHGEFALLEN — ${fehler.length} Pruefung(en):`)
for (const f of fehler) log(`  - ${f}`)
log(`Bericht: ${BERICHT}`)
process.exit(1)
