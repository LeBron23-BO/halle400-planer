/**
 * SZENE AUS DEN ECHTEN PLANDATEN (X2)
 * ===================================
 *
 * Wandelt den gemessenen Grundriss in Koerper um, die `axo-zeichnen.js` malen
 * kann. Die Vorlage erzeugte ihre Moebel prozedural pro Raumtyp
 * (`furnish`, uebersicht.html:292) — hier wird stattdessen JEDES der 289
 * gemessenen Ausstattungs-Elemente einzeln gezeichnet. Das ist der ganze
 * Unterschied zwischen einem huebschen Schema und dem Grundriss dieser Halle.
 *
 * EIN EINZIGES PRIMITIV
 * Alles ist ein Prisma: ein Vieleck in der Grundflaeche, senkrecht ausgezogen
 * von `y0` bis `y1`. Ein Kasten ist der Sonderfall mit vier Ecken, ein runder
 * Tisch der mit zwoelf. Die Vorlage kannte nur Kaesten (uebersicht.html:230)
 * und konnte darum weder Raumflaechen mit sechs Ecken noch runde Moebel
 * zeigen; beides kommt in diesem Plan vor.
 *
 * KOORDINATEN
 * Der Planer misst in Zentimetern auf einer Draufsicht (x nach Osten, y nach
 * Sueden). Der Renderer rechnet in Metern mit y als HOEHE. Die Grundflaeche
 * heisst hier darum (x, z) — `z` ist das `y` des Planers.
 */

import { CM, DARSTELLUNGSHOEHE, DARSTELLUNG, bauformFuer, saeuleFuer } from './axo-kontrakt.js'
import { leiteRaeumeAb, flaecheVon, mitteVon, liegtIn } from './axo-zyklen.js'

/** @typedef {{x:number,z:number}} Punkt */
/** @typedef {{punkte:Punkt[], y0:number, y1:number, material:string, normale?:number[], istBoden?:boolean}} Koerper */

/** Rechteck um einen Mittelpunkt, gedreht. Masse in Metern. */
function rechteck(cx, cz, breite, tiefe, drehung) {
  const c = Math.cos(drehung || 0)
  const s = Math.sin(drehung || 0)
  const hb = breite / 2
  const ht = tiefe / 2
  return [
    [-hb, -ht],
    [hb, -ht],
    [hb, ht],
    [-hb, ht]
  ].map(([dx, dz]) => ({ x: cx + dx * c - dz * s, z: cz + dx * s + dz * c }))
}

/** Vieleck als Ersatz fuer einen Kreis/eine Ellipse. */
function rund(cx, cz, breite, tiefe, ecken = 12) {
  const p = []
  for (let i = 0; i < ecken; i++) {
    const a = (i / ecken) * Math.PI * 2
    p.push({ x: cx + (Math.cos(a) * breite) / 2, z: cz + (Math.sin(a) * tiefe) / 2 })
  }
  return p
}

/**
 * Eine Wand als liegendes Rechteck entlang ihrer Achse — in Stuecke von
 * hoechstens `DARSTELLUNG.kachel` zerlegt. Ohne diese Zerlegung bekaeme die
 * 78 m lange Nordwand EINEN Tiefenwert (den ihrer Mitte) und verdeckte alles,
 * was hinter diesem Punkt liegt (uebersicht.html:412).
 */
function wandStuecke(a, b, dicke, y1, material, normale) {
  const laenge = Math.hypot(b.x - a.x, b.z - a.z)
  if (laenge < 1e-6) return []
  const n = Math.max(1, Math.ceil(laenge / DARSTELLUNG.kachel))
  const ex = (b.x - a.x) / laenge
  const ez = (b.z - a.z) / laenge
  const px = (-ez * dicke) / 2
  const pz = (ex * dicke) / 2
  const stuecke = []
  for (let i = 0; i < n; i++) {
    const t0 = (laenge * i) / n
    const t1 = (laenge * (i + 1)) / n
    const p0 = { x: a.x + ex * t0, z: a.z + ez * t0 }
    const p1 = { x: a.x + ex * t1, z: a.z + ez * t1 }
    stuecke.push({
      punkte: [
        { x: p0.x + px, z: p0.z + pz },
        { x: p1.x + px, z: p1.z + pz },
        { x: p1.x - px, z: p1.z - pz },
        { x: p0.x - px, z: p0.z - pz }
      ],
      y0: 0,
      y1,
      material,
      normale
    })
  }
  return stuecke
}

/** Koerper eines Ausstattungs-Elements. Masse kommen in cm herein. */
function ausstattungsKoerper(el) {
  const form = bauformFuer(el)
  const cx = el.x * CM
  const cz = el.y * CM
  const b = el.breite * CM
  const t = el.tiefe * CM
  const dr = el.drehung || 0
  const grund = () => (form.rund ? rund(cx, cz, b, t) : rechteck(cx, cz, b, t, dr))
  const raus = []

  if (form.teil === 'stuhl') {
    // Sitzflaeche und Lehne. Die Beine der Vorlage (uebersicht.html:246) sind
    // hier weggelassen: bei 144 Stuehlen waeren das 576 zusaetzliche Koerper,
    // deren 7 cm im fertigen Bild niemand sieht.
    raus.push({ punkte: rechteck(cx, cz, b, t, dr), y0: 0, y1: DARSTELLUNGSHOEHE.sitz, material: 'sitz' })
    // Lehne an der Rueckkante: lokal um `versatz` in +z verschoben, mitgedreht.
    const rueck = t * 0.35
    const c = Math.cos(dr)
    const s = Math.sin(dr)
    const versatz = (t - rueck) / 2
    raus.push({
      punkte: rechteck(cx - versatz * s, cz + versatz * c, b, rueck, dr),
      y0: DARSTELLUNGSHOEHE.sitz,
      y1: DARSTELLUNGSHOEHE.lehne,
      material: 'sitz'
    })
    return raus
  }

  if (form.teil === 'sessel') {
    raus.push({ punkte: rund(cx, cz, b, t), y0: 0, y1: DARSTELLUNGSHOEHE.polster, material: 'polster' })
    raus.push({ punkte: rund(cx, cz, b * 0.78, t * 0.78), y0: DARSTELLUNGSHOEHE.polster, y1: DARSTELLUNGSHOEHE.polsterLehne, material: 'polster' })
    return raus
  }

  if (form.teil === 'pflanze') {
    raus.push({ punkte: rund(cx, cz, b * 0.55, t * 0.55, 8), y0: 0, y1: DARSTELLUNGSHOEHE.topf, material: 'topf' })
    raus.push({ punkte: rund(cx, cz, b, t, 8), y0: DARSTELLUNGSHOEHE.topf, y1: DARSTELLUNGSHOEHE.topf + DARSTELLUNGSHOEHE.krone, material: 'gruen' })
    return raus
  }

  if (form.teil === 'stufen') {
    // Treppenlauf: gestaffelte Tritte entlang der laengeren Achse, damit man
    // die Steigung sieht statt eines Klotzes (uebersicht.html:301).
    const n = 9
    const laengs = b >= t
    for (let i = 0; i < n; i++) {
      const anteil = (i + 0.5) / n
      const px = laengs ? cx - b / 2 + b * anteil : cx
      const pz = laengs ? cz : cz - t / 2 + t * anteil
      raus.push({
        punkte: rechteck(px, pz, laengs ? b / n : b, laengs ? t : t / n, dr),
        y0: 0,
        y1: (form.y1 * (i + 1)) / n,
        material: 'stufe'
      })
    }
    return raus
  }

  if (form.teil === 'tisch') {
    raus.push({ punkte: grund(), y0: form.y0, y1: form.y1, material: form.material })
    return raus
  }

  raus.push({ punkte: grund(), y0: form.y0, y1: form.y1, material: form.material })
  return raus
}

/**
 * Baut die vollstaendige Szene.
 *
 * @param {{floorplan:{corners:object,walls:object[],ausstattung?:object[]},labels?:object[]}} plan
 * @param {{wandDicke?:number, nurKernSaeulen?:boolean}} [opt] Wanddicke in cm
 */
export function baueSzene(plan, opt = {}) {
  const fp = plan.floorplan || plan
  const dicke = (opt.wandDicke ?? 12.5) * CM
  const labels = plan.labels || []

  /* ── Raumflaechen ──────────────────────────────────────────────── */
  const zyklen = leiteRaeumeAb(fp.corners, fp.walls)
  const raeume = zyklen.map((z) => {
    const punkte = z.map((c) => ({ x: c.x * CM, z: c.y * CM }))
    return { punkte, ecken: z.length, flaeche: flaecheVon(z) * CM * CM, mitte: mitteVon(punkte) }
  })

  // Die Erschliessungszone ist der Zyklus, der zwischen allen Raeumen
  // maeandert — im gemessenen Plan 46 Ecken gegenueber 4 bei jedem Raum. Sie
  // schluckt zugleich die offenen Arbeitsbereiche, die keine geschlossenen
  // Waende haben; darum tragen 6 der 18 Namens-Anker in ihr. Das ist kein
  // Fehler der Ableitung, sondern die Wahrheit dieses Grundrisses.
  let flurIndex = -1
  let meisteEcken = 8
  raeume.forEach((r, i) => {
    if (r.ecken > meisteEcken) {
      meisteEcken = r.ecken
      flurIndex = i
    }
  })

  /* ── Namens-Anker und ihre Saeulen ─────────────────────────────── */
  const zaehler = {}
  const marken = labels.map((l) => {
    const schluessel = `${l.text}|${l.seite}`
    const rang = (zaehler[schluessel] = (zaehler[schluessel] ?? -1) + 1)
    const s = saeuleFuer(l, rang)
    const aktiv = s && (!s.nurVollausbau || !opt.nurKernSaeulen)
    return {
      text: l.text,
      zusatz: l.zusatz || '',
      seite: l.seite,
      x: l.anker_cm[0] * CM,
      z: l.anker_cm[1] * CM,
      saeule: s ? s.saeule : null,
      nurVollausbau: s ? s.nurVollausbau : false,
      hervor: !!aktiv
    }
  })

  // Raum -> Saeule, damit der Boden eines Saeulen-Raums seinen eigenen Ton
  // bekommt (uebersicht.html:459 `floorP`).
  const saeulenRaeume = new Set()
  marken.forEach((m) => {
    if (!m.hervor) return
    raeume.forEach((r, i) => {
      if (i !== flurIndex && liegtIn({ x: m.x, y: m.z }, r.punkte.map((p) => ({ x: p.x, y: p.z })))) {
        saeulenRaeume.add(i)
      }
    })
  })

  /* ── Koerper: Boeden, Waende, Ausstattung ──────────────────────── */
  const boeden = raeume.map((r, i) => ({
    punkte: r.punkte,
    y0: 0,
    y1: DARSTELLUNGSHOEHE.boden,
    material: i === flurIndex ? 'flur' : saeulenRaeume.has(i) ? 'bodenSaeule' : r.flaeche < 20 ? 'bodenNeben' : 'boden',
    istBoden: true
  }))

  const mitteX = raeume.length ? raeume.reduce((s, r) => s + r.mitte.x, 0) / raeume.length : 0
  const mitteZ = raeume.length ? raeume.reduce((s, r) => s + r.mitte.z, 0) / raeume.length : 0

  const waende = []
  for (const w of fp.walls) {
    const a = fp.corners[w.corner1]
    const b = fp.corners[w.corner2]
    if (!a || !b) continue
    const pa = { x: a.x * CM, z: a.y * CM }
    const pb = { x: b.x * CM, z: b.y * CM }
    const aussen = w.art === 'aussen'
    // Aussennormale fuer den Puppenhaus-Schnitt: sie zeigt von der Hallenmitte
    // weg. Zeigt sie zur Kamera, faellt die Wand weg und gibt den Blick frei.
    let normale
    if (aussen) {
      const ex = pb.x - pa.x
      const ez = pb.z - pa.z
      const laenge = Math.hypot(ex, ez) || 1
      let nx = -ez / laenge
      let nz = ex / laenge
      const mx = (pa.x + pb.x) / 2 - mitteX
      const mz = (pa.z + pb.z) / 2 - mitteZ
      if (nx * mx + nz * mz < 0) {
        nx = -nx
        nz = -nz
      }
      normale = [nx, 0, nz]
    }
    waende.push(
      ...wandStuecke(
        pa,
        pb,
        dicke,
        aussen ? DARSTELLUNGSHOEHE.wandAussen : DARSTELLUNGSHOEHE.wandInnen,
        aussen ? 'wandAussen' : 'wand',
        normale
      )
    )
  }

  const moebel = []
  for (const el of fp.ausstattung || []) moebel.push(...ausstattungsKoerper(el))

  /* ── Ausdehnung fuer den Massstab ──────────────────────────────── */
  let x0 = Infinity
  let x1 = -Infinity
  let z0 = Infinity
  let z1 = -Infinity
  for (const id of Object.keys(fp.corners)) {
    const c = fp.corners[id]
    x0 = Math.min(x0, c.x * CM)
    x1 = Math.max(x1, c.x * CM)
    z0 = Math.min(z0, c.y * CM)
    z1 = Math.max(z1, c.y * CM)
  }

  return {
    boeden,
    waende,
    moebel,
    marken,
    raeume,
    flurIndex,
    grenzen: { x0, x1, z0, z1 },
    mitte: { x: (x0 + x1) / 2, z: (z0 + z1) / 2 },
    hoechster: DARSTELLUNGSHOEHE.kern
  }
}
