// Baut die BANK-ANSICHT (E4/X4) — EINE Datei zum Doppelklick, ohne Netz.
//
//   node tools/baue-bank-ansicht.mjs        # -> Halle400-Modell.html
//   node tools/pruefe-bank-ansicht.mjs      # prueft sie unter file:// + gesperrtem Netz
//
// WARUM DIESE DATEI SEIT X4 EIN VIELFACHES KLEINER IST
// Bis hierher trug sie ein graues three.js-Modell und musste dafuer die
// WebGL-Bibliothek einbetten: three.core.js und three.module.js zu einem
// klassischen Skript verweben, weil three.module.js kein selbstaendiges Modul
// ist, sondern ein duenner Aufsatz auf three.core.js — mit DREI Export-Bloecken,
// von denen der mittlere leicht zu uebersehen war. Rund 2,0 MB, deren
// Zusammenbau bei jedem three-Update kippen konnte.
//
// Nichts davon wird noch gebraucht. Die Axonometrie ist reines Canvas-2D
// (src/axo/), also faellt three.js ersatzlos weg. Uebrig bleiben vier kleine
// Module, der gemessene Plan und eine schlichte Huelle.
//
// EINE WAHRHEIT FUER BEIDE AUSLIEFERUNGEN
// Die eingebetteten Module sind DIESELBEN, die die dritte Ansicht im Planer
// benutzt — hier nur ohne Modulgrenzen aneinandergesetzt, weil eine Datei, die
// per Doppelklick von der Festplatte startet, keine ES-Module nachladen darf
// (file:// verbietet es). Planer und Bank koennen darum nicht auseinander
// laufen; `tools/pruefe-axonometrie.mjs` G1 misst das zusaetzlich gegen den
// Modellkern des Planers.
//
// Die Ausstattungs-Hoehen werden weiterhin aus `src/three/ausstattung.ts`
// GELESEN statt abgeschrieben (jetzt ueber tools/lies-hoehen.mjs). Aendert
// jemand dort eine Hoehe, aendert sich die Bank-Ansicht mit.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { liesHoehen } from './lies-hoehen.mjs'

const HIER = path.dirname(fileURLToPath(import.meta.url))
const WURZEL = path.resolve(HIER, '..')

const arg = (name, standard) => {
  const i = process.argv.indexOf(name)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : standard
}
const PLAN = arg('--plan', 'halle400')
const ZIEL = path.resolve(WURZEL, arg('--ziel', 'Halle400-Modell.html'))

const planPfad = path.join(WURZEL, 'app/public/plaene', `${PLAN}.json`)
if (!fs.existsSync(planPfad)) {
  console.error(`Plan nicht gefunden: ${planPfad}`)
  process.exit(1)
}
const planRoh = fs.readFileSync(planPfad, 'utf8')
const plan = JSON.parse(planRoh)
const HOEHEN = liesHoehen()

// Wanddicke wie im Planer gesetzt (Blueprint3DAppBase.tsx:133). Beides sind
// gesetzte Nutzer-Angaben, keine Messwerte — ein Grundriss enthaelt weder
// Hoehe noch Dicke (Projekt-DNA Punkt 4).
const WAND_DICKE_CM = 12.5

/* ── Module einsammeln ────────────────────────────────────────────────
   Reihenfolge = Abhaengigkeitsreihenfolge. `import`-Zeilen und das
   `export`-Schluesselwort fallen weg; alles landet in EINEM Gueltigkeits-
   bereich. Das geht nur, solange kein Name doppelt vorkommt — genau das wird
   unten geprueft, statt es zu hoffen: zwei gleichnamige `const` im selben
   Bereich sind ein harter Syntaxfehler, und zwar erst im Browser, also dort,
   wo niemand mehr nachbessert. */
const MODULE = ['axo-kontrakt.js', 'axo-zyklen.js', 'axo-szene.js', 'axo-zeichnen.js']

const IMPORT_ZEILE = /^import\s*\{[^}]*\}\s*from\s*['"][^'"]+['"];?[ \t]*$/gm
const EXPORT_WORT = /^export\s+/gm

const teile = []
const namen = new Map()
for (const datei of MODULE) {
  const pfad = path.join(WURZEL, 'src/axo', datei)
  if (!fs.existsSync(pfad)) {
    console.error(`Modul fehlt: ${pfad} — Abbruch.`)
    process.exit(1)
  }
  const ohne = fs.readFileSync(pfad, 'utf8').replace(IMPORT_ZEILE, '').replace(EXPORT_WORT, '')

  for (const m of ohne.matchAll(/^(?:const|let|function|class)\s+([A-Za-z_$][\w$]*)/gm)) {
    if (namen.has(m[1])) {
      console.error(`Namenskollision beim Zusammenlegen: "${m[1]}" in ${datei} und ${namen.get(m[1])} — Abbruch.`)
      process.exit(1)
    }
    namen.set(m[1], datei)
  }

  const rest = ohne.match(/^[ \t]*(export|import)[\s{'"*]/m)
  if (rest) {
    const zeile = ohne.slice(0, ohne.indexOf(rest[0])).split('\n').length
    console.error(`${datei}:${zeile} — Modul-Syntax uebrig: ${rest[0].trim()} — Abbruch.`)
    process.exit(1)
  }

  teile.push(`/* ══════ ${datei} ══════ */\n${ohne.trim()}`)
}

const buendel = teile.join('\n\n')

/* ── Die Huelle ───────────────────────────────────────────────────────
   Blattkopf, Saeulen-Tafel und Bedienleiste. Im Planer macht das React, hier
   reicht schlichtes HTML; die Farb- und Schriftwerte stammen aus demselben
   Kontrakt wie der Renderer. */
const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Halle 400 — Büro, Axonometrie</title>
<style>
  :root{
    --paper:#F2ECDE; --paper-deep:#DED5C0; --ink:#1E2A25; --ink-dim:#46514A;
    --ink-mute:#6B7570; --hair-strong:#BAB09C; --amber:#C8703A; --sage-deep:#3F6757;
    --panel:rgba(242,236,222,.92); --panel-line:#C9C0AA;
    --serif:"Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Georgia,serif;
    --sans:"Avenir Next","Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,sans-serif;
    --mono:"Roboto Mono","Cascadia Mono",Consolas,"SF Mono",ui-monospace,monospace;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);
       -webkit-font-smoothing:antialiased;overflow:hidden}
  #buehne{position:fixed;inset:0}
  canvas{display:block;width:100%;height:100%;touch-action:none;cursor:grab}
  canvas.zieht{cursor:grabbing}
  .kopf{position:fixed;top:0;left:0;padding:22px 26px;pointer-events:none;max-width:min(46ch,72vw)}
  .kopf h1{font-family:var(--serif);font-weight:600;font-size:clamp(19px,2.5vw,27px);
       margin:0 0 3px;line-height:1.15}
  .kopf .sub{font-family:var(--mono);font-size:10.5px;letter-spacing:.13em;
       text-transform:uppercase;color:var(--ink-mute);line-height:1.7}
  .strich{height:1px;background:var(--hair-strong);margin:9px 0 8px;max-width:270px}
  .leiste{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);
       display:flex;flex-wrap:wrap;justify-content:center;gap:5px;padding:6px;
       background:var(--panel);border:1px solid var(--panel-line);
       backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px);
       max-width:calc(100vw - 24px);z-index:5}
  .grp{display:flex;gap:2px;align-items:center}
  .grp + .grp{border-left:1px solid var(--panel-line);padding-left:5px;margin-left:2px}
  button{font-family:var(--mono);font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;
       color:var(--ink-dim);background:transparent;border:1px solid transparent;
       padding:9px 11px;min-height:38px;cursor:pointer;white-space:nowrap;
       transition:background .15s,color .15s,border-color .15s}
  button:hover{background:var(--paper-deep);color:var(--ink)}
  button[aria-pressed="true"]{color:var(--paper);background:var(--sage-deep);border-color:var(--sage-deep)}
  button:focus-visible{outline:2px solid var(--amber);outline-offset:1px}
  .lbl{font-family:var(--mono);font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;
       color:var(--ink-mute);padding:0 7px 0 3px;user-select:none}
  .tafel{position:fixed;top:20px;right:20px;width:270px;max-height:calc(100vh - 140px);
       background:var(--panel);border:1px solid var(--panel-line);
       backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px);
       display:flex;flex-direction:column;z-index:6;transition:transform .28s ease,opacity .28s ease}
  .tafel.weg{transform:translateX(calc(100% + 24px));opacity:0}
  .tafel-kopf{display:flex;align-items:baseline;justify-content:space-between;gap:8px;
       padding:13px 14px 9px;border-bottom:1px solid var(--panel-line)}
  .tafel-kopf b{font-family:var(--mono);font-size:10px;letter-spacing:.15em;
       text-transform:uppercase;font-weight:500;color:var(--ink-dim)}
  .tafel-kopf span{font-family:var(--mono);font-size:10px;color:var(--ink-mute);
       font-variant-numeric:tabular-nums}
  .tafel-leib{overflow-y:auto;padding:4px 0 8px}
  .zeile{display:grid;grid-template-columns:26px 1fr;gap:9px;padding:8px 14px;
       align-items:start;border-left:2px solid transparent}
  .zeile.an{border-left-color:var(--amber);background:rgba(200,112,58,.09)}
  .zeile .n{font-family:var(--mono);font-size:10px;color:var(--ink-mute);
       padding-top:2px;font-variant-numeric:tabular-nums}
  .zeile.an .n{color:var(--amber)}
  .zeile .nm{font-family:var(--serif);font-size:15px;line-height:1.25;color:var(--ink)}
  .zeile .rm{font-family:var(--mono);font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;
       color:var(--amber);margin-top:3px;line-height:1.5}
  .zeile .src{font-size:11.5px;color:var(--ink-mute);margin-top:2px;line-height:1.4}
  .tafel-fuss{padding:9px 14px 11px;border-top:1px solid var(--panel-line);
       font-size:11px;line-height:1.5;color:var(--ink-mute)}
  .hinweis{position:fixed;left:26px;bottom:18px;max-width:44ch;font-family:var(--mono);
       font-size:9.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-mute);
       pointer-events:none;opacity:.85;line-height:1.7}
  @media (max-width:900px){
    .tafel{top:auto;bottom:112px;right:10px;left:10px;width:auto;max-height:38vh}
    .hinweis{display:none}
    .kopf{padding:12px 14px;max-width:none}
    .kopf .sub{font-size:9px;letter-spacing:.11em;line-height:1.6}
    .strich{margin:7px 0 6px;max-width:180px}
    .leiste{bottom:10px;padding:5px;gap:4px}
    button{padding:8px 9px;font-size:10px}
    .lbl{padding:0 4px 0 2px;font-size:9px}
  }
  @media (prefers-reduced-motion:reduce){*{transition-duration:.01ms!important}}
</style>
</head>
<body>

<div id="buehne"><canvas id="c"></canvas></div>

<header class="kopf">
  <h1>Halle&nbsp;400 &middot; Büro</h1>
  <div class="strich"></div>
  <div class="sub" id="unterzeile">Axonometrie</div>
</header>

<aside class="tafel" id="tafel">
  <div class="tafel-kopf"><b>Die neun Säulen</b><span id="zaehler"></span></div>
  <div class="tafel-leib" id="tafelLeib"></div>
  <div class="tafel-fuss" id="tafelFuss"></div>
</aside>

<div class="leiste" role="toolbar" aria-label="Ansicht steuern">
  <div class="grp">
    <span class="lbl">Blick</span>
    <button type="button" data-blick="0">Nord</button>
    <button type="button" data-blick="1">West</button>
    <button type="button" data-blick="2">Süd</button>
    <button type="button" data-blick="3">Plan</button>
  </div>
  <div class="grp">
    <span class="lbl">Namen</span>
    <button type="button" data-namen="alle">Alle</button>
    <button type="button" data-namen="saeulen">Säulen</button>
    <button type="button" data-namen="aus">Aus</button>
  </div>
  <div class="grp">
    <button type="button" id="btnAusbau" aria-pressed="false">9&nbsp;Säulen</button>
    <button type="button" id="btnTafel" aria-pressed="true">Legende</button>
  </div>
</div>

<div class="hinweis">
  Ziehen dreht &middot; Rad zoomt &middot; zwei Finger zoomen<br>
  Grundriss und Ausstattung sind gemessen. Höhen sind gesetzte Annahmen —
  ein Grundriss enthält keine.
</div>

<script>
"use strict";
(function(){

/* ══════════════════════════════════════════════════════════════════
   DER GEMESSENE PLAN — aus app/public/plaene/${PLAN}.json
   ══════════════════════════════════════════════════════════════════ */
const PLAN = ${planRoh};

/* Hoehen aus src/three/ausstattung.ts, zur Bauzeit gelesen. */
const HOEHEN = ${JSON.stringify(HOEHEN)};

${buendel}

/* ══════════════════════════════════════════════════════════════════
   HUELLE
   ══════════════════════════════════════════════════════════════════ */
const cv = document.getElementById('c');
const tafel = document.getElementById('tafel');
let vollausbau = false, tafelAn = true, namenModus = 'alle', axo = null, szene = null;

function tafelRand(){ return (tafelAn && innerWidth > 900) ? 294 : 0; }

function bauen(){
  szene = baueSzene(PLAN, {
    wandDicke: ${WAND_DICKE_CM},
    nurKernSaeulen: !vollausbau,
    hoehen: HOEHEN
  });
  axo = erzeugeAxonometrie(cv, szene, { namen: namenModus, randRechts: tafelRand() });
  axo.passeAn();
  tafelZeichnen();
}

function verortete(){
  const m = {};
  for (const k of szene.marken) if (k.hervor && k.saeule != null) m[k.saeule] = k.text;
  return m;
}

function tafelZeichnen(){
  const belegt = verortete();
  const anzahl = Object.keys(belegt).length;
  const leib = document.getElementById('tafelLeib');
  leib.innerHTML = '';
  SAEULEN.forEach(function(s, i){
    const raum = belegt[i];
    const el = document.createElement('div');
    el.className = 'zeile' + (raum ? ' an' : '');
    el.innerHTML = '<div class="n">' + s.n + '</div><div>' +
      '<div class="nm">' + s.rolle + '</div>' +
      (raum ? '<div class="rm">' + raum + '</div>' : '') +
      '<div class="src">' + s.name + '</div></div>';
    leib.appendChild(el);
  });
  document.getElementById('zaehler').textContent = anzahl + '/9 verortet';
  document.getElementById('tafelFuss').textContent = vollausbau
    ? 'Vollausbau — auch Teamtable, Konferenz, Workshop, Videokonf und Break out tragen eine Säule.'
    : 'Die vier Räume, die im Plan Workspace, Einzelbüro oder Doppelbüro heißen.';
  const b = (szene.grenzen.x1 - szene.grenzen.x0).toFixed(0);
  const t = (szene.grenzen.z1 - szene.grenzen.z0).toFixed(0);
  document.getElementById('unterzeile').innerHTML =
    'Axonometrie &middot; ' + b + ' &times; ' + t + ' m<br>' +
    anzahl + ' Räume nach den Säulen benannt';
}

function markiere(auswahl, wert){
  document.querySelectorAll(auswahl).forEach(function(b){
    const schluessel = Object.keys(b.dataset)[0];
    b.setAttribute('aria-pressed', String(b.dataset[schluessel] === wert));
  });
}

document.querySelectorAll('[data-blick]').forEach(function(b){
  b.addEventListener('click', function(){
    const v = BLICKE[+b.dataset.blick];
    axo.setzeBlick(v.az, v.el);
    markiere('[data-blick]', b.dataset.blick);
  });
});
document.querySelectorAll('[data-namen]').forEach(function(b){
  b.addEventListener('click', function(){
    namenModus = b.dataset.namen;
    axo.setzeNamen(namenModus);
    markiere('[data-namen]', namenModus);
  });
});
const btnAusbau = document.getElementById('btnAusbau');
btnAusbau.addEventListener('click', function(){
  vollausbau = !vollausbau;
  btnAusbau.setAttribute('aria-pressed', String(vollausbau));
  bauen();
});
const btnTafel = document.getElementById('btnTafel');
btnTafel.addEventListener('click', function(){
  tafelAn = !tafelAn;
  tafel.classList.toggle('weg', !tafelAn);
  btnTafel.setAttribute('aria-pressed', String(tafelAn));
  axo.setzeRandRechts(tafelRand());
});

cv.addEventListener('pointerdown', function(){ cv.classList.add('zieht'); });
['pointerup','pointercancel'].forEach(function(t){
  cv.addEventListener(t, function(){ cv.classList.remove('zieht'); });
});
addEventListener('resize', function(){ if (axo) axo.passeAn(); });

/* ── Start ──────────────────────────────────────────────────────────
   Auf schmalen Anzeigen laengs statt quer blicken: der 78-m-Riegel laeuft
   dann in die Tiefe statt ueber die Breite und wird gut doppelt so gross.
   Legende zu, nur die Saeulen beschriftet — sonst erschlaegt es das Bild. */
let startBlick = '0';
if (innerWidth < 900) {
  startBlick = '1';
  tafelAn = false;
  tafel.classList.add('weg');
  btnTafel.setAttribute('aria-pressed','false');
  namenModus = 'saeulen';
}
bauen();
if (startBlick === '1') axo.setzeBlick(BLICKE[1].az, 0.54);
markiere('[data-blick]', startBlick);
markiere('[data-namen]', namenModus);

/* ── Selbstauskunft fuer tools/pruefe-bank-ansicht.mjs ───────────────
   Das Pruefwerkzeug misst am fertigen Bild statt Behauptungen zu glauben.
   farbtoene() liest jetzt schlicht aus dem 2D-Canvas — der Umweg ueber
   gl.readPixels, den die frueher hier eingebettete WebGL-Fassung brauchte
   (ohne preserveDrawingBuffer ist ihr Zeichenpuffer nach dem Anzeigen leer),
   ist mit three.js entfallen. */
window.__modell = {
  wandZahl: PLAN.floorplan.walls.length,
  moebelZahl: (PLAN.floorplan.ausstattung || []).length,
  raumZahl: szene.raeume.length,
  breite: (szene.grenzen.x1 - szene.grenzen.x0) * 100,
  tiefe: (szene.grenzen.z1 - szene.grenzen.z0) * 100,
  blick: function(drehung, neigung){ axo.setzeBlick(drehung, neigung); },
  farbtoene: function(){
    const g = cv.getContext('2d');
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    const toene = new Set();
    for (let i = 0; i < d.length; i += 4 * 37) {
      toene.add((d[i] >> 4) + ',' + (d[i+1] >> 4) + ',' + (d[i+2] >> 4));
    }
    return toene.size;
  }
};
window.__bereit = true;
})();
</script>
</body>
</html>
`

fs.writeFileSync(ZIEL, html, 'utf8')

const kb = fs.statSync(ZIEL).size / 1024
console.log(`Bank-Ansicht geschrieben: ${ZIEL}`)
console.log(`  Groesse:      ${kb.toFixed(0)} KB (eine Datei, keine Begleitdateien, kein three.js)`)
console.log(`  Waende:       ${plan.floorplan.walls.length}`)
console.log(`  Ausstattung:  ${(plan.floorplan.ausstattung || []).length}`)
console.log(`  Namen:        ${(plan.labels || []).length}`)
console.log(`  Module:       ${MODULE.join(', ')} (dieselben wie die Planer-Ansicht)`)
console.log(`  Hoehen aus:   src/three/ausstattung.ts (${Object.keys(HOEHEN.oberkante).length} Typen, gelesen statt abgeschrieben)`)
