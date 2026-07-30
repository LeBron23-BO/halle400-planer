// ANFASSEN STATT WERKZEUGKUNDE (W13) — die reine Rechnung.
//
// Nutzerbefund, wörtlich aus W12: *„ich kann die wände immer noch nicht bewegen"*
// — obwohl das Wand-Werkzeug seit W10 existiert und seit W12b wirklich zieht.
// Gebaut war es, gefunden wurde es nicht. Dasselbe gilt für das Zusammenlegen:
// die Rechnung steht seit W12, aber sie ist über KEINEN Knopf erreichbar.
//
// DER BEFUND DAHINTER: dieser Planer verlangt, dass man erst ein Werkzeug wählt
// und dann ein Ding anfasst. Das ist die Reihenfolge einer Werkstatt, nicht die
// einer Hand. Wer auf eine Wand zeigt, meint DIESE Wand — und was man mit ihr
// tun kann, weiss der Plan besser als der Nutzer. Diese Datei dreht die
// Reihenfolge um: **erst das Ding, dann die Handlung.**
//
// WARUM DAS EINE REINE RECHNUNG IST (kein Zugriff auf Floorplan, Corner, Wall)
// Dasselbe Muster wie `raum-zusammenlegen.js` und `axo-treffer.js`: was ohne
// Browser gerechnet werden kann, wird ohne Browser gerechnet. Ein Menü ist ein
// besonders lohnender Fall dafür — es hat viele Zustände (Wand mit/ohne Nachbarn,
// gemessen/gesetzt, Möbel am Rand, Raum ohne Namen), und die lassen sich in node
// DURCHFAHREN, statt sie in einer Bedienung zu erahnen.
//
// SECHS FESTLEGUNGEN
//
// 1. **Der KLEINSTE Treffer gewinnt.** Möbel vor Öffnung vor Ecke vor Wand vor
//    Raum. Das ist keine neue Regel, sondern dieselbe, die `trefferBestimmen`
//    seit W10 (Punkt B des Bedien-Audits) für die Maus anwendet: das Kleinere
//    ist das Absichtlichere. Ein Raum ist immer da, also darf er nie etwas
//    Genaueres verdecken.
// 2. **Das Menü nennt HANDLUNGEN, nie Werkzeuge.** Kein Eintrag heisst
//    „Wand-Werkzeug"; sie heissen „Diese Wand verschieben". Was intern ein
//    Moduswechsel ist, ist nach aussen eine Handlung an DIESEM Ding — sonst
//    wäre nur die Werkzeugleiste an eine andere Stelle gewandert.
// 3. **Kein Eintrag ohne Wirkung.** Was hier nicht geht, steht nicht da — mit
//    EINER Ausnahme: wenn der Grund selbst die Auskunft ist, die der Nutzer
//    sucht. „Kein Nachbarraum zum Verbinden" gehört hin (sonst sucht er den
//    Eintrag weiter), „Tür setzen" an einer Wand ohne Platz gehört weg. Ein
//    Menü aus grauen Einträgen ist ein Katalog, keine Bedienung.
// 4. **Eine Trennwand weiss, welche zwei Räume sie trennt.** Darum ist ihr
//    „Entfernen" kein Löschen, sondern der Einstieg ins Zusammenlegen (W13b):
//    entfernt man sie, entsteht ein grosser Raum — das ist die Wirkung, und die
//    Bedienung muss sie zeigen, BEVOR sie geschieht. Wer nur „Wand gelöscht"
//    sagt, verschweigt das Ergebnis.
// 5. **Über gemessene Bausubstanz wird nichts beschönigt.** Eine gemessene Wand
//    zu verschieben oder zu entfernen ist ein UMBAU und kein Aufmass (Projekt-DNA:
//    die PDF ist die Grundwahrheit). Der Eintrag trägt diesen Hinweis mit sich —
//    er ist kein Verbot, aber er ist keine Fussnote.
// 6. **Diese Datei führt NICHTS aus.** Sie beschreibt, was möglich wäre, und
//    gibt jedem Eintrag eine `handlung` — einen Schlüssel, den die Bedienung
//    ausdeutet. Dasselbe Planen/Anwenden-Paar wie in W12, aus demselben Grund:
//    was beschreibt, kann man prüfen, ohne es geschehen zu lassen.

// ⚠ OHNE Umbenennung importieren (`as` ist verboten). `buendleKern` ENTFERNT
// jede Import-Zeile und legt alle Raum-Module in EIN Namensfeld — ein `as RZ`
// überlebt das nicht, und `RZ` wäre in der ausgelieferten Datei `undefined`.
// Der Fehler fiele im Planer NICHT auf (dort lädt `import` nach), sondern erst
// in der Doppelklick-Datei, und dort als tote Bedienung. Dieselbe Falle, vor der
// `buendel-kern.mjs` bei RAUM_MODULE warnt — hier ist ihre zweite Hälfte.
// Beide Namen existieren im Bündel als schlichte Bezeichner, weil
// `raum-zusammenlegen.js` VOR dieser Datei steht.
import { _pruefzugang, pruefeZusammenlegen } from './raum-zusammenlegen.js'

const omPunktInRing = _pruefzugang.punktInRing
const omAbstand = _pruefzugang.abstandPunktStrecke
const omMoebelEcken = _pruefzugang.moebelEcken
const omRingFlaeche = _pruefzugang.ringFlaeche

/** Ganze Zentimeter — Projekt-DNA Punkt 3. */
const omCm = (n) => Math.round(n)

/**
 * Die Toleranzen, in denen ein Griff noch trifft — in ZENTIMETERN.
 *
 * Sie kommen von aussen herein, weil sie am Bildschirm vom Zoom abhängen: 12 px
 * sind bei weit herausgezoomtem Plan mehrere Meter. Die Standardwerte hier gelten
 * für den Startzoom und sind dieselben Grössen, die `trefferBestimmen` benutzt.
 */
export const OM_TOLERANZ = {
  ecke: 20,
  wand: 25,
  oeffnung: 20
}

/* ============================================================ Was liegt hier? */

/**
 * Was liegt unter diesem Punkt? Festlegung 1 — der kleinste Treffer gewinnt.
 *
 * @param {{x:number,y:number}} punkt Weltkoordinate in cm.
 * @param {{
 *   moebel?: any[], oeffnungen?: any[], ecken?: any[], waende?: any[],
 *   raeume?: {key:string, ring:{x:number,y:number}[], name?:string}[]
 * }} welt
 * @param {typeof OM_TOLERANZ} [toleranz]
 * @returns {{art:'moebel'|'oeffnung'|'ecke'|'wand'|'raum', id:string, objekt:any}|null}
 */
export function objektAn(punkt, welt, toleranz = OM_TOLERANZ) {
  if (!punkt || !Number.isFinite(punkt.x) || !Number.isFinite(punkt.y)) return null
  const t = { ...OM_TOLERANZ, ...(toleranz ?? {}) }

  // (1) Möbel — das Kleinste und das am häufigsten Gemeinte. Bei mehreren
  // übereinander gewinnt das ZULETZT eingefügte: es liegt oben und ist das, was
  // der Nutzer sieht (dieselbe Regel wie im Blatt, W7 Punkt 3).
  for (let i = (welt.moebel?.length ?? 0) - 1; i >= 0; i--) {
    const m = welt.moebel[i]
    if (omPunktInRing(punkt, omMoebelEcken(m))) {
      return { art: 'moebel', id: m.id, objekt: m }
    }
  }

  // (2) Öffnungen liegen AUF einer Wand und wären von ihr sonst verdeckt.
  let besteOeffnung = null
  for (const o of welt.oeffnungen ?? []) {
    const wand = (welt.waende ?? []).find((w) => w.id === o.wandId)
    if (!wand) continue // verwaist (W4 Punkt 4) — nicht gezeichnet, nicht greifbar
    const mitte = omOeffnungsMitte(o, wand)
    if (!mitte) continue
    const d = Math.hypot(punkt.x - mitte.x, punkt.y - mitte.y)
    // Eine breite Tür ist über ihre ganze Breite greifbar, nicht nur im Punkt.
    const reichweite = Math.max(t.oeffnung, (o.breite ?? 0) / 2)
    if (d <= reichweite && (!besteOeffnung || d < besteOeffnung.d)) {
      besteOeffnung = { d, o }
    }
  }
  if (besteOeffnung) {
    return { art: 'oeffnung', id: besteOeffnung.o.id, objekt: besteOeffnung.o }
  }

  // (3) Ecken vor Wänden: eine Ecke ist der Punkt, an dem ZWEI Wände hängen, und
  // wer sie meint, meint sie genau (E2 — der Ecken-Fang ist die tragende
  // Bedienung des Zeichnens).
  let besteEcke = null
  for (const e of welt.ecken ?? []) {
    const d = Math.hypot(punkt.x - e.x, punkt.y - e.y)
    if (d <= t.ecke && (!besteEcke || d < besteEcke.d)) besteEcke = { d, e }
  }
  if (besteEcke) return { art: 'ecke', id: besteEcke.e.id, objekt: besteEcke.e }

  // (4) Wände.
  let besteWand = null
  for (const w of welt.waende ?? []) {
    const d = omAbstand(punkt, w.a, w.b)
    const reichweite = Math.max(t.wand, (w.dicke ?? 0) / 2)
    if (d <= reichweite && (!besteWand || d < besteWand.d)) besteWand = { d, w }
  }
  if (besteWand) return { art: 'wand', id: besteWand.w.id, objekt: besteWand.w }

  // (5) Der Raum — immer da, deshalb zuletzt. Bei verschachtelten Ringen gewinnt
  // der KLEINERE: ein Raum in einem Raum ist der genauere Treffer.
  let besterRaum = null
  for (const r of welt.raeume ?? []) {
    if (!omPunktInRing(punkt, r.ring)) continue
    const flaeche = Math.abs(omRingFlaeche(r.ring))
    if (!besterRaum || flaeche < besterRaum.flaeche) besterRaum = { flaeche, r }
  }
  if (besterRaum) return { art: 'raum', id: besterRaum.r.key, objekt: besterRaum.r }

  return null
}

/** Die Weltkoordinate der Mitte einer Öffnung — `lage` ist ein absolutes Mass (W4 Punkt 2). */
function omOeffnungsMitte(o, wand) {
  const dx = wand.b.x - wand.a.x
  const dy = wand.b.y - wand.a.y
  const laenge = Math.hypot(dx, dy)
  if (laenge === 0) return null
  const t = Math.max(0, Math.min(1, (o.lage ?? 0) / laenge))
  return { x: wand.a.x + dx * t, y: wand.a.y + dy * t }
}

/* ==================================================== Nachbarschaft von Räumen */

/**
 * Welche Räume grenzen an diesen — und über welche Wände?
 *
 * Gerechnet wird über `pruefeZusammenlegen`, NICHT über eine zweite
 * Trennwand-Erkennung. Zwei Fassungen derselben Frage liefen auseinander, sobald
 * jemand eine anfasst — und dann böte das Menü ein Verbinden an, das die
 * Ausführung ablehnt (oder umgekehrt: der Nutzer sieht zwei Nachbarn und findet
 * keinen Eintrag).
 */
export function nachbarnVon(raum, welt) {
  if (!raum) return []
  const waende = welt.waende ?? []
  const treffer = []
  for (const anderer of welt.raeume ?? []) {
    if (anderer.key === raum.key) continue
    const probe = pruefeZusammenlegen(raum, anderer, waende)
    if (probe.moeglich) {
      treffer.push({
        raum: anderer,
        trennwaende: probe.trennwaende.map((w) => w.id),
        // Wie viele davon sind GEMESSEN? Das ist die Zahl, die den Umbau-Hinweis
        // auslöst — nicht die Gesamtzahl.
        gemessen: probe.trennwaende.filter((w) => (w.quelle ?? 'gemessen') === 'gemessen').length
      })
    }
  }
  return treffer
}

/**
 * Welche zwei Räume trennt DIESE Wand? Die Umkehrung von `nachbarnVon`, und die
 * Grundlage von W13b: entfernt man sie, entsteht aus zweien einer.
 *
 * Gibt `null` zurück, wenn die Wand keine Trennwand ist (Aussenwand, freies
 * Stück, oder sie liegt nur an EINEM Raum).
 */
export function raeumeAnWand(wandId, welt) {
  const wand = (welt.waende ?? []).find((w) => w.id === wandId)
  if (!wand) return null
  const raeume = welt.raeume ?? []
  for (let i = 0; i < raeume.length; i++) {
    for (let j = i + 1; j < raeume.length; j++) {
      const probe = pruefeZusammenlegen(raeume[i], raeume[j], welt.waende ?? [])
      if (probe.moeglich && probe.trennwaende.some((w) => w.id === wandId)) {
        return { a: raeume[i], b: raeume[j], trennwaende: probe.trennwaende.map((w) => w.id) }
      }
    }
  }
  return null
}

/* =========================================================== Das Menü zum Ding */

/** Ist diese Wand gemessen — also Teil der PDF-Grundwahrheit? */
function omIstGemessen(objekt) {
  return (objekt?.quelle ?? 'gemessen') === 'gemessen'
}

const OM_UMBAU_HINWEIS =
  'Das ist ein Umbau, kein Aufmass — der Plan sagt es danach im Kopf.'

/**
 * Was kann man mit dem Getroffenen tun?
 *
 * @returns {{
 *   art:string, id:string, titel:string, hinweis:string|null,
 *   eintraege:{handlung:string, text:string, ernst?:boolean, hinweis?:string, ziel?:any}[]
 * }|null}
 */
export function menueFuer(treffer, welt, opts = {}) {
  if (!treffer) return null
  const namen = opts.namen ?? {}

  if (treffer.art === 'moebel') return omMoebelMenue(treffer, opts)
  if (treffer.art === 'oeffnung') return omOeffnungsMenue(treffer, welt)
  if (treffer.art === 'wand') return omWandMenue(treffer, welt, namen)
  if (treffer.art === 'ecke') return omEckenMenue(treffer, welt)
  if (treffer.art === 'raum') return omRaumMenue(treffer, welt, namen)
  return null
}

function omMoebelMenue(treffer, opts) {
  const m = treffer.objekt
  const name = opts.moebelNamen?.[m.typ] ?? m.typ ?? 'Stück'
  const eintraege = [
    { handlung: 'moebel-ziehen', text: 'Verschieben' },
    { handlung: 'moebel-drehen-links', text: 'Nach links drehen (15°)' },
    { handlung: 'moebel-drehen-rechts', text: 'Nach rechts drehen (15°)' },
    { handlung: 'moebel-loeschen', text: 'Entfernen', ernst: true }
  ]
  return {
    art: 'moebel',
    id: m.id,
    titel: name,
    // Am Handy gibt es Q/E nicht (W8) — die Dreh-Einträge SIND der Ersatz, und
    // deshalb stehen sie hier und nicht nur in einem Tastenhinweis.
    hinweis: omIstGemessen(m) ? null : 'Frei gesetzt — kein Aufmass.',
    eintraege
  }
}

function omOeffnungsMenue(treffer, welt) {
  const o = treffer.objekt
  const namen = { tuer: 'Tür', doppeltuer: 'Doppeltür', fenster: 'Fenster', durchgang: 'Durchgang' }
  const eintraege = [
    { handlung: 'oeffnung-ziehen', text: 'An der Wand verschieben' }
  ]
  // Anschlag und Aufschlagseite gibt es nur, wo sie eine Bedeutung haben: ein
  // Durchgang hat kein Blatt, das anschlagen könnte (Festlegung 3).
  if (o.art === 'tuer' || o.art === 'doppeltuer') {
    eintraege.push({ handlung: 'oeffnung-anschlag', text: 'Anschlag wenden' })
    eintraege.push({ handlung: 'oeffnung-seite', text: 'Aufschlagseite wenden' })
  }
  eintraege.push({ handlung: 'oeffnung-loeschen', text: 'Entfernen', ernst: true })
  return {
    art: 'oeffnung',
    id: o.id,
    titel: `${namen[o.art] ?? 'Öffnung'} (${omMeter(o.breite)} breit)`,
    hinweis: null,
    eintraege
  }
}

function omEckenMenue(treffer, welt) {
  const e = treffer.objekt
  const anzahl = (welt.waende ?? []).filter((w) => w.aId === e.id || w.bId === e.id).length
  return {
    art: 'ecke',
    id: e.id,
    titel: anzahl > 1 ? `Ecke (${anzahl} Wände)` : 'Wandende',
    hinweis: OM_UMBAU_HINWEIS,
    eintraege: [
      { handlung: 'ecke-ziehen', text: 'Diesen Punkt verschieben', hinweis: OM_UMBAU_HINWEIS }
    ]
  }
}

function omWandMenue(treffer, welt, namen) {
  const w = treffer.objekt
  const laenge = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y)
  const gemessen = omIstGemessen(w)
  const eintraege = []

  // Festlegung 4: Zuerst und am deutlichsten das, was diese Wand BEDEUTET.
  const trennt = raeumeAnWand(w.id, welt)
  if (trennt) {
    const nA = omRaumName(trennt.a, namen)
    const nB = omRaumName(trennt.b, namen)
    eintraege.push({
      handlung: 'raeume-verbinden',
      text: `${nA} und ${nB} zu einem Raum verbinden`,
      hinweis:
        trennt.trennwaende.length > 1
          ? `Dazu gehören ${trennt.trennwaende.length} Wandstücke — sie gehen alle mit.`
          : null,
      ziel: { raumA: trennt.a.key, raumB: trennt.b.key, trennwaende: trennt.trennwaende }
    })
  }

  eintraege.push({
    handlung: 'wand-ziehen',
    text: 'Diese Wand verschieben',
    hinweis: gemessen ? OM_UMBAU_HINWEIS : null
  })

  // Eine Öffnung braucht Platz. Steht sie nicht zur Verfügung, gehört der Eintrag
  // weg statt grau hin (Festlegung 3) — die schmalste Vorlage ist der Durchgang.
  if (laenge >= 100) {
    eintraege.push({ handlung: 'wand-oeffnung', text: 'Tür oder Fenster einsetzen' })
  }

  eintraege.push({
    handlung: 'wand-loeschen',
    // Eine Trennwand zu löschen IST das Verbinden — sie doppelt anzubieten wäre
    // zweimal derselbe Weg mit verschiedenen Namen, und einer von beiden zeigte
    // dann nicht das ganze Ergebnis.
    text: trennt ? 'Nur die Wand entfernen (ohne Räume zu verbinden)' : 'Diese Wand entfernen',
    ernst: true,
    hinweis: gemessen ? OM_UMBAU_HINWEIS : null
  })

  return {
    art: 'wand',
    id: w.id,
    titel: `Wand ${omMeter(laenge)}${gemessen ? '' : ' (gesetzt)'}`,
    hinweis: null,
    eintraege
  }
}

function omRaumMenue(treffer, welt, namen) {
  const r = treffer.objekt
  const flaeche = Math.abs(omRingFlaeche(r.ring)) / 10000 // cm² → m²
  const nachbarn = nachbarnVon(r, welt)

  // UMBENENNEN steht hier bewusst NICHT (Festlegung 3: kein Eintrag ohne
  // Wirkung). Es sähe nach einer Kleinigkeit aus und ist keine: `roomMeta`
  // hängt an Schlüsseln aus den PDF-Textankern, nicht an `Room.getUuid()` —
  // und diese UUID ist der Hash der Ecken, ändert sich also bei jeder
  // Grundriss-Änderung. Ein Setter über sie legte einen Eintrag an, der beim
  // nächsten `update()` verwaist: der Name wäre nach dem ersten Wandzug still
  // weg. Welcher Anker in einem geänderten Raum gilt, ist Beschriftungs-Politik
  // und keine Geometrie (dieselbe offene Grenze, die W12 Festlegung 2 der
  // Brücke ausdrücklich stehen lässt). Ein Menüeintrag, der einen Namen
  // annimmt und ihn dann verliert, wäre schlimmer als keiner.
  const eintraege = []

  if (nachbarn.length > 0) {
    for (const n of nachbarn) {
      eintraege.push({
        handlung: 'raeume-verbinden',
        text: `Mit ${omRaumName(n.raum, namen)} verbinden`,
        hinweis:
          n.gemessen > 0
            ? `${n.gemessen === 1 ? 'Eine gemessene Wand fällt' : n.gemessen + ' gemessene Wände fallen'} — ${OM_UMBAU_HINWEIS}`
            : null,
        ziel: { raumA: r.key, raumB: n.raum.key, trennwaende: n.trennwaende }
      })
    }
  } else {
    // Festlegung 3, die Ausnahme: hier IST der Grund die gesuchte Auskunft.
    eintraege.push({
      handlung: null,
      text: 'Kein Nachbarraum zum Verbinden',
      hinweis: 'Verbinden lassen sich nur Räume, die eine Wand teilen.'
    })
  }

  eintraege.push({ handlung: 'raum-einrichten', text: 'Einrichten (Matten, Geräte, Liegen)' })

  return {
    art: 'raum',
    id: r.key,
    titel: `${omRaumName(r, namen)} · ${flaeche.toFixed(1).replace('.', ',')} m²`,
    hinweis: null,
    eintraege
  }
}

/**
 * Der anzuzeigende Name eines Raums.
 *
 * Ohne Namen wird KEINER erfunden (W12 Festlegung 2 der Brücke: eine geratene
 * Zuordnung wäre schlimmer als eine offene Grenze). Stattdessen die Fläche —
 * sie ist gemessen und unterscheidet zwei Räume zuverlässig.
 */
function omRaumName(raum, namen = {}) {
  const eigener = namen[raum.key] ?? raum.name
  if (typeof eigener === 'string' && eigener.trim() !== '') return eigener.trim()
  const flaeche = Math.abs(omRingFlaeche(raum.ring)) / 10000
  return `Raum ${flaeche.toFixed(1).replace('.', ',')} m²`
}

/** Deutsche Meter-Angabe, auf Zentimeter gerundet (Projekt-DNA Punkt 3, T6). */
function omMeter(cm) {
  if (!Number.isFinite(cm)) return '?'
  return `${(omCm(cm) / 100).toFixed(2).replace('.', ',')} m`
}

export const _omPruefzugang = {
  oeffnungsMitte: omOeffnungsMitte,
  raumName: omRaumName,
  meter: omMeter,
  istGemessen: omIstGemessen,
  UMBAU_HINWEIS: OM_UMBAU_HINWEIS
}
