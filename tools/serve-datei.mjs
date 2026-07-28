#!/usr/bin/env node
/**
 * Liefert die EINE Doppelklick-Datei ueber das eigene Netz aus.
 *
 * WARUM es das braucht, obwohl die Datei doch per Doppelklick laeuft:
 * Am iPhone und iPad laeuft sie NICHT. Apple hat das direkte Oeffnen lokaler
 * HTML-Dateien in Safari geschlossen (ab iOS 18.5); die Dateien-App zeigt eine
 * .html seither als TEXT statt als Seite. Das 390-px-Layout dieser Datei ist
 * gebaut und geprueft (W8) — und ohne diesen Server praktisch unerreichbar,
 * genau fuer den Nutzer, der oft vom Handy arbeitet.
 *
 * Ueber HTTP ausgeliefert entfaellt das Problem: Safari bekommt eine Kopfzeile
 * `Content-Type: text/html`, und damit ist es eine Seite und kein Text.
 *
 *   node tools/serve-datei.mjs                       # ohne Argumente: laeuft
 *   node tools/serve-datei.mjs --port 3399
 *   node tools/serve-datei.mjs --datei /tmp/bank.html --open
 *
 * Der Stil ist von `tools/serve-local.mjs` uebernommen (dem Server fuer den
 * Planer) — mit EINEM entscheidenden Unterschied: dieser hier hat keine
 * Abbildung von URL auf Dateisystem. Siehe `bearbeite()`.
 */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve, basename } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const WURZEL = resolve(__dirname, '..')

const arg = (name, standard) => {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : standard
}

// Der Standard-Port ist DERSELBE wie beim Planer-Server (3301) — nicht aus
// Bequemlichkeit, sondern weil Tailscale genau diesen Port nach aussen abbildet
// (gemessen: 8458 -> 3301). Ein frisch erfundener Port haette KEINE Freigabe und
// damit keine Handy-Adresse — und die Handy-Adresse ist der ganze Zweck dieses
// Servers. Beide Server gleichzeitig braucht niemand: der eine liefert den
// Planer, der andere die fertige Datei. Ist der Port belegt, sagt es der Server
// im Klartext (s. unten) statt einen Stapelauszug zu drucken.
const PORT_ROH = arg('port', '3301')
const PORT = Number(PORT_ROH)
const DATEI = resolve(WURZEL, arg('datei', 'Halle400-Modell.html'))
const OPEN = process.argv.includes('--open')

// Der Name des Tailscale-Programms ist ueberschreibbar, damit ein Pruefwerkzeug
// den Fall "Tailscale antwortet nicht" messen kann, ohne den Dienst des Rechners
// wirklich abzuschalten. Ein Zweig, den man nicht auslsoen kann, ist ein Zweig,
// den niemand geprueft hat.
const TAILSCALE = process.env.H400_TAILSCALE || 'tailscale'

/* ---------------------------------------------------------------- Vorpruefung */

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error(`\n  Das ist keine Portnummer: "${PORT_ROH}"`)
  console.error(`  Erlaubt ist eine ganze Zahl von 1 bis 65535, z. B.  --port 3301\n`)
  process.exit(1)
}

if (!existsSync(DATEI)) {
  console.error(`\n  Die Datei gibt es nicht: ${DATEI}`)
  console.error(`  Erst bauen:  node tools/baue-planer-datei.mjs`)
  console.error(`  Oder eine andere angeben:  node tools/serve-datei.mjs --datei <pfad>\n`)
  process.exit(1)
}

/* ------------------------------------------------------------ Handy-Adresse */

/**
 * Welche Tailscale-Adresse zeigt WIRKLICH auf diesen Port?
 *
 * Geraten wird hier nichts: `tailscale serve status --json` sagt es. Eine
 * gedruckte, aber tote Adresse ist schlimmer als gar keine — der Nutzer tippt
 * sie am Handy ab und sucht den Fehler bei sich.
 *
 * Rueckgabe: { zustand, adresse|null, satz }
 *   'gemappt'      — es gibt eine Freigabe, `adresse` stimmt
 *   'ohne-freigabe'— Tailscale laeuft, dieser Port ist aber nicht freigegeben
 *   'stumm'        — Tailscale antwortet nicht (Dienst aus, nicht angemeldet)
 *   'fehlt'        — es gibt kein Tailscale auf diesem Rechner
 */
function handyAdresse(port) {
  let ergebnis
  try {
    ergebnis = spawnSync(TAILSCALE, ['serve', 'status', '--json'], {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true
    })
  } catch (err) {
    ergebnis = { error: err }
  }

  if (ergebnis.error && ergebnis.error.code === 'ENOENT') {
    return {
      zustand: 'fehlt',
      adresse: null,
      satz: 'kein Tailscale auf diesem Rechner — ohne Tailscale gibt es keine Handy-Adresse.'
    }
  }
  if (ergebnis.error || ergebnis.status !== 0 || !ergebnis.stdout) {
    const grund = (ergebnis.stderr || '').trim().split('\n')[0] || 'keine Antwort'
    return {
      zustand: 'stumm',
      adresse: null,
      satz: `Tailscale antwortet nicht (${grund}) — darum steht hier keine Adresse.`
    }
  }

  let daten
  try {
    daten = JSON.parse(ergebnis.stdout)
  } catch (_) {
    return {
      zustand: 'stumm',
      adresse: null,
      satz: 'Tailscale antwortet unverstaendlich — darum steht hier keine Adresse.'
    }
  }

  // Die Freigaben stehen unter Web als "<name>:<port>" -> Handlers -> Proxy.
  // Gesucht ist jede Freigabe, deren Proxy auf unseren Port zeigt; 127.0.0.1
  // und localhost sind beide moeglich.
  const treffer = []
  for (const [wirt, satz] of Object.entries(daten.Web || {})) {
    for (const handler of Object.values(satz.Handlers || {})) {
      const ziel = String(handler.Proxy || '')
      if (/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\]):(\d+)\/?$/.test(ziel)) {
        const zielPort = Number(ziel.match(/:(\d+)\/?$/)[1])
        if (zielPort === port) treffer.push(wirt)
      }
    }
  }

  if (treffer.length === 0) {
    return {
      zustand: 'ohne-freigabe',
      adresse: null,
      satz:
        `Tailscale laeuft, aber fuer Port ${port} gibt es keine Freigabe.\n` +
        `         Anlegen mit:  tailscale serve --bg --https=<freier Port> ${port}`
    }
  }

  // Bei mehreren Freigaben die mit der KLEINSTEN aeusseren Portnummer nennen —
  // eine Ausgabe mit drei Adressen ist am Handy keine Hilfe.
  treffer.sort((a, b) => (Number(a.split(':')[1]) || 443) - (Number(b.split(':')[1]) || 443))
  const wirt = treffer[0]
  const aussenPort = Number(wirt.split(':')[1]) || 443
  const name = wirt.split(':')[0]
  const adresse = aussenPort === 443 ? `https://${name}/` : `https://${name}:${aussenPort}/`
  const mehr = treffer.length > 1 ? `   (${treffer.length} Freigaben, das ist die erste)` : ''
  return { zustand: 'gemappt', adresse, satz: `${adresse}${mehr}` }
}

/* ------------------------------------------------------------------- Server */

/**
 * EINE Datei, EIN Pfad — und keine Abbildung dazwischen.
 *
 * Der Pfad der ausgelieferten Datei steht beim Start fest und wird aus der
 * Anfrage NIE abgeleitet. Es gibt hier also kein `join(wurzel, req.url)`, das
 * man mit `..` aus dem Ordner heraustreiben koennte, und keinen Verzeichnis-
 * Index. Ein Server, der versehentlich das halbe Projekt freigibt, ist ein
 * Sicherheitsfehler — und die einzige Bauweise, bei der das strukturell nicht
 * passieren kann, ist die ohne Abbildung.
 */
async function bearbeite(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' })
    return res.end('405 — nur GET\n')
  }

  // Roh zerlegen statt ueber `new URL`: die URL-Klasse RECHNET `..` weg und
  // machte aus `/../CLAUDE.md` klaglos `/CLAUDE.md`. Hier soll die Anfrage
  // aber so beurteilt werden, wie sie ankam.
  let pfad = String(req.url || '').split('?')[0].split('#')[0]
  try {
    pfad = decodeURIComponent(pfad)
  } catch (_) {
    /* kaputte Prozentzeichen: unveraendert weiterreichen, es folgt ohnehin 404 */
  }

  // Der Browser fragt von sich aus nach einem Symbol. 204 ("nichts da, alles
  // gut") statt 404: ein 404 landet als roter Fehler in der Konsole und liesse
  // jede Pruefung "keine Konsolenfehler" an etwas scheitern, das kein Fehler
  // ist. Ausgeliefert wird dabei nichts.
  if (pfad === '/favicon.ico') {
    res.writeHead(204)
    return res.end()
  }

  if (pfad !== '/') {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    return res.end('404 — hier liegt genau eine Seite, und die liegt unter /\n')
  }

  try {
    // Bei JEDER Anfrage frisch lesen: wer nebenher neu baut, sieht den neuen
    // Stand nach einem Neuladen. Beim Start einmal einzulesen waere schneller
    // und zeigte nach einem Neubau still den alten Stand.
    const inhalt = await readFile(DATEI)
    res.writeHead(200, {
      // Diese Kopfzeile IST der Grund fuer den ganzen Server: ohne sie zeigt
      // Safari die Datei als Text.
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': inhalt.length,
      'Cache-Control': 'no-cache',
      // Die Datei kommt ohne Netzzugriffe aus (in drei Engines gemessen). Dann
      // darf man das auch durchsetzen: verirrt sich je eine Adresse nach
      // draussen hinein, faellt es hier auf, statt bei der Bank.
      'Content-Security-Policy':
        "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; connect-src 'self' data: blob:"
    })
    return res.end(req.method === 'HEAD' ? undefined : inhalt)
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    return res.end(`500 — ${err.message}\n`)
  }
}

const server = createServer((req, res) => {
  bearbeite(req, res).catch(() => {
    try {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('500\n')
    } catch (_) {
      /* Antwort schon unterwegs */
    }
  })
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} ist belegt — laeuft dort schon ein Server?`)
    console.error(`  Entweder im Browser oeffnen:  http://localhost:${PORT}/`)
    console.error(`  Oder einen anderen Port nehmen:  node tools/serve-datei.mjs --port ${PORT + 1}\n`)
    process.exit(1)
  }
  if (err.code === 'EACCES') {
    console.error(`\n  Port ${PORT} ist gesperrt (Ports unter 1024 braucht das System fuer sich).`)
    console.error(`  Nimm einen ueber 1024:  node tools/serve-datei.mjs --port 3301\n`)
    process.exit(1)
  }
  console.error(`\n  Der Server konnte nicht starten: ${err.message}\n`)
  process.exit(1)
})

// Gebunden wird NUR auf 127.0.0.1. Tailscale reicht die Anfragen des Handys
// genau dorthin weiter (`proxy http://127.0.0.1:<port>`) — das Handy erreicht
// die Seite also, ohne dass sie dem ganzen WLAN offensteht.
server.listen(PORT, '127.0.0.1', async () => {
  const groesse = (await stat(DATEI)).size
  const handy = handyAdresse(PORT)

  console.log(`\n  Halle 400 — die Doppelklick-Datei ueber das eigene Netz`)
  console.log(`  Datei: ${basename(DATEI)}  (${Math.round(groesse / 1024)} KB)`)
  console.log(`         ${DATEI}`)
  console.log(``)
  console.log(`  PC:    http://localhost:${PORT}/`)
  console.log(`  Handy: ${handy.satz}`)
  if (handy.zustand === 'gemappt') {
    console.log(`         (am Handy den NAMEN eingeben, nicht die IP — die IP ergibt 404)`)
  }
  console.log(``)
  console.log(`  Es wird NUR diese eine Datei ausgeliefert, sonst nichts.`)
  console.log(`  Beenden: Strg+C\n`)

  if (OPEN) {
    const befehl = process.platform === 'win32' ? 'explorer' : 'open'
    spawn(befehl, [`http://localhost:${PORT}/`], { detached: true, stdio: 'ignore' }).unref()
  }
})

// Der Name der Datei taucht in der Ausgabe auf, `join` sonst nirgends mehr —
// die Zeile haelt den Import ehrlich beisammen, falls jemand ihn spaeter sucht.
void join
