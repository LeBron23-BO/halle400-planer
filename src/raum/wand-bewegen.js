// WÄNDE BEWEGEN (W12b) — die reine Rechnung.
//
// Nutzerwunsch, wörtlich: *„ich kann die wände immer noch nicht bewegen, was die
// hauptsache meines anliegens war. dies muss genau so entfernt und bewegt werden
// können wie man es mit den möbeln machen kann."*
//
// WARUM ES DAS BIS HIERHER NICHT GAB — und warum der Grund nicht mehr trägt
// W7 Punkt 7 hat das Wand-Ziehen im Blatt ausdrücklich abgelehnt: *„eine
// verschobene gemessene Ecke bricht den Rückweg (W5) hart ab — eine Bedienung,
// die in einen abgelehnten Zustand führt, ist keine."* Das Argument war richtig,
// solange es nur ZWEI Kategorien gab: Aufmass (heilig) und Setzung (erlaubt).
// Eine verschobene Wand passte in keine und wurde deshalb verboten.
//
// Es gibt jetzt eine dritte: **UMBAU**. Die PDF bleibt die Grundwahrheit über
// das, was GEMESSEN ist; ein Umbau ist eine Aussage über das, was WERDEN soll.
// Beides muss getrennt geführt werden — und dann darf beides existieren. Der
// Grundriss verliert dadurch nichts: der gemessene Zustand jeder bewegten Wand
// wird mitgeschrieben (`vorher`), damit er jederzeit zurückgeholt werden kann.
//
// EINE WAND IST NICHT EIN MÖBEL — und der Unterschied ist keine Förmlichkeit
// Ein Möbel steht IM Raum, eine Wand IST der Raum. Verschiebt man ein Möbel um
// 40 cm, bleibt alles andere, wie es war. Verschiebt man eine Wand naiv um 40 cm,
// reisst der Grundriss auf: ihre Endecken hängen an den Nachbarwänden, und die
// bleiben stehen. Es entstehen zwei Lücken, aus denen der Kern keine Räume mehr
// bilden kann (`findRooms` sucht geschlossene Ringe) — die Raumnamen fallen weg,
// die Flächen im Businessplan werden zu null, und all das ohne Fehlermeldung.
//
// Die richtige Operation ist deshalb **parallel verschieben mit GLEITENDEN
// Endpunkten**: die Wandachse wandert, ihre Endecken rutschen dabei auf den
// Achsen der Nachbarwände entlang. Der Grundriss bleibt geschlossen, ein Raum
// wird grösser, der andere kleiner — genau das, was „Raum vergrössern" bedeutet.
// Gerechnet wird der Schnittpunkt zweier Geraden, nicht geraten.
//
// FÜNF FESTLEGUNGEN
//
// 1. **Verschoben wird nur QUER zur Wand.** Der Anteil der Bewegung entlang der
//    eigenen Achse wird verworfen: eine Wand, die man in ihrer Längsrichtung
//    schiebt, sieht danach genau gleich aus, aber alle Öffnungen darin sind
//    verrutscht (`lage` ist ein absolutes Mass von der Start-Ecke, W4 Punkt 2).
//    Eine Bedienung, die unsichtbar etwas anderes tut als sie zeigt, ist eine
//    Falle.
// 2. **Eine Endecke ohne Nachbarwand wird einfach mitgenommen.** Ein freies
//    Wandende gleitet auf nichts; dort ist die Parallelverschiebung die ganze
//    Wahrheit.
// 3. **Bei mehreren Nachbarwänden gewinnt die, die am wenigsten parallel liegt.**
//    An einem Kreuzungspunkt gibt es mehrere Kandidaten. Die fast parallele
//    ergäbe einen Schnittpunkt weit draussen (ein winziger Winkel wirkt wie ein
//    Hebel) — die möglichst senkrechte ist die stabile Wahl.
// 4. **Es gibt eine Untergrenze.** Läuft eine Endecke über den Anfang der
//    Nachbarwand hinaus, schrumpfte ein Raum auf null oder klappte um. Dann wird
//    die Bewegung BEGRENZT und das GESAGT — nicht stumm verweigert und nicht
//    stumm ausgeführt.
// 5. **Diese Datei verändert nichts.** Sie liefert die neuen Eckpunkte; setzen
//    tut sie die Brücke, und der Kern bildet daraus seine Räume neu. Dieselbe
//    Trennung wie beim Zusammenlegen: erst rechnen, dann zeigen, dann anwenden.

/** Ganze Zentimeter — Projekt-DNA Punkt 3. */
const wbCm = (n) => Math.round(n)

const wbLaenge = (a, b) => Math.hypot(b.x - a.x, b.y - a.y)

/** Die Einheits-Normale einer Wand (quer zu ihr). */
function wbNormale(wand) {
  const dx = wand.b.x - wand.a.x
  const dy = wand.b.y - wand.a.y
  const l = Math.hypot(dx, dy)
  if (l === 0) return null
  return { x: -dy / l, y: dx / l }
}

/**
 * Schnittpunkt zweier Geraden, jede durch Punkt + Richtung.
 *
 * Gibt `null` bei (fast) parallelen Geraden zurück. Die Schwelle ist bewusst
 * grob: bei einem Winkel unter etwa einem Grad liegt der Schnittpunkt so weit
 * draussen, dass er keine brauchbare Ecke mehr ist — ein rechnerisch gültiges
 * Ergebnis kann trotzdem unbrauchbar sein.
 */
function wbSchnitt(p1, r1, p2, r2) {
  const kreuz = r1.x * r2.y - r1.y * r2.x
  if (Math.abs(kreuz) < 0.017) return null
  const t = ((p2.x - p1.x) * r2.y - (p2.y - p1.y) * r2.x) / kreuz
  return { x: p1.x + r1.x * t, y: p1.y + r1.y * t }
}

/** Welche anderen Wände hängen an dieser Ecke? */
function wbNachbarn(eckeId, wandId, waende) {
  return waende.filter(
    (w) => w.id !== wandId && (w.aId === eckeId || w.bId === eckeId)
  )
}

/**
 * Die Nachbarwand, auf der die Ecke gleiten soll.
 *
 * Festlegung 3: möglichst senkrecht zur bewegten Wand. Gemessen über den
 * Betrag des Kreuzprodukts der Richtungen — der ist bei 90 Grad maximal.
 */
function wbGleitWand(nachbarn, richtung) {
  let beste = null
  for (const w of nachbarn) {
    const l = wbLaenge(w.a, w.b)
    if (l === 0) continue
    const r = { x: (w.b.x - w.a.x) / l, y: (w.b.y - w.a.y) / l }
    const senkrecht = Math.abs(richtung.x * r.y - richtung.y * r.x)
    if (!beste || senkrecht > beste.senkrecht) beste = { wand: w, r, senkrecht }
  }
  // Fast parallel: kein brauchbarer Schnittpunkt (Festlegung 3, Begründung dort).
  if (beste && beste.senkrecht < 0.017) return null
  return beste
}

/**
 * Eine Wand parallel verschieben — mit gleitenden Endpunkten.
 *
 * @param wand    {id, aId, bId, a:{x,y}, b:{x,y}, quelle?}
 * @param waende  alle Wände, jede EINMAL, mit aId/bId
 * @param dx, dy  gewünschte Verschiebung in cm (der Längsanteil wird verworfen)
 * @param opts.mindestAbstand  wie nah eine Endecke dem Ende ihrer Gleitwand
 *                             kommen darf (Standard 30 cm — schmaler als eine
 *                             Türöffnung ist kein Raum mehr)
 * @returns {ecken, quer, begrenzt, grund}
 */
export function verschiebeWandParallel(wand, waende, dx, dy, opts = {}) {
  const mindest = opts.mindestAbstand ?? 30
  const n = wbNormale(wand)
  if (!n) {
    return { ecken: [], quer: 0, begrenzt: false, grund: 'Diese Wand hat keine Länge.' }
  }
  const laenge = wbLaenge(wand.a, wand.b)
  const richtung = { x: (wand.b.x - wand.a.x) / laenge, y: (wand.b.y - wand.a.y) / laenge }

  // Festlegung 1: nur der Anteil QUER zur Wand.
  let quer = dx * n.x + dy * n.y

  // Die Gleitwände beider Enden bestimmen, BEVOR gerechnet wird — nur so lässt
  // sich die Bewegung vorher begrenzen (Festlegung 4).
  const enden = [
    { eckeId: wand.aId, punkt: wand.a, anderer: wand.b },
    { eckeId: wand.bId, punkt: wand.b, anderer: wand.a }
  ].map((ende) => ({
    ...ende,
    gleit: wbGleitWand(wbNachbarn(ende.eckeId, wand.id, waende), richtung)
  }))

  let begrenzt = false
  let grund = null

  // Wie weit DARF es? Für jedes Ende mit Gleitwand: die Ecke muss auf der
  // Gleitwand bleiben und mindestens `mindest` von deren fernem Ende weg.
  for (const ende of enden) {
    if (!ende.gleit) continue
    const g = ende.gleit.wand
    // Das feste Ende der Gleitwand ist das, das NICHT unsere Ecke ist.
    const fest = g.aId === ende.eckeId ? g.b : g.a
    // Wie weit reicht die Gleitwand quer zu unserer Wand, von unserer Ecke aus?
    const spielraum = (fest.x - ende.punkt.x) * n.x + (fest.y - ende.punkt.y) * n.y
    if (Math.abs(spielraum) < 0.5) continue
    const grenze = spielraum > 0 ? spielraum - mindest : spielraum + mindest
    if (spielraum > 0 && quer > grenze) {
      quer = Math.max(0, grenze)
      begrenzt = true
    } else if (spielraum < 0 && quer < grenze) {
      quer = Math.min(0, grenze)
      begrenzt = true
    }
  }
  if (begrenzt) {
    grund =
      `Weiter geht es nicht: dahinter bliebe weniger als ${mindest} cm ` +
      `bis zur nächsten Wand — das wäre kein Raum mehr, sondern ein Spalt.`
  }

  const versatz = { x: n.x * quer, y: n.y * quer }
  const neueAchse = {
    p: { x: wand.a.x + versatz.x, y: wand.a.y + versatz.y },
    r: richtung
  }

  const ecken = []
  for (const ende of enden) {
    if (!ende.gleit) {
      // Festlegung 2: freies Ende wird mitgenommen.
      ecken.push({
        id: ende.eckeId,
        x: wbCm(ende.punkt.x + versatz.x),
        y: wbCm(ende.punkt.y + versatz.y),
        gleitet: false
      })
      continue
    }
    const g = ende.gleit
    const schnitt = wbSchnitt(neueAchse.p, neueAchse.r, g.wand.a, g.r)
    if (!schnitt) {
      ecken.push({
        id: ende.eckeId,
        x: wbCm(ende.punkt.x + versatz.x),
        y: wbCm(ende.punkt.y + versatz.y),
        gleitet: false
      })
      continue
    }
    ecken.push({
      id: ende.eckeId,
      x: wbCm(schnitt.x),
      y: wbCm(schnitt.y),
      gleitet: true,
      aufWand: g.wand.id
    })
  }

  return {
    ecken,
    // `quer` ist der Wert ENTLANG DER NORMALEN und trägt deshalb ein Vorzeichen,
    // das von der Umlaufrichtung der Wand abhängt (eine Wand von oben nach unten
    // hat die Gegen-Normale einer von unten nach oben). Für die Rechnung ist das
    // richtig, für eine Anzeige unbrauchbar: „um −100 cm verschoben" ist keine
    // Auskunft, sondern ein Rätsel über die Reihenfolge der Ecken.
    quer: wbCm(quer),
    /** Was der Mensch liest: wie weit sich die Wand bewegt hat, in cm. */
    strecke: Math.abs(wbCm(quer)),
    begrenzt,
    grund
  }
}

/**
 * Der Vorschlag zum Verschieben — mit allem, was der Nutzer vorher wissen muss.
 *
 * Wie beim Zusammenlegen: PLANEN und ANWENDEN sind getrennt, und dieselbe
 * Beschreibung speist Vorschau, Rückfrage und Ausführung.
 */
export function wandVerschiebenPlanen(wand, waende, dx, dy, opts = {}) {
  const bewegung = verschiebeWandParallel(wand, waende, dx, dy, opts)
  if (bewegung.ecken.length === 0) {
    return { moeglich: false, grund: bewegung.grund }
  }
  const istUmbau = (wand.quelle ?? 'gemessen') === 'gemessen'
  return {
    moeglich: true,
    wandId: wand.id,
    ecken: bewegung.ecken,
    quer: bewegung.quer,
    begrenzt: bewegung.begrenzt,
    hinweis: bewegung.grund,
    istUmbau,
    // Der gemessene Zustand wird MITGESCHRIEBEN. Ohne ihn wäre der Umbau eine
    // Einbahnstrasse: die Ecken-Kennung ist der Hash ihrer Koordinate
    // (`export_blueprint.ecken_id`), nach dem Verschieben ist die alte Lage aus
    // den Daten allein nicht mehr zu rekonstruieren.
    vorher: istUmbau
      ? { a: { ...wand.a }, b: { ...wand.b }, aId: wand.aId, bId: wand.bId }
      : null,
    umbauSatz: istUmbau
      ? 'Das ist ein UMBAU: diese Wand ist im Aufmass gemessen. Der Plan sagt es ' +
        'im Blattkopf und auf dem Ausdruck, und der gemessene Stand bleibt ' +
        'hinterlegt — zurückholen geht jederzeit.'
      : null
  }
}

export const _wbPruefzugang = {
  wbNormale,
  wbSchnitt,
  wbNachbarn,
  wbGleitWand,
  wbLaenge
}
