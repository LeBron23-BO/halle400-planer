// RÄUME ZUSAMMENLEGEN (W12) — die reine Rechnung.
//
// Nutzerwunsch, wörtlich: *„funktionen sollen eingebaut werden, wo man klever 2
// räume ineinander führen kann. ich möchte zb einen größeren raum schaffen für
// yoga, kurse und so weiter und dieser muss aus 2 kleinen räumen entstehen [...]
// aber auch die möbel und so weiter selbst anpasst"*.
//
// DER TRAGENDE BEFUND: Räume sind in diesem Planer KEINE Objekte.
// `Floorplan.update()` leitet sie bei jeder Änderung neu aus dem Wandgraphen ab
// (geschlossene Zyklen, `findRooms`). Zwei Räume zusammenzulegen heisst deshalb
// nicht „einen Raum verändern", sondern: **die Wände entfernen, die zwischen
// ihnen stehen** — den grossen Raum bildet der Kern danach von selbst. Alles,
// was diese Datei tut, ist das drumherum: welche Wände sind es, was passiert mit
// dem Namen, was mit der Tür darin, und was mit den Möbeln.
//
// WARUM DAS EINE REINE RECHNUNG IST (kein Zugriff auf Floorplan, Corner, Wall)
// Dasselbe Muster wie `src/axo/axo-treffer.js`: was ohne Browser gerechnet
// werden kann, wird ohne Browser gerechnet — dann ist es in node prüfbar, und
// ein Gate kann alle Grenzfälle durchfahren, statt sie in einer Bedienung zu
// erahnen. Diese Datei sieht nur einfache Daten (Zahlen, Listen) und gibt einen
// VORSCHLAG zurück. Anwenden tut ihn die Schicht darüber.
//
// PLANEN UND ANWENDEN SIND GETRENNT — und das ist der Grund, warum es überhaupt
// eine Vorschau geben kann: `zusammenlegenPlanen()` verändert nichts, sondern
// beschreibt, was passieren würde. Dieselbe Beschreibung malt die Vorschau, füllt
// die Rückfrage („Verloren gehen: 1 Tür") und führt die Änderung aus. Drei
// getrennte Rechnungen liefen auseinander, sobald jemand eine anfasst — und dann
// zeigte die Vorschau etwas anderes, als hinterher dasteht.
//
// SIEBEN FESTLEGUNGEN
//
// 1. **Eine Trennwand ist eine Wand, die auf einer Kante BEIDER Räume liegt.**
//    Nicht „eine Wand zwischen den Schwerpunkten", nicht „die kürzeste Wand" —
//    beides wäre geraten. Verglichen wird über die Kanten der Ringe, gerundet auf
//    ganze Zentimeter (Projekt-DNA Punkt 3: die Geometrie ist in cm gemessen,
//    eine dritte Nachkommastelle wäre Scheingenauigkeit).
// 2. **Es sind MEHRERE Wände.** Eine 12-m-Grenze zwischen zwei Räumen besteht in
//    diesem Plan aus mehreren Wandstücken (jede Türöffnung, jede Ecke teilt sie).
//    Wer nur eine entfernt, lässt einen Stummel stehen — und der Kern bildet dann
//    keinen gemeinsamen Ring, sondern zwei Räume mit einer Lücke.
// 3. **Entfernt werden NUR die gemeinsamen Kanten, alle davon.** Die Vereinigung
//    ist deshalb immer ein einfacher Ring: Kanten beider Ringe zusammenwerfen,
//    die gemeinsamen streichen, den Rest verketten.
// 4. **Eine entfernte gemessene Wand ist ein UMBAU, kein Aufmass.** Die PDF ist
//    die Grundwahrheit (Projekt-DNA). Der Vorschlag zählt deshalb getrennt, wie
//    viele GEMESSENE Wände fallen — diese Zahl gehört in den Blattkopf und auf
//    den Ausdruck. Ein Blatt, das eine abgerissene Wand verschweigt, behauptet
//    gegenüber der Bank eine Halle, die so nicht gebaut ist.
// 5. **Über die Statik sagt diese Rechnung NICHTS.** Es gibt kein Feld
//    „tragend" in den Daten, und aus einem Grundriss ist es nicht ableitbar.
//    Erfunden wird darum nichts: der Vorschlag trägt einen Hinweis, wenn eine
//    entfernte Wand Merkmale einer tragenden hat (Dicke, Länge, Aussenanschluss)
//    — als FRAGE an einen Fachmann, nicht als Urteil.
// 6. **Möbel werden verschoben, nie stillschweigend gelöscht.** Was in der
//    verschwundenen Wand stand, wird zur Seite gesetzt; was nach der neuen
//    Nutzung nicht mehr passt, wird zum Entfernen VORGESCHLAGEN. Löschen ist eine
//    Nutzer-Handlung, kein Nebeneffekt einer anderen.
// 7. **Neu hingestellte Stücke sind Annahmen** (`quelle: 'gesetzt'`, W2/W3) — sie
//    stehen in keinem gemessenen Plan und werden gestrichelt gezeichnet. Ihre
//    Masse kommen aus der ÜBERGEBENEN Vorlagen-Tabelle, nicht aus Zahlen in
//    dieser Datei: die eine Wahrheit über Möbelmasse steht in
//    `AUSSTATTUNG_VORLAGEN` (`src/model/floorplan.ts`), und zwei Listen liefen
//    auseinander, sobald jemand nur eine anfasst.

/* ============================================================ Geometrie-Grundlagen */

/** Ganze Zentimeter. Projekt-DNA Punkt 3 — keine erfundene Nachkommastelle. */
const rzCm = (n) => Math.round(n)

/** Ein Kanten-Schlüssel, richtungsunabhängig: „A→B" und „B→A" sind dieselbe Kante. */
function rzKantenSchluessel(a, b) {
  const p = `${rzCm(a.x)},${rzCm(a.y)}`
  const q = `${rzCm(b.x)},${rzCm(b.y)}`
  return p < q ? `${p}|${q}` : `${q}|${p}`
}

/** Die Kanten eines Rings als Schlüssel-Menge. Der Ring ist geschlossen gedacht. */
function rzRingKanten(ring) {
  const menge = new Map()
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    menge.set(rzKantenSchluessel(a, b), { a, b })
  }
  return menge
}

/**
 * Liegt der Punkt im Ring? Strahlverfahren (ray casting).
 *
 * Punkte auf dem Rand gelten als DRIN — sonst fiele ein Möbel, dessen Ecke genau
 * auf der Wandachse sitzt, aus dem Raum heraus, in dem es unbestreitbar steht.
 */
function rzPunktInRing(p, ring) {
  let drin = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (rzAbstandPunktStrecke(p, a, b) < 0.5) return true
    const schneidet = a.y > p.y !== b.y > p.y
    if (schneidet && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      drin = !drin
    }
  }
  return drin
}

function rzAbstandPunktStrecke(p, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const laenge2 = dx * dx + dy * dy
  if (laenge2 === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / laenge2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Die vier Ecken eines Möbels — nach seiner Drehung. */
function rzMoebelEcken(m) {
  const w = (m.breite ?? 0) / 2
  const t = (m.tiefe ?? 0) / 2
  const d = m.drehung ?? 0
  const cos = Math.cos(d)
  const sin = Math.sin(d)
  return [
    [-w, -t],
    [w, -t],
    [w, t],
    [-w, t]
  ].map(([ex, ey]) => ({
    x: m.x + ex * cos - ey * sin,
    y: m.y + ex * sin + ey * cos
  }))
}

/**
 * Überlappen sich zwei konvexe Vielecke? Trennachsen-Verfahren (SAT).
 *
 * Gebraucht für „steht dieses Möbel in der Wand, die gleich verschwindet?" —
 * beide Formen sind Rechtecke, aber gedreht. Ein Vergleich der achsenparallelen
 * Umrandungen (bounding boxes) wäre einfacher und falsch: ein um 45 Grad
 * gedrehter Tisch hat eine Umrandung, die weit über ihn hinausragt, und Möbel
 * rasten in diesem Planer auf Wandwinkel ein (W2 Punkt 4) — schiefe Wände
 * erzeugen also schiefe Möbel, nicht als Ausnahme, sondern als Regel.
 */
function rzVieleckeUeberlappen(p, q) {
  for (const form of [p, q]) {
    for (let i = 0; i < form.length; i++) {
      const a = form[i]
      const b = form[(i + 1) % form.length]
      const achse = { x: -(b.y - a.y), y: b.x - a.x }
      const laenge = Math.hypot(achse.x, achse.y)
      if (laenge === 0) continue
      achse.x /= laenge
      achse.y /= laenge
      const spanne = (f) => {
        let min = Infinity
        let max = -Infinity
        for (const punkt of f) {
          const wert = punkt.x * achse.x + punkt.y * achse.y
          min = Math.min(min, wert)
          max = Math.max(max, wert)
        }
        return { min, max }
      }
      const sp = spanne(p)
      const sq = spanne(q)
      if (sp.max < sq.min - 0.001 || sq.max < sp.min - 0.001) return false
    }
  }
  return true
}

/** Das Band, das eine Wand im Grundriss belegt: Achse plus halbe Dicke. */
function rzWandBand(a, b, dicke) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const laenge = Math.hypot(dx, dy)
  if (laenge === 0) return null
  const nx = (-dy / laenge) * (dicke / 2)
  const ny = (dx / laenge) * (dicke / 2)
  return [
    { x: a.x + nx, y: a.y + ny },
    { x: b.x + nx, y: b.y + ny },
    { x: b.x - nx, y: b.y - ny },
    { x: a.x - nx, y: a.y - ny }
  ]
}

/** Fläche eines Rings in cm² (Gauss). Vorzeichenfrei. */
function rzRingFlaeche(ring) {
  let summe = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    summe += a.x * b.y - b.x * a.y
  }
  return Math.abs(summe) / 2
}

/** Schwerpunkt eines Rings — für die Zuordnung von Namen und für Beschriftungen. */
function rzRingSchwerpunkt(ring) {
  let x = 0
  let y = 0
  let a2 = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const kreuz = a.x * b.y - b.x * a.y
    a2 += kreuz
    x += (a.x + b.x) * kreuz
    y += (a.y + b.y) * kreuz
  }
  if (a2 === 0) {
    // Entartet (alle Punkte auf einer Linie): das Mittel der Punkte ist die
    // ehrlichste Antwort, die es hier gibt.
    return {
      x: rzCm(ring.reduce((s, p) => s + p.x, 0) / ring.length),
      y: rzCm(ring.reduce((s, p) => s + p.y, 0) / ring.length)
    }
  }
  return { x: rzCm(x / (3 * a2)), y: rzCm(y / (3 * a2)) }
}

/* ================================================== A) Nachbarschaft + Trennwände */

/**
 * Welche Wände stehen ZWISCHEN diesen beiden Räumen?
 *
 * Eine Wand zählt, wenn ihre Achse auf einer Kante beider Ringe liegt. Der
 * Vergleich läuft über die Kanten-Schlüssel und nicht über Wand-Kennungen: eine
 * Wand kann geteilt worden sein (W4: eine Öffnung teilt die Wand), und dann
 * tragen die Stücke neue Kennungen — die einzige dauerhafte Identität einer Wand
 * in dieser Pipeline ist ihre Geometrie (docs, W4 Punkt 3).
 *
 * @param {{x:number,y:number}[]} ringA
 * @param {{x:number,y:number}[]} ringB
 * @param {{id:string,a:{x:number,y:number},b:{x:number,y:number},quelle?:string,dicke?:number}[]} waende
 */
export function trennwaendeFinden(ringA, ringB, waende) {
  const kantenA = rzRingKanten(ringA)
  const kantenB = rzRingKanten(ringB)
  const gemeinsam = new Set()
  for (const schluessel of kantenA.keys()) {
    if (kantenB.has(schluessel)) gemeinsam.add(schluessel)
  }
  return waende.filter((w) => gemeinsam.has(rzKantenSchluessel(w.a, w.b)))
}

/**
 * Lassen sich diese beiden Räume zusammenlegen — und wenn nicht, warum?
 *
 * Der Grund kommt in Alltagssprache zurück und nicht als Fehlernummer: er landet
 * unverändert vor dem Nutzer. „Diese beiden Räume berühren sich nicht" ist eine
 * Auskunft; „ERR_NO_SHARED_EDGE" ist eine Zumutung.
 */
export function pruefeZusammenlegen(raumA, raumB, waende) {
  if (!raumA || !raumB) {
    return { moeglich: false, grund: 'Es sind noch nicht zwei Räume gewählt.', trennwaende: [] }
  }
  if (raumA.key && raumA.key === raumB.key) {
    return { moeglich: false, grund: 'Das ist zweimal derselbe Raum.', trennwaende: [] }
  }
  const trennwaende = trennwaendeFinden(raumA.ring, raumB.ring, waende)
  if (trennwaende.length === 0) {
    // Bevor „keine Nachbarn" behauptet wird: liegen die Ringe VIELLEICHT
    // aneinander, nur ohne gemeinsame Ecken? Das darf im Planer nicht vorkommen
    // — beide Ringe werden aus DEMSELBEN Wandgraphen abgeleitet
    // (`Floorplan.findRooms`), eine Ringkante IST also eine Wand. Kommt es doch
    // vor, ist es ein Datenfehler, und dann ist „die berühren sich nicht" eine
    // IRREFÜHRENDE Auskunft: der Nutzer sieht zwei Räume Wand an Wand und
    // bekommt gesagt, sie seien keine Nachbarn. Lieber der wahre Grund.
    if (rzRingeBeruehrenSich(raumA.ring, raumB.ring)) {
      return {
        moeglich: false,
        grund:
          'Diese beiden Räume liegen aneinander, teilen aber keine gemeinsame Wandkante — ' +
          'in den Daten stimmt etwas nicht (eine Wand müsste an der Stelle geteilt sein, ' +
          'an der der Nachbarraum anschliesst). Zusammenlegen wäre hier ein Ratespiel.',
        trennwaende: []
      }
    }
    return {
      moeglich: false,
      grund:
        'Diese beiden Räume haben keine gemeinsame Wand — zusammenlegen lassen sich nur ' +
        'Nachbarn. Liegt ein dritter Raum dazwischen, geht es in zwei Schritten.',
      trennwaende: []
    }
  }
  return { moeglich: true, grund: null, trennwaende }
}

/**
 * Berühren sich zwei Ringe, ohne eine Kante zu teilen?
 *
 * Gemessen wird über die Kanten: liegt ein nennenswerter Teil einer Kante von A
 * auf einer Kante von B (gleiche Richtung, Abstand fast null, Überdeckung
 * länger als eine Türbreite), dann liegen die Räume aneinander — die Kanten sind
 * nur unterschiedlich geteilt.
 */
function rzRingeBeruehrenSich(ringA, ringB) {
  const kanten = (ring) => {
    const liste = []
    for (let i = 0; i < ring.length; i++) {
      liste.push({ a: ring[i], b: ring[(i + 1) % ring.length] })
    }
    return liste
  }
  for (const ka of kanten(ringA)) {
    for (const kb of kanten(ringB)) {
      // Beide Endpunkte der einen Kante fast auf der Achse der anderen?
      const d1 = rzAbstandPunktStrecke(ka.a, kb.a, kb.b)
      const d2 = rzAbstandPunktStrecke(ka.b, kb.a, kb.b)
      const e1 = rzAbstandPunktStrecke(kb.a, ka.a, ka.b)
      const e2 = rzAbstandPunktStrecke(kb.b, ka.a, ka.b)
      const aufB = d1 < 1 && d2 < 1
      const aufA = e1 < 1 && e2 < 1
      if (!aufA && !aufB) continue
      // Wie lang ist die Überdeckung? Zwei Kanten, die sich nur in einem Punkt
      // treffen (Ecke an Ecke), sind keine Berührung im gesuchten Sinn.
      const laengeA = Math.hypot(ka.b.x - ka.a.x, ka.b.y - ka.a.y)
      const laengeB = Math.hypot(kb.b.x - kb.a.x, kb.b.y - kb.a.y)
      if (Math.min(laengeA, laengeB) > 90) return true
    }
  }
  return false
}

/**
 * Der Ring des neuen Raums: beide Ringe ohne ihre gemeinsamen Kanten.
 *
 * Verkettet wird über die Endpunkte. Bleibt am Ende eine Kante übrig, die nicht
 * anschliesst, ist die Voraussetzung verletzt (die Räume teilen mehr als eine
 * zusammenhängende Grenze — etwa ein Innenhof) und die Funktion gibt `null`
 * zurück, statt einen falschen Ring zu behaupten.
 */
export function ringeVereinigen(ringA, ringB) {
  const kantenA = rzRingKanten(ringA)
  const kantenB = rzRingKanten(ringB)
  const offen = []
  for (const [schluessel, kante] of kantenA) {
    if (!kantenB.has(schluessel)) offen.push(kante)
  }
  for (const [schluessel, kante] of kantenB) {
    if (!kantenA.has(schluessel)) offen.push(kante)
  }
  if (offen.length < 3) return null

  const punktSchluessel = (p) => `${rzCm(p.x)},${rzCm(p.y)}`
  const nachbarn = new Map()
  for (const kante of offen) {
    for (const [von, nach] of [
      [kante.a, kante.b],
      [kante.b, kante.a]
    ]) {
      const s = punktSchluessel(von)
      if (!nachbarn.has(s)) nachbarn.set(s, [])
      nachbarn.get(s).push(nach)
    }
  }
  // Jeder Punkt eines einfachen Rings hat genau zwei Nachbarn. Trifft das nicht
  // zu, ist der Rand verzweigt — dann gibt es keinen eindeutigen Ring, und einen
  // zu wählen hiesse zu raten.
  for (const liste of nachbarn.values()) {
    if (liste.length !== 2) return null
  }

  const start = offen[0].a
  const ring = [start]
  let vorher = punktSchluessel(start)
  let jetzt = nachbarn.get(vorher)[0]
  let schutz = offen.length + 2
  while (punktSchluessel(jetzt) !== punktSchluessel(start) && schutz-- > 0) {
    ring.push(jetzt)
    const kandidaten = nachbarn.get(punktSchluessel(jetzt))
    if (!kandidaten) return null
    const weiter = kandidaten.find((p) => punktSchluessel(p) !== vorher)
    if (!weiter) return null
    vorher = punktSchluessel(jetzt)
    jetzt = weiter
  }
  if (schutz <= 0) return null
  // Alle offenen Kanten müssen im Ring aufgegangen sein — sonst liegt eine
  // zweite, getrennte Schleife vor (Innenhof) und dieser Ring wäre nur ein Teil.
  if (ring.length !== offen.length) return null
  return ring
}

/* ============================================================= B) Möbel im Weg */

/**
 * Welche Möbel stehen in den Wänden, die verschwinden?
 *
 * WARUM ÜBERHAUPT: ein Schrank steht bündig an der Trennwand, ein Waschbecken
 * hängt darin. Fällt die Wand, steht das Stück frei im Raum oder ragt in den
 * Nachbarraum — im Blatt sieht das aus wie ein Möbel mitten im Weg, und niemand
 * weiss mehr, warum es dort steht.
 *
 * `dickeStandard` ist eine ÜBERGEBENE Grösse, keine hier gesetzte: die Wanddicke
 * gehört ins Wandmodell, nicht in diese Rechnung.
 */
export function moebelInWaenden(moebel, trennwaende, dickeStandard = 10) {
  const baender = trennwaende
    .map((w) => rzWandBand(w.a, w.b, w.dicke ?? dickeStandard))
    .filter(Boolean)
  return moebel.filter((m) => {
    const ecken = rzMoebelEcken(m)
    return baender.some((band) => rzVieleckeUeberlappen(ecken, band))
  })
}

/**
 * Ein Stück aus dem Wandband heraus schieben — auf die Seite, auf der mehr davon
 * liegt, und nur so weit wie nötig.
 *
 * Nicht in die Raummitte, nicht an eine feste Stelle: die kleinste Bewegung, die
 * den Grund beseitigt, ist die, bei der der Nutzer sein Möbel wiedererkennt.
 */
export function ausWandSchieben(m, wand, dicke, ring) {
  const dx = wand.b.x - wand.a.x
  const dy = wand.b.y - wand.a.y
  const laenge = Math.hypot(dx, dy)
  if (laenge === 0) return { ...m }
  const nx = -dy / laenge
  const ny = dx / laenge
  const mitte = { x: (wand.a.x + wand.b.x) / 2, y: (wand.a.y + wand.b.y) / 2 }
  const seite = (m.x - mitte.x) * nx + (m.y - mitte.y) * ny
  const richtung = seite >= 0 ? 1 : -1

  // Wie weit reicht das Möbel quer zur Wand? Das ist die Hälfte seiner
  // Ausdehnung IN Richtung der Normalen — bei gedrehten Stücken nicht die halbe
  // Tiefe, sondern die Projektion beider Halbachsen.
  const w = (m.breite ?? 0) / 2
  const t = (m.tiefe ?? 0) / 2
  const d = m.drehung ?? 0
  const reichweite =
    Math.abs(w * Math.cos(d) * nx + w * Math.sin(d) * ny) +
    Math.abs(-t * Math.sin(d) * nx + t * Math.cos(d) * ny)

  const soll = dicke / 2 + reichweite + 1
  const weg = soll - Math.abs(seite)
  if (weg <= 0) return { ...m }
  const neu = {
    ...m,
    x: rzCm(m.x + nx * richtung * weg),
    y: rzCm(m.y + ny * richtung * weg),
    quelle: 'gesetzt'
  }
  // Landet es dabei aussserhalb des neuen Raums, ist die andere Seite besser —
  // ein Stück in die Wand zu schieben, um es aus einer Wand zu holen, wäre keine
  // Verbesserung.
  if (ring && !rzPunktInRing({ x: neu.x, y: neu.y }, ring)) {
    const andere = {
      ...m,
      x: rzCm(m.x - nx * richtung * (soll + Math.abs(seite))),
      y: rzCm(m.y - ny * richtung * (soll + Math.abs(seite))),
      quelle: 'gesetzt'
    }
    if (rzPunktInRing({ x: andere.x, y: andere.y }, ring)) return andere
  }
  return neu
}

/* ====================================================== C) Auslegen nach Nutzung */

/**
 * Die Nutzungsarten, die dieser Raum annehmen kann.
 *
 * Die Abstände sind GESETZTE ANNAHMEN und als solche gekennzeichnet — für
 * Bewegungsflächen in Kursräumen gibt es keine Norm, die dieser Plan hergibt.
 * Sie sind aber nicht beliebig gewählt:
 *
 * - `yoga`: 60 cm seitlich zwischen den Matten. Eine ausgestreckte Armspanne
 *   reicht weiter, aber im Kurs liegt man in Reihen und nicht in Kreisen; 60 cm
 *   ist der Abstand, bei dem sich zwei Nachbarn beim Ausbreiten der Arme nicht
 *   berühren. 80 cm Gang zwischen den Reihen, damit man an seinen Platz kommt,
 *   ohne über fremde Matten zu steigen.
 * - `kurs`: Stuhlreihen mit 90 cm Reihenabstand (Sitzfläche plus Beinraum plus
 *   Durchgang) und 20 cm seitlich.
 * - `training`: Geräte brauchen Bedien- und Auslaufraum; 100 cm ringsum ist die
 *   verbreitete Empfehlung der Hersteller für freies Üben.
 *
 * Wer andere Zahlen für richtig hält, ändert sie HIER — dann ändern sich alle
 * Auslegungen mit, und keine zweite Liste läuft davon.
 */
export const NUTZUNGEN = {
  yoga: { typ: 'matte', abstandQuer: 60, abstandLaengs: 80, name: 'Yoga' },
  kurs: { typ: 'stuhl', abstandQuer: 20, abstandLaengs: 90, name: 'Kursraum' },
  training: { typ: 'geraet', abstandQuer: 100, abstandLaengs: 100, name: 'Training' },
  leer: { typ: null, abstandQuer: 0, abstandLaengs: 0, name: 'frei' }
}

/**
 * Der Winkel der längsten Kante — daran richtet sich das Raster aus.
 *
 * NORMALISIERT auf [0, π): die Richtung einer Wand ist eine ACHSE, keine
 * Richtung — „von links nach rechts" und „von rechts nach links" sind dieselbe
 * Wand. Ohne diese Normalisierung entscheidet die Umlaufrichtung des Rings über
 * das Ergebnis, und bei mehreren gleich langen Wänden (ein Rechteck hat zwei)
 * über die letzte Stelle einer Fliesskommazahl: gemessen kippte derselbe Raum
 * zwischen `winkel` und `winkel + π`. Für das Bild ist das gleichgültig, für die
 * Wiederholbarkeit nicht — zwei Läufe müssen dieselbe Auslegung ergeben, sonst
 * ist keine Prüfung darauf zu bauen.
 */
function rzHauptWinkel(ring) {
  let beste = { laenge: -1, winkel: 0 }
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const laenge = Math.hypot(b.x - a.x, b.y - a.y)
    // Strikt grösser, plus eine Toleranz von einem Zehntel Millimeter: bei zwei
    // gleich langen Kanten gewinnt die ERSTE, und zwar auch dann, wenn die
    // zweite rechnerisch um 1e-13 länger herauskommt.
    if (laenge > beste.laenge + 0.01) {
      let winkel = Math.atan2(b.y - a.y, b.x - a.x)
      while (winkel < 0) winkel += Math.PI
      while (winkel >= Math.PI) winkel -= Math.PI
      beste = { laenge, winkel }
    }
  }
  return beste.winkel
}

/** Liegt das Rechteck VOLLSTÄNDIG im Ring? */
function rzRechteckImRing(ecken, ring) {
  for (const p of ecken) {
    if (!rzPunktInRing(p, ring)) return false
  }
  // Vier Ecken drin genügt bei konkaven Räumen NICHT: ein L-förmiger Raum kann
  // ein Rechteck über seine Innenecke spannen, dessen vier Ecken alle im Raum
  // liegen. Deshalb zusätzlich: keine Ringkante darf das Rechteck kreuzen.
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    if (rzVieleckeUeberlappen(ecken, rzWandBand(a, b, 0.2) || [])) return false
  }
  return true
}

/**
 * Den Raum mit einer Nutzung auslegen.
 *
 * Das Raster wird an der LÄNGSTEN Wand ausgerichtet, nicht an den Achsen der
 * Zeichnung: ein schief liegender Raum bekäme sonst Matten, die quer zu seinen
 * Wänden liegen, und in einer Halle mit 78 m Länge ist keine Wand zufällig
 * achsenparallel. Gerechnet wird im gedrehten Bezugssystem, ausgegeben wird in
 * Weltkoordinaten.
 *
 * @param ring       Der Ring des Raums (nach dem Zusammenlegen)
 * @param nutzung    Schlüssel aus NUTZUNGEN
 * @param vorlagen   `AUSSTATTUNG_VORLAGEN` — die EINE Wahrheit über Möbelmasse
 * @param opts.rand  Abstand zur Wand in cm (Standard 40: man will nicht mit dem
 *                   Kopf an der Wand liegen, und eine Fussleiste kostet auch Platz)
 * @param opts.hoechstens  Deckel für die Zahl der Stücke (Standard 200 — bei
 *                   einer 400-m²-Halle sonst schnell vierstellig)
 * @param opts.id    Kennungs-Erzeuger; MUSS übergeben werden, damit die Kennungen
 *                   aus derselben Quelle kommen wie alle anderen im Planer
 */
export function legeAus(ring, nutzung, vorlagen, opts = {}) {
  const regel = NUTZUNGEN[nutzung]
  if (!regel || !regel.typ) return []
  if (!Array.isArray(ring) || ring.length < 3) {
    // Klartext statt „Cannot read properties of null": ein fehlender Ring
    // bedeutet, dass die Vereinigung vorher schon gescheitert ist. Wer hier
    // ankommt, hat deren Rückgabe nicht geprüft.
    throw new Error(
      'legeAus braucht einen Ring mit mindestens drei Punkten. ' +
        'Kam er aus ringeVereinigen und ist null, teilen die Räume mehr als eine Grenze — ' +
        'dann gibt es keinen Raum zum Auslegen.'
    )
  }
  const vorlage = (vorlagen || []).find((v) => v.typ === regel.typ)
  if (!vorlage) {
    throw new Error(
      `Für "${regel.typ}" gibt es keine Vorlage. Die Masse müssen aus ` +
        `AUSSTATTUNG_VORLAGEN kommen — abgeschriebene Zahlen laufen auseinander.`
    )
  }
  const rand = opts.rand ?? 40
  const hoechstens = opts.hoechstens ?? 200
  const kennung = opts.id ?? ((i) => `ausgelegt-${i}`)

  const winkel = rzHauptWinkel(ring)
  const cos = Math.cos(-winkel)
  const sin = Math.sin(-winkel)
  const hin = (p) => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos })
  const zurueck = (p) => ({
    x: p.x * Math.cos(winkel) - p.y * Math.sin(winkel),
    y: p.x * Math.sin(winkel) + p.y * Math.cos(winkel)
  })

  const gedreht = ring.map(hin)
  const minX = Math.min(...gedreht.map((p) => p.x)) + rand
  const maxX = Math.max(...gedreht.map((p) => p.x)) - rand
  const minY = Math.min(...gedreht.map((p) => p.y)) + rand
  const maxY = Math.max(...gedreht.map((p) => p.y)) - rand

  const b = vorlage.breite
  const t = vorlage.tiefe
  const schrittX = b + regel.abstandQuer
  const schrittY = t + regel.abstandLaengs

  const stuecke = []
  let i = 0
  for (let y = minY + t / 2; y <= maxY - t / 2 + 0.5 && stuecke.length < hoechstens; y += schrittY) {
    for (let x = minX + b / 2; x <= maxX - b / 2 + 0.5 && stuecke.length < hoechstens; x += schrittX) {
      const mitteWelt = zurueck({ x, y })
      const kandidat = {
        id: kennung(i++),
        typ: regel.typ,
        quelle: 'gesetzt',
        x: rzCm(mitteWelt.x),
        y: rzCm(mitteWelt.y),
        breite: b,
        tiefe: t,
        drehung: winkel
      }
      if (rzRechteckImRing(rzMoebelEcken(kandidat), ring)) stuecke.push(kandidat)
    }
  }
  return stuecke
}

/* ================================================================ D) Der Vorschlag */

/**
 * Was würde passieren, wenn man diese beiden Räume zusammenlegt?
 *
 * Verändert NICHTS. Der zurückgegebene Vorschlag ist die einzige Wahrheit für
 * Vorschau, Rückfrage und Ausführung.
 *
 * @param raumA/raumB  {key, ring, name?}
 * @param daten        {waende, moebel, oeffnungen, vorlagen, wandDicke}
 * @param wahl         {nutzung, name, id}
 */
export function zusammenlegenPlanen(raumA, raumB, daten, wahl = {}) {
  const pruefung = pruefeZusammenlegen(raumA, raumB, daten.waende || [])
  if (!pruefung.moeglich) return { moeglich: false, grund: pruefung.grund }

  const trennwaende = pruefung.trennwaende
  const ring = ringeVereinigen(raumA.ring, raumB.ring)
  if (!ring) {
    return {
      moeglich: false,
      grund:
        'Diese beiden Räume teilen mehr als eine durchgehende Grenze — daraus ' +
        'ergibt sich kein einzelner Raum. Das kann diese Rechnung nicht auflösen.'
    }
  }

  const wandIds = new Set(trennwaende.map((w) => w.id))
  const gemessenFallen = trennwaende.filter((w) => (w.quelle ?? 'gemessen') === 'gemessen')

  // Öffnungen in einer verschwindenden Wand verschwinden mit ihr. Das ist keine
  // Panne, sondern die Sache selbst: eine Tür zwischen zwei Räumen, die einer
  // geworden sind, hat kein Gegenüber mehr. Gezählt wird es trotzdem — der
  // Nutzer soll es VORHER lesen, nicht hinterher suchen.
  const oeffnungenWeg = (daten.oeffnungen || []).filter((o) => wandIds.has(o.wandId))

  const dicke = daten.wandDicke ?? 10
  const imWeg = moebelInWaenden(daten.moebel || [], trennwaende, dicke)
  const verschoben = imWeg.map((m) => {
    const naechste =
      trennwaende
        .map((w) => ({ w, d: rzAbstandPunktStrecke({ x: m.x, y: m.y }, w.a, w.b) }))
        .sort((p, q) => p.d - q.d)[0]?.w ?? trennwaende[0]
    return { vorher: m, nachher: ausWandSchieben(m, naechste, naechste.dicke ?? dicke, ring) }
  })

  const nutzung = wahl.nutzung ?? 'leer'
  const neue =
    nutzung === 'leer'
      ? []
      : legeAus(ring, nutzung, daten.vorlagen || [], { id: wahl.id })

  // Was nach der neuen Nutzung nicht mehr passt, wird VORGESCHLAGEN und nicht
  // gelöscht (Festlegung 6). Vorgeschlagen wird nur, was mit einem neuen Stück
  // kollidiert — ein Schrank an der Aussenwand steht keinem Yoga-Kurs im Weg.
  const zumEntfernen =
    neue.length === 0
      ? []
      : (daten.moebel || [])
          .map((m) => verschoben.find((v) => v.vorher.id === m.id)?.nachher ?? m)
          .filter((m) => {
            if (!rzPunktInRing({ x: m.x, y: m.y }, ring)) return false
            const ecken = rzMoebelEcken(m)
            return neue.some((n) => rzVieleckeUeberlappen(ecken, rzMoebelEcken(n)))
          })

  const flaeche = rzRingFlaeche(ring)

  return {
    moeglich: true,
    ring,
    schwerpunkt: rzRingSchwerpunkt(ring),
    flaecheM2: Math.round(flaeche / 100 / 100 * 10) / 10,
    waendeEntfernen: trennwaende.map((w) => w.id),
    gemessenEntfernt: gemessenFallen.length,
    statikHinweis: rzStatikHinweis(gemessenFallen, daten),
    oeffnungenEntfallen: oeffnungenWeg.map((o) => ({ id: o.id, typ: o.typ, breite: o.breite })),
    moebelVerschieben: verschoben.filter(
      (v) => v.nachher.x !== v.vorher.x || v.nachher.y !== v.vorher.y
    ),
    moebelNeu: neue,
    moebelZumEntfernenVorgeschlagen: zumEntfernen.map((m) => m.id),
    name: wahl.name || rzVorschlagName(raumA, raumB, nutzung),
    nutzung
  }
}

/**
 * Der Name des neuen Raums.
 *
 * Die Raum-Kennung ist der Hash seiner Ecken (`Room.getUuid`) — der neue Raum hat
 * also zwangsläufig eine andere, und Name wie Bodentextur der alten reissen ab.
 * Das ist nicht zu vermeiden, wohl aber zu bemerken: gibt der Nutzer keinen
 * Namen, wird einer VORGESCHLAGEN, damit der Raum nicht namenlos im Blatt steht.
 */
function rzVorschlagName(raumA, raumB, nutzung) {
  const regel = NUTZUNGEN[nutzung]
  if (regel && nutzung !== 'leer') return regel.name
  const namen = [raumA.name, raumB.name].filter((n) => n && n.trim() !== '')
  if (namen.length === 2) return `${namen[0]} + ${namen[1]}`
  if (namen.length === 1) return namen[0]
  return ''
}

/**
 * Merkmale einer tragenden Wand — als FRAGE, nicht als Urteil.
 *
 * Es gibt kein Feld „tragend" in diesem Datenmodell, und aus einem Grundriss ist
 * die Statik nicht ableitbar (Projekt-DNA Punkt 4: was die PDF nicht hergibt,
 * wird nicht geraten). Eine erfundene Prüfung wäre hier besonders schädlich: sie
 * sähe belegt aus und der Nutzer plant einen Umbau danach.
 *
 * Was diese Rechnung sagen KANN, sind Auffälligkeiten: eine Wand, die deutlich
 * dicker ist als der Durchschnitt, oder die an beiden Enden an die Aussenkontur
 * anschliesst, ist ein Kandidat — mehr nicht.
 */
function rzStatikHinweis(gemesseneWaende, daten) {
  if (gemesseneWaende.length === 0) return null
  const alle = daten.waende || []
  const dicken = alle.map((w) => w.dicke ?? daten.wandDicke ?? 10)
  const mittel = dicken.reduce((s, d) => s + d, 0) / Math.max(1, dicken.length)
  const auffaellig = gemesseneWaende.filter((w) => (w.dicke ?? mittel) > mittel * 1.4)
  const teile = []
  if (auffaellig.length > 0) {
    teile.push(
      `${auffaellig.length} der Wände ist deutlich dicker als die übrigen ` +
        `(über ${Math.round(mittel * 1.4)} cm)`
    )
  }
  return {
    frage:
      `Hier ${gemesseneWaende.length === 1 ? 'wird eine gemessene Wand' : `werden ${gemesseneWaende.length} gemessene Wände`} ` +
      `entfernt — das ist ein Umbau, keine Planänderung. ` +
      (teile.length ? teile.join('; ') + '. ' : '') +
      `Ob die Wand tragend ist, kann dieser Plan nicht sagen: ` +
      `die Zeichnung enthält keine Statik. Vor dem Umbau muss das ein Fachmann prüfen.`,
    auffaelligeWaende: auffaellig.map((w) => w.id)
  }
}

export const _pruefzugang = {
  // Kurze Schluessel nach aussen, eindeutige Namen nach innen: die Funktionen
  // tragen ein `rz`-Vorsatz, weil diese Datei mit den Axonometrie-Modulen in EIN
  // gemeinsames Namensfeld gebuendelt wird (`buendleKern`) — `kantenSchluessel`
  // gab es dort schon, und der Kollisions-Pruefer hat es zu Recht abgelehnt.
  kantenSchluessel: rzKantenSchluessel,
  punktInRing: rzPunktInRing,
  abstandPunktStrecke: rzAbstandPunktStrecke,
  moebelEcken: rzMoebelEcken,
  vieleckeUeberlappen: rzVieleckeUeberlappen,
  wandBand: rzWandBand,
  ringFlaeche: rzRingFlaeche,
  ringSchwerpunkt: rzRingSchwerpunkt,
  rechteckImRing: rzRechteckImRing,
  hauptWinkel: rzHauptWinkel,
  vorschlagName: rzVorschlagName
}
