/**
 * RAUMBUCH, STUECKLISTE UND NORM-HINWEISE (W9)
 * ===========================================
 *
 * Was ein Grundriss fuer einen Businessplan wert ist, entscheidet sich nicht am
 * Bild, sondern an den Zahlen daneben: wie gross ist dieser Raum, was steht
 * darin, wie viele Stuehle, und wo widerspricht die Planung einer Regel. Diese
 * Datei rechnet genau das — und nur das.
 *
 * REINE RECHNUNG, KEIN CANVAS, KEIN DOM
 * Aus demselben Grund wie `axo-treffer.js`: was in `node` laufen kann, laesst
 * sich OHNE Browser pruefen (`tools/pruefe-kennzahlen.mjs`), und eine Zahl im
 * Businessplan, die niemand ohne Bildschirm nachrechnen kann, ist eine
 * Behauptung. Einzige Abhaengigkeit ist darum `axo-zyklen.js` — dieselbe
 * Raumableitung, die auch die Axonometrie zeichnet. Die ANZEIGE (Blatt-Anlage,
 * Legende, Massstabsleiste) baut auf diesen Ausgaengen auf, nicht umgekehrt.
 *
 * DREI DOKTRIN-REGELN, die den Wert dieser Datei ausmachen
 *
 * 1. GEPRUEFT WIRD AUSSCHLIESSLICH, WAS DER NUTZER GESETZT HAT.
 *    Das Aufmass wird NICHT bewertet. Gemessen am Auslieferungszustand:
 *    der gemessene Plan fuehrt 0 Oeffnungen — eine Pruefung „Raum ohne Tuer"
 *    ueber das Aufmass meldete sofort 24 Raeume; und 4 gemessene Stuecke haben
 *    ihren Mittelpunkt im Wandband (3 Lounge-Sessel, 1 Spuele) — eine Pruefung
 *    „Moebel in Wand" ueber das Aufmass meldete sofort 4 Stueck. Das sind genau
 *    die Zeilen, die man nach dem zweiten Blick nicht mehr liest. Die PDF ist
 *    die Grundwahrheit (Projekt-DNA), kein Pruefling.
 *
 * 2. „m² JE STUHL" IST EINE SPALTE IM RAUMBUCH, KEIN HINWEIS.
 *    Als Hinweis feuerte sie auf 11 von 24 Raeumen. ASR A1.2 nennt 8–10 m² je
 *    BUEROARBEITSPLATZ — ein Konferenzstuhl, ein Loungesessel und ein Hocker
 *    sind keine Arbeitsplaetze, und der Plan weiss nicht, welcher Stuhl welcher
 *    ist. Die Zahl steht darum neben dem Vergleichswert (`LEGENDE_STUHLFLAECHE`)
 *    und ueberlaesst den Schluss dem Leser.
 *
 * 3. HINWEISE NUR BEI N > 0, NIE ALS SPERRE, JEDE AUSSAGE MIT IHRER QUELLE.
 *    Ein leerer Befund erzeugt keine Zeile. Ein Hinweis verhindert nichts. Und
 *    wo kein Beleg existiert, steht „gesetzte Annahme" statt einer erfundenen
 *    DIN-Nummer — eine erfundene Norm saehe belegt aus und waere damit
 *    schaedlicher als eine offene Annahme (dieselbe Regel wie bei den
 *    Standardmassen in `src/model/floorplan.ts`).
 *
 * EINHEITEN
 * Gerechnet wird in ZENTIMETERN, der Einheit des Planers — `leiteRaeumeAb`
 * liefert Ecken in cm. Nach aussen gehen Flaechen in m² und Laengen in m, weil
 * ein Raumbuch so gelesen wird. Die Umrechnung steht an genau einer Stelle je
 * Groesse (`QM_JE_CM2`, `meterText`).
 */

import { leiteRaeumeAb, flaecheVon, mitteVon, liegtIn } from './axo-zyklen.js'

/** cm² -> m². Einzige Umrechnungsstelle fuer Flaechen. */
const QM_JE_CM2 = 1 / 10000

/**
 * Wanddicke in cm — GESETZTE Annahme, kein Messwert (Projekt-DNA Punkt 4: ein
 * Grundriss enthaelt keine Dicke). Derselbe Wert, mit dem `baueSzene` die
 * Waende auszieht und mit dem `tools/baue-bank-ansicht.mjs` baut; er entscheidet
 * hier allein darueber, was „steht in einer Wand" heisst.
 */
export const WAND_DICKE_CM = 12.5

/**
 * Ab welcher lichten Weite ein Durchgang nicht mehr angemerkt wird (cm).
 * 90 cm ist KEIN Wert dieses Werkzeugs, sondern der Wert aus ASR A2.3 Tabelle 1
 * fuer Durchgaenge ab 6 Personen. Das Standardmass des Planers (87,5 cm) liegt
 * knapp darunter — genau deshalb gibt es diesen Hinweis ueberhaupt.
 */
export const TUER_MINDESTBREITE_CM = 90

/**
 * Der Vergleichswert zur Raumbuch-Spalte „m² je Stuhl". Er steht in der Legende
 * NEBEN der Zahl und nicht als Urteil ueber sie (Doktrin-Regel 2).
 */
export const LEGENDE_STUHLFLAECHE =
  'Vergleichswert zur Spalte „m² je Stuhl": ASR A1.2 nennt 8–10 m² je ' +
  'Büroarbeitsplatz im Zellenbüro und 12–15 m² im Großraum, jeweils ' +
  'einschließlich Möblierung und anteiliger Verkehrsfläche (BAuA, ASR A1.2 ' +
  'Nr. 5). Der Plan zählt Stühle, nicht Arbeitsplätze — ob ein Stuhl einer ' +
  'ist, sagt er nicht.'

/**
 * Die Fusszeile unter jedem Raumbuch. Sie nennt die Herkunft der Flaechen UND
 * die Grenze des Werkzeugs — beides gehoert zusammen: eine Flaechenangabe ohne
 * Bezugsmass ist keine Angabe, und ein Hinweis-Werkzeug, das seinen Umfang
 * verschweigt, wird fuer eine Pruefung gehalten, die es nicht ist.
 */
export const FUSSZEILE =
  'Flächen aus den gemessenen Wandachsen abgeleitet (Rohbaumaß, keine ' +
  'Nutzfläche nach DIN 277). Höhen sind gesetzte Annahmen. Fluchtweg-Längen, ' +
  'Brandschutz und Belegungszahlen prüft dieses Werkzeug nicht.'

/* ══════════════════════════════════════════════════════════════════════
   SCHREIBWEISEN — an EINER Stelle
   ══════════════════════════════════════════════════════════════════════
   Dieselbe Zahl darf im Raumbuch nicht anders dastehen als im Hinweis
   darunter. Die Anzeige-Welle benutzt darum diese beiden Funktionen, statt
   eigene zu bauen — sonst haetten wir zwei Wahrheiten ueber die Schreibweise
   einer Zahl, und das faellt erst dem Leser auf. */

/** Deutsche Schreibweise mit Komma und fester Stellenzahl. */
export function zahlText(wert, stellen = 2) {
  if (!Number.isFinite(wert)) return '—'
  return wert.toFixed(stellen).replace('.', ',')
}

/**
 * Zentimeter als Meter-Angabe. ZWEI Nachkommastellen und keine dritte: die
 * Geometrie ist in cm gemessen, eine Millimeter-Stelle waere Scheingenauigkeit
 * (Projekt-DNA Punkt 3, dieselbe Festlegung wie in `Dimensioning.cmToMeasure`).
 */
export function meterText(cm) {
  return zahlText(cm / 100, 2)
}

/**
 * Flaeche als m²-Angabe mit EINER Nachkommastelle. Der Plan ist freihaendig
 * gezeichnet; 0,1 m² ist die ehrliche Aufloesung einer daraus abgeleiteten
 * Flaeche, 0,01 m² behauptete eine Genauigkeit, die das Original nicht hat.
 */
export function flaecheText(qm) {
  return zahlText(qm, 1)
}

/* ══════════════════════════════════════════════════════════════════════
   WAND-KANTEN EINES ZYKLUS
   ══════════════════════════════════════════════════════════════════════ */

/** Schluessel eines Eckenpaars, richtungsunabhaengig. */
function kantenSchluessel(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

/**
 * Welche Waende bilden diesen Zyklus? Eckenpaar -> `Wall.id`.
 *
 * DIE GRUNDLAGE FUER „RAUM OHNE TUER": eine Oeffnung haengt an `wandId`
 * (`src/model/floorplan.ts`, `Oeffnung.wandId`), ein Raum dagegen ist ein Zug
 * von Ecken. Ohne diese Uebersetzung liesse sich die Frage „traegt dieser Raum
 * irgendwo eine Tuer?" gar nicht stellen.
 *
 * WAENDE OHNE KENNUNG fallen heraus, und das ist richtig statt bequem: der
 * gemessene Plan (`app/public/plaene/halle400.json`) fuehrt keine
 * Wand-Kennungen — sie entstehen erst beim Laden durch den Kern
 * (`floorplan.ts:728`, `kennungAusWand`). Eine Wand ohne Kennung kann keine
 * Oeffnung tragen, denn eine Oeffnung braucht `wandId`. Hier eine zweite
 * Kennungs-Ableitung nachzubauen, waere genau der Fehler, den `axo-szene.js`
 * schon einmal ausdruecklich vermieden hat: zwei Ableitungen laufen
 * auseinander, und niemand merkt es.
 *
 * @param {{id:string,x:number,y:number}[]} zyklus Ein Zyklus aus `leiteRaeumeAb`
 * @param {{id?:string,corner1:string,corner2:string}[]} walls
 * @returns {string[]} Kennungen der Waende, die diesen Zyklus umschliessen
 */
export function wandKantenVon(zyklus, walls) {
  if (!zyklus || zyklus.length < 3) return []
  const nachSchluessel = new Map()
  for (const w of walls || []) {
    if (!w || !w.id) continue
    const s = kantenSchluessel(w.corner1, w.corner2)
    // Die ERSTE Wand eines Eckenpaars gewinnt. Zwei Waende zwischen denselben
    // beiden Ecken sind eine Doppelung im Grundriss, keine zweite Kante des
    // Raums — beide zu melden zaehlte denselben Durchgang zweimal.
    if (!nachSchluessel.has(s)) nachSchluessel.set(s, w.id)
  }

  const ids = []
  for (let i = 0; i < zyklus.length; i++) {
    const a = zyklus[i]
    const b = zyklus[(i + 1) % zyklus.length]
    const id = nachSchluessel.get(kantenSchluessel(a.id, b.id))
    if (id && !ids.includes(id)) ids.push(id)
  }
  return ids
}

/* ══════════════════════════════════════════════════════════════════════
   RAUMBUCH
   ══════════════════════════════════════════════════════════════════════ */

/** Abstand eines Punktes zur STRECKE a-b (nicht zur Geraden). Alles in cm. */
function abstandZuStrecke(pt, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const laenge2 = dx * dx + dy * dy
  if (laenge2 < 1e-9) return Math.hypot(pt.x - a.x, pt.y - a.y)
  // Auf die Strecke begrenzen: ohne die Klammer meldete eine kurze Wand jeden
  // Punkt auf ihrer VERLAENGERUNG als „in der Wand" — quer durch den halben
  // Grundriss.
  let t = ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / laenge2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(pt.x - (a.x + t * dx), pt.y - (a.y + t * dy))
}

/** Herkunft eines Ausstattungs-Stuecks — Standard ist `gemessen`. */
function istGesetztesStueck(el) {
  // Dieselbe Vorgabe wie im Modell (`floorplan.ts:866`, `uebernehmeAusstattung`):
  // fehlt das Feld, stammt das Stueck aus `tools/export_blueprint.py` und damit
  // aus der PDF. Andersherum machte diese Datei aus jedem Aufmass eine Setzung
  // und pruefte am Ende genau das, was sie nicht pruefen darf.
  return el.quelle === 'gesetzt'
}

/** Herkunft einer Oeffnung — Standard ist `gesetzt`. */
function istGesetzteOeffnung(o) {
  // Auch das spiegelt das Modell (`floorplan.ts:1280`, `uebernehmeOeffnungen`)
  // und ist dort GENAU ANDERSHERUM begruendet: eine Oeffnung kann es vor W4 gar
  // nicht gegeben haben, der gemessene Plan traegt keine.
  return o.quelle !== 'gemessen'
}

/**
 * Das vollstaendige Raumbuch samt Stueckliste.
 *
 * @param {{floorplan:object, labels?:object[]}} plan Plandaten (cm)
 * @param {{namen?:Record<string,string>, wandDicke?:number}} [opt]
 *        `namen` sind die deutschen Bezeichnungen aus `AUSSTATTUNG_NAME`
 *        (`src/floorplanner/floorplanner.ts`). Sie werden HEREINGEGEBEN und
 *        nicht abgeschrieben — aus demselben Grund, aus dem die Hoehen aus
 *        `src/three/ausstattung.ts` hereingegeben werden (`tools/lies-hoehen.mjs`):
 *        eine Kopie waere still veraltet, sobald jemand dort einen Namen aendert,
 *        und die Stueckliste hiesse etwas anderes als die Lösch-Rückfrage.
 *        Fehlt der Name eines Typs, steht die technische Kennung da (`stuhl`
 *        statt `Stuhl`) — sichtbar falsch statt still erfunden; genau darauf
 *        prueft `tools/pruefe-kennzahlen.mjs`.
 * @returns {{raeume:object[], stueckliste:object[], summen:object, erschliessungIndex:number}}
 */
export function baueRaumbuch(plan, opt = {}) {
  const fp = plan.floorplan || plan
  const labels = plan.labels || []
  const namen = opt.namen || {}
  const wandDicke = opt.wandDicke ?? WAND_DICKE_CM
  const nameVon = (typ) => namen[typ] || typ

  /* ── Die Flaechen ───────────────────────────────────────────────── */
  const zyklen = leiteRaeumeAb(fp.corners, fp.walls)
  const raeume = zyklen.map((z, i) => ({
    index: i,
    punkte: z.map((c) => ({ x: c.x, y: c.y })),
    ecken: z.length,
    flaeche: flaecheVon(z) * QM_JE_CM2,
    mitte: mitteVon(z),
    wandIds: wandKantenVon(z, fp.walls || []),
    istErschliessung: false,
    namensAnker: [],
    stuecke: [],
    stueckeGesamt: 0,
    stuehle: 0,
    flaecheJeStuhl: null
  }))

  /* ── Die Erschliessungszone ─────────────────────────────────────────
     DIESELBE Regel wie in `axo-szene.js:223-230` — der Zyklus mit den meisten
     Ecken (Schwelle 8), im gemessenen Plan 46 gegenueber 4 bei jedem Raum. Er
     maeandert zwischen allen Raeumen und schluckt zugleich die offenen
     Arbeitsbereiche ohne geschlossene Waende.

     Dass die Regel hier ein zweites Mal steht, ist eine Doppelung und wird
     nicht schoengeredet: `baueSzene` exportiert seinen `flurIndex` nur als Teil
     der fertigen Szene, und diese Datei darf `axo-szene.js` nicht laden (sie
     steht im Buendel VOR ihm und braeuchte dann ein Canvas-naeheres Modul fuer
     eine reine Rechnung). Die Doppelung ist deshalb BEWIESEN statt behauptet:
     `tools/pruefe-kennzahlen.mjs` haelt `erschliessungIndex` gegen
     `baueSzene(...).flurIndex` — laufen sie auseinander, wird das Gate rot. */
  let erschliessungIndex = -1
  let meisteEcken = 8
  raeume.forEach((r, i) => {
    if (r.ecken > meisteEcken) {
      meisteEcken = r.ecken
      erschliessungIndex = i
    }
  })
  if (erschliessungIndex >= 0) raeume[erschliessungIndex].istErschliessung = true

  /**
   * In welchem Zyklus liegt dieser Punkt? -1 = in keinem.
   *
   * Ein GESCHLOSSENER Raum gewinnt vor der Erschliessungszone. Geometrisch sind
   * die engsten Zyklen disjunkt, ein Punkt kann also gar nicht in beiden liegen
   * — ausser genau auf einer Wandachse, wo das Strahlenverfahren kippen kann.
   * Dort ist der Raum die nuetzlichere und die stabilere Antwort.
   */
  const zyklusFuer = (pt) => {
    let ersatz = -1
    for (let i = 0; i < raeume.length; i++) {
      if (!liegtIn(pt, raeume[i].punkte)) continue
      if (i !== erschliessungIndex) return i
      ersatz = i
    }
    return ersatz
  }

  /* ── Namen aus den Ankern ───────────────────────────────────────────
     Die Namen stehen NICHT an den Raeumen, sondern als Textanker in der PDF
     (`labels[]`, aus `tools/extract_plan.py`). Welcher Anker zu welchem Raum
     gehoert, entscheidet dieselbe Punkt-in-Vieleck-Frage wie bei der
     Ausstattung — gemessen liegen 12 der 18 Anker in einem geschlossenen Raum
     und 6 in der Erschliessungszone. Das ist kein Fehler der Ableitung,
     sondern die Wahrheit dieses Grundrisses: dort gibt es offene
     Arbeitsbereiche ohne trennende Waende. */
  for (const l of labels) {
    if (!l || !Array.isArray(l.anker_cm)) continue
    const i = zyklusFuer({ x: l.anker_cm[0], y: l.anker_cm[1] })
    if (i < 0) continue
    raeume[i].namensAnker.push(l.zusatz ? `${l.text} (${l.zusatz})` : l.text)
  }

  /* ── Ausstattung zuordnen und zaehlen ───────────────────────────── */
  const jeTyp = new Map()
  const zaehleTyp = (typ, gesetzt) => {
    if (!jeTyp.has(typ)) jeTyp.set(typ, { typ, name: nameVon(typ), gemessen: 0, gesetzt: 0, gesamt: 0 })
    const z = jeTyp.get(typ)
    z[gesetzt ? 'gesetzt' : 'gemessen']++
    z.gesamt++
  }

  const jeRaumTyp = raeume.map(() => new Map())
  const ausserhalb = []
  let inRaeumen = 0
  let inErschliessung = 0

  for (const el of fp.ausstattung || []) {
    const gesetzt = istGesetztesStueck(el)
    zaehleTyp(el.typ, gesetzt)
    const i = zyklusFuer({ x: el.x, y: el.y })
    if (i < 0) {
      ausserhalb.push(el)
      continue
    }
    if (i === erschliessungIndex) inErschliessung++
    else inRaeumen++
    const m = jeRaumTyp[i]
    if (!m.has(el.typ)) m.set(el.typ, { typ: el.typ, name: nameVon(el.typ), anzahl: 0, gemessen: 0, gesetzt: 0 })
    const z = m.get(el.typ)
    z.anzahl++
    z[gesetzt ? 'gesetzt' : 'gemessen']++
  }

  raeume.forEach((r, i) => {
    r.stuecke = [...jeRaumTyp[i].values()].sort((a, b) => b.anzahl - a.anzahl || a.typ.localeCompare(b.typ))
    r.stueckeGesamt = r.stuecke.reduce((s, z) => s + z.anzahl, 0)
    r.stuehle = jeRaumTyp[i].get('stuhl')?.anzahl ?? 0
    // Kein Stuhl heisst NICHT „unendlich viel Platz je Stuhl", sondern „keine
    // Aussage". `null` zwingt die Anzeige, das auch so zu schreiben.
    r.flaecheJeStuhl = r.stuehle > 0 ? r.flaeche / r.stuehle : null
    r.name = r.namensAnker.join(' · ')
    r.bezeichnung = r.istErschliessung
      ? 'Erschließungszone'
      : r.name || `Raum bei x = ${meterText(r.mitte.x)} m`
  })

  const stueckliste = [...jeTyp.values()].sort((a, b) => b.gesamt - a.gesamt || a.typ.localeCompare(b.typ))
  const geschlossene = raeume.filter((r) => !r.istErschliessung)

  return {
    raeume,
    stueckliste,
    erschliessungIndex,
    wandDicke,
    summen: {
      zyklen: raeume.length,
      raeume: geschlossene.length,
      flaecheRaeume: geschlossene.reduce((s, r) => s + r.flaeche, 0),
      flaecheGesamt: raeume.reduce((s, r) => s + r.flaeche, 0),
      flaecheErschliessung: erschliessungIndex >= 0 ? raeume[erschliessungIndex].flaeche : 0,
      stuecke: (fp.ausstattung || []).length,
      inRaeumen,
      inErschliessung,
      ausserhalb: ausserhalb.length,
      stuehle: jeTyp.get('stuhl')?.gesamt ?? 0,
      gemessen: stueckliste.reduce((s, z) => s + z.gemessen, 0),
      gesetzt: stueckliste.reduce((s, z) => s + z.gesetzt, 0),
      namensAnker: labels.length,
      ankerInRaeumen: geschlossene.reduce((s, r) => s + r.namensAnker.length, 0)
    }
  }
}

/* ══════════════════════════════════════════════════════════════════════
   HINWEISE
   ══════════════════════════════════════════════════════════════════════ */

/** Ein Betroffener eines Hinweises — Kennung UND lesbarer Text. */
function betroffen(art, kennung, text) {
  return { art, kennung, text }
}

/**
 * Norm- und Plausibilitaets-Hinweise zu dem, was der NUTZER gesetzt hat.
 *
 * Kein Ergebnis ist ein gutes Ergebnis: im Auslieferungszustand (0 gesetzte
 * Stuecke, 0 Oeffnungen) ist diese Liste LEER — nachgewiesen in
 * `tools/pruefe-kennzahlen.mjs`. Wer diese Datei erweitert, muss jede neue
 * Regel gegen genau das halten: eine Regel, die auf dem reinen Aufmass feuert,
 * bewertet die PDF und gehoert nicht hierher (Doktrin-Regel 1).
 *
 * @param {{floorplan:object, labels?:object[]}} plan
 * @param {object} raumbuch Ergebnis von `baueRaumbuch` — fuer Namen, Wandkanten
 *        und die Typ-Bezeichnungen; die werden nicht zweimal ermittelt.
 * @returns {{art:string, text:string, betroffen:object[]}[]}
 */
export function pruefeHinweise(plan, raumbuch) {
  const fp = plan.floorplan || plan
  const hinweise = []
  const nameVon = (typ) => raumbuch.stueckliste.find((z) => z.typ === typ)?.name || typ
  const oeffnungen = (fp.oeffnungen || []).filter((o) => istGesetzteOeffnung(o) && !o.verwaist)

  /* ── 1 · Tuerbreite ────────────────────────────────────────────────
     Nur was man durchgeht: ein Fenster faellt heraus. Und nur, was schmaler
     ist als der Wert der ASR — 87,5 cm ist das Standardmass dieses Werkzeugs
     und liegt 2,5 cm darunter, genau darum steht der Hinweis hier. */
  const DURCHGANG_NAME = { tuer: 'Tür', doppeltuer: 'Doppeltür', durchgang: 'Durchgang' }
  const schmale = oeffnungen.filter(
    (o) => DURCHGANG_NAME[o.art] && o.breite < TUER_MINDESTBREITE_CM
  )
  if (schmale.length > 0) {
    const raumFuerWand = (wandId) =>
      raumbuch.raeume.find((r) => !r.istErschliessung && r.wandIds.includes(wandId))?.bezeichnung ||
      raumbuch.raeume.find((r) => r.wandIds.includes(wandId))?.bezeichnung ||
      'an einer frei stehenden Wand'
    // Der NORM-Teil steht woertlich gleich, ob eine oder zwanzig Tueren
    // betroffen sind; nur der Befund davor wird gezaehlt. Zwanzig gleich
    // lautende Hinweise untereinander liest niemand — und genau dann faellt
    // auch der eine wichtige nicht mehr auf.
    const norm =
      'ASR A2.3 Tabelle 1 nennt für Durchgänge ab 6 Personen mindestens 0,90 m ' +
      '(bis 5 Personen: 0,80 m). Das Standardmaß dieses Werkzeugs ist 87,5 cm — ' +
      'ein Baurichtmaß, keine Fluchtweg-Auslegung.'
    const eine = schmale[0]
    const befund =
      schmale.length === 1
        ? `Die gesetzte ${DURCHGANG_NAME[eine.art]} in ‚${raumFuerWand(eine.wandId)}' ist ` +
          `${meterText(eine.breite)} m breit.`
        : `${schmale.length} gesetzte Öffnungen sind schmaler als 0,90 m: ` +
          schmale
            .map(
              (o) =>
                `${DURCHGANG_NAME[o.art]} in ‚${raumFuerWand(o.wandId)}' (${meterText(o.breite)} m)`
            )
            .join(' · ') +
          '.'
    hinweise.push({
      art: 'tuerbreite',
      text: `${befund} ${norm}`,
      betroffen: schmale.map((o) =>
        betroffen(
          'oeffnung',
          o.id,
          `${DURCHGANG_NAME[o.art]} in ‚${raumFuerWand(o.wandId)}' (${meterText(o.breite)} m)`
        )
      )
    })
  }

  /* ── 2 · Raum ohne Tuer ────────────────────────────────────────────
     NUR wenn mindestens eine Oeffnung gesetzt ist, durch die man gehen kann.
     Ohne diese Bedingung meldete der Auslieferungszustand sofort alle 24
     Raeume — das Aufmass enthaelt keine Oeffnungen, weil die PDF Waende zeigt
     und keine Tuerblaetter. Ein Fenster zaehlt hier nicht: es macht einen Raum
     nicht zugaenglich. */
  const durchgangsWaende = new Set(
    oeffnungen.filter((o) => DURCHGANG_NAME[o.art]).map((o) => o.wandId)
  )
  if (durchgangsWaende.size > 0) {
    const ohne = raumbuch.raeume.filter(
      (r) => !r.istErschliessung && !r.wandIds.some((id) => durchgangsWaende.has(id))
    )
    if (ohne.length > 0) {
      hinweise.push({
        art: 'raum-ohne-tuer',
        text:
          `${ohne.length} Räume tragen an keiner ihrer Wände eine Tür oder einen ` +
          `Durchgang: ${ohne.map((r) => r.bezeichnung).join(', ')}. Gezählt werden ` +
          `gesetzte Öffnungen — das Aufmaß enthält keine (die PDF zeigt Wände, ` +
          `keine Türblätter).`,
        betroffen: ohne.map((r) => betroffen('raum', r.index, r.bezeichnung))
      })
    }
  }

  /* ── 3 · Moebel in einer Wand ──────────────────────────────────────
     GEMESSENE Stuecke sind ausgenommen. Nicht aus Nachlaessigkeit: gemessen
     liegen 4 Mittelpunkte im Wandband (3 Lounge-Sessel, 1 Spuele), weil der
     Plan freihaendig gezeichnet ist und die Wandachse die belegungsgewichtete
     Mittellinie des Duktus ist — nicht die Pixelkante. Diese 4 zu melden hiesse,
     die Grundwahrheit zu ruegen (Doktrin-Regel 1). */
  const strecken = []
  for (const w of fp.walls || []) {
    const a = fp.corners[w.corner1]
    const b = fp.corners[w.corner2]
    if (a && b) strecken.push([a, b])
  }
  const halbeDicke = (raumbuch.wandDicke ?? WAND_DICKE_CM) / 2
  const imWandband = (pt) => strecken.some(([a, b]) => abstandZuStrecke(pt, a, b) <= halbeDicke)

  const gesetzteStuecke = (fp.ausstattung || []).filter(istGesetztesStueck)
  const inWand = gesetzteStuecke.filter((el) => imWandband({ x: el.x, y: el.y }))
  if (inWand.length > 0) {
    hinweise.push({
      art: 'moebel-in-wand',
      text:
        `${inWand.length} frei gesetzte Stücke stehen in einer Wand: ` +
        inWand.map((el) => `${nameVon(el.typ)} bei x = ${meterText(el.x)} m`).join(' · ') +
        `. Gemessene Stücke sind ausgenommen — sie sind das Aufmaß.`,
      betroffen: inWand.map((el) =>
        betroffen('stueck', el.id, `${nameVon(el.typ)} bei x = ${meterText(el.x)} m`)
      )
    })
  }

  /* ── 4 · Moebel ausserhalb jeder Raumflaeche ───────────────────────
     Sie werden gezeichnet und in der Stueckliste mitgezaehlt — verschwiegen
     wird nichts. Sie gehoeren nur zu keinem Raum, und deshalb taucht ihre
     Flaeche in keiner Raumzeile auf. */
  const punkteJeZyklus = raumbuch.raeume.map((r) => r.punkte)
  const draussen = gesetzteStuecke.filter(
    (el) => !punkteJeZyklus.some((p) => liegtIn({ x: el.x, y: el.y }, p))
  )
  if (draussen.length > 0) {
    hinweise.push({
      art: 'moebel-ausserhalb',
      text:
        `${draussen.length} frei gesetzte Stücke liegen außerhalb jeder Raumfläche: ` +
        draussen.map((el) => `${nameVon(el.typ)} bei x = ${meterText(el.x)} m`).join(' · ') +
        `. Sie werden gezeichnet und mitgezählt, gehören aber zu keinem Raum im Raumbuch.`,
      betroffen: draussen.map((el) =>
        betroffen('stueck', el.id, `${nameVon(el.typ)} bei x = ${meterText(el.x)} m`)
      )
    })
  }

  return hinweise
}
