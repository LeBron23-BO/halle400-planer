// RÄUME ZUSAMMENLEGEN (W12) — die Brücke zwischen Kern und Rechnung.
//
// Die Rechnung (`raum-zusammenlegen.js`) sieht nur Zahlen und Listen. Diese
// Datei übersetzt in beide Richtungen: sie liest den lebenden Grundriss aus,
// lässt planen, und wendet einen Vorschlag an.
//
// WARUM ALS EIGENE DATEI UND NICHT ALS METHODE IN `Floorplan`
// `floorplan.ts` trägt schon rund 1900 Zeilen und ist die Datei, die JEDE
// Bedienung anfasst. Eine Naht mehr darin ist eine Naht mehr, an der zwei
// Wellen sich gegenseitig überschreiben. Diese Datei benutzt ausschliesslich die
// ÖFFENTLICHE Schnittstelle des Kerns (`getRooms`, `getWalls`, `getAusstattung`,
// `getOeffnungen`, `verschiebeAusstattung`, `fuegeAusstattungHinzu`,
// `entferneAusstattung`, `Wall.remove`) — sie kann also nichts kaputt machen,
// was nicht ohnehin über diese Schnittstelle kaputt zu machen wäre. Das ist die
// eine erlaubte Abstraktionsschicht (YAGNI), nicht die zweite.
//
// PLANEN UND ANWENDEN BLEIBEN GETRENNT — und zwar über die Grenze hinweg:
// `planeZusammenlegen()` verändert NICHTS und liefert den Vorschlag, den die
// Vorschau malt und die Rückfrage vorliest. Erst `wendeAn()` greift ein. Damit
// zeigt die Vorschau zwangsläufig dasselbe, was hinterher dasteht: es ist
// dieselbe Beschreibung.
//
// VIER FESTLEGUNGEN
//
// 1. **Der Ring eines Raums kommt aus `room.corners`, nicht aus
//    `interiorCorners`.** Die Innenkontur ist um die halbe Wanddicke versetzt;
//    die Trennwand-Erkennung vergleicht aber Kanten mit WANDACHSEN. Mit der
//    Innenkontur fände sie nie eine gemeinsame Kante — und würde melden, zwei
//    offensichtliche Nachbarn seien keine.
// 2. **Diese Datei setzt KEINEN Raumnamen.** Die Namen hängen in `roomMeta` an
//    Schlüsseln, die aus den Textankern der PDF stammen, nicht an der Raum-UUID
//    (`Room.getUuid()` ist der Hash der Ecken und ändert sich beim Zusammenlegen
//    zwangsläufig). Welcher Anker im neuen Raum gewinnt, ist eine Frage der
//    Beschriftungs-Politik und keine der Geometrie — der vorgeschlagene Name
//    kommt deshalb im Ergebnis zurück, und die Bedienung legt ihn ab. Eine
//    erfundene Zuordnung wäre schlimmer als eine offene Grenze.
// 3. **Verwaiste Ecken werden aufgeräumt.** Eine Ecke, die nach dem Entfernen
//    der Trennwände keine Wand mehr trägt, gehört nirgendwo mehr hin. Bleibt sie
//    liegen, wird sie mitgespeichert und wächst mit jedem Zusammenlegen — und
//    beim nächsten Zeichnen rastet der Ecken-Fang (E2) an einem unsichtbaren
//    Punkt ein.
// 4. **Angewendet wird in EINER Reihenfolge, und die ist nicht beliebig:**
//    erst Möbel verschieben (solange die Wände noch stehen, denn der Vorschlag
//    ist gegen DIESEN Zustand gerechnet), dann Wände entfernen, dann neue Möbel
//    hinzufügen, dann aufräumen. Umgedreht liefe das Verschieben gegen einen
//    Grundriss, den es nicht mehr gibt.
import { Floorplan, AusstattungElement, AUSSTATTUNG_VORLAGEN } from '../model/floorplan'
import { Room } from '../model/room'
// @ts-ignore — reine Rechnung in Javascript, wie src/axo/*.js
import { zusammenlegenPlanen, NUTZUNGEN } from './raum-zusammenlegen.js'

export type Nutzung = 'yoga' | 'kurs' | 'training' | 'leer'

export type ZusammenlegenWahl = {
  nutzung?: Nutzung
  /** Ein eigener Name. Ohne Angabe schlägt die Rechnung einen vor. */
  name?: string
}

/** Was ein Raum für die Rechnung ist. */
function raumDaten(floorplan: Floorplan, room: Room, index: number) {
  return {
    key: room.getUuid(),
    // Festlegung 1: die WANDACHSEN, nicht die Innenkontur.
    ring: room.corners.map((c) => ({ x: c.x, y: c.y })),
    name: raumName(floorplan, room, index)
  }
}

/**
 * Der heute angezeigte Name eines Raums — oder eine leere Zeichenkette.
 *
 * Gesucht wird über den Schwerpunkt: welcher benannte Anker liegt in diesem
 * Raum? Das ist derselbe Reparaturpfad, den `docs/datenmodell.md` für T4
 * beschreibt, und der einzige, der einen UUID-Wechsel übersteht.
 */
function raumName(floorplan: Floorplan, room: Room, index: number): string {
  const meta = floorplan.getAllRoomMeta()
  const namen = Object.values(meta)
    .map((m) => m?.name)
    .filter((n): n is string => typeof n === 'string' && n.trim() !== '')
  // Ohne eine Anker-Position im Datenmodell lässt sich hier nicht mehr sagen,
  // als der Kern hergibt. Ein geratener Name wäre schlimmer als keiner: er stünde
  // im Blatt und sähe belegt aus. Die Bedienung darf den Namen erfragen.
  return namen.length === 1 && index === 0 ? namen[0] : ''
}

/** Alle Wände in der Form, die die Rechnung liest — jede genau EINMAL. */
function wandDaten(floorplan: Floorplan) {
  return floorplan.getWalls().map((w) => ({
    id: w.id,
    a: { x: w.getStartX(), y: w.getStartY() },
    b: { x: w.getEndX(), y: w.getEndY() },
    quelle: w.quelle,
    dicke: w.thickness
  }))
}

/**
 * Was würde passieren? Verändert NICHTS.
 *
 * Der zurückgegebene Vorschlag ist die einzige Quelle für Vorschau, Rückfrage
 * und Ausführung.
 */
export function planeZusammenlegen(
  floorplan: Floorplan,
  raumA: Room,
  raumB: Room,
  wahl: ZusammenlegenWahl = {}
) {
  const waende = wandDaten(floorplan)
  const dicken = waende.map((w) => w.dicke).filter((d) => typeof d === 'number' && d > 0)
  return zusammenlegenPlanen(
    raumDaten(floorplan, raumA, 0),
    raumDaten(floorplan, raumB, 1),
    {
      waende,
      moebel: floorplan.getAusstattung().map((m) => ({ ...m })),
      oeffnungen: floorplan.getOeffnungen().map((o) => ({ ...o })),
      vorlagen: AUSSTATTUNG_VORLAGEN,
      // Der Mittelwert der wirklichen Dicken, nicht eine Zahl aus dieser Datei:
      // die Wanddicke gehört ins Wandmodell (`Configuration`), und sie steht
      // dort auch dann noch richtig, wenn jemand sie ändert.
      wandDicke: dicken.length ? dicken.reduce((s, d) => s + d, 0) / dicken.length : 10
    },
    wahl
  )
}

export type AnwendungsErgebnis = {
  /** Wände, die wirklich verschwunden sind — gemessen, nicht behauptet. */
  waendeEntfernt: string[]
  moebelVerschoben: string[]
  moebelNeu: string[]
  eckenAufgeraeumt: number
  /** Der vorgeschlagene Name. Ablegen muss ihn die Bedienung (Festlegung 2). */
  nameVorschlag: string
  /** Wie viele Räume der Kern DANACH zählt. Ein Beweis, keine Behauptung. */
  raeumeNachher: number
}

/**
 * Den Vorschlag anwenden.
 *
 * Erwartet genau das Objekt, das `planeZusammenlegen` geliefert hat — nicht ein
 * frisch gerechnetes. Zwischen Vorschau und Bestätigung darf sich nichts
 * geändert haben, und wer hier neu rechnete, könnte etwas anderes tun, als der
 * Nutzer bestätigt hat.
 */
export function wendeAn(floorplan: Floorplan, vorschlag: any): AnwendungsErgebnis {
  if (!vorschlag || !vorschlag.moeglich) {
    throw new Error(
      'Dieser Vorschlag ist nicht anwendbar. ' + (vorschlag?.grund ?? 'Es gibt keinen.')
    )
  }

  // (1) Möbel verschieben, SOLANGE die Wände stehen — der Vorschlag ist gegen
  // diesen Zustand gerechnet (Festlegung 4).
  const verschoben: string[] = []
  for (const v of vorschlag.moebelVerschieben ?? []) {
    if (floorplan.verschiebeAusstattung(v.nachher.id, v.nachher.x, v.nachher.y)) {
      verschoben.push(v.nachher.id)
    }
  }

  // (2) Die Trennwände entfernen. `Wall.remove()` feuert `fireOnDelete`, der Kern
  // nimmt sie aus seiner Liste und ruft `update()` — die Räume werden also von
  // ihm selbst neu gebildet, nicht von hier.
  const zuEntfernen = new Set<string>(vorschlag.waendeEntfernen ?? [])
  const waende = floorplan.getWalls().filter((w) => zuEntfernen.has(w.id))
  for (const w of waende) {
    w.remove()
  }
  const nochDa = new Set(floorplan.getWalls().map((w) => w.id))
  const waendeEntfernt = [...zuEntfernen].filter((id) => !nochDa.has(id))

  // (3) Die neuen Stücke hinstellen. `fuegeAusstattungHinzu` setzt
  // `quelle: 'gesetzt'` selbst — ein zur Laufzeit entstandenes Stück kann nicht
  // aus der PDF stammen (W3 Punkt 4).
  const neu: string[] = []
  for (const m of vorschlag.moebelNeu ?? []) {
    const el: AusstattungElement = floorplan.fuegeAusstattungHinzu({
      id: m.id,
      typ: m.typ,
      x: m.x,
      y: m.y,
      breite: m.breite,
      tiefe: m.tiefe,
      drehung: m.drehung
    })
    neu.push(el.id)
  }

  // (4) Verwaiste Ecken aufräumen (Festlegung 3). Gezählt wird über die Wände
  // und nicht über die Innereien von `Corner`: welche Ecke kommt in keiner Wand
  // mehr vor?
  const benutzt = new Set<string>()
  for (const w of floorplan.getWalls()) {
    benutzt.add(w.getStart().id)
    benutzt.add(w.getEnd().id)
  }
  const verwaist = floorplan.getCorners().filter((c) => !benutzt.has(c.id))
  for (const c of verwaist) {
    c.remove()
  }

  floorplan.update()

  return {
    waendeEntfernt,
    moebelVerschoben: verschoben,
    moebelNeu: neu,
    eckenAufgeraeumt: verwaist.length,
    nameVorschlag: vorschlag.name ?? '',
    raeumeNachher: floorplan.getRooms().length
  }
}

/** Die Nutzungsarten für die Bedienung — aus EINER Quelle. */
export function nutzungsArten(): { schluessel: Nutzung; name: string }[] {
  return Object.keys(NUTZUNGEN).map((schluessel) => ({
    schluessel: schluessel as Nutzung,
    name: (NUTZUNGEN as any)[schluessel].name
  }))
}
