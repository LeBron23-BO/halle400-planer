// Prueft TUEREN, FENSTER UND DURCHGAENGE (W4) — in BEIDEN Welten.
//
// Voraussetzung: der Auslieferungs-Server laeuft UND die Datei ist gebaut.
//   node tools/serve-local.mjs --port 3301
//   node tools/baue-planer-datei.mjs
//   node tools/pruefe-tueren.mjs [--port 3301] [--plan halle400] [--nur planer|datei]
// Exit 0 = alle Pruefungen bestanden, 1 = mindestens eine durchgefallen.
//
// WARUM ZWEI WELTEN IN EINEM WERKZEUG — dieselbe Begruendung wie in
// `pruefe-ziehen.mjs`: Planer (http://localhost) und Doppelklick-Datei
// (file://, Netz gesperrt) tragen DENSELBEN uebersetzten Kern, aber zwei
// voellig verschiedene Huellen. Beide laufen darum durch DENSELBEN Ablauf,
// angesprochen ueber einen einheitlichen Messzugang `window.__tf`.
//
// ZEHN BEHAUPTUNGEN, die hier bewiesen werden:
//
//   a) Eine Tuer wird gesetzt und steht danach im MODELL und als
//      WANDUNTERBRECHUNG im BILD. GEGENPROBE: ein Klick neben jede Wand setzt
//      nichts.
//   b) Sie ueberlebt Rueckgaengig + Wiederholen an DERSELBEN Wand mit
//      DERSELBEN Lage. GEGENPROBE: EIN Rueckgaengig direkt nach dem Setzen
//      entfernt sie wieder (der ganze Vorgang ist EIN Schritt).
//   c) Wird die Wand verschoben, bleiben Wand-Kennung und Lage unveraendert.
//      GEGENPROBE: das Bild hat sich dabei wirklich geaendert — sonst maesse
//      die Pruefung nur Stillstand.
//   d) DIE HAERTESTE: wird die Wand GETEILT, liegt die Oeffnung danach auf der
//      Haelfte, die sie geometrisch enthaelt. GEGENPROBE: mit abgeschalteter
//      Versoehnung MUSS dieselbe Pruefung FEHLSCHLAGEN. Ein Waechter, der nie
//      rot wird, ist kein Waechter.
//   e) Wird die Wand GELOESCHT, gilt die Oeffnung als verwaist, wird nicht
//      gezeichnet und NICHT still entsorgt. GEGENPROBE: die Nachbarwand
//      behaelt ihre.
//   f) Die Axonometrie laesst die Wand ueber der Oeffnung weg (Flaeche sinkt um
//      lichte Weite mal Wanddicke) und zeigt ein anderes Bild. GEGENPROBE:
//      ohne Aenderung bleibt die ruhende Pruefsumme identisch.
//   g) Zwei Oeffnungen duerfen sich nicht ueberlappen — das Setzen wird
//      abgelehnt. GEGENPROBE: einen Zentimeter jenseits der Grenze wird
//      angenommen.
//   h) Eine alte Datei (Fassung 1 UND 2) laedt weiter, 76 Ecken / 100 Waende.
//      GEGENPROBE: Fassung 4 wird abgelehnt und der offene Plan bleibt
//      unversehrt.
//   i) Loeschen ueber Verweilen entfernt sie und meldet `true`. GEGENPROBE:
//      Abbrechen entfernt nichts.
//   j) Die Blattkopf-Zeile erscheint bei M > 0 und verschwindet bei M = 0
//      (nur in der Doppelklick-Datei — nur sie hat ein Blatt).
//
// NIE page.click IN DEN 2D-ZEICHNER: die Zeichenschleife laesst die Seite nie
// idle werden, ein wartender Klick liefe in den Timeout, OBWOHL er wirkt. Alle
// Zeiger-Ereignisse gehen ueber `dispatchEvent`.
//
// VOR JEDER PIXEL-MESSUNG faehrt der Zeiger weg: Hervorhebung und
// Geister-Oeffnung faerben sonst genau die Linien ein, die gleich gezaehlt
// werden.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { werkstattAufschliessen } from './werkstatt-auf.mjs'

const PW_STANDARD = 'file:///C:/Users/dania/.gemini/node_modules/playwright/index.js'
const { chromium } = (await import(process.env.PLAYWRIGHT_PFAD || PW_STANDARD)).default

const HIER = path.dirname(fileURLToPath(import.meta.url))
const WURZEL = path.resolve(HIER, '..')

const arg = (name, standard) => {
  const i = process.argv.indexOf(name)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : standard
}
const PORT = arg('--port', '3301')
const PLAN = arg('--plan', 'halle400')
const NUR = arg('--nur', '')
const DATEI = path.resolve(WURZEL, arg('--datei', 'Halle400-Modell.html'))

const planRoh = fs.readFileSync(path.join(WURZEL, 'app/public/plaene', `${PLAN}.json`), 'utf8')
const planObjekt = JSON.parse(planRoh)
const SOLL_ECKEN = Object.keys(planObjekt.floorplan.corners).length
const SOLL_WAENDE = planObjekt.floorplan.walls.length

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'h400-tueren-'))
const BERICHT = path.join(DIR, 'bericht.txt')
fs.writeFileSync(BERICHT, '')
const log = (s) => {
  console.log(s)
  fs.appendFileSync(BERICHT, s + '\n')
}
const fehler = []
let welt = ''
const pruefe = (bedingung, text) => {
  log(`${bedingung ? 'OK  ' : 'FEHL'} [${welt}] ${text}`)
  if (!bedingung) fehler.push(`[${welt}] ${text}`)
}

/* ── Der gemeinsame Messzugang ────────────────────────────────────────────
   Wird in BEIDE Welten eingespielt und bietet dort dieselben Namen. Der ganze
   Pruefablauf unten ist dadurch buchstabengleich und kann nicht heimlich
   zweierlei messen. */
const MESSZUGANG = `(function(){
  // Die drei Farben, die hier auseinandergehalten werden muessen. Sie stammen
  // aus floorplanner_view.ts und sind BEWUSST verschieden gewaehlt:
  //   Wandlinie  #dddddd  neutralgrau, hell
  //   Wandkante  #888888  neutralgrau, mittel
  //   Oeffnung   #3f6757  gruenstichig (g-r = 40)
  // Eine Oeffnung in einem der Grautoene waere weder fuer das Auge noch fuer
  // diese Messung von der Wand zu trennen.
  window.__tf.FARBE = { wand: [221,221,221], kante: [136,136,136], oeffnung: [63,103,87] };

  window.__tf.canvas = function(){ return document.getElementById(window.__tf.canvasId); };

  window.__tf.maus = function(typ, x, y){
    const c = window.__tf.canvas();
    const r = c.getBoundingClientRect();
    c.dispatchEvent(new MouseEvent(typ, { bubbles: true, clientX: r.left + x, clientY: r.top + y }));
  };
  window.__tf.zeigerWeg = function(){ window.__tf.maus('mousemove', 3, 3); };

  /** Kasten von +- randCm um einen WELT-Punkt, in Bildkoordinaten. */
  window.__tf.kasten = function(x, y, randCm){
    const p = window.__tf.aufBild(x, y);
    const r = randCm * window.__tf.proCm();
    return { x0: p.x - r, y0: p.y - r, x1: p.x + r, y1: p.y + r };
  };

  /**
   * Tinte in einem Kasten ENTLANG DER WANDACHSE — nicht achsenparallel.
   *
   * NOETIG, GEMESSEN: ein achsenparalleles Quadrat von +-35 cm um die
   * Oeffnungsmitte reicht bei einer schraegen Wand bis zu 49 cm WEIT die Wand
   * entlang und erfasst damit Wandlinie JENSEITS der Laibung. Der erste Lauf
   * dieses Gates meldete darum "Wandlinie nur von 42 auf 27 gesunken" und
   * verdaechtigte den Zeichner, obwohl die Messung schief war.
   *
   * @param halbL halbe Ausdehnung ENTLANG der Wand (cm)
   * @param halbQ halbe Ausdehnung QUER dazu (cm)
   */
  window.__tf.tinteEntlang = function(mx, my, ex, ey, halbL, halbQ, farbe, tol){
    const c = window.__tf.canvas();
    const proCm = window.__tf.proCm();
    const a0 = window.__tf.aufBild(0, 0);
    const ecken = [];
    for (const sl of [-1, 1]) for (const sq of [-1, 1]) {
      ecken.push(window.__tf.aufBild(mx + ex * halbL * sl - ey * halbQ * sq,
                                     my + ey * halbL * sl + ex * halbQ * sq));
    }
    const x0 = Math.max(0, Math.floor(Math.min.apply(null, ecken.map(function(p){ return p.x; }))));
    const y0 = Math.max(0, Math.floor(Math.min.apply(null, ecken.map(function(p){ return p.y; }))));
    const x1 = Math.min(c.width, Math.ceil(Math.max.apply(null, ecken.map(function(p){ return p.x; }))));
    const y1 = Math.min(c.height, Math.ceil(Math.max.apply(null, ecken.map(function(p){ return p.y; }))));
    if (x1 - x0 < 2 || y1 - y0 < 2) return -1;
    const d = c.getContext('2d').getImageData(x0, y0, x1 - x0, y1 - y0).data;
    const b = x1 - x0;
    var n = 0;
    for (var i = 0; i < d.length; i += 4) {
      if (d[i + 3] <= 10) continue;
      if (Math.abs(d[i] - farbe[0]) > tol || Math.abs(d[i+1] - farbe[1]) > tol || Math.abs(d[i+2] - farbe[2]) > tol) continue;
      const p = i / 4;
      const wx = (x0 + (p % b) - a0.x) / proCm;
      const wy = (y0 + Math.floor(p / b) - a0.y) / proCm;
      const dl = (wx - mx) * ex + (wy - my) * ey;
      const dq = -(wx - mx) * ey + (wy - my) * ex;
      if (Math.abs(dl) <= halbL && Math.abs(dq) <= halbQ) n++;
    }
    return n;
  };

  /**
   * Bildpunkte mit GRUENSTICH in einem Ausschnitt — die Handschrift der
   * Oeffnungsfarbe #3f6757.
   *
   * Warum nicht auf die exakte Farbe gemessen wird: Blatt und Aufschlagbogen
   * sind EIN Bildpunkt breit und laufen schraeg. Ein schraeger 1-px-Strich
   * besteht fast nur aus Mischfarben zwischen Linie und Untergrund — der
   * dritte Lauf dieses Gates fand von rund 110 gezeichneten Bildpunkten ganze
   * 6 in der reinen Farbe und meldete den Zeichner zu Unrecht rot. Der
   * FARBSTICH ueberlebt die Mischung dagegen: Wandgrau ist r=g=b, die
   * Ausstattung blaustichig (b > r), die Oeffnung gruenstichig (g > r UND
   * g > b). Das ist genau der Unterschied, fuer den die Farbe gewaehlt wurde.
   */
  window.__tf.zaehleGruenstich = function(k){
    const c = window.__tf.canvas();
    const x0 = Math.max(0, Math.round(k.x0)), y0 = Math.max(0, Math.round(k.y0));
    const x1 = Math.min(c.width, Math.round(k.x1)), y1 = Math.min(c.height, Math.round(k.y1));
    if (x1 - x0 < 3 || y1 - y0 < 3) return -1;
    const d = c.getContext('2d').getImageData(x0, y0, x1 - x0, y1 - y0).data;
    var n = 0;
    for (var i = 0; i < d.length; i += 4) {
      if (d[i + 3] <= 10) continue;
      if (d[i + 1] - d[i] >= 12 && d[i + 1] - d[i + 2] >= 5) n++;
    }
    return n;
  };

  /** Einheitsvektor einer Wand. */
  window.__tf.richtung = function(w){
    const l = window.__tf.laenge(w);
    return { ex: (w.wbx - w.wax) / l, ey: (w.wby - w.way) / l };
  };

  /** Wie oft kommt eine Farbe in einem Ausschnitt vor? */
  window.__tf.zaehleFarbe = function(k, farbe, tol){
    const c = window.__tf.canvas();
    const x0 = Math.max(0, Math.round(k.x0)), y0 = Math.max(0, Math.round(k.y0));
    const x1 = Math.min(c.width, Math.round(k.x1)), y1 = Math.min(c.height, Math.round(k.y1));
    if (x1 - x0 < 3 || y1 - y0 < 3) return -1;
    const d = c.getContext('2d').getImageData(x0, y0, x1 - x0, y1 - y0).data;
    var n = 0;
    for (var i = 0; i < d.length; i += 4) {
      if (d[i + 3] <= 10) continue;
      if (Math.abs(d[i] - farbe[0]) <= tol && Math.abs(d[i+1] - farbe[1]) <= tol && Math.abs(d[i+2] - farbe[2]) <= tol) n++;
    }
    return n;
  };

  /** Pruefsumme des ganzen Grundriss-Bildes. */
  window.__tf.bildSumme = function(){
    const c = window.__tf.canvas();
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    var s = 2166136261;
    for (var i = 0; i < d.length; i += 16) {
      s ^= (d[i] + d[i+1] * 3 + d[i+2] * 7 + d[i+3] * 11) & 255;
      s = Math.imul(s, 16777619);
    }
    return s >>> 0;
  };

  /** Punkt auf einer Wand, \`t\` als Bruchteil von Start nach Ende (Weltmass). */
  window.__tf.punktAuf = function(w, t){
    return { x: w.wax + (w.wbx - w.wax) * t, y: w.way + (w.wby - w.way) * t };
  };

  /** Laenge einer Wand in cm. */
  window.__tf.laenge = function(w){ return Math.hypot(w.wbx - w.wax, w.wby - w.way); };

  /** Kuerzester Abstand eines Weltpunkts zu einer Wand-STRECKE. */
  window.__tf.abstandZu = function(x, y, w){
    const dx = w.wbx - w.wax, dy = w.wby - w.way;
    const l2 = dx * dx + dy * dy;
    if (!l2) return Infinity;
    var t = ((x - w.wax) * dx + (y - w.way) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(x - (w.wax + dx * t), y - (w.way + dy * t));
  };

  /** Abstand zur naechsten Wand AUSSER der genannten. */
  window.__tf.freiRaum = function(x, y, ausserId){
    var min = Infinity;
    window.__tf.waende().forEach(function(w){
      if (w.id === ausserId) return;
      const d = window.__tf.abstandZu(x, y, w);
      if (d < min) min = d;
    });
    return min;
  };
})();`

/* ── Welt 1: der Planer ───────────────────────────────────────────────── */
const ADAPTER_PLANER = `(function(){
  const b = window.__planer;
  const fp = b.model.floorplan;
  const z = b.floorplanner;
  const abbild = function(o){
    const g = fp.oeffnungsGeometrie(o);
    return { id: o.id, wandId: o.wandId, lage: o.lage, breite: o.breite, art: o.art,
             seite: o.seite, anschlag: o.anschlag, bruestung: o.bruestung,
             quelle: o.quelle, verwaist: !!o.verwaist,
             anker: { x: o.anker.x, y: o.anker.y },
             wx: g ? g.mx : null, wy: g ? g.my : null,
             bx: g ? z.convertX(g.mx) : null, by: g ? z.convertY(g.my) : null };
  };
  window.__tf = {
    canvasId: 'floorplanner-canvas',
    welt: 'Planer',
    oeffnungen: function(){ return fp.getOeffnungen().map(abbild); },
    oeffnung: function(id){ const o = fp.findeOeffnung(id); return o ? abbild(o) : null; },
    oeffnungsGeist: function(){
      const g = z.geistOeffnung;
      return g ? { wandId: g.wandId, lage: g.lage, breite: g.breite, art: g.art,
                   seite: g.seite, anschlag: g.anschlag, passt: g.passt } : null;
    },
    oeffnungsArt: function(){ return z.oeffnungsArt; },
    setzeOeffnungsArt: function(a){ z.setzeOeffnungsArt(a); },
    oeffnungPasst: function(w, l, br){ return fp.oeffnungPasst(w, l, br); },
    versoehnung: function(an){ fp.versoehnungAn = an; },
    waende: function(){
      return fp.getWalls().map(function(w){
        const a = w.getStart(), e = w.getEnd();
        return { id: w.id, dicke: w.thickness, wax: a.x, way: a.y, wbx: e.x, wby: e.y };
      });
    },
    zahlen: function(){
      return { ecken: fp.getCorners().length, waende: fp.getWalls().length,
               oeffnungen: fp.getOeffnungen().length };
    },
    /* Wand teilen: GENAU die beiden Aufrufe, die \`mouseup\` im Zeichnen-Werkzeug
       macht — samt Schnappschuss davor, damit ein Rueckgaengig sie zuruecknimmt. */
    wandTeilenAn: function(x, y){
      b.undo.snapshot();
      const c = fp.newCorner(x, y);
      return { geteilt: c.mergeWithIntersected(), waende: fp.getWalls().length };
    },
    wandVerschieben: function(id, dx, dy){
      const w = fp.getWalls().find(function(v){ return v.id === id; });
      if (!w) return false;
      w.relativeMove(dx, dy);
      return true;
    },
    wandLoeschen: function(id){
      const w = fp.getWalls().find(function(v){ return v.id === id; });
      if (!w) return false;
      b.undo.snapshot();
      w.remove();
      fp.update();
      return true;
    },
    neuZeichnen: function(){ z.resizeView(); },
    ladeDatei: function(roh){
      const d = JSON.parse(roh);
      try {
        fp.loadFloorplan(d.floorplan || d);
        return { ecken: fp.getCorners().length, waende: fp.getWalls().length };
      } catch (e) { return { fehler: String(e && e.message ? e.message : e) }; }
    },
    aufBild: function(x, y){ return { x: z.convertX(x), y: z.convertY(y) }; },
    proCm: function(){ return z.pixelProCm(); },
    zoomeAufPunkt: function(f, bx, by){ z.zoomeAufPunkt(f, bx, by); },
    treffer: function(){
      return { oeffnung: z.activeOeffnung,
               ausstattung: z.activeAusstattung,
               wand: z.activeWall ? z.activeWall.id : null,
               ecke: z.activeCorner ? z.activeCorner.id : null };
    },
    werkzeug: function(){ return z.mode; },
    setzeWerkzeug: function(m){ z.setMode(m); },
    einrasten: function(){ return z.istEinrasten(); },
    setzeEinrasten: function(an){ z.setzeEinrasten(an); },
    zeigerStil: function(){ return document.getElementById('floorplanner-canvas').style.cursor; },
    taste: function(k){
      document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true }));
    },
    undoJetzt: function(){ b.undo.undo(); },
    redoJetzt: function(){ b.undo.redo(); },
    kannZurueck: function(){ return b.undo.canUndo(); },
    kannVor: function(){ return b.undo.canRedo(); },
    loeschKandidat: function(){
      const k = z.loeschKandidat;
      return k ? { art: k.art, beschreibung: k.beschreibung, kennung: k.kennung || null } : null;
    },
    loeschungBestaetigen: function(){ return z.loeschungBestaetigen(); },
    loeschungAbbrechen: function(){ z.loeschungAbbrechen(); },
    szeneWaende: function(){ return null; },   // die Axonometrie misst Welt 2
    axoNeuBauen: function(){},
    oeffnungText: function(){ return undefined; }
  };
})();`

/* ── Welt 2: die Doppelklick-Datei ────────────────────────────────────── */
const ADAPTER_DATEI = `(function(){
  const d = window.__planerDatei;
  window.__tf = {
    canvasId: 'grundriss-canvas',
    welt: 'Datei',
    oeffnungen: d.oeffnungen, oeffnung: d.oeffnung, oeffnungsGeist: d.oeffnungsGeist,
    oeffnungsArt: d.oeffnungsArt, setzeOeffnungsArt: d.setzeOeffnungsArt,
    oeffnungPasst: d.oeffnungPasst, versoehnung: d.versoehnung,
    waende: d.waende, zahlen: d.zahlen,
    wandTeilenAn: d.wandTeilenAn, wandVerschieben: d.wandVerschieben,
    wandLoeschen: d.wandLoeschen, ladeDatei: d.ladeDatei, neuZeichnen: d.neuZeichnen,
    aufBild: d.aufBild, proCm: d.proCm, zoomeAufPunkt: d.zoomeAufPunkt,
    treffer: d.treffer, werkzeug: d.werkzeug, setzeWerkzeug: d.setzeWerkzeug,
    einrasten: d.einrasten, setzeEinrasten: d.setzeEinrasten,
    zeigerStil: d.zeigerStil, taste: d.taste,
    undoJetzt: d.undoJetzt, redoJetzt: d.redoJetzt,
    kannZurueck: d.kannZurueck, kannVor: d.kannVor,
    loeschKandidat: d.loeschKandidat, loeschungBestaetigen: d.loeschungBestaetigen,
    loeschungAbbrechen: d.loeschungAbbrechen,
    szeneWaende: d.szeneWaende, axoNeuBauen: d.axoNeuBauen,
    oeffnungText: d.oeffnungText
  };
})();`

/* ══════════════════════════════════════════════════════════════════════
   DER PRUEFABLAUF — buchstabengleich fuer beide Welten
   ══════════════════════════════════════════════════════════════════════ */

const OEFFNUNG = 3 // floorplannerModes.OEFFNUNG
const LOESCHEN = 2
const VERSCHIEBEN = 0

const schlaf = (p, ms) => p.waitForTimeout(ms)
const zeigerWeg = async (p) => {
  await p.evaluate(() => window.__tf.zeigerWeg())
  await schlaf(p, 90)
}

/** Zeiger an einen WELT-Punkt fahren und dort klicken. */
const klickeAuf = async (page, welt) => {
  await page.evaluate((w) => {
    const p = window.__tf.aufBild(w.x, w.y)
    window.__tf.maus('mousemove', p.x, p.y)
    window.__tf.maus('mousedown', p.x, p.y)
    window.__tf.maus('mouseup', p.x, p.y)
  }, welt)
  await schlaf(page, 200)
}

/**
 * Sucht eine Wand, die sich fuer die Messungen eignet: lang genug fuer zwei
 * Oeffnungen, frei von Nachbarwaenden in der Mitte (sonst raste die Versoehnung
 * eine verwaiste Tuer auf die Nachbarin um) und im Bild sichtbar.
 */
const WAND_SUCHE = `(function(mindestLaenge, freiCm){
  const c = window.__tf.canvas();
  const waende = window.__tf.waende()
    .map(function(w){ return Object.assign({}, w, { laenge: window.__tf.laenge(w) }); })
    .filter(function(w){ return w.laenge >= mindestLaenge; })
    .sort(function(a, b){ return b.laenge - a.laenge; });
  for (const w of waende) {
    const m = window.__tf.punktAuf(w, 0.5);
    if (window.__tf.freiRaum(m.x, m.y, w.id) < freiCm) continue;
    // Auf die Wandmitte zoomen, damit ein 87,5-cm-Blatt im Bild messbar gross
    // ist: in der Uebersicht (0,045 px/cm) waeren es vier Bildpunkte.
    const vor = window.__tf.aufBild(m.x, m.y);
    window.__tf.zoomeAufPunkt(0.9, c.width / 2, c.height / 2);
    const p0 = window.__tf.aufBild(w.wax, w.way);
    const p1 = window.__tf.aufBild(w.wbx, w.wby);
    const drin = function(q){ return q.x > 120 && q.y > 120 && q.x < c.width - 120 && q.y < c.height - 120; };
    void vor;
    if (!drin(p0) || !drin(p1)) continue;
    return w;
  }
  return null;
})`

async function pruefeWelt(page, name, hilfen) {
  welt = name
  const bild = (n) => path.join(DIR, `${name}_${n}.png`)

  /* ══ Aufstellung ═══════════════════════════════════════════════════ */
  await page.evaluate(() => window.__tf.setzeWerkzeug(3))
  const werkzeugAn = await page.evaluate(() => window.__tf.werkzeug())
  pruefe(werkzeugAn === OEFFNUNG, `Werkzeug „Türen & Fenster" laesst sich greifen (mode ${werkzeugAn})`)

  const wand = await page.evaluate(`${WAND_SUCHE}(400, 120)`)
  pruefe(wand !== null, 'Aufstellung: eine lange, freistehende Wand im Bild gefunden')
  if (!wand) {
    log('ABBRUCH dieser Welt: ohne Wand waere alles Weitere Raten.')
    return
  }
  const geo = await page.evaluate(() => ({
    proCm: window.__tf.proCm(),
    zahlen: window.__tf.zahlen()
  }))
  log(
    `     Wand "${wand.id}": ${wand.laenge.toFixed(0)} cm lang, ${wand.dicke} cm dick · ` +
      `Massstab ${geo.proCm.toFixed(3)} px/cm · ${geo.zahlen.ecken} Ecken, ${geo.zahlen.waende} Waende`
  )

  /* ══ f) GEGENPROBE ZUERST: ohne Aenderung ruht das Bild ════════════ */
  await zeigerWeg(page)
  const bildA = await page.evaluate(() => window.__tf.bildSumme())
  await schlaf(page, 250)
  const bildB = await page.evaluate(() => window.__tf.bildSumme())
  pruefe(bildA === bildB, `f) GEGENPROBE: ohne Aenderung bleibt das Bild identisch (${bildA} -> ${bildB})`)

  /* ══ a) GEGENPROBE: neben jeder Wand entsteht nichts ═══════════════ */
  const frei = await page.evaluate(() => {
    const c = window.__tf.canvas()
    const proCm = window.__tf.proCm()
    const a0 = window.__tf.aufBild(0, 0)
    for (let by = 140; by < c.height - 140; by += 30) {
      for (let bx = 140; bx < c.width - 260; bx += 30) {
        const wx = (bx - a0.x) / proCm
        const wy = (by - a0.y) / proCm
        if (window.__tf.freiRaum(wx, wy, null) < 250) continue
        return { x: wx, y: wy, bx, by }
      }
    }
    return null
  })
  pruefe(frei !== null, 'a) GEGENPROBE: ein Punkt weit ab von jeder Wand gefunden')
  if (frei) {
    const vorher = await page.evaluate(() => window.__tf.oeffnungen().length)
    await klickeAuf(page, frei)
    const nachher = await page.evaluate(() => ({
      zahl: window.__tf.oeffnungen().length,
      geist: window.__tf.oeffnungsGeist()
    }))
    pruefe(
      nachher.geist === null,
      `a) GEGENPROBE: neben jeder Wand wird keine Oeffnung angeboten (Geist ${JSON.stringify(nachher.geist)})`
    )
    pruefe(
      nachher.zahl === vorher,
      `a) GEGENPROBE: und ein Klick dort setzt nichts (${vorher} -> ${nachher.zahl})`
    )
  }

  /* ══ a) DIE TUER ══════════════════════════════════════════════════ */
  await page.evaluate(() => window.__tf.setzeOeffnungsArt('tuer'))
  const mitte = await page.evaluate((w) => window.__tf.punktAuf(w, 0.5), wand)

  // GESETZT wird bewusst NICHT in der Wandmitte, obwohl der Geist genau dort
  // einrastet: an der Wandmitte steht die MASSANGABE der Wand, schwarz auf
  // einem 4 px breiten weissen Halo (`drawEdgeLabel`). Der Halo loescht die
  // Wandlinie dort, und die Schrift liefert antialiasierte Graustufen, die von
  // #dddddd nicht zu trennen sind — der zweite und dritte Lauf dieses Gates
  // massen genau das und meldeten den Zeichner zu Unrecht rot. Gemessen wird
  // deshalb bei 30 % der Wandlaenge, weit weg von der Beschriftung.
  const setzOrt = await page.evaluate((w) => window.__tf.punktAuf(w, 0.3), wand)

  // ZWEI Messungen mit zwei Kaesten, und zwar bewusst verschieden gross:
  //
  //   Wandlinie  ENTLANG der Wand, etwas SCHMALER als die lichte Weite (0,35
  //              der Breite) — sonst zaehlte die heile Wand jenseits der
  //              Laibung mit und der Rueckgang verschwaende im Rauschen. QUER
  //              nur ein SCHMALES Band um die Achse: die Massangabe der Wand
  //              steht rund 6 cm daneben, ist schwarz auf weiss und liefert
  //              antialiasierte Graustufen, die von #dddddd nicht zu trennen
  //              sind. Der zweite Lauf dieses Gates meldete deshalb "29 -> 15
  //              statt 0" — die 15 waren Schrift, nicht Wand.
  //   Blatt      ein WEITER Kasten (1,2 mal die Breite): das Blatt steht
  //              senkrecht zur Wand und der Aufschlagbogen reicht eine volle
  //              lichte Weite hinaus. Im schmalen Kasten laege von der Tuer
  //              nichts als die weisse Fuellung.
  const messung = `(function(w, m, breite){
    const r = window.__tf.richtung(w);
    return {
      wand: window.__tf.tinteEntlang(m.x, m.y, r.ex, r.ey, breite * 0.35,
              Math.max(2, 1.5 / window.__tf.proCm()), window.__tf.FARBE.wand, 12),
      oeffnung: window.__tf.zaehleGruenstich(window.__tf.kasten(m.x, m.y, breite * 1.2))
    };
  })`
  await zeigerWeg(page)
  const tinteVor = await page.evaluate(
    (a) => eval(a.fn)(a.w, a.m, a.breite),
    { fn: messung, w: wand, m: setzOrt, breite: 87.5 }
  )
  await page.screenshot({ path: bild('A_vor_der_tuer') })

  // Zeiger auf die Wandmitte: der Geist muss DIESE Wand anbieten und dort
  // einrasten — das ist die Einrast-Zusage, gemessen ohne etwas zu setzen.
  await page.evaluate((m) => {
    const p = window.__tf.aufBild(m.x, m.y)
    window.__tf.maus('mousemove', p.x, p.y)
  }, mitte)
  await schlaf(page, 150)
  const geist = await page.evaluate(() => window.__tf.oeffnungsGeist())
  pruefe(
    geist !== null && geist.wandId === wand.id,
    `a) der Geist bietet die Oeffnung auf DIESER Wand an (${geist ? geist.wandId : 'null'} vs. ${wand.id})`
  )
  pruefe(
    geist !== null && Math.abs(geist.lage - wand.laenge / 2) < 3,
    `a) und rastet auf die Wandmitte ein (${geist ? geist.lage.toFixed(1) : '?'} cm von ${(wand.laenge / 2).toFixed(1)})`
  )

  await klickeAuf(page, setzOrt)
  const gesetzt = await page.evaluate(() => window.__tf.oeffnungen())
  const tuer = gesetzt.find((o) => o.wandId === wand.id) || null
  pruefe(tuer !== null, `a) im MODELL steht jetzt eine Oeffnung an dieser Wand (${gesetzt.length} gesamt)`)
  if (!tuer) {
    log('ABBRUCH dieser Welt: ohne gesetzte Tuer waere alles Weitere Raten.')
    return
  }
  log(
    `     gesetzt: ${tuer.art} "${tuer.id}" bei Lage ${tuer.lage.toFixed(1)} cm, ` +
      `${tuer.breite} cm weit, Anker (${tuer.anker.x.toFixed(0)}, ${tuer.anker.y.toFixed(0)}), Quelle ${tuer.quelle}`
  )
  pruefe(tuer.quelle === 'gesetzt', `a) sie gilt als frei GESETZT, nicht als Aufmass (${tuer.quelle})`)

  await zeigerWeg(page)
  const tinteNach = await page.evaluate(
    (a) => eval(a.fn)(a.w, a.m, a.breite),
    { fn: messung, w: wand, m: { x: tuer.wx, y: tuer.wy }, breite: tuer.breite }
  )
  await page.screenshot({ path: bild('B_mit_tuer') })
  log(
    `     Bild an der Tuer: Wandlinie ${tinteVor.wand} -> ${tinteNach.wand} Bildpunkte, ` +
      `Oeffnungsfarbe ${tinteVor.oeffnung} -> ${tinteNach.oeffnung}`
  )
  pruefe(
    tinteVor.wand > 20 && tinteNach.wand === 0,
    `a) im BILD ist die Wandlinie VOLLSTAENDIG unterbrochen (${tinteVor.wand} -> ${tinteNach.wand} Bildpunkte)`
  )
  // Der Zuwachs zaehlt, nicht der absolute Wert: im Kasten koennte eine
  // Pflanze stehen (auch gruenstichig). Ein ZUWACHS um mehr als 40 Bildpunkte
  // kann von nichts anderem kommen als von dem, was gerade entstanden ist.
  pruefe(
    tinteNach.oeffnung - tinteVor.oeffnung > 40,
    `a) und Blatt + Bogen sind wirklich gezeichnet (${tinteVor.oeffnung} -> ${tinteNach.oeffnung} gruenstichige Bildpunkte)`
  )

  /* ══ Q und E wenden ══════════════════════════════════════════════ */
  const gewendet = await page.evaluate((a) => {
    const p = window.__tf.aufBild(a.m.x, a.m.y)
    window.__tf.maus('mousemove', p.x, p.y)
    const vorher = window.__tf.oeffnung(a.id)
    window.__tf.taste('q')
    const nachQ = window.__tf.oeffnung(a.id)
    window.__tf.taste('e')
    const nachE = window.__tf.oeffnung(a.id)
    window.__tf.taste('x')
    const nachX = window.__tf.oeffnung(a.id)
    return { vorher, nachQ, nachE, nachX }
  }, { m: { x: tuer.wx, y: tuer.wy }, id: tuer.id })
  pruefe(
    gewendet.nachQ.anschlag !== gewendet.vorher.anschlag,
    `a) „Q" wendet den Anschlag (${gewendet.vorher.anschlag} -> ${gewendet.nachQ.anschlag})`
  )
  pruefe(
    gewendet.nachE.seite !== gewendet.nachQ.seite,
    `a) „E" wendet die Aufschlagseite (${gewendet.nachQ.seite} -> ${gewendet.nachE.seite})`
  )
  pruefe(
    gewendet.nachX.seite === gewendet.nachE.seite &&
      gewendet.nachX.anschlag === gewendet.nachE.anschlag,
    'a) GEGENPROBE: eine andere Taste wendet nichts'
  )

  /* ══ g) Ueberlappung ═════════════════════════════════════════════ */
  const grenze = await page.evaluate((a) => {
    // DIESELBE Vorschrift, die das Setzen benutzt — an der Grenze auf den
    // Zentimeter genau messbar, was ein Zeiger nie waere.
    const b = a.breite
    // Mindestabstand 5 cm zwischen zwei Oeffnungen (OEFFNUNG_MINDESTABSTAND_CM)
    const knapp = a.lage + b + 4
    const gerade = a.lage + b + 6
    return {
      drauf: window.__tf.oeffnungPasst(a.wandId, a.lage, b),
      knapp: window.__tf.oeffnungPasst(a.wandId, knapp, b),
      gerade: window.__tf.oeffnungPasst(a.wandId, gerade, b),
      knappCm: knapp, geradeCm: gerade
    }
  }, { wandId: tuer.wandId, lage: tuer.lage, breite: tuer.breite })
  pruefe(!grenze.drauf, 'g) eine zweite Oeffnung EXAKT auf der ersten wird abgelehnt')
  pruefe(
    !grenze.knapp,
    `g) auch einen Zentimeter DIESSEITS der Grenze (Lage ${grenze.knappCm.toFixed(1)} cm)`
  )
  pruefe(
    grenze.gerade,
    `g) GEGENPROBE: einen Zentimeter JENSEITS der Grenze wird angenommen (Lage ${grenze.geradeCm.toFixed(1)} cm)`
  )
  // Und derselbe Fall end-to-end: der Geist muss ROT anbieten und der Klick
  // darf nichts erzeugen.
  const zweiterKlick = await page.evaluate(async (m) => {
    const p = window.__tf.aufBild(m.x, m.y)
    window.__tf.maus('mousemove', p.x, p.y)
    const geist = window.__tf.oeffnungsGeist()
    const vorher = window.__tf.oeffnungen().length
    window.__tf.maus('mousedown', p.x, p.y)
    window.__tf.maus('mouseup', p.x, p.y)
    return { geist, vorher, nachher: window.__tf.oeffnungen().length }
  }, { x: tuer.wx, y: tuer.wy })
  pruefe(
    zweiterKlick.geist !== null && zweiterKlick.geist.passt === false,
    `g) der Geist zeigt an dieser Stelle „passt nicht" (${JSON.stringify(zweiterKlick.geist && zweiterKlick.geist.passt)})`
  )
  pruefe(
    zweiterKlick.nachher === zweiterKlick.vorher,
    `g) und der Klick erzeugt nichts (${zweiterKlick.vorher} -> ${zweiterKlick.nachher})`
  )

  /* ══ b) Rueckgaengig + Wiederholen ═══════════════════════════════ */
  await zeigerWeg(page)
  const historie = await page.evaluate(async (id) => {
    const vorher = window.__tf.oeffnung(id)
    const konnte = window.__tf.kannZurueck()
    // Das Wenden mit Q/E waren eigene Schritte — bis zum Verschwinden der Tuer
    // zuruecknehmen, hoechstens fuenfmal (sonst liefe eine kaputte Historie hier
    // in eine Endlosschleife).
    let schritte = 0
    while (window.__tf.oeffnung(id) !== null && schritte < 5) {
      window.__tf.undoJetzt()
      schritte++
    }
    const weg = window.__tf.oeffnung(id)
    window.__tf.redoJetzt()
    const zurueck = window.__tf.oeffnung(id)
    return { vorher, konnte, schritte, weg, zurueck }
  }, tuer.id)
  await schlaf(page, 400)
  pruefe(historie.konnte === true, 'b) es gibt etwas zurueckzunehmen')
  pruefe(
    historie.weg === null,
    `b) GEGENPROBE: Rueckgaengig entfernt die Tuer wieder (nach ${historie.schritte} Schritten)`
  )
  pruefe(
    historie.zurueck !== null && historie.zurueck.wandId === wand.id,
    `b) Wiederholen bringt sie an DERSELBEN Wand zurueck (${historie.zurueck ? historie.zurueck.wandId : 'null'})`
  )
  pruefe(
    historie.zurueck !== null && Math.abs(historie.zurueck.lage - historie.vorher.lage) < 0.01,
    `b) mit DERSELBEN Lage (${historie.zurueck ? historie.zurueck.lage.toFixed(2) : '?'} vs. ${historie.vorher.lage.toFixed(2)} cm)`
  )
  pruefe(
    historie.zurueck !== null && historie.zurueck.id === tuer.id,
    `b) und unter DERSELBEN Kennung auffindbar ("${tuer.id}")`
  )

  /* ══ c) Die Wand verschieben ═════════════════════════════════════ */
  const verschoben = await page.evaluate(
    async (a) => {
      const vorher = window.__tf.oeffnung(a.id)
      const bildVorher = window.__tf.bildSumme()
      // Quer zur Wand — eine Verschiebung LAENGS liesse die Wand auf sich
      // selbst liegen und bewiese nichts.
      const w = window.__tf.waende().find(function(v){ return v.id === a.wandId; })
      const l = window.__tf.laenge(w)
      const nx = -(w.wby - w.way) / l, ny = (w.wbx - w.wax) / l
      window.__tf.wandVerschieben(a.wandId, nx * a.weite, ny * a.weite)
      // Neu zeichnen MUSS sein: `relativeMove` aendert das Modell, der
      // Zeichner malt aber bei Zeiger-Ereignissen. Ohne diese Zeile laese die
      // Pruefsumme unten das Bild von VORHER und meldete "nichts geaendert".
      window.__tf.neuZeichnen()
      return {
        vorher,
        bildVorher,
        nachher: window.__tf.oeffnung(a.id),
        bildNachher: window.__tf.bildSumme(),
        wandDa: window.__tf.waende().some(function(v){ return v.id === a.wandId; })
      }
    },
    { id: tuer.id, wandId: wand.id, weite: 200 }
  )
  await schlaf(page, 300)
  pruefe(
    verschoben.wandDa && verschoben.nachher !== null,
    'c) die Wand gibt es nach dem Verschieben noch, und die Tuer haengt daran'
  )
  pruefe(
    verschoben.nachher !== null && verschoben.nachher.wandId === wand.id,
    `c) die Wand-Kennung ist unveraendert ("${verschoben.nachher ? verschoben.nachher.wandId : '?'}")`
  )
  pruefe(
    verschoben.nachher !== null && Math.abs(verschoben.nachher.lage - verschoben.vorher.lage) < 0.01,
    `c) und die Lage auch (${verschoben.nachher ? verschoben.nachher.lage.toFixed(2) : '?'} cm)`
  )
  pruefe(
    verschoben.bildVorher !== verschoben.bildNachher,
    `c) GEGENPROBE: das Bild hat sich dabei WIRKLICH geaendert (${verschoben.bildVorher} -> ${verschoben.bildNachher})`
  )
  // Zustand wiederherstellen: zurueckschieben statt Undo, denn `relativeMove`
  // hat keinen Schnappschuss gezogen (es ist ein Zug-Schritt, kein Zug).
  await page.evaluate(
    (a) => {
      const w = window.__tf.waende().find(function(v){ return v.id === a.wandId; })
      const l = window.__tf.laenge(w)
      const nx = -(w.wby - w.way) / l, ny = (w.wbx - w.wax) / l
      window.__tf.wandVerschieben(a.wandId, -nx * a.weite, -ny * a.weite)
      window.__tf.neuZeichnen()
    },
    { wandId: wand.id, weite: 200 }
  )
  await schlaf(page, 200)

  /* ══ d) DIE HAERTESTE: die Wand teilen ═══════════════════════════ */
  // Die Tuer wandert zuerst in die AEUSSERE Haelfte — sonst laege sie nach dem
  // Teilen zufaellig auf der Haelfte, die ihre Kennung behaelt, und die Probe
  // bewiese nichts.
  const aussen = await page.evaluate(
    (a) => {
      const w = window.__tf.waende().find(function(v){ return v.id === a.wandId; })
      const l = window.__tf.laenge(w)
      const ziel = l * 0.78
      // Ueber den Zeiger, nicht ueber das Modell: das ist der Weg des Nutzers.
      const punktAuf = function(t){ return window.__tf.punktAuf(w, t); };
      const jetzt = window.__tf.oeffnung(a.id)
      const von = { x: jetzt.wx, y: jetzt.wy }, nach = punktAuf(0.78)
      const pv = window.__tf.aufBild(von.x, von.y), pn = window.__tf.aufBild(nach.x, nach.y)
      window.__tf.maus('mousemove', pv.x, pv.y)
      window.__tf.maus('mousedown', pv.x, pv.y)
      for (let i = 1; i <= 8; i++) {
        window.__tf.maus('mousemove', pv.x + ((pn.x - pv.x) * i) / 8, pv.y + ((pn.y - pv.y) * i) / 8)
      }
      window.__tf.maus('mouseup', pn.x, pn.y)
      return { ziel, laenge: l, jetzt: window.__tf.oeffnung(a.id), teilPunkt: punktAuf(0.5) }
    },
    { id: tuer.id, wandId: wand.id }
  )
  await schlaf(page, 300)
  pruefe(
    aussen.jetzt !== null && aussen.jetzt.lage > aussen.laenge * 0.6,
    `d) die Tuer laesst sich ENTLANG ihrer Wand ziehen (Lage ${aussen.jetzt ? aussen.jetzt.lage.toFixed(0) : '?'} von ${aussen.laenge.toFixed(0)} cm)`
  )
  const vorTeilung = await page.evaluate((id) => window.__tf.oeffnung(id), tuer.id)

  // --- GEGENPROBE ZUERST: Versoehnung AUS.
  await page.evaluate(() => window.__tf.versoehnung(false))
  const ohne = await page.evaluate(
    (a) => {
      const r = window.__tf.wandTeilenAn(a.p.x, a.p.y)
      const o = window.__tf.oeffnung(a.id)
      const w = window.__tf.waende().find(function(v){ return v.id === (o ? o.wandId : ''); })
      return {
        geteilt: r.geteilt,
        waende: r.waende,
        o,
        wandLaenge: w ? window.__tf.laenge(w) : null
      }
    },
    { p: aussen.teilPunkt, id: tuer.id }
  )
  await schlaf(page, 300)
  const kaputt =
    ohne.o !== null &&
    ohne.wandLaenge !== null &&
    ohne.o.lage + ohne.o.breite / 2 > ohne.wandLaenge + 0.5
  log(
    `     ohne Versoehnung: Wand geteilt (${ohne.waende} Waende), Tuer haengt an "${ohne.o && ohne.o.wandId}" ` +
      `bei ${ohne.o && ohne.o.lage.toFixed(0)} cm — diese Wand ist nur noch ${ohne.wandLaenge && ohne.wandLaenge.toFixed(0)} cm lang`
  )
  pruefe(ohne.geteilt === true, 'd) die Wand wurde wirklich geteilt (Ecke ist eingerastet)')
  pruefe(
    kaputt,
    `d) GEGENPROBE: OHNE Versoehnung liegt die Tuer danach im Nichts — ` +
      `${ohne.o ? ohne.o.lage.toFixed(0) : '?'} cm auf einer nur ${ohne.wandLaenge ? ohne.wandLaenge.toFixed(0) : '?'} cm langen Wand`
  )

  // --- zurueck und noch einmal, diesmal MIT Versoehnung.
  await page.evaluate(() => window.__tf.undoJetzt())
  await schlaf(page, 500)
  await page.evaluate(() => window.__tf.versoehnung(true))
  const zurueckgesetzt = await page.evaluate((id) => {
    const o = window.__tf.oeffnung(id)
    const w = window.__tf.waende().find(function (v) { return v.id === (o ? o.wandId : '') })
    return { o, laenge: w ? window.__tf.laenge(w) : null, waende: window.__tf.zahlen().waende }
  }, tuer.id)
  pruefe(
    zurueckgesetzt.o !== null && zurueckgesetzt.o.wandId === wand.id,
    `d) Rueckgaengig stellt die Tuer an ihrer Wand wieder her ("${zurueckgesetzt.o ? zurueckgesetzt.o.wandId : 'null'}")`
  )
  // Die LAENGE mitzupruefen ist nicht Beiwerk: die Wand behaelt beim Teilen
  // ihre Kennung. Eine Pruefung, die nur die Kennung liest, bestuende auch
  // dann, wenn das Rueckgaengig die Teilung gar nicht zurueckgenommen hat —
  // beim ersten Lauf dieses Gates war genau das der Fall (der Messzugang der
  // Doppelklick-Datei zog vor dem Teilen keinen Schnappschuss).
  pruefe(
    zurueckgesetzt.laenge !== null && Math.abs(zurueckgesetzt.laenge - wand.laenge) < 1,
    `d) und die Wand ist wirklich wieder UNGETEILT (${zurueckgesetzt.laenge === null ? '?' : zurueckgesetzt.laenge.toFixed(0)} von ${wand.laenge.toFixed(0)} cm)`
  )

  const mit = await page.evaluate(
    (a) => {
      const vorher = window.__tf.oeffnung(a.id)
      const r = window.__tf.wandTeilenAn(a.p.x, a.p.y)
      const o = window.__tf.oeffnung(a.id)
      const w = window.__tf.waende().find(function(v){ return v.id === (o ? o.wandId : ''); })
      return {
        geteilt: r.geteilt,
        vorher,
        o,
        wandLaenge: w ? window.__tf.laenge(w) : null,
        // Wie weit ist die Tuer von ihrem ALTEN Weltpunkt weggerutscht?
        weg: o && vorher && o.wx !== null ? Math.hypot(o.wx - vorher.wx, o.wy - vorher.wy) : null
      }
    },
    { p: aussen.teilPunkt, id: tuer.id }
  )
  await schlaf(page, 300)
  log(
    `     mit Versoehnung: Tuer wechselte von "${vorTeilung.wandId}" nach "${mit.o && mit.o.wandId}", ` +
      `Lage ${vorTeilung.lage.toFixed(0)} -> ${mit.o && mit.o.lage.toFixed(0)} cm, ` +
      `Weltpunkt um ${mit.weg === null ? '?' : mit.weg.toFixed(1)} cm gewandert`
  )
  pruefe(
    mit.o !== null && mit.o.wandId !== vorTeilung.wandId,
    `d) MIT Versoehnung wechselt die Tuer auf die andere Haelfte ("${vorTeilung.wandId}" -> "${mit.o ? mit.o.wandId : 'null'}")`
  )
  pruefe(
    mit.o !== null && mit.wandLaenge !== null && mit.o.lage + mit.o.breite / 2 <= mit.wandLaenge + 0.5,
    `d) und liegt dort vollstaendig IN der Wand (${mit.o ? mit.o.lage.toFixed(0) : '?'} cm auf ${mit.wandLaenge ? mit.wandLaenge.toFixed(0) : '?'} cm)`
  )
  pruefe(
    mit.o !== null && mit.o.verwaist === false,
    'd) sie gilt nicht als verwaist'
  )
  pruefe(
    mit.weg !== null && mit.weg < 2,
    `d) und steht geometrisch noch an derselben Stelle (${mit.weg === null ? '?' : mit.weg.toFixed(2)} cm gewandert)`
  )
  await zeigerWeg(page)
  await page.screenshot({ path: bild('C_nach_der_teilung') })

  /* ══ e) Die Wand loeschen ════════════════════════════════════════ */
  // Eine ZWEITE Tuer auf einer anderen Wand — sie muss die Loeschung der
  // ersten unbeschadet ueberstehen.
  const zweiteWand = await page.evaluate(
    (ausser) => {
      const c = window.__tf.canvas()
      const waende = window.__tf.waende()
        .map(function(w){ return Object.assign({}, w, { laenge: window.__tf.laenge(w) }); })
        .filter(function(w){ return w.laenge >= 300 && w.id !== ausser; })
        .sort(function(a, b){ return b.laenge - a.laenge; })
      for (const w of waende) {
        const m = window.__tf.punktAuf(w, 0.5)
        if (window.__tf.freiRaum(m.x, m.y, w.id) < 120) continue
        const p = window.__tf.aufBild(m.x, m.y)
        if (p.x < 120 || p.y < 120 || p.x > c.width - 120 || p.y > c.height - 120) continue
        window.__tf.maus('mousemove', p.x, p.y)
        window.__tf.maus('mousedown', p.x, p.y)
        window.__tf.maus('mouseup', p.x, p.y)
        const neu = window.__tf.oeffnungen().filter(function(o){ return o.wandId === w.id; })
        if (neu.length) return { wand: w, oeffnung: neu[0], mitte: m }
      }
      return null
    },
    wand.id
  )
  await schlaf(page, 300)
  pruefe(zweiteWand !== null, 'e) eine zweite Tuer auf einer anderen Wand gesetzt')

  const geloescht = await page.evaluate(
    (a) => {
      const o = window.__tf.oeffnung(a.id)
      const vorher = window.__tf.oeffnungen().length
      window.__tf.wandLoeschen(o.wandId)
      const nachher = window.__tf.oeffnungen()
      return {
        wandId: o.wandId,
        vorher,
        zahl: nachher.length,
        meine: window.__tf.oeffnung(a.id),
        nachbar: a.nachbarId ? window.__tf.oeffnung(a.nachbarId) : null,
        wandWeg: !window.__tf.waende().some(function(v){ return v.id === o.wandId; })
      }
    },
    { id: tuer.id, nachbarId: zweiteWand ? zweiteWand.oeffnung.id : null }
  )
  await schlaf(page, 300)
  log(
    `     Wand "${geloescht.wandId}" geloescht: ${geloescht.vorher} -> ${geloescht.zahl} Oeffnungen, ` +
      `verwaist=${geloescht.meine && geloescht.meine.verwaist}`
  )
  pruefe(geloescht.wandWeg, 'e) die Wand ist wirklich weg')
  pruefe(
    geloescht.zahl === geloescht.vorher,
    `e) die Oeffnung wird NICHT still entsorgt (${geloescht.vorher} -> ${geloescht.zahl})`
  )
  pruefe(
    geloescht.meine !== null && geloescht.meine.verwaist === true,
    `e) sie gilt als VERWAIST (${geloescht.meine ? geloescht.meine.verwaist : 'nicht gefunden'})`
  )
  pruefe(
    geloescht.meine !== null && geloescht.meine.wx === null,
    'e) und hat keinen Ort mehr, wird also nicht gezeichnet'
  )
  if (zweiteWand) {
    pruefe(
      geloescht.nachbar !== null && geloescht.nachbar.verwaist === false,
      `e) GEGENPROBE: die Nachbarwand behaelt ihre Oeffnung (verwaist=${geloescht.nachbar ? geloescht.nachbar.verwaist : '?'})`
    )
  }

  /* ══ i) Loeschen ueber Verweilen ═════════════════════════════════ */
  if (zweiteWand) {
    await page.evaluate(() => window.__tf.setzeWerkzeug(2))
    const verweilt = await page.evaluate((m) => {
      const p = window.__tf.aufBild(m.x, m.y)
      window.__tf.maus('mousemove', p.x + 30, p.y + 30)
      window.__tf.maus('mousemove', p.x, p.y)
      return window.__tf.treffer()
    }, zweiteWand.mitte)
    // Das Verweilen braucht 700 ms — laenger warten, aber auf den ZUSTAND
    // pruefen und nicht auf die Uhr.
    await page.waitForFunction(() => window.__tf.loeschKandidat() !== null, null, { timeout: 5000 }).catch(() => {})
    const kandidat = await page.evaluate(() => window.__tf.loeschKandidat())
    pruefe(
      verweilt.oeffnung === zweiteWand.oeffnung.id,
      `i) der Zeiger ueber der Tuer greift SIE und nicht die Wand darunter (${verweilt.oeffnung})`
    )
    pruefe(
      kandidat !== null && kandidat.art === 'oeffnung',
      `i) das Verweilen schlaegt sie zum Loeschen vor (${kandidat ? kandidat.art : 'nichts'})`
    )
    pruefe(
      kandidat !== null && /^diese Tür \(\d,\d\d m breit\)$/.test(kandidat.beschreibung),
      `i) und benennt sie so, wie der Nutzer sie sieht ("${kandidat ? kandidat.beschreibung : ''}")`
    )
    // GEGENPROBE: Abbrechen entfernt nichts.
    const abgebrochen = await page.evaluate((id) => {
      window.__tf.loeschungAbbrechen()
      return { kandidat: window.__tf.loeschKandidat(), da: window.__tf.oeffnung(id) !== null }
    }, zweiteWand.oeffnung.id)
    pruefe(
      abgebrochen.kandidat === null && abgebrochen.da,
      `i) GEGENPROBE: Abbrechen nimmt die Rueckfrage zurueck und entfernt nichts (noch da: ${abgebrochen.da})`
    )
    // Und jetzt wirklich.
    await page.evaluate((m) => {
      const p = window.__tf.aufBild(m.x, m.y)
      window.__tf.maus('mousemove', p.x + 25, p.y + 25)
      window.__tf.maus('mousemove', p.x, p.y)
    }, zweiteWand.mitte)
    await page.waitForFunction(() => window.__tf.loeschKandidat() !== null, null, { timeout: 5000 }).catch(() => {})
    const entfernt = await page.evaluate((id) => {
      const ok = window.__tf.loeschungBestaetigen()
      return { ok, da: window.__tf.oeffnung(id) !== null }
    }, zweiteWand.oeffnung.id)
    pruefe(entfernt.ok === true, `i) das Bestaetigen meldet die WIRKUNG (${entfernt.ok})`)
    pruefe(!entfernt.da, 'i) und die Tuer ist wirklich weg')
    await page.evaluate(() => window.__tf.setzeWerkzeug(3))
  }

  /* ══ h) Alte und neuere Dateien ══════════════════════════════════ */
  const fassungen = await page.evaluate(
    async (a) => {
      const ergebnis = {}
      for (const f of [1, 2]) {
        const kopie = JSON.parse(a.roh)
        kopie.floorplan.formatVersion = f
        const r = window.__tf.ladeDatei(JSON.stringify(kopie))
        ergebnis['f' + f] = r
      }
      // Fassung 4: MUSS abgelehnt werden — und der offene Plan bleibt stehen.
      const vorher = window.__tf.zahlen()
      const kopie = JSON.parse(a.roh)
      kopie.floorplan.formatVersion = 4
      const abgelehnt = window.__tf.ladeDatei(JSON.stringify(kopie))
      return { ...ergebnis, abgelehnt, vorher, nachher: window.__tf.zahlen() }
    },
    { roh: planRoh }
  )
  await schlaf(page, 500)
  pruefe(
    fassungen.f1 && fassungen.f1.ecken === SOLL_ECKEN && fassungen.f1.waende === SOLL_WAENDE,
    `h) eine Datei der Fassung 1 laedt weiter (${fassungen.f1 && fassungen.f1.ecken} Ecken, ${fassungen.f1 && fassungen.f1.waende} Waende)`
  )
  pruefe(
    fassungen.f2 && fassungen.f2.ecken === SOLL_ECKEN && fassungen.f2.waende === SOLL_WAENDE,
    `h) eine Datei der Fassung 2 ebenso (${fassungen.f2 && fassungen.f2.ecken} Ecken, ${fassungen.f2 && fassungen.f2.waende} Waende)`
  )
  pruefe(
    !!(fassungen.abgelehnt && fassungen.abgelehnt.fehler),
    `h) GEGENPROBE: Fassung 4 wird ehrlich abgelehnt ("${fassungen.abgelehnt && String(fassungen.abgelehnt.fehler).slice(0, 60)}…")`
  )
  pruefe(
    fassungen.nachher.ecken === fassungen.vorher.ecken &&
      fassungen.nachher.waende === fassungen.vorher.waende,
    `h) und der offene Plan bleibt dabei unversehrt (${fassungen.vorher.ecken}/${fassungen.vorher.waende} -> ${fassungen.nachher.ecken}/${fassungen.nachher.waende})`
  )

  // Das Laden hat den Grundriss ERSETZT und damit auch das Werkzeug
  // zurueckgelegt (`loadFloorplan` -> `roomLoadedCallbacks` -> `reset()` ->
  // `setMode(MOVE)`). Wer danach weitermisst, klickt sonst mit dem
  // Verschieben-Werkzeug und wundert sich, dass nichts entsteht.
  await page.evaluate(() => window.__tf.setzeWerkzeug(3))
  await schlaf(page, 200)

  await hilfen.abschluss(page, wand)
}

/* ══════════════════════════════════════════════════════════════════════
   WELT 1 — der Planer auf localhost
   ══════════════════════════════════════════════════════════════════════ */
const browser = await chromium.launch()

if (NUR !== 'datei') {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const konsole = []
  page.on('console', (m) => {
    if (m.type() === 'error') konsole.push(m.text().slice(0, 160))
  })
  page.on('pageerror', (e) => konsole.push('PAGE-ERR: ' + String(e).slice(0, 160)))

  log(`\n═══ WELT 1: der Planer — http://localhost:${PORT}/?plan=${PLAN} ═══`)
  await page.goto(`http://localhost:${PORT}/?plan=${PLAN}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(6000)
  await page.evaluate(() => {
    ;[...document.querySelectorAll('button')]
      .find((b) => b.textContent.trim() === '2D')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await page.waitForFunction(
    () => {
      const c = document.getElementById('floorplanner-canvas')
      return !!c && c.offsetParent !== null && c.width > 100 && !!window.__planer
    },
    { timeout: 20000 }
  )
  await page.waitForTimeout(1500)
  await page.evaluate(ADAPTER_PLANER)
  await page.evaluate(MESSZUGANG)

  await pruefeWelt(page, 'Planer', {
    abschluss: async (p) => {
      welt = 'Planer'
      /* Der Knopf der Werkzeugleiste — die Bedienung, die es im Planer wirklich
         gibt. Ohne ihn waere das Werkzeug zwar da und nicht zu erreichen: genau
         der stille „verfuegbar-aber-inaktiv"-Zustand, den es nicht geben darf. */
      const knopf = await p.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find(
          (x) => (x.getAttribute('aria-label') || '').indexOf('Türen') === 0
        )
        if (!b) return null
        b.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        return { gefunden: true, modus: window.__tf.werkzeug() }
      })
      pruefe(
        knopf !== null && knopf.modus === OEFFNUNG,
        `Werkzeugleiste: der Knopf „Türen & Fenster" schaltet das Werkzeug (${knopf ? knopf.modus : 'kein Knopf'})`
      )
    }
  })
  welt = 'Planer'
  pruefe(
    konsole.length === 0,
    `keine Konsolen- oder Seitenfehler (${konsole.length}${konsole.length ? ': ' + konsole.slice(0, 2).join(' | ') : ''})`
  )
  await page.close()
}

/* ══════════════════════════════════════════════════════════════════════
   WELT 2 — die Doppelklick-Datei unter file://, Netz gesperrt
   ══════════════════════════════════════════════════════════════════════ */
if (NUR !== 'planer') {
  if (!fs.existsSync(DATEI)) {
    welt = 'Datei'
    pruefe(false, `die Doppelklick-Datei fehlt (${DATEI}) — erst "node tools/baue-planer-datei.mjs"`)
  } else {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const blockiert = []
    await ctx.route('**/*', (route) => {
      const u = route.request().url()
      if (u.startsWith('file://') || u.startsWith('data:') || u.startsWith('blob:')) {
        return route.continue()
      }
      blockiert.push(u)
      return route.abort()
    })
    const page = await ctx.newPage()
    const konsole = []
    page.on('console', (m) => {
      if (m.type() === 'error') konsole.push(m.text().slice(0, 160))
    })
    page.on('pageerror', (e) => konsole.push('PAGE-ERR: ' + String(e).slice(0, 160)))

    const url = pathToFileURL(DATEI).href
    log(`\n═══ WELT 2: die Doppelklick-Datei — ${url} (Netz GESPERRT) ═══`)
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => window.__bereit === true, { timeout: 25000 })
    /* Werkzeuge EIN und in den Grundriss — seit W7 zwei getrennte Griffe: der
       Bearbeiten-Schalter laesst die Ansicht stehen (ausdruecklicher
       Nutzerwunsch), und Oeffnungen werden im Grundriss gesetzt.
       W11: seit dem Schloss ist ein Druck auf „Bearbeiten" eine FRAGE, keine
       Tat. `werkstattAufschliessen` umgeht sie nicht — es beantwortet sie mit
       dem echten Passwort (Umgebung oder Geheim-Ordner, nie aus dem Repo). */
    await werkstattAufschliessen(page)
    await page.evaluate(() => {
      document.getElementById('btnBearbeiten').dispatchEvent(new MouseEvent('click', { bubbles: true }))
      document.getElementById('btnAnsichtPlan').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await page.waitForTimeout(800)
    await page.evaluate(ADAPTER_DATEI)
    await page.evaluate(MESSZUGANG)

    /* ══ j) GEGENPROBE ZUERST: solange nichts gesetzt ist, schweigt das Blatt.
       Spaeter gemessen waere die Zeile durch den Pruefablauf laengst gefuellt —
       dieselbe Falle, in die die erste Fassung des Zaehler-Gates in W2 lief. */
    const blattAmAnfang = await page.evaluate(() => ({
      text: window.__planerDatei.oeffnungText(),
      hoehe: window.__planerDatei.hinweisOeffnung(),
      zahl: window.__tf.oeffnungen().length
    }))

    /* Der Knopf, den es hier wirklich gibt. */
    const knopf = await page.evaluate(() => {
      const b = document.getElementById('wzOeffnung')
      if (!b) return null
      b.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      return {
        modus: window.__tf.werkzeug(),
        // GEMESSEN, nicht aus 'hidden' geraten: das Attribut kennt weder
        // Medienabfragen noch unsichtbare Vorfahren.
        artenSichtbar: document.getElementById('oeffnungsArten').checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })
      }
    })
    welt = 'Datei'
    pruefe(
      knopf !== null && knopf.modus === OEFFNUNG,
      `Werkzeugleiste: der Knopf „Türen & Fenster" schaltet das Werkzeug (${knopf ? knopf.modus : 'kein Knopf'})`
    )
    pruefe(
      knopf !== null && knopf.artenSichtbar === true,
      'Werkzeugleiste: die vier Arten erscheinen MIT ihrem Werkzeug'
    )
    const artenWeg = await page.evaluate(() => {
      window.__tf.setzeWerkzeug(0)
      const weg = !document.getElementById('oeffnungsArten').checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })
      window.__tf.setzeWerkzeug(3)
      return weg
    })
    pruefe(artenWeg === true, 'Werkzeugleiste: und verschwinden mit ihm (GEGENPROBE)')

    await pruefeWelt(page, 'Datei', {
      abschluss: async (p) => {
        welt = 'Datei'

        /* ══ f) Die Axonometrie laesst die Wand weg ══════════════════════
           Gemessen wird die FLAECHE der Wandkacheln, nicht ihre Anzahl: eine
           Oeffnung in der Mitte einer 10-m-Wand zerlegt [0,10] in [0,4.5] und
           [5.5,10] — bei 3,2 m Kachelbreite ergibt beides zweimal zwei
           Kacheln, die ZAHL bleibt also gleich. Die Flaeche sinkt zwingend um
           lichte Weite mal Wanddicke. (ABWEICHUNG vom Bauplan, der „Wandstueck-
           Zahl sinkt" vorsah — die Rechnung oben zeigt, dass das nicht
           zwingend gilt und das Gate damit zufaellig gruen oder rot waere.) */
        const frisch = await p.evaluate(() => {
          window.__tf.axoNeuBauen()
          return window.__tf.szeneWaende()
        })
        /* Ein Standbild OHNE Oeffnung, als Bezug. Mit ihm laesst sich die
           Stelle, an der die Tuer entsteht, im fertigen Blatt WIEDERFINDEN:
           zwei Bilder voneinander abgezogen zeigen genau sie. Ohne diesen
           Bezug muesste man ein 78-m-Blatt nach einer 11 Bildpunkte breiten
           Luecke absuchen — und wuerde sie uebersehen. */
        await p.evaluate(() => {
          document.getElementById('btnAnsichtAxo').dispatchEvent(new MouseEvent('click', { bubbles: true }))
        })
        await schlaf(p, 1200)
        await p.screenshot({ path: path.join(DIR, 'Datei_E0_axo_ohne_tuer.png') })
        await p.evaluate(() => {
          document.getElementById('btnAnsichtPlan').dispatchEvent(new MouseEvent('click', { bubbles: true }))
        })
        await schlaf(p, 500)
        // Eine Tuer auf eine freie Wand setzen und dieselbe Messung wiederholen.
        const w2 = await p.evaluate(`${WAND_SUCHE}(500, 150)`)
        pruefe(w2 !== null, 'f) eine freie Wand fuer die Axonometrie-Messung gefunden')
        if (w2 && frisch) {
          const nach = await p.evaluate((w) => {
            const m = window.__tf.punktAuf(w, 0.5)
            const q = window.__tf.aufBild(m.x, m.y)
            window.__tf.maus('mousemove', q.x, q.y)
            window.__tf.maus('mousedown', q.x, q.y)
            window.__tf.maus('mouseup', q.x, q.y)
            const neu = window.__tf.oeffnungen().filter(function (o) { return o.wandId === w.id })
            window.__tf.axoNeuBauen()
            return { szene: window.__tf.szeneWaende(), oeffnung: neu[0] || null }
          }, w2)
          await schlaf(p, 500)
          const erwartet = nach.oeffnung ? (nach.oeffnung.breite / 100) * (w2.dicke / 100) : 0
          const wirklich = frisch.flaeche - (nach.szene ? nach.szene.flaeche : 0)
          log(
            `     Axonometrie: ${frisch.n} -> ${nach.szene.n} Wandkacheln, Flaeche ` +
              `${frisch.flaeche.toFixed(3)} -> ${nach.szene.flaeche.toFixed(3)} m² ` +
              `(Verlust ${wirklich.toFixed(3)}, erwartet ${erwartet.toFixed(3)})`
          )
          pruefe(
            nach.oeffnung !== null,
            'f) die Tuer fuer die Axonometrie-Messung ist gesetzt'
          )
          pruefe(
            Math.abs(wirklich - erwartet) < 0.01,
            `f) die Axonometrie laesst GENAU die lichte Weite weg (${wirklich.toFixed(3)} m² statt ${erwartet.toFixed(3)})`
          )

          /* Ein Standbild mit der TUER — zum ANSEHEN, und zwar JETZT: gleich
             darunter wird sie zurueckgenommen und durch ein Fenster ersetzt,
             und ein Fenster mit 90-cm-Bruestung ist in einer auf 94 cm
             geschnittenen Wand nur ein 4-cm-Absatz, also gar nichts zu sehen.
             Die Tuer dagegen reisst die Wand auf voller Schnitthoehe auf — das
             ist das Bild, an dem sich beurteilen laesst, ob die Oeffnung an
             der richtigen Stelle sitzt. (Projekt-DNA Punkt 2: kein
             Geometrie-Gate ohne Blick aufs Bild.) */
          await p.evaluate(() => {
            document.getElementById('btnAnsichtAxo').dispatchEvent(new MouseEvent('click', { bubbles: true }))
          })
          await schlaf(p, 1200)
          await p.screenshot({ path: path.join(DIR, 'Datei_E_axo_mit_tuer.png') })
          await p.evaluate(() => {
            document.getElementById('btnAnsichtPlan').dispatchEvent(new MouseEvent('click', { bubbles: true }))
          })
          await schlaf(p, 500)

          /* ══ Die BRUESTUNG (W4, Schritt 8) ═══════════════════════════
             Ein Fenster ist kein Durchgang: unter ihm bleibt Mauerwerk
             stehen. Das ist an der FLAECHE nicht zu sehen (der Bruestungs-
             block hat denselben Grundriss wie das fehlende Stueck Wand) —
             wohl aber am VOLUMEN. Genau diese beiden Zahlen zusammen sind
             der Beweis: Grundriss unveraendert UND Hoehe gesunken. */
          const fenster = await p.evaluate((w) => {
            // Erst die Tuer wieder wegnehmen, damit nur EINE Aenderung wirkt.
            window.__tf.undoJetzt()
            window.__tf.setzeWerkzeug(3)
            window.__tf.setzeOeffnungsArt('fenster')
            window.__tf.axoNeuBauen()
            const vorher = window.__tf.szeneWaende()
            const m = window.__tf.punktAuf(w, 0.5)
            const q = window.__tf.aufBild(m.x, m.y)
            window.__tf.maus('mousemove', q.x, q.y)
            window.__tf.maus('mousedown', q.x, q.y)
            window.__tf.maus('mouseup', q.x, q.y)
            const neu = window.__tf.oeffnungen().filter(function (o) { return o.wandId === w.id })
            window.__tf.axoNeuBauen()
            return { vorher, nachher: window.__tf.szeneWaende(), oeffnung: neu[0] || null }
          }, w2)
          await schlaf(p, 500)
          const flaechenVerlust = fenster.vorher.flaeche - fenster.nachher.flaeche
          const volumenVerlust = fenster.vorher.volumen - fenster.nachher.volumen
          log(
            `     Bruestung: Flaeche ${fenster.vorher.flaeche.toFixed(3)} -> ${fenster.nachher.flaeche.toFixed(3)} m² ` +
              `(Verlust ${flaechenVerlust.toFixed(4)}), Volumen ${fenster.vorher.volumen.toFixed(3)} -> ` +
              `${fenster.nachher.volumen.toFixed(3)} m³ (Verlust ${volumenVerlust.toFixed(4)})`
          )
          pruefe(
            fenster.oeffnung !== null && fenster.oeffnung.art === 'fenster' && fenster.oeffnung.bruestung > 0,
            `f) ein Fenster mit Bruestung ist gesetzt (${fenster.oeffnung ? fenster.oeffnung.bruestung : '?'} cm)`
          )
          pruefe(
            Math.abs(flaechenVerlust) < 0.001,
            `f) unter dem Fenster bleibt Mauerwerk stehen — der Grundriss der Wand ist UNVERAENDERT (${flaechenVerlust.toFixed(4)} m²)`
          )
          pruefe(
            volumenVerlust > 0.005,
            `f) GEGENPROBE: die HOEHE sinkt trotzdem — das Fenster schneidet wirklich (${volumenVerlust.toFixed(4)} m³)`
          )

          /* Und eines mit dem FENSTER — hier traegt der Blattkopf seine
             Legende. Es entsteht HIER und nicht am Ende, weil Gate j gleich
             alle Oeffnungen zuruecknimmt und das Blatt dann keine mehr zeigte. */
          await p.evaluate(() => {
            document.getElementById('btnAnsichtAxo').dispatchEvent(new MouseEvent('click', { bubbles: true }))
          })
          await schlaf(p, 1200)
          await p.screenshot({ path: path.join(DIR, 'Datei_F_axo_mit_fenster.png') })
          await p.evaluate(() => {
            document.getElementById('btnAnsichtPlan').dispatchEvent(new MouseEvent('click', { bubbles: true }))
          })
          await schlaf(p, 500)
        }

        /* ══ j) Die Blattkopf-Zeile ════════════════════════════════════ */
        const blattJetzt = await p.evaluate(() => ({
          text: window.__planerDatei.oeffnungText(),
          hoehe: window.__planerDatei.hinweisOeffnung(),
          zahl: window.__tf.oeffnungen().length
        }))
        pruefe(
          blattAmAnfang.text === null && blattAmAnfang.zahl === 0,
          `j) GEGENPROBE: ohne Oeffnung schweigt der Blattkopf (${JSON.stringify(blattAmAnfang.text)})`
        )
        pruefe(
          blattAmAnfang.hoehe === '',
          `j) GEGENPROBE: und der Massstabs-Vorbehalt steht dann auch nicht da ("${blattAmAnfang.hoehe}")`
        )
        pruefe(
          blattJetzt.zahl > 0 && typeof blattJetzt.text === 'string',
          `j) mit Oeffnungen erscheint die Zeile ("${blattJetzt.text}")`
        )
        pruefe(
          /1,16 m/.test(blattJetzt.hoehe) && /nicht maßstäblich/.test(blattJetzt.hoehe),
          `j) und der Fusshinweis sagt, dass die HOEHE nicht massstaeblich ist ("${String(blattJetzt.hoehe).trim().slice(0, 80)}…")`
        )

        // Alle Oeffnungen wieder entfernen: die Zeile MUSS dann verschwinden.
        const leer = await p.evaluate(async () => {
          let schutz = 0
          while (window.__tf.oeffnungen().length > 0 && schutz < 40) {
            window.__tf.undoJetzt()
            schutz++
          }
          return { zahl: window.__tf.oeffnungen().length, schutz }
        })
        await schlaf(p, 600)
        const blattLeer = await p.evaluate(() => ({
          text: window.__planerDatei.oeffnungText(),
          hoehe: window.__planerDatei.hinweisOeffnung()
        }))
        pruefe(
          leer.zahl === 0,
          `j) alle Oeffnungen liessen sich zurueckwerfen (${leer.schutz} Schritte)`
        )
        pruefe(
          blattLeer.text === null && blattLeer.hoehe === '',
          `j) und beide Zeilen verschwinden wieder (${JSON.stringify(blattLeer.text)}, "${blattLeer.hoehe}")`
        )
        await p.evaluate(() => {
          document.getElementById('btnAnsichtAxo').dispatchEvent(new MouseEvent('click', { bubbles: true }))
        })
        await schlaf(p, 900)
        await p.screenshot({ path: path.join(DIR, 'Datei_D_blatt.png') })
      }
    })

    welt = 'Datei'
    pruefe(
      blockiert.length === 0,
      `KEINE Anfrage nach draussen (${blockiert.length} blockiert${blockiert.length ? ': ' + blockiert.slice(0, 3).join(', ') : ''})`
    )
    pruefe(
      konsole.length === 0,
      `keine Konsolen- oder Seitenfehler (${konsole.length}${konsole.length ? ': ' + konsole.slice(0, 2).join(' | ') : ''})`
    )
    await ctx.close()
  }
}

await browser.close()

log('')
log(fehler.length === 0 ? 'ALLE PRUEFUNGEN BESTANDEN' : `DURCHGEFALLEN: ${fehler.length}`)
fehler.forEach((f) => log('  - ' + f))
log(`Bilder + Bericht: ${DIR}`)
process.exit(fehler.length === 0 ? 0 : 1)
