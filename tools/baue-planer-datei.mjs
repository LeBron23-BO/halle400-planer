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
import { siegelLesen, oeffentlichLesen, pruefeUnterschrift, PBKDF2_RUNDEN, PBKDF2_HASH, verschliesse, schlossOrt } from './siegel.mjs'

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

/* ── DAS SIEGEL ───────────────────────────────────────────────────────
   Die Unterschrift unter den gemessenen Plan (tools/siegel.mjs). Sie ist der
   einzige Schutz, der wirklich gegen BOESWILLIGKEIT hilft: wer die Datei
   besitzt, hat einen Texteditor — verhindern kann man nichts, beweisen alles.
   Der oeffentliche Schluessel wandert mit in die Datei; aus ihm laesst sich
   keine gueltige Unterschrift herstellen.

   FEHLT das Siegel, wird NICHT still weitergebaut: eine Datei, die aussieht wie
   die gesiegelte und keine ist, waere schlimmer als gar keine — sie lehrt den
   Leser, auf ein Zeichen zu vertrauen, das mal da ist und mal nicht. */
const NUR_ANSICHT = process.argv.includes('--nur-ansicht')
const OHNE_SIEGEL = process.argv.includes('--ohne-siegel')
if (NUR_ANSICHT && !process.argv.includes('--ziel')) {
  console.error('Abbruch: --nur-ansicht ohne --ziel wuerde die Werkstatt-Datei ueberschreiben.')
  console.error('  Gemessen (Gegner-Fund M1): der Speicherschluessel haengt am Pfad — ein liegen')
  console.error('  gebliebenes `bearbeiten:1` derselben Stelle macht die Ansicht wieder scharf.')
  console.error('  node tools/baue-planer-datei.mjs --nur-ansicht --ziel "<pfad>/Halle400-fuer-die-Bank.html"')
  process.exit(1)
}
const siegel = siegelLesen(PLAN_NAME)
const siegelSchluessel = oeffentlichLesen()

/* Das Schloss vor der Werkstatt. Es entsteht EINMAL beim Anlegen des Siegels
   und wird hier nur eingebaut — der Bau selbst braucht darum kein Passwort und
   kann in jedem Skript laufen, ohne dass ein Geheimnis auf der Befehlszeile
   steht. In die reine Ansichts-Fassung kommt es nicht: dort gibt es nichts
   aufzuschliessen. */
const schlossPfad = schlossOrt()
const schloss = fs.existsSync(schlossPfad) ? JSON.parse(fs.readFileSync(schlossPfad, 'utf8')) : null
if (!NUR_ANSICHT && !OHNE_SIEGEL && !schloss) {
  console.error('Abbruch: kein Schloss (data/schloss.json).')
  console.error('  node tools/siegel.mjs schloss --passwort "<dein-passwort>"')
  process.exit(1)
}
if (!OHNE_SIEGEL) {
  if (!siegel || !siegelSchluessel) {
    console.error('Abbruch: der Plan ist nicht unterschrieben.')
    console.error(`  node tools/siegel.mjs signiere --plan ${PLAN_NAME} --passwort "<dein-passwort>"`)
    console.error('  (Ein Bau ohne Siegel geht ausdruecklich mit --ohne-siegel.)')
    process.exit(1)
  }
  // Der Bauer prueft, was er einbaut. Eine Unterschrift, die zu einem AELTEREN
  // Plan gehoert, ist genau der Fall, der spaeter beim Kunden als „VERAENDERT"
  // aufschlaegt — und dann steht die Aussage im Raum, ohne dass jemand etwas
  // veraendert haette.
  const haelt = await pruefeUnterschrift(planRoh, siegel.signatur, siegelSchluessel.jwk)
  if (!haelt) {
    console.error('Abbruch: die vorhandene Unterschrift passt NICHT zum jetzigen Plan.')
    console.error(`  Der Plan wurde nach dem Unterschreiben geaendert (${siegel.signiertAm}).`)
    console.error(`  Neu unterschreiben: node tools/siegel.mjs signiere --plan ${PLAN_NAME} --passwort "..."`)
    process.exit(1)
  }
}

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
let html = `<!DOCTYPE html>
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
  /* \`touch-action:none\` gehoert seit K3 auch auf den UMSCHLAG und nicht mehr
     nur auf das Canvas: im Lese-Zustand nimmt die Zeichenflaeche keine
     Zeiger-Ereignisse mehr an, die Finger landen also hier. Ohne diese Zeile
     zoomte der BROWSER die ganze Seite, statt dass der Grundriss folgt. */
  .ansicht{position:fixed;inset:0;touch-action:none}
  .ansicht.weg{visibility:hidden;opacity:0;pointer-events:none}
  #blatt{background:var(--paper)}
  #blatt canvas{cursor:grab}
  #blatt canvas.zieht{cursor:grabbing}
  /* Der Zeichner ist eine Arbeitsflaeche, kein Blatt — weisser Grund wie im
     Planer, damit Raster und Wandstaerken dieselbe Wirkung haben. */
  #plan{background:#fff}
  #plan canvas{cursor:default}

  /* ── K3: SCHARF ERST MIT „BEARBEITEN" ────────────────────────────────
     GEMESSEN, nicht befuerchtet: ein Klick auf „Grundriss" genuegte, um ein
     Moebel zu ziehen — ohne den Bearbeiten-Schalter je beruehrt zu haben.
     Danach standen 1 gesetztes Stueck und 84 510 Bytes im Speicher, und der
     Blattkopf sagte dauerhaft „1 Stück frei gesetzt — kein Aufmaß". Das
     beschaedigt genau die Zusage, auf der dieses Vorhaben beruht.

     Der Kern hoert Maus, Rad und Finger AM CANVAS ab. Nimmt das Canvas keine
     Zeiger-Ereignisse an, erreicht ihn kein einziges davon — kein Ziehen,
     kein Zeichnen, kein Loeschen, und auch kein Q/E, denn das dreht das
     Stueck UNTER DEM ZEIGER, und das bestimmt eine Zeigerbewegung auf dem
     Canvas. Ansehen und Zoomen bleiben: die Lese-Navigation weiter unten
     haengt am UMSCHLAG und ruft ausschliesslich Ansichts-Funktionen. */
  #plan canvas{pointer-events:none}
  body.bearbeitet #plan canvas{pointer-events:auto}
  body:not(.bearbeitet) #plan{cursor:grab}
  body:not(.bearbeitet) #plan.liest{cursor:grabbing}
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
  /* V7 — DIE LEISTE SPRINGT NICHT.
     Eine Gruppe, deren PLATZ bleibt, waehrend ihr Inhalt geht. \`visibility\`
     nimmt die Sichtbarkeit UND jeden Zeiger, laesst den Raum aber stehen —
     \`display:none\` und \`hidden\` nehmen den Raum mit, und genau daran bewegten
     sich beim Werkzeugwechsel 13 von 24 Knoepfen um bis zu 520 px. Der Trenner
     zur Nachbargruppe geht mit: eine leere Spalte mit senkrechtem Strich saehe
     aus wie ein Fehler. */
  .grp.platzhalter{visibility:hidden}
  .grp.platzhalter + .grp{border-left-color:transparent}
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
  /* ZWEI FASSUNGEN EINES SATZES, damit die Medienabfrage die passende waehlen
     kann. Am breiten Bildschirm steht die lange da — dort ist Platz, und
     „Wände zeichnen" sagt mehr als „Wände". Am Handy die kurze, und nicht aus
     Bequemlichkeit: dort war „Löschen" sonst ausserhalb der Anzeige, und die
     Tastenhinweise („Strg+Z", „Esc") versprachen etwas, das ein Telefon nicht
     hat. Ein Umschalten in JS gaebe es dafuer nicht umsonst — es muesste bei
     jeder Groessenaenderung nachgezogen werden, und wer es einmal vergisst,
     hat zwei Wahrheiten. */
  .kurz{display:none}

  /* Kopfleiste: Umschalter + der unauffaellige Bearbeiten-Schalter. */
  .kopfleiste{position:fixed;top:10px;left:50%;transform:translateX(-50%);
       display:flex;gap:5px;padding:5px;background:var(--panel);
       border:1px solid var(--panel-line);backdrop-filter:blur(9px);
       -webkit-backdrop-filter:blur(9px);z-index:20}
  .kopfleiste button{padding:7px 12px;min-height:38px}
  /* Der Bearbeiten-Schalter war mit 9,5 px und Kontrast 4,1:1 das blasseste
     Element der ganzen Seite — unter WCAG AA (4,5:1) und gemessen das am
     schwersten zu findende. Solange er nur Werkzeuge einblendete, war das
     eine Geschmacksfrage. Seit er ein SCHLOSS traegt, ist es keine mehr: ein
     Schutz, den sein Besitzer nicht findet, ist ein Schutz, den er umgeht.
     \`--ink-dim\` gegen \`--paper\` misst 7,4:1. */
  #btnBearbeiten{font-size:10.5px;color:var(--ink-dim)}
  #btnBearbeiten[aria-pressed="true"]{color:var(--paper)}
  #btnBearbeiten .schloss{opacity:.85;margin-right:3px}

  /* ── Die Siegel-Marke ────────────────────────────────────────────────
     Sie gehoert weder ins Blatt noch in den Grundriss, sondern zu BEIDEN —
     also in die Kopfleiste, die schon beiden gehoert. (Dieselbe Ueberlegung
     wie bei der Loesch-Rueckfrage seit W7: eine Aussage ueber die ganze
     Datei gehoert in keine ihrer Ansichten.)
     Der gute Fall ist RUHIG: kein Signalgruen, kein Kasten, nur ein Haken in
     der Tinte des Blattes. Ein Siegel, das im Normalfall schreit, wird
     ueberlesen, wenn es einmal wirklich schreit. Der schlechte Fall ist es
     nicht: Rot, fett, mit Rahmen. */
  .siegel{display:flex;align-items:center;gap:5px;padding:0 9px 0 10px;
       font-family:var(--mono);font-size:10.5px;letter-spacing:.04em;
       color:var(--ink-dim);border-left:1px solid var(--panel-line);
       white-space:nowrap;cursor:help}
  .siegel .zeichen{font-size:12px;line-height:1}
  .siegel.gebrochen{color:var(--rot);font-weight:700;cursor:pointer;
       border-left-color:var(--rot)}
  .siegel.pruefend{opacity:.55}
  /* Am Handy ist in der Kopfleiste kein Platz fuer den Satz — das ZEICHEN
     bleibt, das Wort geht. Gemessen bei 390 px: mit Wort bricht die Leiste um
     und schiebt den Umschalter aus dem Bild. */
  @media (max-width:560px){ .siegel .wort{display:none} .siegel{padding:0 6px} }

  .standleiste{position:fixed;top:60px;left:50%;transform:translateX(-50%);
       display:flex;align-items:center;gap:8px;padding:5px 6px 5px 12px;
       background:var(--panel);border:1px solid var(--panel-line);
       max-width:calc(100vw - 24px);z-index:19;font-family:var(--mono);
       font-size:10px;letter-spacing:.06em;color:var(--ink-mute);line-height:1.5}
  .standleiste.warnt{border-color:var(--rot);color:var(--rot)}
  .standleiste button{padding:7px 9px;min-height:34px;font-size:9.5px}

  /* ── W7: was „Bearbeiten" in der Axonometrie heisst ───────────────────
     Der Schalter wechselt die Ansicht nicht mehr (s. \`setzeBearbeiten\`). In
     der Axonometrie wird aber NICHT bearbeitet — dort traefe ein Klick keinen
     Punkt, sondern einen Sehstrahl. Werkzeugleiste und Palette liegen im
     Grundriss-Umschlag und sind hier darum gar nicht da; ein toter Knopf kann
     also nicht entstehen. Was fehlte, war die AUSKUNFT darueber. Diese Zeile
     gibt sie, ruhig und im Farbklima des Blattes.

     Sie liegt IM BLATTKOPF und erbt dessen Sichtbarkeit (dieselbe Bauart wie
     die Palette im Grundriss): eine zweite Regel, die man beim Umschalten
     vergessen koennte, gibt es damit nicht. \`position:fixed\` hebt sie am
     breiten Bildschirm aus dem Kopf heraus unter den Umschalter — am Handy
     faellt genau diese Zeile weg, und sie wird zur letzten Kopfzeile. */
  .arbeitshinweis{position:fixed;top:60px;left:50%;transform:translateX(-50%);
       max-width:calc(100vw - 24px);padding:7px 13px;background:var(--panel);
       border:1px solid var(--panel-line);backdrop-filter:blur(9px);
       -webkit-backdrop-filter:blur(9px);z-index:19;font-family:var(--mono);
       font-size:10px;letter-spacing:.06em;color:var(--ink-mute);line-height:1.6;
       text-align:center;pointer-events:none}
  .arbeitshinweis b{color:var(--ink-dim);font-weight:500}
  .arbeitshinweis .warum{display:block;opacity:.82}
  /* Der obere Rand ist eine STAPEL-Bahn: Kopfleiste (10) · Standleiste (60) ·
     Meldung (104). Steht der Arbeitshinweis dort, muessen die beiden darunter
     nachruecken, sonst laegen sie uebereinander — am Standbild gemessen, nicht
     geschaetzt. Rein aus dem CSS: das Blatt ist vorn, wenn der Grundriss \`weg\`
     ist, und \`#standleiste\`/\`#meldung\` folgen \`#plan\` im Dokument. Eine zweite
     Zustandsangabe in JS, die man vergessen koennte, gibt es so nicht. */
  body.bearbeitet #plan.weg ~ .standleiste{top:118px}
  body.bearbeitet #plan.weg ~ .meldung{top:162px}

  .meldung{position:fixed;top:104px;left:50%;transform:translateX(-50%);
       max-width:min(60ch,calc(100vw - 24px));padding:9px 14px;z-index:30;
       background:var(--panel);border:1px solid var(--panel-line);
       font-size:12.5px;line-height:1.45;color:var(--ink)}
  .meldung.warnt{border-color:var(--rot);color:var(--rot)}
  /* Der Knopf IN der Meldung (C3) — sie ist die einzige Zeile, die etwas
     anbieten kann, ohne wie eine Rueckfrage auszusehen. Klein und in derselben
     Zeile: das Angebot gehoert zum Satz und nicht daneben. */
  .meldung button{margin-left:8px;border:1px solid var(--panel-line);min-height:32px;
       padding:6px 10px;background:var(--sage-deep);border-color:var(--sage-deep);color:var(--paper)}
  .meldung button:hover{background:var(--ink-dim);color:var(--paper)}

  /* ── DAS MENUE ZUM ANGETIPPTEN DING (W13) ──────────────────────────────
     Es steht als Einziges AM Objekt und nicht unten mittig — und das ist kein
     Widerspruch zur Regel bei den Rueckfragen, sondern ihre andere Haelfte.
     Eine Rueckfrage verlangt eine Auskunft UEBER ein Objekt, also darf sie es
     nicht verdecken. Dieses Menue GEHOERT zu dem Ding, das der Finger gerade
     beruehrt hat: stuende es unten am Rand, waere die Verbindung zwischen
     Griff und Antwort weg, und bei zwei Raeumen nebeneinander wuesste niemand
     mehr, welchen er angefasst hat. Es wird darum NEBEN den Griffpunkt gesetzt
     (JS haelt es im Bild) und nie darauf.

     z-index 45: ueber der Werkzeugleiste (20) und ueber der Meldung (30), aber
     UNTER der Loesch-Rueckfrage (40 ... 50) — wenn beide dastehen, ist die
     Rueckfrage die dringendere.

     min-height 44px je Eintrag ist keine Zierde: es ist die Flaeche, die eine
     Fingerkuppe zuverlaessig trifft. Bei 390 px Breite ist das der Unterschied
     zwischen bedienbar und nicht bedienbar. */
  .objektmenue{position:fixed;z-index:45;min-width:min(268px,calc(100vw - 20px));
       max-width:min(340px,calc(100vw - 20px));background:rgba(255,255,255,.985);
       border:1px solid var(--panel-line);box-shadow:0 6px 22px rgba(31,35,33,.17);
       display:flex;flex-direction:column}
  .objektmenue .kopf{display:flex;align-items:center;gap:8px;
       padding:9px 8px 9px 12px;border-bottom:1px solid var(--panel-line);
       background:var(--paper-deep)}
  .objektmenue .kopf > span{font-family:var(--mono);font-size:10.5px;
       letter-spacing:.07em;text-transform:uppercase;color:var(--ink);
       flex:1;line-height:1.35}
  .objektmenue .kopf button{min-height:32px;padding:4px 9px;border:1px solid transparent;
       font-size:13px}
  .menuehinweis{padding:8px 12px;font-size:11.5px;line-height:1.45;
       color:var(--ink-dim);border-bottom:1px solid var(--panel-line)}
  /* Die Eintraege sind volle Zeilen und keine Knopf-Reihe: eine Handlung je
     Zeile liest sich in einem Zug, und am Handy ist eine ganze Zeile die
     einzige Trefferflaeche, die man ohne Hinsehen findet. */
  .objektmenue .eintrag{display:block;width:100%;text-align:left;min-height:44px;
       padding:10px 12px;border:0;border-bottom:1px solid var(--panel-line);
       background:transparent;font-family:var(--sans);font-size:13px;
       letter-spacing:0;text-transform:none;color:var(--ink);line-height:1.4}
  .objektmenue .eintrag:last-child{border-bottom:0}
  .objektmenue .eintrag:hover:not(:disabled){background:var(--paper-deep);color:var(--ink)}
  .objektmenue .eintrag.ernst{color:var(--rot)}
  .objektmenue .eintrag.ernst:hover{background:var(--rot);color:#fff}
  /* Ein Eintrag OHNE Handlung ist eine Auskunft, kein toter Knopf — er sieht
     darum auch nicht wie einer aus (kein Zeigefinger, kein Hover). */
  .objektmenue .auskunft{padding:10px 12px;font-size:12.5px;color:var(--ink-dim);
       border-bottom:1px solid var(--panel-line);line-height:1.4}
  .objektmenue .eintrag .zusatz{display:block;margin-top:3px;font-size:11px;
       color:var(--ink-dim);line-height:1.4}
  .objektmenue .eintrag.ernst:hover .zusatz{color:rgba(255,255,255,.85)}

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

  /* ── Das Schloss ─────────────────────────────────────────────────────
     Dieselbe Bauform wie die Rueckfragen, aber im Farbklima des Blattes statt
     in der Warnfarbe — genauso wie beim Stand-Angebot (C1). Rot heisst in
     dieser Oberflaeche „hier verschwindet gleich etwas"; beim Aufschliessen
     ist das Gegenteil der Fall. */
  .schloss-frage{border-color:var(--panel-line)}
  .schloss-frage .txt b{color:var(--ink)}
  .schloss-frage button.ernst{background:var(--sage-deep);border-color:var(--sage-deep)}
  .schloss-frage button.ernst:hover{background:#33564a}
  /* 16 px ist kein Geschmack, sondern die Schwelle, unter der iOS beim
     Hineintippen in ein Feld die ganze Seite heranzoomt — und danach steht der
     Plan schief im Bild, ohne dass jemand ihn angefasst haette. */
  #schlossWort{font-family:var(--mono);font-size:16px;padding:9px 11px;min-height:44px;
       border:1px solid var(--panel-line);background:#fff;color:var(--ink);min-width:min(300px,52vw)}
  #schlossWort:focus{outline:2px solid var(--sage-deep);outline-offset:1px}
  .schloss-frage.falsch #schlossWort{border-color:var(--rot)}
  .schloss-frage.falsch .fuss{color:var(--rot)}

  /* ── Ein ANGEBOT ist keine Rueckfrage (C1) ────────────────────────────
     Dieselbe Bauform, aber im Farbklima des Blattes statt in der Warnfarbe.
     Rot heisst in dieser Oberflaeche „hier verschwindet gleich etwas" — beim
     Fund eines liegen gebliebenen Standes ist genau das Gegenteil der Fall.
     Dieselbe Ueberlegung wie beim Moebel-Rahmen in W2: die Farbe muss die
     Aussage tragen, nicht die Aufmerksamkeit maximieren. */
  .frage.ruhig{border-color:var(--panel-line)}
  .frage.ruhig .txt b{color:var(--ink-dim)}
  .frage.ruhig button.ernst{background:var(--sage-deep);border-color:var(--sage-deep)}
  .frage.ruhig button.ernst:hover{background:var(--ink-dim)}
  /* Die Kenndaten eines Standes: Zeitpunkt, Ordner, Groesse. In der Schreibmaschinen-
     Schrift, weil es MESSWERTE sind und keine Prosa — dieselbe Regel wie bei den
     Massangaben und den Zaehlern im Blattkopf. */
  .frage .wert{font-family:var(--mono);font-size:11px;letter-spacing:.04em;color:var(--ink-dim)}
  .frage .weitere{flex-basis:100%;display:flex;flex-direction:column;gap:4px;
       border-top:1px solid var(--panel-line);padding-top:8px;margin-top:2px}
  .frage .ortZeile{display:flex;align-items:center;gap:8px;font-family:var(--mono);
       font-size:11px;letter-spacing:.04em;color:var(--ink-dim)}
  .frage .ortZeile button{margin-left:auto;min-height:32px;padding:6px 9px;font-size:9.5px}

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
    /* ── W7 am Handy ─────────────────────────────────────────────────────
       GEMESSEN bei 390 x 800, nicht uebertragen: fuer eine SCHWEBENDE Leiste
       ist hier nirgends Platz. Oben laeuft der Blattkopf ab 52 px quer ueber
       die ganze Anzeige (er verliert unten seine Breitenbegrenzung) — die
       Leiste lag mitten im Titel (Kopf 52-137, Leiste 60-172). Unten bricht
       die Blick-Leiste in drei Reihen um und beginnt schon bei 656 px — auch
       dort lag sie drin (707-736). Dazwischen steht die Legenden-Tafel.

       Also KEINE Leiste: die Zeile faellt in den Blattkopf zurueck, wo sie
       ohnehin steht, und reiht sich neben die anderen Saetze, die dieses
       Blatt ueber seinen Zustand sagt („N Stueck frei gesetzt"). Dieselbe
       Schriftmetrik wie die, nur nicht in der Warnfarbe — sie warnt nicht,
       sie erklaert.

       Die Begruendung faellt weg: auf 390 px braeche der Sehstrahl-Satz in
       drei Zeilen um und naehme ein Zehntel der Anzeige fuer etwas, das man
       einmal liest. */
    .arbeitshinweis{position:static;transform:none;max-width:none;padding:0;
         margin-top:5px;background:none;border:0;backdrop-filter:none;
         -webkit-backdrop-filter:none;text-align:left;font-size:10.5px;
         letter-spacing:.13em;text-transform:uppercase;line-height:1.7;
         color:var(--sage-deep)}
    .arbeitshinweis b{color:var(--sage-deep);font-weight:600}
    .arbeitshinweis .warum{display:none}
    /* Damit auch die Stapel-Bahn oben: was nicht mehr dort steht, darf die
       beiden darunter nicht mehr verschieben. */
    body.bearbeitet #plan.weg ~ .standleiste{top:60px}
    body.bearbeitet #plan.weg ~ .meldung{top:104px}
    .kopf{padding:10px 14px;max-width:none}
    .kopf .sub{font-size:9px;letter-spacing:.11em;line-height:1.6}
    .strich{margin:7px 0 6px;max-width:180px}
    /* GANZE BREITE, nicht nur hoechstens. GEMESSEN: mit \`max-width\` allein
       richtete sich die Leiste nach ihrer breitesten Gruppe (255 px) — und die
       Werkzeug-Gruppe, die mit \`flex-basis:100%\` genau diese 255 px erbt,
       brach dadurch trotz kurzer Aufschriften um. Eine Leiste, die schmaler
       ist als die Anzeige, verschenkt am Handy Hoehe, und Hoehe ist hier das
       Knappe. */
    .leiste{bottom:10px;padding:5px;gap:4px;width:calc(100vw - 16px);max-width:none}
    /* ── DIE WERKZEUGE MUESSEN ERREICHBAR SEIN (Handy-Welle) ───────────────
       GEMESSEN am Standbild bei 390 x 800, nicht vermutet: \`.leiste\` bricht
       zwar um, ihre GRUPPEN aber nicht — und die Werkzeug-Gruppe ist mit ihren
       vier Knoepfen rund 440 px breit. Bei 366 px verfuegbarer Breite lag
       „Löschen" damit VOLLSTAENDIG ausserhalb der Anzeige: das Loeschen-
       Werkzeug war am Handy nicht erreichbar, und mit ihm der einzige Weg,
       am Telefon etwas zu entfernen (Langdruck, E3).

       Zwei Massnahmen, in dieser Reihenfolge:

       1. KUERZERE AUFSCHRIFTEN (s. \`.lang\`/\`.kurz\` in der Leiste). „Wände
          zeichnen" -> „Wände", „Türen & Fenster" -> „Türen". Die volle Aussage
          bleibt im \`title\`. Das spart Breite, ohne die Leiste hoeher zu machen
          — und Hoehe ist am Telefon das Knappe: die Leiste nimmt schon so ein
          Fuenftel der Anzeige.
       2. Und wenn es trotzdem nicht reicht, DARF diese eine Gruppe umbrechen.
          \`flex-basis:100%\` ist dabei Bedingung und nicht Zierde: ohne sie
          schrumpft der Flex-Umbruch jede Gruppe auf ihren breitesten Knopf
          zusammen, und die Leiste wird zu einer Saeule, die zwei Drittel der
          Zeichenflaeche verdeckt. AM STANDBILD GEMESSEN — genau das ist beim
          ersten Versuch passiert.

       Ausdruecklich NUR diese beiden Gruppen: \`.grp\` global umbrechen zu
       lassen zerlegte auch die Kopfleiste („Axonometrie" rutschte unter
       „Grundriss"). */
    #grpWerkzeug,#oeffnungsArten{flex-basis:100%;flex-wrap:wrap;justify-content:center}
    /* Die Beschriftung der Gruppe kostet 58 px fuer eine Auskunft, die die
       gedrueckte Schaltflaeche selbst gibt. */
    #grpWerkzeug > .lbl,#oeffnungsArten > .lbl{display:none}
    .leiste .lang,.frage .lang,.palette-fuss .lang{display:none}
    .kurz{display:inline}
    button{padding:8px 9px;font-size:10px}
    .lbl{padding:0 4px 0 2px;font-size:9px}
    /* ── Die Palette AM HANDY (Handy-Welle) ──────────────────────────────
       Bis hierher stand hier \`display:none\` mit der Begruendung, das
       Hineinziehen laufe ueber Maus-Ereignisse und ein Finger loese sie erst
       beim Loslassen aus. Der Grund ist weg (die Palette hoert jetzt selbst
       auf \`touchstart/move/end\`), die Platzfrage aber nicht — und die
       entscheidet sich am Standbild, nicht am Wunsch.

       GEMESSEN bei 390 x 800: die Leisten belegen oben 52 px (Blattkopf) und
       unten ab 626 px (Werkzeugleiste, drei Reihen) — dazwischen liegen rund
       570 px freie Hoehe. In der Breite ist es eng: 134 px waeren gut ein
       Drittel der Anzeige. Also SCHMALER und HOEHER statt breit — eine Spalte
       am linken Rand, wie am grossen Bildschirm, nur auf das Noetigste
       eingezogen. Die Vorschau bleibt, sie ist der Sinn der Palette; der
       Massstab darunter faellt weg, weil er im Titel des Knopfes steht und am
       Handy nur Zeile kostet.

       Die Knopfhoehe bleibt ueber 44 px (Vorschau 88 x 34 plus Name) — unter
       einer Fingerkuppe waere eine kleinere Flaeche ein Glueckstreffer. */
    .palette{left:8px;top:96px;width:102px;max-height:calc(100vh - 300px)}
    .palette-kopf{padding:8px 8px 6px;font-size:9px;letter-spacing:.11em}
    .palette-leib{padding:3px 3px 4px}
    .pstueck{padding:4px 2px;font-size:10.5px}
    .pstueck canvas{width:88px;height:34px}
    /* Der Massstab steht im Titel des Knopfes und in der Vorschau — am Handy
       waere er eine dritte Zeile fuer eine Auskunft, die schon zweimal da ist. */
    .pstueck .pmass{display:none}
    .palette-fuss{padding:6px 8px 8px;font-size:9.5px;line-height:1.4}
  }
  @media (prefers-reduced-motion:reduce){*{transition-duration:.01ms!important}}

  /* ── DAS PAPIER (M5) ─────────────────────────────────────────────────
     Bisher gab es KEINE einzige Druckregel; der Ausdruck war ein
     Bildschirmfoto. Auf A4 gemessen: die Bedienknoepfe landeten mit auf dem
     Blatt, „Aktivierung" und „Balance" wurden von der Knopfleiste
     abgeschnitten, und die Herkunfts-Fussnote fehlte ganz — sie faellt unter
     900 px weg, und ein A4-Blatt ist bei 96 dpi rund 794 px breit. Die Bank
     druckt; das ist keine Vermutung, das ist ihr Beruf.

     QUER, weil der Riegel 78 m lang und 15 m tief ist: hochkant blieben zwei
     Drittel des Blattes leer. */
  .nurDruck{display:none}
  .siegelDruck.warnt{color:var(--rot);font-weight:700}
  @media print{
    @page{size:A4 landscape;margin:10mm}
    /* Der warme Papierton bleibt — er ist die Bildidee, nicht Zierat. Wer ihn
       nicht mitdrucken will, schaltet in seinem Druckdialog die
       Hintergrundgrafiken ab; das ist seine Entscheidung, nicht unsere. */
    html,body{background:#fff;overflow:visible}
    /* Bedienelemente gehoeren nicht aufs Papier. Ein gedruckter Knopf ist eine
       Aufforderung, die das Blatt nicht einloesen kann. */
    .kopfleiste,.leiste,.palette,.standleiste,.meldung,.frage,.geist,
    .arbeitshinweis,#hinweisBedienung{display:none!important}
    /* Die Saeulen-Tafel ist ein Bildschirm-Aufsteller mit eigenem Schalter und
       Weichzeichner: auf Papier verdeckte sie ein Viertel des Grundrisses, und
       der Weichzeichner druckt ohnehin nicht. Ihr Inhalt steht als Beschriftung
       im Bild. */
    .tafel{display:none!important}
    /* Das Blatt steht STILL: keine Uebergaenge, keine Weichzeichner, kein
       Halbdurchsichtiges — beides druckt unzuverlaessig und kostet nur Farbe. */
    *{transition:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
    .ansicht.weg{display:none!important}
    /* Und JETZT der eigentliche Fund: die Fussnote ueber die Herkunft. Sie ist
       das einzige, was ein frei gesetztes Blatt von einem Aufmass
       unterscheidet — sie darf auf dem Papier NIE fehlen. */
    .hinweis{display:block!important;position:fixed;left:0;right:0;bottom:0;
         max-width:none;padding:0 6mm;opacity:1;color:#1E2A25;
         font-size:8.5pt;letter-spacing:.06em;line-height:1.5}
    /* Der Blattkopf muss ENGER stehen als am Bildschirm. Auf A4 quer beginnt
       die oberste Reihe der Raumnamen bei rund 133 px (der Zeichner rechnet
       seinen oberen Rand aus der Silhouette, nicht aus diesem Kopf) — mit der
       Bildschirm-Zeilenhoehe schob sich „3 Stück frei gesetzt" in „Empfang"
       hinein. Am Ausdruck gemessen, nicht geschaetzt. */
    .kopf{position:fixed;top:0;left:0;padding:3mm 6mm;max-width:none}
    .kopf h1{font-size:15pt;margin:0 0 2px}
    .kopf .strich{margin:5px 0 4px}
    .kopf .sub,.kopf .gesetzt{font-size:7pt;line-height:1.45;margin-top:0}
    .kopf .gesetzt{color:#A33A2A}
    .nurDruck{display:block}
  }
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
    <!-- Nur auf dem Papier (M5): Datum und die Maßstabs-Aussage. Auf dem
         Bildschirm wäre beides Rauschen — dort sieht man ja, dass man dreht.
         Auf einem Ausdruck ohne Datum weiss in drei Wochen niemand mehr, ob
         er den aktuellen Stand in der Hand hält. -->
    <div class="sub nurDruck" id="druckZeile"></div>
    <!-- Das Siegel auf dem PAPIER. Es steht bewusst als Satz da und nicht als
         Haken: einen Haken kann jeder hinmalen, einen Namen mit Datum prüft
         man nach. -->
    <div class="sub nurDruck siegelDruck" id="siegelDruck"></div>
    <div class="gesetzt" id="gesetztZaehler" hidden></div>
    <!-- M2: was der Nutzer an den WÄNDEN verändert hat. Bis hierher sagte das
         Blatt „Der Grundriss ist gemessen", auch nachdem eine gemessene Wand
         gelöscht war (100 → 99, Räume 25 → 24). -->
    <div class="gesetzt" id="grundrissZaehler" hidden></div>
    <!-- Die Öffnungs-Zeile (W4). Sie steht NUR da, wenn es Öffnungen gibt:
         eine dauerhafte „0 Öffnungen"-Zeile lehrte den Leser, über sie
         hinwegzusehen — genau dann, wenn sie einmal wichtig wird.
         KURZ gehalten, GEMESSEN am Standbild: der Blattkopf steht über der
         Reihe der Raumnamen, und schon vier Zeilen schoben sich in „Toiletten"
         und „Teamtable" hinein. Der Massstabs-Vorbehalt gehört ohnehin nach
         unten, zu dem Satz über die Höhen — siehe „hinweisOeffnung". -->
    <div class="gesetzt" id="oeffnungZaehler" hidden></div>

    <!-- W7: „Bearbeiten" lässt die Ansicht stehen, und im Blatt geht seither
         etwas. Diese Zeile sagt WAS — und was nicht.

         Ihr erster Wortlaut („gezeichnet wird im Grundriss") stimmte genau so
         lange, wie hier gar nichts ging. Ein Hinweis, der eine Bedienung
         verschweigt, die es gibt, ist schlimmer als keiner: er lehrt den Nutzer,
         es nicht zu versuchen. Möbel ziehen, drehen und löschen geht hier;
         Wände, Türen und Fenster nicht — ein Punkt in leerer Luft hat keine
         bekannte Höhe, ein Möbel hat eine.

         Sie steht IM Blattkopf, und das ist kein Zufall: am breiten Bildschirm
         hebt \`position:fixed\` sie als eigene Leiste unter den Umschalter (dort
         ist Platz und dort wurde eben geklickt), am Handy fällt genau diese
         Angabe weg und sie wird zur letzten Zeile des Kopfes — neben den
         anderen Sätzen, die dieses Blatt über seinen eigenen Zustand sagt.
         AM STANDBILD GEMESSEN: als schwebende Leiste lag sie bei 390 px quer
         über dem Titel. -->
    <div class="arbeitshinweis" id="arbeitshinweis" role="status" hidden>
      <b>Bearbeiten ist an</b> <span id="arbeitshinweisWas">— Möbel ziehen, Q und E drehen, Entf löscht.</span>
      <span class="warum" id="arbeitshinweisWarum">Wände, Türen und Fenster gehören in den Grundriss.</span>
    </div>
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
    <!-- Bedienhinweise gehören auf den Bildschirm, nicht aufs Papier (M5).
         Deshalb ein eigener Anker: die Fussnote darunter MUSS gedruckt
         werden, diese Zeile darf es nicht. -->
    <span id="hinweisBedienung">Ziehen dreht &middot; Rad zoomt &middot; zwei Finger zoomen<br></span>
    <span id="hinweisHerkunft">Grundriss und Ausstattung sind gemessen.</span> Höhen sind
    gesetzte Annahmen — ein Grundriss enthält keine.
    <!-- Der Massstabs-Vorbehalt der Öffnungen (W4) steht HIER und nicht im
         Blattkopf: er gehört zu dem Satz über die Höhen, der schon da ist —
         und oben schöbe er sich in die Raumnamen (am Standbild gemessen). -->
    <span id="hinweisOeffnung"></span>
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
    <!-- Zwei Saetze, damit der zweite am Handy wegfallen kann: dort kostete er
         gemessen 100 px Hoehe (sechs Zeilen bei 102 px Breite) fuer eine
         Auskunft, die im Augenblick des Ablegens ohnehin als Meldung erscheint
         („… hingestellt — frei gesetzt, kein Aufmaß"). Die ANWEISUNG bleibt:
         ohne sie waere die Palette am Telefon ein Raetsel. -->
    <div class="palette-fuss">In den Grundriss ziehen.<span class="lang"> Was so
      entsteht, ist <b>frei gesetzt</b> und wird gestrichelt gezeichnet — kein
      Aufmaß.</span></div>
  </aside>

  <div class="leiste" id="werkzeuge" role="toolbar" aria-label="Grundriss bearbeiten" hidden>
    <!-- Die kurzen Aufschriften sind KEINE Abkürzung aus Bequemlichkeit: bei
         390 px lag „Löschen" sonst ausserhalb der Anzeige (s. CSS, „Die
         Werkzeuge müssen erreichbar sein"). Die volle Aussage steht im
         \`title\` und geht damit nicht verloren. -->
    <div class="grp" id="grpWerkzeug">
      <span class="lbl">Werkzeug</span>
      <button type="button" id="wzMove" title="Verschieben — Möbel ziehen. Wände und Ecken bleiben hier unberührt; dafür gibt es „Wände verschieben“. Am Rechner drehen Q und E das Möbel unter dem Zeiger um 15°; am Handy zieht ein Finger das Möbel, zwei Finger zoomen." aria-pressed="true"><span class="lang">Möbel verschieben</span><span class="kurz">Möbel</span></button>
      <button type="button" id="wzWand" title="Wände verschieben — Ecken und Wände ziehen. Ein eigenes Werkzeug, weil eine verschobene Wand das Aufmaß aufgibt: das soll man wollen müssen." aria-pressed="false"><span class="lang">Wände verschieben</span><span class="kurz">Wände</span></button>
      <button type="button" id="wzDraw" title="Wände zeichnen — Punkt für Punkt" aria-pressed="false"><span class="lang">Wände zeichnen</span><span class="kurz">Zeichnen</span></button>
      <button type="button" id="wzOeffnung" title="Türen &amp; Fenster — auf eine Wand zeigen, klicken setzt. Q wendet den Anschlag, E die Aufschlagseite." aria-pressed="false"><span class="lang">Türen &amp; Fenster</span><span class="kurz">Türen</span></button>
      <button type="button" id="wzDelete" title="Löschen — mit Rückfrage" aria-pressed="false">Löschen</button>
    </div>
    <!-- Die Arten der Öffnung. Sie sind NUR mit ihrem Werkzeug BEDIENBAR, ihr
         Platz bleibt aber DAUERHAFT reserviert (V7).

         Bis W10 stand hier \`hidden\`, und die Zeile wurde beim Werkzeugwechsel
         eingeschoben. Gemessen: dabei bewegten sich 13 von 24 Knöpfen, bis zu
         520 px — der alte Platz von „Laden" lag danach unter „Zurücksetzen",
         dem gefährlichsten Knopf der Datei. Eine Leiste, die unter der Hand
         wegläuft, macht aus einem gelernten Griff einen Fehlgriff.

         \`visibility:hidden\` statt \`display:none\`: der Platz bleibt belegt,
         die Knöpfe sind weder sichtbar noch anklickbar noch mit Tab
         erreichbar. \`aria-hidden\` und \`inert\` sagen dasselbe noch einmal für
         Vorlesegeräte — eine unsichtbare Schaltfläche, die eine Ansage macht,
         wäre schlimmer als gar keine. -->
    <div class="grp platzhalter" id="oeffnungsArten" aria-hidden="true" inert>
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

  <!-- C3: die Rückfrage nennt den UMFANG in Zahlen. „Alle eigenen Änderungen
       verwerfen" allein ist wahr und nutzlos — wer nicht weiss, wie viel er
       verliert, kann nicht entscheiden. Die Zahlen kommen aus denselben
       Zählern wie der Blattkopf (\`verlustBeimZuruecksetzen\`). -->
  <div class="frage" id="zurueckFrage" role="alertdialog" aria-live="assertive" aria-label="Zurücksetzen bestätigen" hidden>
    <span class="txt"><b>Zurücksetzen:</b> den gemessenen Plan zeigen? <span id="zurueckFrageUmfang" class="wert"></span></span>
    <span class="knoepfe">
      <button type="button" id="btnZurueckNein">Abbrechen</button>
      <button type="button" id="btnZurueckJa" class="ernst">Zurücksetzen</button>
    </span>
    <span class="fuss">Rückgängig ist danach abgeschaltet. Der Stand wird vorher gesichert und lässt sich einmal zurückholen; „Sichern“ legt ihn zusätzlich als Datei ab.</span>
  </div>
</div>

<!-- DAS SCHLOSS vor der Werkstatt.

     Sie liegt AUSSERHALB beider Ansichten — dieselbe Überlegung wie bei der
     Lösch-Rückfrage seit W7: was zu beiden gehört, gehört in keine von beiden.
     Der Bearbeiten-Schalter steht in der Kopfleiste und ist in Blatt wie
     Grundriss erreichbar; läge die Frage im Grundriss-Umschlag, fragte im
     Blatt etwas Unsichtbares.

     \`role="dialog"\`, NICHT \`alertdialog\`: die einzigen \`alertdialog\` dieser
     Datei sind Rückfragen vor zerstörenden Handlungen (W13). Aufschließen
     zerstört nichts. Wer eine Passwort-Frage ins selbe Gewand steckt, lehrt
     den Nutzer, genau die Kästen wegzuklicken, die später eine Wand retten. -->
<div class="frage schloss-frage" id="schlossFrage" role="dialog" aria-modal="true" aria-labelledby="schlossTitel" hidden>
  <span class="txt"><b id="schlossTitel">Bearbeiten ist verschlossen.</b> Das Passwort schaltet die Werkzeuge frei — ohne es bleibt diese Datei eine Ansicht.</span>
  <!-- \`type="password"\`, \`autocomplete\` und \`inputmode\` sind kein Beiwerk: ohne
       sie bietet das Telefon keine gespeicherten Passwörter an und schaltet auf
       die Buchstaben-Tastatur mit Autokorrektur — die aus jedem Wort ein
       anderes macht. \`autocapitalize=off\` aus demselben Grund. -->
  <input type="password" id="schlossWort" autocomplete="current-password" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Passwort" aria-labelledby="schlossTitel">
  <span class="knoepfe">
    <button type="button" id="btnSchlossNein">Abbrechen</button>
    <button type="button" id="btnSchlossJa" class="ernst">Aufschließen</button>
  </span>
  <span class="fuss" id="schlossFuss">Beim Schließen der Datei fällt das Schloss wieder zu.</span>
</div>

<!-- Lösch-Rückfrage (E1): Abbrechen zuerst, die gefährliche Wahl darf nicht die
     bequemste sein.

     SIE LIEGT SEIT W7 AUSSERHALB BEIDER ANSICHTEN. Bis dahin stand sie im
     Grundriss-Umschlag und erbte dessen Sichtbarkeit — richtig, solange nur
     dort gelöscht wurde. Seit „Entf" auch im Blatt ein Möbel entfernt, fragte
     dort etwas Unsichtbares: der Kandidat wäre gesetzt, die Frage nicht zu
     sehen, und der nächste Tastendruck hätte in einen Zustand geführt, den
     niemand angeboten hat. Derselbe Fallstrick wie bei \`btnStandZurueck\`, nur
     umgekehrt gelöst: eine Frage, die zu BEIDEN Ansichten gehört, gehört in
     keine von beiden. -->
<!-- ANFASSEN STATT WERKZEUGKUNDE (W13) — das Menü zum angetippten Ding.

     Es liegt AUSSERHALB des Grundriss-Umschlags, aus demselben Grund wie die
     Lösch-Rückfrage seit W7: es gehört zu einer Handlung, nicht zu einer
     Ansicht. Und es steht ÜBER der Werkzeugleiste (z-index), weil es beim
     Antippen unten am Rand sonst genau von ihr verdeckt würde — am Handy ist
     das die halbe untere Bildhälfte.

     \`role="menu"\` bewusst NICHT: das verlangt eine Pfeiltasten-Bedienung mit
     Rollen-Kindern, und was hier steht, sind gewöhnliche Schaltflächen, die
     Tab und Screenreader ohnehin richtig behandeln. Eine halb umgesetzte
     Menü-Rolle ist schlechter als gar keine — sie verspricht eine Bedienung,
     die es nicht gibt (dieselbe Lehre wie bei den Tasten-Hinweisen, W8). -->
<div class="objektmenue" id="objektMenue" role="dialog" aria-label="Was möchten Sie hier tun?" hidden>
  <div class="kopf"><span id="objektMenueTitel"></span><button type="button" id="objektMenueZu" aria-label="Menü schliessen">✕</button></div>
  <div id="objektMenueHinweis" class="menuehinweis" hidden></div>
  <div id="objektMenueListe"></div>
</div>

<div class="frage" id="rueckfrage" role="alertdialog" aria-live="assertive" aria-label="Löschen bestätigen" hidden>
  <span class="txt"><b>Entfernen:</b> <span id="rueckfrageZiel"></span>?</span>
  <span class="knoepfe">
    <button type="button" id="btnAbbrechen">Abbrechen</button>
    <button type="button" id="btnEntfernen" class="ernst">Entfernen</button>
  </span>
  <!-- Am Handy gibt es weder Strg+Z noch Esc. Beide Wege stehen dort aber als
       Schaltfläche bereit („Abbrechen" hier, „Rückgängig" in der Leiste) — der
       kurze Satz sagt darum die Zusage und nicht den Tastendruck. -->
  <span class="fuss"><span class="lang">Rückgängig mit Strg+Z &middot; Abbrechen mit Esc</span><span class="kurz">Rückgängig geht auch danach noch.</span></span>
</div>

<div class="kopfleiste" role="toolbar" aria-label="Ansicht wählen">
  <div class="grp">
    <button type="button" id="btnAnsichtPlan" aria-pressed="false">Grundriss</button>
    <button type="button" id="btnAnsichtAxo" aria-pressed="true">Axonometrie</button>
  </div>
  <!-- Eigene Kennung, damit die reine Ansicht die ganze Gruppe schneiden kann
       und nicht einen leeren Rahmen stehen laesst. -->
  <div class="grp" id="grpBearbeiten">
    <button type="button" id="btnBearbeiten" aria-pressed="false" title="Werkzeuge zum Bearbeiten einblenden — verlangt das Passwort"><span class="schloss" aria-hidden="true">&#128274;</span>Bearbeiten</button>
  </div>
  <!-- Das Siegel. Es steht hier und nicht im Blattkopf, weil es eine Aussage
       ueber die GANZE Datei ist und nicht ueber eine ihrer beiden Ansichten.
       \`aria-live="polite"\`: die Pruefung braucht einen Augenblick, und wenn sie
       fertig ist, soll ein Screenreader es beilaeufig sagen — nicht den Nutzer
       aus dem unterbrechen, was er gerade liest. -->
  <div class="siegel pruefend" id="siegelMarke" role="status" aria-live="polite" title="Wird geprüft…">
    <span class="zeichen" id="siegelZeichen" aria-hidden="true">&hellip;</span><span class="wort" id="siegelWort">wird geprüft</span>
  </div>
</div>

<div class="standleiste" id="standleiste" hidden>
  <span id="standText"></span>
  <button type="button" id="btnStandZurueck">Auf den gemessenen Plan zurücksetzen</button>
  <!-- K4: zwei Fenster derselben Datei. Die Wahl gehört dem Nutzer — welcher
       der beiden Stände gilt, kann diese Datei nicht wissen. -->
  <span id="standFremd" hidden>
    <button type="button" id="btnFremdLaden">Den anderen Stand holen</button>
    <button type="button" id="btnFremdUebergehen">Meinen Stand behalten</button>
  </span>
</div>

<!-- M8/C1: es liegt Arbeit im Browser, die nicht zu DIESER Datei gehört —
     anderer Ablageort oder andere Bau-Fassung. Der Speicherschlüssel trägt
     beides (nötig, damit zwei Kopien sich nicht ins Gehege kommen), und wer
     die Datei verschiebt oder neu baut, sieht seine Arbeit sonst nicht mehr.
     Gemessen: vier gesetzte Stücke wurden null, ohne einen Hinweis.

     RUHIG, nicht dringlich: \`role="status"\` und \`aria-live="polite"\` statt
     \`alertdialog\`/\`assertive\`, und der Rahmen im Panel-Ton statt in Rot. Hier
     ist nichts kaputt und nichts zu bestätigen — es liegt etwas bereit. Ein
     Alarm für ein Angebot wäre dieselbe Übertreibung wie ein roter Rahmen um
     ein Möbel, das man nur greifen könnte (W2). -->
<div class="frage ruhig" id="ortFrage" role="status" aria-live="polite" aria-label="Gespeicherte Stände" hidden>
  <span class="txt"><b>Gespeicherte Arbeit:</b> <span id="ortFrageText"></span><span id="ortFrageErster" class="wert"></span></span>
  <span class="knoepfe">
    <button type="button" id="btnOrtNein">Nein danke</button>
    <button type="button" id="btnOrtJa" class="ernst">Stand holen</button>
  </span>
  <span class="weitere" id="ortFrageWeitere" hidden></span>
  <span class="fuss">Der Stand bleibt liegen, wo er ist — hier entsteht eine Kopie.</span>
</div>

<!-- Lade-Rückfrage (K1). Sie fehlte, und das war der schwerste Fund des
     Gegners: „Laden" warf den Stand sofort und unumkehrbar weg (gemessen
     292 Stück / 100 Wände → 0 / 4, Historie leer, Speicher überschrieben) —
     während das viel harmlosere „Zurücksetzen" seit jeher fragt. Gleiche
     Gefahr, gleiche Rückfrage: Abbrechen zuerst, die gefährliche Wahl darf
     nicht die bequemste sein. -->
<div class="frage" id="ladeFrage" role="alertdialog" aria-live="assertive" aria-label="Laden bestätigen" hidden>
  <span class="txt"><b>Laden:</b> <span id="ladeFrageText"></span></span>
  <span class="knoepfe">
    <button type="button" id="btnLadeNein">Abbrechen</button>
    <button type="button" id="btnLadeJa" class="ernst">Stand ersetzen</button>
  </span>
  <span class="fuss">Das ersetzt deinen jetzigen Stand und lässt sich nicht rückgängig machen. Vorher „Sichern“ legt ihn als Datei ab.</span>
</div>


<!-- Hier stand bis W10 \`#standFrage\` — „dieser Stand passt nicht zum eingebauten
     Plan, laden oder verwerfen?". Sie ist ersatzlos weg, weil sie nicht
     auslösen KONNTE: der Speicherschlüssel trägt den Plan-Abdruck, also hat
     alles, was unter ihm liegt, denselben. Ihre eigentliche Aufgabe — einen
     Stand aus einer anderen Bau-Fassung anbieten — erledigt \`#ortFrage\`, das
     jetzt über ALLE Abdrücke sucht. -->

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
/* Der Plan steht als TEXT da und wird daraus gelesen — nicht als Objektliteral.
   Der Grund ist das Siegel: unterschrieben ist der Roh-Text der Plan-Datei,
   Zeichen fuer Zeichen. Stuende hier ein Objekt, muesste die Pruefung es vor
   dem Vergleich in eine kanonische Form zurueckbringen, und jede Abweichung
   zwischen den beiden Kanonisierungen waere ein stiller Fehlalarm. So gibt es
   nichts zu kanonisieren: geprueft wird genau das, was dasteht. Und wer den
   Plan aendern will, muss DIESE Zeile anfassen — womit die Unterschrift bricht. */
const PLAN_TEXT = ${JSON.stringify(planRoh)};
const PLAN = JSON.parse(PLAN_TEXT);

/* Die Unterschrift und der oeffentliche Schluessel, mit dem man sie nachprueft.
   Aus einem oeffentlichen Schluessel laesst sich keine gueltige Unterschrift
   herstellen — er darf darum offen in der Datei stehen. */
const SIEGEL = ${JSON.stringify(siegel ? { inhaber: siegel.inhaber, signiertAm: siegel.signiertAm, verfahren: siegel.verfahren, signatur: siegel.signatur } : null)};
const SIEGEL_SCHLUESSEL = ${JSON.stringify(siegelSchluessel ? siegelSchluessel.jwk : null)};

/* Das Schloss vor der Werkstatt: ein Paket, dessen Klartext bekannt ist und das
   sich nur mit dem richtigen Passwort oeffnen laesst. Hier steht KEIN Passwort
   und auch kein Abdruck davon — AES-GCM ist beglaubigend, ein falsches
   Passwort scheitert beim Entschluesseln selbst. Es gibt darum keinen
   Vergleich, den man ueberspringen koennte. In der reinen Ansichts-Fassung ist
   das Feld \`null\`, weil es dort nichts aufzuschliessen gibt. */
const SCHLOSS = ${JSON.stringify(NUR_ANSICHT ? null : (schloss ? { salz: schloss.salz, iv: schloss.iv, inhalt: schloss.inhalt, runden: schloss.runden || 600000 } : null))};
const SCHLOSS_HASH = ${JSON.stringify(PBKDF2_HASH)};

/* W11-NACHTRAG (Gegner-Fund M1): Die reine Ansicht muss WISSEN, dass sie eine
   ist. Vorher war sie nur daran zu erkennen, dass \`SCHLOSS\` fehlt — und aus
   „kein Schloss" folgte „nichts aufzuschliessen", also \`werkstattOffen = true\`.
   Gemessen: ein liegengebliebenes \`bearbeiten:1\` im Speicher machte daraus beim
   naechsten Oeffnen eine scharfe Zeichenflaeche. Die Ansicht hat keine
   Werkstatt — sie darf keine bekommen, auch nicht durch einen alten Wert. */
const NUR_ANSICHT = ${JSON.stringify(NUR_ANSICHT)};

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
const ORT_KLARTEXT = decodeURIComponent(location.pathname);
const ORT_ABDRUCK = kurzHash(ORT_KLARTEXT.toLowerCase());
/* Der gemeinsame Anfang ALLER Stand-Schluessel dieser Datei — ohne Plan-Abdruck
   und ohne Ablageort. Er ist seit W10 die Suchbasis beim Start (s.
   \`alleStaende\`) und darum eine eigene Angabe: er stand vorher zweimal
   ausgeschrieben da, einmal mit Abdruck (Suche) und einmal ohne (Aufraeumen) —
   und genau diese eine Stelle zu viel war die Ursache dafuer, dass ein Stand
   aus einer anderen Bau-Fassung beim Start nicht gefunden wurde. */
const STAND_PRAEFIX = 'halle400-planer-datei:plan:';
const SCHLUESSEL = STAND_PRAEFIX + PLAN_ABDRUCK + ':' + ORT_ABDRUCK;
const SCHLUESSEL_BEARBEITEN = 'halle400-planer-datei:bearbeiten:' + ORT_ABDRUCK;
/* W7 — EIGENER Schluessel fuer die zuletzt angesehene Ansicht. Bis hierher
   brauchte es ihn nicht: der Bearbeiten-Schalter WAR die Ansichtswahl (an =
   Grundriss, aus = Blatt), ein Wert trug also beides. Seit er die Ansicht
   stehen laesst, sind es zwei unabhaengige Angaben — und zwei unabhaengige
   Angaben brauchen zwei Schluessel. Sie zusammen in einen zu legen hiesse, die
   gerade abgeschaffte Kopplung durch die Hintertuer wieder einzufuehren.
   „Zuruecksetzen" loescht beide (M7). Der Praefix bleibt derselbe, damit das
   Aufraeumen weiter EINE Regel ist: alles, was so beginnt, gehoert dieser
   Datei. */
const SCHLUESSEL_ANSICHT = 'halle400-planer-datei:ansicht:' + ORT_ABDRUCK;
/* C3 — die Sicherung VOR einem „Zurücksetzen". Eigener Praefix (\`sicherung:\`
   statt \`plan:\`), damit die Startsuche ueber alle Staende sie nicht als
   fremden Ablageort anbietet: sie gehoert DIESER Datei und wird an genau einer
   Stelle angeboten, naemlich in der Meldung direkt nach dem Zuruecksetzen.
   Genau EINE, immer die letzte — der Platz unter \`file://\` ist knapp. */
const SCHLUESSEL_SICHERUNG = 'halle400-planer-datei:sicherung:' + ORT_ABDRUCK;

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
/* ── el() und die reine Ansicht ─────────────────────────────────────
   In der VOLLEN Fassung ist \`ENTFERNT\` leer und \`el\` genau das, was dasteht.

   In der reinen Ansicht (Bank) sind die Bedienelemente der Werkstatt aus dem
   Dokument GESCHNITTEN — kein \`hidden\`, kein \`display:none\`, sondern nicht
   vorhanden. Das Skript, das sie verdrahten wuerde, laeuft trotzdem: es an 91
   Stellen zu verzweigen hiesse, 91 neue Fehlerquellen einzubauen, und zwar in
   genau dem Code, den 688 gruene Pruefungen heute abdecken.

   Statt dessen bekommt es fuer JEDE dieser Kennungen — und nur fuer sie — ein
   loses Ersatz-Element: es nimmt Zuhoerer an, es nimmt Werte an, und es haengt
   in keinem Dokument. Nichts davon ist zu sehen, zu klicken oder zu finden.

   FAIL-CLOSED bleibt es trotzdem: eine Kennung, die NICHT auf der Schnittliste
   steht und fehlt, ist ein echter Fehler und bricht laut — sonst waere aus
   dieser Bequemlichkeit die stille Fehlertoleranz geworden, die dieses Projekt
   an anderer Stelle teuer bezahlt hat. Die Liste entsteht zur Bauzeit aus dem
   Vergleich der Kennungen vor und nach dem Schnitt, nicht von Hand: was neu in
   die Werkstatt kommt, steht automatisch darauf. */
const ENTFERNT = /*ENTFERNT-LISTE*/[];
const ersatzTeile = new Map();
const el = function(id){
  const e = document.getElementById(id);
  if (e) return e;
  if (ENTFERNT.indexOf(id) < 0) throw new Error('Element fehlt: ' + id);
  if (!ersatzTeile.has(id)) {
    // Ein \`input\` und kein \`div\`: unter den geschnittenen Kennungen ist ein
    // Eingabefeld, und der Code daran ruft \`.select()\` und liest \`.value\`.
    // Ein div haette bei beidem gebrochen — und zwar erst zur Laufzeit.
    const p = document.createElement('input');
    p.type = 'hidden'; p.id = id; p.hidden = true;
    ersatzTeile.set(id, p);
  }
  return ersatzTeile.get(id);
};
const blattEl = el('blatt');
const planEl = el('plan');
const werkzeuge = el('werkzeuge');
const palette = el('palette');
const arbeitshinweis = el('arbeitshinweis');
const tafel = el('tafel');
const rueckfrage = el('rueckfrage');
const zurueckFrage = el('zurueckFrage');
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
/* W7: \`const\`, seit das Canvas nicht mehr getauscht wird (s. \`axoNeuBauen\`).
   Ein \`let\` hier hiesse, dass irgendwo doch noch ein Tausch lauert. */
const axoCanvas = el('axo-canvas');
let axoAnsicht = null;
let szene = null;
let axoUhr = null;
let meldungUhr = null;
let axoVeraltet = true;
/* Schalter NUR fuer die Gegenprobe des Kosten-Gates (W7) — im Betrieb immer
   AUS. Er macht aus dem billigen Koerper-Tausch den teuren vollen Neubau
   und beweist damit, dass das Gate den Unterschied ueberhaupt misst. */
let vollNeubauImZug = false;
/* Die beiseitegelegten Bilder fuer die Pixel-Probe der Gates (s. \`bildMerken\`) —
   je eines fuer das Blatt und fuer den Grundriss. Zwei Speicher, weil beide
   Ansichten gleichzeitig im Dokument stehen und ein Gate sie nacheinander
   befragt. */
let axoMerk = null;
let planMerk = null;

/* ── Aufbau ─────────────────────────────────────────────────────────
   Die Reihenfolge ist zwingend: Configuration VOR dem Laden (Wall liest seine
   Masse bei der Erzeugung von dort), Modell vor Zeichner, Zeichner vor der
   Historie. */
Configuration.setValue(configWallHeight, WAND_HOEHE_CM);
Configuration.setValue(configWallThickness, WAND_DICKE_CM);

const grundriss = new Floorplan();

let labels = PLAN.labels || [];
/* Die 3D-Moebel des Planer-Formats (G4). Diese Datei erzeugt selbst KEINE —
   sie kennt nur den 2D-Grundriss. Sie muss sie aber DURCHREICHEN: wer eine
   Datei aus dem echten Planer hier oeffnet, sie bearbeitet und wieder sichert,
   verlor sie bisher stillschweigend, weil der Export fest \`PLAN.items\` schrieb.
   Ein stiller Verlust ist die schlechteste aller Antworten. */
let items = PLAN.items || [];
let gesichertAm = null;
let speicherFehler = speicher ? null : 'merkt-nichts';
let sichernGesperrt = true;
let sicherUhr = null;

/* Liegt ein eigener Stand? Er muss zum eingebauten Plan passen — sonst wird
   NICHT still geladen, sondern beim Start ruhig ANGEBOTEN (s. \`alleStaende\`).
   Bis W10 stand hier eine eigene Rueckfrage (\`standFragt\`) fuer genau diesen
   Fall. Sie ist ersatzlos weg, und zwar nicht aus Sparsamkeit: sie konnte
   nicht ausloesen. Der Schluessel traegt den Plan-Abdruck — was unter ihm
   liegt, hat also immer denselben. Sie bewachte einen Fall, den es unter
   diesem Schluessel nicht geben kann, und der Fall, den es WIRKLICH gibt (der
   Stand liegt unter einem ANDEREN Schluessel), lief an ihr vorbei. */
let start = null;
if (speicher) {
  try {
    const roh = speicher.getItem(SCHLUESSEL);
    if (roh) {
      const stand = JSON.parse(roh);
      if (stand && stand.floorplan && stand.floorplan.corners && stand.planAbdruck === PLAN_ABDRUCK) {
        start = stand;
      }
    }
  } catch (e) {
    start = null;
  }
}
if (start) {
  gesichertAm = start.gesichertAm || null;
  if (Array.isArray(start.labels)) labels = start.labels;
  if (Array.isArray(start.items)) items = start.items;
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

/* M6 — steht ein Zug noch ungesichert im Fenster? Das Sichern ist um 600 ms
   entprellt (ein Ziehen darf nicht hundertmal schreiben). Gemessen: direkt nach
   dem Ablegen standen 0 Bytes im Speicher, geschrieben wurde erst nach 850 ms.
   Wer in dieser Luecke schliesst, verliert seinen letzten Zug — und erfaehrt es
   nie. Diese Angabe traegt den \`beforeunload\`-Schutz weiter unten. */
let ungesichert = false;
let sichernHinweisGezeigt = false;

function bemerkeAenderung(){
  if (sichernGesperrt) return;
  const jetzt = JSON.stringify(grundriss.saveFloorplan());
  if (jetzt === letzterStand) return;
  letzterStand = jetzt;
  ungesichert = true;
  axoVeraltet = true;
  gesetztZeigen();
  if (ansicht === 'axo') axoBaldNeu();
  sichernPlanen();
  /* EINMAL, beim ersten eigenen Zug: dass es „Sichern" gibt. Der localStorage
     unter \`file://\` ist geteilt, knapp und jederzeit vom Nutzer wegzuraeumen —
     wer hier eine Stunde plant, soll wissen, dass es einen zweiten Weg gibt.
     Nur EINMAL: eine Meldung, die bei jedem Zug erscheint, wird weggeklickt,
     ohne gelesen zu werden.

     Und erst NACH dem Sichern (die Entprellung wartet 600 ms) und nur, wenn
     gerade nichts anderes im Meldungsfeld steht: sonst verdraengte dieser
     allgemeine Hinweis genau die Antwort auf die Handlung, die der Nutzer eben
     ausgeloest hat („Tür gesetzt", „Stuhl hingestellt"). Steht dort etwas,
     bleibt der Hinweis ungezeigt und versucht es beim naechsten Zug wieder. */
  if (!sichernHinweisGezeigt) {
    setTimeout(function(){
      if (sichernHinweisGezeigt || !meldungEl.hidden) return;
      sichernHinweisGezeigt = true;
      meldung('Deine Änderungen bleiben in diesem Browser erhalten. Für einen Stand, den du weitergeben oder aufheben kannst, „Sichern“ drücken — das legt eine Datei ab.', false);
    }, 1000);
  }
}

/* ── Was der Nutzer FREI GESETZT hat ────────────────────────────────
   Die tragende Regel des ganzen Vorhabens: die PDF ist die Grundwahrheit, und
   ein gezogenes Moebel ist KEIN Aufmass mehr. Im Grundriss ist es an der
   Strichelung zu erkennen — auf dem BLATT, das die Bank ansieht, waere es das
   nicht. Darum diese eine Zeile im Blattkopf. Sie erscheint nur, wenn es etwas
   zu sagen gibt: eine dauerhafte "0 Stueck frei gesetzt"-Zeile lehrte den
   Leser, ueber sie hinwegzusehen — genau dann, wenn sie einmal wichtig wird. */
/* ── Was am GRUNDRISS anders ist als in der PDF (M2) ────────────────
   Bis hierher sagte das Blatt „Der Grundriss ist gemessen" auch dann noch,
   wenn eine gemessene Wand geloescht war (gemessen: 100 → 99 Waende,
   25 → 24 Raeume, Blatt unveraendert). Fuer die Ausstattung gab es diese
   Auskunft seit W2, fuer die Waende nicht — ausgerechnet fuer das, was ein
   Grundriss eigentlich IST.

   Zwei Zaehlungen, und beide braucht es:

   1. \`gesetzt\` kommt aus dem MODELL (\`Wall.quelle\`). Diese Angabe reist mit
      der Datei: wer einen Stand sichert und woanders oeffnet, nimmt sie mit.
   2. \`fehlen\` wird GEOMETRISCH gegen den eingebauten Plan gemessen — er liegt
      in dieser Datei ohnehin daneben und ist die Grundwahrheit. Eine geloeschte
      Wand kann kein \`quelle\` mehr tragen, sie ist weg; nur der Vergleich mit
      dem Original bemerkt sie noch. Und geometrisch statt ueber Kennungen,
      weil eine GETEILTE Wand zwei neue Kennungen traegt, obwohl kein
      Zentimeter Mauerwerk verschwunden ist: gefragt wird deshalb, ob an der
      MITTE der gemessenen Wand ueberhaupt noch eine Wand liegt.

   Damit ueberlebt die Auskunft auch den Verlust des Feldes: verloere eine
   aeltere Fassung \`quelle\` beim Speichern, faende der geometrische Vergleich
   die Abweichung trotzdem. */
function grundrissAbweichung(){
  let fehlen = 0;
  const pc = PLAN.floorplan.corners;
  for (const w of PLAN.floorplan.walls) {
    const a = pc[w.corner1], b = pc[w.corner2];
    if (!a || !b) continue;
    if (!grundriss.overlappedWall((a.x + b.x) / 2, (a.y + b.y) / 2, WAND_DICKE_CM)) fehlen++;
  }
  return { gesetzt: grundriss.zaehleGesetzteWaende(), fehlen: fehlen };
}

function gesetztZeigen(){
  const n = grundriss.zaehleGesetzte();
  const z = el('gesetztZaehler');
  z.textContent = n + ' Stück frei gesetzt — kein Aufmaß';
  z.hidden = n === 0;

  const w = grundrissAbweichung();
  const teile = [];
  if (w.gesetzt > 0) teile.push(w.gesetzt + (w.gesetzt === 1 ? ' Wand gezeichnet oder verschoben' : ' Wände gezeichnet oder verschoben'));
  if (w.fehlen > 0) teile.push(w.fehlen + (w.fehlen === 1 ? ' gemessene Wand fehlt' : ' gemessene Wände fehlen'));
  const gz = el('grundrissZaehler');
  gz.hidden = teile.length === 0;
  gz.textContent = 'Grundriss verändert: ' + teile.join(', ') + ' — kein Aufmaß';

  /* Der Fusshinweis MUSS mitgehen, sonst widerspricht dasselbe Blatt sich
     selbst: oben "1 Stück frei gesetzt", unten "Ausstattung ist gemessen".
     Wer das liest, glaubt am Ende der bequemeren Zeile. */
  const grundrissSatz = teile.length === 0 ? null : 'Der Grundriss ist verändert (' + teile.join(', ') + ')';
  el('hinweisHerkunft').textContent =
    n === 0 && !grundrissSatz ? 'Grundriss und Ausstattung sind gemessen.'
    : n === 0 ? grundrissSatz + '; die Ausstattung ist gemessen.'
    : (grundrissSatz || 'Der Grundriss ist gemessen') + '; ' + n +
      ' Stück der Ausstattung sind frei gesetzt (im Grundriss gestrichelt).';
  oeffnungenZeigen();
  /* Erst NACH oeffnungenZeigen(): die Marke liest die drei Zaehler ab, und der
     dritte wird genau dort gesetzt. Davor gestellt saehe sie den vorletzten
     Stand und haenkte dem Blatt um einen Zug hinterher. */
  siegelMarkePflegen();
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
  z.textContent = m === 0 ? '' :
    m + (m === 1 ? ' Öffnung gesetzt' : ' Öffnungen gesetzt') +
    (verwaist > 0 ? ', davon ' + verwaist + ' ohne Wand' : '') + ' — kein Aufmaß';
  /* Der Massstabs-Vorbehalt zieht mit: er ist der eigentliche Grund fuer die
     Legende. Waere er dauerhaft da, laese ihn niemand mehr; stuende er gar
     nicht da, laese die Bank aus einem Bild eine Hoehenaussage, die es nicht
     trifft. */
  el('hinweisOeffnung').textContent = m === 0 ? '' :
    ' Türen und Fenster sind in der HÖHE nicht maßstäblich — die Ansicht ' +
    'schneidet die Wände auf 1,16 m auf; Lage und Breite stimmen.';
}

grundriss.fireOnUpdatedRooms(bemerkeAenderung);

/* Der eigene Stand kann aus einer NEUEREN Fassung stammen (jemand hat eine
   aeltere Kopie dieser Datei geoeffnet). Der Kern lehnt ihn dann ab — was hier
   keine weisse Seite ergeben darf: lieber der gemessene Plan und eine ehrliche
   Meldung. Der Stand bleibt liegen, damit die neuere Kopie ihn wiederfindet. */
/* W11-NACHTRAG (Gegner-Fund F3): DER AUSLIEFERUNGSABDRUCK.

   Die Siegel-Marke muss fragen koennen „ist das hier noch der unterschriebene
   Plan?" — und dafuer braucht sie den unterschriebenen Plan in genau der Form,
   in der der Kern ihn wieder ausschreibt. \`PLAN.floorplan\` direkt zu
   vergleichen ginge schief: der Kern ergaenzt beim Laden Felder und schreibt
   Schluessel in seiner eigenen Reihenfolge — der Auslieferungszustand saehe
   dann „veraendert" aus, und eine Warnung, die im Normalfall erscheint, ist
   keine mehr.

   Darum wird der eingebaute Plan EINMAL geladen und ausgeschrieben, bevor ein
   Arbeitsstand darauf kommt. Das kostet einen zusaetzlichen Ladevorgang beim
   Start (76 Ecken, 100 Waende — Millisekunden) und ist der einzige Weg, der
   ohne ein zweites Modell und ohne eine zweite Serialisierungsvorschrift
   auskommt. */
grundriss.loadFloorplan(abschrift(PLAN.floorplan));
const AUSLIEFERUNG_ABDRUCK = JSON.stringify(grundriss.saveFloorplan());
const AUSLIEFERUNG_LABELS = JSON.stringify(PLAN.labels || []);

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

/* ── Lese-Navigation (K3) ───────────────────────────────────────────
   Im Lese-Zustand nimmt die Zeichenflaeche keine Zeiger-Ereignisse an (s. CSS).
   Damit fielen aber auch Zoomen und Schieben weg, die der KERN am Canvas
   abonniert hat — der Grundriss waere ein Standbild, und von einer 78 m langen
   Halle saehe man nie mehr als einen Ausschnitt. Diese Zeilen holen genau das
   zurueck und NICHTS sonst.

   Sie haengen am UMSCHLAG (\`#plan\`), der jetzt das Ziel der Ereignisse ist, und
   rufen ausschliesslich \`zoomeAufPunkt\` und \`verschiebeAnsicht\`. Von hier
   fuehrt kein Weg ins Modell: keine Ecke, keine Wand, kein Moebel. Sobald
   bearbeitet wird, schweigen sie und der Kern uebernimmt wieder — sonst zoomten
   zwei Stellen dasselbe Rad. */
const leseZeiger = new Map();
let leseAbstand = 0;

function leseZugBeenden(){
  leseZeiger.clear();
  leseAbstand = 0;
  planEl.classList.remove('liest');
}

function leseCanvasPunkt(clientX, clientY){
  const r = document.getElementById('grundriss-canvas').getBoundingClientRect();
  return { x: clientX - r.left, y: clientY - r.top };
}

planEl.addEventListener('wheel', function(e){
  if (bearbeiten) return;
  // Ohne das scrollte die Seite, statt dass der Grundriss folgt — derselbe
  // Grund, aus dem der Kern es am Canvas tut.
  e.preventDefault();
  const p = leseCanvasPunkt(e.clientX, e.clientY);
  zeichner.zoomeAufPunkt(zeichner.getZoom() * (e.deltaY < 0 ? 1.1 : 1 / 1.1), p.x, p.y);
}, { passive: false });

planEl.addEventListener('pointerdown', function(e){
  if (bearbeiten) return;
  leseZeiger.set(e.pointerId, { x: e.clientX, y: e.clientY });
  planEl.classList.add('liest');
  // Ohne Fang endete der Zug, sobald der Zeiger eine Leiste streift.
  try { planEl.setPointerCapture(e.pointerId); } catch (err) { /* nicht fangbar: dann eben ohne */ }
});

planEl.addEventListener('pointermove', function(e){
  if (bearbeiten || !leseZeiger.has(e.pointerId)) return;
  const vorher = leseZeiger.get(e.pointerId);
  leseZeiger.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (leseZeiger.size === 1) {
    zeichner.verschiebeAnsicht(e.clientX - vorher.x, e.clientY - vorher.y);
    return;
  }
  if (leseZeiger.size !== 2) return;
  // Zwei Finger: zwischen ihnen zoomen — dieselbe Rechnung wie im Kern
  // (\`fingerBewegt\`), nur ohne den Zweig, der bearbeitet.
  const p = Array.from(leseZeiger.values());
  const abstand = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
  if (leseAbstand > 0 && abstand > 0) {
    const c = leseCanvasPunkt((p[0].x + p[1].x) / 2, (p[0].y + p[1].y) / 2);
    zeichner.zoomeAufPunkt(zeichner.getZoom() * (abstand / leseAbstand), c.x, c.y);
  }
  leseAbstand = abstand;
});

['pointerup','pointercancel'].forEach(function(t){
  planEl.addEventListener(t, function(e){
    if (!leseZeiger.has(e.pointerId)) return;
    leseZeiger.delete(e.pointerId);
    leseAbstand = 0;
    if (leseZeiger.size === 0) planEl.classList.remove('liest');
  });
});
addEventListener('blur', leseZugBeenden);

/* ── Axonometrie ────────────────────────────────────────────────────
   W7 — DAS CANVAS BLEIBT STEHEN. Bis hierher bekam die Ansicht bei JEDEM
   Neubau ein frisches Canvas, und zwar aus einem einzigen Grund: der Renderer
   meldete seine Zeiger-Abos nie ab, ein zweiter Aufruf auf demselben Canvas
   stapelte sie, und jedes Ziehen drehte danach doppelt so schnell. Der Preis
   war hoch und wurde jedes Mal bezahlt — mit dem Canvas starben auch Zoom und
   Verschiebung des Nutzers.

   Seit \`erzeugeAxonometrie\` ein \`zerstoere()\` und ein \`setzeSzene()\` anbietet,
   ist beides weg: EIN Renderer, EIN Canvas, und ein Neubau tauscht nur noch
   die Szene. Wer mitten im Ziehen ist, sieht das Blatt an derselben Stelle
   weiterlaufen. */
function tafelRand(){ return (tafelAn && innerWidth > 900) ? 294 : 0; }

/* ── Bearbeiten IM BLATT (W7) ───────────────────────────────────────
   Der Renderer meldet nur, WO im Weltmass gegriffen und gezogen wird; was
   daraus wird, entscheidet allein diese Huelle — und zwar ueber DENSELBEN Kern,
   der auch den Grundriss bedient (\`zugBeginnen\`/\`zugSchritt\`/\`zugBeenden\`).
   Zwei Zieh-Fassungen waeren zwei Einrast-Rechnungen fuer dieselbe Bewegung.

   \`aktiv()\` fragt BEIDES ab: den Bearbeiten-Schalter und die vorn stehende
   Ansicht. Das ruhende Blatt der Bank nimmt damit keinen Griff an — und der
   Schalter allein macht es auch nicht scharf. */
const axoBearbeitung = {
  aktiv: function(){ return bearbeiten && ansicht === 'axo'; },
  greife: function(id, wx, wy){ return zeichner.zugBeginnen(id, wx, wy); },
  ziehe: function(wx, wy){
    if (!zeichner.zugSchritt(wx, wy)) return null;
    /* NUR fuer die Gegenprobe des Kosten-Gates: der NAIVE Weg, den dieser Bau
       ausdruecklich nicht geht — \`Floorplan.update()\` (Raeume, Halbkanten,
       Texturen, Oeffnungs-Versoehnung) plus voller Szenen-Neubau, und das bei
       JEDER Zeigerbewegung. Ein Waechter, der nie rot wird, ist keiner: das
       Gate muss beweisen koennen, dass es diesen Unterschied ueberhaupt
       bemerkt. Im Betrieb ist dieser Zweig aus. */
    if (vollNeubauImZug) { grundriss.update(); axoNeuBauen(); return null; }
    const stueck = grundriss.findeAusstattung(zeichner.zugLaeuft());
    /* NUR dieser eine Koerper — aus DERSELBEN Funktion, aus der \`baueSzene\` ihn
       baut. Ein hier nachgebautes Vieleck waere eine zweite Wahrheit ueber das
       Aussehen eines Stuecks, und sie fiele erst beim Loslassen auf: dann
       spraenge das Moebel in seine richtige Form zurueck. */
    return stueck ? (ausstattungsKoerper(stueck, HOEHEN)[0] || null) : null;
  },
  lassLos: function(){
    const id = zeichner.zugLaeuft();
    zeichner.zugBeenden();
    /* Erst JETZT der volle Neubau (ueber \`bemerkeAenderung\` -> \`axoBaldNeu\`):
       waehrend des Zuges kostete er gemessen 16,2 ms je Bewegung. */
    if (id) bemerkeAenderung();
  },
  zuFlach: function(neigung){
    /* EHRLICH SAGEN statt still verweigern. Unter dieser Neigung bedeutet ein
       Bildpunkt ueber 22 cm Tiefe — ein Zittern der Hand legte das Stueck einen
       halben Meter weiter hinten ab, ohne dass man es saehe. */
    meldung('Das Blatt liegt zu flach zum Verschieben — ein Bildpunkt wäre hier über 22 cm Tiefe. ' +
      'Blatt aufrichten oder „Plan“ wählen.' +
      /* Am Handy gibt es kein Q und kein E; dort ist „Drehen geht weiter" keine
         Auskunft, sondern eine Suche. */
      (schmal() ? '' : ' Drehen mit Q und E geht weiter.'), false);
    arbeitshinweisPflegen();
  }
};

/* Was der Hinweis oben gerade sagen MUSS. Er haengt an der Neigung: ein
   flachgekipptes Blatt kann nicht ziehen, und das soll man lesen koennen,
   BEVOR man es versucht. */
/* Schmale Anzeige — dieselbe Grenze wie die Medienabfrage im Kopf (900 px).
   EINE Zahl an zwei Stellen ist eine zu viel; sie steht hier, weil CSS sie
   nicht herausgeben kann, und traegt darum den Verweis. */
function schmal(){ return innerWidth <= 900; }

/* Wie man einen Schritt zurueck nimmt — am Rechner eine Taste, am Handy ein
   Knopf. Eine Meldung, die „Strg+Z" nennt, schickt den Nutzer eines Telefons
   suchen; sie beschaedigt genau die Zusage, die sie geben will („keine Sorge,
   das laesst sich zurueckholen"). EINE Stelle, weil derselbe Satz an drei
   Meldungen haengt. */
function rueckgaengigSatz(){
  return schmal() ? 'Rückgängig mit dem Knopf in der Leiste.' : 'Rückgängig mit Strg+Z.';
}

function arbeitshinweisPflegen(){
  const flach = !!axoAnsicht && !axoAnsicht.ziehbar;
  /* AM HANDY GIBT ES KEINE TASTATUR (Handy-Welle). Bis hierher versprach diese
     Zeile dort „Q und E drehen, Entf löscht" — beides Tasten, die auf einem
     Telefon nicht existieren. Ein Hinweis, der eine Bedienung verschweigt, die
     es gibt, ist schlimm; einer, der eine verspricht, die es nicht gibt, ist
     schlimmer: der Nutzer sucht dann den Fehler bei sich. */
  const tasten = schmal() ? '' : ', Q und E drehen, Entf löscht';
  el('arbeitshinweisWas').textContent = flach
    ? (schmal()
        ? '— zu flach zum Ziehen: Blatt aufrichten.'
        : '— zu flach zum Ziehen. Q und E drehen, Entf löscht.')
    : '— Möbel ziehen' + tasten + '.';
  el('arbeitshinweisWarum').textContent = flach
    ? 'Ein Bildpunkt bedeutet hier über 22 cm Tiefe — Blatt aufrichten oder „Plan“ wählen.'
    : 'Wände, Türen und Fenster gehören in den Grundriss.';
}

function axoNeuBauen(){
  szene = baueSzene(
    { floorplan: grundriss.saveFloorplan(), labels: labels },
    { wandDicke: WAND_DICKE_CM, nurKernSaeulen: !vollausbau, hoehen: HOEHEN }
  );
  if (axoAnsicht) {
    axoAnsicht.setzeSzene(szene);
  } else {
    axoAnsicht = erzeugeAxonometrie(axoCanvas, szene, {
      namen: namenModus, randRechts: tafelRand(), bearbeitung: axoBearbeitung
    });
    axoAnsicht.passeAn();
    /* EINMALIG, nicht je Neubau: das Canvas wechselt nicht mehr, also wechseln
       auch seine Zuhoerer nicht. */
    axoCanvas.addEventListener('pointerdown', function(){ axoCanvas.classList.add('zieht'); });
    ['pointerup','pointercancel'].forEach(function(t){
      axoCanvas.addEventListener(t, function(){
        axoCanvas.classList.remove('zieht');
        /* Nach einem Dreh-Zug kann die Neigung die Ziehgrenze ueberschritten
           haben — dann muss der Hinweis oben es sagen, bevor jemand vergeblich
           greift. */
        arbeitshinweisPflegen();
      });
    });
  }
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
function zeigeAnsicht(name, merken){
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
  /* W7: die zuletzt angesehene Ansicht wird gemerkt. Vorher trug der
     Bearbeiten-Schluessel sie stillschweigend mit — seit der Schalter die
     Ansicht stehen laesst, muss sie sich selbst merken, sonst passten die
     gespeicherten Angaben beim naechsten OEffnen nicht mehr zusammen. */
  if (merken && speicher) {
    try { speicher.setItem(SCHLUESSEL_ANSICHT, name); } catch (e) { /* Platz ist knapp; die Ansicht ist es nicht wert */ }
  }
}

/* ── Bearbeiten ─────────────────────────────────────────────────────
   Im Auslieferungszustand sieht die Bank ein ruhiges Blatt: keine Werkzeuge.
   Der Schalter merkt sich seinen Zustand, damit man ihn nicht bei jedem
   OEffnen neu greifen muss.

   W7 — ER WECHSELT DIE ANSICHT NICHT MEHR. Bis hierher sprang er in den
   Grundriss und beim Ausschalten zurueck aufs Blatt. Das war eine Annahme aus
   W1, und der Nutzer hat ihr widersprochen: „wenn ich bearbeiten klicke soll
   die ansicht dieselbe sein wie die zuletzt angesehene". Er schaltet seither
   NUR die Werkzeuge; welche Ansicht vorn ist, entscheiden allein „Grundriss"
   und „Axonometrie".

   Was daraus in der AXONOMETRIE wird, ist keine Nebensache. Dort wird nicht
   bearbeitet (Projekt-DNA: in einer schraegen Parallelprojektion trifft ein
   Klick keinen Punkt, sondern einen Sehstrahl — die Zielhoehe waere geraten).
   Werkzeugleiste und Palette liegen im Grundriss-Umschlag und erben dessen
   Sichtbarkeit; in der Axonometrie sind sie darum GAR NICHT DA. Ein toter
   Knopf kann so nicht entstehen — nicht, weil hier jemand daran denkt,
   sondern weil das Haus so gebaut ist. An ihrer Stelle steht \`#arbeitshinweis\`
   und sagt ruhig, wo gezeichnet wird.

   Die K3-Zeile bleibt die tragende: \`body.bearbeitet\` allein macht die
   Zeichenflaeche scharf. Dass sie das jetzt auch tut, waehrend das Blatt vorn
   ist, aendert nichts — die ruhende Ansicht ist \`visibility:hidden\` und nimmt
   ohnehin keinen Zeiger an; beim Wechsel in den Grundriss ist dafuer sofort
   alles bereit. */
/* ══════════════════════════════════════════════════════════════════
   DAS SCHLOSS VOR DER WERKSTATT

   WOGEGEN ES HILFT — und das ist genau abgesteckt, damit niemand mehr
   hineinliest, als da ist:

   1. Gegen das VERSEHEN. Wer die Datei ansieht, kann nicht aus Unachtsamkeit
      eine Wand verschieben; die Werkzeuge erscheinen gar nicht erst.
   2. Gegen den wahrscheinlichsten Unfall dieses Vorhabens: die FALSCHE DATEI
      verschickt. Ohne Passwort ist auch die volle Fassung nur eine Ansicht.

   WOGEGEN ES NICHT HILFT: gegen jemanden, der die Entwicklerwerkzeuge des
   Browsers bedient. Das ist hinnehmbar, und zwar nicht aus Bequemlichkeit,
   sondern weil eine Bearbeitung die DATEI ohnehin nicht veraendern kann — der
   eingebaute Plan bleibt unangetastet, der Arbeitsstand liegt daneben im
   Browser-Speicher und reist mit keiner Kopie mit. Wer den Plan wirklich
   veraendern will, braucht einen Texteditor, und dann bricht das Siegel.

   ECHTE VERSCHLUESSELUNG, KEIN ABGLEICH. Es gibt in dieser Datei kein
   Passwort und keinen Abdruck eines Passworts. Es gibt ein Paket, das sich mit
   dem richtigen Passwort entschluesseln laesst und sonst nicht: AES-GCM ist
   beglaubigend und scheitert bei falschem Schluessel mit einem Fehler statt
   mit Unsinn. Ein \`if (wort === ...)\`, das man ueberspringen koennte, existiert
   folglich nicht. */
function ausB64(s){
  const roh = atob(s);
  const b = new Uint8Array(roh.length);
  for (let i = 0; i < roh.length; i++) b[i] = roh.charCodeAt(i);
  return b;
}

/* In der reinen ANSICHT gibt es keine Werkstatt — dort ist sie ZU und bleibt es
   (Gegner-Fund M1). Ohne Schloss in der vollen Fassung (--ohne-siegel, ein
   ausdruecklicher Bau) steht sie offen; dort gibt es nichts aufzuschliessen. */
let werkstattOffen = NUR_ANSICHT ? false : !SCHLOSS;

async function schlossOeffnen(wort){
  if (!(window.crypto && window.crypto.subtle)) {
    return { offen: false, grund: 'Dieser Browser kann das Schloss nicht öffnen.' };
  }
  try {
    const basis = await crypto.subtle.importKey('raw', new TextEncoder().encode(wort), 'PBKDF2', false, ['deriveKey']);
    const k = await crypto.subtle.deriveKey(
      /* Gegner-Fund L2: die Rundenzahl kommt aus der Datei. Ein manipuliertes
         1e9 waere kein Bypass (falsches Passwort scheitert weiter), aber es
         liesse den Tab beim ersten Aufsperrversuch minutenlang stehen — ein
         Aussperren durch Rechenzeit. Geklemmt auf einen Bereich, in dem beide
         Enden noch vernuenftig sind. */
      { name: 'PBKDF2', salt: ausB64(SCHLOSS.salz),
        iterations: Math.min(Math.max(SCHLOSS.runden | 0, 100000), 2000000), hash: SCHLOSS_HASH },
      basis, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ausB64(SCHLOSS.iv) }, k, ausB64(SCHLOSS.inhalt));
    return { offen: true };
  } catch (e) {
    return { offen: false, grund: 'Das Passwort passt nicht.' };
  }
}

/* Der Weg, den der Knopf geht. ABSCHLIESSEN fragt nie — eine Sperre, die sich
   nur mit dem Passwort wieder schliessen liesse, wuerde offen gelassen. */
function bearbeitenGewuenscht(){
  if (bearbeiten) { setzeBearbeiten(false, true); return; }
  if (werkstattOffen) { setzeBearbeiten(true, true); return; }
  const f = el('schlossFrage');
  f.classList.remove('falsch');
  el('schlossFuss').textContent = 'Beim Schließen der Datei fällt das Schloss wieder zu.';
  el('schlossWort').value = '';
  frageZeigen(f);
  el('schlossWort').focus();
}

async function schlossVersuchen(){
  const wort = el('schlossWort').value;
  const f = el('schlossFrage');
  const knopf = el('btnSchlossJa');
  if (!wort) { el('schlossWort').focus(); return; }
  /* Das Nachrechnen dauert auf einem Telefon spuerbar (gemessen: 318 ms fuer
     310 000 Runden in WebKit, hier sind es 600 000). Ohne diese drei Zeilen
     sieht ein Druck folgenlos aus, und der Nutzer drueckt noch einmal — was
     eine zweite Rechnung anwuerfe und den Eindruck bestaetigte. */
  knopf.disabled = true;
  const vorher = knopf.textContent;
  knopf.textContent = 'Prüfe…';
  const e = await schlossOeffnen(wort);
  knopf.disabled = false;
  knopf.textContent = vorher;
  if (!e.offen) {
    f.classList.add('falsch');
    el('schlossFuss').textContent = e.grund;
    el('schlossWort').select();
    return;
  }
  werkstattOffen = true;
  f.hidden = true;
  el('schlossWort').value = '';   // nicht im Feld stehen lassen
  setzeBearbeiten(true, true);
  meldung('Aufgeschlossen — die Werkzeuge sind da. Der eingebaute Plan bleibt unangetastet; was du änderst, liegt daneben.', false);
}

function setzeBearbeiten(an, merken){
  /* DER RIEGEL der reinen Ansicht. Er sitzt hier und nicht bei den Aufrufern,
     weil es der EINE Zustand ist, um den es geht: was auch immer ihn setzen
     will — ein alter Speicherwert, ein Knopf, die Entwicklerwerkzeuge — hier
     kommt es vorbei. Ein Riegel an drei Aufrufstellen ist ein Riegel, den der
     vierte umgeht. */
  if (NUR_ANSICHT && an) return;
  bearbeiten = an;
  /* Abschliessen heisst abschliessen: der naechste Griff zum Schalter fragt
     wieder. Ohne diese Zeile waere das Schloss nach dem ersten Aufsperren fuer
     den Rest der Sitzung offen — und ein Schloss, dessen Zustand man nicht
     mehr kennt, ist keines. */
  if (!an && SCHLOSS) werkstattOffen = false;
  // Der Zustand muss man SEHEN: offenes Schloss oder geschlossenes. Ein Schutz,
  // dessen Stand unsichtbar ist, wird beim naechsten Oeffnen erraten.
  const sym = el('btnBearbeiten').querySelector('.schloss');
  if (sym) sym.innerHTML = an ? '&#128275;' : '&#128274;';
  /* DIE tragende Zeile aus K3: an ihr haengt \`pointer-events\` der
     Zeichenflaeche. Sie steht ganz vorn, damit kein frueher Rueckweg (etwa
     \`paletteZugAbbrechen\`) sie ueberspringen kann — eine scharfe Flaeche in
     einem Blatt, das sich fuer ruhig haelt, ist der schlimmste der beiden
     Fehler. */
  document.body.classList.toggle('bearbeitet', an);
  if (!an) leseZugBeenden();
  werkzeuge.hidden = !an;
  // Die Palette gehoert zu den Werkzeugen: wer nur zusieht, soll auch nichts
  // hinstellen koennen. Ein laufender Zug wird dabei abgebrochen — sonst legte
  // ein Loslassen nach dem Ausschalten noch ein Stueck ab, das niemand
  // bestellt hat.
  palette.hidden = !an;
  if (!an) paletteZugAbbrechen();
  /* Nur der Bearbeiten-Zustand steht hier — dass der Hinweis ausschliesslich
     in der Axonometrie zu sehen ist, entscheidet seine Lage im Blatt, nicht
     diese Zeile. */
  arbeitshinweis.hidden = !an;
  if (an) arbeitshinweisPflegen();
  el('btnBearbeiten').setAttribute('aria-pressed', String(an));
  /* Wer aufhoert zu bearbeiten, laesst auch los: ein Griff, der einen
     ausgeschalteten Schalter ueberlebte, zoege am naechsten Blatt weiter. */
  if (!an) zeichner.zugBeenden();
  // Ein ruhendes Loeschen-Werkzeug waere eine Falle beim naechsten OEffnen.
  if (!an) zeichner.setMode(floorplannerModes.MOVE);
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

/* ── Zwei Fenster derselben Datei (K4) ──────────────────────────────
   \`file://\` ist EIN Ursprung fuer die ganze Festplatte: zwei geoeffnete Kopien
   dieser Datei am SELBEN Ablageort teilen sich denselben Schluessel. Gemessen:
   Fenster A setzt ein Stueck, B setzt ein anderes, A legt nach — im Speicher
   stehen danach nur A's zwei, und B zeigt weiter „Eigener Stand vom …" und
   luegt damit.

   Zwei Riegel, bewusst beide:
   1. VOR jedem Schreiben wird der abgelegte Zeitstempel mit dem verglichen,
      den DIESES Fenster zuletzt geschrieben hat. Weichen sie ab, war jemand
      anderes da — dann wird NICHT geschrieben, sondern gefragt. Dieser Riegel
      ist deterministisch und der eigentliche Schutz.
   2. Das \`storage\`-Ereignis meldet den Fremdschreiber sofort, statt erst beim
      naechsten eigenen Zug. Es ist die Hoeflichkeit, nicht der Schutz — ob es
      unter \`file://\` in jedem Browser feuert, ist nicht verbuergt, und ein
      Schutz, der auf einem Vielleicht steht, ist keiner. */
let zuletztGeschrieben = start ? (start.gesichertAm || null) : null;
let fremdStand = null;

function fremderStand(){
  if (!speicher) return null;
  let roh = null;
  try { roh = speicher.getItem(SCHLUESSEL); } catch (e) { return null; }
  if (!roh) return null;
  let s = null;
  try { s = JSON.parse(roh); } catch (e) { return null; }
  if (!s || !s.gesichertAm) return null;
  // Was dieses Fenster selbst zuletzt geschrieben hat, ist nicht fremd.
  return s.gesichertAm === zuletztGeschrieben ? null : s;
}

function sichereJetzt(){
  if (!speicher) { standZeigen(); return; }
  const fremd = fremderStand();
  if (fremd) {
    // NICHT schreiben. Der Nutzer entscheidet, welcher Stand gilt — still den
    // anderen zu ueberschreiben ist genau der gemessene Fehler.
    fremdStand = fremd;
    standZeigen();
    return;
  }
  const jetzt = new Date().toISOString();
  try {
    speicher.setItem(SCHLUESSEL, JSON.stringify({
      fassung: 1,
      planAbdruck: PLAN_ABDRUCK,
      bauStempel: BAU_STEMPEL,
      /* WO dieser Stand entstanden ist — im Klartext, nicht als Hash (W10).
         Der Schluessel traegt nur \`ORT_ABDRUCK\`, und aus einem Hash laesst
         sich kein Satz bauen: das Angebot beim Start konnte darum bis W10 nur
         „an einem anderen Ablageort" sagen. Wer zwischen drei Kopien
         entscheiden soll, braucht aber den Ordner, nicht die Auskunft, dass es
         irgendeinen gibt. Ein Dateipfad auf dem eigenen Rechner, abgelegt im
         eigenen Browser — das verlaesst diese Maschine nie. */
      ort: ORT_KLARTEXT,
      gesichertAm: jetzt,
      floorplan: grundriss.saveFloorplan(),
      labels: labels,
      // G4: die 3D-Moebel muessen den Neustart ueberleben, sonst gingen sie
      // beim naechsten Oeffnen doch verloren.
      items: items
    }));
    gesichertAm = jetzt;
    zuletztGeschrieben = jetzt;
    speicherFehler = null;
    // M6: erst JETZT ist der Zug wirklich abgelegt.
    ungesichert = false;
  } catch (e) {
    // Nie still verlieren: der Platz ist geteilt und schnell voll.
    speicherFehler = (e && e.name) ? e.name : 'Fehler';
  }
  standZeigen();
}

/* Der Nutzer hat sich entschieden: sein Stand gilt. Der fremde wird
   ueberschrieben — aber SICHTBAR und auf Ansage, nicht im Vorbeigehen. */
function fremdUebergehen(){
  const fremd = fremderStand();
  zuletztGeschrieben = fremd ? fremd.gesichertAm : zuletztGeschrieben;
  fremdStand = null;
  sichereJetzt();
  meldung('Dein Stand gilt jetzt — der Stand des anderen Fensters ist überschrieben.', false);
}

if (speicher) {
  addEventListener('storage', function(e){
    if (e.key !== SCHLUESSEL) return;
    const fremd = fremderStand();
    if (!fremd) return;
    fremdStand = fremd;
    standZeigen();
  });
}

function standZeigen(){
  const knopf = el('btnStandZurueck');
  const fremdKnoepfe = el('standFremd');
  fremdKnoepfe.hidden = !fremdStand;
  if (fremdStand) {
    standleiste.hidden = false;
    standleiste.classList.add('warnt');
    const f = new Date(fremdStand.gesichertAm);
    el('standText').textContent = 'Ein anderes Fenster hat diese Datei um ' +
      f.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) +
      ' Uhr gespeichert. Dein Stand ist NICHT abgelegt worden.';
    knopf.hidden = true;
    return;
  }
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

/* Eine Meldung, die etwas ANBIETET (C3) — mit einem Knopf, und OHNE die Uhr.
   Die 9 Sekunden sind fuer eine Auskunft richtig („Tür gesetzt") und fuer ein
   Angebot falsch: wer gerade eine unwiderrufliche Handlung ausgeloest hat,
   liest nicht in neun Sekunden und entscheidet. Sie bleibt stehen, bis sie
   geschlossen oder angenommen wird. \`textContent\` leert dabei auch den alten
   Knopf — sonst stapelten sich zwei Angebote in einer Zeile. */
function meldungMitKnopf(text, knopfText, tun){
  clearTimeout(meldungUhr);
  meldungEl.textContent = text + ' ';
  meldungEl.classList.remove('warnt');
  const knopf = document.createElement('button');
  knopf.type = 'button';
  knopf.id = 'btnMeldung';
  knopf.textContent = knopfText;
  knopf.addEventListener('click', function(){
    meldungEl.hidden = true;
    meldungEl.textContent = '';
    tun();
  });
  meldungEl.appendChild(knopf);
  meldungEl.hidden = false;
}

/* Laedt einen Grundriss und laesst dabei nichts Eigenes zurueck. Die Historie
   raeumt der Kern selbst ab (UndoManager haengt an roomLoadedCallbacks) — ein
   Undo ueber einen Plan-Wechsel hinweg spielte sonst fremde Waende ein. */
function ladeGrundriss(fp, neueLabels, alsEigenerStand){
  /* ATOMAR — entweder ganz oder gar nicht (K2). Gemessen: eine Ecke mit
     \`x: 1e8\` liess den Kern MITTEN im Laden einen Bereichsfehler werfen, und
     zurueck blieb ein halb geladener Grundriss: ein paar Ecken der fremden
     Datei, keine Waende, kein Raum — und nichts sagte es. Die Formpruefung
     unten faengt das inzwischen vorher ab; dieser Rueckweg ist der zweite
     Riegel, denn eine Pruefung kennt immer nur die Fehler, an die jemand
     gedacht hat. Der Zustand VOR dem Laden ist billig zu sichern: derselbe
     Schnappschuss, mit dem auch das Rueckgaengig arbeitet. */
  const standVorher = grundriss.saveFloorplan();
  const labelsVorher = labels;
  sichernGesperrt = true;
  try {
    if (Array.isArray(neueLabels)) labels = neueLabels;
    grundriss.loadFloorplan(abschrift(fp));
    letzterStand = JSON.stringify(grundriss.saveFloorplan());
  } catch (e) {
    labels = labelsVorher;
    grundriss.loadFloorplan(abschrift(standVorher));
    letzterStand = JSON.stringify(grundriss.saveFloorplan());
    sichernGesperrt = false;
    gesetztZeigen();
    axoNeuBauen();
    // Weiterreichen: der Aufrufer sagt dem Nutzer, WAS nicht ging. Still
    // zurueckzurollen saehe aus, als waere nie etwas passiert.
    throw e;
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

/* ── Was „Zurücksetzen" WEGNIMMT, in Zahlen (C3) ────────────────────
   Die Rueckfrage sagte bis W10 nur „alle eigenen Änderungen verwerfen". Das ist
   wahr und nutzlos: wer nicht weiss, WIE VIEL er verliert, kann die Frage
   nicht beantworten. Danach ist ausserdem das Rueckgaengig abgeschaltet (der
   Kern raeumt die Historie beim Laden ab) — es ist die einzige Handlung dieser
   Datei, die sich mit ihren eigenen Mitteln nicht zuruecknehmen laesst.

   Gezaehlt wird an DENSELBEN Quellen wie der Blattkopf (\`gesetztZeigen\`), nicht
   an einer zweiten Rechnung daneben: sonst nennte die Rueckfrage eine andere
   Zahl als die Zeile, die der Nutzer eine Sekunde vorher gelesen hat. */
function verlustBeimZuruecksetzen(){
  const teile = [];
  const stueck = grundriss.zaehleGesetzte();
  if (stueck > 0) teile.push(stueck + (stueck === 1 ? ' gesetztes Stück' : ' gesetzte Stücke'));
  const w = grundrissAbweichung();
  if (w.gesetzt > 0) teile.push(w.gesetzt + (w.gesetzt === 1 ? ' gezeichnete oder verschobene Wand' : ' gezeichnete oder verschobene Wände'));
  if (w.fehlen > 0) teile.push(w.fehlen + (w.fehlen === 1 ? ' gelöschte gemessene Wand' : ' gelöschte gemessene Wände'));
  const o = grundriss.zaehleOeffnungen();
  if (o > 0) teile.push(o + (o === 1 ? ' Öffnung' : ' Öffnungen'));
  return teile;
}

function zurueckFrageZeigen(){
  const teile = verlustBeimZuruecksetzen();
  /* „Verloren gehen: …" statt „… gehen verloren": so muss der Satz sich nicht
     nach der Zahl des LETZTEN Listenglieds richten („1 Öffnung geht" gegen
     „2 Öffnungen gehen"). Eine Aufzaehlung, die sich selbst konjugieren
     muesste, wird beim naechsten neuen Zaehler falsch. */
  el('zurueckFrageUmfang').textContent = teile.length === 0
    ? 'Es ist nichts Eigenes da — die Datei steht schon auf dem gemessenen Plan.'
    : 'Verloren gehen: ' + teile.join(', ') + '.';
  frageZeigen(zurueckFrage);
  el('btnZurueckNein').focus();
}

/* Der Stand VOR dem Zuruecksetzen, unter einem EIGENEN Schluessel (C3).
   Warum ueberhaupt: „Zurücksetzen" liegt in derselben Leiste wie „Laden" und
   rueckte beim Werkzeugwechsel gemessen bis zu 520 px — der gefaehrlichste
   Knopf der Datei landete unter dem alten Platz des harmlosesten. Die
   Leiste steht seit V7 still; ein Fehlgriff bleibt trotzdem moeglich, und
   danach gibt es kein Rueckgaengig mehr. Eine Sicherung kostet einen
   Speicherplatz und rettet eine Arbeitsstunde.

   EIGENER Schluessel und nicht der Stand-Schluessel: der wird ja gerade
   geloescht. Genau EINE Sicherung, immer die letzte — eine Historie im
   localStorage waere bei 4,8 MB fuer ALLE file://-Seiten zusammen der sichere
   Weg in einen stillen Schreibfehler (s. Kopf „Speicher"). */
function sicherungAnlegen(){
  if (!speicher) return false;
  try {
    speicher.setItem(SCHLUESSEL_SICHERUNG, JSON.stringify({
      fassung: 1,
      planAbdruck: PLAN_ABDRUCK,
      bauStempel: BAU_STEMPEL,
      ort: ORT_KLARTEXT,
      gesichertAm: new Date().toISOString(),
      floorplan: grundriss.saveFloorplan(),
      labels: labels,
      items: items
    }));
    return true;
  } catch (e) {
    /* Kein stiller Fehlschlag: wer glaubt, es liege eine Sicherung, klickt
       sorgloser. Der Aufrufer sagt es weiter. */
    return false;
  }
}

function sicherungZurueckholen(){
  if (!speicher) return false;
  let s = null;
  try { s = JSON.parse(speicher.getItem(SCHLUESSEL_SICHERUNG)); } catch (e) { return false; }
  if (!s || !s.floorplan || !s.floorplan.corners) return false;
  if (Array.isArray(s.items)) items = s.items;
  try {
    ladeGrundriss(s.floorplan, s.labels, true);
  } catch (e) {
    meldung('Die Sicherung ließ sich nicht öffnen (' + ((e && e.message) ? e.message : String(e)) + ').', true);
    return false;
  }
  /* Verbraucht: der Inhalt IST jetzt der Arbeitsstand und liegt unter dem
     normalen Schluessel. Ihn liegen zu lassen waere ein Speicherplatz, den
     niemand mehr erreichen kann — bei rund 4,8 MB fuer ALLE file://-Seiten
     zusammen ist das nicht nichts. BEKANNTE GRENZE: wer nach dem
     Zuruecksetzen neu laedt, ohne den Knopf gedrueckt zu haben, verliert das
     Angebot; die Sicherung bleibt dann liegen, bis das naechste
     Zuruecksetzen sie ueberschreibt. Ein Angebot, das den Neustart
     ueberdauert, waere ein zweites Startangebot neben dem aus C1 — zwei
     Zeilen, die dasselbe zu sein scheinen und es nicht sind. */
  try { speicher.removeItem(SCHLUESSEL_SICHERUNG); } catch (e) { /* egal */ }
  meldung('Der Stand von vor dem Zurücksetzen ist wieder da: ' +
    grundriss.getCorners().length + ' Ecken, ' + grundriss.getWalls().length + ' Wände, ' +
    grundriss.zaehleGesetzte() + ' gesetzte Stücke.', false);
  return true;
}

function zuruecksetzen(){
  /* ERST sichern, dann loeschen (C3). Die Reihenfolge ist der ganze Punkt:
     nach \`ladeGrundriss\` gibt es nichts mehr zu sichern. */
  const gesichert = sicherungAnlegen();
  /* M7 — ALLE Schluessel, nicht nur einer. Gemessen: „Zurücksetzen" loeschte
     den Plan-Schluessel und liess den Bearbeiten-Schluessel stehen; nach einem
     Neuladen standen wieder Grundriss und Werkzeuge da. Ein einziger
     Neugier-Klick machte damit den Werkzeugkasten dauerhaft zur Begruessung —
     das Gegenteil dessen, was dieser Knopf verspricht. „Zuruecksetzen" heisst
     AUSLIEFERUNGSZUSTAND: ruhiges Blatt, keine Werkzeuge, gemessener Plan.
     Seit W7 gehoert der Ansichts-Schluessel dazu — er ist die dritte Angabe,
     die diesen Zustand verstellen koennte. */
  if (speicher) {
    try { speicher.removeItem(SCHLUESSEL); } catch (e) { /* egal */ }
    try { speicher.removeItem(SCHLUESSEL_BEARBEITEN); } catch (e) { /* egal */ }
    try { speicher.removeItem(SCHLUESSEL_ANSICHT); } catch (e) { /* egal */ }
  }
  clearTimeout(sicherUhr);
  labels = PLAN.labels || [];
  items = PLAN.items || [];
  speicherFehler = speicher ? null : 'merkt-nichts';
  ladeGrundriss(PLAN.floorplan, PLAN.labels || [], false);
  // \`merken: false\` — die Schluessel sind eben geloescht worden, sie hier
  // wieder zu schreiben machte das Loeschen zur Geste.
  setzeBearbeiten(false, false);
  /* Und ausdruecklich zurueck aufs Blatt: seit W7 folgt die Ansicht dem
     Schalter nicht mehr: ohne diese Zeile bliebe nach dem „Zuruecksetzen" der
     Grundriss stehen — der Auslieferungszustand ist aber das ruhige Blatt. */
  zeigeAnsicht('axo', false);
  ungesichert = false;
  /* Die Meldung BIETET den alten Stand an (C3). Ein Knopf in der Meldungszeile
     und keine zweite Rueckfrage: gefragt wurde eben, jetzt ist gehandelt — und
     ein zweiter Dialog direkt nach dem ersten lehrt nur, Dialoge wegzuklicken.
     Sie bleibt stehen, bis der Nutzer sie schliesst; die uebliche 9-Sekunden-
     Uhr waere hier eine Frist auf einer unwiderruflichen Handlung. */
  if (gesichert) {
    meldungMitKnopf(
      'Der gemessene Plan aus der PDF ist wieder hergestellt — die Datei ist wie am ersten Tag. Dein Stand von vorher ist gesichert.',
      'Stand zurückholen',
      function(){ sicherungZurueckholen(); }
    );
  } else {
    meldung('Der gemessene Plan aus der PDF ist wieder hergestellt — die Datei ist wie am ersten Tag. ' +
      (speicher ? 'Eine Sicherung des alten Standes ließ sich NICHT ablegen (der Speicher ist voll).'
                : 'Dieser Browser merkt sich hier nichts, es gibt darum keine Sicherung.'), !speicher ? false : true);
  }
}

/* ── Als Datei sichern ──────────────────────────────────────────────
   Dasselbe Format wie app/public/plaene/halle400.json, damit dieselbe Datei im
   echten Planer geoeffnet werden kann — beide Welten sprechen ein Format.

   \`items\` sind die 3D-Moebel des Planers. Diese Datei erzeugt keine und zeigt
   keine; sie REICHT sie durch (G4). Vorher stand hier fest \`PLAN.items\`, und
   das war eine stille Luege: wer eine Datei aus dem echten Planer hier oeffnete
   und wieder sicherte, verlor deren Moebel, waehrend die Datei weiter
   behauptete, im Planer oeffenbar zu sein. */
function alsDatei(){
  const daten = {
    floorplan: grundriss.saveFloorplan(),
    items: items,
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
  // M6: als Datei abgelegt heisst gesichert — der Schutz beim Schliessen darf
  // danach nicht weiter Alarm schlagen, sonst lernt der Nutzer, ihn wegzuklicken.
  ungesichert = false;
  meldung('Gesichert als ' + a.download + ' (im Download-Ordner).', false);
}

/* ── Formpruefung beim Laden ────────────────────────────────────────
   Lieber klar ablehnen als an einer fremden Datei zerbrechen.

   SIE PRUEFTE LANGE KEINE ZAHLEN — und genau daran zerbrach sie (K2, gemessen,
   nicht vermutet):
     \`x: null\`   und \`x: "abc"\` wurden angenommen; three meldete danach
                 „Computed min/max have NaN values", das Blatt blieb leer.
     \`x: 1e8\`    warf MITTEN im Laden einen Bereichsfehler und hinterliess
                 einen halb geladenen Grundriss.
     \`x: 1e12\`   antwortete nach 68 400 ms immer noch nicht — der Browser
                 musste abgeschossen werden.
   Jede Ecke geht deshalb jetzt gegen \`Number.isFinite\` UND gegen eine Grenze.
   Die Grenze ist eine gesetzte Annahme, kein Messwert: ±100 000 cm ist ein
   Kilometer in jede Richtung und damit rund dreizehnmal die 78 m dieser Halle
   — weit genug fuer jeden ernst gemeinten Grundriss, eng genug, dass die
   Zeichenschleife nicht stehen bleibt. */
const KOORDINATE_MAX_CM = 100000;

/** Eine Zahl, die man zeichnen kann. Kein \`typeof === 'number'\`: NaN und
 *  Infinity sind das auch, und beide haben genau diesen Schaden angerichtet. */
function zahlOk(v, grenze){
  return Number.isFinite(v) && Math.abs(v) <= grenze;
}

function pruefePlan(roh){
  let d;
  try { d = JSON.parse(roh); } catch (e) { return { fehler: 'Das ist keine lesbare JSON-Datei.' }; }
  const fp = d && d.floorplan ? d.floorplan : d;
  if (!fp || typeof fp !== 'object' || !fp.corners || typeof fp.corners !== 'object' || !Array.isArray(fp.walls)) {
    return { fehler: 'Diese Datei ist kein Grundriss — es fehlen „corners“ und „walls“.' };
  }
  /* Ecken: Zahl, endlich, im Rahmen. Die erste unbrauchbare wird BENANNT —
     „irgendwo steckt ein Fehler" hilft niemandem beim Nachsehen. */
  for (const id of Object.keys(fp.corners)) {
    const c = fp.corners[id];
    if (!c || typeof c !== 'object' || !zahlOk(c.x, KOORDINATE_MAX_CM) || !zahlOk(c.y, KOORDINATE_MAX_CM)) {
      return { fehler: 'Diese Datei hat eine unbrauchbare Ecke (' + id.slice(0, 8) +
        ': x=' + JSON.stringify(c && c.x) + ', y=' + JSON.stringify(c && c.y) +
        '). Erlaubt sind Zahlen zwischen −' + KOORDINATE_MAX_CM + ' und ' +
        KOORDINATE_MAX_CM + ' cm. Es wird NICHTS geladen.' };
    }
  }
  /* Waende: beide Ecken muessen es wirklich geben. Der Kern ueberspringt eine
     Wand mit fehlender Ecke zwar (mit Warnung auf der Konsole), aber dann
     zeigte die Datei stillschweigend weniger, als der Nutzer gab. */
  for (let i = 0; i < fp.walls.length; i++) {
    const w = fp.walls[i];
    if (!w || typeof w !== 'object' || !fp.corners[w.corner1] || !fp.corners[w.corner2]) {
      return { fehler: 'Wand ' + (i + 1) + ' dieser Datei hängt an einer Ecke, die es nicht gibt. Es wird NICHTS geladen.' };
    }
  }
  /* Ausstattung und Oeffnungen: dieselbe Frage, andere Felder. Ein Moebel mit
     \`breite: null\` faellt sonst erst im Zeichner auf — als leeres Blatt. */
  const listen = [
    { name: 'Ausstattung', liste: fp.ausstattung, felder: ['x', 'y', 'breite', 'tiefe'] },
    { name: 'Öffnung', liste: fp.oeffnungen, felder: ['lage', 'breite'] }
  ];
  for (const l of listen) {
    if (l.liste === undefined || l.liste === null) continue;
    if (!Array.isArray(l.liste)) return { fehler: '„' + l.name + '" ist in dieser Datei keine Liste. Es wird NICHTS geladen.' };
    for (let i = 0; i < l.liste.length; i++) {
      const e = l.liste[i];
      if (!e || typeof e !== 'object') {
        return { fehler: l.name + ' ' + (i + 1) + ' dieser Datei ist unbrauchbar. Es wird NICHTS geladen.' };
      }
      for (const f of l.felder) {
        if (!zahlOk(e[f], KOORDINATE_MAX_CM)) {
          return { fehler: l.name + ' ' + (i + 1) + ' dieser Datei hat ein unbrauchbares Maß (' +
            f + '=' + JSON.stringify(e[f]) + '). Es wird NICHTS geladen.' };
        }
      }
    }
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
  return {
    floorplan: fp,
    labels: Array.isArray(d.labels) ? d.labels : null,
    // G4: die 3D-Moebel des Planer-Formats werden DURCHGEREICHT, nicht gelesen.
    items: Array.isArray(d.items) ? d.items : null,
    ecken: eckenZahl,
    waende: fp.walls.length
  };
}

/* ── Bedienung: Grundriss ──────────────────────────────────────────── */
const werkzeugKnopf = { };
werkzeugKnopf[floorplannerModes.MOVE] = el('wzMove');
werkzeugKnopf[floorplannerModes.WAND] = el('wzWand');
werkzeugKnopf[floorplannerModes.DRAW] = el('wzDraw');
werkzeugKnopf[floorplannerModes.DELETE] = el('wzDelete');
werkzeugKnopf[floorplannerModes.OEFFNUNG] = el('wzOeffnung');

el('wzMove').addEventListener('click', function(){ zeichner.setMode(floorplannerModes.MOVE); });
el('wzWand').addEventListener('click', function(){ zeichner.setMode(floorplannerModes.WAND); });
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
  /* Die Arten-Gruppe wird mit ihrem Werkzeug BEDIENBAR — ihr Platz bleibt
     dauerhaft reserviert (V7, s. \`.grp.platzhalter\` im CSS). \`inert\` nimmt
     Klick und Tab-Reihenfolge, \`aria-hidden\` die Ansage; beides zusammen mit
     \`visibility:hidden\`, damit nicht drei Angaben auseinanderlaufen koennen. */
  const artenAn = m === floorplannerModes.OEFFNUNG;
  const arten = el('oeffnungsArten');
  arten.classList.toggle('platzhalter', !artenAn);
  arten.inert = !artenAn;
  arten.setAttribute('aria-hidden', String(!artenAn));
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
    /* Q und E gibt es am Handy nicht — dort wird der Anschlag (noch) gar nicht
       gewendet, und ihn zu nennen waere ein Versprechen ohne Deckung. Was
       stattdessen dort steht, ist wahr und nuetzlich: dass es rueckgaengig
       geht. Das Wenden per Finger bleibt offen (s. CLAUDE.md, W8). */
    meldung((OEFFNUNG_NAME[o.art] || o.art) + ' gesetzt — frei gesetzt, kein Aufmaß. ' +
      (schmal() ? '' : 'Q wendet den Anschlag, E die Aufschlagseite. ') +
      rueckgaengigSatz(), false);
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

/* ══════════ ANFASSEN STATT WERKZEUGKUNDE (W13) ══════════════════════════

   Der Nutzerbefund aus W12 war „ich kann die waende immer noch nicht bewegen",
   obwohl das Wand-Werkzeug seit W10 da war und seit W12b zog. Gebaut war es,
   GEFUNDEN wurde es nicht. Hier steht die andere Haelfte der Loesung: der Kern
   sagt, WAS unter dem Finger liegt und was damit geht (\`objektUnter\`), diese
   Datei zeigt es und fuehrt es aus.

   Die Werkzeugleiste bleibt unangetastet. Sie ist nicht der Fehler — sie ist
   schneller, wenn man dasselbe zehnmal tut. Der Fehler war, dass sie der
   EINZIGE Weg war. */
const objektMenue = el('objektMenue');
const objektMenueListe = el('objektMenueListe');
let menueStand = null;

/* Wo das Menue stehen darf. Es folgt dem Griffpunkt, bleibt aber IM Bild:
   ein Menue, dessen untere Haelfte unter dem Fensterrand liegt, ist am Handy
   der Normalfall und nicht der Sonderfall (die Werkzeugleiste steht unten, und
   dort tippt man). Gemessen wird nach dem Einblenden an der wirklichen Groesse
   — geschaetzt traefe es nur bei einer festen Zahl von Eintraegen. */
function menueSetzen(screenX, screenY){
  const rand = 10;
  objektMenue.style.left = '0px';
  objektMenue.style.top = '0px';
  objektMenue.hidden = false;
  const kasten = objektMenue.getBoundingClientRect();
  const plan = el('grundriss-canvas').getBoundingClientRect();
  /* Der Griffpunkt kommt in Canvas-Koordinaten (\`convertX/convertY\`), das
     Menue liegt \`fixed\` am Fenster — ohne den Versatz des Canvas saesse es um
     die Kopfleiste daneben. */
  let x = plan.left + screenX + 14;
  let y = plan.top + screenY + 14;
  if (x + kasten.width > window.innerWidth - rand) x = plan.left + screenX - kasten.width - 14;
  if (x < rand) x = rand;
  if (y + kasten.height > window.innerHeight - rand) y = window.innerHeight - kasten.height - rand;
  if (y < rand) y = rand;
  objektMenue.style.left = Math.round(x) + 'px';
  objektMenue.style.top = Math.round(y) + 'px';
}

function menueZu(){
  objektMenue.hidden = true;
  objektMenueListe.textContent = '';
  menueStand = null;
}

/* Ein Eintrag ist eine ganze Zeile: Text oben, Begruendung klein darunter.
   Die Begruendung steht IM Eintrag und nicht in einem Titel-Attribut — am
   Handy gibt es kein Schweben, und ein Hinweis, den man nur mit der Maus
   sieht, ist am Telefon kein Hinweis (dieselbe Lehre wie bei den
   Tasten-Versprechen, W8). */
function menueEintragBauen(e, tun){
  if (!e.handlung){
    const zeile = document.createElement('div');
    zeile.className = 'auskunft';
    zeile.textContent = e.text + (e.hinweis ? ' — ' + e.hinweis : '');
    return zeile;
  }
  const knopf = document.createElement('button');
  knopf.type = 'button';
  knopf.className = 'eintrag' + (e.ernst ? ' ernst' : '');
  knopf.dataset.handlung = e.handlung;
  knopf.appendChild(document.createTextNode(e.text));
  if (e.hinweis){
    const zusatz = document.createElement('span');
    zusatz.className = 'zusatz';
    zusatz.textContent = e.hinweis;
    knopf.appendChild(zusatz);
  }
  knopf.addEventListener('click', function(){ tun(e); });
  return knopf;
}

/* Der Kern meldet das Menue — und nimmt es mit \`null\` auch selbst zurueck.
   Diese Datei entscheidet NIE selbst, wann es zugeht: Escape, ein neuer Griff
   und der Werkzeugwechsel laufen alle durch den Kern, und zwei Stellen, die
   unabhaengig ueber dasselbe Fenster bestimmen, liefen auseinander (dieselbe
   Festlegung wie bei der Loesch-Rueckfrage, E1). */
zeichner.addMenueAnfrageCallback(function(anfrage){
  if (!anfrage) { menueZu(); return; }
  menueStand = anfrage;
  el('objektMenueTitel').textContent = anfrage.menue.titel;
  const hinweisEl = el('objektMenueHinweis');
  hinweisEl.textContent = anfrage.menue.hinweis || '';
  hinweisEl.hidden = !anfrage.menue.hinweis;
  objektMenueListe.textContent = '';
  for (const e of anfrage.menue.eintraege){
    objektMenueListe.appendChild(menueEintragBauen(e, function(gewaehlt){
      menueHandlung(gewaehlt, anfrage);
    }));
  }
  menueSetzen(anfrage.screenX, anfrage.screenY);
});

el('objektMenueZu').addEventListener('click', function(){ zeichner.menueSchliessen(); });

/* Eine weitere Stufe IM Menue statt eines neuen Fensters.

   Zusammenlegen braucht zwei Angaben mehr (Nutzung, dann Bestaetigung), und
   jede haette ein eigenes Fenster bekommen koennen. Sie bleiben hier, weil das
   Menue schon am richtigen Ort steht: es klebt an den beiden Raeumen, um die
   es geht. Ein Fenster unten mittig verloere genau diese Verbindung — bei drei
   Raeumen nebeneinander wuesste danach niemand mehr, welche zwei gemeint sind. */
function menueStufe(titel, hinweis, eintraege){
  el('objektMenueTitel').textContent = titel;
  const hinweisEl = el('objektMenueHinweis');
  hinweisEl.textContent = hinweis || '';
  hinweisEl.hidden = !hinweis;
  objektMenueListe.textContent = '';
  for (const e of eintraege){
    objektMenueListe.appendChild(menueEintragBauen(e, function(){ e.tun && e.tun(); }));
  }
  if (menueStand) menueSetzen(menueStand.screenX, menueStand.screenY);
}

function raumNach(key){
  for (const r of grundriss.getRooms()) if (r.getUuid() === key) return r;
  return null;
}

/* ── Zwei Raeume zusammenlegen, in drei Schritten ────────────────────────
   1. Nutzung waehlen  2. die Zahlen ansehen  3. bestaetigen.

   Der zweite Schritt ist der eigentliche: \`planeZusammenlegen\` VERAENDERT
   NICHTS und beschreibt nur (W12). Genau diese Beschreibung steht dem Nutzer
   vor Augen, bevor er zustimmt — und dieselbe wird danach angewendet. Zwei
   getrennte Rechnungen liefen auseinander, und dann zeigte die Vorschau etwas
   anderes, als hinterher dasteht. */
function verbindenBeginnen(ziel){
  const raumA = raumNach(ziel.raumA);
  const raumB = raumNach(ziel.raumB);
  if (!raumA || !raumB){
    meldung('Diese beiden Räume gibt es nicht mehr — der Plan hat sich geändert.', true);
    zeichner.menueSchliessen();
    return;
  }
  const arten = nutzungsArten();
  menueStufe(
    'Wozu soll der neue Raum dienen?',
    'Die Wahl räumt passend ein — Matten, Geräte oder Liegen. „Nur leer räumen" stellt nichts hin.',
    arten.map(function(a){
      return { handlung: 'nutzung', text: a.name, tun: function(){ verbindenZeigen(raumA, raumB, a.schluessel); } };
    })
  );
}

function verbindenZeigen(raumA, raumB, nutzung){
  let vorschlag = null;
  try {
    vorschlag = planeZusammenlegen(grundriss, raumA, raumB, { nutzung: nutzung });
  } catch (e) {
    meldung('Das lässt sich nicht rechnen: ' + (e && e.message ? e.message : e), true);
    zeichner.menueSchliessen();
    return;
  }
  if (!vorschlag || !vorschlag.moeglich){
    /* Der Grund kommt aus der Rechnung und steht in Alltagssprache da (W12) —
       er wird hier NICHT umformuliert. */
    menueStufe('Das geht hier nicht', vorschlag && vorschlag.grund ? vorschlag.grund : 'Kein Grund angegeben.',
      [{ handlung: 'zu', text: 'Verstanden', tun: function(){ zeichner.menueSchliessen(); } }]);
    return;
  }

  /* Was verloren geht, steht VOR der Zustimmung da und nicht danach. Die
     Zahlen kommen alle aus dem Vorschlag — keine wird hier nachgerechnet. */
  const teile = [];
  teile.push('Neuer Raum: ' + vorschlag.flaecheM2.toFixed(1).replace('.', ',') + ' m²');
  teile.push((vorschlag.waendeEntfernen.length === 1 ? '1 Wandstück fällt' : vorschlag.waendeEntfernen.length + ' Wandstücke fallen'));
  if (vorschlag.gemessenEntfernt > 0){
    teile.push('davon ' + vorschlag.gemessenEntfernt + ' GEMESSEN — Umbau, kein Aufmaß');
  }
  if (vorschlag.oeffnungenEntfallen && vorschlag.oeffnungenEntfallen.length > 0){
    teile.push(vorschlag.oeffnungenEntfallen.length === 1
      ? '1 Tür/Fenster entfällt'
      : vorschlag.oeffnungenEntfallen.length + ' Türen/Fenster entfallen');
  }
  if (vorschlag.moebelVerschieben && vorschlag.moebelVerschieben.length > 0){
    teile.push(vorschlag.moebelVerschieben.length + ' Möbel rücken zur Seite');
  }
  if (vorschlag.moebelNeu && vorschlag.moebelNeu.length > 0){
    teile.push(vorschlag.moebelNeu.length + ' Stück werden hingestellt');
  }
  if (vorschlag.statikHinweis){
    teile.push(vorschlag.statikHinweis);
  }

  /* Abbrechen ZUERST — die folgenreiche Wahl darf nicht die bequemste sein
     (E1, und es ist dieselbe Reihenfolge wie in jeder Rueckfrage dieser Datei). */
  menueStufe('Wirklich verbinden?', teile.join(' · '), [
    { handlung: 'ab', text: 'Abbrechen', tun: function(){ zeichner.menueSchliessen(); } },
    { handlung: 'los', text: 'Räume verbinden', ernst: true, tun: function(){ verbindenAusfuehren(vorschlag); } }
  ]);
}

function verbindenAusfuehren(vorschlag){
  /* EIN Rueckgaengig-Schritt fuer die ganze Handlung — der Schnappschuss wird
     gezogen, BEVOR etwas geschieht, und danach nie wieder (dieselbe Regel wie
     bei jedem Zug, W2 Festlegung 3). */
  undo.snapshot();
  let ergebnis = null;
  try {
    ergebnis = wendeAn(grundriss, vorschlag);
  } catch (e) {
    meldung('Das Verbinden ist fehlgeschlagen: ' + (e && e.message ? e.message : e), true);
    zeichner.menueSchliessen();
    return;
  }
  zeichner.menueSchliessen();
  /* GEMESSEN und nicht behauptet: \`raeumeNachher\` kommt vom Kern selbst
     (\`floorplan.getRooms().length\` nach dem Anwenden). Ein „erledigt" ohne
     diese Zahl waere die Behauptung des Werkzeugs ueber sich selbst. */
  meldung(
    'Verbunden — der Plan zählt jetzt ' + ergebnis.raeumeNachher + ' Räume. ' +
    ergebnis.waendeEntfernt.length + ' Wandstück(e) entfernt' +
    (ergebnis.moebelNeu.length ? ', ' + ergebnis.moebelNeu.length + ' Stück eingerichtet' : '') +
    '. Rückgängig macht es zurück.'
  );
}

/* Was ein Menue-Eintrag AUSLOEST.

   Die Werkzeugwechsel hier sind kein Rueckfall in die Werkzeugkunde: der
   Nutzer hat das Ding bereits angefasst und die Handlung benannt — dass der
   Kern intern in einen Modus geht, ist eine Umsetzungsfrage. Was er dazu
   SAGEN muss, sagt die Meldung: „ziehen Sie jetzt". Ohne diesen Satz stuende
   der Nutzer vor einem Plan, in dem sich unsichtbar etwas geaendert hat. */
function menueHandlung(eintrag, anfrage){
  const art = anfrage.menue.art;
  const id = anfrage.menue.id;
  switch (eintrag.handlung){
    case 'raeume-verbinden':
      verbindenBeginnen(eintrag.ziel);
      return;

    case 'wand-ziehen':
    case 'ecke-ziehen':
      zeichner.setMode(floorplannerModes.WAND);
      meldung('Wände verschieben ist an — ziehen Sie die Wand jetzt quer zu ihrer Richtung.');
      return;

    case 'wand-oeffnung':
      zeichner.setMode(floorplannerModes.OEFFNUNG);
      meldung('Türen & Fenster ist an — zeigen Sie auf die Wand, ein Klick setzt.');
      return;

    case 'wand-loeschen':
      zeichner.menueSchliessen();
      if (!zeichner.loeschVorschlagenFuer('wand', id)) meldung('Diese Wand gibt es nicht mehr.', true);
      return;

    case 'oeffnung-loeschen':
      zeichner.menueSchliessen();
      if (!zeichner.loeschVorschlagenFuer('oeffnung', id)) meldung('Diese Öffnung gibt es nicht mehr.', true);
      return;

    case 'oeffnung-ziehen':
      zeichner.setMode(floorplannerModes.OEFFNUNG);
      meldung('Türen & Fenster ist an — ziehen Sie die Öffnung an ihrer Wand entlang.');
      return;

    case 'oeffnung-anschlag':
    case 'oeffnung-seite':
      /* Q und E wenden die AKTIVE Oeffnung. Aus dem Menue heraus gibt es keine
         aktive — der Zeiger hat sie auf dem Weg hierher verlassen. Also wird
         sie ueber ihre Kennung wieder zur aktiven gemacht, und erst dann
         gewendet: es bleibt EINE Wende-Rechnung (W4), nur ein anderer Weg
         dorthin. */
      zeichner.menueSchliessen();
      if (!zeichner.wendeOeffnungNachKennung(id, eintrag.handlung === 'oeffnung-anschlag' ? 'anschlag' : 'seite')){
        meldung('Diese Öffnung gibt es nicht mehr.', true);
      }
      return;

    case 'moebel-ziehen':
      zeichner.setMode(floorplannerModes.MOVE);
      meldung('Möbel verschieben ist an — ziehen Sie das Stück an seinen Platz.');
      return;

    case 'moebel-drehen-links':
    case 'moebel-drehen-rechts':
      /* Ueber \`dreheStueck(id, ...)\` und NICHT \`dreheAktives\`: das Stueck
         unter dem Zeiger ist auf dem Weg zum Menue-Eintrag verlorengegangen.
         Am Handy ist DAS hier der einzige Weg zu drehen — es gibt dort kein
         Q und kein E (W8). */
      if (!zeichner.dreheStueck(id, eintrag.handlung === 'moebel-drehen-links' ? -1 : 1)){
        meldung('Dieses Stück gibt es nicht mehr.', true);
        zeichner.menueSchliessen();
      }
      return;

    case 'moebel-loeschen':
      zeichner.menueSchliessen();
      if (!zeichner.loeschStueckVorschlagen(id)) meldung('Dieses Stück gibt es nicht mehr.', true);
      return;

    case 'raum-einrichten':
      /* Es gibt hier bewusst KEINEN eigenen Einricht-Ablauf: die Palette links
         tut das bereits, und ein zweiter Weg zum selben Ziel waere eine zweite
         Bedienidee fuer dieselbe Sache. Der Eintrag sagt, WO es steht — das
         war der ganze Befund von W13 (gebaut, aber nicht gefunden). */
      zeichner.menueSchliessen();
      meldung('Ziehen Sie ein Stück aus der Palette links in den Raum — Matte, Gerät oder Liege.');
      return;

    default:
      zeichner.menueSchliessen();
  }
}

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

/* Der Zug beginnt — EINE Fassung fuer Maus und Finger. Was die beiden
   unterscheidet, ist allein die Frage, WO der Punkt steht; alles danach ist
   dasselbe. Zwei Fassungen waeren zwei Antworten auf „wo landet das Stueck". */
function paletteZugBeginnen(ziel, x, y){
  const knopf = ziel && ziel.closest ? ziel.closest('.pstueck') : null;
  if (!knopf) return false;
  const v = vorlageFuer(knopf.dataset.typ);
  if (!v) return false;
  paletteZug = v;
  knopf.classList.add('zieht');
  geistZeigen(x, y, AUSSTATTUNG_NAME[v.typ] || v.typ);
  return true;
}

palette.addEventListener('mousedown', function(e){
  // Ohne das startet der Browser sein eigenes Ziehen (Bild/Auswahl) und
  // verschluckt die weiteren Maus-Ereignisse.
  if (paletteZugBeginnen(e.target, e.clientX, e.clientY)) e.preventDefault();
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

/* ── Die Palette MIT DEM FINGER (Handy-Welle) ────────────────────────
   Bis hierher lief das Hineinziehen ausschliesslich ueber Maus-Ereignisse,
   und die Palette war unter 900 px darum ausgeblendet: ein Finger loest sie
   erst beim Loslassen aus (die Maus-Emulation kommt nach dem \`touchend\`),
   der Zug waere also nicht zu verfolgen gewesen — man haette blind gezielt.

   Warum \`touch*\` und nicht \`pointer*\`: der KERN hoert am Canvas
   \`touchstart\` ab und ruft dort \`preventDefault\`, gerade damit KEINE
   Maus-Emulation nachkommt (E3). Beide Welten muessen dieselbe Sprache
   sprechen, sonst zaehlt ein Loslassen ueber der Zeichenflaeche zweimal.

   \`preventDefault\` beim Aufsetzen ist Bedingung, nicht Feinheit: ohne es
   scrollt der Browser die Palette, sobald der Finger sie verlaesst, und der
   Zug bricht mitten in der Bewegung ab. */
palette.addEventListener('touchstart', function(e){
  if (e.touches.length !== 1) {
    /* Ein zweiter Finger heisst „zoomen" und ist kein Ablegen — dieselbe Regel
       wie im Kern (\`fingerStart\`) und im Blatt. Der angefangene Zug wird
       VERWORFEN und nicht etwa beim naechsten Abheben ausgefuehrt: sonst legte
       eine Zoom-Geste ein Stueck dorthin, wo zufaellig ein Finger abhob. */
    paletteZugAbbrechen();
    return;
  }
  const t = e.touches[0];
  if (paletteZugBeginnen(t.target, t.clientX, t.clientY)) e.preventDefault();
}, { passive: false });

document.addEventListener('touchmove', function(e){
  if (!paletteZug || e.touches.length !== 1) return;
  e.preventDefault();
  geistBewegen(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: false });

document.addEventListener('touchend', function(e){
  if (!paletteZug) return;
  const v = paletteZug;
  paletteZugAbbrechen();
  /* \`changedTouches\` und nicht \`touches\`: der abgehobene Finger steht in
     \`touches\` nicht mehr drin — dort waere die Liste leer und der Ablegepunkt
     unbekannt. */
  const t = e.changedTouches && e.changedTouches[0];
  if (t) stueckAblegen(v, t.clientX, t.clientY);
});

/* Ein zweiter Finger heisst „zoomen" und ist kein Ablegen — dieselbe Regel
   wie im Kern und im Blatt. Der Zug wird verworfen, nicht ausgefuehrt. */
document.addEventListener('touchcancel', paletteZugAbbrechen);

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
    rueckgaengigSatz(), false);
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
/* ── Laden (K1) ─────────────────────────────────────────────────────
   Eine geprueft gute Datei wird NICHT sofort eingespielt, sondern erst
   angeboten. Der Grund ist gemessen: das alte „Laden" ersetzte 292 Stück und
   100 Wände durch 0 und 4, leerte die Historie (\`kannZurueck() === false\`) und
   ueberschrieb sofort den Speicher — es gab keinen Weg zurueck. Ausgerechnet
   das viel harmlosere „Zuruecksetzen" fragte seit jeher nach. */
let ladeWartet = null;

el('btnImport').addEventListener('click', function(){ dateiWahl.value = ''; dateiWahl.click(); });
dateiWahl.addEventListener('change', function(){
  const datei = dateiWahl.files && dateiWahl.files[0];
  if (!datei) return;
  const leser = new FileReader();
  leser.onerror = function(){ meldung('Die Datei ließ sich nicht lesen.', true); };
  leser.onload = function(){
    const geprueft = pruefePlan(String(leser.result));
    // Eine unbrauchbare Datei wird gar nicht erst angeboten: eine Rueckfrage
    // ueber etwas, das ohnehin abgelehnt wird, waere reine Umstaendlichkeit.
    if (geprueft.fehler) { ladeWartet = null; meldung(geprueft.fehler, true); return; }
    ladeWartet = { floorplan: geprueft.floorplan, labels: geprueft.labels, items: geprueft.items, name: datei.name };
    el('ladeFrageText').textContent = '„' + datei.name + '" (' + geprueft.ecken +
      ' Ecken, ' + geprueft.waende + ' Wände) ersetzt deinen jetzigen Stand' +
      (gesichertAm ? ' vom ' + new Date(gesichertAm).toLocaleDateString('de-DE') : '') + '.';
    frageZeigen(el('ladeFrage'));
    el('btnLadeNein').focus();
  };
  leser.readAsText(datei);
});

function ladeAbbrechen(){
  el('ladeFrage').hidden = true;
  ladeWartet = null;
  meldung('Nichts geladen — dein Stand ist unverändert.', false);
}

function ladeBestaetigen(){
  el('ladeFrage').hidden = true;
  const w = ladeWartet;
  ladeWartet = null;
  if (!w) return;
  try {
    if (Array.isArray(w.items)) items = w.items;
    ladeGrundriss(w.floorplan, w.labels, true);
  } catch (e) {
    meldung('Diese Datei ließ sich nicht öffnen (' + ((e && e.message) ? e.message : String(e)) +
      '). Dein Stand ist unverändert.', true);
    return;
  }
  /* G2 — GEZAEHLT WIRD AM MODELL, nicht in der Datei. Die alte Meldung erzaehlte
     das JSON nach und meldete „1 Wände", waehrend der Kern null geladen hatte
     (eine Wand mit fehlender Ecke ueberspringt er). Eine Meldung, die die
     Eingabe wiederholt statt das Ergebnis zu messen, ist eine Behauptung. */
  meldung('Geladen: ' + grundriss.getCorners().length + ' Ecken, ' +
    grundriss.getWalls().length + ' Wände aus „' + w.name + '".', false);
}

el('btnLadeNein').addEventListener('click', ladeAbbrechen);
el('btnLadeJa').addEventListener('click', ladeBestaetigen);

el('btnZurueck').addEventListener('click', function(){ zurueckFrageZeigen(); });
el('btnZurueckNein').addEventListener('click', function(){ zurueckFrage.hidden = true; });
el('btnZurueckJa').addEventListener('click', function(){ zurueckFrage.hidden = true; zuruecksetzen(); });
el('btnStandZurueck').addEventListener('click', function(){
  /* Die Rueckfrage \`#zurueckFrage\` liegt IM Grundriss-Umschlag und erbt dessen
     Sichtbarkeit. Bis W7 kam sie mit \`setzeBearbeiten(true)\` nach vorn, weil
     der Schalter die Ansicht mitzog; seit er das nicht mehr tut, muss dieser
     Weg es ausdruecklich tun — sonst fragte hier etwas Unsichtbares. Dieser
     Knopf sitzt in der Standleiste und ist auch in der Axonometrie zu
     erreichen, der Fall ist also echt und nicht theoretisch. */
  zeigeAnsicht('plan', true);
  /* W11-NACHTRAG (Gegner-Fund F4): Hier stand \`if (!bearbeiten)
     setzeBearbeiten(true, true)\` — OHNE Blick auf das Schloss. Gemessen: nach
     einem Neuladen mit zugefallenem Schloss genuegte ein Klick auf diesen
     Knopf, und danach liess sich ein Moebel um 7,7 m ziehen, ohne dass je ein
     Passwort gefallen waere. Die Datei behauptete an anderer Stelle „ohne
     Passwort ist auch die volle Fassung nur eine Ansicht"; das galt nicht.

     Die Lehre ist allgemeiner als der eine Knopf: ein Schloss darf nicht an
     EINER Stelle geprueft werden, sondern muss an jedem Weg zum
     Bearbeiten-Zustand liegen. \`setzeBearbeiten(true)\` ist dieser Zustand —
     jeder Aufruf mit \`true\` gehoert deshalb durch \`bearbeitenGewuenscht()\`
     oder nach einem \`werkstattOffen\`-Test. */
  if (!bearbeiten) {
    if (!werkstattOffen) { bearbeitenGewuenscht(); return; }
    setzeBearbeiten(true, true);
  }
  zurueckFrageZeigen();
});

/* Tastatur: Rueckgaengig/Wiederholen macht die HUELLE. Escape registriert der
   KERN selbst auf dem Dokument (floorplanner.ts:493-497) — hier waere es
   doppelt. Eingabefelder bleiben unberuehrt. */
addEventListener('keydown', function(e){
  const z = e.target;
  if (z && (z.tagName === 'INPUT' || z.tagName === 'TEXTAREA' || z.isContentEditable)) return;
  // K3: im Lese-Zustand aendert auch die Tastatur nichts. Die Zeichenflaeche
  // ist dort ohnehin taub — ein Strg+Z waere die einzige Tuer, durch die sich
  // ein ruhiges Blatt noch verstellen liesse.
  if (!bearbeiten) return;
  if (!(e.ctrlKey || e.metaKey)) return;
  const taste = (e.key || '').toLowerCase();
  if (taste === 'z' && !e.shiftKey) { e.preventDefault(); undo.undo(); }
  else if (taste === 'y' || (taste === 'z' && e.shiftKey)) { e.preventDefault(); undo.redo(); }
});

/* ── Drehen und Loeschen IM BLATT (W7) ──────────────────────────────
   Dieselbe Regel wie im Grundriss: gewirkt wird immer auf das Stueck UNTER DEM
   ZEIGER. Es gibt in diesem Planer keine Auswahl, die einen Klick ueberdauert
   — ein Knopf in der Leiste braeuchte eine, denn auf dem Weg dorthin verlaesst
   der Zeiger das Moebel.

   IN DER FANG-PHASE (\`true\`) und mit \`stopPropagation\`, und das ist kein
   Feinschliff: der KERN hoert Q und E ebenfalls am Dokument ab und wirkt dabei
   auf \`activeAusstattung\` — das ist der letzte Treffer im GRUNDRISS und bleibt
   liegen, wenn der Zeiger die Flaeche verlaesst. Ohne diesen Riegel drehte ein
   Q im Blatt ein Stueck, das man gar nicht sieht. Solange die Axonometrie vorn
   ist, gehoeren diese Tasten ihr — auch dann, wenn gerade nichts darunter
   liegt.

   \`Entf\` ist NEU und die einzige Taste, die dieses Blatt zusaetzlich lernt. Sie
   loescht nicht, sie FRAGT: \`loeschStueckVorschlagen\` setzt denselben Kandidaten,
   den das Verweilen im Grundriss setzt, und dieselbe Rueckfrage erscheint.
   BEKANNTE GRENZE: am Handy gibt es keine Tastatur — dort bleibt das Blatt beim
   Ziehen. Dieselbe offene Stelle wie Q/E im Grundriss seit W2. */
document.addEventListener('keydown', function(e){
  if (ansicht !== 'axo' || !bearbeiten) return;
  const z = e.target;
  if (z && (z.tagName === 'INPUT' || z.tagName === 'TEXTAREA' || z.isContentEditable)) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const taste = (e.key || '').toLowerCase();
  if (taste !== 'q' && taste !== 'e' && taste !== 'delete') return;
  // Der Riegel gegen den Kern gilt IMMER, auch ohne Treffer.
  e.stopPropagation();
  const id = axoAnsicht ? axoAnsicht.unterZeiger : null;
  if (!id) return;
  e.preventDefault();
  if (taste === 'delete') {
    zeichner.loeschStueckVorschlagen(id);
    return;
  }
  if (zeichner.dreheStueck(id, taste === 'q' ? -1 : 1)) {
    const stueck = grundriss.findeAusstattung(id);
    if (stueck) axoAnsicht.tauscheKoerper(id, ausstattungsKoerper(stueck, HOEHEN)[0]);
    bemerkeAenderung();
  }
}, true);

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
el('btnAnsichtAxo').addEventListener('click', function(){ zeigeAnsicht('axo', true); });
el('btnAnsichtPlan').addEventListener('click', function(){ zeigeAnsicht('plan', true); });
el('btnBearbeiten').addEventListener('click', bearbeitenGewuenscht);
el('btnSchlossJa').addEventListener('click', schlossVersuchen);
el('btnSchlossNein').addEventListener('click', function(){
  el('schlossFrage').hidden = true;
  el('schlossWort').value = '';
});
/* Die Eingabetaste im Feld. Ohne sie tippt man das Passwort und drueckt Enter
   ins Leere — die vertrauteste Bewegung ueberhaupt bei einem Passwortfeld.
   \`Escape\` schliesst, wie bei jeder anderen Rueckfrage dieser Datei auch. */
el('schlossWort').addEventListener('keydown', function(ev){
  if (ev.key === 'Enter') { ev.preventDefault(); schlossVersuchen(); }
  else if (ev.key === 'Escape') { ev.preventDefault(); el('schlossFrage').hidden = true; el('schlossWort').value = ''; }
});

/* ── Zwei Fenster: die Wahl (K4) ────────────────────────────────────── */
el('btnFremdLaden').addEventListener('click', function(){ location.reload(); });
el('btnFremdUebergehen').addEventListener('click', fremdUebergehen);

/* ══════════════════════════════════════════════════════════════════
   DAS SIEGEL — ist der Plan in dieser Datei noch der unterschriebene?

   WAS ES LEISTET UND WAS NICHT. Wer diese Datei besitzt, hat einen
   Texteditor; verhindern laesst sich nichts. Beweisen laesst sich alles:
   unterschrieben ist \`PLAN_TEXT\`, Zeichen fuer Zeichen, mit einem privaten
   Schluessel, der nirgends in dieser Datei steht. Hier liegt nur der
   OEFFENTLICHE Teil — mit ihm kann man pruefen und nichts herstellen. Wer ein
   Mass aendert, kann nicht neu unterschreiben. Wer stattdessen diese Pruefung
   herausschneidet, haelt eine Datei ohne Siegel in der Hand, und die ist
   erkennbar nicht das Original.

   FAIL-CLOSED. Jeder Weg, der nicht in einer bestandenen Pruefung endet —
   fehlendes Siegel, fehlendes \`crypto.subtle\`, ein Fehler unterwegs — sagt
   ausdruecklich, dass er NICHTS bestaetigt. Ein Siegel, das im Zweifel
   „in Ordnung" anzeigt, waere schaedlicher als keines.
   ══════════════════════════════════════════════════════════════════ */
const siegelStand = { fertig: false, echt: null, satz: 'Das Siegel wurde noch nicht geprüft.',
                      art: 'pruefend', zeichen: '&hellip;', wort: 'wird geprüft' };

/* Ist an dem, was hier ZU SEHEN ist, etwas verstellt?

   DAS IST DIE FALLE, DIE DIESE ZEILE SCHLIESST. Das Siegel bestaetigt den
   EINGEBAUTEN Plan — und der bleibt immer unangetastet, das ist die Doktrin
   dieser Datei. Angezeigt wird aber der Arbeitsstand aus dem Browser-Speicher,
   und der kann ein ganz anderer sein. Ohne diesen Zusatz stuende auf einem
   Ausdruck mit vier verschobenen Waenden „unterschrieben und geprueft" — ein
   wahrer Satz an der falschen Stelle, und das ist schlimmer als eine Luege,
   weil er sich nicht widerlegen laesst.

   ABGELESEN statt nachgerechnet: die drei Zaehler im Blattkopf sind bereits die
   eine Quelle dafuer, was verstellt ist. Eine zweite Rechnung koennte
   auseinanderlaufen — und dann widerspraeche das Siegel dem Kopf zwei Zeilen
   ueber sich. */
function eigeneAenderungen(){
  /* W11-NACHTRAG (Gegner-Fund F3). Hier wurden bis zum Gegner-Review die DREI
     ZAEHLER im Blattkopf abgelesen. Die Begruendung war gut — eine zweite
     Rechnung koennte auseinanderlaufen — und die Folgerung trotzdem falsch:
     die Zaehler zaehlen \`quelle === 'gesetzt'\`, und sie zaehlen nur, was am
     eingebauten Plan FEHLT. Ein geladener Stand, dessen erfundene Waende das
     Feld schlicht weglassen, ist fuer sie unsichtbar (der Standard beim Laden
     ist 'gemessen'). GEMESSEN: 103 statt 100 Waende, 297 statt 289 Stuecke,
     ein umbenannter Raum — alle drei Zaehler blieben leer, und auf dem
     Ausdruck stand „beim Oeffnen geprueft, unveraendert".

     Ein Voll-Vergleich ist hier NICHT die zweite Rechnung, vor der die alte
     Begruendung warnte. Er ist die einzige, die zur Aussage passt: die Marke
     behauptet „das hier IST der unterschriebene Plan" — also muss sie genau
     das fragen und nicht „hat der Nutzer mit der Hand etwas getan".
     Die drei Zaehler bleiben, wofuer sie gebaut sind: die Bedienauskunft. */
  try {
    if (JSON.stringify(grundriss.saveFloorplan()) !== AUSLIEFERUNG_ABDRUCK) return true;
    if (JSON.stringify(labels || []) !== AUSLIEFERUNG_LABELS) return true;
    return false;
  } catch (e) {
    /* Fail-closed: laesst sich der Vergleich nicht fuehren, ist die ehrliche
       Antwort „ich weiss es nicht" — und die muss wie „geaendert" aussehen,
       nicht wie „unveraendert". */
    return true;
  }
}

function siegelZeigen(art, zeichen, wort, satz){
  siegelStand.fertig = true;
  siegelStand.echt = (art === 'echt');
  siegelStand.art = art; siegelStand.zeichen = zeichen; siegelStand.wort = wort; siegelStand.satz = satz;
  siegelMarkePflegen();
  /* Gegner-Fund M3: die Druckzeile wurde EINMAL beim Start gesetzt — da war die
     Pruefung noch nicht durch — und danach nur noch von beforeprint. Es gibt
     aber Druckwege ohne dieses Ereignis (gemessen: Playwright page.pdf()).
     Auf denen trug jedes Blatt dauerhaft „das Siegel war beim Drucken noch
     nicht geprueft" — eine Warnung, die im Normalfall erscheint, gewoehnt man
     sich ab, und dann schuetzt sie nichts mehr. */
  if (typeof druckZeileSetzen === 'function') druckZeileSetzen();
}

function siegelMarkePflegen(){
  const marke = el('siegelMarke');
  if (!marke) return;
  const verstellt = siegelStand.echt === true && eigeneAenderungen();
  marke.classList.remove('pruefend', 'gebrochen');
  if (siegelStand.art === 'pruefend') marke.classList.add('pruefend');
  else if (siegelStand.art !== 'echt') marke.classList.add('gebrochen');
  el('siegelZeichen').innerHTML = siegelStand.zeichen;
  el('siegelWort').textContent = verstellt ? 'gesiegelt · geändert' : siegelStand.wort;
  marke.setAttribute('title', verstellt
    ? siegelStand.satz + ' — ANGEZEIGT wird aber ein eigener Arbeitsstand mit Änderungen. Das Siegel gilt dem eingebauten Plan, nicht diesem Bild.'
    : siegelStand.satz);
  marke.dataset.art = verstellt ? 'echt-geaendert' : siegelStand.art;
}

/* Der FINGERABDRUCK des Schluessels, mit dem geprueft wurde (Gegner-Fund F1).

   Er wird HIER gerechnet, aus dem eingebauten Schluessel — nicht zur Bauzeit
   hineingeschrieben. Das ist der ganze Punkt: wer den Plan aendert und mit
   einem eigenen Paar neu unterschreibt, taeuscht die Pruefung, aber nicht den
   Abdruck. Dort steht dann SEIN Wert, und der passt nicht zu dem, den der
   Empfaenger auf einem anderen Weg bekommen hat.

   Aus einer Datei allein ist Herkunft nicht zu beweisen. Mit einem Anker
   ausserhalb schon — und diese Zeile ist das Ende des Ankers, das in der
   Datei liegt. */
let siegelAbdruck = null;
async function schluesselAbdruckRechnen(jwk){
  const fest = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y });
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fest));
  const hex = Array.from(new Uint8Array(h)).map(function(b){ return b.toString(16).padStart(2, '0'); }).join('');
  return hex.slice(0, 16).replace(/(.{4})(?=.)/g, '$1\\u00b7');
}

async function siegelPruefen(){
  if (!SIEGEL || !SIEGEL_SCHLUESSEL) {
    siegelZeigen('fehlt', '&#9888;', 'ohne Siegel',
      'Diese Datei trägt keine Unterschrift. Das Original von Halle 400 trägt eine — diese Datei ist also nicht das Original.');
    return;
  }
  if (!(window.crypto && window.crypto.subtle)) {
    siegelZeigen('unpruefbar', '?', 'nicht prüfbar',
      'Dieser Browser kann die Unterschrift nicht nachrechnen. Das heißt NICHT, dass sie in Ordnung ist — es heißt, dass hier niemand es weiß.');
    return;
  }
  try {
    const schluessel = await crypto.subtle.importKey('jwk',
      Object.assign({}, SIEGEL_SCHLUESSEL, { ext: true, key_ops: ['verify'] }),
      { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);
    const roh = atob(SIEGEL.signatur);
    const sig = new Uint8Array(roh.length);
    for (let i = 0; i < roh.length; i++) sig[i] = roh.charCodeAt(i);
    const echt = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' },
      schluessel, sig, new TextEncoder().encode(PLAN_TEXT));
    const wann = new Date(SIEGEL.signiertAm).toLocaleDateString('de-DE');
    siegelAbdruck = await schluesselAbdruckRechnen(SIEGEL_SCHLUESSEL);
    if (echt) {
      /* Der Satz sagt AUSDRUECKLICH, was er nicht weiss. „Original von Dania"
         waere zu viel behauptet: geprueft ist nur, dass der Plan seit der
         Unterschrift mit DIESEM Schluessel unveraendert ist. Ob es Danias
         Schluessel ist, entscheidet allein der Abdruck-Vergleich — und den kann
         eine Datei nicht fuer sich selbst fuehren. */
      siegelZeigen('echt', '&#10003;', 'gesiegelt ' + siegelAbdruck,
        'Unverändert seit der Unterschrift vom ' + wann + ' mit dem Schlüssel ' + siegelAbdruck +
        ' (angeblich: ' + SIEGEL.inhaber + '). Ob das wirklich dieser Schlüssel ist, sagt dir nur der ' +
        'Vergleich mit dem Fingerabdruck, den du auf einem ANDEREN Weg bekommen hast — nicht diese Datei.');
    } else {
      siegelZeigen('gebrochen', '&#9888;', 'VERÄNDERT',
        'Der Grundriss in dieser Datei passt NICHT zur Unterschrift vom ' + wann +
        '. Er wurde nachträglich verändert — diese Datei ist keine verlässliche Grundlage.');
      meldung('Achtung: Der eingebaute Grundriss passt nicht mehr zu seiner Unterschrift. ' +
        'Diese Datei ist nicht das Original von ' + SIEGEL.inhaber + '.', true);
    }
  } catch (e) {
    siegelZeigen('unpruefbar', '?', 'nicht prüfbar',
      'Die Unterschrift ließ sich nicht nachrechnen (' + ((e && e.name) ? e.name : String(e)) +
      '). Das ist KEINE Bestätigung — es ist eine offene Frage.');
  }
}
siegelPruefen();
// Der Satz gehoert auch aufs Papier: ein Ausdruck ohne ihn ist ein Blatt, dem
// man nichts ansieht — und genau in Papierform wandert dieser Plan zur Bank.
if (el('siegelMarke')) el('siegelMarke').addEventListener('click', function(){
  meldung(siegelStand.satz, siegelStand.echt === false);
});

/* ── Das Papier beschriften (M5) ────────────────────────────────────
   Datum und Massstabs-Aussage entstehen erst beim Drucken. Auf dem Bildschirm
   waeren sie Rauschen; auf einem Ausdruck OHNE Datum weiss in drei Wochen
   niemand mehr, ob er den aktuellen Stand in der Hand haelt. \`beforeprint\`
   und nicht beim Start: der Ausdruck traegt den Tag des Ausdrucks. */
function druckZeileSetzen(){
  const heute = new Date();
  el('druckZeile').textContent = 'Gedruckt am ' + heute.toLocaleDateString('de-DE') +
    ' · Axonometrie, nicht maßstäblich — die Maße oben sind gemessen · Plan vom ' + BAU_STEMPEL;
  // Das Siegel aufs Blatt. Nicht als Haken — auf Papier sagt ein Haken nichts,
  // weil man ihn hinmalen kann. Als SATZ mit Namen und Datum, und im schlechten
  // Fall als Warnung, die man nicht ueberliest.
  const dz = el('siegelDruck');
  if (dz) {
    if (siegelStand.echt === true) {
      const kopf = 'Unterschrieben am ' + new Date(SIEGEL.signiertAm).toLocaleDateString('de-DE') +
        ' mit dem Schlüssel ' + (siegelAbdruck || '?') + ' (angeblich ' + SIEGEL.inhaber + ')';
      if (eigeneAenderungen()) {
        // Das Siegel gilt dem eingebauten Plan. Dieses Blatt zeigt einen
        // Arbeitsstand darueber. Beides zu sagen ist die einzige ehrliche
        // Fassung — nur den Kopf zu drucken hiesse, mit einer wahren Zeile
        // eine falsche Aussage zu machen.
        dz.textContent = kopf + ' — ABER dieses Blatt zeigt einen bearbeiteten Stand, nicht den unterschriebenen Plan.';
        dz.classList.add('warnt');
      } else {
        dz.textContent = kopf + ' · beim Öffnen geprüft, unverändert — den Fingerabdruck bitte mit dem vergleichen, der getrennt mitgeteilt wurde';
        dz.classList.remove('warnt');
      }
    } else {
      dz.textContent = siegelStand.fertig
        ? 'OHNE GÜLTIGES SIEGEL — ' + siegelStand.satz
        : 'Das Siegel war beim Drucken noch nicht geprüft.';
      dz.classList.add('warnt');
    }
  }
}
addEventListener('beforeprint', druckZeileSetzen);
// Ohne diese Zeile bliebe die Zeile leer, wenn der Druck aus einem Werkzeug
// heraus ausgeloest wird, das \`beforeprint\` nicht feuert (gemessen: Playwright
// \`page.pdf()\` tut das nicht).
druckZeileSetzen();

/* ── Schutz beim Schliessen (M6) ────────────────────────────────────
   Das Sichern ist entprellt; zwischen dem letzten Zug und dem Schreiben liegen
   bis zu 600 ms (gemessen wurden 850 ms bis zum ersten Byte). Wer in dieser
   Luecke schliesst, verliert den Zug und erfaehrt es nie. Der Browser zeigt
   hier seinen eigenen Text — den kann eine Seite nicht bestimmen; der Riegel
   selbst ist das, was zaehlt. */
addEventListener('beforeunload', function(e){
  if (!ungesichert) return;
  e.preventDefault();
  // Aeltere Browser brauchen beides; der Wert wird nirgends angezeigt.
  e.returnValue = '';
  return '';
});

addEventListener('resize', function(){
  if (axoAnsicht && ansicht === 'axo') axoAnsicht.passeAn();
  /* Der Arbeitshinweis haengt seit der Handy-Welle an der BREITE (die Tasten
     Q/E/Entf gibt es dort nicht). Wer das Fenster ueber die 900-px-Grenze
     zieht, bekaeme sonst einen Satz zu lesen, der fuer die andere Anzeige
     geschrieben wurde. */
  arbeitshinweisPflegen();
});

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

/* ── Wo liegt sonst noch Arbeit? (M8, in W10 repariert) ──────────────
   Der Speicherschluessel traegt den Ablageort — noetig, weil \`file://\` EIN
   Ursprung fuer die ganze Festplatte ist und zwei Kopien sich sonst ins Gehege
   kaemen. Der Preis: wer die Datei in einen anderen Ordner schiebt, oeffnet ein
   leeres Blatt. Gemessen: 289 Stück waren weg, ohne einen einzigen Hinweis.

   WARUM DIE RETTUNG BIS W10 IM WICHTIGSTEN FALL NICHT AUSLOESTE — die Ursache,
   nicht das Symptom: der Abdruck des eingebauten Plans stand im SUCH-Praefix.
   Gesucht wurde also nur unter Staenden DERSELBEN Bau-Fassung. Genau die eine
   Groesse, die sich bei einem neuen Bau aendert (der Plan wird neu exportiert,
   \`PLAN_ABDRUCK\` kippt), war damit die Bedingung des Findens. Ergebnis,
   dreimal gemessen: ein Stand mit vier gesetzten Stuecken lag unberuehrt im
   Speicher, die Datei fand 0 und startete wortlos bei null. Die zweite Haelfte
   desselben Fehlers: \`standFragt\` — die Rueckfrage „dieser Stand passt nicht
   zum eingebauten Plan" — kann so gar nicht ausloesen, denn was unter DIESEM
   Schluessel liegt, hat zwangslaeufig DIESEN Abdruck. Ein Waechter, der nur
   den Fall bewacht, den es nicht geben kann.

   Gesucht wird darum jetzt ueber \`STAND_PRAEFIX\` — ALLE Staende dieser Datei,
   gleich welcher Plan-Abdruck und gleich welcher Ablageort. Angeboten wird
   RUHIG und vollstaendig, geladen wird nichts von selbst: welche Kopie gilt,
   weiss nur der Nutzer. Der alte Stand bleibt liegen — hier entstuende eine
   Kopie, dort verschwindet nichts. */
function alleStaende(){
  if (!speicher) return [];
  const gefunden = [];
  try {
    for (let i = 0; i < speicher.length; i++) {
      const k = speicher.key(i);
      if (!k || k.indexOf(STAND_PRAEFIX) !== 0) continue;
      /* Der EIGENE Schluessel wird uebergangen — aber nur, wenn sein Inhalt
         auch wirklich angenommen wurde. Liegt dort etwas, das nicht zum
         eingebauten Plan passt (von Hand veraendert, halb geschrieben), wird
         es hier ANGEBOTEN statt verschwiegen. Das ist die Aufgabe, die bis W10
         \`standFragt\` haben sollte und die es nie erfuellen konnte. */
      if (k === SCHLUESSEL && start) continue;
      /* Die SICHERUNG vor einem „Zuruecksetzen" ist kein Stand von anderswo
         (C3) — sie gehoert dieser Datei und wird in der Meldungszeile
         angeboten, nicht hier. Ihr Praefix ist ein anderer; die Zeile steht
         trotzdem hier, weil ein spaeter hinzukommender Schluessel unter
         \`plan:\` sonst still in dieser Liste landete. */
      if (k === SCHLUESSEL_SICHERUNG) continue;
      let s = null;
      try { s = JSON.parse(speicher.getItem(k)); } catch (e) { continue; }
      if (!s || !s.floorplan || !s.floorplan.corners) continue;
      gefunden.push({
        schluessel: k,
        stand: s,
        gesichertAm: s.gesichertAm || '',
        /* Passt der Stand zum eingebauten Plan? Wenn nicht, ist er aus einer
           anderen BAU-FASSUNG — er laedt trotzdem (der Kern prueft die Form),
           aber der Nutzer muss es wissen, bevor er ihn holt. */
        gleicherPlan: s.planAbdruck === PLAN_ABDRUCK,
        ort: typeof s.ort === 'string' ? s.ort : ''
      });
    }
  } catch (e) { /* ein Speicher, der sich nicht durchzaehlen laesst: dann eben nicht */ }
  gefunden.sort(function(a, b){ return a.gesichertAm < b.gesichertAm ? 1 : -1; });
  return gefunden;
}

/* „C:/Users/…/Desktop/Halle400-Modell.html" -> „Desktop". Der ganze Pfad waere
   in einer Zeile nicht zu lesen und in einer Kopfleiste erst recht nicht; der
   ORDNER ist das, was die Kopien unterscheidet. Fehlt die Angabe (ein Stand
   aus einer Fassung vor W10), wird das gesagt statt geraten. */
function ordnerName(pfad){
  if (!pfad) return '';
  const teile = pfad.split('/').filter(Boolean);
  return teile.length >= 2 ? teile[teile.length - 2] : '';
}

function standZeile(e){
  const d = e.gesichertAm ? new Date(e.gesichertAm) : null;
  const ordner = ordnerName(e.ort);
  const zahl = Object.keys(e.stand.floorplan.corners).length;
  return (d ? d.toLocaleDateString('de-DE') + ', ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr' : 'ohne Zeitangabe') +
    (ordner ? ' · Ordner „' + ordner + '"' : ' · Ablageort unbekannt') +
    ' · ' + zahl + ' Ecken' +
    (e.gleicherPlan ? '' : ' · andere Bau-Fassung');
}

function standHolen(e){
  el('ortFrage').hidden = true;
  if (Array.isArray(e.stand.items)) items = e.stand.items;
  try {
    ladeGrundriss(e.stand.floorplan, e.stand.labels, true);
    meldung('Übernommen: ' + grundriss.getCorners().length + ' Ecken, ' +
      grundriss.getWalls().length + ' Wände' +
      (ordnerName(e.ort) ? ' aus dem Ordner „' + ordnerName(e.ort) + '"' : ' von einem anderen Ablageort') +
      '. Dort bleibt der Stand unverändert liegen.', false);
  } catch (err) {
    meldung('Der Stand ließ sich nicht öffnen (' +
      ((err && err.message) ? err.message : String(err)) + ').', true);
  }
}

/* NUR wenn hier noch nichts liegt: wer an diesem Ablageort schon gearbeitet
   hat, will nicht gefragt werden, ob er stattdessen etwas Fremdes moechte. */
if (!start && speicher) {
  const gefunden = alleStaende();
  if (gefunden.length) {
    const a = gefunden[0];
    el('ortFrageText').textContent = gefunden.length === 1
      ? 'Es liegt ein Stand deiner Arbeit im Browser, aber nicht zu dieser Datei hier: '
      : 'Es liegen ' + gefunden.length + ' Stände deiner Arbeit im Browser, aber keiner zu dieser Datei hier. Der jüngste: ';
    el('ortFrageErster').textContent = standZeile(a);
    el('ortFrage').hidden = false;
    el('btnOrtNein').addEventListener('click', function(){ el('ortFrage').hidden = true; });
    el('btnOrtJa').addEventListener('click', function(){ standHolen(a); });

    /* Die WEITEREN Staende. Sie stehen als eigene Zeilen darunter und nicht in
       einem Auswahlfeld: ein Auswahlfeld verbirgt, WIE VIELE es sind, und
       genau das ist hier die Aussage — der Nutzer soll sehen, dass seine
       Arbeit nicht weg ist. Mehr als drei werden nur gezaehlt; wer sechs
       Kopien herumliegen hat, braucht eine Aufraeumung und keine Liste. */
    const weitere = el('ortFrageWeitere');
    gefunden.slice(1, 4).forEach(function(e){
      const zeile = document.createElement('span');
      zeile.className = 'ortZeile';
      const txt = document.createElement('span');
      txt.textContent = standZeile(e);
      const knopf = document.createElement('button');
      knopf.type = 'button';
      knopf.textContent = 'Diesen holen';
      knopf.addEventListener('click', function(){ standHolen(e); });
      zeile.appendChild(txt);
      zeile.appendChild(knopf);
      weitere.appendChild(zeile);
    });
    if (gefunden.length > 4) {
      const rest = document.createElement('span');
      rest.className = 'ortZeile';
      rest.textContent = 'und ' + (gefunden.length - 4) + ' weitere, ältere Stände.';
      weitere.appendChild(rest);
    }
    weitere.hidden = gefunden.length < 2;
  }
}

// Erst JETZT darf gesichert werden: das blosse OEffnen ist keine Aenderung.
sichernGesperrt = false;

/* Beide Angaben zusammen und in EINEM Griff (W7): der Bearbeiten-Zustand und
   die zuletzt angesehene Ansicht. Sie sind seit W7 unabhaengig voneinander —
   beim OEffnen muessen sie trotzdem zusammen ergeben, was der Nutzer zuletzt
   vor sich hatte. \`merken: false\` bei beiden: Lesen ist kein Zug, und ein
   Schreiben beim Start ueberschriebe im Fehlerfall genau das, was es
   herstellen soll. */
if (speicher) {
  /* SEIT DEM SCHLOSS: der gemerkte Zustand darf die Werkstatt nicht mehr von
     selbst aufsperren. Er wird gelesen und ABGERAEUMT — beim Oeffnen ist immer
     zu, und wer bearbeiten will, sagt es einmal. Das ist die einzige Fassung,
     bei der man dem Schloss-Symbol im Knopf glauben kann, ohne nachzudenken.
     (Ohne Schloss — reine Ansicht oder --ohne-siegel — bleibt es beim alten
     Verhalten; dort gibt es nichts zu sperren.) */
  try {
    if (speicher.getItem(SCHLUESSEL_BEARBEITEN) === '1') {
      if (SCHLOSS) speicher.removeItem(SCHLUESSEL_BEARBEITEN);
      else setzeBearbeiten(true, false);
    }
  } catch (e) { /* egal */ }
  try {
    const zuletzt = speicher.getItem(SCHLUESSEL_ANSICHT);
    // Nur die zwei Namen, die es gibt: ein zugemuellter Speicher darf die
    // Datei nicht in eine dritte, leere Ansicht schalten.
    if (zuletzt === 'plan' || zuletzt === 'axo') zeigeAnsicht(zuletzt, false);
  } catch (e) { /* egal */ }
}

/* ── Selbstauskunft fuer tools/pruefe-planer-datei.mjs ───────────────
   Das Pruefwerkzeug misst am lebenden Modell und am fertigen Bild, statt
   Behauptungen zu glauben. Bewusst nur lesend gedacht; es kostet nichts. */

/**
 * IST DAS WIRKLICH ZU SEHEN? — die wichtigste Lehre des Gegners.
 *
 * \`element.hidden\` sagt nur, ob DIESES eine Attribut gesetzt ist. Es sagt
 * nichts ueber \`display:none\` aus einer Medienabfrage, nichts ueber einen
 * unsichtbaren Vorfahren und nichts ueber Deckkraft null. Gemessen:
 * \`paletteSichtbar()\` meldete \`true\` fuer eine Palette, die unter
 * \`@media (max-width:900px){display:none}\` gar nicht da war — und auf genau
 * dieser Messgroesse fussten 67 Pruefungen. Eine Pruefung ist nie schaerfer als
 * ihre Messgroesse.
 *
 * \`checkVisibility\` fragt die GERECHNETE Darstellung, samt aller Vorfahren.
 */
function sichtbar(e){
  if (!e) return false;
  if (typeof e.checkVisibility === 'function') {
    return e.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true });
  }
  // Sehr alter Browser: wenigstens Flaeche pruefen, statt zu luegen.
  return !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
}

/**
 * IST DIESE ZEILE UEBERHAUPT GESETZT? — die zweite, engere Frage.
 *
 * Fuer die Zeilen des BLATTKOPFS taugt \`sichtbar\` nicht: sie liegen im Blatt,
 * und das Blatt RUHT, solange der Grundriss vorn ist (\`.ansicht.weg\`). Ein Gate,
 * das im Grundriss misst, bekaeme dann \`null\` und schloesse daraus, der Kopf
 * schweige — waehrend er in Wahrheit vollstaendig dasteht, nur eben auf der
 * anderen Ansicht.
 *
 * Gefragt wird deshalb nach der GERECHNETEN Darstellung des Elements selbst:
 * \`display:none\` faengt das \`hidden\`-Attribut UND jede Medienabfrage (der
 * eigentliche blinde Fleck des alten Masses), ohne von der ruhenden Ansicht
 * abzuhaengen.
 */
function angezeigt(e){
  return !!e && getComputedStyle(e).display !== 'none';
}

/* ── Die Pixel-Probe, EINMAL fuer beide Zeichenflaechen ──────────────
   \`bildMerken\` legt das Bild beiseite, \`bildAenderung\` vergleicht es mit dem
   jetzigen und liefert Zahl UND Schwerpunkt der veraenderten Bildpunkte, in
   CSS-Pixeln. Der Vergleich laeuft IN DER SEITE — 1440x900 Bildpunkte ueber
   die Messbruecke zu tragen waere fuenf Megabyte je Messung.

   Warum ueberhaupt Pixel: eine Modellzahl bewiese nur, dass sich das MODELL
   geaendert hat. Ob man es SIEHT, und ob an der richtigen Stelle, sagt allein
   das Bild. Bis zur Handy-Welle stand diese Rechnung nur fuer das Blatt da;
   die Rueckmeldung „was in der Hand ist" muss aber in BEIDEN Ansichten
   nachweisbar sein, und zwei Fassungen derselben Rechnung waeren zwei
   Messgeraete mit zwei Eichungen. */
function bildMerken(canvas){
  return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.slice();
}

function bildAenderung(canvas, merk, schwelle){
  if (!merk) return null;
  const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  if (d.length !== merk.length) return null;
  const grenze = schwelle == null ? 24 : schwelle;
  const dpr = canvas.width / Math.max(1, canvas.getBoundingClientRect().width);
  let sx = 0, sy = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const anders = Math.abs(d[i] - merk[i]) + Math.abs(d[i+1] - merk[i+1]) + Math.abs(d[i+2] - merk[i+2]);
    if (anders <= grenze) continue;
    const p = (i / 4) | 0;
    sx += p % canvas.width;
    sy += (p / canvas.width) | 0;
    n++;
  }
  return { n: n, x: n ? sx / n / dpr : null, y: n ? sy / n / dpr : null };
}

function planCanvas(){ return document.getElementById('grundriss-canvas'); }

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
  /* Der Weg der Pruefwerkzeuge in die Werkstatt. Er UMGEHT das Schloss NICHT —
     er geht denselben Weg wie der Knopf und braucht dasselbe Passwort. Eine
     Hintertuer waere hier besonders schaedlich: sie stuende in derselben Datei,
     die den Schutz behauptet.
     Ohne Schloss (reine Ansicht) gibt es nichts aufzuschliessen; dann meldet er
     das ehrlich statt still 'true'. */
  hatSchloss: function(){ return !!SCHLOSS; },
  aufgeschlossen: function(){ return werkstattOffen; },
  aufschliessen: function(wort){
    if (!SCHLOSS) return Promise.resolve({ offen: false, grund: 'Diese Fassung hat keine Werkstatt.' });
    return schlossOeffnen(wort).then(function(e){
      if (e.offen) { werkstattOffen = true; el('schlossFrage').hidden = true; }
      return e;
    });
  },
  werkzeugeSichtbar: function(){ return sichtbar(werkzeuge); },
  /* W7 — die ruhige Zeile in der Axonometrie. GEMESSEN wie alles Sichtbare
     ueber \`checkVisibility\`: \`hidden\` allein saehe nicht, dass sie im ruhenden
     Blatt liegt, und meldete sie im Grundriss faelschlich als sichtbar. */
  arbeitshinweisSichtbar: function(){ return sichtbar(arbeitshinweis); },
  arbeitshinweisText: function(){ return sichtbar(arbeitshinweis) ? arbeitshinweis.textContent.replace(/\\s+/g, ' ').trim() : null; },
  /* K3 — nimmt die Zeichenflaeche ueberhaupt Zeiger-Ereignisse an? GERECHNET
     und nicht aus der Klasse geraten: die Klasse ist das, was wir gesetzt
     haben, der gerechnete Stil ist das, was der Browser daraus macht. */
  zeichenflaecheScharf: function(){
    return getComputedStyle(document.getElementById('grundriss-canvas')).pointerEvents !== 'none';
  },
  /* M2/M6/K4/M8 — was das Blatt ueber die Herkunft des GRUNDRISSES sagt und
     was der Speicher gerade tut. Alles lesend. */
  grundrissText: function(){
    const z = el('grundrissZaehler');
    return angezeigt(z) ? z.textContent : null;
  },
  abweichung: function(){ return grundrissAbweichung(); },
  ungesichert: function(){ return ungesichert; },
  fremdErkannt: function(){ return !!fremdStand; },
  standleisteText: function(){
    return sichtbar(standleiste) ? el('standText').textContent : null;
  },
  staendeAnderswo: function(){ return alleStaende().length; },
  /* C1 — was die Startsuche WIRKLICH gefunden hat, nicht nur wie viel. Ein
     Gate, das nur die Zahl kennt, kann nicht unterscheiden, ob der Stand
     desselben Plans oder der einer anderen Bau-Fassung gefunden wurde — und
     genau der zweite Fall war der stille. */
  staendeUebersicht: function(){
    return alleStaende().map(function(e){
      return { schluessel: e.schluessel, gesichertAm: e.gesichertAm, gleicherPlan: e.gleicherPlan, ort: e.ort };
    });
  },
  ortFrageOffen: function(){ return sichtbar(el('ortFrage')); },
  ortFrageText: function(){ return sichtbar(el('ortFrage')) ? el('ortFrage').textContent.replace(/\\s+/g, ' ').trim() : null; },
  /* C3 — der Umfang, den die Rueckfrage nennt, und ob eine Sicherung liegt. */
  zurueckFrageOffen: function(){ return sichtbar(zurueckFrage); },
  zurueckFrageUmfang: function(){ return el('zurueckFrageUmfang').textContent; },
  sicherungBytes: function(){
    if (!speicher) return 0;
    try { return (speicher.getItem(SCHLUESSEL_SICHERUNG) || '').length; } catch (e) { return 0; }
  },
  ladeFrageOffen: function(){ return sichtbar(el('ladeFrage')); },
  ladeFrageText: function(){ return el('ladeFrageText').textContent; },
  druckZeile: function(){ return el('druckZeile').textContent; },
  /* G1 — wie diese Datei ein Mass SCHREIBT. Der Kern rechnet, die Anzeige
     formatiert; gemessen werden muss die Anzeige, nicht die Rechnung. */
  masse: function(cm){ return Dimensioning.cmToMeasure(cm); },
  meldungText: function(){ return sichtbar(meldungEl) ? meldungEl.textContent : null; },
  /* Nur fuer die Gegenprobe zu M1: dieselbe Liste mit anderer Herkunft. */
  waendeRoh: function(){
    return grundriss.getWalls().map(function(w){ return { id: w.id, quelle: w.quelle }; });
  },
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
    // Gemessen statt geraten — und mit \`angezeigt\`, weil diese Zeile im
    // ruhenden Blatt stehen darf (s. dort).
    return angezeigt(z) ? z.textContent : null;
  },
  hinweisOeffnung: function(){ return el('hinweisOeffnung').textContent; },
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
    /* Der Schnappschuss gehoert DAZU: \`mouseup\` im Zeichnen-Werkzeug zieht ihn
       vor dem Setzen des Punktes. Ohne ihn naehme ein Rueckgaengig im Gate den
       vorigen Zug zurueck statt der Teilung — und die Gegenprobe maesse
       anschliessend einen Zustand, den sie fuer den Ausgangszustand haelt.
       Genau das ist beim ersten Lauf passiert. */
    undo.snapshot();
    const c = grundriss.newCorner(x, y);
    return { geteilt: c.mergeWithIntersected(), waende: grundriss.getWalls().length };
  },
  /* Zeichnet den Grundriss neu. \`relativeMove\` und \`remove\` aendern das Modell,
     loesen aber KEIN Neuzeichnen aus — der Zeichner malt bei Zeiger-Ereignissen.
     Ein Gate, das gleich danach die Bild-Pruefsumme liest, maesse sonst das
     Bild von VORHER und meldete "nichts geaendert". */
  neuZeichnen: function(){ zeichner.resizeView(); },
  /* Eine Wand VERSCHIEBEN — derselbe Aufruf, den das Verschieben-Werkzeug bei
     gedrueckter Taste macht (floorplanner.ts, \`activeWall.relativeMove\`). */
  wandVerschieben: function(id, dx, dy){
    const w = grundriss.getWalls().find(function(v){ return v.id === id; });
    if (!w) return false;
    w.relativeMove(dx, dy);
    return true;
  },
  wandLoeschen: function(id){
    const w = grundriss.getWalls().find(function(v){ return v.id === id; });
    if (!w) return false;
    undo.snapshot();
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
  paletteSichtbar: function(){ return sichtbar(palette); },
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
  /* Wie viel WAND die Axonometrie wirklich baut (W4). Die blosse ANZAHL der
     Kacheln taugt nicht als Mass: eine Oeffnung in der Mitte einer 10-m-Wand
     zerlegt [0,10] in [0,4.5] und [5.5,10] — bei 3,2 m Kachelbreite sind das
     zweimal zwei Kacheln, also genau so viele wie vorher. Die FLAECHE der
     Grundrisse sinkt dagegen zwingend um lichte Weite mal Wanddicke. */
  szeneWaende: function(){
    if (!szene) return null;
    let flaeche = 0, volumen = 0;
    for (const k of szene.waende) {
      let a = 0;
      for (let i = 0; i < k.punkte.length; i++) {
        const p = k.punkte[i], q = k.punkte[(i + 1) % k.punkte.length];
        a += p.x * q.z - q.x * p.z;
      }
      const f = Math.abs(a) / 2;
      flaeche += f;
      /* Das VOLUMEN trennt die Bruestung von der Tuer: ein Fenster mit
         Bruestung laesst Mauerwerk stehen, sein GRUNDRISS bleibt also
         unveraendert — nur seine HOEHE sinkt. Ohne diese Zahl waere die
         Bruestung nicht von "gar nichts passiert" zu unterscheiden. */
      volumen += f * (k.y1 - k.y0);
    }
    return { n: szene.waende.length, flaeche: flaeche, volumen: volumen };
  },
  /* Baut die Axonometrie neu — dieselbe Funktion, die die Huelle selbst ruft.
     Noetig, weil \`setzeAusstattung\` (Strichprobe) bewusst KEINE Aenderung
     meldet und die Ansicht sonst veraltet bliebe: das Gate maesse dann die
     Szene von VORHER und hielte sie fuer die von jetzt. */
  axoNeuBauen: function(){ axoNeuBauen(); },
  gesetztText: function(){
    const z = el('gesetztZaehler');
    // Gemessen statt geraten — und mit \`angezeigt\`, weil diese Zeile im
    // ruhenden Blatt stehen darf (s. dort).
    return angezeigt(z) ? z.textContent : null;
  },
  hinweisHerkunft: function(){ return el('hinweisHerkunft').textContent; },
  aufBild: function(x, y){ return { x: zeichner.convertX(x), y: zeichner.convertY(y) }; },
  treffer: function(){
    return {
      ausstattung: zeichner.activeAusstattung,
      // W4: ohne dieses Feld maesse ein Gate den Oeffnungs-Treffer als
      // "undefined" und haette ihn fuer "nicht getroffen" gehalten — die
      // Messung waere blind fuer genau das, was sie pruefen soll.
      oeffnung: zeichner.activeOeffnung,
      wand: zeichner.activeWall ? zeichner.activeWall.id : null,
      ecke: zeichner.activeCorner ? zeichner.activeCorner.id : null
    };
  },
  einrasten: function(){ return zeichner.istEinrasten(); },
  setzeEinrasten: function(an){ zeichner.setzeEinrasten(an); },
  zoomeAufPunkt: function(z, bx, by){ zeichner.zoomeAufPunkt(z, bx, by); },
  proCm: function(){ return zeichner.pixelProCm(); },
  undoJetzt: function(){ undo.undo(); },
  redoJetzt: function(){ undo.redo(); },
  /* Loeschen wie der Nutzer es sieht: der Kern schlaegt vor, die Huelle fragt,
     der Kern fuehrt aus. Das Gate misst genau diese drei Schritte. */
  loeschKandidat: function(){
    const k = zeichner.loeschKandidat;
    return k ? { art: k.art, beschreibung: k.beschreibung, kennung: k.kennung || null } : null;
  },
  loeschungBestaetigen: function(){ return zeichner.loeschungBestaetigen(); },
  loeschungAbbrechen: function(){ zeichner.loeschungAbbrechen(); },
  /* Nur fuer Gate g: DIESELBE Vorschrift, die \`fuegeOeffnungHinzu\` und der
     Geist benutzen — an der Grenze auf den Zentimeter genau messbar, was ein
     Zeiger nie waere. */
  oeffnungPasst: function(wandId, lage, breite){
    return grundriss.oeffnungPasst(wandId, lage, breite);
  },
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
  /* ── Bearbeiten im Blatt (W7) ────────────────────────────────────────
     Alles LESEND ausser \`axoSetzeBlick\` und \`axoVollNeubau\`. Der Zug selbst
     wird vom Gate mit echten Zeiger-Ereignissen nachgefahren (\`page.mouse\`):
     \`dispatchEvent\` ruft die Zuhoerer direkt auf und ginge auch dann durch,
     wenn die Flaeche gar nicht getroffen werden kann — genau daran ist K3
     fuenf Wellen lang vorbeigemessen worden. */
  axoKasten: function(){
    const r = axoCanvas.getBoundingClientRect();
    return { left: r.left, top: r.top, breite: r.width, hoehe: r.height };
  },
  axoKamera: function(){ return axoAnsicht ? axoAnsicht.kamera() : null; },
  axoBlick: function(){ return axoAnsicht ? axoAnsicht.blick : null; },
  axoSetzeBlick: function(az, neigung){ if (axoAnsicht) axoAnsicht.setzeBlick(az, neigung); },
  axoZiehbar: function(){ return axoAnsicht ? axoAnsicht.ziehbar : null; },
  axoGreift: function(){ return axoAnsicht ? axoAnsicht.greift : null; },
  axoUnterZeiger: function(){ return axoAnsicht ? axoAnsicht.unterZeiger : null; },
  /* Der Treffer-Test OHNE Zeiger — fuer die Selbsttreffer-Probe ueber alle
     289 Stuecke. Dieselbe Funktion, die auch die Hand benutzt. */
  axoTreffer: function(x, y){
    if (!axoAnsicht) return null;
    return koerperUnter(axoAnsicht.szene, axoAnsicht.kamera(), x, y);
  },
  /* Ein Weltpunkt (cm) auf seiner Hoehe (m) VORWAERTS ins Bild — die
     Gegenrichtung zu \`axoTreffer\`. */
  axoAufBild: function(weltX, weltY, hoeheM){
    if (!axoAnsicht) return null;
    const p = axoAnsicht.projiziere(weltX * CM, hoeheM, weltY * CM);
    return { x: p.x, y: p.y, tiefe: p.p };
  },
  /* Die UMKEHRUNG, in Zentimetern — der Weg, den auch der Renderer nimmt
     (\`weltAuf\`). Ein Gate, das den Sollpunkt eines Blatt-Zuges selbst
     ausrechnete, haette eine ZWEITE Fassung der Projektion und pruefte am Ende
     sich selbst gegen sich selbst. */
  axoRueck: function(bildX, bildY, hoeheM){
    if (!axoAnsicht) return null;
    const p = axoAnsicht.umkehre(bildX, bildY, hoeheM);
    return p ? { x: p.x / CM, y: p.z / CM } : null;
  },
  axoMoebel: function(){
    if (!szene) return null;
    return szene.moebel.map(function(k){
      return { id: k.id, typ: k.typ, y0: k.y0, y1: k.y1, gesetzt: !!k.gesetzt };
    });
  },
  /* Der KILL-SCHALTER fuer die Kosten-Gegenprobe (s. \`vollNeubauImZug\`). */
  axoVollNeubau: function(an){ vollNeubauImZug = !!an; },
  /* DIE PIXEL-TINTE: was hat sich auf dem GERENDERTEN Blatt geaendert, und WO?
     \`axoMerken\` legt das Bild beiseite, \`axoAenderung\` vergleicht es mit dem
     jetzigen und liefert Zahl und Schwerpunkt der veraenderten Bildpunkte, in
     CSS-Pixeln. Der Vergleich laeuft IN DER SEITE — 1440x900 Bildpunkte ueber
     die Messbruecke zu tragen waere fuenf Megabyte je Messung.

     Warum ueberhaupt Pixel: eine Modellzahl bewiese nur, dass sich das MODELL
     geaendert hat. Ob man es SIEHT, und ob an der richtigen Stelle, sagt allein
     das Bild. Der Schwerpunkt der Aenderung liegt zwischen dem alten und dem
     neuen Ort des Stuecks — beide Stellen aendern sich ja. */
  axoMerken: function(){ axoMerk = bildMerken(axoCanvas); return axoMerk.length; },
  axoAenderung: function(schwelle){ return bildAenderung(axoCanvas, axoMerk, schwelle); },
  /* DASSELBE fuer den GRUNDRISS (Handy-Welle). Es gab bis hierher nur
     \`bildPlan()\`, eine Pruefsumme: sie sagt, DASS sich etwas geaendert hat,
     nie WO. Fuer die Rueckmeldung am Handy ist genau das die Frage — der
     Rahmen um das gegriffene Stueck muss AN DIESEM STUECK erscheinen und
     nirgends sonst. Eine Pruefsumme haette auch dann gemeldet, wenn die
     Markierung am falschen Ende der Halle laege. */
  planMerken: function(){ planMerk = bildMerken(planCanvas()); return planMerk.length; },
  planAenderung: function(schwelle){ return bildAenderung(planCanvas(), planMerk, schwelle); },
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

/* ══════════════════════════════════════════════════════════════════════
   DIE REINE ANSICHT (--nur-ansicht) — die Fassung fuer die Bank

   Nicht ausblenden, sondern ENTFERNEN. Der Unterschied ist der ganze Punkt:
   ausgeblendet ist ein Knopf, den die Entwicklerwerkzeuge in zwei Griffen
   zurueckholen; entfernt ist einer, den es nicht gibt. Die Bankberaterin kann
   an dieser Datei nichts verstellen — nicht, weil sie es nicht darf, sondern
   weil kein Werkzeug darin liegt.

   WAS BLEIBT: beide Ansichten, Blickwechsel, Zoom, Verschieben, Legende,
   Raumnamen, Drucken — und das Siegel.
   WAS GEHT: Werkzeugleiste, Palette, Bearbeiten-Schalter, Sichern/Laden,
   Zuruecksetzen und alle Rueckfragen, die zu ihnen gehoeren.

   Der Schnitt ist MECHANISCH und wird nachgeprueft (unten: keine der
   entfernten Kennungen darf im Ergebnis noch vorkommen). Ein Schnitt, dem man
   glaubt statt ihn zu messen, laesst genau den einen Knopf stehen, den niemand
   auf der Liste hatte. */
function schneideBlock(text, id) {
  const anfang = text.indexOf(`id="${id}"`)
  if (anfang < 0) return { text, gefunden: false }
  // Zurueck bis zum oeffnenden Tag, dessen Attribut das ist.
  const tagStart = text.lastIndexOf('<', anfang)
  const tagName = text.slice(tagStart + 1).match(/^[a-zA-Z][a-zA-Z0-9]*/)[0]
  const tagEnde = text.indexOf('>', anfang)
  // Selbstschliessend (input) oder leeres Element: nur das Tag selbst weg.
  if (text[tagEnde - 1] === '/' || tagName === 'input' || tagName === 'br') {
    return { text: text.slice(0, tagStart) + text.slice(tagEnde + 1), gefunden: true }
  }
  // Sonst gleichnamige Tags zaehlen, bis die Bilanz aufgeht.
  const auf = new RegExp(`<${tagName}[\\s>]`, 'g')
  const zu = new RegExp(`</${tagName}>`, 'g')
  let tiefe = 1, i = tagEnde + 1
  while (tiefe > 0 && i < text.length) {
    auf.lastIndex = i; zu.lastIndex = i
    const a = auf.exec(text), z = zu.exec(text)
    if (!z) return { text, gefunden: false }          // unbalanciert — lieber nichts tun
    if (a && a.index < z.index) { tiefe++; i = a.index + 1 }
    else { tiefe--; i = z.index + z[0].length }
  }
  return { text: text.slice(0, tagStart) + text.slice(i), gefunden: true }
}

const WERKSTATT_BLOECKE = [
  'palette', 'werkzeuge', 'zurueckFrage', 'schlossFrage', 'rueckfrage',
  'grpBearbeiten', 'standleiste', 'ortFrage', 'ladeFrage', 'dateiWahl',
]
const kennungenVon = (t) => new Set([...t.matchAll(/id="([^"]+)"/g)].map((m) => m[1]))
const ANSICHT_BERICHT = { bloecke: 0, kennungen: 0 }
if (NUR_ANSICHT) {
  const vorher = kennungenVon(html)
  const fehlend = []
  for (const id of WERKSTATT_BLOECKE) {
    const r = schneideBlock(html, id)
    if (!r.gefunden) fehlend.push(id)
    html = r.text
  }
  if (fehlend.length) {
    console.error(`Abbruch: diese Werkstatt-Bloecke waren nicht zu schneiden: ${fehlend.join(', ')}`)
    console.error('  Wurde eine Kennung umbenannt? Ein halber Schnitt liefert eine Datei, die')
    console.error('  aussieht wie eine Ansicht und eine Werkstatt ist.')
    process.exit(1)
  }
  // Die Gegenprobe zum Schnitt: keine der Kennungen darf noch DA sein — auch
  // nicht als Zugriff im Skript, denn der liefe ins Leere.
  const uebrig = WERKSTATT_BLOECKE.filter((id) => html.includes(`id="${id}"`))
  if (uebrig.length) {
    console.error(`Abbruch: nach dem Schnitt stehen noch da: ${uebrig.join(', ')}`)
    process.exit(1)
  }
  /* Die Schnittliste entsteht aus dem VERGLEICH, nicht von Hand. Wer morgen
     einen Knopf in die Werkzeugleiste haengt, muss nichts nachtragen — er
     verschwindet mit seinem Block und steht damit automatisch auf der Liste.
     Eine handgepflegte Liste waere genau die Sorte Doppelbuchhaltung, die
     irgendwann auseinanderlaeuft und dann still den falschen Zweig nimmt. */
  const nachher = kennungenVon(html)
  const geschnitten = [...vorher].filter((id) => !nachher.has(id)).sort()
  const marke = '/*ENTFERNT-LISTE*/[]'
  if (!html.includes(marke)) {
    console.error('Abbruch: die Stelle fuer die Schnittliste ist weg — die Ansicht bekaeme sie nie zu sehen.')
    process.exit(1)
  }
  html = html.replace(marke, JSON.stringify(geschnitten))
  ANSICHT_BERICHT.bloecke = WERKSTATT_BLOECKE.length
  ANSICHT_BERICHT.kennungen = geschnitten.length
}

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
if (NUR_ANSICHT) console.log(`  Schnitt:      ${ANSICHT_BERICHT.bloecke} Werkstatt-Bloecke entfernt, ${ANSICHT_BERICHT.kennungen} Kennungen verschwunden (reine ANSICHT)`)
console.log(`  Plan-Abdruck: ${PLAN_ABDRUCK} (Speicher-Schluessel je Plan UND Ablageort)`)
console.log(`  Bau-Stempel:  ${BAU_STEMPEL}`)
