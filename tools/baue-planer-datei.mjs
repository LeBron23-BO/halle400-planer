// Baut die PLANER-DATEI (W1) — EINE Datei zum Doppelklick, die man BEARBEITEN
// kann. Sie loest die reine Ansicht (tools/baue-bank-ansicht.mjs) ab.
//
//   node tools/baue-planer-datei.mjs        # -> Halle400-Modell.html
//   node tools/pruefe-planer-datei.mjs      # prueft sie unter file:// + gesperrtem Netz
//
// WAS SICH GEGENUEBER DER BANK-ANSICHT AENDERT
// Bisher trug die Datei nur die vier Axonometrie-Module: ein Blatt zum Ansehen,
// mehr nicht. Jetzt kommt der 2D-KERN dazu (Modell + Zeichner, aus derselben
// Typescript-Quelle uebersetzt, aus der auch der Planer baut) und mit ihm der
// Rechen-Teil von three, den dieser Kern fuer seine Vektoren braucht. Die Datei
// waechst dadurch von rund 140 KB auf rund 700 KB — der Preis dafuer, dass die
// Bankberaterin nicht mehr nur zusieht, sondern eine Wand verschieben kann.
//
// EINE WAHRHEIT FUER BEIDE AUSLIEFERUNGEN
// Uebersetzt und gebuendelt wird ueber `tools/buendel-kern.mjs`; die
// Axonometrie-Module sind dieselben Dateien, die die dritte Ansicht im Planer
// benutzt. Planer und Doppelklick-Datei koennen darum nicht auseinander laufen.
// Abgeschrieben wird nichts: die Ausstattungs-Hoehen liest `lies-hoehen.mjs` aus
// `src/three/ausstattung.ts`, der Plan kommt aus `app/public/plaene/*.json`.
//
// DER EINGEBAUTE PLAN BLEIBT UNANGETASTET
// Er ist die Grundwahrheit aus der PDF. Was der Nutzer aendert, liegt daneben
// (localStorage) und laesst sich mit einem Knopf verwerfen. Die Datei traegt
// darum immer BEIDES: den gemessenen Plan und den eigenen Stand.
//
// WARUM DER SPEICHER-SCHLUESSEL SO UMSTAENDLICH IST
// `file://` ist EIN EINZIGER Ursprung fuer die ganze Festplatte — gemessen, nicht
// vermutet: eine Datei in Ordner B liest den localStorage-Wert, den eine Datei in
// Ordner A geschrieben hat. Ohne Kennzeichnung uebernaehme die Kopie im
// Download-Ordner stillschweigend die Aenderungen der Arbeitskopie. Der
// Schluessel traegt deshalb den Fingerabdruck des EINGEBAUTEN Plans und den
// Ablageort der Datei (s. Hülle, Abschnitt "Speicher").

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { liesHoehen } from './lies-hoehen.mjs'
import { WURZEL, uebersetzeKern, buendleKern, buendleAxo, buendleThree, AXO_MODULE } from './buendel-kern.mjs'

const arg = (name, standard) => {
  const i = process.argv.indexOf(name)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : standard
}
const PLAN_NAME = arg('--plan', 'halle400')
const ZIEL = path.resolve(WURZEL, arg('--ziel', 'Halle400-Modell.html'))

const planPfad = path.join(WURZEL, 'app/public/plaene', `${PLAN_NAME}.json`)
if (!fs.existsSync(planPfad)) {
  console.error(`Plan nicht gefunden: ${planPfad}`)
  process.exit(1)
}
const planRoh = fs.readFileSync(planPfad, 'utf8')
const plan = JSON.parse(planRoh)
const HOEHEN = liesHoehen()

// Fingerabdruck des eingebauten Plans. Er entscheidet, ob ein gespeicherter
// Stand ueberhaupt zu DIESER Datei gehoert — ein Datum taete das nicht, denn ein
// neuer Bau der Huelle bei unveraendertem Plan darf die Arbeit des Nutzers nicht
// wegwerfen.
const PLAN_ABDRUCK = crypto.createHash('sha1').update(planRoh).digest('hex').slice(0, 12)
const BAU_STEMPEL = new Date().toISOString().slice(0, 16).replace('T', ' ')

// Wandhoehe und -dicke wie im Planer gesetzt (Blueprint3DAppBase.tsx:127-134).
// BEIDES sind gesetzte Nutzer-Angaben, KEINE Messwerte aus der PDF — ein
// Grundriss enthaelt weder Hoehe noch Dicke (Projekt-DNA Punkt 4). Sie muessen
// VOR dem Laden gesetzt sein, weil `Wall` seine Masse bei der Erzeugung aus der
// Configuration liest und nicht aus dem JSON.
const WAND_HOEHE_CM = 300
const WAND_DICKE_CM = 12.5

/* ── Bausteine einsammeln ─────────────────────────────────────────────
   EINE gemeinsame Namens-Karte ueber alle Buendel: zwei gleichnamige `const` im
   selben Gueltigkeitsbereich sind ein harter Syntaxfehler — und zwar erst im
   Browser der Bank, also dort, wo niemand mehr nachbessert. Lieber hier laut
   abbrechen. */
const namen = new Map()
let three, kern, axo
try {
  three = buendleThree()
  const ausDir = uebersetzeKern()
  kern = buendleKern(ausDir, namen)
  axo = buendleAxo(namen)
  fs.rmSync(ausDir, { recursive: true, force: true })
} catch (e) {
  console.error(`Abbruch: ${e.message}`)
  process.exit(1)
}

/* ── Die Huelle ───────────────────────────────────────────────────────
   Farbklima, Schriften und Leisten-Stil stammen unveraendert aus
   `tools/baue-bank-ansicht.mjs` — die Datei soll aussehen wie das bisherige
   Planblatt und nicht wie ein Werkzeugkasten. Neu sind: der Umschalter zwischen
   Blatt und Grundriss, der Bearbeiten-Schalter und die Werkzeugleiste, die
   erst durch ihn erscheint. */
const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Halle 400 — Büro, Planer</title>
<style>
  :root{
    --paper:#F2ECDE; --paper-deep:#DED5C0; --ink:#1E2A25; --ink-dim:#46514A;
    --ink-mute:#6B7570; --hair-strong:#BAB09C; --amber:#C8703A; --sage-deep:#3F6757;
    --rot:#A33A2A;
    --panel:rgba(242,236,222,.92); --panel-line:#C9C0AA;
    --serif:"Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Georgia,serif;
    --sans:"Avenir Next","Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,sans-serif;
    --mono:"Roboto Mono","Cascadia Mono",Consolas,"SF Mono",ui-monospace,monospace;
  }
  *{box-sizing:border-box}
  /* MUSS sein: die Leisten unten setzen display:flex, und eine Klassenregel
     schlaegt die eingebaute [hidden]-Regel des Browsers. Ohne diese Zeile bliebe
     die Werkzeugleiste sichtbar, obwohl sie versteckt ist — die Bank saehe den
     Werkzeugkasten. */
  [hidden]{display:none!important}
  body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);
       -webkit-font-smoothing:antialiased;overflow:hidden}
  canvas{display:block;width:100%;height:100%;touch-action:none}

  /* Beide Ansichten liegen uebereinander und behalten IHRE GROESSE, auch wenn
     sie ruhen: mit display:none haette der Grundriss-Zeichner beim Start eine
     Leinwand von 0x0 und "ganze Halle einpassen" liefe ins Leere. */
  .ansicht{position:fixed;inset:0}
  .ansicht.weg{visibility:hidden;opacity:0;pointer-events:none}
  #blatt{background:var(--paper)}
  #blatt canvas{cursor:grab}
  #blatt canvas.zieht{cursor:grabbing}
  /* Der Zeichner ist eine Arbeitsflaeche, kein Blatt — weisser Grund wie im
     Planer, damit Raster und Wandstaerken dieselbe Wirkung haben. */
  #plan{background:#fff}
  #plan canvas{cursor:default}
  body.zeichnet #plan canvas{cursor:crosshair}
  body.loescht #plan canvas{cursor:not-allowed}
  /* Im Oeffnungs-Werkzeug zeigt das Fadenkreuz auf die Wand — der Kern setzt
     ueber diesen Stil hinweg 'grab'/'grabbing', sobald eine vorhandene Tuer
     unter dem Zeiger liegt (Inline-Stil schlaegt Klassenregel). */
  body.oeffnet #plan canvas{cursor:crosshair}

  .kopf{position:fixed;top:52px;left:0;padding:14px 26px;pointer-events:none;max-width:min(46ch,72vw)}
  .kopf h1{font-family:var(--serif);font-weight:600;font-size:clamp(19px,2.5vw,27px);
       margin:0 0 3px;line-height:1.15}
  .kopf .sub{font-family:var(--mono);font-size:10.5px;letter-spacing:.13em;
       text-transform:uppercase;color:var(--ink-mute);line-height:1.7}
  /* Der Zaehler der frei gesetzten Stuecke. RUHIG, aber in der Warnfarbe:
     er widerspricht der Zeile darueber ("aus dem gemessenen Grundriss") und
     muss darum sofort als Einschraenkung zu erkennen sein — die Bank darf ein
     frei gezogenes Blatt NIE fuer ein Aufmass halten. */
  .kopf .gesetzt{font-family:var(--mono);font-size:10.5px;letter-spacing:.13em;
       text-transform:uppercase;color:var(--amber);line-height:1.7;margin-top:5px}
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
  button:hover:not(:disabled){background:var(--paper-deep);color:var(--ink)}
  button[aria-pressed="true"]{color:var(--paper);background:var(--sage-deep);border-color:var(--sage-deep)}
  button:focus-visible{outline:2px solid var(--amber);outline-offset:1px}
  button:disabled{opacity:.32;cursor:default}
  .lbl{font-family:var(--mono);font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;
       color:var(--ink-mute);padding:0 7px 0 3px;user-select:none;font-variant-numeric:tabular-nums}

  /* Kopfleiste: Umschalter + der unauffaellige Bearbeiten-Schalter. */
  .kopfleiste{position:fixed;top:10px;left:50%;transform:translateX(-50%);
       display:flex;gap:5px;padding:5px;background:var(--panel);
       border:1px solid var(--panel-line);backdrop-filter:blur(9px);
       -webkit-backdrop-filter:blur(9px);z-index:20}
  .kopfleiste button{padding:7px 12px;min-height:38px}
  #btnBearbeiten{font-size:9.5px;color:var(--ink-mute)}
  #btnBearbeiten[aria-pressed="true"]{color:var(--paper)}

  .standleiste{position:fixed;top:60px;left:50%;transform:translateX(-50%);
       display:flex;align-items:center;gap:8px;padding:5px 6px 5px 12px;
       background:var(--panel);border:1px solid var(--panel-line);
       max-width:calc(100vw - 24px);z-index:19;font-family:var(--mono);
       font-size:10px;letter-spacing:.06em;color:var(--ink-mute);line-height:1.5}
  .standleiste.warnt{border-color:var(--rot);color:var(--rot)}
  .standleiste button{padding:7px 9px;min-height:34px;font-size:9.5px}

  .meldung{position:fixed;top:104px;left:50%;transform:translateX(-50%);
       max-width:min(60ch,calc(100vw - 24px));padding:9px 14px;z-index:30;
       background:var(--panel);border:1px solid var(--panel-line);
       font-size:12.5px;line-height:1.45;color:var(--ink)}
  .meldung.warnt{border-color:var(--rot);color:var(--rot)}

  /* Rueckfragen liegen unten mittig und NICHT am Zeiger: am Zeiger verdeckten
     sie genau das Objekt, ueber das sie eine Auskunft verlangen (E1). */
  .frage{position:fixed;left:50%;bottom:76px;transform:translateX(-50%);
       max-width:calc(100vw - 24px);z-index:40;background:rgba(255,255,255,.96);
       border:1px solid var(--rot);padding:11px 14px;
       display:flex;flex-wrap:wrap;align-items:center;gap:10px}
  .frage .txt{font-size:13.5px;color:var(--ink)}
  .frage .txt b{color:var(--rot)}
  .frage .knoepfe{display:flex;gap:6px;margin-left:auto}
  .frage button{border:1px solid var(--panel-line);min-height:40px}
  .frage button.ernst{background:var(--rot);border-color:var(--rot);color:#fff}
  .frage button.ernst:hover{background:#8d2f21;color:#fff}
  .frage .fuss{flex-basis:100%;text-align:center;font-family:var(--mono);
       font-size:9.5px;letter-spacing:.08em;color:var(--ink-mute)}

  .tafel{position:fixed;top:104px;right:20px;width:270px;max-height:calc(100vh - 220px);
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
  /* ── Palette (W3): was man hinstellen kann ────────────────────────────
     Sie liegt IM Grundriss-Bereich und erbt damit dessen Sichtbarkeit: beim
     Wechsel aufs Blatt verschwindet sie von selbst, ohne eine zweite Regel,
     die man vergessen koennte. Farbklima, Schriften und Rahmen sind die der
     Legenden-Tafel — ein Planblatt, kein Werkzeugkasten. */
  .palette{position:fixed;left:16px;top:104px;width:134px;
       max-height:calc(100vh - 230px);background:var(--panel);
       border:1px solid var(--panel-line);backdrop-filter:blur(9px);
       -webkit-backdrop-filter:blur(9px);display:flex;flex-direction:column;z-index:7}
  .palette-kopf{padding:11px 12px 8px;border-bottom:1px solid var(--panel-line);
       font-family:var(--mono);font-size:10px;letter-spacing:.15em;text-transform:uppercase;
       color:var(--ink-dim)}
  .palette-leib{overflow-y:auto;padding:4px 5px 6px}
  /* Ueberschreibt die Leisten-Knopfregel oben: hier steht ein NAME unter einem
     Zeichen, keine Schaltflaechen-Beschriftung in Versalien. */
  .pstueck{display:flex;flex-direction:column;align-items:center;gap:2px;width:100%;
       padding:5px 3px;border:1px solid transparent;background:transparent;cursor:grab;
       font-family:var(--sans);font-size:11.5px;letter-spacing:.01em;text-transform:none;
       color:var(--ink-dim);min-height:0}
  .pstueck:hover:not(:disabled){background:var(--paper-deep);color:var(--ink)}
  .pstueck.zieht{cursor:grabbing}
  /* MUSS sein: die globale canvas-Regel oben streckt jedes Canvas auf 100 %. */
  .pstueck canvas{width:110px;height:46px;display:block;pointer-events:none}
  .pstueck .pmass{font-family:var(--mono);font-size:9px;letter-spacing:.06em;
       color:var(--ink-mute);font-variant-numeric:tabular-nums}
  .palette-fuss{padding:8px 12px 10px;border-top:1px solid var(--panel-line);
       font-size:10.5px;line-height:1.45;color:var(--ink-mute)}
  /* Das Stueck am Zeiger, waehrend es wandert. \`pointer-events:none\` ist keine
     Feinheit, sondern Bedingung: sonst faende \`elementFromPoint\` beim Loslassen
     den Geist statt der Zeichenflaeche und es entstuende nie etwas. */
  .geist{position:fixed;z-index:60;pointer-events:none;padding:4px 9px;
       background:var(--panel);border:1px solid var(--amber);color:var(--amber);
       font-family:var(--mono);font-size:9.5px;letter-spacing:.11em;text-transform:uppercase}

  .hinweis{position:fixed;left:26px;bottom:18px;max-width:44ch;font-family:var(--mono);
       font-size:9.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-mute);
       pointer-events:none;opacity:.85;line-height:1.7}

  @media (max-width:900px){
    .tafel{top:auto;bottom:112px;right:10px;left:10px;width:auto;max-height:38vh}
    .hinweis{display:none}
    .kopf{padding:10px 14px;max-width:none}
    .kopf .sub{font-size:9px;letter-spacing:.11em;line-height:1.6}
    .strich{margin:7px 0 6px;max-width:180px}
    .leiste{bottom:10px;padding:5px;gap:4px}
    button{padding:8px 9px;font-size:10px}
    .lbl{padding:0 4px 0 2px;font-size:9px}
    /* Auf schmalen Anzeigen KEINE Palette. Das Hineinziehen laeuft ueber
       Maus-Ereignisse; ein Finger loest sie erst beim Loslassen aus, der Zug
       waere also nicht zu verfolgen. Dieselbe offene Stelle wie beim Ziehen
       vorhandener Moebel (W2, "am Handy noch nicht geloest"). Eine sichtbare
       Palette, die auf Fingerdruck nichts tut, waere schlimmer als keine:
       sie behauptet eine Bedienung, die es hier nicht gibt. */
    .palette{display:none}
  }
  @media (prefers-reduced-motion:reduce){*{transition-duration:.01ms!important}}
</style>
</head>
<body>

<!-- ── Blatt: die Axonometrie. Startansicht, wie bisher. ─────────────── -->
<div class="ansicht" id="blatt">
  <canvas id="axo-canvas"></canvas>

  <header class="kopf">
    <h1>Halle&nbsp;400 &middot; Büro</h1>
    <div class="strich"></div>
    <div class="sub" id="unterzeile">Axonometrie</div>
    <div class="gesetzt" id="gesetztZaehler" hidden></div>
    <!-- Die Öffnungs-Legende (W4). Sie steht NUR da, wenn es Öffnungen gibt:
         eine dauerhafte „0 Öffnungen"-Zeile lehrte den Leser, über sie
         hinwegzusehen — genau dann, wenn sie einmal wichtig wird. -->
    <div class="gesetzt" id="oeffnungZaehler" hidden></div>
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
    <span id="hinweisHerkunft">Grundriss und Ausstattung sind gemessen.</span> Höhen sind
    gesetzte Annahmen — ein Grundriss enthält keine.
  </div>
</div>

<!-- ── Grundriss: hier wird bearbeitet. ─────────────────────────────── -->
<div class="ansicht weg" id="plan">
  <canvas id="grundriss-canvas"></canvas>

  <!-- Palette (W3): Stücke in den Grundriss ziehen. Erscheint mit den
       Werkzeugen, weil sie eines ist. Der Inhalt kommt aus
       AUSSTATTUNG_VORLAGEN im Kern — nicht aus dieser Hülle, sonst hätte die
       Doppelklick-Datei eine eigene Möbelliste. -->
  <aside class="palette" id="palette" hidden>
    <div class="palette-kopf">Hinstellen</div>
    <div class="palette-leib" id="paletteLeib"></div>
    <div class="palette-fuss">In den Grundriss ziehen. Was so entsteht, ist
      <b>frei gesetzt</b> und wird gestrichelt gezeichnet — kein Aufmaß.</div>
  </aside>

  <div class="leiste" id="werkzeuge" role="toolbar" aria-label="Grundriss bearbeiten" hidden>
    <div class="grp">
      <span class="lbl">Werkzeug</span>
      <button type="button" id="wzMove" title="Verschieben — Ecken, Wände und Möbel ziehen. Q und E drehen das Möbel unter dem Zeiger um 15°." aria-pressed="true">Verschieben</button>
      <button type="button" id="wzDraw" title="Wände zeichnen — Punkt für Punkt" aria-pressed="false">Wände zeichnen</button>
      <button type="button" id="wzOeffnung" title="Türen &amp; Fenster — auf eine Wand zeigen, klicken setzt. Q wendet den Anschlag, E die Aufschlagseite." aria-pressed="false">Türen &amp; Fenster</button>
      <button type="button" id="wzDelete" title="Löschen — mit Rückfrage" aria-pressed="false">Löschen</button>
    </div>
    <!-- Die Arten der Öffnung. Sie erscheinen NUR mit dem Werkzeug: vier
         weitere Knöpfe in einer ohnehin breiten Leiste wären sonst dauerhaft
         im Weg, ohne je etwas zu bewirken. Ein Klick wählt die Art UND greift
         das Werkzeug — wer „Fenster" drückt, will ein Fenster setzen. -->
    <div class="grp" id="oeffnungsArten" hidden>
      <span class="lbl">Öffnung</span>
      <button type="button" data-oeffnung="tuer" aria-pressed="true">Tür</button>
      <button type="button" data-oeffnung="doppeltuer" aria-pressed="false">Doppeltür</button>
      <button type="button" data-oeffnung="fenster" aria-pressed="false">Fenster</button>
      <button type="button" data-oeffnung="durchgang" aria-pressed="false">Durchgang</button>
    </div>
    <div class="grp">
      <button type="button" id="btnEinrasten" aria-pressed="true" title="Gezogene Möbel bündig an die Wand legen, Öffnungen bündig an die Ecke oder in die Wandmitte, sonst auf 5 cm runden">Einrasten</button>
    </div>
    <div class="grp">
      <button type="button" id="btnUndo" title="Rückgängig (Strg+Z)">Rückgängig</button>
      <button type="button" id="btnRedo" title="Wiederholen (Strg+Y)">Wiederholen</button>
    </div>
    <div class="grp">
      <button type="button" id="btnZoomAus" title="Kleiner zeigen">Zoom &minus;</button>
      <button type="button" id="btnZoomEin" title="Größer zeigen">Zoom +</button>
      <button type="button" id="btnEinpassen" title="Die ganze Halle ins Bild legen">Ganze Halle</button>
      <span class="lbl" id="zoomAnzeige" aria-live="off">100 %</span>
    </div>
    <div class="grp">
      <button type="button" id="btnExport" title="Diesen Stand als Datei ablegen">Sichern</button>
      <button type="button" id="btnImport" title="Einen gesicherten Stand öffnen">Laden</button>
    </div>
    <div class="grp">
      <button type="button" id="btnZurueck" title="Alle eigenen Änderungen verwerfen">Zurücksetzen</button>
    </div>
  </div>

  <!-- Lösch-Rückfrage (E1): Abbrechen zuerst, die gefährliche Wahl darf nicht
       die bequemste sein. -->
  <div class="frage" id="rueckfrage" role="alertdialog" aria-live="assertive" aria-label="Löschen bestätigen" hidden>
    <span class="txt"><b>Entfernen:</b> <span id="rueckfrageZiel"></span>?</span>
    <span class="knoepfe">
      <button type="button" id="btnAbbrechen">Abbrechen</button>
      <button type="button" id="btnEntfernen" class="ernst">Entfernen</button>
    </span>
    <span class="fuss">Rückgängig mit Strg+Z &middot; Abbrechen mit Esc</span>
  </div>

  <div class="frage" id="zurueckFrage" role="alertdialog" aria-live="assertive" aria-label="Zurücksetzen bestätigen" hidden>
    <span class="txt"><b>Zurücksetzen:</b> alle eigenen Änderungen verwerfen und den gemessenen Plan zeigen?</span>
    <span class="knoepfe">
      <button type="button" id="btnZurueckNein">Abbrechen</button>
      <button type="button" id="btnZurueckJa" class="ernst">Zurücksetzen</button>
    </span>
    <span class="fuss">Das lässt sich nicht rückgängig machen. Vorher „Sichern“ legt den Stand als Datei ab.</span>
  </div>
</div>

<div class="kopfleiste" role="toolbar" aria-label="Ansicht wählen">
  <div class="grp">
    <button type="button" id="btnAnsichtPlan" aria-pressed="false">Grundriss</button>
    <button type="button" id="btnAnsichtAxo" aria-pressed="true">Axonometrie</button>
  </div>
  <div class="grp">
    <button type="button" id="btnBearbeiten" aria-pressed="false" title="Werkzeuge zum Bearbeiten einblenden">Bearbeiten</button>
  </div>
</div>

<div class="standleiste" id="standleiste" hidden>
  <span id="standText"></span>
  <button type="button" id="btnStandZurueck">Auf den gemessenen Plan zurücksetzen</button>
</div>

<div class="frage" id="standFrage" role="alertdialog" aria-live="assertive" aria-label="Gespeicherten Stand prüfen" hidden>
  <span class="txt"><b>Gespeicherter Stand:</b> <span id="standFrageText"></span></span>
  <span class="knoepfe">
    <button type="button" id="btnStandVerwerfen">Gemessenen Plan zeigen</button>
    <button type="button" id="btnStandLaden">Stand laden</button>
  </span>
</div>

<div class="meldung" id="meldung" role="status" aria-live="polite" hidden></div>

<input type="file" id="dateiWahl" accept=".json,application/json" hidden>

<script>
"use strict";
(function(){

/* ══════════════════════════════════════════════════════════════════
   DER GEMESSENE PLAN — aus app/public/plaene/${PLAN_NAME}.json
   Er bleibt in dieser Datei IMMER unveraendert: er ist die Grundwahrheit aus
   der PDF. Was der Nutzer aendert, liegt daneben.
   ══════════════════════════════════════════════════════════════════ */
const PLAN = ${planRoh};

/* Hoehen aus src/three/ausstattung.ts, zur Bauzeit GELESEN statt abgeschrieben. */
const HOEHEN = ${JSON.stringify(HOEHEN)};

/* Fingerabdruck des eingebauten Plans und Zeitpunkt dieses Baus. */
const PLAN_ABDRUCK = ${JSON.stringify(PLAN_ABDRUCK)};
const BAU_STEMPEL = ${JSON.stringify(BAU_STEMPEL)};

${three}

${kern}

${axo}

/* ══════════════════════════════════════════════════════════════════
   HUELLE
   ══════════════════════════════════════════════════════════════════ */

const WAND_HOEHE_CM = ${WAND_HOEHE_CM};
const WAND_DICKE_CM = ${WAND_DICKE_CM};

/* ── Speicher ───────────────────────────────────────────────────────
   Zwei gemessene Eigenheiten von \`file://\`, auf die die Huelle Ruecksicht
   nimmt — beide mit Playwright nachgemessen, keine Vermutung:

   1. Der ganze Rechner ist EIN Ursprung. Eine Datei in Ordner B liest den Wert,
      den eine Datei in Ordner A geschrieben hat. Der Schluessel traegt deshalb
      den Abdruck des eingebauten Plans UND den Ablageort dieser Datei — sonst
      uebernaehme die Kopie im Download-Ordner still die Aenderungen der
      Arbeitskopie. Der BAU-Zeitpunkt gehoert bewusst NICHT dazu: ein neuer Bau
      der Huelle bei unveraendertem Plan darf die Arbeit nicht wegwerfen.
   2. Der Platz ist knapp (rund 4,8 MB fuer ALLE file://-Seiten zusammen) und ein
      Fehlschlag ist still. Darum: nur der AKTUELLE Stand wird gespeichert,
      keine Historie — und jeder Fehlschlag wird sichtbar gemeldet.

   Ob der Speicher ueberhaupt traegt, wird EINMAL wirklich geprueft (schreiben,
   zuruecklesen, wegraeumen) statt ihm zu glauben: in manchen Browsern und im
   privaten Modus gibt es ein localStorage, das nichts behaelt. */
function kurzHash(text){
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
const ORT_ABDRUCK = kurzHash(decodeURIComponent(location.pathname).toLowerCase());
const SCHLUESSEL = 'halle400-planer-datei:plan:' + PLAN_ABDRUCK + ':' + ORT_ABDRUCK;
const SCHLUESSEL_BEARBEITEN = 'halle400-planer-datei:bearbeiten:' + ORT_ABDRUCK;

const speicher = (function(){
  try {
    const probe = SCHLUESSEL + ':probe';
    localStorage.setItem(probe, 'p');
    const zurueck = localStorage.getItem(probe);
    localStorage.removeItem(probe);
    return zurueck === 'p' ? localStorage : null;
  } catch (e) {
    return null;
  }
})();

function abschrift(o){ return JSON.parse(JSON.stringify(o)); }

/* ── Elemente und Zustand ───────────────────────────────────────────
   Stehen VOR dem Modell: das Laden des Grundrisses meldet sich sofort ueber
   \`fireOnUpdatedRooms\`, und dieser Rueckruf liest den Ansichts-Zustand. Waeren
   die Angaben erst darunter erklaert, braeche die Datei beim OEffnen mit
   "Cannot access before initialization" ab. */
const el = function(id){ return document.getElementById(id); };
const blattEl = el('blatt');
const planEl = el('plan');
const werkzeuge = el('werkzeuge');
const palette = el('palette');
const tafel = el('tafel');
const rueckfrage = el('rueckfrage');
const zurueckFrage = el('zurueckFrage');
const standFrage = el('standFrage');
const standleiste = el('standleiste');
const meldungEl = el('meldung');
const dateiWahl = el('dateiWahl');
const btnUndo = el('btnUndo');
const btnRedo = el('btnRedo');

let ansicht = 'axo';
let bearbeiten = false;
let vollausbau = false;
let tafelAn = true;
let namenModus = 'alle';
let axoCanvas = el('axo-canvas');
let axoAnsicht = null;
let szene = null;
let axoUhr = null;
let meldungUhr = null;
let axoVeraltet = true;

/* ── Aufbau ─────────────────────────────────────────────────────────
   Die Reihenfolge ist zwingend: Configuration VOR dem Laden (Wall liest seine
   Masse bei der Erzeugung von dort), Modell vor Zeichner, Zeichner vor der
   Historie. */
Configuration.setValue(configWallHeight, WAND_HOEHE_CM);
Configuration.setValue(configWallThickness, WAND_DICKE_CM);

const grundriss = new Floorplan();

let labels = PLAN.labels || [];
let gesichertAm = null;
let speicherFehler = speicher ? null : 'merkt-nichts';
let sichernGesperrt = true;
let sicherUhr = null;
let standFragt = null;

/* Liegt ein eigener Stand? Er muss zum eingebauten Plan passen — sonst wird
   NICHT still geladen, sondern ruhig gefragt. */
let start = null;
if (speicher) {
  try {
    const roh = speicher.getItem(SCHLUESSEL);
    if (roh) {
      const stand = JSON.parse(roh);
      if (stand && stand.floorplan && stand.floorplan.corners && stand.planAbdruck === PLAN_ABDRUCK) {
        start = stand;
      } else if (stand && stand.floorplan) {
        standFragt = stand;
      }
    }
  } catch (e) {
    standFragt = null;
  }
}
if (start) {
  gesichertAm = start.gesichertAm || null;
  if (Array.isArray(start.labels)) labels = start.labels;
}

/* ── Woran erkennt die Huelle eine Aenderung? ───────────────────────
   GEMESSEN, nicht angenommen: \`fireOnUpdatedRooms\` reicht NICHT. Es haengt an
   \`Floorplan.update()\`, und das ruft der Kern nur bei neuer/entfernter Wand,
   beim Verschmelzen von Ecken und beim Laden (floorplan.ts:207,216,352 ·
   corner.ts:298,329). Eine VERSCHOBENE Ecke ruft es nicht — \`Corner.move()\`
   benachrichtigt nur seine Waende. Wer sich allein darauf verliesse, haette
   genau den Fall verloren, um den es in dieser Welle geht: das Ziehen. (Der
   Nachweis war knifflig, weil ein Undo danach doch noch \`update()\` ausloest —
   die Aenderung kam also scheinbar an, nur eine Handlung zu spaet.)

   Darum wird der Zustand VERGLICHEN statt geglaubt: nach jedem Zeigerende und
   bei jeder Meldung des Kerns wird der gespeicherte Grundriss einmal
   ausgeschrieben und mit dem zuletzt bemerkten verglichen. Das ist zugleich der
   Filter gegen Leerlauf — ein Klick, der nichts aendert, sichert auch nichts. */
let letzterStand = null;

function bemerkeAenderung(){
  if (sichernGesperrt) return;
  const jetzt = JSON.stringify(grundriss.saveFloorplan());
  if (jetzt === letzterStand) return;
  letzterStand = jetzt;
  axoVeraltet = true;
  gesetztZeigen();
  if (ansicht === 'axo') axoBaldNeu();
  sichernPlanen();
}

/* ── Was der Nutzer FREI GESETZT hat ────────────────────────────────
   Die tragende Regel des ganzen Vorhabens: die PDF ist die Grundwahrheit, und
   ein gezogenes Moebel ist KEIN Aufmass mehr. Im Grundriss ist es an der
   Strichelung zu erkennen — auf dem BLATT, das die Bank ansieht, waere es das
   nicht. Darum diese eine Zeile im Blattkopf. Sie erscheint nur, wenn es etwas
   zu sagen gibt: eine dauerhafte "0 Stueck frei gesetzt"-Zeile lehrte den
   Leser, ueber sie hinwegzusehen — genau dann, wenn sie einmal wichtig wird. */
function gesetztZeigen(){
  const n = grundriss.zaehleGesetzte();
  const z = el('gesetztZaehler');
  z.textContent = n + ' Stück frei gesetzt — kein Aufmaß';
  z.hidden = n === 0;
  /* Der Fusshinweis MUSS mitgehen, sonst widerspricht dasselbe Blatt sich
     selbst: oben "1 Stück frei gesetzt", unten "Ausstattung ist gemessen".
     Wer das liest, glaubt am Ende der bequemeren Zeile. */
  el('hinweisHerkunft').textContent = n === 0
    ? 'Grundriss und Ausstattung sind gemessen.'
    : 'Der Grundriss ist gemessen; ' + n + ' Stück der Ausstattung sind frei gesetzt (im Grundriss gestrichelt).';
  oeffnungenZeigen();
}

/* ── Die Öffnungs-Legende (W4) ──────────────────────────────────────
   Warum sie sein MUSS: die Ansicht schneidet die Waende auf 1,16 m auf. Eine
   Tuer ist darin so hoch wie die Wand — sie sieht aus wie ein Durchbruch bis
   zur Decke. Ohne diese Zeile liest die Bank eine Hoehenaussage aus einem
   Bild, das gar keine trifft. Lage und Breite dagegen SIND massstaeblich, und
   genau das sagt der Satz.

   Verwaiste Oeffnungen werden getrennt genannt: sie stehen im Modell, aber
   nicht im Bild. Das still zu lassen waere die schlechtere Wahl — der Nutzer
   soll erfahren, dass beim Loeschen einer Wand seine Tuer heimatlos wurde. */
function oeffnungenZeigen(){
  const m = grundriss.zaehleOeffnungen();
  const verwaist = grundriss.zaehleVerwaiste();
  const z = el('oeffnungZaehler');
  z.hidden = m === 0;
  if (m === 0) return;
  z.textContent = m + (m === 1 ? ' Öffnung gesetzt' : ' Öffnungen gesetzt') +
    (verwaist > 0 ? ' (davon ' + verwaist + ' ohne Wand — nicht gezeichnet)' : '') +
    ' — die Ansicht schneidet die Wände auf 1,16 m; Türen und Fenster sind darum ' +
    'in der HÖHE nicht maßstäblich, nur in Lage und Breite.';
}

grundriss.fireOnUpdatedRooms(bemerkeAenderung);

/* Der eigene Stand kann aus einer NEUEREN Fassung stammen (jemand hat eine
   aeltere Kopie dieser Datei geoeffnet). Der Kern lehnt ihn dann ab — was hier
   keine weisse Seite ergeben darf: lieber der gemessene Plan und eine ehrliche
   Meldung. Der Stand bleibt liegen, damit die neuere Kopie ihn wiederfindet. */
let standFehler = null;
try {
  grundriss.loadFloorplan(abschrift(start ? start.floorplan : PLAN.floorplan));
} catch (e) {
  standFehler = (e && e.message) ? e.message : String(e);
  start = null;
  gesichertAm = null;
  labels = PLAN.labels || [];
  grundriss.loadFloorplan(abschrift(PLAN.floorplan));
}
letzterStand = JSON.stringify(grundriss.saveFloorplan());

const zeichner = new Floorplanner('grundriss-canvas', grundriss);

/* Historie anschliessen — GENAU wie im Planer (src/blueprint3d.ts:57-58).
   \`setUndoManager\` meldet dem UndoManager zugleich, wie die Ansicht ueber ein
   Zurueckspielen zu retten ist; ohne das spraenge der Ausschnitt bei jedem
   Strg+Z auf "alles einpassen" zurueck. Schnappschuesse zieht der KERN selbst
   (Zieh-Beginn, gesetzter Zeichenpunkt, bestaetigtes Loeschen) — die Huelle
   zieht KEINE eigenen, sonst waere ein Ziehen mehrere Undo-Schritte. */
const undo = new UndoManager(grundriss);
zeichner.setUndoManager(undo);

/* Das Ende eines Zuges — hier, nicht bei jeder Bewegung: waehrend eines Ziehens
   feuert \`mousemove\` hundertfach, und jedes Mal den ganzen Grundriss
   auszuschreiben waere Arbeit ohne Ertrag. Am DOKUMENT und nicht am Canvas,
   weil die Taste auch ausserhalb der Zeichenflaeche losgelassen werden kann. */
document.addEventListener('mouseup', bemerkeAenderung);
document.addEventListener('touchend', bemerkeAenderung);
document.addEventListener('touchcancel', bemerkeAenderung);
/* Auch die TASTATUR aendert etwas: Q und E drehen das Moebel unter dem Zeiger
   (W2). Ohne diese Zeile bliebe eine Drehung bis zum naechsten Mausklick
   ungesichert und das Blatt zeigte sie nicht — dieselbe Falle wie beim
   Verschieben, nur mit anderem Ausloeser. */
document.addEventListener('keyup', bemerkeAenderung);

/* Der Zeichner entstand nach dem Laden, hat dessen \`roomLoadedCallbacks\` also
   nicht mitbekommen. Einmal das nachholen, was er sonst selbst tut. */
zeichner.reset();

/* ── Axonometrie ────────────────────────────────────────────────────
   Sie ist ein FENSTER, kein Werkzeug: bearbeitet wird im Grundriss, die
   Axonometrie folgt. Bei jedem Neubau bekommt sie ein FRISCHES Canvas — der
   Renderer meldet seine Zeiger-Abos nie ab (src/axo/axo-zeichnen.js:392-459),
   ein zweiter Aufruf auf demselben Canvas stapelte sie, und jedes Ziehen
   drehte danach doppelt so schnell. Mit dem alten Canvas sterben seine Abos.
   Der Blickwinkel wird uebernommen, Zoom und Verschiebung nicht — die kennt
   nur der Renderer selbst. */
function tafelRand(){ return (tafelAn && innerWidth > 900) ? 294 : 0; }

function axoNeuBauen(){
  const blickVorher = axoAnsicht ? axoAnsicht.blick : null;
  const frisch = document.createElement('canvas');
  frisch.id = 'axo-canvas';
  axoCanvas.parentNode.replaceChild(frisch, axoCanvas);
  axoCanvas = frisch;

  szene = baueSzene(
    { floorplan: grundriss.saveFloorplan(), labels: labels },
    { wandDicke: WAND_DICKE_CM, nurKernSaeulen: !vollausbau, hoehen: HOEHEN }
  );
  axoAnsicht = erzeugeAxonometrie(axoCanvas, szene, { namen: namenModus, randRechts: tafelRand() });
  if (blickVorher) axoAnsicht.setzeBlick(blickVorher.az, blickVorher.el);
  axoAnsicht.passeAn();
  axoCanvas.addEventListener('pointerdown', function(){ axoCanvas.classList.add('zieht'); });
  ['pointerup','pointercancel'].forEach(function(t){
    axoCanvas.addEventListener(t, function(){ axoCanvas.classList.remove('zieht'); });
  });
  tafelZeichnen();
  axoVeraltet = false;
}

function axoBaldNeu(){
  clearTimeout(axoUhr);
  axoUhr = setTimeout(function(){ if (ansicht === 'axo') axoNeuBauen(); }, 150);
}

function verortete(){
  const m = {};
  for (const k of szene.marken) if (k.hervor && k.saeule != null) m[k.saeule] = k.text;
  return m;
}

function tafelZeichnen(){
  const belegt = verortete();
  const anzahl = Object.keys(belegt).length;
  const leib = el('tafelLeib');
  leib.innerHTML = '';
  SAEULEN.forEach(function(s, i){
    const raum = belegt[i];
    const zeile = document.createElement('div');
    zeile.className = 'zeile' + (raum ? ' an' : '');
    zeile.innerHTML = '<div class="n">' + s.n + '</div><div>' +
      '<div class="nm"></div>' + (raum ? '<div class="rm"></div>' : '') +
      '<div class="src"></div></div>';
    zeile.querySelector('.nm').textContent = s.rolle;
    if (raum) zeile.querySelector('.rm').textContent = raum;
    zeile.querySelector('.src').textContent = s.name;
    leib.appendChild(zeile);
  });
  el('zaehler').textContent = anzahl + '/9 verortet';
  el('tafelFuss').textContent = vollausbau
    ? 'Vollausbau — auch Teamtable, Konferenz, Workshop, Videokonf und Break out tragen eine Säule.'
    : 'Die vier Räume, die im Plan Workspace, Einzelbüro oder Doppelbüro heißen.';
  const b = (szene.grenzen.x1 - szene.grenzen.x0).toFixed(0);
  const t = (szene.grenzen.z1 - szene.grenzen.z0).toFixed(0);
  el('unterzeile').innerHTML =
    'Axonometrie &middot; ' + b + ' &times; ' + t + ' m<br>' +
    anzahl + ' Räume nach den Säulen benannt';
}

/* ── Ansicht umschalten ─────────────────────────────────────────────
   Beide Ansichten bleiben im Dokument und behalten ihre Groesse; nur die
   ruhende ist unsichtbar und nimmt keine Eingaben an. */
function zeigeAnsicht(name){
  ansicht = name;
  blattEl.classList.toggle('weg', name !== 'axo');
  planEl.classList.toggle('weg', name !== 'plan');
  el('btnAnsichtAxo').setAttribute('aria-pressed', String(name === 'axo'));
  el('btnAnsichtPlan').setAttribute('aria-pressed', String(name === 'plan'));
  if (name === 'plan') {
    zeichner.resizeView();
  } else if (axoVeraltet) {
    axoNeuBauen();
  } else {
    axoAnsicht.passeAn();
  }
}

/* ── Bearbeiten ─────────────────────────────────────────────────────
   Im Auslieferungszustand sieht die Bank ein ruhiges Blatt: keine Werkzeuge.
   Der Schalter merkt sich seinen Zustand, damit man ihn nicht bei jedem
   OEffnen neu greifen muss. */
function setzeBearbeiten(an, merken){
  bearbeiten = an;
  werkzeuge.hidden = !an;
  // Die Palette gehoert zu den Werkzeugen: wer nur zusieht, soll auch nichts
  // hinstellen koennen. Ein laufender Zug wird dabei abgebrochen — sonst legte
  // ein Loslassen nach dem Ausschalten noch ein Stueck ab, das niemand
  // bestellt hat.
  palette.hidden = !an;
  if (!an) paletteZugAbbrechen();
  el('btnBearbeiten').setAttribute('aria-pressed', String(an));
  if (an) {
    zeigeAnsicht('plan');
  } else {
    // Ein ruhendes Loeschen-Werkzeug waere eine Falle beim naechsten OEffnen.
    zeichner.setMode(floorplannerModes.MOVE);
    zeigeAnsicht('axo');
  }
  if (merken && speicher) {
    try { speicher.setItem(SCHLUESSEL_BEARBEITEN, an ? '1' : '0'); } catch (e) { /* Platz ist knapp; der Schalter ist es nicht wert */ }
  }
}

/* ── Sichern ────────────────────────────────────────────────────────
   Entprellt, damit ein Ziehen ueber viele Bewegungen EINMAL schreibt und nicht
   hundertmal. Gespeichert wird nur der aktuelle Stand — der Platz unter
   file:// ist knapp und wird mit allen anderen file://-Seiten geteilt. */
function sichernPlanen(){
  clearTimeout(sicherUhr);
  sicherUhr = setTimeout(sichereJetzt, 600);
}

function sichereJetzt(){
  if (!speicher) { standZeigen(); return; }
  const jetzt = new Date().toISOString();
  try {
    speicher.setItem(SCHLUESSEL, JSON.stringify({
      fassung: 1,
      planAbdruck: PLAN_ABDRUCK,
      bauStempel: BAU_STEMPEL,
      gesichertAm: jetzt,
      floorplan: grundriss.saveFloorplan(),
      labels: labels
    }));
    gesichertAm = jetzt;
    speicherFehler = null;
  } catch (e) {
    // Nie still verlieren: der Platz ist geteilt und schnell voll.
    speicherFehler = (e && e.name) ? e.name : 'Fehler';
  }
  standZeigen();
}

function standZeigen(){
  const knopf = el('btnStandZurueck');
  if (speicherFehler === 'merkt-nichts') {
    standleiste.hidden = false;
    standleiste.classList.add('warnt');
    el('standText').textContent = 'Dieser Browser merkt sich hier nichts — sichere deinen Stand über den Knopf „Sichern“.';
    knopf.hidden = true;
    return;
  }
  if (speicherFehler) {
    standleiste.hidden = false;
    standleiste.classList.add('warnt');
    el('standText').textContent = 'Nicht gespeichert (' + speicherFehler + ') — bitte über „Sichern“ als Datei ablegen.';
    knopf.hidden = true;
    return;
  }
  if (!gesichertAm) { standleiste.hidden = true; return; }
  standleiste.hidden = false;
  standleiste.classList.remove('warnt');
  const d = new Date(gesichertAm);
  el('standText').textContent = 'Eigener Stand vom ' + d.toLocaleDateString('de-DE') +
    ', ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr.';
  knopf.hidden = false;
}

function meldung(text, warnt){
  meldungEl.textContent = text;
  meldungEl.classList.toggle('warnt', !!warnt);
  meldungEl.hidden = false;
  clearTimeout(meldungUhr);
  meldungUhr = setTimeout(function(){ meldungEl.hidden = true; }, 9000);
}

/* Laedt einen Grundriss und laesst dabei nichts Eigenes zurueck. Die Historie
   raeumt der Kern selbst ab (UndoManager haengt an roomLoadedCallbacks) — ein
   Undo ueber einen Plan-Wechsel hinweg spielte sonst fremde Waende ein. */
function ladeGrundriss(fp, neueLabels, alsEigenerStand){
  sichernGesperrt = true;
  try {
    if (Array.isArray(neueLabels)) labels = neueLabels;
    grundriss.loadFloorplan(abschrift(fp));
    letzterStand = JSON.stringify(grundriss.saveFloorplan());
  } finally {
    sichernGesperrt = false;
  }
  // Von Hand, nicht ueber \`bemerkeAenderung\`: das war waehrend des Ladens
  // gesperrt und haette den Zaehler auf dem Stand von VOR dem Laden gelassen.
  gesetztZeigen();
  axoNeuBauen();
  if (alsEigenerStand) {
    sichereJetzt();
  } else {
    gesichertAm = null;
    standZeigen();
  }
}

function zuruecksetzen(){
  if (speicher) { try { speicher.removeItem(SCHLUESSEL); } catch (e) { /* egal */ } }
  clearTimeout(sicherUhr);
  labels = PLAN.labels || [];
  speicherFehler = speicher ? null : 'merkt-nichts';
  ladeGrundriss(PLAN.floorplan, PLAN.labels || [], false);
  meldung('Der gemessene Plan aus der PDF ist wieder hergestellt.', false);
}

/* ── Als Datei sichern ──────────────────────────────────────────────
   Dasselbe Format wie app/public/plaene/halle400.json, damit dieselbe Datei im
   echten Planer geoeffnet werden kann — beide Welten sprechen ein Format. */
function alsDatei(){
  const daten = {
    floorplan: grundriss.saveFloorplan(),
    items: PLAN.items || [],
    labels: labels
  };
  const heute = new Date();
  const stempel = heute.getFullYear() + '-' +
    String(heute.getMonth() + 1).padStart(2, '0') + '-' +
    String(heute.getDate()).padStart(2, '0');
  const blob = new Blob([JSON.stringify(daten, null, 2)], { type: 'application/json' });
  const adresse = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = adresse;
  a.download = 'Halle400-Plan-' + stempel + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function(){ URL.revokeObjectURL(adresse); }, 4000);
  meldung('Gesichert als ' + a.download + ' (im Download-Ordner).', false);
}

/* Grobe Formpruefung beim Laden: lieber klar ablehnen als an einer fremden
   Datei zerbrechen. */
function pruefePlan(roh){
  let d;
  try { d = JSON.parse(roh); } catch (e) { return { fehler: 'Das ist keine lesbare JSON-Datei.' }; }
  const fp = d && d.floorplan ? d.floorplan : d;
  if (!fp || typeof fp !== 'object' || !fp.corners || typeof fp.corners !== 'object' || !Array.isArray(fp.walls)) {
    return { fehler: 'Diese Datei ist kein Grundriss — es fehlen „corners“ und „walls“.' };
  }
  /* Eine Datei aus einer NEUEREN Fassung wird abgelehnt, nicht halb geoeffnet:
     sie traegt Felder, die dieser Stand nicht kennt (etwa Tueren an einer Wand),
     und beim naechsten Sichern waeren sie still verschwunden. Der Kern wuerfe
     hier ohnehin — die Meldung ist nur hier lesbar. */
  const fassung = fp.formatVersion || 1;
  if (fassung > PLAN_FASSUNG) {
    return { fehler: 'Diese Datei stammt aus einer neueren Fassung des Planers (Format ' +
      fassung + ', hier: ' + PLAN_FASSUNG + '). Sie wird nicht geöffnet, damit keine Angaben still verloren gehen.' };
  }
  const eckenZahl = Object.keys(fp.corners).length;
  if (eckenZahl === 0 || fp.walls.length === 0) {
    return { fehler: 'Dieser Grundriss ist leer (' + eckenZahl + ' Ecken, ' + fp.walls.length + ' Wände).' };
  }
  return { floorplan: fp, labels: Array.isArray(d.labels) ? d.labels : null, ecken: eckenZahl, waende: fp.walls.length };
}

/* ── Bedienung: Grundriss ──────────────────────────────────────────── */
const werkzeugKnopf = { };
werkzeugKnopf[floorplannerModes.MOVE] = el('wzMove');
werkzeugKnopf[floorplannerModes.DRAW] = el('wzDraw');
werkzeugKnopf[floorplannerModes.DELETE] = el('wzDelete');
werkzeugKnopf[floorplannerModes.OEFFNUNG] = el('wzOeffnung');

el('wzMove').addEventListener('click', function(){ zeichner.setMode(floorplannerModes.MOVE); });
el('wzDraw').addEventListener('click', function(){ zeichner.setMode(floorplannerModes.DRAW); });
el('wzDelete').addEventListener('click', function(){ zeichner.setMode(floorplannerModes.DELETE); });
el('wzOeffnung').addEventListener('click', function(){ zeichner.setMode(floorplannerModes.OEFFNUNG); });

/* Der Kern schaltet das Werkzeug OFT von selbst zurueck: bei Escape, bei einem
   Klick ins Leere im Loeschen-Werkzeug, wenn ein Streckenzug an einer
   vorhandenen Ecke schliesst, nach jedem Laden und nach jedem Undo. Die Leiste
   folgt darum diesem Callback und haelt niemals ihren eigenen Zustand fuer
   wahr — sonst zeigte sie "Waende zeichnen", waehrend laengst verschoben wird. */
zeichner.addModeResetCallback(function(m){
  for (const k in werkzeugKnopf) {
    werkzeugKnopf[k].setAttribute('aria-pressed', String(Number(k) === m));
  }
  document.body.classList.toggle('zeichnet', m === floorplannerModes.DRAW);
  document.body.classList.toggle('loescht', m === floorplannerModes.DELETE);
  document.body.classList.toggle('oeffnet', m === floorplannerModes.OEFFNUNG);
  // Die Arten-Gruppe erscheint mit ihrem Werkzeug und verschwindet mit ihm.
  el('oeffnungsArten').hidden = m !== floorplannerModes.OEFFNUNG;
});

/* ── Öffnungen: Art wählen (W4) ─────────────────────────────────────
   Der Knopf haelt seinen Zustand NIE selbst fuer wahr, sondern folgt dem Kern
   — dieselbe Regel wie bei Werkzeug und Einrasten. Die Breiten stehen NICHT
   hier, sondern in OEFFNUNGS_VORLAGEN im Kern: zwei Listen liefen auseinander,
   sobald jemand nur eine anfasst, und dann hiesse dieselbe Tuer in der einen
   Welt 87,5 cm und in der anderen 90. */
document.querySelectorAll('[data-oeffnung]').forEach(function(b){
  b.addEventListener('click', function(){
    zeichner.setzeOeffnungsArt(b.dataset.oeffnung);
    // Wer eine Art waehlt, will sie setzen — also gleich das Werkzeug greifen.
    if (zeichner.mode !== floorplannerModes.OEFFNUNG) {
      zeichner.setMode(floorplannerModes.OEFFNUNG);
    }
  });
});
zeichner.addOeffnungsCallback(function(art){ markiere('[data-oeffnung]', art); });

/* Was ein Klick bewirkt hat — sonst bliebe ein abgelehnter Versuch stumm. */
zeichner.addOeffnungGesetztCallback(function(o){
  if (o) {
    meldung((OEFFNUNG_NAME[o.art] || o.art) + ' gesetzt — frei gesetzt, kein Aufmaß. ' +
      'Q wendet den Anschlag, E die Aufschlagseite. Rückgängig mit Strg+Z.', false);
  } else {
    meldung('Hier passt keine Öffnung hin — an dieser Stelle liegt schon eine, ' +
      'oder die Wand ist zu kurz.', false);
  }
  bemerkeAenderung();
});

/* Eine Rueckfrage muss UEBER der Werkzeugleiste stehen, nicht auf ihr. Wie hoch
   die Leiste ist, haengt davon ab, wie oft sie umbricht (Fensterbreite,
   Schriftgroesse) — ein fester Abstand traefe es also nur zufaellig. Also
   messen statt schaetzen. */
function frageZeigen(panel){
  panel.style.bottom = (werkzeuge.hidden ? 24 : werkzeuge.offsetHeight + 26) + 'px';
  panel.hidden = false;
}

/* Die Rueckfrage nullt ihren Zustand NIE selbst — der Kern meldet das
   Schliessen mit \`null\` (E1). */
zeichner.addLoeschAnfrageCallback(function(ziel){
  if (!ziel) { rueckfrage.hidden = true; return; }
  el('rueckfrageZiel').textContent = ziel.beschreibung;
  frageZeigen(rueckfrage);
  el('btnEntfernen').focus();
});
el('btnAbbrechen').addEventListener('click', function(){ zeichner.loeschungAbbrechen(); });
el('btnEntfernen').addEventListener('click', function(){ zeichner.loeschungBestaetigen(); });

function historieZeigen(){
  btnUndo.disabled = !undo.canUndo();
  btnRedo.disabled = !undo.canRedo();
}
undo.changed.add(historieZeigen);
btnUndo.addEventListener('click', function(){ undo.undo(); });
btnRedo.addEventListener('click', function(){ undo.redo(); });
historieZeigen();

/* Einrasten (W2). Der Knopf haelt seinen Zustand NIE selbst fuer wahr, sondern
   folgt dem Kern — genauso wie die Werkzeug-Knoepfe oben. */
el('btnEinrasten').addEventListener('click', function(){
  zeichner.setzeEinrasten(!zeichner.istEinrasten());
});
zeichner.addEinrastCallback(function(an){
  el('btnEinrasten').setAttribute('aria-pressed', String(an));
});
el('btnEinrasten').setAttribute('aria-pressed', String(zeichner.istEinrasten()));

/* ── Palette: ein Stueck in den Grundriss ziehen (W3) ────────────────
   Bewusst mit Maus-Ereignissen und NICHT mit der HTML5-Ziehschnittstelle
   (draggable + dragstart/drop). Zwei gemessene Gruende: erstens laesst sich
   dort das Bild am Zeiger nicht steuern, ohne eine Zweitzeichnung anzulegen —
   und eine zweite Zeichnung driftet; zweitens taugt sie in dieser Datei nicht
   zum Pruefen, weil ein DataTransfer sich nicht als Ereignis nachstellen
   laesst. Maus-Ereignisse sind derselbe Weg, den das Moebelziehen (W2) schon
   geht, und lassen sich mit \`dispatchEvent\` exakt nachfahren.

   Der WEG des Zuges laeuft ueber das DOKUMENT und nicht ueber die Palette: wer
   ein Stueck in den Plan zieht, verlaesst die Leiste sofort — auf ihr endet
   kein einziger Zug. */
const VORSCHAU_BREITE = 110;
const VORSCHAU_HOEHE = 46;

let paletteZug = null;
let geistEl = null;

function vorlageFuer(typ){
  for (const v of AUSSTATTUNG_VORLAGEN) if (v.typ === typ) return v;
  return null;
}

/* Die Vorschau kommt von DERSELBEN Zeichenvorschrift wie der Grundriss
   (\`Floorplanner.zeichneVorschau\` -> \`FloorplannerView.zeichneAusstattung\`).
   Nachmalen waere eine zweite Wahrheit ueber das Aussehen eines Zeichens: der
   Nutzer zoege dann irgendwann etwas in den Plan, das dort anders aussieht. */
function paletteBauen(){
  const leib = el('paletteLeib');
  leib.innerHTML = '';
  AUSSTATTUNG_VORLAGEN.forEach(function(v){
    const name = AUSSTATTUNG_NAME[v.typ] || v.typ;
    const knopf = document.createElement('button');
    knopf.type = 'button';
    knopf.className = 'pstueck';
    knopf.dataset.typ = v.typ;
    knopf.title = name + ' — ' + v.breite + ' × ' + v.tiefe + ' cm, in den Grundriss ziehen';
    const flaeche = document.createElement('canvas');
    flaeche.width = VORSCHAU_BREITE;
    flaeche.height = VORSCHAU_HOEHE;
    flaeche.className = 'pv';
    const nm = document.createElement('span');
    nm.textContent = name;
    const mass = document.createElement('span');
    mass.className = 'pmass';
    mass.textContent = v.breite + '×' + v.tiefe;
    knopf.appendChild(flaeche);
    knopf.appendChild(nm);
    knopf.appendChild(mass);
    leib.appendChild(knopf);
    zeichner.zeichneVorschau(flaeche.getContext('2d'), v,
      { x: 0, y: 0, breite: VORSCHAU_BREITE, hoehe: VORSCHAU_HOEHE });
  });
}

function geistZeigen(x, y, text){
  if (!geistEl) {
    geistEl = document.createElement('div');
    geistEl.className = 'geist';
    geistEl.id = 'geist';
    document.body.appendChild(geistEl);
  }
  geistEl.textContent = text;
  geistEl.hidden = false;
  geistBewegen(x, y);
}

function geistBewegen(x, y){
  if (!geistEl) return;
  // Versetzt und nicht mittig: unter dem Zeiger verdeckte der Geist genau die
  // Stelle, an der abgelegt wird.
  geistEl.style.left = (x + 14) + 'px';
  geistEl.style.top = (y + 14) + 'px';
}

function paletteZugAbbrechen(){
  paletteZug = null;
  if (geistEl) geistEl.hidden = true;
  document.querySelectorAll('.pstueck.zieht').forEach(function(k){ k.classList.remove('zieht'); });
}

palette.addEventListener('mousedown', function(e){
  const knopf = e.target && e.target.closest ? e.target.closest('.pstueck') : null;
  if (!knopf) return;
  const v = vorlageFuer(knopf.dataset.typ);
  if (!v) return;
  // Ohne das startet der Browser sein eigenes Ziehen (Bild/Auswahl) und
  // verschluckt die weiteren Maus-Ereignisse.
  e.preventDefault();
  paletteZug = v;
  knopf.classList.add('zieht');
  geistZeigen(e.clientX, e.clientY, AUSSTATTUNG_NAME[v.typ] || v.typ);
});

document.addEventListener('mousemove', function(e){
  if (paletteZug) geistBewegen(e.clientX, e.clientY);
});

document.addEventListener('mouseup', function(e){
  if (!paletteZug) return;
  const v = paletteZug;
  paletteZugAbbrechen();
  stueckAblegen(v, e.clientX, e.clientY);
});

/* Esc bricht den Zug ab — dieselbe Taste, mit der der Kern ein angefangenes
   Zeichnen zuruecknimmt. */
addEventListener('keydown', function(e){
  if (paletteZug && e.key === 'Escape') paletteZugAbbrechen();
});

/* Verlaesst der Zeiger das FENSTER, endet der Zug hier — auch wenn kein
   Loslassen mehr kommt. Ohne diese beiden Zeilen bliebe der Zug scharf: das
   Loslassen ausserhalb des Fensters erreicht das Dokument nicht, der Geist
   klebte am Rand, und der naechste Klick irgendwo im Bild legte ein Stueck ab,
   das niemand mehr bestellt hatte. Ein abgebrochener Zug kostet ein zweites
   Ziehen; ein haengender Zug kostet Vertrauen. */
document.addEventListener('mouseleave', paletteZugAbbrechen);
addEventListener('blur', paletteZugAbbrechen);

function stueckAblegen(v, clientX, clientY){
  const c = document.getElementById('grundriss-canvas');
  /* WORAN ERKENNT DIE HUELLE "im Grundriss"? An dem, was WIRKLICH oben liegt.
     Die Zeichenflaeche ist bildschirmfuellend (\`.ansicht{inset:0}\`), Palette
     und Leisten liegen DARUEBER. Ein blosser Vergleich mit ihrem Rechteck
     haette darum auch ein Loslassen auf der Palette als "im Grundriss"
     gewertet und ein Stueck unter der Leiste erzeugt, wo es niemand sieht.
     Ausserhalb des Fensters liefert \`elementFromPoint\` null — auch das ist
     "nicht im Grundriss". */
  const oben = document.elementFromPoint(clientX, clientY);
  if (oben !== c) {
    meldung('Hier lässt sich nichts ablegen — ziehen Sie das Stück auf die Zeichenfläche.', false);
    return null;
  }
  const r = c.getBoundingClientRect();
  const stueck = zeichner.stueckAblegen(clientX - r.left, clientY - r.top, v);
  if (!stueck) {
    meldung('Hier lässt sich nichts ablegen — ziehen Sie das Stück auf die Zeichenfläche.', false);
    return null;
  }
  /* Von Hand melden: \`bemerkeAenderung\` haengt am Zeigerende des DOKUMENTS und
     wurde weiter oben angemeldet, laeuft also VOR diesem Rueckruf — es haette
     den Stand von VOR dem Ablegen verglichen und nichts bemerkt. Ohne diese
     Zeile bliebe das neue Stueck ungesichert und das Blatt zeigte es nicht. */
  bemerkeAenderung();
  meldung((AUSSTATTUNG_NAME[v.typ] || v.typ) + ' hingestellt — frei gesetzt, kein Aufmaß. ' +
    'Rückgängig mit Strg+Z.', false);
  return stueck;
}

paletteBauen();

el('btnZoomAus').addEventListener('click', function(){ zeichner.zoomeUmFaktor(1 / 1.25); });
el('btnZoomEin').addEventListener('click', function(){ zeichner.zoomeUmFaktor(1.25); });
el('btnEinpassen').addEventListener('click', function(){ zeichner.allesEinpassen(); });
zeichner.addZoomCallback(function(z){
  el('zoomAnzeige').textContent = Math.round(z * 100) + ' %';
});
el('zoomAnzeige').textContent = Math.round(zeichner.getZoom() * 100) + ' %';

el('btnExport').addEventListener('click', alsDatei);
el('btnImport').addEventListener('click', function(){ dateiWahl.value = ''; dateiWahl.click(); });
dateiWahl.addEventListener('change', function(){
  const datei = dateiWahl.files && dateiWahl.files[0];
  if (!datei) return;
  const leser = new FileReader();
  leser.onerror = function(){ meldung('Die Datei liess sich nicht lesen.', true); };
  leser.onload = function(){
    const geprueft = pruefePlan(String(leser.result));
    if (geprueft.fehler) { meldung(geprueft.fehler, true); return; }
    ladeGrundriss(geprueft.floorplan, geprueft.labels, true);
    meldung('Geladen: ' + geprueft.ecken + ' Ecken, ' + geprueft.waende + ' Wände aus „' + datei.name + '“.', false);
  };
  leser.readAsText(datei);
});

el('btnZurueck').addEventListener('click', function(){ frageZeigen(zurueckFrage); el('btnZurueckNein').focus(); });
el('btnZurueckNein').addEventListener('click', function(){ zurueckFrage.hidden = true; });
el('btnZurueckJa').addEventListener('click', function(){ zurueckFrage.hidden = true; zuruecksetzen(); });
el('btnStandZurueck').addEventListener('click', function(){
  // Der Hinweis liegt oben, die Rueckfrage unten: dazwischen muss die
  // Werkzeugleiste sichtbar sein, sonst fragt etwas Unsichtbares.
  if (!bearbeiten) setzeBearbeiten(true, true);
  frageZeigen(zurueckFrage);
  el('btnZurueckNein').focus();
});

/* Tastatur: Rueckgaengig/Wiederholen macht die HUELLE. Escape registriert der
   KERN selbst auf dem Dokument (floorplanner.ts:493-497) — hier waere es
   doppelt. Eingabefelder bleiben unberuehrt. */
addEventListener('keydown', function(e){
  const z = e.target;
  if (z && (z.tagName === 'INPUT' || z.tagName === 'TEXTAREA' || z.isContentEditable)) return;
  if (!(e.ctrlKey || e.metaKey)) return;
  const taste = (e.key || '').toLowerCase();
  if (taste === 'z' && !e.shiftKey) { e.preventDefault(); undo.undo(); }
  else if (taste === 'y' || (taste === 'z' && e.shiftKey)) { e.preventDefault(); undo.redo(); }
});

/* ── Bedienung: Blatt ──────────────────────────────────────────────── */
function markiere(auswahl, wert){
  document.querySelectorAll(auswahl).forEach(function(b){
    const schluessel = Object.keys(b.dataset)[0];
    b.setAttribute('aria-pressed', String(b.dataset[schluessel] === wert));
  });
}
document.querySelectorAll('[data-blick]').forEach(function(b){
  b.addEventListener('click', function(){
    const v = BLICKE[+b.dataset.blick];
    axoAnsicht.setzeBlick(v.az, v.el);
    markiere('[data-blick]', b.dataset.blick);
  });
});
document.querySelectorAll('[data-namen]').forEach(function(b){
  b.addEventListener('click', function(){
    namenModus = b.dataset.namen;
    axoAnsicht.setzeNamen(namenModus);
    markiere('[data-namen]', namenModus);
  });
});
el('btnAusbau').addEventListener('click', function(){
  vollausbau = !vollausbau;
  el('btnAusbau').setAttribute('aria-pressed', String(vollausbau));
  axoNeuBauen();
});
el('btnTafel').addEventListener('click', function(){
  tafelAn = !tafelAn;
  tafel.classList.toggle('weg', !tafelAn);
  el('btnTafel').setAttribute('aria-pressed', String(tafelAn));
  axoAnsicht.setzeRandRechts(tafelRand());
});

/* ── Bedienung: Umschalter + Bearbeiten ────────────────────────────── */
el('btnAnsichtAxo').addEventListener('click', function(){ zeigeAnsicht('axo'); });
el('btnAnsichtPlan').addEventListener('click', function(){ zeigeAnsicht('plan'); });
el('btnBearbeiten').addEventListener('click', function(){ setzeBearbeiten(!bearbeiten, true); });

addEventListener('resize', function(){ if (axoAnsicht && ansicht === 'axo') axoAnsicht.passeAn(); });

/* ── Start ──────────────────────────────────────────────────────────
   Auf schmalen Anzeigen laengs statt quer blicken: der 78-m-Riegel laeuft dann
   in die Tiefe statt ueber die Breite und wird gut doppelt so gross. */
let startBlick = '0';
if (innerWidth < 900) {
  startBlick = '1';
  tafelAn = false;
  tafel.classList.add('weg');
  el('btnTafel').setAttribute('aria-pressed', 'false');
  namenModus = 'saeulen';
}
axoNeuBauen();
if (startBlick === '1') axoAnsicht.setzeBlick(BLICKE[1].az, 0.54);
markiere('[data-blick]', startBlick);
markiere('[data-namen]', namenModus);

standZeigen();
gesetztZeigen();

/* Ein abgelehnter eigener Stand wird GESAGT — still den gemessenen Plan zu
   zeigen sähe aus, als wäre die Arbeit verloren. */
if (standFehler) meldung(standFehler, true);

if (standFragt) {
  const d = standFragt.gesichertAm ? new Date(standFragt.gesichertAm) : null;
  el('standFrageText').textContent = 'Es liegt ein Stand' +
    (d ? ' vom ' + d.toLocaleDateString('de-DE') + ', ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr' : '') +
    ', der nicht zum eingebauten Plan passt. Laden oder den gemessenen Plan zeigen?';
  standFrage.hidden = false;
  el('btnStandLaden').addEventListener('click', function(){
    standFrage.hidden = true;
    ladeGrundriss(standFragt.floorplan, standFragt.labels, true);
  });
  el('btnStandVerwerfen').addEventListener('click', function(){
    standFrage.hidden = true;
    if (speicher) { try { speicher.removeItem(SCHLUESSEL); } catch (e) { /* egal */ } }
  });
}

// Erst JETZT darf gesichert werden: das blosse OEffnen ist keine Aenderung.
sichernGesperrt = false;

if (speicher) {
  try { if (speicher.getItem(SCHLUESSEL_BEARBEITEN) === '1') setzeBearbeiten(true, false); } catch (e) { /* egal */ }
}

/* ── Selbstauskunft fuer tools/pruefe-planer-datei.mjs ───────────────
   Das Pruefwerkzeug misst am lebenden Modell und am fertigen Bild, statt
   Behauptungen zu glauben. Bewusst nur lesend gedacht; es kostet nichts. */
function bildmass(canvas){
  const g = canvas.getContext('2d');
  const d = g.getImageData(0, 0, canvas.width, canvas.height).data;
  const r0 = d[0], g0 = d[1], b0 = d[2], a0 = d[3];
  let tinte = 0, summe = 2166136261;
  for (let i = 0; i < d.length; i += 16) {
    const anders = Math.abs(d[i] - r0) + Math.abs(d[i+1] - g0) + Math.abs(d[i+2] - b0) + Math.abs(d[i+3] - a0);
    if (anders > 24) tinte++;
    summe ^= (d[i] + d[i+1] * 3 + d[i+2] * 7 + d[i+3] * 11) & 255;
    summe = Math.imul(summe, 16777619);
  }
  return { tinte: tinte, summe: summe >>> 0 };
}

window.__planerDatei = {
  planAbdruck: PLAN_ABDRUCK,
  bauStempel: BAU_STEMPEL,
  schluessel: SCHLUESSEL,
  speicherTraegt: !!speicher,
  ansicht: function(){ return ansicht; },
  bearbeitet: function(){ return bearbeiten; },
  werkzeugeSichtbar: function(){ return !werkzeuge.hidden; },
  zahlen: function(){
    return {
      ecken: grundriss.getCorners().length,
      waende: grundriss.getWalls().length,
      raeume: grundriss.getRooms().length,
      ausstattung: grundriss.getAusstattung().length
    };
  },
  ecken: function(){
    return grundriss.getCorners().map(function(c){
      return { id: c.id, x: c.x, y: c.y, bx: zeichner.convertX(c.x), by: zeichner.convertY(c.y) };
    });
  },
  waende: function(){
    return grundriss.getWalls().map(function(w){
      const a = w.getStart(), b = w.getEnd();
      return {
        // BILD-Koordinaten (so hiess es seit W1, bleibt unveraendert) ...
        ax: zeichner.convertX(a.x), ay: zeichner.convertY(a.y),
        bx: zeichner.convertX(b.x), by: zeichner.convertY(b.y),
        // ... und dazu die WELT, die das Einrasten braucht (W2). Zusaetzlich
        // und nicht anstelle: ein Gate, das die alten Namen liest, misst sonst
        // ploetzlich Zentimeter und haelt sie fuer Bildpunkte.
        id: w.id, dicke: w.thickness,
        wax: a.x, way: a.y, wbx: b.x, wby: b.y
      };
    });
  },
  ecke: function(id){
    const c = grundriss.getCorners().find(function(k){ return k.id === id; });
    return c ? { id: c.id, x: c.x, y: c.y, bx: zeichner.convertX(c.x), by: zeichner.convertY(c.y) } : null;
  },
  werkzeug: function(){ return zeichner.mode; },
  setzeWerkzeug: function(m){ zeichner.setMode(m); },
  /* --- Moebelziehen (W2). Bewusst dieselben Angaben wie im Planer, damit ein
     Gate beide Welten mit DEMSELBEN Code messen kann: was hier anders hiesse,
     waere ein zweiter Massstab und damit kein Vergleich mehr. */
  ausstattung: function(){
    return grundriss.getAusstattung().map(function(e){
      return {
        id: e.id, typ: e.typ, x: e.x, y: e.y, breite: e.breite, tiefe: e.tiefe,
        drehung: e.drehung || 0, quelle: e.quelle,
        bx: zeichner.convertX(e.x), by: zeichner.convertY(e.y)
      };
    });
  },
  stueck: function(id){
    const e = grundriss.findeAusstattung(id);
    if (!e) return null;
    return {
      id: e.id, typ: e.typ, x: e.x, y: e.y, breite: e.breite, tiefe: e.tiefe,
      drehung: e.drehung || 0, quelle: e.quelle,
      bx: zeichner.convertX(e.x), by: zeichner.convertY(e.y)
    };
  },
  gesetzte: function(){ return grundriss.zaehleGesetzte(); },
  /* --- Oeffnungen (W4). Dieselben Angaben wie im Planer, damit ein Gate beide
     Welten mit DEMSELBEN Code messen kann. \`bx/by\` ist die Mitte im BILD,
     \`wx/wy\` in der WELT — das Gate braucht beides: Bildpunkte zum Klicken,
     Weltmasse zum Rechnen. */
  oeffnungen: function(){
    return grundriss.getOeffnungen().map(function(o){
      const g = grundriss.oeffnungsGeometrie(o);
      return {
        id: o.id, wandId: o.wandId, lage: o.lage, breite: o.breite, art: o.art,
        seite: o.seite, anschlag: o.anschlag, bruestung: o.bruestung,
        quelle: o.quelle, verwaist: !!o.verwaist,
        anker: { x: o.anker.x, y: o.anker.y },
        wx: g ? g.mx : null, wy: g ? g.my : null,
        bx: g ? zeichner.convertX(g.mx) : null, by: g ? zeichner.convertY(g.my) : null
      };
    });
  },
  oeffnung: function(id){
    return window.__planerDatei.oeffnungen().find(function(o){ return o.id === id; }) || null;
  },
  oeffnungsGeist: function(){
    const g = zeichner.geistOeffnung;
    return g ? { wandId: g.wandId, lage: g.lage, breite: g.breite, art: g.art,
                 seite: g.seite, anschlag: g.anschlag, passt: g.passt } : null;
  },
  oeffnungsArt: function(){ return zeichner.oeffnungsArt; },
  setzeOeffnungsArt: function(a){ zeichner.setzeOeffnungsArt(a); },
  oeffnungText: function(){
    const z = el('oeffnungZaehler');
    return z.hidden ? null : z.textContent;
  },
  /* Der KILL-SCHALTER der Versoehnung — nur fuer die Gegenprobe des Gates.
     Ein Waechter, der nie rot wird, ist kein Waechter: die Pruefung "nach dem
     Teilen liegt die Tuer auf der richtigen Haelfte" beweist erst dann etwas,
     wenn dieselbe Pruefung OHNE Versoehnung nachweislich fehlschlaegt. */
  versoehnung: function(an){ grundriss.versoehnungAn = an; },
  versoehneJetzt: function(){ return grundriss.versoehneOeffnungen(); },
  /* Eine Wand TEILEN — genau die beiden Aufrufe, die \`mouseup\` im
     Zeichnen-Werkzeug macht (floorplanner.ts): eine neue Ecke setzen und sie
     mit dem verschmelzen lassen, was darunter liegt. Kein Sonderweg fuers
     Pruefen, sondern der Produktionspfad ohne die Zeiger-Umrechnung davor. */
  wandTeilenAn: function(x, y){
    const c = grundriss.newCorner(x, y);
    return { geteilt: c.mergeWithIntersected(), waende: grundriss.getWalls().length };
  },
  wandLoeschen: function(id){
    const w = grundriss.getWalls().find(function(v){ return v.id === id; });
    if (!w) return false;
    w.remove();
    grundriss.update();
    return true;
  },
  /* Einen fremden Grundriss laden — fuer die Fassungs-Pruefung (Gate h).
     Geht ueber DIESELBE Formpruefung wie der Knopf "Laden", damit das Gate die
     Meldung misst, die der Nutzer sehen wuerde. */
  pruefeDatei: function(roh){ return pruefePlan(roh); },
  ladeDatei: function(roh){
    const g = pruefePlan(roh);
    if (g.fehler) return { fehler: g.fehler };
    ladeGrundriss(g.floorplan, g.labels, false);
    return { ecken: g.ecken, waende: g.waende };
  },
  /* --- Palette (W3). Der Zug selbst wird vom Gate mit echten Maus-Ereignissen
     nachgefahren; hier steht nur, WO die Eintraege liegen und ob ihre Vorschau
     ueberhaupt gezeichnet ist. Die Tinte zaehlt undurchsichtige Bildpunkte im
     Vorschau-Canvas: ein leeres Kaestchen faellt damit auf, ein nachgemaltes
     Rechteck nicht — deshalb prueft das Gate zusaetzlich, dass sich die
     Vorschauen der Arten UNTERSCHEIDEN. */
  paletteSichtbar: function(){ return !palette.hidden; },
  paletteEintraege: function(){
    return Array.prototype.map.call(
      document.querySelectorAll('#paletteLeib .pstueck'),
      function(knopf){
        const flaeche = knopf.querySelector('canvas');
        const r = knopf.getBoundingClientRect();
        const v = vorlageFuer(knopf.dataset.typ);
        const d = flaeche.getContext('2d').getImageData(0, 0, flaeche.width, flaeche.height).data;
        let tinte = 0, summe = 2166136261;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] > 10) tinte++;
          summe ^= (d[i + 3] + (i % 977)) & 255;
          summe = Math.imul(summe, 16777619);
        }
        return {
          typ: knopf.dataset.typ,
          name: knopf.querySelector('span').textContent,
          breite: v ? v.breite : null,
          tiefe: v ? v.tiefe : null,
          mitteX: r.left + r.width / 2,
          mitteY: r.top + r.height / 2,
          tinte: tinte,
          summe: summe >>> 0
        };
      }
    );
  },
  /* Wie viele Koerper die Axonometrie WIRKLICH baut. Die Zahl faellt auf eine
     halb verdrahtete Typ-Kette: ohne Eintrag in AUSSTATTUNG_STIL oder
     OBERKANTE_CM liefert \`bauformFuer\` null und das Stueck fehlt hier, waehrend
     es im Grundriss weiterhin sichtbar ist. */
  szeneMoebel: function(){ return szene ? szene.moebel.length : null; },
  /* Baut die Axonometrie neu — dieselbe Funktion, die die Huelle selbst ruft.
     Noetig, weil \`setzeAusstattung\` (Strichprobe) bewusst KEINE Aenderung
     meldet und die Ansicht sonst veraltet bliebe: das Gate maesse dann die
     Szene von VORHER und hielte sie fuer die von jetzt. */
  axoNeuBauen: function(){ axoNeuBauen(); },
  gesetztText: function(){
    const z = el('gesetztZaehler');
    return z.hidden ? null : z.textContent;
  },
  hinweisHerkunft: function(){ return el('hinweisHerkunft').textContent; },
  aufBild: function(x, y){ return { x: zeichner.convertX(x), y: zeichner.convertY(y) }; },
  treffer: function(){
    return {
      ausstattung: zeichner.activeAusstattung,
      wand: zeichner.activeWall ? zeichner.activeWall.id : null,
      ecke: zeichner.activeCorner ? zeichner.activeCorner.id : null
    };
  },
  einrasten: function(){ return zeichner.istEinrasten(); },
  setzeEinrasten: function(an){ zeichner.setzeEinrasten(an); },
  zoomeAufPunkt: function(z, bx, by){ zeichner.zoomeAufPunkt(z, bx, by); },
  proCm: function(){ return zeichner.pixelProCm(); },
  undoJetzt: function(){ undo.undo(); },
  /* Nur fuer die Strichprobe: dieselbe Liste einmal mit anderer Herkunft
     einspielen, um am GLEICHEN Stueck an der GLEICHEN Stelle zu messen, ob
     "gesetzt" wirklich anders gezeichnet wird. Zieht bewusst KEINEN
     Schnappschuss — sonst zaehlte die Messung als Zug des Nutzers. */
  ausstattungRoh: function(){ return JSON.parse(JSON.stringify(grundriss.getAusstattung())); },
  setzeAusstattung: function(liste){ grundriss.setAusstattung(liste); zeichner.resizeView(); },
  zeigerStil: function(){ return document.getElementById('grundriss-canvas').style.cursor; },
  taste: function(k){
    document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true }));
  },
  kannZurueck: function(){ return undo.canUndo(); },
  kannVor: function(){ return undo.canRedo(); },
  gesichertAm: function(){ return gesichertAm; },
  speicherStand: function(){
    if (!speicher) return null;
    try { return speicher.getItem(SCHLUESSEL); } catch (e) { return null; }
  },
  bildBlatt: function(){ return bildmass(axoCanvas); },
  bildPlan: function(){ return bildmass(document.getElementById('grundriss-canvas')); },
  maus: function(typ, x, y){
    const c = document.getElementById('grundriss-canvas');
    const r = c.getBoundingClientRect();
    c.dispatchEvent(new MouseEvent(typ, { bubbles: true, clientX: r.left + x, clientY: r.top + y }));
  }
};
window.__bereit = true;
})();
</script>
</body>
</html>
`

/* ── Letzte Pruefung vor dem Schreiben ────────────────────────────────
   Die Namens-Karte oben prueft die BUENDEL gegeneinander — sie kennt aber die
   Bezeichner der Huelle nicht. Ein `const zeichner` hier und ein gleichnamiger
   im Kern waeren ein harter Syntaxfehler, sichtbar erst im Browser der Bank.
   Deshalb geht der fertige Skriptrumpf einmal durch den Parser von Node: das
   findet doppelte Deklarationen, uebrig gebliebene Modul-Syntax und jeden
   Tippfehler, BEVOR die Datei ausgeliefert wird. */
const rumpf = html.match(/<script>([\s\S]*?)<\/script>/)
if (!rumpf) {
  console.error('Abbruch: kein Skriptrumpf gefunden — die Vorlage ist kaputt.')
  process.exit(1)
}
const pruefDatei = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'h400-pruef-')), 'rumpf.js')
fs.writeFileSync(pruefDatei, rumpf[1], 'utf8')
try {
  execFileSync(process.execPath, ['--check', pruefDatei], { stdio: 'pipe' })
} catch (e) {
  console.error('Abbruch: der zusammengelegte Quelltext ist kein gueltiges Javascript.')
  console.error(String(e.stderr || e.message).split('\n').slice(0, 12).join('\n'))
  process.exit(1)
} finally {
  fs.rmSync(path.dirname(pruefDatei), { recursive: true, force: true })
}
if (/^[ \t]*(import|export)[\s{'"*]/m.test(rumpf[1])) {
  console.error('Abbruch: Modul-Syntax im Rumpf uebrig — unter file:// laedt nichts nach.')
  process.exit(1)
}

fs.writeFileSync(ZIEL, html, 'utf8')

const kb = fs.statSync(ZIEL).size / 1024
const teilKb = (s) => (Buffer.byteLength(s, 'utf8') / 1024).toFixed(0)
console.log(`Planer-Datei geschrieben: ${ZIEL}`)
console.log(`  Groesse:      ${kb.toFixed(0)} KB (eine Datei, keine Begleitdateien)`)
console.log(`  three:        ${teilKb(three)} KB (nur der Rechen-Teil, ohne Bildschirm-Ausgabe)`)
console.log(`  2D-Kern:      ${teilKb(kern)} KB (aus src/ uebersetzt, nicht abgeschrieben)`)
console.log(`  Axonometrie:  ${teilKb(axo)} KB (${AXO_MODULE.join(', ')})`)
console.log(`  Plan:         ${(Buffer.byteLength(planRoh, 'utf8') / 1024).toFixed(0)} KB — ${Object.keys(plan.floorplan.corners).length} Ecken, ${plan.floorplan.walls.length} Waende, ${(plan.floorplan.ausstattung || []).length} Ausstattung, ${(plan.labels || []).length} Namen`)
console.log(`  Hoehen aus:   src/three/ausstattung.ts (${Object.keys(HOEHEN.oberkante).length} Typen, gelesen statt abgeschrieben)`)
console.log(`  Namen:        ${namen.size} Bezeichner geprueft, keine Kollision`)
console.log(`  Plan-Abdruck: ${PLAN_ABDRUCK} (Speicher-Schluessel je Plan UND Ablageort)`)
console.log(`  Bau-Stempel:  ${BAU_STEMPEL}`)
