// Prueft das MOEBELZIEHEN (W2) — in BEIDEN Welten.
//
// Voraussetzung: der Auslieferungs-Server laeuft UND die Datei ist gebaut.
//   node tools/serve-local.mjs --port 3301
//   node tools/baue-planer-datei.mjs
//   node tools/pruefe-ziehen.mjs [--port 3301] [--plan halle400] [--nur planer|datei]
// Exit 0 = alle Pruefungen bestanden, 1 = mindestens eine durchgefallen.
//
// WARUM ZWEI WELTEN IN EINEM WERKZEUG: der Planer (http://localhost) und die
// Doppelklick-Datei (file://, Netz gesperrt) tragen DENSELBEN uebersetzten Kern,
// aber zwei voellig verschiedene Huellen. Eine Pruefung, die nur eine davon
// misst, beweist ueber die andere gar nichts — und genau dort, in der Huelle,
// sitzen die Unterschiede, die ein Ziehen kaputtmachen (Ereignis-Abos,
// Ansichts-Wechsel, Sichern). Beide Welten laufen deshalb durch DENSELBEN
// Pruefablauf, angesprochen ueber einen einheitlichen Messzugang `window.__zg`.
//
// ACHT BEHAUPTUNGEN, die hier bewiesen werden:
//
//   a) Ein Stuhl wird gegriffen und landet DORT, wo losgelassen wurde — im
//      MODELL und im BILD. Die Modellzahl allein ist blind: sie waere auch dann
//      richtig, wenn der Zeichner das Stueck weiterhin am alten Ort malt.
//   b) GEGENPROBE: dieselbe Bewegung OHNE gedrueckte Taste bewegt nichts.
//   c) GEGENPROBE: ein Zug NEBEN dem Moebel schwenkt die Ansicht und bewegt
//      kein Moebel. Ohne diese Probe bestuende auch eine Fassung, die jedes
//      Schwenken in ein Moebelziehen verwandelt.
//   d) Der ganze Zug ist EIN Rueckgaengig-Schritt. Ein Zug laeuft ueber
//      hunderte Bewegungen; ohne Sperre waere jede ein eigener Schritt, und
//      Strg+Z ruckelte das Stueck pixelweise zurueck.
//   e) Das gezogene Stueck ist danach `gesetzt` und wird GESTRICHELT
//      gezeichnet, ein unberuehrtes bleibt `gemessen`. Die PDF ist die
//      Grundwahrheit — eine Annahme darf nie als Aufmass durchgehen.
//   f) Einrasten legt das Stueck buendig an die Wand. GEGENPROBE: abgeschaltet
//      bleibt es dort liegen, wo es losgelassen wurde.
//   g) Die Axonometrie zeigt danach ein anderes Bild. GEGENPROBE: ohne Zug
//      bleibt sie identisch (sonst waere es Rauschen, kein Folgen).
//   h) Q/E drehen das Stueck unter dem Zeiger um 15°.
//
// NIE page.click IN DEN 2D-ZEICHNER: die Zeichenschleife laesst die Seite nie
// idle werden, ein wartender Klick liefe in den Timeout, OBWOHL er wirkt. Alle
// Zeiger-Ereignisse gehen ueber `dispatchEvent`.
//
// VOR JEDER PIXEL-MESSUNG faehrt der Zeiger weg: die Hervorhebung unter dem
// Zeiger faerbt sonst genau die Linien ein, die gleich gezaehlt werden.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

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

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'h400-ziehen-'))
const BERICHT = path.join(DIR, 'bericht.txt')
fs.writeFileSync(BERICHT, '')
const log = (s) => {
  console.log(s)
  fs.appendFileSync(BERICHT, s + '\n')
}
const fehler = []
let welt = ''
const pruefe = (bedingung, text) => {
  const zeile = `${bedingung ? 'OK  ' : 'FEHL'} [${welt}] ${text}`
  log(zeile)
  if (!bedingung) fehler.push(`[${welt}] ${text}`)
}

/* ── Der gemeinsame Messzugang ────────────────────────────────────────────
   Wird in BEIDE Welten eingespielt und bietet dort dieselben Namen. Alles
   darunter (Planer-Instanz oder `window.__planerDatei`) bleibt hinter dieser
   einen Wand — dadurch ist der ganze Pruefablauf unten fuer beide Welten
   BUCHSTABENGLEICH und kann nicht heimlich zweierlei messen. */
const MESSZUGANG = `(function(){
  const AUSSTATTUNG_LINIE = [125, 138, 156];   // #7d8a9c aus floorplanner_view.ts
  const nah = (v, soll) => Math.abs(v - soll) <= 22;

  window.__zg.canvas = function(){ return document.getElementById(window.__zg.canvasId); };

  window.__zg.maus = function(typ, x, y){
    const c = window.__zg.canvas();
    const r = c.getBoundingClientRect();
    c.dispatchEvent(new MouseEvent(typ, { bubbles: true, clientX: r.left + x, clientY: r.top + y }));
  };
  window.__zg.zeigerWeg = function(){ window.__zg.maus('mousemove', 3, 3); };

  /** Punkt-Abstand zu einer Wand-STRECKE (nicht zu ihrer Geraden). */
  window.__zg.wandAbstand = function(x, y){
    let min = Infinity;
    window.__zg.waende().forEach(function(w){
      const dx = w.wbx - w.wax, dy = w.wby - w.way;
      const l2 = dx * dx + dy * dy;
      if (l2 === 0) return;
      let t = ((x - w.wax) * dx + (y - w.way) * dy) / l2;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(x - (w.wax + dx * t), y - (w.way + dy * t));
      if (d < min) min = d;
    });
    return min;
  };

  /** Abstand des MITTELPUNKTS zur Wand-GERADEN (fuer das Buendig-Mass). */
  window.__zg.achsAbstand = function(x, y, w){
    const dx = w.wbx - w.wax, dy = w.wby - w.way;
    const l = Math.hypot(dx, dy);
    return Math.abs(((x - w.wax) * dy - (y - w.way) * dx) / l);
  };

  /** Tinte der AUSSTATTUNGS-Linienfarbe in einem Bildausschnitt: Anzahl und
   *  Schwerpunkt. Nur diese eine Farbe, damit Wandkanten und Raster nicht
   *  mitgezaehlt werden — sonst maesse man das Blatt statt des Moebels. */
  window.__zg.tinte = function(k){
    const c = window.__zg.canvas();
    const x0 = Math.max(0, Math.round(k.x0)), y0 = Math.max(0, Math.round(k.y0));
    const x1 = Math.min(c.width, Math.round(k.x1)), y1 = Math.min(c.height, Math.round(k.y1));
    if (x1 - x0 < 4 || y1 - y0 < 4) return { n: 0, cx: null, cy: null, leer: true };
    const d = c.getContext('2d').getImageData(x0, y0, x1 - x0, y1 - y0).data;
    let n = 0, sx = 0, sy = 0;
    const b = x1 - x0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] <= 10) continue;
      if (d[i + 2] - d[i] < 12) continue;
      if (!nah(d[i], AUSSTATTUNG_LINIE[0]) || !nah(d[i + 1], AUSSTATTUNG_LINIE[1]) || !nah(d[i + 2], AUSSTATTUNG_LINIE[2])) continue;
      const p = i / 4;
      n++; sx += x0 + (p % b); sy += y0 + Math.floor(p / b);
    }
    return { n: n, cx: n ? sx / n : null, cy: n ? sy / n : null, leer: false };
  };

  /** Kasten von +- randCm um einen WELT-Punkt, in Bildkoordinaten. */
  window.__zg.kasten = function(x, y, randCm){
    const p = window.__zg.aufBild(x, y);
    const r = randCm * window.__zg.proCm();
    return { x0: p.x - r, y0: p.y - r, x1: p.x + r, y1: p.y + r };
  };
})();`

/* ── Welt 1: der Planer ───────────────────────────────────────────────── */
const ADAPTER_PLANER = `(function(){
  const b = window.__planer;
  window.__zg = {
    canvasId: 'floorplanner-canvas',
    liste: function(){
      return b.model.floorplan.getAusstattung().map(function(e){
        return { id: e.id, typ: e.typ, x: e.x, y: e.y, breite: e.breite, tiefe: e.tiefe,
                 drehung: e.drehung || 0, quelle: e.quelle,
                 bx: b.floorplanner.convertX(e.x), by: b.floorplanner.convertY(e.y) };
      });
    },
    stueck: function(id){
      const e = b.model.floorplan.findeAusstattung(id);
      if (!e) return null;
      return { id: e.id, typ: e.typ, x: e.x, y: e.y, breite: e.breite, tiefe: e.tiefe,
               drehung: e.drehung || 0, quelle: e.quelle,
               bx: b.floorplanner.convertX(e.x), by: b.floorplanner.convertY(e.y) };
    },
    waende: function(){
      return b.model.floorplan.getWalls().map(function(w){
        const a = w.getStart(), z = w.getEnd();
        return { id: w.id, dicke: w.thickness, wax: a.x, way: a.y, wbx: z.x, wby: z.y };
      });
    },
    gesetzte: function(){ return b.model.floorplan.zaehleGesetzte(); },
    aufBild: function(x, y){ return { x: b.floorplanner.convertX(x), y: b.floorplanner.convertY(y) }; },
    treffer: function(){
      const z = b.floorplanner;
      return { ausstattung: z.activeAusstattung,
               wand: z.activeWall ? z.activeWall.id : null,
               ecke: z.activeCorner ? z.activeCorner.id : null };
    },
    proCm: function(){ return b.floorplanner.pixelProCm(); },
    zoomeAufPunkt: function(z, bx, by){ b.floorplanner.zoomeAufPunkt(z, bx, by); },
    einrasten: function(){ return b.floorplanner.istEinrasten(); },
    setzeEinrasten: function(an){ b.floorplanner.setzeEinrasten(an); },
    undoJetzt: function(){ b.undo.undo(); },
    kannZurueck: function(){ return b.undo.canUndo(); },
    zeigerStil: function(){ return document.getElementById('floorplanner-canvas').style.cursor; },
    taste: function(k){
      document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true }));
    },
    ausstattungRoh: function(){ return JSON.parse(JSON.stringify(b.model.floorplan.getAusstattung())); },
    setzeAusstattung: function(l){ b.model.floorplan.setAusstattung(l); b.floorplanner.resizeView(); }
  };
})();`

/* ── Welt 2: die Doppelklick-Datei ────────────────────────────────────── */
const ADAPTER_DATEI = `(function(){
  const d = window.__planerDatei;
  window.__zg = {
    canvasId: 'grundriss-canvas',
    liste: d.ausstattung, stueck: d.stueck, waende: d.waende, gesetzte: d.gesetzte,
    aufBild: d.aufBild, treffer: d.treffer, proCm: d.proCm,
    zoomeAufPunkt: d.zoomeAufPunkt, einrasten: d.einrasten, setzeEinrasten: d.setzeEinrasten,
    undoJetzt: d.undoJetzt, kannZurueck: d.kannZurueck, taste: d.taste,
    zeigerStil: d.zeigerStil,
    ausstattungRoh: d.ausstattungRoh, setzeAusstattung: d.setzeAusstattung
  };
})();`

/* ══════════════════════════════════════════════════════════════════════
   DER PRUEFABLAUF — buchstabengleich fuer beide Welten
   ══════════════════════════════════════════════════════════════════════ */

const schlaf = (p, ms) => p.waitForTimeout(ms)
const zeigerWeg = async (p) => {
  await p.evaluate(() => window.__zg.zeigerWeg())
  await schlaf(p, 90)
}

/** Ein Zug: hinfahren, druecken, in `schritte` Stufen ziehen, loslassen.
 *  In Stufen und nicht in einem Sprung, weil ein echter Zug so aussieht — und
 *  weil nur so auffiele, wenn jede Bewegung einen eigenen Undo-Schritt zoege. */
const ziehe = async (p, von, nach, { druecken = true, schritte = 12 } = {}) => {
  await p.evaluate(
    (a) => {
      const m = window.__zg.maus
      m('mousemove', a.von.x, a.von.y)
      if (a.druecken) m('mousedown', a.von.x, a.von.y)
      for (let i = 1; i <= a.schritte; i++) {
        m('mousemove', a.von.x + ((a.nach.x - a.von.x) * i) / a.schritte,
                       a.von.y + ((a.nach.y - a.von.y) * i) / a.schritte)
      }
      if (a.druecken) m('mouseup', a.nach.x, a.nach.y)
    },
    { von, nach, druecken, schritte }
  )
  await schlaf(p, 250)
}

async function pruefeWelt(page, name, hilfen) {
  welt = name
  const bild = (n) => path.join(DIR, `${name}_${n}.png`)

  /* ══ Aufstellung: welches Stueck, wohin? ══════════════════════════════
     Gewaehlt wird ein STUHL: klein, eindeutig, und in `overlappedAusstattung`
     gewinnt bei Ueberlappung das flaechenkleinste Stueck — ein Stuhl ist also
     zuverlaessig zu greifen. */
  const geo = await page.evaluate(() => {
    const c = window.__zg.canvas()
    return { w: c.width, h: c.height, proCm: window.__zg.proCm(), zahl: window.__zg.liste().length }
  })
  log(`     Canvas ${geo.w}x${geo.h}, Massstab ${geo.proCm.toFixed(4)} px/cm, ${geo.zahl} Ausstattungs-Stuecke`)

  /* ══ g) GEGENPROBE ZUERST: ohne Aenderung bleibt das Blatt identisch ══
     Vor jeder Aenderung. Ein "das Bild aendert sich" ohne diese Probe
     bestuende auch dann, wenn es sich bei JEDEM Hinsehen aendert. */
  const axoA = await hilfen.axoBild()
  const axoB = await hilfen.axoBild()
  pruefe(
    axoA !== null && axoA === axoB,
    `g) GEGENPROBE: ohne Zug bleibt die Axonometrie identisch (Pruefsumme ${axoA} -> ${axoB})`
  )

  /* ══ Stuhl + Ablageort waehlen ═══════════════════════════════════════ */
  const wahl = await page.evaluate(() => {
    const c = window.__zg.canvas()
    const liste = window.__zg.liste()
    const stuehle = liste.filter((e) => e.typ === 'stuhl' && e.quelle === 'gemessen')
    for (const s of stuehle) {
      // Erst heranzoomen — auf dem Ankerpunkt des Stuhls, damit er im Bild
      // stehen bleibt. In der Uebersicht ist ein 45-cm-Stuhl acht Bildpunkte
      // gross; ein Schwerpunkt daraus waere Rauschen.
      const vor = window.__zg.aufBild(s.x, s.y)
      if (vor.x < 60 || vor.y < 60 || vor.x > c.width - 60 || vor.y > c.height - 60) continue
      window.__zg.zoomeAufPunkt(1.2, vor.x, vor.y)
      const p = window.__zg.aufBild(s.x, s.y)
      const proCm = window.__zg.proCm()
      // Ablageort suchen: frei von Waenden (sonst raste er dort an die Wand
      // an, und die Messung maesse das Anlegen statt das Ziehen) und frei von
      // anderer Ausstattung (sonst ist die Tinte im Kasten nicht seine).
      const richtungen = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]
      for (const abstandPx of [150, 200, 120, 250]) {
        for (const r of richtungen) {
          const zx = p.x + r[0] * abstandPx, zy = p.y + r[1] * abstandPx
          if (zx < 130 || zy < 130 || zx > c.width - 130 || zy > c.height - 130) continue
          const wz = { x: s.x + (r[0] * abstandPx) / proCm, y: s.y + (r[1] * abstandPx) / proCm }
          if (window.__zg.wandAbstand(wz.x, wz.y) < 130) continue
          const nah = liste.some(
            (e) => e.id !== s.id && Math.hypot(e.x - wz.x, e.y - wz.y) < 130
          )
          if (nah) continue
          return { stuhl: s, ziel: wz, proCm }
        }
      }
    }
    return null
  })
  pruefe(wahl !== null, 'Aufstellung: ein freistehender Stuhl mit freiem Ablageort gefunden')
  if (!wahl) {
    log('ABBRUCH dieser Welt: ohne Greifpunkt waere alles Weitere Raten.')
    return
  }
  const stuhl = wahl.stuhl
  log(
    `     gewaehlt: ${stuhl.typ} "${stuhl.id}" bei Welt(${stuhl.x}, ${stuhl.y}) ` +
      `-> Ablage Welt(${wahl.ziel.x.toFixed(0)}, ${wahl.ziel.y.toFixed(0)}), Massstab ${wahl.proCm.toFixed(3)} px/cm`
  )

  // Der GRIFF sitzt bewusst NICHT in der Mitte: nur ein Griff daneben zeigt,
  // ob der Versatz gehalten wird oder das Stueck unter den Zeiger springt.
  const griff = await page.evaluate((s) => {
    const cos = Math.cos(s.drehung), sin = Math.sin(s.drehung)
    const lx = s.breite * 0.25, ly = s.tiefe * 0.25
    return { x: s.x + lx * cos - ly * sin, y: s.y + lx * sin + ly * cos }
  }, stuhl)
  const versatz = { x: stuhl.x - griff.x, y: stuhl.y - griff.y }
  log(`     angefasst wird bei Welt(${griff.x.toFixed(1)}, ${griff.y.toFixed(1)}) — ${Math.hypot(versatz.x, versatz.y).toFixed(1)} cm neben der Mitte`)

  /* ══ Der Zeiger zeigt das Greifen ═════════════════════════════════════ */
  await zeigerWeg(page)
  const stilFrei = await page.evaluate(() => window.__zg.zeigerStil())
  await page.evaluate((g) => {
    const p = window.__zg.aufBild(g.x, g.y)
    window.__zg.maus('mousemove', p.x, p.y)
  }, griff)
  await schlaf(page, 150)
  const beimUeberfahren = await page.evaluate(() => ({
    treffer: window.__zg.treffer(),
    stil: window.__zg.zeigerStil()
  }))
  pruefe(
    beimUeberfahren.treffer.ausstattung === stuhl.id,
    `Greifen: der Zeiger ueber dem Stuhl greift ihn im VERSCHIEBEN-Werkzeug (${beimUeberfahren.treffer.ausstattung})`
  )
  pruefe(
    beimUeberfahren.stil === 'grab' && stilFrei !== 'grab',
    `Greifen: der Zeiger zeigt "grab" ueber dem Moebel und nicht daneben ("${stilFrei}" -> "${beimUeberfahren.stil}")`
  )

  /* ══ b) GEGENPROBE: dieselbe Bewegung OHNE gedrueckte Taste ═══════════ */
  const zielBild1 = await page.evaluate(
    (a) => {
      const g = window.__zg.aufBild(a.gx, a.gy)
      const z = window.__zg.aufBild(a.zx + a.vx * -1 + a.vx, a.zy) // Platzhalter, s.u.
      return { g, z }
    },
    { gx: griff.x, gy: griff.y, zx: wahl.ziel.x, zy: wahl.ziel.y, vx: versatz.x }
  )
  // Der Zeiger muss dort ENDEN, wo der GRIFFPUNKT hin soll — nicht die Mitte:
  // Mitte(neu) = Zeiger(welt) + Versatz.
  const zeigerZiel = { x: wahl.ziel.x - versatz.x, y: wahl.ziel.y - versatz.y }
  const punkte = await page.evaluate(
    (a) => ({
      von: window.__zg.aufBild(a.gx, a.gy),
      nach: window.__zg.aufBild(a.zx, a.zy)
    }),
    { gx: griff.x, gy: griff.y, zx: zeigerZiel.x, zy: zeigerZiel.y }
  )
  void zielBild1

  await zeigerWeg(page)
  await ziehe(page, punkte.von, punkte.nach, { druecken: false })
  const ohneTaste = await page.evaluate((id) => window.__zg.stueck(id), stuhl.id)
  pruefe(
    ohneTaste && ohneTaste.x === stuhl.x && ohneTaste.y === stuhl.y,
    `b) GEGENPROBE: dieselbe Bewegung OHNE gedrueckte Taste bewegt nichts (${ohneTaste?.x}, ${ohneTaste?.y})`
  )

  /* ══ c) GEGENPROBE: ein Zug NEBEN dem Moebel schwenkt die Ansicht ═════ */
  const leer = await page.evaluate(() => {
    const c = window.__zg.canvas()
    const liste = window.__zg.liste()
    const proCm = window.__zg.proCm()
    for (let by = 120; by < c.height - 200; by += 25) {
      for (let bx = 120; bx < c.width - 260; bx += 25) {
        // Bildpunkt -> Welt: ueber die Umkehrung von `aufBild`, gesucht per
        // Probe an einem bekannten Punkt (der Massstab ist linear).
        const a0 = window.__zg.aufBild(0, 0)
        const wx = (bx - a0.x) / proCm, wy = (by - a0.y) / proCm
        if (window.__zg.wandAbstand(wx, wy) < 200) continue
        if (liste.some((e) => Math.hypot(e.x - wx, e.y - wy) < 200)) continue
        return { bx, by, wx, wy }
      }
    }
    return null
  })
  pruefe(leer !== null, 'c) GEGENPROBE: ein freier Punkt neben jedem Moebel und jeder Wand gefunden')
  if (leer) {
    await zeigerWeg(page)
    const vorher = await page.evaluate(() => ({
      ursprung: window.__zg.aufBild(0, 0),
      orte: window.__zg.liste().map((e) => e.x + ',' + e.y).join('|'),
      treffer: null
    }))
    await page.evaluate((p) => window.__zg.maus('mousemove', p.bx, p.by), leer)
    await schlaf(page, 120)
    const trefferLeer = await page.evaluate(() => window.__zg.treffer())
    await ziehe(page, { x: leer.bx, y: leer.by }, { x: leer.bx + 90, y: leer.by + 60 })
    const nachher = await page.evaluate(() => ({
      ursprung: window.__zg.aufBild(0, 0),
      orte: window.__zg.liste().map((e) => e.x + ',' + e.y).join('|')
    }))
    const geschwenkt = Math.hypot(
      nachher.ursprung.x - vorher.ursprung.x,
      nachher.ursprung.y - vorher.ursprung.y
    )
    pruefe(
      trefferLeer.ausstattung === null && trefferLeer.wand === null && trefferLeer.ecke === null,
      `c) der gewaehlte Punkt greift wirklich nichts (${JSON.stringify(trefferLeer)})`
    )
    pruefe(geschwenkt > 60, `c) GEGENPROBE: der Zug daneben SCHWENKT die Ansicht (${geschwenkt.toFixed(0)} px)`)
    pruefe(nachher.orte === vorher.orte, 'c) GEGENPROBE: und kein einziges Moebel hat sich dabei bewegt')
  }

  /* ══ a) DER ZUG ══════════════════════════════════════════════════════ */
  // Bildpunkte NEU bestimmen: der Schwenk oben hat die Ansicht verschoben.
  const punkte2 = await page.evaluate(
    (a) => ({
      von: window.__zg.aufBild(a.gx, a.gy),
      nach: window.__zg.aufBild(a.zx, a.zy),
      imBild: (function () {
        const c = window.__zg.canvas()
        const v = window.__zg.aufBild(a.gx, a.gy)
        const n = window.__zg.aufBild(a.zx, a.zy)
        const drin = (p) => p.x > 100 && p.y > 100 && p.x < c.width - 100 && p.y < c.height - 100
        return drin(v) && drin(n)
      })()
    }),
    { gx: griff.x, gy: griff.y, zx: zeigerZiel.x, zy: zeigerZiel.y }
  )
  if (!punkte2.imBild) {
    // Der Schwenk hat die Stelle aus dem Bild getragen — zurueckschwenken,
    // statt eine Messung ausserhalb des Canvas zu erfinden.
    await page.evaluate(
      (a) => {
        const p = window.__zg.aufBild(a.x, a.y)
        const c = window.__zg.canvas()
        window.__zg.zoomeAufPunkt(window.__zg.proCm() * 2.032, p.x, p.y)
        void c
      },
      { x: stuhl.x, y: stuhl.y }
    )
  }
  const p3 = await page.evaluate(
    (a) => ({ von: window.__zg.aufBild(a.gx, a.gy), nach: window.__zg.aufBild(a.zx, a.zy) }),
    { gx: griff.x, gy: griff.y, zx: zeigerZiel.x, zy: zeigerZiel.y }
  )

  // Tinte VOR dem Zug: am Ablageort darf nichts liegen, am Herkunftsort schon.
  await zeigerWeg(page)
  const tinteVor = await page.evaluate(
    (a) => ({
      ziel: window.__zg.tinte(window.__zg.kasten(a.zx, a.zy, 60)),
      quelle: window.__zg.tinte(window.__zg.kasten(a.sx, a.sy, 60))
    }),
    { zx: wahl.ziel.x, zy: wahl.ziel.y, sx: stuhl.x, sy: stuhl.y }
  )
  await page.screenshot({ path: bild('A_vor_dem_zug') })

  await ziehe(page, p3.von, p3.nach)
  const gezogen = await page.evaluate((id) => window.__zg.stueck(id), stuhl.id)
  const stilNachher = await page.evaluate(() => window.__zg.zeigerStil())
  const abweichung = gezogen
    ? Math.hypot(gezogen.x - wahl.ziel.x, gezogen.y - wahl.ziel.y)
    : Infinity
  log(
    `     Zug: Welt(${stuhl.x}, ${stuhl.y}) -> (${gezogen?.x}, ${gezogen?.y}), ` +
      `gewollt (${wahl.ziel.x.toFixed(1)}, ${wahl.ziel.y.toFixed(1)}) = ${abweichung.toFixed(1)} cm daneben`
  )
  // Erlaubt ist: die halbe Rasterweite (2,5 cm) plus ein Bildpunkt Umrechnung.
  const toleranzCm = 2.5 + 1.5 / wahl.proCm
  pruefe(
    abweichung <= toleranzCm,
    `a) der Stuhl landet DORT, wo losgelassen wurde (${abweichung.toFixed(1)} cm daneben, erlaubt ${toleranzCm.toFixed(1)} cm — Griff-Versatz gehalten)`
  )
  pruefe(stilNachher !== 'grabbing', `a) nach dem Loslassen zeigt der Zeiger kein "grabbing" mehr ("${stilNachher}")`)

  await zeigerWeg(page)
  const tinteNach = await page.evaluate(
    (a) => ({
      ziel: window.__zg.tinte(window.__zg.kasten(a.zx, a.zy, 60)),
      quelle: window.__zg.tinte(window.__zg.kasten(a.sx, a.sy, 60))
    }),
    { zx: wahl.ziel.x, zy: wahl.ziel.y, sx: stuhl.x, sy: stuhl.y }
  )
  await page.screenshot({ path: bild('B_nach_dem_zug') })
  log(
    `     Tinte am Ablageort: ${tinteVor.ziel.n} -> ${tinteNach.ziel.n} Bildpunkte · ` +
      `am Herkunftsort: ${tinteVor.quelle.n} -> ${tinteNach.quelle.n}`
  )
  // Die Schwellen sind GEMESSEN, nicht geraten: ein 45-cm-Stuhl bringt bei
  // rund 0,6 px/cm etwa 50 Bildpunkte Linie mit — GESTRICHELT, wie er nach dem
  // Zug gezeichnet wird, noch die Haelfte davon. 15 liegt deutlich darueber und
  // ebenso deutlich ueber dem Rauschen des leeren Ablageorts (gemessen: 0).
  pruefe(
    tinteVor.ziel.n < 10 && tinteNach.ziel.n > 15,
    `a) im BILD steht am Ablageort jetzt wirklich etwas (${tinteVor.ziel.n} -> ${tinteNach.ziel.n} Bildpunkte)`
  )
  // Am Herkunftsort bleibt Tinte von NACHBARN liegen — der Kasten ist 120 cm
  // breit. Bewiesen werden muss, dass der Stuhl selbst weg ist, also ein
  // Rueckgang in seiner Groessenordnung, nicht ein Rueckgang auf null.
  pruefe(
    tinteVor.quelle.n - tinteNach.quelle.n > 15,
    `a) und am Herkunftsort ist es verschwunden (${tinteVor.quelle.n} -> ${tinteNach.quelle.n} Bildpunkte)`
  )
  if (tinteNach.ziel.cx !== null) {
    const soll = await page.evaluate((a) => window.__zg.aufBild(a.x, a.y), wahl.ziel)
    const schwerpunktAb = Math.hypot(tinteNach.ziel.cx - soll.x, tinteNach.ziel.cy - soll.y)
    pruefe(
      schwerpunktAb < 20,
      `a) der Schwerpunkt der Tinte sitzt auf dem Ablageort (${schwerpunktAb.toFixed(1)} px daneben)`
    )
  }

  /* ══ e) gesetzt statt gemessen — in den Daten UND im Bild ═════════════ */
  const herkunft = await page.evaluate(
    (id) => {
      const liste = window.__zg.liste()
      const el = window.__zg.stueck(id)
      return {
        quelle: el ? el.quelle : null,
        gesetzt: window.__zg.gesetzte(),
        gemessen: liste.filter((e) => e.quelle === 'gemessen').length,
        gesamt: liste.length
      }
    },
    stuhl.id
  )
  pruefe(herkunft.quelle === 'gesetzt', `e) das gezogene Stueck ist "gesetzt" (${herkunft.quelle})`)
  pruefe(
    herkunft.gesetzt === 1 && herkunft.gemessen === herkunft.gesamt - 1,
    `e) GEGENPROBE: alle anderen bleiben "gemessen" (${herkunft.gemessen} von ${herkunft.gesamt})`
  )

  // Strichprobe: DASSELBE Stueck, DIESELBE Stelle, DERSELBE Massstab — nur die
  // Herkunft wechselt. Gestrichelt hat Luecken, also weniger Tinte. Ein Blick
  // aufs Datenfeld bestuende auch dann, wenn der Zeichner es ignoriert.
  const strich = await page.evaluate(
    (a) => {
      const vorher = window.__zg.ausstattungRoh()
      const kasten = window.__zg.kasten(a.zx, a.zy, 60)
      const gestrichelt = window.__zg.tinte(kasten).n
      window.__zg.setzeAusstattung(vorher.map((e) => Object.assign({}, e, { quelle: 'gemessen' })))
      const solide = window.__zg.tinte(kasten).n
      window.__zg.setzeAusstattung(vorher) // Zustand exakt wiederherstellen
      return { gestrichelt, solide, quelleDanach: window.__zg.stueck(a.id).quelle }
    },
    { zx: wahl.ziel.x, zy: wahl.ziel.y, id: stuhl.id }
  )
  await schlaf(page, 150)
  log(`     Strichprobe: gestrichelt ${strich.gestrichelt} Bildpunkte, durchgezogen ${strich.solide}`)
  pruefe(
    strich.gestrichelt < strich.solide,
    `e) "gesetzt" wird SICHTBAR anders gezeichnet — gestrichelt, also weniger Tinte (${strich.solide} -> ${strich.gestrichelt})`
  )
  pruefe(strich.quelleDanach === 'gesetzt', 'e) und die Strichprobe hat den Zustand nicht verstellt')

  /* ══ g) Die Axonometrie folgt ════════════════════════════════════════ */
  const axoNach = await hilfen.axoBild()
  pruefe(
    axoNach !== axoA,
    `g) die Axonometrie zeigt nach dem Zug ein ANDERES Bild (Pruefsumme ${axoA} -> ${axoNach})`
  )

  /* ══ d) Der ganze Zug ist EIN Rueckgaengig-Schritt ════════════════════ */
  const konnteZurueck = await page.evaluate(() => window.__zg.kannZurueck())
  await page.evaluate(() => window.__zg.undoJetzt())
  await schlaf(page, 700)
  const zurueck = await page.evaluate((id) => window.__zg.stueck(id), stuhl.id)
  pruefe(konnteZurueck === true, 'd) es gibt etwas zurueckzunehmen')
  pruefe(
    zurueck !== null,
    `d) DASSELBE Stueck ist nach dem Rueckgaengig ueber DIESELBE Kennung auffindbar ("${stuhl.id}")`
  )
  pruefe(
    zurueck && zurueck.x === stuhl.x && zurueck.y === stuhl.y,
    `d) EIN Rueckgaengig stellt den GANZEN Zug zurueck (${zurueck?.x}, ${zurueck?.y} statt ${gezogen?.x}, ${gezogen?.y})`
  )
  pruefe(
    zurueck && zurueck.quelle === 'gemessen',
    `d) und es gilt wieder als gemessen (${zurueck?.quelle})`
  )
  await page.screenshot({ path: bild('C_nach_rueckgaengig') })

  /* ══ f) Einrasten an der Wand — mit Gegenprobe ════════════════════════ */
  const wandFall = await page.evaluate(() => {
    const c = window.__zg.canvas()
    const liste = window.__zg.liste()
    const waende = window.__zg.waende()
    const stuehle = liste.filter((e) => e.typ === 'stuhl' && e.quelle === 'gemessen')
    // Eine lange Wand suchen, an deren Mitte genug Platz ist.
    const lang = waende
      .map((w) => Object.assign({}, w, { laenge: Math.hypot(w.wbx - w.wax, w.wby - w.way) }))
      .filter((w) => w.laenge > 300)
      .sort((a, b) => b.laenge - a.laenge)
    for (const w of lang) {
      const mx = (w.wax + w.wbx) / 2, my = (w.way + w.wby) / 2
      const dx = (w.wbx - w.wax) / w.laenge, dy = (w.wby - w.way) / w.laenge
      const nx = -dy, ny = dx
      for (const seite of [1, -1]) {
        // Ziel: 8 cm VOR der buendigen Lage — also innerhalb der 15-cm-Zone.
        const soll = 22.5 + w.dicke / 2
        const zx = mx + nx * seite * (soll + 8), zy = my + ny * seite * (soll + 8)
        // Der Ablageort darf keiner ANDEREN Wand naeher sein als dieser.
        let andere = Infinity
        waende.forEach((v) => {
          if (v.id === w.id) return
          const vdx = v.wbx - v.wax, vdy = v.wby - v.way
          const l2 = vdx * vdx + vdy * vdy
          if (!l2) return
          let t = ((zx - v.wax) * vdx + (zy - v.way) * vdy) / l2
          t = Math.max(0, Math.min(1, t))
          const d = Math.hypot(zx - (v.wax + vdx * t), zy - (v.way + vdy * t))
          if (d < andere) andere = d
        })
        if (andere < 150) continue
        for (const s of stuehle) {
          if (Math.hypot(s.x - zx, s.y - zy) > 900) continue
          const p = window.__zg.aufBild(s.x, s.y)
          window.__zg.zoomeAufPunkt(1.0, c.width / 2, c.height / 2)
          const ps = window.__zg.aufBild(s.x, s.y)
          const pz = window.__zg.aufBild(zx, zy)
          const drin = (q) => q.x > 90 && q.y > 90 && q.x < c.width - 90 && q.y < c.height - 90
          void p
          if (!drin(ps) || !drin(pz)) continue
          return {
            stuhl: s, ziel: { x: zx, y: zy },
            wand: { id: w.id, wax: w.wax, way: w.way, wbx: w.wbx, wby: w.wby, dicke: w.dicke },
            soll, winkel: Math.atan2(w.wby - w.way, w.wbx - w.wax)
          }
        }
      }
    }
    return null
  })
  pruefe(wandFall !== null, 'f) ein Stuhl und eine lange Wand in Reichweite gefunden')

  if (wandFall) {
    log(
      `     Einrasten an Wand "${wandFall.wand.id}" (Dicke ${wandFall.wand.dicke} cm): ` +
        `buendig waeren ${wandFall.soll.toFixed(2)} cm Achsabstand, losgelassen wird bei ${(wandFall.soll + 8).toFixed(2)} cm`
    )

    // --- GEGENPROBE ZUERST: Einrasten AUS.
    await page.evaluate(() => window.__zg.setzeEinrasten(false))
    const aus = await page.evaluate(() => window.__zg.einrasten())
    const ohne = await ziehZurWand(page, wandFall)
    pruefe(aus === false, 'f) GEGENPROBE: das Einrasten laesst sich abschalten')
    pruefe(
      Math.abs(ohne.achsAbstand - (wandFall.soll + 8)) < 3,
      `f) GEGENPROBE: OHNE Einrasten bleibt der Stuhl liegen, wo losgelassen wurde ` +
        `(${ohne.achsAbstand.toFixed(2)} cm Achsabstand statt ${wandFall.soll.toFixed(2)} cm buendig)`
    )
    await page.evaluate(() => window.__zg.undoJetzt())
    await schlaf(page, 500)

    // --- jetzt mit Einrasten.
    await page.evaluate(() => window.__zg.setzeEinrasten(true))
    const mit = await ziehZurWand(page, wandFall)
    pruefe(
      Math.abs(mit.achsAbstand - wandFall.soll) < 1.5,
      `f) MIT Einrasten liegt der Rand buendig an der Wand ` +
        `(${mit.achsAbstand.toFixed(2)} cm Achsabstand, buendig waeren ${wandFall.soll.toFixed(2)} cm)`
    )
    const winkelAb = Math.abs(
      ((mit.drehung - wandFall.winkel) % (Math.PI / 2) + Math.PI) % (Math.PI / 2)
    )
    pruefe(
      winkelAb < 0.01 || Math.abs(winkelAb - Math.PI / 2) < 0.01,
      `f) und die Drehung hat den Wandwinkel uebernommen (Rest ${(winkelAb * 180 / Math.PI).toFixed(2)}°)`
    )
    await page.screenshot({ path: bild('D_an_der_wand') })
    await page.evaluate(() => window.__zg.undoJetzt())
    await schlaf(page, 500)
  }

  /* ══ h) Drehen mit Q/E ═══════════════════════════════════════════════ */
  const drehung = await page.evaluate(async (id) => {
    const el = window.__zg.stueck(id)
    const p = window.__zg.aufBild(el.x, el.y)
    window.__zg.maus('mousemove', p.x, p.y)
    const vorher = window.__zg.stueck(id).drehung
    window.__zg.taste('e')
    const nachE = window.__zg.stueck(id).drehung
    window.__zg.taste('q')
    const nachQ = window.__zg.stueck(id).drehung
    // GEGENPROBE: eine Taste, die nichts zu tun hat, darf nichts drehen.
    window.__zg.taste('x')
    const nachX = window.__zg.stueck(id).drehung
    return { vorher, nachE, nachQ, nachX, quelle: window.__zg.stueck(id).quelle }
  }, stuhl.id)
  const schritt = Math.abs(drehung.nachE - drehung.vorher)
  log(
    `     Drehen: ${(drehung.vorher * 180 / Math.PI).toFixed(1)}° -E-> ${(drehung.nachE * 180 / Math.PI).toFixed(1)}° ` +
      `-Q-> ${(drehung.nachQ * 180 / Math.PI).toFixed(1)}°`
  )
  pruefe(
    Math.abs(schritt - Math.PI / 12) < 1e-6 || Math.abs(schritt - (2 * Math.PI - Math.PI / 12)) < 1e-6,
    `h) "E" dreht um genau 15° (${((schritt * 180) / Math.PI).toFixed(2)}°)`
  )
  pruefe(
    Math.abs(drehung.nachQ - drehung.vorher) < 1e-6 ||
      Math.abs(Math.abs(drehung.nachQ - drehung.vorher) - 2 * Math.PI) < 1e-6,
    `h) "Q" dreht wieder zurueck (${(drehung.nachQ * 180 / Math.PI).toFixed(2)}° vs. ${(drehung.vorher * 180 / Math.PI).toFixed(2)}°)`
  )
  pruefe(drehung.nachX === drehung.nachQ, 'h) GEGENPROBE: eine andere Taste dreht nichts')
  pruefe(drehung.quelle === 'gesetzt', `h) ein gedrehtes Stueck gilt als "gesetzt" (${drehung.quelle})`)
}

/** Zieht den Stuhl des Wand-Falls an seinen Ablageort und misst den Achsabstand. */
async function ziehZurWand(page, fall) {
  const p = await page.evaluate(
    (a) => {
      const s = window.__zg.stueck(a.id)
      return {
        von: window.__zg.aufBild(s.x, s.y),
        nach: window.__zg.aufBild(a.ziel.x, a.ziel.y)
      }
    },
    { id: fall.stuhl.id, ziel: fall.ziel }
  )
  await zeigerWeg(page)
  await ziehe(page, p.von, p.nach)
  return page.evaluate(
    (a) => {
      const s = window.__zg.stueck(a.id)
      return {
        x: s.x, y: s.y, drehung: s.drehung,
        achsAbstand: window.__zg.achsAbstand(s.x, s.y, a.wand)
      }
    },
    { id: fall.stuhl.id, wand: fall.wand }
  )
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

  /** Bild der Axonometrie: hin, messen, zurueck. Der Umschalter ist die
   *  einzige Bedienung, die es dafuer gibt — gemessen wird also das, was der
   *  Nutzer auch saehe. Ein Klick geht hier ueber Playwright, weil die
   *  Axonometrie KEINE Dauer-Zeichenschleife hat (anders als der 2D-Zeichner). */
  const axoBildPlaner = async () => {
    await page.getByRole('button', { name: 'Axonometrie', exact: true }).click()
    await page.waitForTimeout(1200)
    const summe = await page.evaluate(() => {
      const c = [...document.querySelectorAll('canvas')].find(
        (x) => x.width > 100 && x.offsetParent !== null
      )
      if (!c) return null
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
      let s = 2166136261
      for (let i = 0; i < d.length; i += 16) {
        s ^= (d[i] + d[i + 1] * 3 + d[i + 2] * 7 + d[i + 3] * 11) & 255
        s = Math.imul(s, 16777619)
      }
      return s >>> 0
    })
    await page.getByRole('button', { name: '2D', exact: true }).click()
    await page.waitForTimeout(1200)
    return summe
  }

  await pruefeWelt(page, 'Planer', { axoBild: axoBildPlaner })
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
    // In den Grundriss: der Bearbeiten-Schalter blendet die Werkzeuge ein.
    await page.evaluate(() => {
      document.getElementById('btnBearbeiten').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await page.waitForTimeout(800)
    await page.evaluate(ADAPTER_DATEI)
    await page.evaluate(MESSZUGANG)

    const axoBildDatei = async () => {
      await page.evaluate(() => {
        document.getElementById('btnAnsichtAxo').dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      await page.waitForTimeout(900)
      const summe = await page.evaluate(() => window.__planerDatei.bildBlatt().summe)
      await page.evaluate(() => {
        document.getElementById('btnAnsichtPlan').dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      await page.waitForTimeout(500)
      return summe
    }

    /* ══ Der Zaehler im Blattkopf ══════════════════════════════════════
       Die GEGENPROBE zuerst und ganz am Anfang: solange nichts gesetzt ist,
       muss die Zeile schweigen. Spaeter gemessen waere sie durch den
       Pruefablauf laengst gefuellt — die erste Fassung dieses Gates mass genau
       dort und meldete falsch rot. */
    const zaehlerAmAnfang = await page.evaluate(() => ({
      text: window.__planerDatei.gesetztText(),
      gesetzt: window.__planerDatei.gesetzte()
    }))

    await pruefeWelt(page, 'Datei', { axoBild: axoBildDatei })

    welt = 'Datei'
    pruefe(
      zaehlerAmAnfang.text === null && zaehlerAmAnfang.gesetzt === 0,
      `Blattkopf: solange nichts frei gesetzt ist, schweigt der Zaehler (${JSON.stringify(zaehlerAmAnfang.text)}, ${zaehlerAmAnfang.gesetzt} gesetzt)`
    )

    // Und jetzt: ein Stueck ziehen und nachsehen, ob das Blatt es SAGT.
    const zaehler = await page.evaluate(() => {
      const liste = window.__zg.liste()
      const s = liste.find((e) => e.typ === 'stuhl')
      const p = window.__zg.aufBild(s.x, s.y)
      window.__zg.maus('mousemove', p.x, p.y)
      window.__zg.maus('mousedown', p.x, p.y)
      window.__zg.maus('mousemove', p.x + 40, p.y + 30)
      window.__zg.maus('mouseup', p.x + 40, p.y + 30)
      return { gesetzt: window.__zg.gesetzte() }
    })
    await page.waitForTimeout(400)
    const zaehlerNach = await page.evaluate(() => ({
      text: window.__planerDatei.gesetztText(),
      gesetzt: window.__planerDatei.gesetzte()
    }))
    pruefe(
      zaehlerNach.gesetzt >= zaehler.gesetzt && zaehlerNach.gesetzt > 0,
      `Blattkopf: es ist wirklich etwas frei gesetzt (${zaehlerNach.gesetzt} Stueck)`
    )
    pruefe(
      zaehlerNach.text === `${zaehlerNach.gesetzt} Stück frei gesetzt — kein Aufmaß`,
      `Blattkopf: er nennt die frei gesetzten Stuecke ("${zaehlerNach.text}")`
    )
    await page.evaluate(() => {
      document.getElementById('btnAnsichtAxo').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await page.waitForTimeout(900)
    await page.screenshot({ path: path.join(DIR, 'Datei_E_blattkopf.png') })

    pruefe(
      blockiert.length === 0,
      `h) KEINE Anfrage nach draussen (${blockiert.length} blockiert${blockiert.length ? ': ' + blockiert.slice(0, 3).join(', ') : ''})`
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
