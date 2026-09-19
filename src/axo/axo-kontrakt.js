/**
 * AXONOMETRIE — OPTIK-KONTRAKT (X1)
 * =================================
 *
 * Alle benannten Werte der Axonometrie-Darstellung an EINER Stelle. Die Optik
 * stammt aus `app/public/uebersicht.html` (877 Zeilen, im Repo seit 4599f5b);
 * jeder Wert traegt unten seinen Fundort als `uebersicht.html:<zeile>`.
 *
 * WARUM DIESE DATEI EXISTIERT
 * Die Vorlage ist eine in sich geschlossene Einzeldatei mit EIGENEM Datenmodell:
 * sie fuehrt 23 Raeume als Rechtecke (`ROOMS`, uebersicht.html:188) und erzeugt
 * ihre Moebel PROZEDURAL pro Raumtyp (`furnish`, uebersicht.html:292). Der Planer
 * dagegen fuehrt 76 Ecken, 100 Waende und 289 Ausstattungs-Elemente, die alle aus
 * `Nur Büro.pdf` GEMESSEN sind. Uebernommen wird darum ausschliesslich die OPTIK
 * — Farbklima, Projektion, Licht, Beschriftungs-Choreografie. Das Rechteck-Schema
 * und die erfundenen Moebel bleiben zurueck. Wer sie mitnaehme, zeigte der Bank
 * einen Grundriss, den es nicht gibt (CLAUDE.md, oberstes Prinzip).
 *
 * EINHEITEN
 * Der Planer rechnet in ZENTIMETERN, die Vorlage rechnete in METERN. Der Renderer
 * behaelt METER bei, weil alle Optik-Werte darauf kalibriert sind. Die Umrechnung
 * passiert an genau einer Stelle: `axo-szene.js`, beim Einlesen der Plandaten.
 */

/** Zentimeter (Planer) -> Meter (Renderer). Einzige Umrechnungsstelle. */
export const CM = 0.01

/* ══════════════════════════════════════════════════════════════════
   1 · FARBKLIMA          [uebersicht.html:3-43 Variablen, :479-498 MAT]
   ══════════════════════════════════════════════════════════════════
   Warm und papieren: Sandgrund, beige Boeden, Holztoene, gruene Sitze,
   dunkelgruene Kerne (Aufzug/Treppenhaus), oranger Akzent fuer die Saeulen.
   Beide Faelle sind vollstaendig, damit die Ansicht auch im dunklen
   Systemthema traegt — die Vorlage konnte das und soll es behalten. */

export const PALETTE = {
  hell: {
    // Blatt und Schrift                          [uebersicht.html:36-42]
    buehneOben: '#F4EFE3',
    buehneUnten: '#E4DCC8',
    tinte: '#1E2A25',
    tinteMatt: '#6B7570',
    haar: '#BAB09C',
    akzent: '#C8703A',
    // Baukoerper                                 [uebersicht.html:480-497]
    flur: '#E6DFCC',
    boden: '#EDE7D8',
    bodenNeben: '#E2DAC6',
    bodenSaeule: '#F0E3D0',
    loggia: '#DCD0B4',
    wandAussen: '#CFC6B0',
    wand: '#DAD1BB',
    kern: '#3F6757',
    stufe: '#C4BBA4',
    holz: '#C9A876',
    sitz: '#5C8A7B',
    metall: '#9AA29A',
    schirm: '#3A4741',
    schrank: '#D2C8B0',
    polster: '#C8703A',
    kabine: '#0F4C4A',
    topf: '#B9A583',
    gruen: '#7C9A6B',
    // W3 — NICHT aus uebersicht.html, sondern eine neue Darstellungs-
    // entscheidung: die Behandlungsliege braucht einen eigenen Ton. Die
    // vorhandenen Toene sind alle vergeben (Polster ist der Saeulen-Akzent,
    // Sitz gehoert der Matte, Metall dem Geraet), und zwei gleich gefaerbte
    // Koerper nebeneinander waeren im Blatt ein Koerper. Gedaempftes Blaugrau,
    // weil Regeneration im Farbklima der Halle ruhig auftritt.
    liege: '#4A6E8A'
  },
  dunkel: {
    buehneOben: '#161D1A',
    buehneUnten: '#0E1412',
    tinte: '#E7E0CF',
    tinteMatt: '#8A938C',
    haar: '#4A554F',
    akzent: '#D98A4E',
    flur: '#1F2925',
    boden: '#26312C',
    bodenNeben: '#212B27',
    bodenSaeule: '#33322A',
    loggia: '#2E3A2E',
    wandAussen: '#3A4741',
    wand: '#33403A',
    kern: '#5C8A7B',
    stufe: '#4A574F',
    holz: '#7C6647',
    sitz: '#7FA795',
    metall: '#5A655E',
    schirm: '#1A2320',
    schrank: '#3E4B44',
    polster: '#D98A4E',
    kabine: '#2C7370',
    topf: '#6B5A44',
    gruen: '#4E6B4C',
    liege: '#6E93AE'
  }
}

/* ══════════════════════════════════════════════════════════════════
   1b · BODEN NACH RAUMART — die Gliederung des Geschosses
   ══════════════════════════════════════════════════════════════════
   BIS HIERHER faerbte sich ein Boden nach GEOMETRIE: die grosse maeandernde
   Zone wurde `flur`, ein Raum unter 20 m² `bodenNeben`, alles andere `boden`.
   Im Buerogeschoss traegt das, weil dort Raeume sehr verschieden gross sind.
   Im Hotel-Zimmergeschoss traegt es NICHT: Zimmer, Bad, Loggia und Flur liegen
   alle unter 20 m² und bekamen darum denselben Ton. Das Blatt zeigte 136
   Flaechen in EINER Farbe — man sah den Grundriss, aber nicht die NUTZUNG.

   DIE ENTSCHEIDUNG, und warum sie zweigeteilt ist:

   · HELLIGKEIT traegt die Raumart.  Sie ueberlebt den Schwarzweiss-Ausdruck,
     den dieses Blatt sicher erlebt. Die Leiter hat GLEICHE Stufen (rund zehn
     von 255 Graustufen) und ist in BEIDEN Fassungen dieselbe — der Ausdruck
     faellt darum in beiden Fassungen gleich aus.
   · FARBE traegt nur, WELCHE Art es ist.  Sie ist der Teil, der sich
     zurueckdrehen laesst: `FARB_STAERKE` skaliert AUSSCHLIESSLICH den
     Buntanteil. „Zurueckhaltend" und „deutlich" sind darum dasselbe Blatt mit
     unterschiedlich kraeftiger Toenung, nicht zwei Entwuerfe.

   KEINE NEUE FARBFAMILIE. Jeder Ton entsteht als Mischung aus dem Sand des
   Blattes (`boden`) und EINEM schon vorhandenen Palettenton — `akzent`,
   `sitz`, `liege`, `gruen`. Danach wird der Grauwert exakt auf die Stufe
   zurueckgeholt, damit das Einmischen die Leiter nicht verschiebt.

   WAS DIE FARBE NICHT BEHAUPTEN DARF. 28 der 75 Namens-Anker des
   Zimmergeschosses tragen „Deutung unsicher" oder „im Plan nicht beschriftet":
   der Plan ZEICHNET die Zelle, er BENENNT sie nicht. Ein voller Ton wuerde aus
   dieser Lesart eine Beschriftung machen. Solche Raeume bekommen darum
   dieselbe Stufe (die Geometrie ist gemessen, daran ist nichts unsicher), aber
   nur `OFFEN_ANTEIL` des Buntanteils — sichtbar blasser, dieselbe Sprache wie
   das Zurueckweichen frei gesetzter Stuecke (`gesetztRueckzug`).
   ⚠ Im Graustufen-Ausdruck ist dieser Unterschied WEG, weil er nur im
   Buntanteil steckt. Auf Papier sagt die Farbe also nicht, wie sicher die
   Deutung ist; das muss der Blatt-Hinweis sagen, nicht der Ton. */

/** Hex nach [r,g,b] — die eine Stelle, an der dieser Kontrakt Farben rechnet. */
export function hexRgb(hex) {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

/** Grauwert nach der Matrix, die auch `filter:grayscale(1)` und der
 *  Schwarzweiss-Druck benutzen. Genau diese Zahl ist die Leiter-Stufe. */
export function grauWert(c) {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}

/**
 * Raumart aus dem Namen des Ankers. KEIN Raten: erkannt wird nur, was der
 * Plan auch schreibt; alles andere liefert `null` und bleibt ungefaerbt.
 */
export const RAUM_ART_MUSTER = [
  { art: 'erschliessung', muster: /^(flur|treppenhaus|treppe|aufzug|gang)\b/i },
  { art: 'bad', muster: /^(bad|dusche|wc)\b/i },
  { art: 'loggia', muster: /^(loggia|balkon|terrasse)\b/i },
  { art: 'betrieb', muster: /^(empfang|backoffice|back office|waschraum|lager|personal)\b/i },
  { art: 'zimmer', muster: /^zimmer\b/i }
]

/** @param {string} text @returns {string|null} */
export function raumArtFuer(text) {
  const t = (text || '').trim()
  for (const r of RAUM_ART_MUSTER) if (r.muster.test(t)) return r.art
  return null
}

/** Traegt dieser Anker eine DEUTUNG statt einer Beschriftung? */
export function artIstOffen(zusatz) {
  return /deutung unsicher|im plan nicht beschriftet/i.test(zusatz || '')
}

/**
 * Die Leiter. `hell`/`dunkel` sind Ziel-GRAUWERTE in der Palette (vor dem
 * Streiflicht), `partner` ein vorhandener Palettenton, `anteil` sein Gewicht
 * bei voller Staerke.
 *
 * Im hellen Blatt laeuft die Leiter nach UNTEN, in gleichen Stufen von rund
 * neun Graustufen, und sie erzaehlt dabei eine Reihenfolge: je weiter ein Raum
 * vom stillen Wohnen wegfuehrt, desto dunkler und bunter wird er — nichts
 * gesagt, Zimmer, Betrieb, Erschliessung, Bad, Loggia (draussen). Im
 * dunklen Blatt laeuft sie nach OBEN, weil dort der Grund dunkel ist; genauso
 * haelt es die mitgefuehrte Palette seit der Vorlage (`loggia` ist dort
 * heller als `boden`).
 */
export const BODEN_ART = {
  /* OHNE ANGABE ist die wichtigste Stufe, nicht die uebrig gebliebene: 55 der
     136 Flaechen des Zimmergeschosses tragen keinen Namens-Anker. Sie stehen
     am hellsten UND als einzige ohne jeden Buntanteil — „hier steht nichts"
     sieht dann aus wie unbedrucktes Papier. Bekaeme diese Stufe einen Ton,
     waere sie eine Aussage; bekaeme sie die der Zimmer, waere sie eine falsche. */
  ohne_angabe: { hell: 242, dunkel: 40, partner: null, anteil: 0 },
  zimmer: { hell: 233, dunkel: 46, partner: 'holz', anteil: 0.1 },
  betrieb: { hell: 224, dunkel: 52, partner: 'akzent', anteil: 0.12 },
  erschliessung: { hell: 215, dunkel: 58, partner: 'sitz', anteil: 0.2 },
  bad: { hell: 206, dunkel: 64, partner: 'liege', anteil: 0.22 },
  loggia: { hell: 197, dunkel: 70, partner: 'gruen', anteil: 0.24 }
}

/**
 * DIE VIER STUFEN DER AUSARBEITUNG.
 *
 * `zurueckhaltend` und `deutlich` waren die erste Lieferung: gleiche
 * Helligkeitsleiter, nur der Buntanteil verschieden. Der Betreiber hat beide
 * gesehen — „noch mehr farbe und professionalitaet ist gewuenscht. es soll
 * ansehnlicher und professioneller sein." Daraus wurden `c1` und `c2`.
 *
 * WARUM C NICHT EINFACH „MEHR SAETTIGUNG" IST. Ein Blatt sieht nicht
 * professionell aus, weil es bunter ist, sondern weil es die Mittel der
 * Bauzeichnung benutzt. Drei kommen dazu, und alle drei sind seit hundert
 * Jahren Handwerk und kein Zierat:
 *
 *   `schnitt`  Das GESCHNITTENE wird dunkel (Poche). Die Ansicht saegt die
 *              Waende auf 1,16 m auf — die waagerechte Kappe IST die
 *              Schnittflaeche. Bisher war sie die HELLSTE Flaeche der Wand,
 *              weil sie am steilsten zum Licht steht; damit stand der Plan auf
 *              dem Kopf. Dunkel gelegt wird aus dem Kappen-Gewimmel ein
 *              Liniennetz, das den Grundriss zeichnet. Nebenbei behebt es den
 *              schwaechsten gemessenen Wert der letzten Lieferung: Boden gegen
 *              Wandkappe stand bei Kontrast 1,01.
 *   `schatten` Ein SCHLAGSCHATTEN, hart und ohne Verlauf, in der Richtung des
 *              Streiflichts, das die Flaechen ohnehin schon toent. Er stellt
 *              den Baukoerper aufs Blatt, statt ihn darin schwimmen zu lassen.
 *   `kanten`   Umrisslinien AUCH in der Uebersicht. Bisher erschienen sie erst
 *              ab Massstab 2,2 — genau in der Gesamtansicht, die die Bank als
 *              Erstes sieht, war das Blatt darum weich.
 *
 * Was NICHT dazukommt und warum, steht bei jedem Punkt in der Lieferung:
 * keine Verlaeufe ausser dem vorhandenen Blattgrund, keine Spiegelungen, keine
 * Bodenmuster.
 */
export const FARB_STUFE = {
  zurueckhaltend: { chroma: 0.4, schnitt: 0, schatten: 0, kanten: false },
  deutlich: { chroma: 1, schnitt: 0, schatten: 0, kanten: false },
  /* C1 — die Empfehlung. Der Buntanteil liegt knapp ueber `deutlich` (der
     Betreiber nennt es die Untergrenze), die Wirkung kommt aus dem Handwerk. */
  c1: { chroma: 1.45, schnitt: 0.58, schatten: 0.1, kanten: true },
  /* C2 — eine Stufe kraeftiger: buntere Boeden, schwaerzerer Schnitt,
     kraeftigerer Schatten. Dieselben Mittel, nur lauter. */
  c2: { chroma: 1.95, schnitt: 0.7, schatten: 0.15, kanten: true }
}

/** Alt-Name, damit vorhandene Aufrufe nicht ins Leere greifen. */
export const FARB_STAERKE = { zurueckhaltend: 0.4, deutlich: 1 }

/**
 * Die SCHNITTFLAECHEN-Toene: `wand` und `wandAussen` zur Tinte des Blattes hin
 * abgedunkelt. Kein neuer Farbwert — dieselbe Familie, nur tiefer.
 *
 * Der Anteil ist nicht frei gewaehlt, sondern eine UNTERGRENZE: die dunkelste
 * Wandflanke liegt bei Helligkeit 0,60 (`SCHATTEN.grund`), die Kappe steht mit
 * 0,943 fast im vollen Licht. Damit der Schnitt dunkler bleibt als jede
 * Flanke, muss sein Grauwert unter rund 133 liegen — bei 0,58 sind es 111, bei
 * 0,70 sind es 92. Weniger, und der Schnitt verschwindet zwischen den Flanken;
 * dann waere er ein Fleck statt einer Aussage.
 */
export function schnittToene(farben, anteil) {
  if (!(anteil > 0)) return {}
  const tinte = hexRgb(farben.tinte)
  const raus = {}
  /* NUR die beiden Wand-Toene. Der erste Versuch nahm `kern` und `stufe`
     dazu und legte damit die Treppe und den Aufzugsschacht dunkel — beide
     werden aber gar NICHT geschnitten: die Treppe ist 15 cm hoch, der Schacht
     geht mit 3,00 m ueber die Schnittebene hinaus. Ein dunkler Deckel haette
     dort einen Schnitt behauptet, den es nicht gibt (am Standbild als
     schwarzer Fleck am Westkopf aufgefallen). Was nicht geschnitten ist,
     bekommt keine Schnittflaeche. */
  for (const name of ['wand', 'wandAussen']) {
    const c = hexRgb(farben[name]).map((v, i) => v + (tinte[i] - v) * anteil)
    raus[name + 'Schnitt'] = '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
  }
  return raus
}

/**
 * Wohin ein Punkt auf Hoehe `h` seinen Schatten wirft — in Weltmetern (x, z).
 * Gerechnet aus DEMSELBEN Lichtvektor, der schon die Flaechen toent; ein
 * zweiter waere ein Schatten, der nicht zur Beleuchtung passt, und genau das
 * sieht jeder sofort, ohne sagen zu koennen warum.
 */
export function schattenVersatz(h) {
  return [(-h * LICHT[0]) / LICHT[1], (-h * LICHT[2]) / LICHT[1]]
}

/** Wie stark eine bloss GEDEUTETE Raumart faerben darf. */
export const OFFEN_ANTEIL = 0.45

/** Materialname eines Raumbodens. */
export function bodenMaterial(art, offen) {
  return 'boden_' + art + (offen ? '_offen' : '')
}

/**
 * Die Boden-Toene zu einem Farbklima. Ergebnis ist ein Aufsatz auf die
 * PALETTE, kein Ersatz — `boden`, `bodenNeben`, `flur` bleiben unangetastet
 * und tragen weiter jeden Plan, in dem keine Raumart erkannt wird.
 *
 * @param {Record<string,string>} farben PALETTE.hell oder PALETTE.dunkel
 * @param {number} staerke 0..1, skaliert NUR den Buntanteil
 * @param {boolean} dunkel welches Farbklima
 */
export function bodenToene(farben, staerke, dunkel) {
  const sand = hexRgb(farben.boden)
  const sandGrau = grauWert(sand)
  const raus = {}
  const zweiStellig = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  for (const art of Object.keys(BODEN_ART)) {
    const d = BODEN_ART[art]
    const ziel = dunkel ? d.dunkel : d.hell
    const partner = d.partner ? hexRgb(farben[d.partner]) : null
    for (const offen of [false, true]) {
      const m = d.anteil * staerke * (offen ? OFFEN_ANTEIL : 1)
      // 1) Sand auf die Stufe bringen, 2) Partner einmischen,
      // 3) Grauwert exakt zurueckholen — sonst verschoebe das Mischen die Leiter.
      let c = sand.map((v) => (v * ziel) / sandGrau)
      if (partner && m > 0) {
        c = c.map((v, i) => v * (1 - m) + partner[i] * m)
        const g = grauWert(c)
        c = c.map((v) => (v * ziel) / g)
      }
      raus[bodenMaterial(art, offen)] = '#' + c.map(zweiStellig).join('')
    }
  }
  return raus
}

/** Schriftfamilien der Vorlage.                  [uebersicht.html:11-13] */
export const SCHRIFT = {
  serif: '"Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Georgia,serif',
  mono: '"Roboto Mono","Cascadia Mono",Consolas,"SF Mono",ui-monospace,monospace',
  sans: '"Avenir Next","Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,sans-serif'
}

/* ══════════════════════════════════════════════════════════════════
   2 · HOEHEN — DARSTELLUNGSWERTE, KEINE MESSWERTE   [uebersicht.html:226]
   ══════════════════════════════════════════════════════════════════
   ⚠ Ein Grundriss enthaelt keine Hoehen. Nach CLAUDE.md Regel 4 wird darum
   NICHTS geraten und als gemessen ausgegeben: jede Zahl hier ist ein
   gesetzter Darstellungswert und traegt das auch im Namen des Objekts.

   Die gestutzten Waende (1,16 m aussen / 0,94 m innen) sind der Kern der
   Bildidee: die Vorlage schneidet den Baukoerper auf Bruesungshoehe ab, damit
   der Blick in die Raeume faellt — der Puppenhaus-Schnitt. Der Planer fuehrt
   `wallHeight = 300 cm` (Blueprint3DAppBase.tsx:132), was baulich richtig ist,
   aber in der Axonometrie eine geschlossene Schachtel ergaebe. Die Ansicht
   zeigt also bewusst eine ANDERE Hoehe als das 3D-Modell; sie behauptet nicht,
   die Halle sei 1,16 m hoch, sie schneidet sie auf. */

export const DARSTELLUNGSHOEHE = {
  boden: 0.1, // Bodenplatte, traegt den Farbton des Raums
  wandAussen: 1.16, // Schnitthoehe Aussenhuelle
  wandInnen: 0.94, // Schnitthoehe Trenn- und Flurwaende
  kern: 3.0 // Aufzugsschacht, durchgehend bis Oberkante Wand
}

/* ── Ausstattungs-Hoehen kommen NICHT von hier ────────────────────────
   Sie stehen in `src/three/ausstattung.ts` (OBERKANTE_CM / KOERPER_CM) und
   werden von dort uebernommen — die 3D-Ansicht benutzt dieselbe Tabelle.
   Diese Datei setzt keine zweite daneben.

   Das ist mehr als Ordnungsliebe. Die Tabelle traegt eine ausformulierte
   Doktrin, die beim ersten Entwurf dieser Axonometrie verletzt wurde:

     · Der Stuhl ist NUR die Sitzflaeche (45 cm, DIN EN 1335). Eine Rueckenlehne
       waere "eine Formaussage, die der Plan nicht traegt" — der erste Entwurf
       hatte 144 Lehnen erfunden.
     · Die Treppe ist NUR der Antritt (15 cm). Weder Geschosshoehe noch
       Stufenzahl stehen in einem Grundriss; der erste Entwurf liess sie in
       neun Stufen ansteigen und behauptete damit eine Steigung, die niemand
       gemessen hat.
     · Der Tisch ist die PLATTE auf Arbeitshoehe (6 cm auf 74 cm), kein
       Vollkoerper — sonst stellt ein 290x350-Konferenztisch den halben Raum zu.

   Frei bleibt allein die FARBE: sie ist eine Optik-Entscheidung dieser
   Ansicht, kein Messwert. Die 3D-Ansicht faerbt blaustichig, damit ihre
   eigenen Pruefungen Moebel von Waenden trennen koennen; die Axonometrie
   braucht dafuer das warme Klima der Vorlage. */

/* ══════════════════════════════════════════════════════════════════
   3 · PROJEKTION UND LICHT              [uebersicht.html:506,547-558]
   ══════════════════════════════════════════════════════════════════
   Orthographisch ueber Azimut + Elevation — kein Fluchtpunkt, darum bleiben
   parallele Kanten parallel und Massverhaeltnisse lesbar. Genau das macht
   eine Axonometrie zum Planblatt statt zum Foto. */

/** Anfangsblick: leicht von Nordwest, flach.      [uebersicht.html:506] */
export const BLICK_START = { az: -0.52, el: 0.62, zoom: 1 }

/** Die vier Knoepfe der Leiste.                   [uebersicht.html:813] */
export const BLICKE = [
  { taste: 'nord', az: -0.52, el: 0.62 },
  { taste: 'west', az: -1.3, el: 0.5 },
  { taste: 'sued', az: -2.62, el: 0.62 },
  { taste: 'plan', az: 0, el: 1.44 }
]

/** Streiflicht von links oben.                    [uebersicht.html:557] */
export const LICHT = (() => {
  const l = [-0.42, 0.86, 0.3]
  const m = Math.hypot(l[0], l[1], l[2])
  return [l[0] / m, l[1] / m, l[2] / m]
})()

/**
 * Flaechenhelligkeit aus dem Winkel zum Licht.    [uebersicht.html:560-567]
 * Grundhelligkeit 0,60 + 0,40 Streiflicht — nie ganz schwarz, damit
 * abgewandte Flaechen noch Zeichnung tragen.
 */
export const SCHATTEN = { grund: 0.6, streif: 0.4 }

/* ══════════════════════════════════════════════════════════════════
   4 · DARSTELLUNGS-SCHWELLEN
   ══════════════════════════════════════════════════════════════════ */

export const DARSTELLUNG = {
  /**
   * Kachelbreite in Metern.                        [uebersicht.html:417]
   * Der Maler-Algorithmus sortiert jede Flaeche ueber EINEN Tiefenwert. Eine
   * 78 m lange Wand bekaeme die Tiefe ihrer Mitte und verdeckte alles, was
   * hinter diesem Punkt liegt. In Kacheln zerlegt stimmt die Reihenfolge.
   */
  kachel: 3.2,

  /**
   * Puppenhaus-Schnitt.                            [uebersicht.html:573]
   * Eine Aussenwand verschwindet, sobald ihre Aussennormale mehr als diese
   * Schwelle zur Kamera zeigt — sonst stuende man vor der Fassade.
   */
  schnittSchwelle: 0.12,

  /** Ab diesem Massstab lohnen Umrisslinien.       [uebersicht.html:628] */
  kanteAbMassstab: 2.2,
  kanteDeckkraft: 0.2,
  kanteBreite: 0.6,

  /* ── FREI GESETZTE STUECKE (M1) ──────────────────────────────────────
     NICHT aus uebersicht.html — die Vorlage kannte keine Herkunft. Drei
     gesetzte Darstellungswerte, gemeinsam abgestimmt am Standbild:

     `gesetztRueckzug` 0.42 mischt die Materialfarbe zu 42 % zum Buehnengrund.
     Weniger (0.25) war neben einem gemessenen Nachbarn nicht zu unterscheiden,
     mehr (0.6) loeschte die Farbfamilie und machte aus einem Tisch einen
     Fleck. Die Haelfte ist ungefaehr die Grenze, an der beides noch geht:
     „das ist ein Tisch" und „der steht da nur angenommen".

     Strich und Kante sind FEINER als im Grundriss ([4,3] bei 1 px): eine
     Axonometrie zeigt je Koerper bis zu fuenf Flaechen statt einer, die
     Kanten liegen also dichter. Mit der groben Grundriss-Strichelung wurde
     aus einem Stuhl ein Knaeuel. */
  gesetztRueckzug: 0.42,
  gesetztStrich: [3, 2.2],
  gesetztKanteDeckkraft: 0.55,
  gesetztKanteBreite: 0.75,

  /* ── WAS IN DER HAND IST (Handy-Welle) ───────────────────────────────
     Am Rechner sagt es der Zeiger: er steht auf `grabbing`, sobald ein Stueck
     gegriffen ist. Am Handy gibt es keinen Zeiger, und die Fingerkuppe deckt
     genau das Stueck zu, um das es geht — ohne eine zweite Auskunft weiss man
     nicht, ob der Wisch das Blatt dreht oder ein Moebel schiebt.

     Es wird KEINE Farbe eingefuehrt: die Kante des gegriffenen Koerpers wird
     voll ausgezogen, in der TINTE des Blattes, dreimal so breit wie eine
     gewoehnliche. Eine Signalfarbe waere in diesem Bild ein Fremdkoerper und
     im Ausdruck (M5) ein Fleck. Der Wert ist am Standbild bei 390 x 800
     abgestimmt: 1,8 traegt neben einer Fingerkuppe, 1,2 verschwand darunter.
     Die Deckkraft ist ausdruecklich 1 — die 0,2 der gewoehnlichen Kante ist
     der Grund, warum ein blosses Verbreitern nichts brachte. */
  griffKanteBreite: 1.8,

  /** Zoom-Grenzen und Empfindlichkeit.       [uebersicht.html:777-778,792] */
  zoomMin: 0.45,
  /* ── WARUM 24 UND NICHT MEHR 4,2 (Handy-Welle H2) ────────────────────
     GEMESSEN an der Bank-Fassung bei 390 x 844: die Grundeinpassung quetscht
     den 78-m-Riegel in 358 nutzbare Bildpunkte. Bei der alten Obergrenze 4,2
     war ein Hotelzimmer von 3,5 m damit 62 Bildpunkte breit — 16 % der
     Anzeigenbreite, ein Daumennagel. "Jeder Raum soll perfekt absehbar sein"
     ist mit dieser Zahl nicht einloesbar, egal wie gut die Geste ist.

     24 ist keine runde Wunschzahl, sondern zurueckgerechnet: 62,4 px x
     (24 / 4,2) = 357 px, also 91 % der Anzeigenbreite fuer ein Zimmer — es
     FUELLT den Bildschirm, mit einem Rest Rand, damit man noch sieht, wo man
     ist. Die Tiefenrichtung (3,6 m) kommt dabei auf 283 px.

     Am Rechner verschlechtert die hoehere Grenze nichts: sie verschiebt nur,
     wo das Rad aufhoert. Der Startzoom bleibt 1, die Einpassung bleibt
     dieselbe Rechnung. Wer nie weiter als 4,2 dreht, merkt keinen
     Unterschied. */
  zoomMax: 24,
  zoomSchritt: 1.11,
  /* ── EIN KNOPFDRUCK IST KEIN RADKLICK (H3) ───────────────────────────
     Das Rad rastet fein (1,11), weil man es rollt — zwanzig Rasten kosten
     eine Handbewegung. Ein Knopf wird GEDRUECKT, und zwanzig Druecke sind
     zwanzig Handbewegungen. Zurueckgerechnet: mit 1,11 braeuchte der Weg von
     der Gesamtansicht bis an die Zoomgrenze (24) rund 30 Druecke, mit 1,6
     genau 7. Sieben ist eine Bedienung, dreissig ist eine Zumutung. */
  zoomKnopfSchritt: 1.6,
  drehProPixel: 0.006,
  neigeProPixel: 0.0042,
  neigeMin: 0.1,
  neigeMax: 1.45,

  /* ── ZWEI FINGER VERDREHEN = DREHEN (Handy-Welle H2) ─────────────────
     Seit ein Finger am Telefon VERSCHIEBT, braucht das Drehen dort einen
     eigenen Weg. Er liegt auf der zweiten Hand-Geste: der Winkel zwischen den
     beiden Fingern. Die Schwelle ist der ganze Trick — beim Aufziehen kippen
     die Finger IMMER ein paar Grad mit, und ein Blatt, das sich dabei
     wegdreht, fuehlt sich kaputt an. Erst ab rund 12 Grad (0,21 rad)
     bewusster Verdrehung folgt der Blick, und dann ohne den Nachholsprung:
     gezaehlt wird ab der Schwelle, nicht ab dem Aufsetzen. */
  drehSchwelle: 0.21,

  /* ── WIE WEIT DARF MAN WEGSCHIEBEN (Handy-Welle H2) ──────────────────
     Mit Zoom 24 ist das Modell bis zu 9000 Bildpunkte breit — ohne Grenze
     wischt man es in zwei Zuegen aus der Anzeige und findet es nicht wieder.
     Also eine weiche Leine statt eines Kaefigs: mindestens so viele
     Bildpunkte des Modells bleiben immer stehen. 72 px ist eine Daumenbreite
     — genug zum Zurueckfinden, wenig genug, um jeden Rand erreichen zu
     koennen. */
  schubRand: 72
}

/* ══════════════════════════════════════════════════════════════════
   5 · BESCHRIFTUNG                          [uebersicht.html:648-734]
   ══════════════════════════════════════════════════════════════════
   Die Namen stehen NICHT im Bild, sondern ausserhalb des Baukoerpers und
   greifen mit einer geknickten Fuehrungslinie hinein — wie auf dem
   Originalblatt. Die Etiketten belegen bis zu drei Reihen und weichen
   einander seitlich aus, statt sich zu ueberlagern.

   Das Ausweichen hat eine GRENZE, und die stand bis dahin nirgends: sind alle
   Reihen bis zum Blattrand voll, gibt es keinen freien Platz mehr. Wer dann
   trotzdem malt, legt Namen uebereinander — auf dem Bildschirm zoomt man
   heran, auf einem Ausdruck bleibt ein unlesbarer Klumpen. `ankerMaxWeg`
   zieht die zweite Grenze: ein Etikett darf zur Seite ausweichen, solange
   seine Fuehrungslinie noch erkennbar zum eigenen Anker zeigt. */

export const BESCHRIFTUNG = {
  schriftBreit: 13, // Name, Serifenschrift, breites Fenster
  schriftSchmal: 11.5,
  zusatzBreit: 10, // Untertitel, Monoschrift
  zusatzSchmal: 9,
  reiheBreit: 29, // Zeilenabstand der Etiketten-Reihen
  reiheSchmal: 25,
  reihenVoll: 3, // alle Namen
  reihenSaeulen: 2, // nur die neun Saeulen
  lueckeMin: 13, // Mindestabstand zweier Etiketten in einer Reihe
  /* Wie weit ein Etikett seitlich von seinem Anker wegruecken darf. Rund eine
     Etikettenbreite: die Fuehrungslinie bleibt kurz genug, dass das Auge ihr
     folgt. Weiter geschoben stuende der Name ueber dem NACHBARRAUM und wuerde
     ihm zugeordnet — eine falsche Angabe ist schlimmer als eine fehlende. */
  ankerMaxWeg: 120,
  abstandOben: 32, // Abstand Silhouette -> erste Reihe
  abstandUnten: 42,
  knickWeg: 26, // Laenge des senkrechten Stuecks der Fuehrungslinie
  punktSaeule: 2.7, // Radius des Ankerpunkts im Bild
  punktNormal: 1.9
}

/* ══════════════════════════════════════════════════════════════════
   6 · AUSSTATTUNG — WIE DIE 289 GEMESSENEN ELEMENTE AUSSEHEN
   ══════════════════════════════════════════════════════════════════
   Der Plan liefert je Element `typ`, Mittelpunkt `x/y`, `breite/tiefe`,
   `drehung` (Bogenmass) und `text`. Er liefert KEINE Hoehe und keine Farbe —
   beides wird hier gesetzt, sichtbar als Darstellungsentscheidung.

   `rund: true` heisst: als Vieleck statt als Kasten zeichnen. Der Renderer
   kennt nur EIN Grundkoerper-Primitiv (das extrudierte Vieleck), ein Kasten
   ist dessen Sonderfall mit vier Ecken. */

/** @typedef {{material:string, y0:number, y1:number, rund?:boolean}} Bauform */

/**
 * Farbe und Umriss je Ausstattungs-Typ — die HOEHE steht bewusst nicht hier.
 * `rund: true` heisst: als Vieleck statt als Kasten zeichnen (der Renderer
 * kennt nur ein Primitiv, das ausgezogene Vieleck; ein Kasten ist dessen
 * Sonderfall mit vier Ecken).
 */
export const AUSSTATTUNG_STIL = {
  treppe: { material: 'stufe' },
  wc: { material: 'schrank', rund: true },
  waschbecken: { material: 'schrank' },
  tisch: { material: 'holz' },
  rundtisch: { material: 'holz', rund: true },
  stuhl: { material: 'sitz' },
  schrank: { material: 'schrank' },
  pflanze: { material: 'gruen', rund: true },
  kochfeld: { material: 'schrank' },
  aufzug: { material: 'kern' },
  flaeche: { material: 'loggia' },
  // ── W3 ──────────────────────────────────────────────────────────────────
  // Ein Typ, der HIER fehlt, liefert aus `bauformFuer` ein `null` und wird
  // stillschweigend nicht gezeichnet — im Grundriss steht er trotzdem. Genau
  // diese halbe Kette prueft `tools/pruefe-palette.mjs`.
  matte: { material: 'sitz' }, // weiche Auflage, Farbfamilie der Sitzflaechen
  geraet: { material: 'metall' }, // Stahlrahmen
  liege: { material: 'liege' },
  // ── Hotel-Zimmergeschoss ──────────────────────────────────────────────────
  // Drei bislang UNBENUTZTE Toene aus der PALETTE (oben, seit der Vorlage
  // mitgefuehrt, aber nie an einen Typ vergeben) — kein neuer Farbwert noetig.
  // `nachttisch` teilt sich bewusst den Ton mit `schrank`: ein Nachttisch IST
  // ein kleines Schrankmoebel, und beide stehen nie im selben Sichtfeld wie
  // WC/Waschbecken (Bad) neben Nachttisch (Zimmer).
  bett: { material: 'schirm' }, // gedaempftes Gruen, bisher unbenutzt
  nachttisch: { material: 'schrank' },
  dusche: { material: 'kabine' }, // Duschkabinen-Ton, bisher unbenutzt
  tresen: { material: 'topf' } // warmer Holzton, bisher unbenutzt
}

/**
 * Bauform eines Elements: Umriss und Farbe von hier, Hoehe aus der Tabelle des
 * Projekts (`src/three/ausstattung.ts`), die der Aufrufer hereinreicht.
 *
 * Ein Typ ohne Hoehen-Eintrag wird NICHT gezeichnet — genauso haelt es die
 * 3D-Ansicht ("lieber nichts zeichnen als einen erfundenen Koerper").
 *
 * @param {{typ:string,text?:string|null,tiefe:number,breite:number}} el
 * @param {{oberkante:Record<string,number>, koerper:Record<string,number>}} hoehen in cm
 * @returns {Bauform|null}
 */
export function bauformFuer(el, hoehen) {
  const stil = AUSSTATTUNG_STIL[el.typ]
  const oben = hoehen?.oberkante?.[el.typ]
  if (!stil || oben === undefined) return null
  // Ohne eigenen Koerper-Eintrag steht das Stueck auf dem Boden; mit Eintrag
  // schwebt nur die gemessene Platte auf ihrer Arbeitshoehe.
  const dicke = hoehen.koerper?.[el.typ] ?? oben
  return {
    material: stil.material,
    rund: !!stil.rund,
    y0: (oben - dicke) * CM,
    y1: oben * CM
  }
}

/* ══════════════════════════════════════════════════════════════════
   7 · DIE NEUN SAEULEN                     [uebersicht.html:165-175]
   ══════════════════════════════════════════════════════════════════ */

export const SAEULEN = [
  { n: '01', name: 'IHHT', rolle: 'Der Reiz' },
  { n: '02', name: 'Bewegung', rolle: 'Die Aktivierung' },
  { n: '03', name: 'Massage', rolle: 'Die Regeneration' },
  { n: '04', name: 'Akupunktur', rolle: 'Die Balance' },
  { n: '05', name: 'Kurse', rolle: 'Das Wissen' },
  { n: '06', name: 'Ernährung', rolle: 'Der Baustoff' },
  { n: '07', name: 'Gewichtsmanagement', rolle: 'Der Alltag' },
  { n: '08', name: 'Prävention & Biohacking', rolle: 'Die Vorsorge' },
  { n: '09', name: 'Yoga', rolle: 'Der Atem' }
]

/**
 * Welcher Raum traegt welche Saeule.
 *
 * Die Vorlage haengte das an einen Index in ihrem eigenen Rechteck-Schema
 * (`ROOMS[].saeule`, uebersicht.html:188) — den es im Planer nicht gibt. Der
 * Planer fuehrt stattdessen 18 gemessene Namens-Anker (`labels[]` mit
 * `anker_cm` und `seite`), und alle neun Zuordnungen der Vorlage lassen sich
 * ueber Name + Seite eindeutig aufloesen. Damit bleibt EINE Wahrheit: der
 * gemessene Plan. `nurVollausbau` trennt die vier beauftragten Arbeitsraeume
 * vom gedachten Vollausbau (uebersicht.html:187 `scope`).
 *
 * `rang` faengt den Fall doppelter Namen ab: 'Konferenz' steht zweimal auf
 * der Suedseite, gemeint ist die westliche (die groessere, 48,8 m²).
 */
export const SAEULEN_ZUORDNUNG = [
  { name: 'Workspace', seite: 'nord', saeule: 0, nurVollausbau: false },
  { name: 'Workspace', seite: 'sued', saeule: 1, nurVollausbau: false },
  { name: 'Break out', seite: 'sued', saeule: 2, nurVollausbau: true },
  { name: 'Doppelbüro', seite: 'sued', saeule: 3, nurVollausbau: false },
  { name: 'Konferenz', seite: 'sued', rang: 0, saeule: 4, nurVollausbau: true },
  { name: 'Teamtable', seite: 'nord', saeule: 5, nurVollausbau: true },
  { name: 'Workshop', seite: 'sued', saeule: 6, nurVollausbau: true },
  { name: 'Videokonf', seite: 'nord', saeule: 7, nurVollausbau: true },
  { name: 'Einzelbüro', seite: 'nord', saeule: 8, nurVollausbau: false }
]

/**
 * Findet die Saeule zu einem Namens-Anker.
 * @param {{text:string,seite:string}} label
 * @param {number} rang Laufende Nummer gleichnamiger Anker derselben Seite
 * @returns {{saeule:number,nurVollausbau:boolean}|null}
 */
export function saeuleFuer(label, rang) {
  const t = (label.text || '').trim()
  for (const z of SAEULEN_ZUORDNUNG) {
    if (z.name !== t || z.seite !== label.seite) continue
    if (z.rang != null && z.rang !== rang) continue
    return { saeule: z.saeule, nurVollausbau: z.nurVollausbau }
  }
  return null
}
