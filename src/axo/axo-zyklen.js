/**
 * RAUMFLAECHEN AUS WAENDEN ABLEITEN (X2)
 * ======================================
 *
 * Die Vorlage `app/public/uebersicht.html` hatte ihre 23 Raeume als Rechtecke
 * vorliegen (`ROOMS`, uebersicht.html:188). Der Planer hat sie nicht: er fuehrt
 * 76 Ecken und 100 Waende, die Flaechen dazwischen sind die kleinsten Zyklen im
 * Wandgraphen. Diese Datei leitet sie ab.
 *
 * WARUM NICHT `floorplan.getRooms()` DIREKT
 * Die Axonometrie hat ZWEI Auslieferungen: die dritte Ansicht im Planer (dort
 * gaebe es `getRooms()`) und die Bank-Datei `Halle400-Modell.html`, die von
 * `tools/baue-bank-ansicht.mjs` ohne Browser und ohne TypeScript gebaut wird
 * (dort gibt es sie nicht). Wuerde jede Seite ihre eigene Quelle benutzen,
 * koennten Planer und Bank verschiedene Raeume zeigen — und niemand merkte es.
 * Beide benutzen darum DIESE Ableitung, und `tools/pruefe-axonometrie.mjs`
 * misst sie gegen `floorplan.getRooms()` im echten Planer. Weicht sie ab, wird
 * das Gate rot; die Gleichheit ist damit bewiesen statt behauptet.
 *
 * Der Algorithmus ist der des Planers (`src/model/floorplan.ts:580`), auf
 * schlichte Punkte statt auf Corner-Objekte umgestellt.
 */

/** Winkel zwischen zwei Richtungen, auf 0..2pi gehoben. [utils.ts:100] */
function winkel2pi(x1, y1, x2, y2) {
  const punkt = x1 * x2 + y1 * y2
  const kreuz = x1 * y2 - y1 * x2
  const w = -Math.atan2(kreuz, punkt)
  return w < 0 ? w + 2 * Math.PI : w
}

/**
 * Laeuft ein Vieleck im Uhrzeigersinn?             [utils.ts:112]
 * Die Vorlage verschiebt die Punkte vorher ins Positive. Das ist wirkungslos
 * (die Summe ist bei geschlossenem Zug translationsinvariant: der zusaetzliche
 * Term ist 2b mal der Summe aller dx, und die ist null) — hier weggelassen,
 * das Ergebnis bleibt identisch.
 */
function imUhrzeigersinn(punkte) {
  let summe = 0
  for (let i = 0; i < punkte.length; i++) {
    const a = punkte[i]
    const b = punkte[i === punkte.length - 1 ? 0 : i + 1]
    summe += (b.x - a.x) * (b.y + a.y)
  }
  return summe >= 0
}

/** Flaeche eines Vielecks (gleiche Einheit wie die Punkte, quadriert). */
export function flaecheVon(punkte) {
  let a = 0
  for (let i = 0; i < punkte.length; i++) {
    const p = punkte[i]
    const q = punkte[(i + 1) % punkte.length]
    a += p.x * q.y - q.x * p.y
  }
  return Math.abs(a) / 2
}

/** Schwerpunkt eines Vielecks. */
export function mitteVon(punkte) {
  let x = 0
  let y = 0
  for (const p of punkte) {
    x += p.x
    y += p.y
  }
  return { x: x / punkte.length, y: y / punkte.length }
}

/** Liegt ein Punkt im Vieleck? (Strahlenverfahren) */
export function liegtIn(pt, punkte) {
  let drin = false
  for (let i = 0, j = punkte.length - 1; i < punkte.length; j = i++) {
    const a = punkte[i]
    const b = punkte[j]
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) {
      drin = !drin
    }
  }
  return drin
}

/**
 * Engster Zyklus, der von `erste` ueber `zweite` zurueckfuehrt.
 * Bei jeder Verzweigung wird die Kante mit dem kleinsten Innenwinkel zuerst
 * genommen — so entsteht die kleinstmoegliche Masche statt einer Runde um das
 * halbe Gebaeude.
 */
function engsterZyklus(erste, zweite, nachbarnVon) {
  const stapel = []
  let naechster = { ecke: zweite, bisher: [erste] }
  const gesehen = { [erste.id]: true }

  while (naechster) {
    const jetzt = naechster.ecke
    gesehen[jetzt.id] = true

    if (jetzt === erste && jetzt !== zweite) return naechster.bisher

    const anhaengen = []
    for (const nachbar of nachbarnVon(jetzt)) {
      const zurueck = nachbar.id in gesehen && !(nachbar === erste && jetzt !== zweite)
      if (!zurueck) anhaengen.push(nachbar)
    }

    const bisher = naechster.bisher.slice()
    bisher.push(jetzt)

    if (anhaengen.length > 1) {
      const vorher = naechster.bisher[naechster.bisher.length - 1]
      anhaengen.sort(
        (a, b) =>
          winkel2pi(vorher.x - jetzt.x, vorher.y - jetzt.y, b.x - jetzt.x, b.y - jetzt.y) -
          winkel2pi(vorher.x - jetzt.x, vorher.y - jetzt.y, a.x - jetzt.x, a.y - jetzt.y)
      )
    }
    for (const e of anhaengen) stapel.push({ ecke: e, bisher })

    naechster = stapel.pop()
  }
  return []
}

/**
 * Alle Raumflaechen eines Grundrisses.
 *
 * @param {Record<string,{x:number,y:number}>} corners Ecken nach Kennung, in cm
 * @param {{corner1:string,corner2:string}[]} walls Waende als Eckenpaare
 * @returns {{x:number,y:number,id:string}[][]} Vielecke gegen den Uhrzeigersinn
 */
export function leiteRaeumeAb(corners, walls) {
  const ecken = new Map()
  for (const id of Object.keys(corners)) {
    ecken.set(id, { id, x: corners[id].x, y: corners[id].y })
  }

  // Nachbarschaft in der Reihenfolge des Planers aufbauen: erst die Waende, die
  // an dieser Ecke BEGINNEN, dann die, die hier ENDEN (corner.ts:168). Die
  // Reihenfolge entscheidet bei gleichen Winkeln, welcher Zyklus zuerst
  // gefunden wird — sie muss darum uebereinstimmen.
  const beginnt = new Map()
  const endet = new Map()
  for (const w of walls) {
    if (!ecken.has(w.corner1) || !ecken.has(w.corner2)) continue
    if (!beginnt.has(w.corner1)) beginnt.set(w.corner1, [])
    if (!endet.has(w.corner2)) endet.set(w.corner2, [])
    beginnt.get(w.corner1).push(ecken.get(w.corner2))
    endet.get(w.corner2).push(ecken.get(w.corner1))
  }
  const nachbarnVon = (e) => [...(beginnt.get(e.id) || []), ...(endet.get(e.id) || [])]

  const maschen = []
  for (const ecke of ecken.values()) {
    for (const nachbar of nachbarnVon(ecke)) {
      maschen.push(engsterZyklus(ecke, nachbar, nachbarnVon))
    }
  }

  // Doppelte entfernen: ein Zyklus bleibt derselbe, wie weit man ihn auch
  // durchrotiert — darum jede Drehung gegen das Verzeichnis pruefen.
  const gesehen = new Set()
  const einmalig = []
  for (const masche of maschen) {
    if (!masche.length) continue
    let neu = true
    const schluessel = []
    for (let j = 0; j < masche.length; j++) {
      const gedreht = masche.slice(j).concat(masche.slice(0, j))
      const s = gedreht.map((c) => c.id).join('-')
      schluessel.push(s)
      if (gesehen.has(s)) neu = false
    }
    if (neu) {
      einmalig.push(masche)
      schluessel.forEach((s) => gesehen.add(s))
    }
  }

  // Im Uhrzeigersinn laufende Maschen sind die Aussenseite derselben Flaeche.
  return einmalig.filter((m) => !imUhrzeigersinn(m))
}
