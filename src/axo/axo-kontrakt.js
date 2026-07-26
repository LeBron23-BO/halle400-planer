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
    gruen: '#7C9A6B'
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
    gruen: '#4E6B4C'
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
  kern: 2.45, // Aufzug/Treppenhaus ragen bewusst durch den Schnitt
  tisch: 0.72,
  platte: 0.05,
  sitz: 0.44,
  lehne: 0.8,
  polster: 0.38,
  polsterLehne: 0.7,
  schrank: 1.72,
  stellwand: 1.45, // schmale Schraenke (<= 30 cm tief) sind Stellwaende
  kabine: 2.05,
  topf: 0.42,
  krone: 0.72,
  becken: 0.85,
  wc: 0.42,
  kochfeld: 0.9,
  loggia: 0.04 // flache Auflage auf dem Boden
}

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

/** @typedef {{material:string, y0:number, y1:number, rund?:boolean, teil?:string}} Bauform */

/** Zuordnung Typ -> Bauform. Sonderfaelle loest `bauformFuer` ueber `text`. */
export const AUSSTATTUNG_STIL = {
  treppe: { material: 'stufe', y0: 0, y1: 1.4, teil: 'stufen' },
  wc: { material: 'schrank', y0: 0, y1: DARSTELLUNGSHOEHE.wc, rund: true },
  waschbecken: { material: 'schrank', y0: 0, y1: DARSTELLUNGSHOEHE.becken },
  tisch: { material: 'holz', y0: DARSTELLUNGSHOEHE.tisch, y1: DARSTELLUNGSHOEHE.tisch + DARSTELLUNGSHOEHE.platte, teil: 'tisch' },
  rundtisch: { material: 'holz', y0: DARSTELLUNGSHOEHE.tisch, y1: DARSTELLUNGSHOEHE.tisch + DARSTELLUNGSHOEHE.platte, rund: true, teil: 'tisch' },
  stuhl: { material: 'sitz', y0: 0, y1: DARSTELLUNGSHOEHE.sitz, teil: 'stuhl' },
  schrank: { material: 'schrank', y0: 0, y1: DARSTELLUNGSHOEHE.schrank },
  pflanze: { material: 'gruen', y0: 0, y1: DARSTELLUNGSHOEHE.topf + DARSTELLUNGSHOEHE.krone, rund: true, teil: 'pflanze' },
  kochfeld: { material: 'schrank', y0: 0, y1: DARSTELLUNGSHOEHE.kochfeld },
  flaeche: { material: 'loggia', y0: 0, y1: DARSTELLUNGSHOEHE.loggia }
}

/**
 * Bauform eines Elements — mit den Sonderfaellen, die erst der Blick in die
 * `text`-Felder zeigt: unter `rundtisch` stecken auch 'Lounge-Sessel' und
 * 'Sessel' (Sitzmoebel, kein Tisch), unter `schrank` auch 'Stellwand' und
 * 'Regal'. Eine Stellwand ist 20 cm tief und 1,45 m hoch, eine Schrankzeile
 * 35 cm tief und 1,72 m — als gleicher Kasten gezeichnet saehe der Raum
 * zugestellt aus, wo in Wirklichkeit nur eine Trennscheibe steht.
 * @param {{typ:string,text?:string|null,tiefe:number,breite:number}} el
 * @returns {Bauform}
 */
export function bauformFuer(el) {
  const stil = AUSSTATTUNG_STIL[el.typ]
  if (!stil) return { material: 'schrank', y0: 0, y1: 0.8 }
  const text = (el.text || '').toLowerCase()

  if (el.typ === 'rundtisch' && /sessel|lounge/.test(text)) {
    return { material: 'polster', y0: 0, y1: DARSTELLUNGSHOEHE.polsterLehne, rund: true, teil: 'sessel' }
  }
  if (el.typ === 'schrank' && Math.min(el.breite, el.tiefe) <= 30) {
    return { material: 'schirm', y0: 0, y1: DARSTELLUNGSHOEHE.stellwand }
  }
  return stil
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
