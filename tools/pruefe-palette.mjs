// Prueft die PALETTE (W3) — neue Stuecke in den Grundriss ziehen.
//
// Voraussetzung: die Doppelklick-Datei ist gebaut.
//   node tools/baue-planer-datei.mjs
//   node tools/pruefe-palette.mjs [--datei Halle400-Modell.html]
// Exit 0 = alle Pruefungen bestanden, 1 = mindestens eine durchgefallen.
//
// WORUM ES GEHT — DIE HALBE TYP-KETTE
// Ein neuer Ausstattungs-Typ muss an NEUN Stellen eingetragen werden (Union,
// OBERKANTE_CM, KOERPER_CM, FARBE, AUSSTATTUNG_NAME, zeichneAusstattung,
// AUSSTATTUNG_STIL, ERLAUBTE_TYPEN, und ein Gate, das es merkt). Faellt eine
// davon aus, ist der Fehler LAUTLOS und irrefuehrend: der 2D-Zeichner ist
// fail-open (`case 'tisch': default:` malt jeden unbekannten Typ als Rechteck),
// Axonometrie, 3D und Export sind fail-closed. Das Stueck steht also im
// Grundriss und fehlt im Blatt — man sucht den Fehler dann dort, wo er nicht
// ist. Dieses Werkzeug misst genau diese Luecke: es zaehlt die Koerper der
// Axonometrie gegen die Stuecke des Modells und verlangt GLEICHHEIT.
//
// SIEBEN BEHAUPTUNGEN, die hier bewiesen werden:
//
//   a) Jeder neue Typ ist im Grundriss SICHTBAR und in der Axonometrie
//      vorhanden — die Pruefung gegen die halbe Kette.
//   b) Ein Stueck aus der Palette landet DORT, wo es abgelegt wurde, ist
//      `gesetzt` und wird GESTRICHELT gezeichnet (mit Strichprobe gegen
//      dasselbe Stueck als `gemessen`).
//   c) GEGENPROBE: Ablegen ausserhalb der Zeichenflaeche erzeugt NICHTS.
//   d) Das Ablegen ist EIN Rueckgaengig-Schritt; danach ist das Stueck weg.
//   e) Die Stueckzahl stimmt vorher/nachher EXAKT (Gleichheit, keine
//      Untergrenze — sie faellt damit auf Verlust UND auf Erfindung).
//   f) Das neue Stueck ueberlebt Sichern und Laden als Datei.
//   g) GEGENPROBE DES WAECHTERS: ein absichtlich halb verdrahteter Typ wird
//      ERKANNT. Danach wird der Zustand wieder hergestellt.
//
// Dazu: das Ablegen benutzt DIESELBE Einrast-Rechnung wie das Ziehen (W2) —
// gemessen an einer Wand, nicht behauptet.
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
const DATEI = path.resolve(WURZEL, arg('--datei', 'Halle400-Modell.html'))

/** Die Typen, die W3 neu eingefuehrt hat. Genau diese muessen die ganze Kette
 *  durchlaufen; die alten sind seit A1/A6 belegt. */
const NEUE_TYPEN = ['matte', 'geraet', 'liege']

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'h400-palette-'))
const BERICHT = path.join(DIR, 'bericht.txt')
fs.writeFileSync(BERICHT, '')
const log = (s) => {
  console.log(s)
  fs.appendFileSync(BERICHT, s + '\n')
}
const fehler = []
const pruefe = (bedingung, text) => {
  const zeile = `${bedingung ? 'OK  ' : 'FEHL'} ${text}`
  log(zeile)
  if (!bedingung) fehler.push(text)
}

/* ── Der Messzugang in der Seite ──────────────────────────────────────────
   Alles, was Bildpunkte zaehlt oder Ereignisse ausloest, liegt HIER und nicht
   verstreut in den einzelnen Pruefungen: zwei Messungen derselben Groesse mit
   zwei verschiedenen Toleranzen waeren zwei Massstaebe. */
const MESSZUGANG = `(function(){
  const AUSSTATTUNG_LINIE = [125, 138, 156];   // #7d8a9c aus floorplanner_view.ts
  const nah = (v, soll) => Math.abs(v - soll) <= 22;
  const d = window.__planerDatei;

  window.__pa = {
    canvas: function(){ return document.getElementById('grundriss-canvas'); },

    /** Zeiger vom Messfeld wegfahren — die Hervorhebung faerbt sonst mit. */
    zeigerWeg: function(){
      const c = window.__pa.canvas();
      const r = c.getBoundingClientRect();
      c.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.left + 3, clientY: r.top + 3 }));
    },

    /** Tinte der AUSSTATTUNGS-Linienfarbe in einem Bildausschnitt. Nur diese
     *  eine Farbe, damit Wandkanten und Raster nicht mitgezaehlt werden. */
    tinte: function(k){
      const c = window.__pa.canvas();
      const x0 = Math.max(0, Math.round(k.x0)), y0 = Math.max(0, Math.round(k.y0));
      const x1 = Math.min(c.width, Math.round(k.x1)), y1 = Math.min(c.height, Math.round(k.y1));
      if (x1 - x0 < 4 || y1 - y0 < 4) return 0;
      const px = c.getContext('2d').getImageData(x0, y0, x1 - x0, y1 - y0).data;
      let n = 0;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] <= 10) continue;
        if (px[i + 2] - px[i] < 12) continue;
        if (!nah(px[i], AUSSTATTUNG_LINIE[0]) || !nah(px[i+1], AUSSTATTUNG_LINIE[1]) || !nah(px[i+2], AUSSTATTUNG_LINIE[2])) continue;
        n++;
      }
      return n;
    },

    /** Kasten von +- randCm um einen WELT-Punkt, in Bildkoordinaten. */
    kasten: function(x, y, randCm){
      const p = d.aufBild(x, y);
      const r = randCm * d.proCm();
      return { x0: p.x - r, y0: p.y - r, x1: p.x + r, y1: p.y + r };
    },

    /** Punkt-Abstand zu einer Wand-STRECKE (nicht zu ihrer Geraden), in cm. */
    wandAbstand: function(x, y){
      let min = Infinity;
      d.waende().forEach(function(w){
        const dx = w.wbx - w.wax, dy = w.wby - w.way;
        const l2 = dx * dx + dy * dy;
        if (l2 === 0) return;
        let t = ((x - w.wax) * dx + (y - w.way) * dy) / l2;
        t = Math.max(0, Math.min(1, t));
        const a = Math.hypot(x - (w.wax + dx * t), y - (w.way + dy * t));
        if (a < min) min = a;
      });
      return min;
    },

    /** Bild -> Welt. Die Abbildung ist linear, ein Bezugspunkt genuegt. */
    inWelt: function(bx, by){
      const bezug = d.aufBild(0, 0);
      const proCm = d.proCm();
      return { x: (bx - bezug.x) / proCm, y: (by - bezug.y) / proCm };
    },

    /**
     * Ein Ablageort in BILDSCHIRM-Koordinaten, der wirklich ueber der
     * Zeichenflaeche liegt (nicht unter Leiste, Palette oder Meldung).
     *
     * wandCm/moebelCm halten Abstand, WENN es einen gibt — dieser Plan ist
     * dicht bebaut, in der herangezoomten Ansicht gibt es oft keinen Punkt, der
     * beides erfuellt. Darum wird der Wunsch in Stufen aufgegeben statt an ihm
     * zu scheitern; gemeldet wird, welche Stufe getroffen hat. Ein Gate, das
     * schon an seiner Platzsuche stirbt, misst gar nichts.
     */
    freierPunkt: function(wandCm, moebelCm){
      const c = window.__pa.canvas();
      const r = c.getBoundingClientRect();
      const liste = d.ausstattung();
      const stufen = [
        { wand: wandCm, moebel: moebelCm },
        { wand: wandCm / 2, moebel: moebelCm / 2 },
        { wand: 0, moebel: 0 }
      ];
      for (const stufe of stufen) {
        for (let y = 150; y < c.height - 150; y += 25) {
          for (let x = 200; x < c.width - 150; x += 25) {
            if (document.elementFromPoint(r.left + x, r.top + y) !== c) continue;
            const w = window.__pa.inWelt(x, y);
            if (stufe.wand > 0 && window.__pa.wandAbstand(w.x, w.y) < stufe.wand) continue;
            if (stufe.moebel > 0) {
              let frei = true;
              for (const e of liste) if (Math.hypot(e.x - w.x, e.y - w.y) < stufe.moebel) { frei = false; break; }
              if (!frei) continue;
            }
            return { clientX: r.left + x, clientY: r.top + y, bx: x, by: y, wx: w.x, wy: w.y,
                     wandAbstand: window.__pa.wandAbstand(w.x, w.y), stufe: stufe.wand };
          }
        }
      }
      return null;
    },

    /** Ein Zug aus der Palette: greifen, in Stufen ziehen, loslassen. */
    ziehe: function(typ, clientX, clientY, schritte){
      const knopf = document.querySelector('.pstueck[data-typ="' + typ + '"]');
      if (!knopf) return false;
      const r = knopf.getBoundingClientRect();
      const vx = r.left + r.width / 2, vy = r.top + r.height / 2;
      knopf.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: vx, clientY: vy }));
      const n = schritte || 10;
      for (let i = 1; i <= n; i++) {
        document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true,
          clientX: vx + ((clientX - vx) * i) / n, clientY: vy + ((clientY - vy) * i) / n }));
      }
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: clientX, clientY: clientY }));
      return true;
    },

    /** Das zuletzt angelegte Stueck (die Liste waechst hinten). */
    letztes: function(){
      const l = d.ausstattung();
      return l.length ? l[l.length - 1] : null;
    },

    /** Setzt die Herkunft EINES Stuecks um, ohne einen Zug zu erzeugen — fuer
     *  die Strichprobe "wird gesetzt wirklich anders gezeichnet?". */
    setzeHerkunft: function(id, quelle){
      const roh = d.ausstattungRoh();
      roh.forEach(function(e){ if (e.id === id) e.quelle = quelle; });
      d.setzeAusstattung(roh);
    }
  };
})();`

/* ══════════════════════════════════════════════════════════════════════
   Ablauf
   ══════════════════════════════════════════════════════════════════════ */

if (!fs.existsSync(DATEI)) {
  log(`Die Doppelklick-Datei fehlt (${DATEI}) — erst "node tools/baue-planer-datei.mjs".`)
  process.exit(1)
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
const blockiert = []
await ctx.route('**/*', (route) => {
  const u = route.request().url()
  if (u.startsWith('file://') || u.startsWith('data:') || u.startsWith('blob:')) return route.continue()
  blockiert.push(u)
  return route.abort()
})
const page = await ctx.newPage()
const konsoleFehler = []
const konsoleWarnung = []
page.on('console', (m) => {
  if (m.type() === 'error') konsoleFehler.push(m.text().slice(0, 200))
  if (m.type() === 'warning') konsoleWarnung.push(m.text().slice(0, 300))
})
page.on('pageerror', (e) => konsoleFehler.push('PAGE-ERR: ' + String(e).slice(0, 200)))

const url = pathToFileURL(DATEI).href
log(`═══ Palette (W3) — ${url} (Netz GESPERRT) ═══`)

await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__bereit === true, { timeout: 25000 })

/* ── A · Die Palette erscheint mit den Werkzeugen ─────────────────────── */
const vorBearbeiten = await page.evaluate(() => window.__planerDatei.paletteSichtbar())
pruefe(vorBearbeiten === false, `A) im Auslieferungszustand ist die Palette WEG (sichtbar=${vorBearbeiten})`)

/* ZWEI Klicks seit W7: der Bearbeiten-Schalter laesst die Ansicht stehen
   (ausdruecklicher Nutzerwunsch), und die Palette liegt IM Grundriss — in der
   Axonometrie waere sie nutzlos, dort trifft ein Klick keinen Punkt, sondern
   einen Sehstrahl. Erst beides zusammen ergibt "Palette da". */
await page.evaluate(() => {
  document.getElementById('btnBearbeiten').dispatchEvent(new MouseEvent('click', { bubbles: true }))
})
await page.waitForTimeout(400)
const inDerAxo = await page.evaluate(() => ({
  ansicht: window.__planerDatei.ansicht(),
  palette: window.__planerDatei.paletteSichtbar()
}))
pruefe(
  inDerAxo.ansicht === 'axo' && inDerAxo.palette === false,
  `A) GEGENPROBE — der Schalter allein wechselt die Ansicht nicht, und in der Axonometrie gibt es keine Palette (${JSON.stringify(inDerAxo)})`
)
await page.evaluate(() => {
  document.getElementById('btnAnsichtPlan').dispatchEvent(new MouseEvent('click', { bubbles: true }))
})
await page.waitForTimeout(900)
await page.evaluate(MESSZUGANG)

const sichtbar = await page.evaluate(() => window.__planerDatei.paletteSichtbar())
pruefe(sichtbar === true, `A) im bearbeitbaren Grundriss ist sie da (sichtbar=${sichtbar})`)

/* Heranzoomen: bei eingepasster Halle ist eine 60 cm tiefe Matte zehn Bildpunkte
   hoch — ein Tintenschwerpunkt daraus waere Rauschen. 1,2 ist derselbe Massstab,
   mit dem `pruefe-ziehen.mjs` misst. */
await page.evaluate(() => {
  const c = document.getElementById('grundriss-canvas')
  window.__planerDatei.zoomeAufPunkt(1.2, c.width / 2, c.height / 2)
})
await page.waitForTimeout(300)
const massstab = await page.evaluate(() => window.__planerDatei.proCm())
log(`     Massstab ${massstab.toFixed(4)} px/cm`)

/* ── B · Die Vorschauen sind gezeichnet UND unterscheiden sich ────────── */
const eintraege = await page.evaluate(() => window.__planerDatei.paletteEintraege())
log(
  '     Palette: ' +
    eintraege.map((e) => `${e.name} (${e.typ}) ${e.breite}×${e.tiefe} cm, ${e.tinte} Bildpunkte`).join(' · ')
)
pruefe(
  eintraege.length >= 3 && NEUE_TYPEN.every((t) => eintraege.some((e) => e.typ === t)),
  `B) alle neuen Arten stehen in der Palette (${eintraege.map((e) => e.typ).join(', ')})`
)
pruefe(
  eintraege.every((e) => e.tinte > 40),
  `B) jede Vorschau ist wirklich gezeichnet (kleinste ${Math.min(...eintraege.map((e) => e.tinte))} Bildpunkte)`
)
// GEGENPROBE gegen "alle malen dasselbe Rechteck": die Bilder muessen sich
// unterscheiden. Ohne diese Zeile bestuende B auch eine Palette, die fuenfmal
// denselben Kasten zeigt — und dann waere die Vorschau wertlos.
const summen = new Set(eintraege.map((e) => e.summe))
pruefe(
  summen.size === eintraege.length,
  `B) GEGENPROBE: die Vorschauen sind VERSCHIEDEN (${summen.size} verschiedene von ${eintraege.length})`
)
const paletteEl = await page.$('#palette')
if (paletteEl) await paletteEl.screenshot({ path: path.join(DIR, 'A_palette.png') })

/* ── C · Je Typ: ablegen, messen, zuruecknehmen ───────────────────────────
   Das EINRASTEN ist waehrend dieser Runde ABGESCHALTET, und zwar mit Absicht:
   sonst maesse "es liegt, wo losgelassen wurde" in Wahrheit das Anlegen an die
   naechste Wand. Dass das Ablegen einrastet — und zwar mit derselben Rechnung
   wie das Ziehen — beweist Abschnitt E, an einer Wand, mit gemessenem Abstand. */
await page.evaluate(() => window.__planerDatei.setzeEinrasten(false))
await page.waitForTimeout(150)
pruefe(
  (await page.evaluate(() => window.__planerDatei.einrasten())) === false,
  'C) fuer die Ortsmessung ist das Einrasten abgeschaltet (Abschnitt E prueft es eigens)'
)

for (const typ of NEUE_TYPEN) {
  log(`\n── ${typ} ──`)
  const vorher = await page.evaluate(() => ({
    zahl: window.__planerDatei.zahlen().ausstattung,
    gesetzte: window.__planerDatei.gesetzte(),
    zurueck: window.__planerDatei.kannZurueck()
  }))

  const punkt = await page.evaluate(() => window.__pa.freierPunkt(260, 220))
  pruefe(punkt !== null, `${typ}: ein Ablageort auf der Zeichenflaeche gefunden`)
  if (!punkt) continue
  log(
    `     Ablage bei Bild(${punkt.bx}, ${punkt.by}) = Welt(${punkt.wx.toFixed(0)}, ${punkt.wy.toFixed(0)}), ` +
      `${punkt.wandAbstand.toFixed(0)} cm zur naechsten Wand`
  )

  /* Die Tinte VOR dem Ablegen im selben Kasten. Ein blosses "danach ist Tinte
     da" bewiese nichts: der Plan ist dicht bebaut, in fast jedem Kasten liegt
     schon etwas. Gemessen wird der ZUWACHS. */
  await page.evaluate(() => window.__pa.zeigerWeg())
  await page.waitForTimeout(140)
  const tinteVorher = await page.evaluate(
    (p) => window.__pa.tinte(window.__pa.kasten(p.wx, p.wy, 150)),
    punkt
  )

  await page.evaluate((a) => window.__pa.ziehe(a.typ, a.x, a.y), {
    typ,
    x: punkt.clientX,
    y: punkt.clientY
  })
  await page.waitForTimeout(320)

  const nachher = await page.evaluate(() => ({
    zahl: window.__planerDatei.zahlen().ausstattung,
    gesetzte: window.__planerDatei.gesetzte(),
    zurueck: window.__planerDatei.kannZurueck()
  }))
  // e) GLEICHHEIT, nicht "mindestens": faellt auf Verlust UND auf Erfindung.
  pruefe(
    nachher.zahl === vorher.zahl + 1,
    `${typ}: e) genau EIN Stueck mehr (${vorher.zahl} -> ${nachher.zahl})`
  )
  pruefe(
    nachher.gesetzte === vorher.gesetzte + 1,
    `${typ}: es zaehlt als frei gesetzt (${vorher.gesetzte} -> ${nachher.gesetzte})`
  )

  const el = await page.evaluate(() => window.__pa.letztes())
  pruefe(el !== null && el.typ === typ, `${typ}: b) das neue Stueck hat die gezogene Art (${el && el.typ})`)
  pruefe(el !== null && el.quelle === 'gesetzt', `${typ}: b) es ist "gesetzt" (${el && el.quelle})`)
  pruefe(
    el !== null && el.breite > 0 && el.tiefe > 0,
    `${typ}: b) es hat ein Standardmass (${el && el.breite} × ${el && el.tiefe} cm)`
  )

  // b) DORT, wo losgelassen wurde. Ohne Einrasten wird nur auf ganze Zentimeter
  // gerundet (Projekt-DNA Punkt 3) — bei 0,59 px/cm gut ein halber Bildpunkt.
  // 3 Bildpunkte Toleranz sind reichlich und immer noch ein Bruchteil der
  // Stueckgroesse.
  const abx = Math.abs(el.bx - punkt.bx)
  const aby = Math.abs(el.by - punkt.by)
  pruefe(
    abx <= 3 && aby <= 3,
    `${typ}: b) es liegt, wo losgelassen wurde (Bild ${el.bx.toFixed(1)}/${el.by.toFixed(1)} gegen ${punkt.bx}/${punkt.by}, ab ${abx.toFixed(1)}/${aby.toFixed(1)} px)`
  )

  // a) SICHTBAR im Grundriss — gemessen als ZUWACHS im selben Kasten.
  await page.evaluate(() => window.__pa.zeigerWeg())
  await page.waitForTimeout(140)
  const tinteGestrichelt = await page.evaluate(
    (p) => window.__pa.tinte(window.__pa.kasten(p.wx, p.wy, 150)),
    punkt
  )
  pruefe(
    tinteGestrichelt > tinteVorher,
    `${typ}: a) es ist im Grundriss SICHTBAR — die Tinte im selben Kasten waechst (${tinteVorher} -> ${tinteGestrichelt} Bildpunkte)`
  )

  // b) GESTRICHELT — bewiesen am selben Stueck an derselben Stelle, nur mit
  // anderer Herkunft. Ein Vergleich mit einem ANDEREN Stueck maesse dessen Form.
  await page.evaluate((id) => window.__pa.setzeHerkunft(id, 'gemessen'), el.id)
  await page.evaluate(() => window.__pa.zeigerWeg())
  await page.waitForTimeout(140)
  const tinteFest = await page.evaluate(
    (p) => window.__pa.tinte(window.__pa.kasten(p.wx, p.wy, 150)),
    punkt
  )
  pruefe(
    tinteFest > tinteGestrichelt,
    `${typ}: b) "gesetzt" wird SICHTBAR anders gezeichnet — gestrichelt, also weniger Tinte (${tinteGestrichelt} gegen ${tinteFest} durchgezogen)`
  )
  await page.evaluate((id) => window.__pa.setzeHerkunft(id, 'gesetzt'), el.id)

  // a) In der AXONOMETRIE — die Pruefung gegen die halbe Kette.
  await page.evaluate(() => window.__planerDatei.axoNeuBauen())
  await page.waitForTimeout(200)
  const szene = await page.evaluate(() => ({
    moebel: window.__planerDatei.szeneMoebel(),
    stuecke: window.__planerDatei.zahlen().ausstattung
  }))
  pruefe(
    szene.moebel === szene.stuecke,
    `${typ}: a) die Axonometrie baut GENAU EINEN Koerper je Stueck (${szene.moebel}/${szene.stuecke}) — die Typ-Kette ist vollstaendig`
  )

  // d) EIN Rueckgaengig-Schritt.
  await page.evaluate(() => window.__planerDatei.undoJetzt())
  await page.waitForTimeout(320)
  const nachUndo = await page.evaluate(
    (id) => ({
      zahl: window.__planerDatei.zahlen().ausstattung,
      gesetzte: window.__planerDatei.gesetzte(),
      stueck: window.__planerDatei.stueck(id),
      zurueck: window.__planerDatei.kannZurueck()
    }),
    el.id
  )
  pruefe(
    nachUndo.zahl === vorher.zahl && nachUndo.stueck === null,
    `${typ}: d) EIN Strg+Z nimmt das Ablegen ganz zurueck (${nachher.zahl} -> ${nachUndo.zahl}, Stueck weg: ${nachUndo.stueck === null})`
  )
  pruefe(
    nachUndo.gesetzte === vorher.gesetzte,
    `${typ}: e) auch der Zaehler der frei gesetzten Stuecke ist wieder wie vorher (${nachUndo.gesetzte})`
  )
  pruefe(
    nachUndo.zurueck === vorher.zurueck,
    `${typ}: d) GEGENPROBE: die Historie ist wieder so tief wie vorher — das Ablegen war EIN Schritt, nicht drei (kannZurueck ${vorher.zurueck} -> ${nachUndo.zurueck})`
  )
}

// Einrasten wieder an — der Auslieferungszustand, und Abschnitt E braucht es.
await page.evaluate(() => window.__planerDatei.setzeEinrasten(true))
await page.waitForTimeout(150)

/* ── D · GEGENPROBE: ausserhalb der Zeichenflaeche entsteht NICHTS ────── */
log('\n── Gegenproben zum Ablegen ──')
const vorGegen = await page.evaluate(() => ({
  zahl: window.__planerDatei.zahlen().ausstattung,
  zurueck: window.__planerDatei.kannZurueck()
}))
// Auf der Palette selbst loslassen. Sie liegt UEBER der bildschirmfuellenden
// Zeichenflaeche — ein blosser Rechteck-Vergleich haette das faelschlich als
// "im Grundriss" gewertet und ein Stueck unter der Leiste erzeugt.
const aufPalette = await page.evaluate(() => {
  const k = document.querySelector('.pstueck[data-typ="liege"]')
  const r = k.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 + 6 }
})
await page.evaluate((a) => window.__pa.ziehe('liege', a.x, a.y, 4), aufPalette)
await page.waitForTimeout(300)
const nachPalette = await page.evaluate(() => window.__planerDatei.zahlen().ausstattung)
pruefe(
  nachPalette === vorGegen.zahl,
  `c) GEGENPROBE: Loslassen auf der Palette erzeugt NICHTS (${vorGegen.zahl} -> ${nachPalette})`
)

// Und auf der Werkzeugleiste unten — dieselbe Falle, andere Stelle.
const aufLeiste = await page.evaluate(() => {
  const r = document.getElementById('werkzeuge').getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
})
await page.evaluate((a) => window.__pa.ziehe('matte', a.x, a.y, 6), aufLeiste)
await page.waitForTimeout(300)
const nachLeiste = await page.evaluate(() => ({
  zahl: window.__planerDatei.zahlen().ausstattung,
  zurueck: window.__planerDatei.kannZurueck()
}))
pruefe(
  nachLeiste.zahl === vorGegen.zahl,
  `c) GEGENPROBE: Loslassen auf der Werkzeugleiste erzeugt NICHTS (${vorGegen.zahl} -> ${nachLeiste.zahl})`
)
pruefe(
  nachLeiste.zurueck === vorGegen.zurueck,
  `c) GEGENPROBE: ein abgebrochenes Ablegen hinterlaesst auch KEINEN leeren Rueckgaengig-Schritt (kannZurueck ${vorGegen.zurueck} -> ${nachLeiste.zurueck})`
)

// Und: verlaesst der Zeiger mitten im Zug das Fenster, endet der Zug — sonst
// bliebe er scharf und der NAECHSTE Klick irgendwo im Bild legte ab.
const nachAustritt = await page.evaluate(() => {
  const k = document.querySelector('.pstueck[data-typ="matte"]')
  const r = k.getBoundingClientRect()
  k.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: r.left + 10, clientY: r.top + 10 }))
  document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.left + 40, clientY: r.top + 40 }))
  document.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false, clientX: -5, clientY: -5 }))
  const c = document.getElementById('grundriss-canvas')
  const rc = c.getBoundingClientRect()
  // Ein Loslassen MITTEN im Bild — es darf jetzt nichts mehr ausloesen.
  document.dispatchEvent(
    new MouseEvent('mouseup', { bubbles: true, clientX: rc.left + rc.width / 2, clientY: rc.top + rc.height / 2 })
  )
  return { zahl: window.__planerDatei.zahlen().ausstattung, geist: (function(){
      // GEMESSEN statt aus dem Attribut geraten: ':not([hidden])' sagt nur, ob
      // DIESES Attribut fehlt — nicht, ob das Element wirklich zu sehen ist.
      const g = document.getElementById('geist')
      return !!g && g.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })
    })() }
})
await page.waitForTimeout(250)
pruefe(
  nachAustritt.zahl === vorGegen.zahl && nachAustritt.geist === false,
  `c) GEGENPROBE: verlaesst der Zeiger das Fenster, endet der Zug — ein spaeteres Loslassen legt NICHTS ab (${vorGegen.zahl} -> ${nachAustritt.zahl}, Geist sichtbar: ${nachAustritt.geist})`
)

/* ── E · Das Ablegen benutzt DIESELBE Einrast-Rechnung wie das Ziehen ── */
const anWand = await page.evaluate(() => {
  const d = window.__planerDatei
  const c = document.getElementById('grundriss-canvas')
  const r = c.getBoundingClientRect()
  const proCm = d.proCm()
  const bezug = d.aufBild(0, 0)
  for (const w of d.waende()) {
    const dx = w.wbx - w.wax, dy = w.wby - w.way
    const laenge = Math.hypot(dx, dy)
    if (laenge < 400) continue
    const mx = (w.wax + w.wbx) / 2, my = (w.way + w.wby) / 2
    const nx = -dy / laenge, ny = dx / laenge
    for (const seite of [1, -1]) {
      // 45 cm neben die Wandachse zielen: die halbe Tiefe der Liege (35) plus
      // gut 10 cm Luft — nah genug, dass die Anlage greifen MUSS.
      const zx = mx + nx * 45 * seite, zy = my + ny * 45 * seite
      const p = d.aufBild(zx, zy)
      if (p.x < 200 || p.y < 150 || p.x > c.width - 150 || p.y > c.height - 150) continue
      if (document.elementFromPoint(r.left + p.x, r.top + p.y) !== c) continue
      return {
        wand: w, clientX: r.left + p.x, clientY: r.top + p.y,
        zielX: zx, zielY: zy, proCm: proCm, bezug: bezug
      }
    }
  }
  return null
})
pruefe(anWand !== null, 'E) eine lange Wand mit freiem Anlegepunkt gefunden')
if (anWand) {
  const vorWand = await page.evaluate(() => window.__planerDatei.zahlen().ausstattung)
  await page.evaluate((a) => window.__pa.ziehe('liege', a.x, a.y), {
    x: anWand.clientX,
    y: anWand.clientY
  })
  await page.waitForTimeout(320)
  const gelegt = await page.evaluate(() => window.__pa.letztes())
  const nachWand = await page.evaluate(() => window.__planerDatei.zahlen().ausstattung)
  pruefe(nachWand === vorWand + 1, `E) das Stueck ist entstanden (${vorWand} -> ${nachWand})`)

  // Unabhaengige Rechnung: der Abstand des Mittelpunkts zur Wandachse muss der
  // halben Ausdehnung QUER zur Wand plus der halben Wanddicke entsprechen —
  // dann liegt der Rand buendig an der Flanke. Bewusst ueber die allgemeine
  // Stuetzfunktion des gedrehten Rechtecks und nicht ueber die Fallunter-
  // scheidung des Kerns: eine Abschrift der Kern-Logik pruefte sich selbst.
  const w = anWand.wand
  const laenge = Math.hypot(w.wbx - w.wax, w.wby - w.way)
  const nx = -(w.wby - w.way) / laenge
  const ny = (w.wbx - w.wax) / laenge
  const achsAbstand = Math.abs((gelegt.x - w.wax) * nx + (gelegt.y - w.way) * ny)
  const co = Math.cos(gelegt.drehung)
  const si = Math.sin(gelegt.drehung)
  const halbQuer =
    Math.abs((gelegt.breite / 2) * (co * nx + si * ny)) +
    Math.abs((gelegt.tiefe / 2) * (-si * nx + co * ny))
  const soll = halbQuer + w.dicke / 2
  pruefe(
    Math.abs(achsAbstand - soll) <= 1.5,
    `E) es liegt BUENDIG an der Wand — dieselbe Einrast-Rechnung wie beim Ziehen (Abstand zur Achse ${achsAbstand.toFixed(1)} cm, soll ${soll.toFixed(1)} cm)`
  )
  await page.evaluate(() => window.__pa.zeigerWeg())
  await page.waitForTimeout(150)
  await page.screenshot({ path: path.join(DIR, 'B_an_der_wand.png') })
  await page.evaluate(() => window.__planerDatei.undoJetzt())
  await page.waitForTimeout(300)
}

/* ── F · Sichern und Laden ────────────────────────────────────────────── */
log('\n── Sichern und Laden ──')
const gesetzteStuecke = []
for (const typ of NEUE_TYPEN) {
  const punkt = await page.evaluate(() => window.__pa.freierPunkt(260, 220))
  if (!punkt) continue
  await page.evaluate((a) => window.__pa.ziehe(a.typ, a.x, a.y), {
    typ,
    x: punkt.clientX,
    y: punkt.clientY
  })
  await page.waitForTimeout(300)
  gesetzteStuecke.push(await page.evaluate(() => window.__pa.letztes()))
}
pruefe(
  gesetzteStuecke.length === NEUE_TYPEN.length &&
    NEUE_TYPEN.every((t) => gesetzteStuecke.some((s) => s.typ === t)),
  `f) je ein Stueck jeder neuen Art hingestellt (${gesetzteStuecke.map((s) => s.typ).join(', ') || 'keins'})`
)
await page.evaluate(() => window.__pa.zeigerWeg())
await page.waitForTimeout(200)
await page.screenshot({ path: path.join(DIR, 'C_grundriss.png') })
await page.evaluate(() => {
  document.getElementById('btnAnsichtAxo').dispatchEvent(new MouseEvent('click', { bubbles: true }))
})
await page.waitForTimeout(1200)
const axoZahlen = await page.evaluate(() => ({
  moebel: window.__planerDatei.szeneMoebel(),
  stuecke: window.__planerDatei.zahlen().ausstattung,
  kopf: window.__planerDatei.gesetztText()
}))
pruefe(
  axoZahlen.moebel === axoZahlen.stuecke,
  `a) auch mit allen drei neuen Arten baut die Axonometrie GENAU EINEN Koerper je Stueck (${axoZahlen.moebel}/${axoZahlen.stuecke})`
)
pruefe(
  axoZahlen.kopf === `${NEUE_TYPEN.length} Stück frei gesetzt — kein Aufmaß`,
  `f) das Blatt sagt, dass hier Annahmen stehen ("${axoZahlen.kopf}")`
)
await page.screenshot({ path: path.join(DIR, 'D_axonometrie.png') })
await page.evaluate(() => {
  document.getElementById('btnAnsichtPlan').dispatchEvent(new MouseEvent('click', { bubbles: true }))
})
await page.waitForTimeout(500)

let exportPfad = null
try {
  const [ladung] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.evaluate(() => {
      document.getElementById('btnExport').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
  ])
  exportPfad = path.join(DIR, ladung.suggestedFilename())
  await ladung.saveAs(exportPfad)
} catch (e) {
  log('     Download nicht angekommen: ' + String(e).slice(0, 140))
}
pruefe(exportPfad !== null && fs.existsSync(exportPfad), `f) "Sichern" legt eine Datei ab (${exportPfad ? path.basename(exportPfad) : 'keine'})`)

if (exportPfad && fs.existsSync(exportPfad)) {
  const inhalt = JSON.parse(fs.readFileSync(exportPfad, 'utf8'))
  const drin = (inhalt.floorplan && inhalt.floorplan.ausstattung) || []
  const gefunden = gesetzteStuecke.filter((s) =>
    drin.some((e) => e.id === s.id && e.typ === s.typ && e.quelle === 'gesetzt')
  )
  pruefe(
    gefunden.length === NEUE_TYPEN.length,
    `f) die gesicherte Datei traegt alle neuen Stuecke MIT Herkunft (${gefunden.length}/${NEUE_TYPEN.length}, ${drin.length} Stuecke gesamt)`
  )

  // Erst auf den gemessenen Plan zuruecksetzen, dann die Datei laden — sonst
  // bewiese ein Wiederfinden nur, dass nichts passiert ist.
  await page.evaluate(() => {
    document.getElementById('btnZurueck').dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await page.waitForTimeout(250)
  await page.evaluate(() => {
    document.getElementById('btnZurueckJa').dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await page.waitForTimeout(800)
  const nachReset = await page.evaluate(() => window.__planerDatei.gesetzte())
  pruefe(nachReset === 0, `f) GEGENPROBE: nach dem Zuruecksetzen ist nichts mehr frei gesetzt (${nachReset})`)
  /* „Zuruecksetzen" heisst seit M7 wirklich AUSLIEFERUNGSZUSTAND: ruhiges
     Blatt, keine Werkzeuge — und die Zeichenflaeche nimmt dann keine
     Zeiger-Ereignisse mehr an (K3). Wer danach weiterarbeiten will, greift den
     Schalter noch einmal UND geht in den Grundriss zurueck (seit W7 zwei
     getrennte Griffe). Genau das tut hier auch der Nutzer. */
  await page.evaluate(() => {
    if (!window.__planerDatei.bearbeitet()) {
      document.getElementById('btnBearbeiten').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    }
    if (window.__planerDatei.ansicht() !== 'plan') {
      document.getElementById('btnAnsichtPlan').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    }
  })
  await page.waitForTimeout(400)

  await page.setInputFiles('#dateiWahl', exportPfad)
  await page.waitForTimeout(500)
  // K1: „Laden" fragt seit der Haertung nach, bevor es den Stand ersetzt.
  // Die Rueckfrage MUSS da sein — sonst waere das Laden wieder unumkehrbar.
  pruefe(
    await page.evaluate(() => window.__planerDatei.ladeFrageOffen()),
    'f) „Laden" fragt VOR dem Ersetzen nach (K1)'
  )
  await page.evaluate(() => {
    document.getElementById('btnLadeJa').dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await page.waitForTimeout(1100)
  const nachLaden = await page.evaluate(
    (ids) => ({
      stuecke: ids.map((id) => window.__planerDatei.stueck(id)),
      gesetzte: window.__planerDatei.gesetzte(),
      zahl: window.__planerDatei.zahlen().ausstattung
    }),
    gesetzteStuecke.map((s) => s.id)
  )
  const heil = nachLaden.stuecke.length === NEUE_TYPEN.length && nachLaden.stuecke.every(
    (s, i) =>
      s !== null &&
      s.typ === gesetzteStuecke[i].typ &&
      s.quelle === 'gesetzt' &&
      Math.abs(s.x - gesetzteStuecke[i].x) < 0.5 &&
      Math.abs(s.y - gesetzteStuecke[i].y) < 0.5
  )
  pruefe(
    heil,
    `f) nach dem Laden sind alle drei wieder da — Art, Ort und Herkunft unveraendert (${nachLaden.gesetzte} frei gesetzt von ${nachLaden.zahl})`
  )

  await page.evaluate(() => window.__planerDatei.axoNeuBauen())
  await page.waitForTimeout(300)
  const szeneNachLaden = await page.evaluate(() => ({
    moebel: window.__planerDatei.szeneMoebel(),
    stuecke: window.__planerDatei.zahlen().ausstattung
  }))
  pruefe(
    szeneNachLaden.moebel === szeneNachLaden.stuecke,
    `f) und die Axonometrie zeigt sie auch nach dem Laden (${szeneNachLaden.moebel}/${szeneNachLaden.stuecke})`
  )
}

/* ── G · GEGENPROBE DES WAECHTERS ─────────────────────────────────────────
   Der schaerfste Test dieses Werkzeugs: erkennt es eine HALBE Typ-Kette
   ueberhaupt? Dafuer bekommt der Grundriss ein Stueck mit einer Art, die es
   nirgends gibt — genau der Zustand, den ein vergessener Eintrag erzeugt.
   Erwartet wird: der Grundriss zeigt es (fail-open), die Axonometrie NICHT
   (fail-closed), die Zaehlung faellt auseinander, und der Zeichner MELDET es.
   Danach wird der Zustand wieder hergestellt. */
log('\n── Gegenprobe: erkennt der Waechter eine halbe Kette? ──')
const vorAttrappe = await page.evaluate(() => window.__planerDatei.ausstattungRoh())
const attrappenOrt = await page.evaluate(() => window.__pa.freierPunkt(260, 220))
pruefe(attrappenOrt !== null, 'g) ein freier Platz fuer die Attrappe gefunden')

const warnungenVorher = konsoleWarnung.length
const attrappe = await page.evaluate((ort) => {
  const roh = window.__planerDatei.ausstattungRoh()
  const el = {
    id: 'pruef-attrappe',
    typ: 'attrappe-ohne-kette',
    quelle: 'gesetzt',
    x: Math.round(ort.wx),
    y: Math.round(ort.wy),
    breite: 200,
    tiefe: 120
  }
  window.__planerDatei.setzeAusstattung(roh.concat([el]))
  window.__planerDatei.axoNeuBauen()
  return el
}, attrappenOrt)
await page.waitForTimeout(400)
await page.evaluate(() => window.__pa.zeigerWeg())
await page.waitForTimeout(180)

const mitAttrappe = await page.evaluate(() => ({
  moebel: window.__planerDatei.szeneMoebel(),
  stuecke: window.__planerDatei.zahlen().ausstattung
}))
const tinteAttrappe = await page.evaluate(
  (e) => window.__pa.tinte(window.__pa.kasten(e.x, e.y, Math.max(e.breite, e.tiefe) * 0.75)),
  attrappe
)
pruefe(
  tinteAttrappe > 0,
  `g) die Attrappe ist im Grundriss SICHTBAR (${tinteAttrappe} Bildpunkte) — genau das macht den Fehler so tueckisch`
)
pruefe(
  mitAttrappe.moebel === mitAttrappe.stuecke - 1,
  `g) und in der Axonometrie fehlt sie: die Zaehlung faellt auseinander (${mitAttrappe.moebel}/${mitAttrappe.stuecke}) — der Waechter schlaegt an`
)
const neueWarnungen = konsoleWarnung.slice(warnungenVorher)
pruefe(
  neueWarnungen.some((t) => /keine Zeichenvorschrift/.test(t)),
  `g) der Zeichner MELDET den unbekannten Typ, statt ihn still als Rechteck durchgehen zu lassen (${neueWarnungen.length} Warnung(en))`
)
await page.screenshot({ path: path.join(DIR, 'E_attrappe.png') })

// Zustand wieder herstellen — eine Gegenprobe, die ihren Schaden liegen laesst,
// ist selbst ein Fehler.
await page.evaluate((roh) => {
  window.__planerDatei.setzeAusstattung(roh)
  window.__planerDatei.axoNeuBauen()
}, vorAttrappe)
await page.waitForTimeout(400)
const nachAttrappe = await page.evaluate(() => ({
  moebel: window.__planerDatei.szeneMoebel(),
  stuecke: window.__planerDatei.zahlen().ausstattung
}))
pruefe(
  nachAttrappe.moebel === nachAttrappe.stuecke && nachAttrappe.stuecke === vorAttrappe.length,
  `g) danach ist der Zustand wieder hergestellt (${nachAttrappe.moebel}/${nachAttrappe.stuecke}, vorher ${vorAttrappe.length})`
)

/* ── H · Netz und Konsole ─────────────────────────────────────────────── */
log('')
pruefe(
  blockiert.length === 0,
  `h) KEINE Anfrage nach draussen (${blockiert.length}${blockiert.length ? ': ' + blockiert.slice(0, 3).join(', ') : ''})`
)
// Die Warnung der Attrappe ist ABSICHT und kein Fehler — gezaehlt werden nur
// echte Konsolenfehler.
pruefe(
  konsoleFehler.length === 0,
  `h) keine Konsolen- oder Seitenfehler (${konsoleFehler.length}${konsoleFehler.length ? ': ' + konsoleFehler.slice(0, 2).join(' | ') : ''})`
)

await ctx.close()
await browser.close()

log('')
log(fehler.length === 0 ? 'ALLE PRUEFUNGEN BESTANDEN' : `DURCHGEFALLEN: ${fehler.length}`)
fehler.forEach((f) => log('  - ' + f))
log(`Bilder + Bericht: ${DIR}`)
log('  A_palette.png · B_an_der_wand.png · C_grundriss.png · D_axonometrie.png · E_attrappe.png')
process.exit(fehler.length === 0 ? 0 : 1)
