// DAS SIEGEL (W11-Schutz) — der Plan traegt eine Unterschrift, die nur EINER
// leisten kann.
//
//   node tools/siegel.mjs erzeuge [--nach <ordner>]   Schluesselpaar + Passwort anlegen
//   node tools/siegel.mjs signiere [--plan halle400]  den Plan unterschreiben
//   node tools/siegel.mjs pruefe <datei.html>         eine Datei nachpruefen
//   node tools/siegel.mjs zeige                       Inhaber, Datum, Abdruck
//
// WAS DIESES WERKZEUG LOEST UND WAS NICHT
// Eine Datei, die man aus der Hand gibt, kann man nicht daran hindern, veraendert
// zu werden — wer sie besitzt, hat einen Texteditor. Was man sehr wohl kann:
// jede Veraenderung SICHTBAR und BEWEISBAR machen. Genau das ist eine Signatur.
// Der private Schluessel liegt beim Verfasser, der oeffentliche in der Datei;
// aus dem oeffentlichen laesst sich keine gueltige Unterschrift herstellen.
// Wer den Plan aendert, kann ihn nicht mehr unterschreiben — und die Datei sagt
// es beim Oeffnen. Wer stattdessen die Pruefung selbst herausschneidet, haelt
// eine Datei ohne Siegel in der Hand, und die ist erkennbar nicht das Original.
//
// WARUM ECDSA P-256 UND NICHT ED25519 — GEMESSEN, NICHT ANGENOMMEN
// Unter file:// mit hart gesperrtem Netz, in allen drei Motoren:
//     Chromium 1228   Ed25519 JA    ECDSA P-256 JA
//     Firefox  151    Ed25519 JA    ECDSA P-256 JA
//     WebKit   26.5   Ed25519 NEIN  ECDSA P-256 JA   (NotSupportedError)
// WebKit ist Safari, und der Nutzer arbeitet oft vom Telefon. Ed25519 waere das
// modernere Verfahren und haette in genau der Haelfte der Faelle geschwiegen.
// `window.isSecureContext` ist unter file:// in allen dreien `true`, deshalb
// steht `crypto.subtle` ueberhaupt zur Verfuegung.
//
// EINE QUELLE FUER BEIDE SEITEN
// Unterschrieben und geprueft wird mit DERSELBEN API: node bringt WebCrypto
// mit (`crypto.webcrypto.subtle`). Die Vertraeglichkeit zwischen dem Werkzeug
// hier und der Pruefung im Browser ist damit gebaut, nicht gehofft — es ist
// buchstaeblich derselbe Aufruf mit denselben Parametern.
//
// WAS UNTERSCHRIEBEN WIRD
// Nicht das geparste Objekt, sondern der ROH-TEXT des Plans, Zeichen fuer
// Zeichen so, wie er in die Datei eingebaut wird. Ein Objekt muesste man vor
// dem Unterschreiben in eine kanonische Form bringen, und jede Abweichung
// zwischen den beiden Kanonisierungen waere ein stiller Fehlalarm. Der Bauer
// legt den Text darum als `PLAN_TEXT` ab und liest `PLAN` daraus.

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'

const { subtle } = crypto.webcrypto
const HIER = path.dirname(fileURLToPath(import.meta.url))
const WURZEL = path.resolve(HIER, '..')

/* Der Ablageort der Siegel-Dateien. Regulaer `data/`. Ueber HALLE400_DATEN
   umlenkbar — nicht als Bequemlichkeit, sondern damit `pruefe-siegel.mjs` einen
   ganzen Durchlauf (Schluessel anlegen, unterschreiben, bauen, nachpruefen,
   manipulieren) in einem Wegwerf-Ordner fahren kann, OHNE das echte Siegel
   anzufassen. Ein Gate, das seine Pruefung mit den scharfen Dateien macht, hat
   genau einen schlechten Tag, und danach ist die Auslieferung unbrauchbar. */
const DATEN_ORDNER = process.env.HALLE400_DATEN || path.join(WURZEL, 'data')
const OEFFENTLICH_PFAD = path.join(DATEN_ORDNER, 'siegel-oeffentlich.json')
const SIEGEL_ORDNER = DATEN_ORDNER

// Der Ablageort der Geheimnisse. Bewusst AUSSERHALB des Repos: dieses Projekt
// hat eine GitHub-Gegenstelle, und ein privater Schluessel, der einmal
// gepusht wurde, ist fuer immer verbrannt.
const GEHEIM_ORDNER_STANDARD = process.env.HALLE400_GEHEIM || 'C:/Users/dania/Desktop/hotel400 3d bild'
const PRIVAT_NAME = 'Halle400-SIEGEL-PRIVAT.json'
/* Das Schloss zog bis zum Gegner-Review nach `data/` — und dieses Repo ist
   OEFFENTLICH. Das Paket verraet kein Passwort, aber es ist eine Vorlage zum
   Durchprobieren, und zwar fuer dasselbe Passwort, das den privaten Schluessel
   oeffnet. Ein Angreifer soll dafuer wenigstens auf den Rechner muessen. */
export const SCHLOSS_NAME = 'Halle400-SCHLOSS.json'
export function schlossOrt(){ return path.join(GEHEIM_ORDNER_STANDARD, SCHLOSS_NAME) }

const arg = (name, standard) => {
  const i = process.argv.indexOf(name)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : standard
}
const hatFlagge = (name) => process.argv.includes(name)

/* ── Passwort-Erzeugung ───────────────────────────────────────────────
   Sieben Woerter aus 256 sind 56 Bit. Zusammen mit 600 000 PBKDF2-Runden
   kostet ein Rateversuch rund eine halbe Sekunde Rechenzeit — 2^56 davon
   sind ausserhalb dessen, was jemand aufwendet, der einen Grundriss sehen
   will. Woerter statt Zeichen, weil ein Passwort, das man nicht abtippen
   kann, auf einem Zettel neben dem Rechner landet. */
const WOERTER = (
  'Anker Ahorn Amsel Apfel Abend Atlas Auge Axt Bach Balken Berg Birke Blatt Blume Boot Brief ' +
  'Bruecke Buche Bucht Burg Damm Dach Deich Distel Dohle Donner Dorf Draht Duene Eiche Eimer Eis ' +
  'Elch Ente Erde Esche Falke Faden Fahne Feder Feld Fels Fenster Ferne Feuer Fisch Flagge Fluss ' +
  'Forst Frost Fuchs Garten Gasse Gipfel Glas Glocke Gras Grund Hafen Hagel Hain Halde Halle Hammer ' +
  'Hang Harz Hase Haus Heide Herbst Hirsch Hof Holz Horn Huegel Huette Igel Insel Jahr Kabel ' +
  'Kai Kalk Kamm Kante Kappe Karte Kastanie Kegel Kelle Kerze Kessel Kette Kiefer Kies Klee Klinge ' +
  'Knoten Kohle Kompass Kopf Korb Korn Kran Kreide Kreis Kroete Krone Kufe Kugel Kupfer Kuppel Lampe ' +
  'Land Lanze Latte Laub Leine Lerche Leuchte Licht Linde Lot Luchs Luft Mandel Mantel Markt Marsch ' +
  'Mast Mauer Meer Meile Messer Milbe Mohn Molch Mond Moor Moos Motte Muehle Mulde Mund Muschel ' +
  'Nabe Nadel Nagel Narbe Nebel Nelke Nest Netz Nord Not Nuss Oase Ofen Ohr Olive Orkan ' +
  'Ort Otter Palme Pappel Pfad Pfahl Pfeil Pferd Pflaume Pilz Planke Platte Pol Pult Quader Quelle ' +
  'Rabe Rad Rahmen Rand Rasen Raute Regen Reh Reif Reihe Riegel Riff Rinde Ring Rippe Rohr ' +
  'Rose Rost Ruder Ruine Saal Sack Saeule Salz Same Sand Schacht Schale Schaum Schiene Schiff Schilf ' +
  'Schlei Schleuse Schluessel Schnee Schuppe Schwan See Segel Seil Sicht Sieb Silber Sims Sockel Sonne Spalt ' +
  'Span Specht Speiche Spiegel Spitze Sporn Spur Stab Stadt Stahl Stamm Stein Steg Stern Stiel Stirn ' +
  'Stock Storch Strand Strang Stroh Stufe Sturm Sued Tal Tanne Tau Teich Teller Tier Ton Tor'
).split(/\s+/).filter(Boolean)

function neuesPasswort(woerter = 7) {
  if (WOERTER.length < 256) throw new Error(`Wortliste zu kurz: ${WOERTER.length}`)
  const liste = WOERTER.slice(0, 256)   // exakt 256 -> genau 8 Bit je Wort, kein Modulo-Bias
  const roh = crypto.randomBytes(woerter)
  return Array.from(roh, (b) => liste[b]).join('-')
}

/* ── Passwort -> Schluessel ───────────────────────────────────────────
   Dieselben Zahlen wie in der Datei: wer sie hier aendert, muss sie dort
   mitaendern, sonst laesst sich ein hier verschlossener Schluessel dort nicht
   mehr oeffnen. Sie stehen darum an EINER Stelle und werden exportiert. */
export const PBKDF2_RUNDEN = 600000
export const PBKDF2_HASH = 'SHA-256'

async function schluesselAusPasswort(passwort, salz) {
  const basis = await subtle.importKey('raw', new TextEncoder().encode(passwort), 'PBKDF2', false, ['deriveKey'])
  return subtle.deriveKey(
    { name: 'PBKDF2', salt: salz, iterations: PBKDF2_RUNDEN, hash: PBKDF2_HASH },
    basis, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

const b64 = (buf) => Buffer.from(buf).toString('base64')
const vonB64 = (s) => new Uint8Array(Buffer.from(s, 'base64'))

export async function verschliesse(klartext, passwort) {
  const salz = crypto.randomBytes(16)
  const iv = crypto.randomBytes(12)
  const k = await schluesselAusPasswort(passwort, salz)
  const geheim = await subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(klartext))
  return { verfahren: 'PBKDF2-SHA256/AES-GCM', runden: PBKDF2_RUNDEN, salz: b64(salz), iv: b64(iv), inhalt: b64(geheim) }
}

export async function oeffne(paket, passwort) {
  const k = await schluesselAusPasswort(passwort, vonB64(paket.salz))
  // AES-GCM ist beglaubigend: ein falsches Passwort scheitert HIER mit einem
  // Fehler, nicht mit sinnlosem Klartext. Es gibt darum keinen Vergleich zu
  // schreiben, den man ueberspringen koennte.
  const klar = await subtle.decrypt({ name: 'AES-GCM', iv: vonB64(paket.iv) }, k, vonB64(paket.inhalt))
  return new TextDecoder().decode(klar)
}

/* ── erzeuge ──────────────────────────────────────────────────────────── */
async function befehlErzeuge() {
  const nach = arg('--nach', GEHEIM_ORDNER_STANDARD)
  const inhaber = arg('--inhaber', 'Dania — Halle 400')
  const privatPfad = path.join(nach, PRIVAT_NAME)

  if (fs.existsSync(privatPfad) && !hatFlagge('--ueberschreibe')) {
    console.error(`Es liegt schon ein Schluessel: ${privatPfad}`)
    console.error('Ihn zu ersetzen macht JEDE bisher unterschriebene Datei ungueltig.')
    console.error('Wenn das wirklich gewollt ist: --ueberschreibe')
    process.exit(1)
  }
  if (!fs.existsSync(nach)) fs.mkdirSync(nach, { recursive: true })

  const passwort = hatFlagge('--passwort') ? arg('--passwort', '') : neuesPasswort()
  if (!passwort || passwort.length < 12) { console.error('Passwort zu kurz (mindestens 12 Zeichen).'); process.exit(1) }

  const paar = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const privJwk = await subtle.exportKey('jwk', paar.privateKey)
  const oeffJwk = await subtle.exportKey('jwk', paar.publicKey)
  const erzeugtAm = new Date().toISOString()

  // Der oeffentliche Teil darf ins Repo — aus ihm laesst sich nichts unterschreiben.
  fs.mkdirSync(SIEGEL_ORDNER, { recursive: true })
  fs.writeFileSync(OEFFENTLICH_PFAD, JSON.stringify({
    zweck: 'Oeffentlicher Siegel-Schluessel. Er PRUEFT Unterschriften und kann keine leisten. Darf veroeffentlicht werden.',
    verfahren: 'ECDSA P-256 / SHA-256',
    inhaber, erzeugtAm,
    jwk: { kty: oeffJwk.kty, crv: oeffJwk.crv, x: oeffJwk.x, y: oeffJwk.y },
  }, null, 2) + '\n', 'utf8')

  /* Das SCHLOSS der Datei. Ein Paket, dessen Klartext bekannt ist und das sich
     nur mit dem richtigen Passwort oeffnen laesst. AES-GCM ist beglaubigend:
     ein falsches Passwort scheitert mit einem Fehler, nicht mit sinnlosem
     Klartext — es gibt also keinen Vergleich, den jemand ueberspringen koennte,
     und kein Passwort steht irgendwo, auch nicht als Abdruck.
     Es darf offen daliegen: aus 600 000 Runden ueber sieben Zufallswoerter
     laesst sich nichts zurueckrechnen. */
  const schloss = await verschliesse(JSON.stringify({
    zweck: 'Halle 400 — Werkstatt aufschliessen', inhaber, erzeugtAm,
  }), passwort)
  fs.mkdirSync(path.dirname(schlossOrt()), { recursive: true })
  fs.writeFileSync(schlossOrt(), JSON.stringify({
    zweck: 'Das Schloss vor dem Bearbeiten. Enthaelt KEIN Passwort und keinen Abdruck davon — nur einen bekannten Satz, den man ohne das Passwort nicht lesen kann.',
    ...schloss,
  }, null, 2) + '\n', 'utf8')

  // Der private Teil geht NUR in den Geheim-Ordner, und dort verschlossen.
  const paket = await verschliesse(JSON.stringify(privJwk), passwort)
  fs.writeFileSync(privatPfad, JSON.stringify({
    zweck: 'PRIVATER Siegel-Schluessel von Halle 400. Wer ihn UND das Passwort hat, kann Plaene als echt unterschreiben.',
    warnung: 'Niemals verschicken, niemals in ein Repository legen, niemals in eine Cloud ohne eigene Verschluesselung.',
    inhaber, erzeugtAm, verfahren: 'ECDSA P-256, verschlossen mit ' + paket.verfahren,
    paket,
  }, null, 2) + '\n', 'utf8')

  console.log('Siegel angelegt.')
  console.log('')
  console.log('  Oeffentlich (darf ins Repo):  ' + OEFFENTLICH_PFAD)
  console.log('  Schloss (bleibt bei dir):     ' + schlossOrt())
  console.log('  PRIVAT (bleibt bei dir):      ' + privatPfad)
  console.log('  Inhaber:                      ' + inhaber)
  console.log('')
  console.log('  PASSWORT:  ' + passwort)
  console.log('')
  console.log('  Dieses eine Passwort tut zwei Dinge: es oeffnet den privaten Schluessel')
  console.log('  zum Unterschreiben UND schaltet in der Datei das Bearbeiten frei.')
  console.log('  Es steht hier zum letzten Mal — es ist nirgends im Klartext gespeichert.')
  return passwort
}

/* ── signiere ─────────────────────────────────────────────────────────── */
async function privatenSchluesselHolen(passwort, ordner) {
  const privatPfad = path.join(ordner || GEHEIM_ORDNER_STANDARD, PRIVAT_NAME)
  if (!fs.existsSync(privatPfad)) {
    throw new Error(`Kein privater Schluessel: ${privatPfad}\nZuerst: node tools/siegel.mjs erzeuge`)
  }
  const akte = JSON.parse(fs.readFileSync(privatPfad, 'utf8'))
  let jwkText
  try {
    jwkText = await oeffne(akte.paket, passwort)
  } catch (e) {
    throw new Error('Das Passwort passt nicht zu diesem Schluessel.')
  }
  return subtle.importKey('jwk', JSON.parse(jwkText), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
}

export async function unterschreibe(text, privKey) {
  const sig = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privKey, new TextEncoder().encode(text))
  return b64(sig)
}

export async function pruefeUnterschrift(text, signaturB64, oeffJwk) {
  const k = await subtle.importKey('jwk', { ...oeffJwk, ext: true, key_ops: ['verify'] },
    { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify'])
  return subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, k, vonB64(signaturB64), new TextEncoder().encode(text))
}

/* ── DER SCHLUESSEL-FINGERABDRUCK (Gegner-Fund F1) ────────────────────
   Bis zum Gegner-Review prueften Datei und Werkzeug die Unterschrift gegen
   einen Schluessel, der IN DERSELBEN DATEI liegt. Das ist ein Zirkel: wer den
   Plan aendert und mit einem EIGENEN Schluesselpaar neu unterschreibt, bekommt
   ueberall einen gruenen Haken. GEMESSEN: eine um 3 m verschobene Aussenwand,
   neu unterschrieben — die Datei meldete „Original", das Werkzeug „ECHT".

   Aus einer Datei allein ist Herkunft grundsaetzlich nicht zu beweisen. Was
   geht, ist ein ANKER AUSSERHALB: die Datei zeigt den Fingerabdruck des
   Schluessels, mit dem sie geprueft hat, und der Empfaenger vergleicht ihn mit
   dem, den er auf einem anderen Weg bekommen hat (Deckblatt, Mail, mündlich).
   Stimmen sie ueberein, ist die Aussage vollstaendig; stimmen sie nicht,
   faellt genau die Faelschung auf, die vorher unsichtbar war.

   Kurz und in Gruppen, weil er ABGELESEN und VERGLICHEN wird: 16 Hex-Zeichen
   sind 64 Bit — genug, dass niemand einen zweiten Schluessel mit demselben
   Anfang erzeugt, und kurz genug, dass man ihn am Telefon durchgibt. */
export async function schluesselAbdruck(jwk) {
  const fest = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y })
  const h = await subtle.digest('SHA-256', new TextEncoder().encode(fest))
  const hex = [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return hex.slice(0, 16).replace(/(.{4})(?=.)/g, '$1·')
}

export function siegelPfad(planName) { return path.join(SIEGEL_ORDNER, `siegel-${planName}.json`) }

export function siegelLesen(planName) {
  const p = siegelPfad(planName)
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null
}

export function oeffentlichLesen() {
  return fs.existsSync(OEFFENTLICH_PFAD) ? JSON.parse(fs.readFileSync(OEFFENTLICH_PFAD, 'utf8')) : null
}

async function befehlSigniere() {
  const planName = arg('--plan', 'halle400')
  const passwort = arg('--passwort', process.env.HALLE400_PASSWORT || '')
  if (!passwort) {
    console.error('Ohne Passwort geht das Unterschreiben nicht.')
    console.error('  node tools/siegel.mjs signiere --passwort "<dein-passwort>"')
    console.error('  oder   HALLE400_PASSWORT=... node tools/siegel.mjs signiere')
    process.exit(1)
  }
  const planPfad = path.join(WURZEL, 'app/public/plaene', `${planName}.json`)
  if (!fs.existsSync(planPfad)) { console.error(`Plan nicht gefunden: ${planPfad}`); process.exit(1) }
  const planRoh = fs.readFileSync(planPfad, 'utf8')

  const priv = await privatenSchluesselHolen(passwort, arg('--von', null))
  const signatur = await unterschreibe(planRoh, priv)
  const oeff = oeffentlichLesen()
  if (!oeff) { console.error(`Kein oeffentlicher Schluessel: ${OEFFENTLICH_PFAD}`); process.exit(1) }

  // Sofortige Gegenprobe: unterschreiben und nicht nachpruefen hiesse, dem
  // eigenen Werkzeug zu glauben. Und eine kaputte Unterschrift faellt sonst
  // erst beim Kunden auf.
  if (!await pruefeUnterschrift(planRoh, signatur, oeff.jwk)) {
    console.error('Die eigene Unterschrift haelt der eigenen Pruefung nicht stand — nichts geschrieben.')
    process.exit(1)
  }
  const kaputt = planRoh.replace(/}$/, ' }')
  if (await pruefeUnterschrift(kaputt, signatur, oeff.jwk)) {
    console.error('GEGENPROBE FEHLGESCHLAGEN: ein veraenderter Plan wurde als echt anerkannt — nichts geschrieben.')
    process.exit(1)
  }

  const abdruck = crypto.createHash('sha256').update(planRoh).digest('hex')
  const siegel = {
    zweck: 'Unterschrift unter den gemessenen Plan. Sie gilt fuer den ROH-TEXT der Plan-Datei, Zeichen fuer Zeichen.',
    plan: planName,
    verfahren: 'ECDSA P-256 / SHA-256',
    inhaber: oeff.inhaber,
    signiertAm: new Date().toISOString(),
    planAbdruck: abdruck,
    planBytes: Buffer.byteLength(planRoh, 'utf8'),
    signatur,
  }
  fs.writeFileSync(siegelPfad(planName), JSON.stringify(siegel, null, 2) + '\n', 'utf8')
  console.log(`Unterschrieben: ${planName}`)
  console.log(`  Inhaber:   ${siegel.inhaber}`)
  console.log(`  Datum:     ${siegel.signiertAm}`)
  console.log(`  Abdruck:   ${abdruck.slice(0, 16)}…`)
  console.log(`  Gegenprobe: ein veraenderter Plan wird abgelehnt — geprueft.`)
  console.log(`  -> ${siegelPfad(planName)}`)
}

/* ── pruefe ───────────────────────────────────────────────────────────── */
async function befehlPruefe() {
  const datei = process.argv[3]
  if (!datei || !fs.existsSync(datei)) {
    console.error('Welche Datei? \n  node tools/siegel.mjs pruefe <datei.html>')
    process.exit(1)
  }
  const inhalt = fs.readFileSync(datei, 'utf8')

  /* Aus der Datei herausholen, was sie ueber sich selbst behauptet — und zwar
     aus dem AUSGEFUEHRTEN Skript, nicht aus dem Dateitext.

     W11-NACHTRAG (Gegner-Fund F2): hier stand ein `inhalt.match(...)` ueber die
     ganze Datei, das den ERSTEN Treffer nahm. Ein HTML-Kommentar vor dem
     <title> mit den drei Original-Zeilen genuegte: das Werkzeug las die
     Koeder-Zeilen und meldete „ECHT", waehrend der Browser die echten,
     spaeteren las und einen gefaelschten Plan zeichnete. Beide gruen, beide
     ueber verschiedene Wahrheiten. Zwei Riegel dagegen:
       1. gesucht wird NUR im <script>-Rumpf,
       2. mehr als EIN Treffer je Name ist selbst schon der Befund. Eine Datei,
          die zwei Fassungen ihres eigenen Plans traegt, ist keine, ueber die
          man ein Urteil faellt — sie ist eine, vor der man warnt. */
  const rumpfTreffer = inhalt.match(/<script>([\s\S]*?)<\/script>/)
  const rumpf = rumpfTreffer ? rumpfTreffer[1] : ''
  let mehrdeutig = null
  const holen = (name) => {
    const alle = [...rumpf.matchAll(new RegExp('const ' + name + ' = (.*?);\\n', 'g'))]
    if (alle.length === 0) return null
    if (alle.length > 1) { mehrdeutig = `${name} steht ${alle.length}× im Skript`; return null }
    try { return JSON.parse(alle[0][1]) } catch (e) { return null }
  }
  const planText = holen('PLAN_TEXT')
  const siegel = holen('SIEGEL')
  const oeffJwk = holen('SIEGEL_SCHLUESSEL')

  if (mehrdeutig) {
    console.log('MEHRDEUTIG — diese Datei traegt mehr als eine Fassung ihrer eigenen Angaben.')
    console.log(`  ${mehrdeutig}`)
    console.log('  Ueber so eine Datei laesst sich kein Urteil faellen: welche Fassung der Browser')
    console.log('  ausfuehrt, entscheidet die Reihenfolge — und die kann jemand gesetzt haben.')
    process.exit(4)
  }
  if (!planText || !siegel || !oeffJwk) {
    console.log('KEIN SIEGEL — diese Datei traegt keine Unterschrift.')
    console.log(`  PLAN_TEXT: ${planText ? 'da' : 'fehlt'} · SIEGEL: ${siegel ? 'da' : 'fehlt'} · SCHLUESSEL: ${oeffJwk ? 'da' : 'fehlt'}`)
    console.log('  Eine Datei ohne Siegel ist nicht das Original.')
    process.exit(2)
  }
  const echt = await pruefeUnterschrift(planText, siegel.signatur, oeffJwk)
  const eigen = oeffentlichLesen()
  const vonMir = eigen && JSON.stringify(eigen.jwk) === JSON.stringify(oeffJwk)

  console.log(`Datei:     ${datei}`)
  console.log(`Inhaber:   ${siegel.inhaber}`)
  console.log(`Signiert:  ${siegel.signiertAm}`)
  console.log(`Schluessel: ${await schluesselAbdruck(oeffJwk)}  ${vonMir ? '— DEINER (identisch mit data/siegel-oeffentlich.json)' : '— FREMD, NICHT deiner!'}`)
  console.log(`Plan:      ${Buffer.byteLength(planText, 'utf8')} Bytes`)
  console.log('')
  if (echt && vonMir) { console.log('ECHT — der Plan in dieser Datei ist unveraendert und von dir unterschrieben.'); process.exit(0) }
  if (echt && !vonMir) {
    console.log('GUELTIG, ABER FREMD — die Unterschrift haelt, stammt aber NICHT von deinem Schluessel.')
    console.log('Genau so sieht eine Faelschung aus: jemand hat den Plan geaendert und mit einem')
    console.log('eigenen Schluessel neu unterschrieben. Die Datei allein kann das nicht merken.')
    process.exit(3)
  }
  console.log('VERAENDERT — der Plan passt nicht zur Unterschrift. Diese Datei ist nicht das Original.')
  process.exit(1)
}

/* ── schloss ──────────────────────────────────────────────────────────
   Das Schloss allein neu setzen. Zwei Faelle: es fehlt (aeltere Anlage), oder
   es soll erneuert werden, ohne den Schluessel anzufassen. */
async function befehlSchloss() {
  const passwort = arg('--passwort', process.env.HALLE400_PASSWORT || '')
  if (!passwort) { console.error('node tools/siegel.mjs schloss --passwort "..."'); process.exit(1) }
  // Das Passwort MUSS zum vorhandenen Schluessel passen, sonst entstuenden zwei
  // Geheimnisse: eins fuers Unterschreiben, eins fuers Aufschliessen. Genau
  // dieser stille Auseinanderfall ist der Grund, warum es nur EINS geben soll.
  await privatenSchluesselHolen(passwort, arg('--von', null))
  const oeff = oeffentlichLesen()
  const schloss = await verschliesse(JSON.stringify({
    zweck: 'Halle 400 — Werkstatt aufschliessen',
    inhaber: oeff ? oeff.inhaber : 'unbekannt',
    erzeugtAm: new Date().toISOString(),
  }), passwort)
  fs.mkdirSync(path.dirname(schlossOrt()), { recursive: true })
  fs.writeFileSync(schlossOrt(), JSON.stringify({
    zweck: 'Das Schloss vor dem Bearbeiten. Enthaelt KEIN Passwort und keinen Abdruck davon.',
    ...schloss,
  }, null, 2) + '\n', 'utf8')
  console.log('Schloss neu gesetzt: ' + schlossOrt())
  console.log('Die Datei muss neu gebaut werden, damit es ankommt: node tools/baue-planer-datei.mjs')
}

/* ── passwort-aendern ────────────────────────────────────────────────── */
async function befehlPasswortAendern() {
  const alt = arg('--alt', ''), neu = arg('--neu', '')
  if (!alt || !neu) { console.error('node tools/siegel.mjs passwort-aendern --alt "..." --neu "..."'); process.exit(1) }
  if (neu.length < 12) { console.error('Das neue Passwort ist zu kurz (mindestens 12 Zeichen).'); process.exit(1) }
  const ordner = arg('--von', GEHEIM_ORDNER_STANDARD)
  const privatPfad = path.join(ordner, PRIVAT_NAME)
  const akte = JSON.parse(fs.readFileSync(privatPfad, 'utf8'))
  let jwkText
  try { jwkText = await oeffne(akte.paket, alt) }
  catch (e) { console.error('Das alte Passwort passt nicht.'); process.exit(1) }

  // Erst die neue Fassung ganz herstellen und PRUEFEN, dann schreiben. Ein
  // Abbruch mitten im Umschluessen liesse eine Akte zurueck, die sich mit
  // keinem der beiden Passwoerter mehr oeffnen laesst.
  const neuesPaket = await verschliesse(jwkText, neu)
  if (await oeffne(neuesPaket, neu) !== jwkText) { console.error('Die neue Fassung liess sich nicht zurueckoeffnen — nichts geaendert.'); process.exit(1) }
  fs.copyFileSync(privatPfad, privatPfad + '.vorher')
  fs.writeFileSync(privatPfad, JSON.stringify({ ...akte, paket: neuesPaket, geaendertAm: new Date().toISOString() }, null, 2) + '\n', 'utf8')

  process.argv.push('--passwort', neu)
  await befehlSchloss()
  console.log('Passwort geaendert. Die alte Akte liegt als ' + path.basename(privatPfad) + '.vorher daneben —')
  console.log('nach einem erfolgreichen Bau kann sie weg.')
}

/* ── zeige ────────────────────────────────────────────────────────────── */
async function befehlZeige() {
  const oeff = oeffentlichLesen()
  if (oeff) {
    console.log('')
    console.log('  DEIN SCHLUESSEL-FINGERABDRUCK:  ' + await schluesselAbdruck(oeff.jwk))
    console.log('  Diesen Wert gibst du dem Empfaenger auf einem ANDEREN Weg als die Datei')
    console.log('  (Deckblatt, Mail, muendlich). Er steht auch oben rechts in der Datei und')
    console.log('  auf jedem Ausdruck. Stimmen beide ueberein, ist der Plan von dir.')
    console.log('')
  }
  const privatPfad = path.join(GEHEIM_ORDNER_STANDARD, PRIVAT_NAME)
  console.log('Oeffentlicher Schluessel: ' + (oeff ? `${OEFFENTLICH_PFAD}\n  Inhaber: ${oeff.inhaber}\n  Angelegt: ${oeff.erzeugtAm}` : 'FEHLT'))
  console.log('Privater Schluessel:      ' + (fs.existsSync(privatPfad) ? privatPfad + ' (verschlossen)' : 'FEHLT'))
  for (const d of fs.existsSync(SIEGEL_ORDNER) ? fs.readdirSync(SIEGEL_ORDNER) : []) {
    if (!/^siegel-.*\.json$/.test(d) || d === 'siegel-oeffentlich.json') continue
    const s = JSON.parse(fs.readFileSync(path.join(SIEGEL_ORDNER, d), 'utf8'))
    console.log(`Unterschrift ${s.plan}: ${s.signiertAm} · Abdruck ${s.planAbdruck.slice(0, 16)}…`)
  }
}

/* Nur ausfuehren, wenn dieses Werkzeug DIREKT gestartet wurde. `baue-planer-datei.mjs`
   importiert `unterschreibe`/`siegelLesen` — liefe der Befehlsteil dabei mit, wuerde er
   dessen `--plan halle400` als eigenen Befehl missverstehen und mitten im Bau abbrechen. */
const direktGestartet = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url
const befehl = direktGestartet ? process.argv[2] : '__als-modul-geladen__'
if (!direktGestartet) { /* nichts tun — nur die Exporte werden gebraucht */ }
else if (befehl === 'erzeuge') await befehlErzeuge()
else if (befehl === 'signiere') await befehlSigniere()
else if (befehl === 'pruefe') await befehlPruefe()
else if (befehl === 'schloss') await befehlSchloss()
else if (befehl === 'passwort-aendern') await befehlPasswortAendern()
else if (befehl === 'zeige') await befehlZeige()
else if (befehl) { console.error(`Unbekannt: ${befehl}`); process.exit(1) }
else {
  console.log('node tools/siegel.mjs erzeuge [--nach <ordner>] [--inhaber "..."]')
  console.log('node tools/siegel.mjs signiere [--plan halle400] --passwort "..."')
  console.log('node tools/siegel.mjs pruefe <datei.html>')
  console.log('node tools/siegel.mjs schloss --passwort "..."')
  console.log('node tools/siegel.mjs passwort-aendern --alt "..." --neu "..."')
  console.log('node tools/siegel.mjs zeige')
}
