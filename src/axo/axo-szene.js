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

// EINE Zeile, keine mehrzeilige Form: `buendel-kern.mjs` streift Importe
// zeilenweise ab (IMPORT_ZEILE), eine umgebrochene bliebe im Rumpf stehen.
import { CM, DARSTELLUNGSHOEHE, DARSTELLUNG, bauformFuer, saeuleFuer, raumArtFuer, artIstOffen, bodenMaterial } from './axo-kontrakt.js'
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

  /** Ein Wandstueck von t0 bis t1 (Meter entlang der Wand), von yFuss bis yTop.
   *
   *  `yFuss` ist seit H1 kein fester Nullpunkt mehr: ueber einer Tuer steht ein
   *  STURZ, und der faengt nicht am Boden an. Der Koerper schwebt dann — was in
   *  dieser Ansicht kein Sonderfall ist, sondern genau das, wofuer sie gebaut
   *  wurde: `axo-zeichnen.js` zieht jedes Vieleck von `y0` nach `y1` aus, und
   *  `axo-treffer.js` prueft den Sehstrahl gegen dieselben zwei Zahlen. Keine
   *  der beiden musste dafuer angefasst werden. */
  const legeAn = (t0, t1, yTop, yFuss = 0) => {
    if (t1 - t0 < 1e-6 || yTop <= yFuss) return
    const p0 = { x: a.x + ex * t0, z: a.z + ez * t0 }
    const p1 = { x: a.x + ex * t1, z: a.z + ez * t1 }
    stuecke.push({
      punkte: [
        { x: p0.x + px, z: p0.z + pz },
        { x: p1.x + px, z: p1.z + pz },
        { x: p1.x - px, z: p1.z - pz },
        { x: p0.x - px, z: p0.z - pz }
      ],
      y0: yFuss,
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
  const kacheln = (t0, t1, yTop, yFuss = 0) => {
    const l = t1 - t0
    if (l < 1e-6) return
    const n = Math.max(1, Math.ceil(l / DARSTELLUNG.kachel))
    for (let i = 0; i < n; i++) {
      legeAn(t0 + (l * i) / n, t0 + (l * (i + 1)) / n, yTop, yFuss)
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
      bruestung: o.bruestung || 0,
      /* Oberkante der Oeffnung (H1). NULL heisst hier ausdruecklich „keine
         Hoehenaussage" und NICHT „null hoch": dann bleibt die Luecke
         durchgehend, also genau das Verhalten von W4. Eine Ersatzzahl stuende
         hier falsch — der Standard gehoert ins Modell
         (`OEFFNUNGS_HOEHE_CM`), und eine zweite Fassung davon in der
         Axonometrie waere eine zweite Annahme, die beim naechsten Aendern
         zurueckbliebe. */
      sturz: o.sturz > 0 ? o.sturz : 0
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
    /* DER STURZ (H1): ueber der Oeffnung steht Mauerwerk — von ihrer Oberkante
       bis zur Schnitthoehe. Bei einer 2,01-m-Tuer und einem Schnitt bei 1,16 m
       ist diese Spanne leer, und dann entsteht hier NICHTS: die Tuer reisst die
       Wandscheibe auf voller Hoehe auf, unveraendert zu W4. Sichtbar wird der
       Sturz nur, wo er wirklich einer ist — bei einer Durchreiche, einer
       niedrigen Oeffnung oder einem hoeher gelegten Schnitt. Genau darin liegt
       der Unterschied zu einem geratenen Wert: er behauptet nie etwas, er
       zeichnet nur, was dasteht. */
    if (l.sturz > 0 && l.sturz < y1) kacheln(l.von, l.bis, y1, l.sturz)
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

  /* ── Raum -> RAUMART, aus den Namens-Ankern ──────────────────────
     Derselbe Weg wie oben bei den Saeulen: ein Anker liegt in einem Raum, also
     gehoert sein Name diesem Raum. Neu ist nur, was daraus folgt — der Ton des
     Bodens statt einer Hervorhebung.

     DREI REGELN, die verhindern, dass die Farbe mehr sagt als der Plan:
     · Ein Name, den `raumArtFuer` nicht kennt, faerbt NICHT. Der Raum faellt
       auf die alte Geometrie-Regel zurueck; das ist der ganze Grund, warum das
       Buerogeschoss unveraendert aussieht.
     · Liegen zwei Anker VERSCHIEDENER Art im selben Raum, faerbt er gar nicht.
       Zwei Deutungen sind keine Deutung, und die haeufigere zu waehlen waere
       geraten.
     · Traegt der Anker „Deutung unsicher", ist die Art `offen` — gleiche
       Helligkeitsstufe, blasserer Buntanteil. Ein Raum mit zwei Ankern
       derselben Art gilt als gesichert, sobald EINER es ist. */
  const raumArt = raeume.map(() => null)
  const streit = new Set()
  marken.forEach((m) => {
    const art = raumArtFuer(m.text)
    if (!art) return
    const offen = artIstOffen(m.zusatz)
    raeume.forEach((r, i) => {
      if (i === flurIndex || streit.has(i)) return
      if (!liegtIn({ x: m.x, y: m.z }, r.punkte.map((p) => ({ x: p.x, y: p.z })))) return
      const bisher = raumArt[i]
      if (!bisher) raumArt[i] = { art, offen }
      else if (bisher.art !== art) { raumArt[i] = null; streit.add(i) }
      else if (!offen) bisher.offen = false
    })
  })
  /* Traegt dieser Plan ueberhaupt benannte Raumarten? Wenn nein, bleibt alles
     bei der Geometrie-Regel — kein Plan aendert sein Aussehen, nur weil eine
     neue Moeglichkeit existiert. Die Erschliessungszone bekommt ihren eigenen
     Ton erst, wenn auch die uebrigen Raeume einen haben; sonst stuende ein
     einzelner gruenstichiger Flur in einem sonst unveraenderten Blatt.

     Die Schwelle ist darum nicht „mindestens einer", sondern EIN VIERTEL der
     Raeume. Das Buerogeschoss kennt vier Anker, die hier greifen (Aufzug,
     Empfang, Lager, Loggia); waeren die schon genug, bekaeme es ein Blatt mit
     drei getoenten und zweiundzwanzig ungetoenten Raeumen — das sieht nach
     Fehler aus, nicht nach Ordnung, und es aenderte eine ausgelieferte Datei
     fuer nichts. Gemessen: Buero 2 von 25 Raeumen (8 %), Zimmergeschoss 62
     von 136 (46 %). */
  const artenErkannt = raumArt.filter(Boolean).length >= raeume.length * 0.25

  /* ── Koerper: Boeden, Waende, Ausstattung ──────────────────────── */
  const boeden = raeume.map((r, i) => ({
    punkte: r.punkte,
    y0: 0,
    y1: DARSTELLUNGSHOEHE.boden,
    material: !artenErkannt
      ? (i === flurIndex ? 'flur' : saeulenRaeume.has(i) ? 'bodenSaeule' : r.flaeche < 20 ? 'bodenNeben' : 'boden')
      : i === flurIndex ? bodenMaterial('erschliessung', false)
        : raumArt[i] ? bodenMaterial(raumArt[i].art, raumArt[i].offen)
          : bodenMaterial('ohne_angabe', false),
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
      bruestung: o.art === 'fenster' && o.bruestung ? o.bruestung * CM : 0,
      /* Oberkante (H1). Anders als bei der Bruestung gilt sie fuer JEDE Art:
         eine Tuer hat einen Sturz, ein Durchgang auch. Fehlt die Angabe — eine
         Plandatei aus der Zeit vor H1, oder eine, die nie durch das Modell
         gelaufen ist —, bleibt sie 0 und die Luecke geht durch. */
      sturz: Number.isFinite(o.hoehe) && o.hoehe > 0 ? o.hoehe * CM : 0,
      /* ── WAS EINE TUER ZUR TUER MACHT (H4) ───────────────────────────
         Bis hierher nahm die Axonometrie von einer Oeffnung nur ihre LUECKE
         mit. Der Plan weiss aber mehr, und zwar genau das, was ein Betrachter
         braucht, um eine Tuer als Tuer zu lesen: an welcher Laibung sie
         haengt (`anschlag`), in welche Richtung sie aufschlaegt (`seite`) und
         wie sicher sie ueberhaupt erkannt wurde (`sicherheit`). Diese drei
         Felder sind seit `tools/setze-tueren.mjs` gepflegt; sie hier
         wegzulassen hiess, eine vorhandene Aussage zu verschweigen. */
      art: o.art || 'durchgang',
      anschlag: o.anschlag === 'anfang' ? 'anfang' : 'ende',
      seite: o.seite === -1 ? -1 : 1,
      sicherheit: o.sicherheit || 'sicher',
      kennung: o.id || null
    })
  }

  /* ══ TUEREN, DIE MAN ALS TUEREN ERKENNT (H4) ═══════════════════════════
     BEFUND: in der Axonometrie war eine Tuer bis hierher NUR eine Luecke in
     der Wandscheibe (plus Sturz, wo einer sichtbar wird). Das sieht aus wie
     ein Loch — und 54 Loecher in einem Hotelgeschoss sehen aus wie ein
     unfertiger Plan, nicht wie 54 Zimmertueren.

     KEINE NEUE BILDSPRACHE, sondern die des Grundrisses, ins Raeumliche
     uebersetzt. Dort besteht eine Tuer aus Laibungen, Band an einer Laibung,
     Blatt senkrecht in den Raum und Aufschlagbogen
     (`floorplanner_view.ts:zeichneBlattUndBogen`). Uebernommen werden davon
     ZWEI Teile, und die Auslassung ist so begruendet wie die Auswahl:

       · SCHWELLE — ein flaches Plaettchen im Durchgang, 3 cm hoch. Es ist der
         Teil, der von OBEN traegt, und diese Ansicht schaut von oben: der
         Blick springt sofort auf die Reihe heller Striche in der Flurwand.
         Zugleich schliesst es die Bodenfuge, die eine Luecke sonst offen
         laesst.
       · BLATT — eine duenne, aufrecht stehende Scheibe, am Band angeschlagen,
         quer aus der Wand heraus auf die Seite, zu der die Tuer aufschlaegt.
         Das ist der Teil, der RAEUMLICH traegt: er steht als einziger
         Koerper quer zu seiner Wand und ist darum aus jeder Blickrichtung als
         Tuer zu lesen. Er sagt zugleich Anschlag UND Aufschlagrichtung.
       · KEIN BOGEN. Im Grundriss ist der Viertelkreis die halbe Auskunft, im
         Raum waere er ein flacher Streifen auf dem Fussboden — ein
         Plansymbol, das in einer raeumlichen Ansicht wie eine Markierung im
         Belag aussieht. 54 davon waeren 54 Streifen. Das Blatt sagt dasselbe
         ohne diesen Preis.

     KEINE SIGNALFARBE: Blatt in `holz`, Schwelle in `stufe` — beide stehen
     seit der Vorlage in der Palette. Die Erkennungs-SICHERHEIT laeuft nicht
     ueber Farbe, sondern ueber die KANTE: gestrichelt heisst in diesem Blatt
     wie im Grundriss „nicht gesichert" (`axo-zeichnen.js`, Herkunfts-
     Strichelung). Eine unsichere Tuer traegt sie, eine sichere nicht.

     Das Blatt wird auf die SCHNITTHOEHE seiner Wand gestutzt. Ein Blatt, das
     ueber die aufgeschnittene Wand hinausragte, waere der einzige Koerper im
     Bild, der die Schnittebene durchstoesst — und saehe nach Fehler aus. */
  const TUER_BLATT_DICKE = 0.045
  const TUER_SCHWELLE_HOCH = 0.03

  /** Schwelle und Blatt einer Oeffnung. Masse in METERN, wie die ganze Szene. */
  function tuerKoerper(pa, ex, ez, dicke, o, hoehe) {
    // Nur Tueren haben ein Blatt. Ein Durchgang hat keines, ein Fenster auch
    // nicht — ihm eines zu geben waere eine Bauaussage, die niemand getroffen
    // hat (dieselbe Regel wie im Grundriss).
    if (o.art !== 'tuer' && o.art !== 'doppeltuer') return []
    const breite = o.bis - o.von
    if (!(breite > 0.05)) return []
    const nx = -ez
    const nz = ex
    const punktAuf = (laengs, quer) => ({
      x: pa.x + ex * laengs + nx * quer,
      z: pa.z + ez * laengs + nz * quer
    })
    const unsicher = o.sicherheit === 'mittel' || o.sicherheit === 'schwach'
    const halbe = dicke / 2
    const stuecke = [
      {
        punkte: [
          punktAuf(o.von, -halbe), punktAuf(o.bis, -halbe),
          punktAuf(o.bis, halbe), punktAuf(o.von, halbe)
        ],
        y0: 0,
        y1: TUER_SCHWELLE_HOCH,
        material: 'stufe',
        id: o.kennung ? o.kennung + '-schwelle' : undefined,
        typ: 'tuerSchwelle',
        unsicher
      }
    ]

    /* Das Band sitzt an der Laibung, die `anschlag` nennt; das Blatt steht
       quer dazu auf der Seite, die `seite` nennt. BEIDE Konventionen sind die
       des Modells (`floorplan.ts:oeffnungsGeometrie` — linke Normale, und
       `anschlag` als 'anfang'/'ende' entlang der Wand). Hier wird nichts neu
       ausgelegt; waere es anders, schlueg dieselbe Tuer im Grundriss nach
       links und im Blatt nach rechts auf. */
    const band = o.anschlag === 'anfang' ? o.von : o.bis
    const nachInnen = o.anschlag === 'anfang' ? 1 : -1
    const fluegel = o.art === 'doppeltuer' ? breite / 2 : breite
    const q = o.seite * fluegel
    stuecke.push({
      punkte: [
        punktAuf(band, 0), punktAuf(band, q),
        punktAuf(band + nachInnen * TUER_BLATT_DICKE, q),
        punktAuf(band + nachInnen * TUER_BLATT_DICKE, 0)
      ],
      y0: 0,
      y1: hoehe,
      material: 'holz',
      id: o.kennung ? o.kennung + '-blatt' : undefined,
      typ: 'tuerBlatt',
      unsicher
    })
    // Eine Doppeltuer hat ZWEI Fluegel, an beiden Laibungen angeschlagen —
    // `anschlag` hat dort keine Wirkung, genau wie im Grundriss.
    if (o.art === 'doppeltuer') {
      stuecke.push({
        punkte: [
          punktAuf(o.bis, 0), punktAuf(o.bis, q),
          punktAuf(o.bis - TUER_BLATT_DICKE, q),
          punktAuf(o.bis - TUER_BLATT_DICKE, 0)
        ],
        y0: 0,
        y1: hoehe,
        material: 'holz',
        id: o.kennung ? o.kennung + '-blatt2' : undefined,
        typ: 'tuerBlatt',
        unsicher
      })
    }
    return stuecke
  }

  const waende = []
  const tueren = []
  /* ── Das BAUREZEPT je Wand (W15) ─────────────────────────────────────
     Damit eine GEZOGENE Wand im Blatt nachgeführt werden kann, ohne die ganze
     Szene neu zu bauen (gemessen 16,2 ms je Bewegung — das ruckelt sichtbar).

     Gemerkt werden nur die Zutaten, NICHT das Ergebnis: beim Nachführen läuft
     dieselbe `wandStuecke` noch einmal, mit denselben Zutaten und neuen
     Endpunkten. Ein hier nachgebautes Vieleck wäre eine ZWEITE Wahrheit über
     das Aussehen einer Wand — und sie fiele erst beim Loslassen auf, wenn die
     Wand in ihre richtige Form zurückspringt. Genau diese Falle vermeidet der
     Möbel-Weg schon (`ausstattungsKoerper` wird dort erneut gerufen). */
  const wandBau = new Map()
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
    const rezept = {
      dicke,
      y1: aussen ? DARSTELLUNGSHOEHE.wandAussen : DARSTELLUNGSHOEHE.wandInnen,
      material: aussen ? 'wandAussen' : 'wand',
      normale,
      oeffnungen: oeffnungenJeWand.get(w.id) || []
    }
    wandBau.set(w.id, rezept)
    waende.push(
      ...wandStuecke(
        pa,
        pb,
        rezept.dicke,
        rezept.y1,
        rezept.material,
        rezept.normale,
        rezept.oeffnungen,
        w.id
      )
    )

    /* Die Tuerkoerper derselben Wand (H4). `ex`/`ez` sind hier die ROHE
       Differenz und nicht die Einheitsrichtung — normiert wird an dieser
       einen Stelle, nicht in `tuerKoerper`: dort haette es eine zweite,
       stillschweigende Annahme ueber die Aufrufer gegeben. */
    const hoeheHier = aussen ? DARSTELLUNGSHOEHE.wandAussen : DARSTELLUNGSHOEHE.wandInnen
    for (const o of oeffnungenJeWand.get(w.id) || []) {
      tueren.push(...tuerKoerper(pa, ex / laenge, ez / laenge, dicke, o, hoeheHier))
    }
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
    /* Das Baurezept je Wand — s. oben. Eine Map und kein einfaches Objekt,
       weil Wand-Kennungen aus `Utils.guid()` kommen und als Objekt-Schlüssel
       mit `__proto__` und Konsorten kollidieren könnten. */
    wandBau,
    /* EIGENE Liste und nicht zu `waende` oder `moebel` geschlagen (H4).
       `moebel` waere falsch gezaehlt: `axoMoebel()` meldet ihre Zahl an die
       Gates, und 54 Tuerblaetter haetten die Ausstattungs-Bilanz 292/292 ueber
       Nacht auf 400 gehoben. `waende` waere falsch gemessen: die Kennzahlen
       lesen dort Wandflaechen. Eine dritte Liste kostet in `zeichne()` eine
       Zeile und laesst beide Zaehlungen in Ruhe. */
    tueren,
    moebel,
    marken,
    raeume,
    /* Wie viele Boeden ihren Ton aus einem Raumnamen haben. Die Huelle
       schreibt daraus den Vorbehalt aufs Blatt — eine Toenung, die niemand
       erklaert, ist eine Behauptung. `gedeutet` sind die, deren Anker nur
       „Deutung unsicher" traegt; sie faerben blasser. */
    raumArten: {
      getoent: artenErkannt ? raumArt.filter(Boolean).length + 1 : 0,
      gedeutet: artenErkannt ? raumArt.filter((a) => a && a.offen).length : 0
    },
    flurIndex,
    grenzen: { x0, x1, z0, z1 },
    mitte: { x: (x0 + x1) / 2, z: (z0 + z1) / 2 },
    hoechster: DARSTELLUNGSHOEHE.kern
  }
}

/**
 * Die Koerper EINER Wand neu bauen, mit neuen Endpunkten (W15).
 *
 * Fuer das Nachfuehren einer GEZOGENEN Wand im Blatt. Der volle Szenen-Neubau
 * kostet gemessen 16,2 ms je Bewegung — das ist ein sichtbares Ruckeln genau in
 * der Geste, die sich fluessig anfuehlen soll. Eine Wand allein kostet
 * Bruchteile davon.
 *
 * Gerufen wird DIESELBE `wandStuecke` wie beim Bau der Szene, mit dem beim Bau
 * gemerkten Rezept. Ein hier nachgebautes Vieleck waere eine zweite Wahrheit
 * ueber das Aussehen einer Wand.
 *
 * WAS DABEI VERALTET, offen gesagt: die Aussen-NORMALE stammt aus dem Bau und
 * wird nicht neu getastet. Sie entscheidet ueber die Schattierung, nicht ueber
 * die Form. Waehrend eines Zuges ist sie hoechstens fuer einen Augenblick die
 * falsche; beim Loslassen baut die Huelle die Szene ohnehin voll neu, und dann
 * stimmt sie wieder. Sie im Zug neu zu tasten hiesse, die Raum-Ableitung je
 * Bewegung laufen zu lassen — und genau die ist der teure Teil.
 *
 * @param {object} szene   aus `baueSzene`
 * @param {string} wandId
 * @param {{x:number,y:number}} a  Anfangsecke in ZENTIMETERN (Planer-Mass)
 * @param {{x:number,y:number}} b  Endecke, dito
 * @returns {Array|null} die neuen Koerper, oder `null` wenn die Wand kein
 *          Rezept hat (sie stammt dann nicht aus dieser Szene).
 */
export function baueWandKoerper(szene, wandId, a, b) {
  const rezept = szene && szene.wandBau ? szene.wandBau.get(wandId) : null
  if (!rezept) return null
  return wandStuecke(
    { x: a.x * CM, z: a.y * CM },
    { x: b.x * CM, z: b.y * CM },
    rezept.dicke,
    rezept.y1,
    rezept.material,
    rezept.normale,
    rezept.oeffnungen,
    wandId
  )
}
