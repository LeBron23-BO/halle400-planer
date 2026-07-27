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
  zoomMax: 4.2,
  zoomSchritt: 1.11,
  drehProPixel: 0.006,
  neigeProPixel: 0.0042,
  neigeMin: 0.1,
  neigeMax: 1.45
}

/* ══════════════════════════════════════════════════════════════════
   5 · BESCHRIFTUNG                          [uebersicht.html:648-734]
   ══════════════════════════════════════════════════════════════════
   Die Namen stehen NICHT im Bild, sondern ausserhalb des Baukoerpers und
   greifen mit einer geknickten Fuehrungslinie hinein — wie auf dem
   Originalblatt. Die Etiketten belegen bis zu drei Reihen und weichen
   einander seitlich aus, statt sich zu ueberlagern. */

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
  liege: { material: 'liege' }
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
