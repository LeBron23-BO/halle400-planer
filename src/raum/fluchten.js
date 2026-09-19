// FLUCHTEN (W15) — die reine Rechnung hinter „smart zeichnen" und „Fluchten aufräumen".
//
// Nutzerwunsch, wörtlich: *„es soll noch einfacher und smarter gearbeitet werden
// können, damit zum beispiel die wände nicht unterschiedlich lang sind, obwohl
// sie nebeneinander liegen und es nicht der fall sein darf."*
//
// WAS DIESER FEHLER IST — und warum man ihn beim Zeichnen nicht sieht
// Der Plan ist orthogonal: jede Wand liegt auf einer Achse, und mehrere Wände
// teilen sich dieselbe. Zeichnet man freihändig, trifft man diese Achse auf den
// Zentimeter nie. Zwei Zimmertrennwände nebeneinander sitzen dann auf x = 1234
// und x = 1237 — im Bild bei 1:290 sind das 0,01 Bildpunkte, also NICHTS. Im
// Plan sind es zwei verschiedene Fluchten, und die daran hängenden Wände sind
// unterschiedlich lang. Der Fehler entsteht unsichtbar und fällt erst auf, wenn
// jemand Maße abliest.
//
// DIE VIER FESTLEGUNGEN
//
// 1. **Gerechnet wird über EINE Achsen-Liste, nicht über Wandpaare.** Eine
//    Flucht ist keine Beziehung zwischen zwei Wänden, sondern ein WERT, auf dem
//    mehrere sitzen. Paarweise Vergleiche (589 Wände → 173 000 Paare) wären
//    teurer und liefen beim Aufräumen in Widersprüche: A rastet auf B, B auf C,
//    und am Ende steht A woanders als gedacht. Ein Wert je Gruppe kann das
//    nicht.
//
// 2. **Das Gewicht einer Flucht ist WANDLÄNGE, nicht Wandzahl.** Eine 30 m
//    lange Aussenwand ist eine stärkere Aussage über „hier ist die Achse" als
//    drei kurze Stummel daneben. Nach Zahl gewichtet zöge der Stummel-Haufen
//    die Aussenwand zu sich — das Aufräumen machte den Plan schlechter.
//
// 3. **„Nebeneinander" ist eine Bedingung, keine Zierde.** Zwei Achsen 20 cm
//    auseinander an entgegengesetzten Enden eines 78-m-Gebäudes sind zwei
//    verschiedene Achsen, nicht ein Fehler. Zusammengelegt werden nur Werte,
//    deren Wände sich in der ANDEREN Richtung auch wirklich nahe kommen
//    (`NACHBARSCHAFT_CM`).
//
// 4. **Diese Datei verändert nichts.** Sie liefert Vorschläge — Fangpunkte,
//    Fundstellen, neue Eckpunkte. Setzen tut der Kern, und nur auf Bestätigung.
//    Dieselbe Trennung wie `wand-bewegen.js` und `raum-zusammenlegen.js`: erst
//    rechnen, dann zeigen, dann anwenden. Ein Werkzeug, das ungefragt 30 Wände
//    verschiebt, zerstört mehr, als es heilt.

/** Ganze Zentimeter — Projekt-DNA Punkt 3. */
const flCm = (n) => Math.round(n)

/**
 * Wie weit zwei Achsen höchstens auseinanderliegen dürfen, um noch als EINE
 * gemeinte Flucht zu gelten — in cm.
 *
 * 25 cm ist derselbe Wert wie `snapTolerance` im Kern und kein Zufall: er ist
 * die halbe Wanddicke plus Zeichen-Ungenauigkeit. Grösser gewählt frässe das
 * Aufräumen echte Versätze (ein 30-cm-Vorsprung ist Architektur, kein Fehler);
 * kleiner gewählt bliebe genau der Fall liegen, den der Nutzer meldet.
 */
export const FLUCHT_TOLERANZ_CM = 25

/**
 * Wie nah sich zwei Wände in ihrer LÄNGSRICHTUNG kommen müssen, damit sie als
 * „nebeneinander" gelten — in cm.
 *
 * 800 cm ist die Grössenordnung eines Hotelzimmers samt Flur. Wände, die weiter
 * auseinanderliegen, haben miteinander nichts zu tun; sie auf einen Wert zu
 * ziehen wäre eine Behauptung über einen Zusammenhang, den niemand geprüft hat.
 */
export const NACHBARSCHAFT_CM = 800

/**
 * Die Toleranz der AUFRÄUM-HILFE — bewusst kleiner als die des Fangs (10 statt
 * 25 cm).
 *
 * Ein Fang ist ein ANGEBOT im Augenblick des Zeichnens: er ist sichtbar, und
 * wer ihn nicht will, zieht weiter. Das Aufräumen ist ein EINGRIFF in fertige
 * Geometrie, oft an vielen Stellen zugleich. Beide mit demselben Wert zu
 * fahren wäre bequem und falsch: 25 cm sind weniger als eine Wanddicke, aber
 * mehr als jede Zeichen-Ungenauigkeit — ein 25-cm-Versatz kann ein gewollter
 * Vorsprung sein. 10 cm kann er nicht. Gemessen im Hotelplan: bei 25 cm
 * fänden sich Gruppen, die echte Nischen einebnen; bei 10 cm bleibt genau der
 * Zittert-beim-Zeichnen-Fehler übrig.
 */
export const AUFRAEUM_TOLERANZ_CM = 10

/**
 * Ab welcher Schrägheit eine Wand NICHT mehr achsparallel gemeint ist.
 *
 * Eine Wand mit 3 cm Versatz auf 120 cm Länge ist eine zittrige Waagerechte;
 * eine mit 120 cm auf 120 cm ist eine gewollte Diagonale. Die Grenze ist
 * dieselbe Toleranz — mehr Versatz als die Fangweite heisst: so war es gemeint.
 */
const SCHRAEG_GRENZE_CM = FLUCHT_TOLERANZ_CM

/** Wandlänge. */
const flLaenge = (w) => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y)

/**
 * Die Achse, die eine Wand VERLANGT — oder `null` für eine echte Diagonale.
 *
 * @returns {{achse:'x'|'y', wert:number, von:number, bis:number, laenge:number}|null}
 *          `achse` ist die Koordinate, die entlang der Wand KONSTANT sein muss;
 *          `von`/`bis` ist ihre Ausdehnung in der anderen Richtung.
 */
export function achseVon(w) {
  const dx = Math.abs(w.b.x - w.a.x)
  const dy = Math.abs(w.b.y - w.a.y)
  const laenge = Math.hypot(dx, dy)
  if (laenge === 0) return null
  if (dy <= dx) {
    // waagerecht: y ist konstant
    if (dy > SCHRAEG_GRENZE_CM) return null
    return {
      achse: 'y',
      wert: (w.a.y + w.b.y) / 2,
      von: Math.min(w.a.x, w.b.x),
      bis: Math.max(w.a.x, w.b.x),
      laenge
    }
  }
  if (dx > SCHRAEG_GRENZE_CM) return null
  return {
    achse: 'x',
    wert: (w.a.x + w.b.x) / 2,
    von: Math.min(w.a.y, w.b.y),
    bis: Math.max(w.a.y, w.b.y),
    laenge
  }
}

/**
 * Alle Fang-Kandidaten eines Plans, nach Achse getrennt.
 *
 * ZWEI ARTEN, und sie sind nicht dasselbe:
 *   `flucht` — die Achse einer bestehenden Wand. Darauf einzurasten heisst:
 *              „meine Wand liegt in derselben Linie wie jene."
 *   `ende`   — die Koordinate eines Eckpunkts. Darauf einzurasten heisst:
 *              „meine Wand hört da auf, wo jene aufhört" — und GENAU das macht
 *              zwei nebeneinanderliegende Wände gleich lang.
 *
 * Beide in EINER Liste je Achse, weil der Fang sie nicht unterscheiden muss:
 * er sucht den nächsten Wert. Die Art wird nur mitgeführt, damit die Hilfslinie
 * das Richtige sagen kann.
 *
 * @param {Array} waende  {id, a:{x,y}, b:{x,y}}
 * @returns {{x:Array, y:Array}} je Achse: {wert, art, laenge, von, bis}
 */
export function sammleFangKandidaten(waende) {
  const x = new Map()
  const y = new Map()
  const legeAb = (karte, wert, art, laenge, von, bis) => {
    const schluessel = flCm(wert)
    const da = karte.get(schluessel)
    if (!da) {
      karte.set(schluessel, { wert: schluessel, art, laenge, von, bis })
      return
    }
    da.laenge += laenge
    // Eine Flucht schlägt ein Ende: liegt an derselben Koordinate sowohl eine
    // Wandachse als auch nur ein Eckpunkt, ist die Achse die stärkere Aussage.
    if (art === 'flucht') da.art = 'flucht'
    da.von = Math.min(da.von, von)
    da.bis = Math.max(da.bis, bis)
  }
  for (const w of waende) {
    const a = achseVon(w)
    if (a) {
      legeAb(a.achse === 'x' ? x : y, a.wert, 'flucht', a.laenge, a.von, a.bis)
    }
    // Die Enden IMMER, auch bei einer Diagonalen: ihre Eckpunkte sind trotzdem
    // Punkte, an die man anschliessen will.
    const l = flLaenge(w)
    for (const p of [w.a, w.b]) {
      legeAb(x, p.x, 'ende', l, p.y, p.y)
      legeAb(y, p.y, 'ende', l, p.x, p.x)
    }
  }
  const sortiert = (k) => [...k.values()].sort((p, q) => p.wert - q.wert)
  return { x: sortiert(x), y: sortiert(y) }
}

/**
 * Der nächste Kandidat zu `wert` innerhalb von `toleranz` — oder `null`.
 *
 * Bei gleichem Abstand gewinnt die GRÖSSERE Länge: zwischen einer Aussenwand
 * und einem Stummel ist die Aussenwand die gemeinte Achse (Festlegung 2).
 */
export function naechsterKandidat(liste, wert, toleranz, quer) {
  let bester = null
  for (const k of liste) {
    const d = Math.abs(k.wert - wert)
    if (d > toleranz) continue
    // „Nebeneinander" gilt auch beim Fangen: eine Achse am anderen Ende des
    // Gebäudes ist kein Angebot, sondern ein Sprung ins Nichts.
    if (quer !== undefined && k.von !== undefined) {
      const abstand = quer < k.von ? k.von - quer : quer > k.bis ? quer - k.bis : 0
      if (abstand > NACHBARSCHAFT_CM) continue
    }
    if (!bester || d < bester.d - 0.001 || (Math.abs(d - bester.d) <= 0.001 && k.laenge > bester.k.laenge)) {
      bester = { d, k }
    }
  }
  return bester ? bester.k : null
}

/**
 * Einen frei gesetzten Punkt auf die Fluchten des Plans ziehen.
 *
 * `freiX`/`freiY` sagen, welche Koordinate überhaupt bewegt werden DARF. Das
 * braucht der Zeichner: hat der Winkel-Fang die Strecke schon auf die
 * Waagerechte gelegt, würde ein Fang in y sie wieder schief machen — die
 * zweite Hilfe nähme der ersten ihr Ergebnis wieder weg.
 *
 * @returns {{x:number, y:number, fangX:object|null, fangY:object|null}}
 */
export function fangePunkt(kandidaten, x, y, toleranz, freiX = true, freiY = true) {
  const fangX = freiX ? naechsterKandidat(kandidaten.x, x, toleranz, y) : null
  const fangY = freiY ? naechsterKandidat(kandidaten.y, y, toleranz, x) : null
  return {
    x: fangX ? fangX.wert : x,
    y: fangY ? fangY.wert : y,
    fangX,
    fangY
  }
}

/**
 * Den QUERVERSATZ eines Wand-Zugs auf eine Nachbar-Flucht ziehen (Teil 1,
 * Ziehen).
 *
 * Beim Verschieben einer Wand ist nicht ihr Endpunkt die Grösse, die zählt,
 * sondern ihr Abstand von der eigenen Achse. Gefangen wird deshalb nicht ein
 * Punkt, sondern der VERSATZ: die Wand soll da zu liegen kommen, wo schon eine
 * parallele Wand liegt. Das ist die Bedienung, die der Nutzer „bündig" nennt.
 *
 * Nur PARALLELE Wände kommen in Frage — eine Flucht, die die eigene Wand
 * kreuzt, ist keine Lage, sondern ein Schnittpunkt.
 *
 * @param {object} wand     die bewegte Wand {a,b}
 * @param {Array}  waende   alle Wände
 * @param {number} versatz  gewünschter Querversatz in cm (längs ist schon weg)
 * @param {number} toleranz Fangweite in cm
 * @returns {{versatz:number, gefangen:boolean, achse:number|null}}
 */
export function fangeVersatz(wand, waende, versatz, toleranz) {
  const dx = wand.b.x - wand.a.x
  const dy = wand.b.y - wand.a.y
  const l = Math.hypot(dx, dy)
  if (l === 0) return { versatz, gefangen: false, achse: null }
  const nx = -dy / l
  const ny = dx / l
  const eigen = wand.a.x * nx + wand.a.y * ny
  const ziel = eigen + versatz
  let bester = null
  for (const w of waende) {
    if (w.id === wand.id) continue
    const wdx = w.b.x - w.a.x
    const wdy = w.b.y - w.a.y
    const wl = Math.hypot(wdx, wdy)
    if (wl === 0) continue
    // Parallel? Der Betrag des Kreuzprodukts der Einheitsrichtungen ist der
    // Sinus des Zwischenwinkels — unter 0,017 sind das keine 1 Grad.
    if (Math.abs((dx / l) * (wdy / wl) - (dy / l) * (wdx / wl)) > 0.017) continue
    // Die Lage der Nachbarwand auf DERSELBEN Normalen. Beide Endpunkte prüfen:
    // eine leicht schiefe Nachbarwand hat zwei verschiedene, und die nähere ist
    // die gemeinte.
    for (const p of [w.a, w.b]) {
      const lage = p.x * nx + p.y * ny
      const d = Math.abs(lage - ziel)
      if (d > toleranz) continue
      if (!bester || d < bester.d || (d === bester.d && wl > bester.l)) {
        bester = { d, l: wl, lage }
      }
    }
  }
  if (!bester) return { versatz, gefangen: false, achse: null }
  return { versatz: bester.lage - eigen, gefangen: true, achse: bester.lage }
}

/* ══ TEIL 3 · AUFRÄUM-HILFE ═══════════════════════════════════════════════
   Was schon schief IST, findet der Fang nicht mehr — er greift beim Zeichnen,
   und gezeichnet ist gezeichnet. Diese Hälfte sucht die Stellen im fertigen
   Plan, zeigt sie, und begradigt erst auf Bestätigung. */

/**
 * Alle Stellen, an denen Wände nebeneinanderliegen, ohne zu fluchten.
 *
 * DAS VERFAHREN, in vier Schritten:
 *
 * 1. Jede achsparallele Wand VERLANGT, dass ihre beiden Ecken denselben Wert
 *    auf ihrer Achse haben. Nur solche Ecken kommen überhaupt in Frage —
 *    ohne diese Einschränkung zöge das Verfahren beliebige Punkte zusammen,
 *    die zufällig nah beieinanderliegen.
 * 2. Nach dem Achswert sortieren und in Gruppen schneiden, die HÖCHSTENS
 *    `toleranz` breit sind.
 * 3. Jede Wertgruppe in Nachbarschafts-Gruppen zerlegen: Ecken, die in der
 *    ANDEREN Richtung mehr als `NACHBARSCHAFT_CM` auseinanderliegen, liegen
 *    nicht nebeneinander und haben miteinander nichts zu tun.
 * 4. Eine Gruppe mit mehr als einem Wert ist eine Fundstelle.
 *
 * WARUM DER SCHNITT IN SCHRITT 2 DER GANZE PUNKT IST — gemessen, nicht
 * vermutet: ohne ihn legt eine Verbandssuche (A liegt nah bei B, B nah bei C)
 * im Hotelplan 44 Ecken zu EINER Gruppe zusammen, die über 105 cm streut. Das
 * Begradigen zöge dann Wände um einen ganzen Meter — es hätte nichts mehr mit
 * „diese zwei fluchten nicht" zu tun und den Plan zerstört. Die Regel „eine
 * Gruppe ist nie breiter als die Toleranz" ist die Zusicherung, mit der man
 * das Werkzeug überhaupt anfassen kann: KEINE Ecke bewegt sich weiter als
 * `toleranz`.
 *
 * Der Preis ist ehrlich zu nennen: liegen drei Werte in gleichen Abständen
 * hintereinander (0 / 20 / 40 bei Toleranz 25), schneidet der Lauf zwischen 20
 * und 40. Das ist eine Entscheidung und keine Wahrheit — aber eine, die nie
 * mehr bewegt als angekündigt.
 *
 * @param {Array} waende {id, a:{x,y}, b:{x,y}, aId, bId}
 * @param {number} toleranz cm
 * @returns {Array} Fundstellen, nach Versatz absteigend
 */
export function findeFluchtFehler(waende, toleranz = AUFRAEUM_TOLERANZ_CM) {
  const stellen = []
  for (const achse of ['x', 'y']) {
    const ecken = new Map() // id -> {id, wert, quer, laenge}
    const merke = (id, p, laenge, quer) => {
      const da = ecken.get(id)
      if (da) {
        da.laenge += laenge
        return
      }
      ecken.set(id, { id, wert: achse === 'x' ? p.x : p.y, quer, laenge })
    }
    const fordernd = []
    for (const w of waende) {
      const a = achseVon(w)
      if (!a || a.achse !== achse) continue
      const l = a.laenge
      merke(w.aId, w.a, l, achse === 'x' ? w.a.y : w.a.x)
      merke(w.bId, w.b, l, achse === 'x' ? w.b.y : w.b.x)
      fordernd.push(w)
    }
    // Schritt 2: Wertgruppen mit hartem Breiten-Deckel.
    const liste = [...ecken.values()].sort((p, q) => p.wert - q.wert)
    const wertGruppen = []
    let lauf = []
    for (const e of liste) {
      if (lauf.length && e.wert - lauf[0].wert > toleranz) {
        wertGruppen.push(lauf)
        lauf = []
      }
      lauf.push(e)
    }
    if (lauf.length) wertGruppen.push(lauf)

    // Schritt 3: innerhalb einer Wertgruppe nach NACHBARSCHAFT trennen.
    // Einfache Kettenbildung über die Querlage: eine Reihe Zimmertrennwände
    // entlang eines Flurs ist EINE Flucht, auch wenn sie 40 m lang ist — aber
    // zwei Wände an entgegengesetzten Gebäudeenden sind es nicht.
    const gruppen = []
    for (const wg of wertGruppen) {
      const nachQuer = [...wg].sort((p, q) => p.quer - q.quer)
      let kette = []
      for (const e of nachQuer) {
        if (kette.length && e.quer - kette[kette.length - 1].quer > NACHBARSCHAFT_CM) {
          gruppen.push(kette)
          kette = []
        }
        kette.push(e)
      }
      if (kette.length) gruppen.push(kette)
    }

    // Schritt 4: auswerten.
    for (const gruppe of gruppen) {
      const wurzel = gruppe[0].id
      const werte = [...new Set(gruppe.map((e) => flCm(e.wert)))]
      if (werte.length < 2) continue
      const min = Math.min(...werte)
      const max = Math.max(...werte)
      // Gewicht je Wert = Wandlänge, die auf ihm sitzt (Festlegung 2).
      const gewicht = new Map()
      for (const e of gruppe) {
        const k = flCm(e.wert)
        gewicht.set(k, (gewicht.get(k) || 0) + e.laenge)
      }
      let ziel = null
      let bestesGewicht = -1
      for (const [k, g] of gewicht) {
        if (g > bestesGewicht || (g === bestesGewicht && ziel !== null && k < ziel)) {
          bestesGewicht = g
          ziel = k
        }
      }
      const betroffen = gruppe.filter((e) => flCm(e.wert) !== ziel)
      if (betroffen.length === 0) continue
      const ids = new Set(gruppe.map((e) => e.id))
      const waendeDrin = fordernd.filter((w) => ids.has(w.aId) || ids.has(w.bId))
      stellen.push({
        achse,
        wurzel,
        ziel,
        versatz: max - min,
        ecken: betroffen.map((e) => ({ id: e.id, von: flCm(e.wert), nach: ziel })),
        waende: waendeDrin.map((w) => w.id),
        // Wo im Plan das liegt — für die Anzeige. Die Mitte der Gruppe in der
        // Querrichtung, damit die Ansicht dorthin springen kann.
        quer: gruppe.reduce((s, e) => s + e.quer, 0) / gruppe.length
      })
    }
  }
  // Der grösste Versatz zuerst: wer die Liste durchgeht, soll mit dem
  // auffälligsten Fehler anfangen, nicht mit dem Millimeter.
  return stellen.sort((p, q) => q.versatz - p.versatz || q.ecken.length - p.ecken.length)
}

/**
 * Die neuen Eckpunkte einer Fundstelle — MEHR TUT DIESE DATEI NICHT.
 *
 * `x`/`y` kommen beide zurück, damit der Aufrufer `Corner.move(x, y)` rufen
 * kann, ohne selbst zu wissen, welche Achse gemeint war. Die andere Koordinate
 * bleibt, wie sie ist: eine Flucht ist eine Aussage über EINE Richtung.
 *
 * @param {object} stelle aus `findeFluchtFehler`
 * @param {Map|object} eckenLage  id -> {x,y} (der aktuelle Stand)
 * @returns {Array<{id:string, x:number, y:number}>}
 */
export function begradige(stelle, eckenLage) {
  const hole = (id) => (eckenLage instanceof Map ? eckenLage.get(id) : eckenLage[id])
  const neu = []
  for (const e of stelle.ecken) {
    const lage = hole(e.id)
    if (!lage) continue
    neu.push({
      id: e.id,
      x: stelle.achse === 'x' ? stelle.ziel : flCm(lage.x),
      y: stelle.achse === 'y' ? stelle.ziel : flCm(lage.y)
    })
  }
  return neu
}
