// Baut die BANK-ANSICHT (E4): EINE einzelne HTML-Datei zum Doppelklick.
//
//   node tools/baue-bank-ansicht.mjs [--plan halle400] [--ziel "Halle400-Modell.html"]
//
// WOZU: Das Modell kommt in einen Businessplan. Eine Bank soll es OHNE
// Werkzeuge oeffnen koennen — kein Node, kein Server, kein Netz, keine
// Installation. Doppelklick, Browser, drehen.
//
// WARUM NICHT der vorhandene Export: `app/out/` ist ein Dateiordner, den Next
// mit ABSOLUTEN Asset-Pfaden (/_next/static/…) schreibt. Ueber file:// zeigen
// die ins Laufwerks-Root — gemessen 11x ERR_FILE_NOT_FOUND und eine weisse
// Seite (docs/betrieb.md). Deshalb liefert `tools/serve-local.mjs` den Ordner
// per HTTP aus; das setzt aber eine Node-Installation voraus, die eine Bank
// nicht hat.
//
// DREI HARTE OFFLINE-BLOCKER lagen im Renderpfad, alle auf einem FREMDEN CDN
// (cdn-images.lumenfeng.com): Bodentextur (src/model/room.ts), Wandtextur
// (src/model/wall.ts) und Wand-Lichtkarte (src/three/edge.ts). Sie werden hier
// nicht eingebettet, sondern IM BROWSER ERZEUGT — eine gerechnete Maserung
// wiegt nichts und kann nicht verschwinden, wenn ein fremder Anbieter seine
// URLs aendert.
//
// EHRLICHE EINSCHRAENKUNG: Diese Datei ist ein BETRACHTER, kein Editor. Sie
// zeichnet die Geometrie eigenstaendig aus dem Grundriss-JSON und teilt sich
// den Code NICHT mit src/three/. Das ist ein bewusster Verzicht: den ganzen
// Editor-Graphen ohne Buendler in eine Datei zu pressen waere fragiler als
// 200 Zeilen Betrachter. Damit die beiden nicht auseinanderlaufen, werden die
// Ausstattungs-Hoehen NICHT abgeschrieben, sondern zur Bauzeit aus
// src/three/ausstattung.ts GELESEN — ein zweiter Wahrheitsort waere genau die
// Art Drift, die man erst bemerkt, wenn die Bank etwas anderes sieht als du.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HIER = path.dirname(fileURLToPath(import.meta.url))
const WURZEL = path.resolve(HIER, '..')

const arg = (name, standard) => {
  const i = process.argv.indexOf(name)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : standard
}
const PLAN = arg('--plan', 'halle400')
const ZIEL = path.resolve(WURZEL, arg('--ziel', 'Halle400-Modell.html'))

// ---------------------------------------------------------------- Bausteine

const planPfad = path.join(WURZEL, 'app/public/plaene', `${PLAN}.json`)
if (!fs.existsSync(planPfad)) {
  console.error(`Grundriss nicht gefunden: ${planPfad}`)
  process.exit(1)
}
const planRoh = JSON.parse(fs.readFileSync(planPfad, 'utf8'))
const floorplan = planRoh.floorplan ?? planRoh

/**
 * three.js als KLASSISCHES Skript zusammensetzen.
 *
 * Warum nicht <script type="module">: Modul-Skripte unterliegen den CORS-Regeln,
 * und unter file:// gilt jede Datei als eigener Ursprung. Ein klassisches
 * Skript hat diese Beschraenkung nicht — und genau file:// ist der Zielfall.
 *
 * three.module.js ist NICHT selbstaendig, sondern ein duenner Aufsatz auf
 * three.core.js (erst beim Laufenlassen aufgefallen: "Cannot use import
 * statement outside a module"). Beide werden hintereinandergelegt, die
 * Modul-Klammern fallen weg.
 *
 * BEWUSST die unminifizierten Fassungen, obwohl sie dreimal so gross sind:
 * die minifizierten benennen beim Ex- und Import um (`Zi as log`), ihre
 * Symbole laegen danach nur unter Kuerzeln im Scope, und die Kuerzel beider
 * Dateien kollidieren miteinander. Das liesse sich mit Kapselung aufloesen —
 * waere aber eine trickreiche Textverarbeitung an fremdem Code, die bei jedem
 * three-Update kippen kann. Die unminifizierten exportieren unter IDENTISCHEN
 * Namen und lassen sich schlicht aneinanderfuegen. 1,4 MB Mehrgewicht in einer
 * Datei, die einmal per Mail geht, ist der bessere Handel.
 */
const leseTeil = (name) => {
  const p = path.join(WURZEL, 'node_modules/three/build', name)
  if (!fs.existsSync(p)) {
    console.error(`three.js nicht gefunden: ${p} — erst "pnpm install".`)
    process.exit(1)
  }
  return fs.readFileSync(p, 'utf8')
}

/**
 * Nimmt die Modul-Klammern ab: ALLE `import {...} from '...'` und ALLE
 * `export {...}`.
 *
 * Der Plural ist hier die eigentliche Lehre. Zuerst wurde nur der
 * ABSCHLIESSENDE export-Block entfernt — three.module.js hat aber zwei: einen
 * am Ende mit den eigenen Namen und gleich hinter dem Import einen zweiten,
 * der die Namen aus three.core.js weiterreicht. Die Datei sah danach richtig
 * aus und der Browser meldete "Unexpected token 'export'".
 *
 * Sicher ist das, weil beide Dateien im selben Skript-Scope landen: was
 * exportiert oder importiert wuerde, ist ohnehin schon deklariert. Die
 * Klammern sind reine Modul-Buchhaltung.
 */
const EXPORT_MUSTER = /^export\s*\{([^}]*)\}(?:\s*from\s*['"][^'"]+['"])?;?[ \t]*$/gm
const IMPORT_MUSTER = /^import\s*\{([^}]*)\}\s*from\s*['"][^'"]+['"];?[ \t]*$/gm

/** "A as B, C" -> [{ von: 'A', als: 'B' }, { von: 'C', als: 'C' }] */
const nameListe = (roh) =>
  roh
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const teile = s.split(/\s+as\s+/)
      return { von: teile[0].trim(), als: (teile[1] ?? teile[0]).trim() }
    })

/**
 * Nimmt einer Modul-Datei die Klammern ab und meldet, welche Namen sie
 * hereinholt und welche sie herausgibt.
 *
 * ZWEI Fallen lagen hier, beide erst beim Laufenlassen sichtbar:
 *
 * 1. three.module.js hat DREI Bloecke, nicht einen: den Import aus
 *    three.core.js, gleich dahinter einen Re-Export derselben Namen
 *    (`export {...} from './three.core.js'`) und am Ende die eigenen. Wer nur
 *    den letzten entfernt, bekommt "Unexpected token 'export'".
 *
 * 2. Ein Re-Export MIT from-Klausel reicht fremde Namen weiter, die im eigenen
 *    Scope gar nicht existieren. Er wird deshalb uebersprungen — die Namen
 *    stehen laengst im gemeinsamen Beutel.
 */
const zerlege = (quelle, name) => {
  const gibtHeraus = []
  const holtHerein = []

  for (const m of quelle.matchAll(EXPORT_MUSTER)) {
    // Mit from-Klausel = Weiterreichen fremder Namen -> nicht aus DIESEM Scope.
    if (/from\s*['"]/.test(m[0])) continue
    gibtHeraus.push(...nameListe(m[1]))
  }
  for (const m of quelle.matchAll(IMPORT_MUSTER)) {
    holtHerein.push(...nameListe(m[1]))
  }

  if (gibtHeraus.length === 0) {
    console.error(`Unerwartetes Format: ${name} gibt keine Namen heraus.`)
    console.error('Abbruch statt Raten — ein halb entschaerftes Modul ergaebe eine weisse Seite.')
    process.exit(1)
  }

  const rest = quelle.replace(EXPORT_MUSTER, '').replace(IMPORT_MUSTER, '')

  // GEGENPROBE: nichts darf uebrig bleiben. Ohne sie faellt ein uebersehener
  // Rest erst im Browser auf — und zwar bei der Bank, wo niemand mehr
  // nachbessern kann.
  const uebrig = rest.match(/^[ \t]*(export|import)[\s{'"*]/m)
  if (uebrig) {
    const zeile = rest.slice(0, rest.indexOf(uebrig[0])).split('\n').length
    console.error(`${name}: in Zeile ${zeile} steht noch "${uebrig[0].trim()}" — Abbruch.`)
    process.exit(1)
  }

  console.log(`  ${name}: ${holtHerein.length} Namen herein, ${gibtHeraus.length} heraus`)
  return { rest, gibtHeraus, holtHerein }
}

const core = zerlege(leseTeil('three.core.js'), 'three.core.js')
const modul = zerlege(leseTeil('three.module.js'), 'three.module.js')

/**
 * Beide Dateien bekommen einen EIGENEN Scope.
 *
 * Sie einfach aneinanderzuhaengen scheiterte an
 * "Identifier '_m1$1' has already been declared": beide benutzen intern
 * gleichnamige Hilfsgroessen. Als Module stoerte das nie, denn jedes Modul hat
 * seinen eigenen Raum. Zwei Funktionen stellen genau das wieder her — und der
 * gemeinsame Beutel `T` tritt an die Stelle der Modul-Bindungen.
 */
const beutelFuellen = (namen) =>
  `Object.assign(T, {${namen.map((n) => `${n.als}: ${n.von}`).join(', ')}});`
const beutelLeeren = (namen) =>
  namen.length ? `const {${namen.map((n) => `${n.von}: ${n.als}`).join(', ')}} = T;` : ''

const three = `
const T = {};
(function () {
${core.rest}
${beutelFuellen(core.gibtHeraus)}
})();
(function () {
${beutelLeeren(modul.holtHerein)}
${modul.rest}
${beutelFuellen(modul.gibtHeraus)}
})();
`

/**
 * Ausstattungs-Hoehen aus src/three/ausstattung.ts LESEN statt abschreiben.
 * Aendert jemand dort eine Hoehe, aendert sich die Bank-Ansicht mit.
 */
const leseHoehen = (name) => {
  const quelle = fs.readFileSync(path.join(WURZEL, 'src/three/ausstattung.ts'), 'utf8')
  const block = quelle.match(new RegExp(`${name}[^=]*=\\s*\\{([\\s\\S]*?)\\n\\}`))
  if (!block) {
    console.error(`${name} nicht in src/three/ausstattung.ts gefunden — Abbruch.`)
    console.error('Lieber laut scheitern als die Bank ein anderes Modell sehen lassen.')
    process.exit(1)
  }
  const werte = {}
  for (const m of block[1].matchAll(/^\s*(\w+)\s*:\s*(\d+(?:\.\d+)?)\s*,?\s*$/gm)) {
    werte[m[1]] = Number(m[2])
  }
  return werte
}

const OBERKANTE_CM = leseHoehen('OBERKANTE_CM')
const KOERPER_CM = leseHoehen('KOERPER_CM')

if (Object.keys(OBERKANTE_CM).length < 5) {
  console.error(`OBERKANTE_CM nur ${Object.keys(OBERKANTE_CM).length} Eintraege — Abbruch.`)
  process.exit(1)
}

// Wandhoehe ist eine GESETZTE Nutzer-Angabe, kein Messwert aus der PDF
// (Projekt-DNA Punkt 4) — ein Grundriss enthaelt keine Hoehe.
const WAND_HOEHE_CM = 300
const WAND_DICKE_CM = 10

const daten = {
  corners: floorplan.corners ?? {},
  walls: floorplan.walls ?? [],
  ausstattung: floorplan.ausstattung ?? [],
  roomMeta: floorplan.roomMeta ?? {},
  oberkante: OBERKANTE_CM,
  koerper: KOERPER_CM,
  wandHoehe: WAND_HOEHE_CM,
  wandDicke: WAND_DICKE_CM
}

// ------------------------------------------------------------ Betrachter-Code

const betrachter = `
// Die three.js-Klassen aus dem gemeinsamen Beutel holen (siehe oben: beide
// Modul-Dateien liegen in eigenen Scopes, T ist ihre Verbindung).
const {
  Scene, Color, PerspectiveCamera, WebGLRenderer, PCFSoftShadowMap,
  CanvasTexture, RepeatWrapping, SRGBColorSpace, PlaneGeometry,
  MeshStandardMaterial, Mesh, BoxGeometry, Group, HemisphereLight,
  DirectionalLight, Vector3
} = T;

// ---- Daten (zur Bauzeit eingebettet) ----
const D = __DATEN__;

const wrap = document.getElementById('buehne');
const szene = new Scene();
szene.background = new Color(0xdfe6ee);

const kamera = new PerspectiveCamera(50, wrap.clientWidth / wrap.clientHeight, 10, 200000);
const maler = new WebGLRenderer({ antialias: true });
maler.setPixelRatio(Math.min(devicePixelRatio, 2));
maler.setSize(wrap.clientWidth, wrap.clientHeight);
maler.shadowMap.enabled = true;
maler.shadowMap.type = PCFSoftShadowMap;
wrap.appendChild(maler.domElement);

// ---- Texturen RECHNEN statt laden -------------------------------------------
// Die Vorlage lud Boden, Wand und Lichtkarte von cdn-images.lumenfeng.com.
// Fuer eine Datei, die offline laufen muss, ist ein fremdes CDN ein harter
// Blocker. Eine gerechnete Maserung wiegt nichts und faellt nie aus.
function holzTextur() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#c8a578';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 260; i++) {
    const y = Math.random() * 256;
    g.strokeStyle = 'rgba(150,110,70,' + (0.05 + Math.random() * 0.13).toFixed(3) + ')';
    g.lineWidth = 0.5 + Math.random() * 1.6;
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(85, y + (Math.random() * 7 - 3.5), 170, y + (Math.random() * 7 - 3.5), 256, y);
    g.stroke();
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  return t;
}

const bodenTextur = holzTextur();

// ---- Grundriss auswerten ----------------------------------------------------
const ecken = D.corners;
const punkte = Object.values(ecken);
const minX = Math.min(...punkte.map(p => p.x));
const maxX = Math.max(...punkte.map(p => p.x));
const minY = Math.min(...punkte.map(p => p.y));
const maxY = Math.max(...punkte.map(p => p.y));
const mitteX = (minX + maxX) / 2;
const mitteY = (minY + maxY) / 2;
const breite = maxX - minX;
const tiefe = maxY - minY;

// Welt: x nach rechts, y nach oben, z = Grundriss-y. Der Ursprung wandert in
// die Mitte der Halle, damit sich die Ansicht um ihren Schwerpunkt dreht.
const wx = x => x - mitteX;
const wz = y => y - mitteY;

// ---- Boden ------------------------------------------------------------------
bodenTextur.repeat.set(breite / 300, tiefe / 300);
const boden = new Mesh(
  new PlaneGeometry(breite + 400, tiefe + 400),
  new MeshStandardMaterial({ map: bodenTextur, roughness: 0.85 })
);
boden.rotation.x = -Math.PI / 2;
boden.receiveShadow = true;
szene.add(boden);

// ---- Waende -----------------------------------------------------------------
const wandStoff = new MeshStandardMaterial({ color: 0xf2f2ef, roughness: 0.92 });
const wandGruppe = new Group();
let wandZahl = 0;
for (const w of D.walls) {
  const a = ecken[w.corner1];
  const b = ecken[w.corner2];
  if (!a || !b) continue;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const laenge = Math.hypot(dx, dy);
  if (laenge < 1) continue;
  const m = new Mesh(new BoxGeometry(laenge, D.wandHoehe, D.wandDicke), wandStoff);
  m.position.set(wx((a.x + b.x) / 2), D.wandHoehe / 2, wz((a.y + b.y) / 2));
  // Minus, weil eine Drehung um die y-Achse in der (x,z)-Ebene andersherum
  // laeuft als der mathematisch positive Sinn in der (x,y)-Ebene des Plans.
  m.rotation.y = -Math.atan2(dy, dx);
  m.castShadow = true;
  m.receiveShadow = true;
  wandGruppe.add(m);
  wandZahl++;
}
szene.add(wandGruppe);

// ---- Ausstattung ------------------------------------------------------------
// Farben mit Blaustich wie im 2D-Plan, damit beide Ansichten dieselbe Sprache
// sprechen.
const moebelStoff = new MeshStandardMaterial({ color: 0xdfe3ea, roughness: 0.7 });
const flaechenStoff = new MeshStandardMaterial({ color: 0xefe7dd, roughness: 0.95 });
const gruenStoff = new MeshStandardMaterial({ color: 0xa8c49a, roughness: 0.8 });
let moebelZahl = 0;
for (const el of D.ausstattung) {
  const oberkante = D.oberkante[el.typ];
  // Unbekannter Typ: lieber nichts zeichnen als einen erfundenen Koerper.
  if (oberkante === undefined) continue;
  const dicke = D.koerper[el.typ] ?? oberkante;
  const stoff = el.typ === 'flaeche' ? flaechenStoff : el.typ === 'pflanze' ? gruenStoff : moebelStoff;
  const m = new Mesh(new BoxGeometry(el.breite, dicke, el.tiefe), stoff);
  m.position.set(wx(el.x), oberkante - dicke / 2, wz(el.y));
  m.rotation.y = -(el.drehung ?? 0);
  if (el.typ !== 'flaeche') {
    m.castShadow = true;
  }
  m.receiveShadow = true;
  szene.add(m);
  moebelZahl++;
}

// ---- Licht ------------------------------------------------------------------
szene.add(new HemisphereLight(0xffffff, 0x9aa5b1, 2.1));
const sonne = new DirectionalLight(0xffffff, 1.5);
sonne.position.set(breite * 0.3, 2600, tiefe * 0.8);
sonne.castShadow = true;
sonne.shadow.mapSize.set(2048, 2048);
const s = Math.max(breite, tiefe) * 0.6;
sonne.shadow.camera.left = -s;
sonne.shadow.camera.right = s;
sonne.shadow.camera.top = s;
sonne.shadow.camera.bottom = -s;
sonne.shadow.camera.far = 12000;
szene.add(sonne);

// ---- Kamera: die GANZE Halle einpassen --------------------------------------
// Eingepasst wird die UMSCHLIESSENDE KUGEL, nicht die Bounding-Box. Ein
// geschaetzter Zuschlag stimmt immer nur bei EINEM Seitenverhaeltnis: am
// Rechner sass er, am Handy schoss er vorbei. Der Kugelradius ist dagegen
// exakt herleitbar und bleibt beim Drehen gueltig.
const radius = Math.hypot(breite / 2, tiefe / 2, D.wandHoehe / 2);
function abstandFuerGanzeHalle() {
  const halbSenkrecht = (kamera.fov * Math.PI) / 360;
  const halbWaagerecht = Math.atan(Math.tan(halbSenkrecht) * kamera.aspect);
  const enger = Math.min(halbSenkrecht, halbWaagerecht);
  return (radius / Math.sin(enger)) * 1.05;
}

let drehung = -Math.PI / 4;
let neigung = 0.62;
let abstand = abstandFuerGanzeHalle();
const ziel = new Vector3(0, D.wandHoehe / 2, 0);

function kameraSetzen() {
  const y = Math.max(60, Math.sin(neigung) * abstand);
  kamera.position.set(
    ziel.x + Math.cos(drehung) * Math.cos(neigung) * abstand,
    ziel.y + y,
    ziel.z + Math.sin(drehung) * Math.cos(neigung) * abstand
  );
  kamera.lookAt(ziel);
  kamera.far = abstand * 4 + radius * 2;
  kamera.updateProjectionMatrix();
}
kameraSetzen();

// ---- Steuerung (eigen, statt OrbitControls) ---------------------------------
// OrbitControls liegt als ES-Modul mit eigenen Imports vor und liesse sich
// ohne Buendler nur mit Basteln einbetten. Drehen, Zoomen und Schieben sind
// hier 60 Zeilen — das ist robuster als ein halb umgebautes Fremdmodul.
let zieht = false;
let letzteX = 0;
let letzteY = 0;
let fingerAbstand = 0;

const leinwand = maler.domElement;
leinwand.addEventListener('pointerdown', e => {
  zieht = true;
  letzteX = e.clientX;
  letzteY = e.clientY;
  leinwand.setPointerCapture(e.pointerId);
});
leinwand.addEventListener('pointerup', e => {
  zieht = false;
  try { leinwand.releasePointerCapture(e.pointerId); } catch (_) {}
});
leinwand.addEventListener('pointermove', e => {
  if (!zieht) return;
  drehung += (e.clientX - letzteX) * 0.005;
  neigung = Math.max(0.05, Math.min(1.5, neigung + (e.clientY - letzteY) * 0.005));
  letzteX = e.clientX;
  letzteY = e.clientY;
  kameraSetzen();
});
leinwand.addEventListener('wheel', e => {
  e.preventDefault();
  abstand = Math.max(radius * 0.15, Math.min(radius * 8, abstand * (e.deltaY < 0 ? 0.9 : 1.1)));
  kameraSetzen();
}, { passive: false });

leinwand.addEventListener('touchstart', e => {
  if (e.touches.length === 2) {
    fingerAbstand = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
  }
}, { passive: true });
leinwand.addEventListener('touchmove', e => {
  if (e.touches.length === 2 && fingerAbstand > 0) {
    e.preventDefault();
    const jetzt = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    abstand = Math.max(radius * 0.15, Math.min(radius * 8, abstand * (fingerAbstand / jetzt)));
    fingerAbstand = jetzt;
    kameraSetzen();
  }
}, { passive: false });

document.getElementById('einpassen').addEventListener('click', () => {
  drehung = -Math.PI / 4;
  neigung = 0.62;
  abstand = abstandFuerGanzeHalle();
  kameraSetzen();
});

let vogel = false;
document.getElementById('draufsicht').addEventListener('click', () => {
  vogel = !vogel;
  neigung = vogel ? 1.5 : 0.62;
  abstand = abstandFuerGanzeHalle();
  kameraSetzen();
});

addEventListener('resize', () => {
  kamera.aspect = wrap.clientWidth / wrap.clientHeight;
  abstand = Math.max(abstand, abstandFuerGanzeHalle() * 0.35);
  kamera.updateProjectionMatrix();
  maler.setSize(wrap.clientWidth, wrap.clientHeight);
  kameraSetzen();
});

document.getElementById('zahlen').textContent =
  wandZahl + ' Wände · ' + moebelZahl + ' Einrichtungsgegenstände · ' +
  (breite / 100).toFixed(1).replace('.', ',') + ' m × ' +
  (tiefe / 100).toFixed(1).replace('.', ',') + ' m';

function bild() {
  requestAnimationFrame(bild);
  maler.render(szene, kamera);
}
bild();

// Fuer die Standbild-Erzeugung (tools/baue-bank-bilder.mjs) und als ehrliche
// Selbstauskunft: was wurde wirklich gebaut?
window.__modell = {
  wandZahl, moebelZahl, breite, tiefe,
  blick: (d, n) => {
    drehung = d; neigung = n; abstand = abstandFuerGanzeHalle(); kameraSetzen();
  },
  /**
   * Wie viele verschiedene Farbtoene stehen gerade im Bild? Beweist, dass
   * wirklich etwas zu sehen ist — ein leerer Betrachter meldet sich genauso
   * bereit wie ein voller.
   *
   * Gelesen wird DIREKT aus WebGL und unmittelbar nach einem render(). Der
   * naheliegende Weg (das Canvas per drawImage auf ein 2D-Canvas kopieren)
   * liefert ein LEERES Bild: ohne preserveDrawingBuffer ist der Zeichenpuffer
   * nach dem Anzeigen dahin. Genau daran scheiterte die erste Messung — sie
   * meldete "1 Farbton", waehrend das Standbild die ganze Halle zeigte.
   */
  farbtoene: () => {
    maler.render(szene, kamera);
    const gl = maler.getContext();
    const b = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const px = new Uint8Array(b * h * 4);
    gl.readPixels(0, 0, b, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const toene = new Set();
    for (let i = 0; i < px.length; i += 4 * 37) {
      toene.add((px[i] >> 4) + ',' + (px[i + 1] >> 4) + ',' + (px[i + 2] >> 4));
    }
    return toene.size;
  }
};
window.__bereit = true;
`

// ------------------------------------------------------------------ HTML

const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Halle 400 — Büroflächen, räumliches Modell</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
  body { display: flex; flex-direction: column; background: #eef2f6; color: #1d2733; }
  header { padding: 14px 20px; background: #fff; border-bottom: 1px solid #d7dee6; }
  h1 { margin: 0; font-size: 17px; font-weight: 600; }
  #zahlen { margin-top: 3px; font-size: 13px; color: #5b6875; }
  #buehne { flex: 1; min-height: 0; position: relative; }
  #buehne canvas { display: block; touch-action: none; }
  #leiste { position: absolute; left: 14px; bottom: 14px; display: flex; gap: 8px; flex-wrap: wrap; }
  button {
    font: inherit; font-size: 14px; padding: 10px 15px; min-height: 44px;
    border: 1px solid #c3ccd6; border-radius: 7px; background: rgba(255,255,255,.94);
    cursor: pointer; color: #1d2733;
  }
  button:hover { background: #fff; border-color: #97a4b2; }
  #hinweis {
    position: absolute; right: 14px; bottom: 14px; max-width: 46ch;
    font-size: 12px; line-height: 1.45; color: #5b6875;
    background: rgba(255,255,255,.9); padding: 8px 11px; border-radius: 7px;
  }
  @media (max-width: 620px) { #hinweis { display: none; } }
</style>
</head>
<body>
<header>
  <h1>Halle 400 — Büroflächen, räumliches Modell</h1>
  <div id="zahlen">wird geladen …</div>
</header>
<div id="buehne">
  <div id="leiste">
    <button id="einpassen" type="button">Ganze Halle zeigen</button>
    <button id="draufsicht" type="button">Draufsicht</button>
  </div>
  <div id="hinweis">
    Ziehen dreht die Ansicht, Mausrad zoomt (am Handy zwei Finger).
    Maße stammen aus dem Grundriss; die Wandhöhe von 3,00 m ist eine gesetzte
    Annahme, da ein Grundriss keine Höhen enthält.
  </div>
</div>
<script>
${three}
${betrachter.replace('__DATEN__', JSON.stringify(daten))}
</script>
</body>
</html>
`

fs.writeFileSync(ZIEL, html, 'utf8')

const groesseMB = (fs.statSync(ZIEL).size / 1024 / 1024).toFixed(2)
console.log(`Bank-Ansicht geschrieben: ${ZIEL}`)
console.log(`  Groesse:      ${groesseMB} MB (eine Datei, keine Begleitdateien)`)
console.log(`  Waende:       ${daten.walls.length}`)
console.log(`  Ausstattung:  ${daten.ausstattung.length}`)
console.log(`  Hoehen aus:   src/three/ausstattung.ts (${Object.keys(OBERKANTE_CM).length} Typen, gelesen statt abgeschrieben)`)
