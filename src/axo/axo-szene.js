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
/** @typedef {{punkte:Punkt[], y0:number, y1:number, material:string, normale?:number[], istBoden?:boolean, id?:string, typ?:string, wandId?:string}} Koerper */

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
function wandStuecke(a, b, dicke, y1, material, normale, oeffnungen = [], wandId = undefined) {
  const laenge = Math.hypot(b.x - a.x, b.z - a.z)
  if (laenge < 1e-6) return []
  const ex = (b.x - a.x) / laenge
  const ez = (b.z - a.z) / laenge
  const px = (-ez * dicke) / 2
  const pz = (ex * dicke) / 2
  const stuecke = []

  /** Ein Wandstueck von t0 bis t1 (Meter entlang der Wand), von y0 bis yTop. */
  const legeAn = (t0, t1, yTop) => {
    if (t1 - t0 < 1e-6 || yTop <= 0) return
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
      y1: yTop,
      material,
      normale,
      /* W7 — DER RUECKVERWEIS VOM BILD INS MODELL.
         Ohne ihn ist ein Wandstueck im Bild ein anonymes Vieleck: man kann
         darauf zeigen und nicht sagen, WORAUF. Eine Zeile, und sie kostet
         nichts — die Kennung liegt beim Aufrufer ohnehin in der Hand.
         Gezogen wird an einer Wand trotzdem nicht (die Krone liegt 1,63 m
         neben dem Fusspunkt); der Verweis sagt „hier ist Mauerwerk, kein
         Moebel" und trennt damit Greifen von Drehen. */
      wandId
    })
  }

  /** Ein Stueck in Kacheln von hoechstens `DARSTELLUNG.kachel` zerlegen. */
  const kacheln = (t0, t1, yTop) => {
    const l = t1 - t0
    if (l < 1e-6) return
    const n = Math.max(1, Math.ceil(l / DARSTELLUNG.kachel))
    for (let i = 0; i < n; i++) {
      legeAn(t0 + (l * i) / n, t0 + (l * (i + 1)) / n, yTop)
    }
  }

  /* ── Die Oeffnungen aus der Wand herausschneiden (W4) ──────────────────
     EINE Oeffnung ist hier schlicht: die Kacheln ueber ihrem Intervall gar
     nicht erst erzeugen. Kein Eingriff in `axo-zeichnen.js`, keiner in die
     Raumableitung — genau deshalb kostet diese Welle in der Ansicht so wenig.

     Erst die vollen Stuecke bestimmen, dann kacheln (und nicht umgekehrt):
     kachelte man zuerst und schnitte danach, entstuenden an jeder Laibung
     Reststuecke von wenigen Zentimetern, die der Maler-Algorithmus als eigene
     Flaechen sortieren muesste. */
  const luecken = oeffnungen
    .map((o) => ({
      von: Math.max(0, Math.min(laenge, o.von)),
      bis: Math.max(0, Math.min(laenge, o.bis)),
      bruestung: o.bruestung || 0
    }))
    .filter((o) => o.bis - o.von > 1e-6)
    .sort((p, q) => p.von - q.von)

  let cursor = 0
  for (const l of luecken) {
    if (l.von > cursor) kacheln(cursor, l.von, y1)
    // Ein Fenster mit Bruestung laesst unter sich Mauerwerk stehen — sonst
    // saehe es aus wie ein Durchgang. Die Bruestung wird auf die Schnitthoehe
    // begrenzt: die Ansicht schneidet die Waende ohnehin auf 1,16 m, ein
    // hoeherer Block waere eine Hoehenaussage, die dieses Bild nicht trifft.
    if (l.bruestung > 0) kacheln(l.von, l.bis, Math.min(l.bruestung, y1))
    cursor = Math.max(cursor, l.bis)
  }
  if (cursor < laenge) kacheln(cursor, laenge, y1)

  return stuecke
}

/**
 * Koerper eines Ausstattungs-Elements — EIN Koerper je gemessenem Element.
 *
 * Der erste Entwurf setzte Stuehle aus Sitz und Lehne zusammen, liess Treppen
 * in neun Stufen ansteigen und machte aus manchen Rundtischen Sessel. Alles
 * davon ist wieder verschwunden: der Plan misst Umriss und Standort, nicht
 * Form. Was ein Element hoch ist, sagt die Tabelle des Projekts; wie es
 * aussieht, sagt sein Umriss. Mehr steht nicht fest, also wird mehr nicht
 * gezeigt.
 *
 * OEFFENTLICH seit W7, damit ein laufender Zug GENAU EINEN Koerper austauschen
 * kann statt die ganze Szene neu zu bauen. `baueSzene` kostet gemessen 16,2 ms
 * — bei 60 Zeigerbewegungen je Sekunde ist das eine Sekunde Rechenzeit fuer
 * eine Sekunde Ziehen. Wer hier einen zweiten Weg baute, haette zwei Wahrheiten
 * darueber, wie ein Moebel aussieht; deshalb dieselbe Funktion.
 *
 * @param {object} el Element aus `floorplan.ausstattung`, Masse in cm
 * @param {{oberkante:object, koerper:object}} hoehen
 */
export function ausstattungsKoerper(el, hoehen) {
  const form = bauformFuer(el, hoehen)
  if (!form) return [] // unbekannter Typ: lieber nichts als etwas Erfundenes
  const cx = el.x * CM
  const cz = el.y * CM
  const b = el.breite * CM
  const t = el.tiefe * CM
  const dr = el.drehung || 0
  return [
    {
      /* W7 — DER RUECKVERWEIS VOM BILD INS MODELL.
         Bis hierher lieferte diese Funktion ein Vieleck ohne Namen: man konnte
         das Stueck sehen, treffen und trotzdem nicht sagen, WELCHES es ist.
         Genau daran scheiterte jedes Bearbeiten in der Axonometrie.
         Die KENNUNG und nicht der Listenindex — dieselbe Regel wie ueberall in
         diesem Planer (W2 Punkt 1): ein Typ ohne `AUSSTATTUNG_STIL` liefert
         `null` und faellt oben heraus, die Indizes von `fp.ausstattung` und
         `szene.moebel` liefen also lautlos auseinander. */
      id: el.id,
      typ: el.typ,
      punkte: form.rund ? rund(cx, cz, b, t) : rechteck(cx, cz, b, t, dr),
      y0: form.y0,
      y1: form.y1,
      material: form.material,
      /**
       * FREI GESETZT (M1) — und das Blatt muss es ZEIGEN, nicht nur behaupten.
       *
       * Bis hierher kam `quelle` in `src/axo/*.js` KEIN EINZIGES MAL vor.
       * Gemessen: derselbe Tisch von `gemessen` auf `gesetzt` gekippt ergab im
       * Grundriss ein klar anderes Bild, in der Axonometrie dagegen exakt
       * dieselbe Prüfsumme (2728510327 vorher wie nachher). Die Strichelung
       * erreichte also ausgerechnet die Ansicht nicht, die sich die Bank
       * ansieht — dort sah eine Annahme aus wie ein Aufmass.
       */
      gesetzt: el.quelle === 'gesetzt'
    }
  ]
}

/**
 * Baut die vollstaendige Szene.
 *
 * @param {{floorplan:{corners:object,walls:object[],ausstattung?:object[]},labels?:object[]}} plan
 * @param {{wandDicke?:number, nurKernSaeulen?:boolean, hoehen?:object}} [opt]
 *        `wandDicke` in cm; `hoehen` sind OBERKANTE_CM/KOERPER_CM aus
 *        `src/three/ausstattung.ts` — ohne sie wird keine Ausstattung
 *        gezeichnet, denn dann ist keine Hoehe belegt.
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

  /**
   * Aussenwand oder Innenwand? Topologisch entschieden statt aus dem Feld
   * `art` des Plans gelesen: eine Wand ist aussen, wenn auf EINER ihrer beiden
   * Seiten keine Raumflaeche mehr liegt.
   *
   * Der Umweg ist noetig und zugleich besser. Noetig, weil `art` nur in der
   * Plan-Datei steht — das Wandmodell des Planers fuehrt es nicht, nach dem
   * Laden waere es weg, und die Ansicht im Planer haette gar keine Aussenwaende
   * mehr. Besser, weil eine Wand, die der Nutzer gerade erst gezeichnet hat,
   * ueberhaupt kein `art` haben KANN — die Geometrie dagegen ist immer da.
   *
   * Nebenbei faellt die Aussennormale ab, und zwar die richtige: sie zeigt zur
   * leeren Seite. Die vorherige Annahme "zeigt von der Hallenmitte weg" haette
   * am Aufzug-Vorbau (y-min −352 cm) ins Gebaeudeinnere gezeigt.
   */
  const alsPolygone = raeume.map((r) => r.punkte.map((p) => ({ x: p.x, y: p.z })))
  const inIrgendeinemRaum = (x, z) => alsPolygone.some((poly) => liegtIn({ x, y: z }, poly))
  const tastAbstand = Math.max(dicke, 0.1) * 1.6

  /* ── Oeffnungen je Wand (W4) ─────────────────────────────────────────
     Sie haengen an `Wall.id`. Eine Wand OHNE Kennung kann darum keine tragen —
     und das ist kein Mangel: der gemessene Plan (`app/public/plaene/*.json`)
     fuehrt keine Wand-Kennungen und keine Oeffnungen. Beide entstehen erst,
     wenn ein Nutzer etwas setzt, und dann laeuft der Plan ueber
     `saveFloorplan()`, das die Kennung mitschreibt. Hier deshalb bewusst KEINE
     nachgebaute Kennungs-Ableitung: eine zweite Ableitung liefe von der im
     Modell (`kennungAusWand`) irgendwann ab, und niemand merkte es. */
  const oeffnungenJeWand = new Map()
  for (const o of fp.oeffnungen || []) {
    if (!o.wandId || o.verwaist) continue
    if (!oeffnungenJeWand.has(o.wandId)) oeffnungenJeWand.set(o.wandId, [])
    oeffnungenJeWand.get(o.wandId).push({
      von: (o.lage - o.breite / 2) * CM,
      bis: (o.lage + o.breite / 2) * CM,
      bruestung: o.art === 'fenster' && o.bruestung ? o.bruestung * CM : 0
    })
  }

  const waende = []
  for (const w of fp.walls) {
    const a = fp.corners[w.corner1]
    const b = fp.corners[w.corner2]
    if (!a || !b) continue
    const pa = { x: a.x * CM, z: a.y * CM }
    const pb = { x: b.x * CM, z: b.y * CM }
    const ex = pb.x - pa.x
    const ez = pb.z - pa.z
    const laenge = Math.hypot(ex, ez) || 1
    const nx = -ez / laenge
    const nz = ex / laenge
    const mx = (pa.x + pb.x) / 2
    const mz = (pa.z + pb.z) / 2
    const linksDrin = inIrgendeinemRaum(mx + nx * tastAbstand, mz + nz * tastAbstand)
    const rechtsDrin = inIrgendeinemRaum(mx - nx * tastAbstand, mz - nz * tastAbstand)

    let normale
    if (linksDrin !== rechtsDrin) {
      // Genau eine Seite ist leer — dorthin zeigt die Aussennormale.
      normale = linksDrin ? [-nx, 0, -nz] : [nx, 0, nz]
    }
    // Steht die Wand voellig frei (beide Seiten leer), bleibt sie stehen: sie
    // wegzuschneiden liesse ein Stueck Grundriss verschwinden, das es gibt.
    const aussen = !!normale
    waende.push(
      ...wandStuecke(
        pa,
        pb,
        dicke,
        aussen ? DARSTELLUNGSHOEHE.wandAussen : DARSTELLUNGSHOEHE.wandInnen,
        aussen ? 'wandAussen' : 'wand',
        normale,
        oeffnungenJeWand.get(w.id) || [],
        w.id
      )
    )
  }

  const hoehen = opt.hoehen || { oberkante: {}, koerper: {} }
  const moebel = []
  for (const el of fp.ausstattung || []) moebel.push(...ausstattungsKoerper(el, hoehen))

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
