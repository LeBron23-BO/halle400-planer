// Prueft die AUSLIEFERUNG UEBER DAS EIGENE NETZ (W10) — tools/serve-datei.mjs.
//
//   node tools/pruefe-serve-datei.mjs
//   Exit 0 = alle Pruefungen bestanden, 1 = mindestens eine durchgefallen.
//
// WORUM ES GEHT
// Am iPhone und iPad laeuft die Doppelklick-Datei NICHT: Safari zeigt eine
// lokale .html seit iOS 18.5 als TEXT statt als Seite. `serve-datei.mjs`
// schliesst diese Luecke, indem es die EINE Datei ueber HTTP ausliefert. Damit
// haengt an diesem Server der ganze Handy-Zugang — und ein Server, der
// versehentlich mehr ausliefert als diese eine Datei, gibt ein OEFFENTLICHES
// Repo mit privaten Plaenen frei. Beide Seiten dieser Klinge werden hier
// gemessen.
//
// AM ECHTEN KONSUMENTEN, OHNE ATTRAPPEN
// Gemessen wird nicht an nachgebauten Regeln, sondern am gestarteten Prozess
// mit echten HTTP-Anfragen. Auch die vier Zustaende der Handy-Adresse entstehen
// echt statt aus einer Attrappe:
//   gemappt        — der WIRKLICHE Tailscale-Dienst dieses Rechners, auf dem
//                    Port, den er wirklich abbildet (heute 3301 -> 8458)
//   ohne-freigabe  — derselbe Dienst auf einem Port ohne Freigabe
//   fehlt          — H400_TAILSCALE auf einen Namen, den es nicht gibt (ENOENT)
//   stumm          — H400_TAILSCALE auf `git`: existiert, kennt `serve` aber
//                    nicht und endet mit Fehler
// Der Umlenkhaken H400_TAILSCALE ist im Server genau dafuer gebaut ("ein Zweig,
// den man nicht ausloesen kann, ist ein Zweig, den niemand geprueft hat") — vor
// diesem Gate hat ihn nichts benutzt.
//
// VIERZEHN BEHAUPTUNGEN, jede mit Gegenprobe wo eine moeglich ist:
//
//   a) `/` liefert 200 mit `text/html` — die Kopfzeile, die den ganzen Server
//      rechtfertigt — und der Rumpf ist BYTE-IDENTISCH mit der Datei.
//   b) Jeder andere Pfad ergibt 404, und die Antwort traegt NICHTS aus dem
//      Projekt. GEGENPROBE: derselbe Server, Pfad `/`, liefert 1 MB.
//   c) Eine ROHE Anfrage `GET /../CLAUDE.md` ergibt 404. Das ist der Angriff,
//      den `new URL` stumm zu `/CLAUDE.md` weggerechnet haette; deshalb zerlegt
//      der Server die Zeile selbst. Gesendet wird ueber einen Socket, weil ein
//      HTTP-Client die Punkte auf dem Weg normalisieren wuerde.
//   d) `/favicon.ico` ergibt 204 ohne Rumpf — nicht 404, damit die Pruefung
//      "keine Konsolenfehler" nicht an etwas scheitert, das kein Fehler ist.
//   e) POST ergibt 405 mit `Allow: GET, HEAD`.
//   f) HEAD liefert die Kopfzeilen inklusive Laenge, aber KEINEN Rumpf.
//   g) Wer nebenher neu baut, sieht den neuen Stand nach einem Neuladen — die
//      Datei wird bei JEDER Anfrage frisch gelesen.
//   h) Die Antwort traegt die CSP-Kopfzeile, die Zugriffe nach draussen sperrt.
//   i) Gebunden wird NUR auf 127.0.0.1 — die LAN-Adresse des Rechners nimmt
//      keine Verbindung an. Das Handy kommt allein ueber Tailscale herein.
//   j) Eine fehlende Datei bricht den Start ab (Exit 1) und sagt, wie man baut.
//   k) Ein unsinniger Port bricht den Start ab (Exit 1) und nennt den Bereich.
//   l) Ein belegter Port bricht mit KLARTEXT ab (Exit 1) statt mit Stapelauszug.
//   m) Die gedruckte Handy-Adresse ist die WIRKLICHE Freigabe dieses Ports.
//      GEGENPROBE: auf einem Port ohne Freigabe wird KEINE Adresse gedruckt,
//      sondern der Anlege-Befehl. Eine gedruckte, aber tote Adresse ist
//      schlimmer als gar keine.
//   n) Antwortet Tailscale nicht oder fehlt es, erfindet der Server nichts,
//      sondern nennt den Grund.
import fs from 'node:fs'
import os from 'node:os'
import net from 'node:net'
import path from 'node:path'
import http from 'node:http'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const WURZEL = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const SERVER = path.join(WURZEL, 'tools', 'serve-datei.mjs')
const DATEI = path.join(WURZEL, 'Halle400-Modell.html')
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'h400-serve-'))
const BERICHT = path.join(DIR, 'bericht.txt')
fs.writeFileSync(BERICHT, '')

const log = (s) => {
  console.log(s)
  fs.appendFileSync(BERICHT, s + '\n')
}
const fehler = []
// Das Format ist NICHT frei gewaehlt: `tools/alle-gates.sh` zaehlt die
// bestandenen Pruefungen ueber `^OK  ` und die durchgefallenen ueber `^FEHL`.
// Ein eigenes, schoeneres Format haette dort "0 Pruefungen" gemeldet — fuer ein
// Gate, das gerade 27 gefahren hat. Genau diese Luecke steht als Lehre im Kopf
// von alle-gates.sh.
const pruefe = (bedingung, satz) => {
  log(`${bedingung ? 'OK  ' : 'FEHL'} ${satz}`)
  if (!bedingung) fehler.push(satz)
}

/* ------------------------------------------------------------- Werkzeugkasten */

/** Ein freier Port, vom Betriebssystem vergeben — nicht geraten. */
const freierPort = () =>
  new Promise((fertig) => {
    const s = net.createServer()
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port
      s.close(() => fertig(p))
    })
  })

/** Laeuft auf diesem Port schon etwas? */
const portBelegt = (port) =>
  new Promise((fertig) => {
    const s = net.createServer()
    s.once('error', () => fertig(true))
    s.listen(port, '127.0.0.1', () => s.close(() => fertig(false)))
  })

/**
 * Startet den Server und wartet auf das ENDE seiner Startmeldung.
 *
 * Gewartet wird auf ein Merkmal der Ausgabe, nicht auf eine Zeitspanne: ein
 * `sleep 2` ist auf einem beschaeftigten Rechner zu kurz und sonst zu lang.
 * Endet der Prozess vorher, ist das die Antwort (Fehlstart) und keine Panne.
 *
 * Gewartet wird auf die LETZTE Zeile ("Beenden: Strg+C") und nicht auf die
 * PC-Adresse: die Handy-Zeile steht dazwischen und kommt oft in einem spaeteren
 * Stueck der Ausgabe an. Wer bei "PC:" abbricht, liest die Handy-Zeile mal mit
 * und mal nicht — und ein Gate, dessen Ergebnis vom Zeitpunkt eines
 * Puffer-Wechsels abhaengt, misst nicht den Server, sondern das Wetter.
 */
function starte(argumente, umgebung = {}) {
  return new Promise((fertig) => {
    const kind = spawn(process.execPath, [SERVER, ...argumente], {
      cwd: WURZEL,
      env: { ...process.env, ...umgebung },
      windowsHide: true
    })
    let aus = ''
    let erledigt = false
    const abschluss = (ergebnis) => {
      if (erledigt) return
      erledigt = true
      fertig(ergebnis)
    }
    const sammle = (stueck) => {
      aus += stueck
      if (/Beenden: Strg\+C/.test(aus)) {
        abschluss({ kind, aus, gestartet: true, code: null })
      }
    }
    kind.stdout.on('data', (d) => sammle(String(d)))
    kind.stderr.on('data', (d) => sammle(String(d)))
    kind.on('exit', (code) => abschluss({ kind, aus, gestartet: false, code }))
    setTimeout(() => {
      if (!erledigt) {
        kind.kill()
        abschluss({ kind, aus, gestartet: false, code: 'zeit-abgelaufen' })
      }
    }, 20000)
  })
}

/** Eine HTTP-Anfrage. Kein Client-Zauber: Kopfzeilen und Rumpf, wie sie kommen. */
const hol = (port, pfad, methode = 'GET', wirt = '127.0.0.1') =>
  new Promise((fertig, scheitere) => {
    const anfrage = http.request({ host: wirt, port, path: pfad, method: methode }, (antwort) => {
      const stuecke = []
      antwort.on('data', (d) => stuecke.push(d))
      antwort.on('end', () =>
        fertig({
          status: antwort.statusCode,
          kopf: antwort.headers,
          rumpf: Buffer.concat(stuecke)
        })
      )
    })
    anfrage.on('error', scheitere)
    anfrage.setTimeout(15000, () => anfrage.destroy(new Error('Zeit abgelaufen')))
    anfrage.end()
  })

/**
 * Eine Anfragezeile, Zeichen fuer Zeichen so gesendet, wie sie hier steht.
 *
 * Der Weg ueber `http.request` ginge fuer `/../CLAUDE.md` nicht: Clients
 * bereinigen solche Pfade, und dann pruefte das Gate den Client statt den
 * Server. Hier gibt es keinen Client.
 */
const rohAnfrage = (port, zeile) =>
  new Promise((fertig, scheitere) => {
    const draht = net.connect(port, '127.0.0.1', () => {
      draht.write(`${zeile} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`)
    })
    let aus = ''
    draht.setTimeout(15000, () => draht.destroy(new Error('Zeit abgelaufen')))
    draht.on('data', (d) => (aus += String(d)))
    draht.on('error', scheitere)
    draht.on('close', () => fertig(aus))
  })

/** Die LAN-Adresse dieses Rechners — oder null, wenn er nur Loopback hat. */
function lanAdresse() {
  for (const eintraege of Object.values(os.networkInterfaces())) {
    for (const e of eintraege || []) {
      if (e.family === 'IPv4' && !e.internal && !e.address.startsWith('169.254.')) return e.address
    }
  }
  return null
}

/**
 * Welche lokalen Ports bildet Tailscale WIRKLICH nach aussen ab?
 *
 * Diese Zahlen werden gemessen und nicht eingetragen: eine im Gate
 * festgeschriebene Portnummer wuerde still falsch, sobald jemand die Freigabe
 * aendert — und das Gate wuerde dann etwas anderes pruefen als es sagt.
 *
 * Zurueck kommt die GANZE Liste, nicht die erste Freigabe: dieser Rechner
 * bildet mehrere Ports ab, und auf einigen laeuft schon etwas (der
 * Build-Vorschau-Server zum Beispiel). Das Gate braucht eine echte Freigabe auf
 * einem FREIEN Port; welche das ist, entscheidet sich erst beim Nachsehen.
 */
function gemappteFreigaben() {
  const ergebnis = spawnSync('tailscale', ['serve', 'status', '--json'], {
    encoding: 'utf8',
    timeout: 8000,
    windowsHide: true
  })
  if (ergebnis.error || ergebnis.status !== 0 || !ergebnis.stdout) return []
  let daten
  try {
    daten = JSON.parse(ergebnis.stdout)
  } catch (_) {
    return []
  }
  const treffer = []
  for (const [wirt, satz] of Object.entries(daten.Web || {})) {
    for (const handler of Object.values(satz.Handlers || {})) {
      const ziel = String(handler.Proxy || '')
      const m = ziel.match(/^https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):(\d+)\/?$/)
      if (m) treffer.push({ port: Number(m[1]), wirt })
    }
  }
  treffer.sort((a, b) => (Number(a.wirt.split(':')[1]) || 443) - (Number(b.wirt.split(':')[1]) || 443))
  return treffer
}

/* ================================================================= A) Auslieferung */

log('')
log('A) AUSLIEFERUNG — die eine Datei unter dem einen Pfad')

if (!fs.existsSync(DATEI)) {
  log(`FEHL Die zu pruefende Datei fehlt: ${DATEI}`)
  log('       Erst bauen:  node tools/baue-planer-datei.mjs')
  process.exit(1)
}

const PORT_A = await freierPort()
const a = await starte(['--port', String(PORT_A)])
pruefe(a.gestartet, `der Server startet auf Port ${PORT_A}`)

if (!a.gestartet) {
  log('')
  log(`DURCHGEFALLEN: der Server startete nicht — alles Weitere waere ohne Aussage.`)
  log(a.aus)
  process.exit(1)
}

const platte = fs.readFileSync(DATEI)

const wurzel = await hol(PORT_A, '/')
pruefe(wurzel.status === 200, `a) / antwortet 200 (${wurzel.status})`)
pruefe(
  /^text\/html/.test(String(wurzel.kopf['content-type'])),
  `a) / traegt text/html — die Kopfzeile, die Safari die Seite als Seite lesen laesst (${wurzel.kopf['content-type']})`
)
pruefe(
  wurzel.rumpf.equals(platte),
  `a) der Rumpf ist byte-identisch mit der Datei (${wurzel.rumpf.length} von ${platte.length} Byte)`
)
pruefe(
  Number(wurzel.kopf['content-length']) === platte.length,
  `a) die angekuendigte Laenge stimmt (${wurzel.kopf['content-length']})`
)
pruefe(
  /connect-src 'self'/.test(String(wurzel.kopf['content-security-policy'])),
  'h) die Antwort sperrt Zugriffe nach draussen (CSP mit connect-src self)'
)

const claudeMd = await hol(PORT_A, '/CLAUDE.md')
const claudeText = claudeMd.rumpf.toString('utf8')
pruefe(claudeMd.status === 404, `b) /CLAUDE.md ergibt 404 (${claudeMd.status})`)
pruefe(
  !/Halle 400/.test(claudeText) && claudeMd.rumpf.length < 200,
  `b) und traegt nichts aus dem Projekt (${claudeMd.rumpf.length} Byte)`
)
pruefe(
  wurzel.rumpf.length > 500000,
  `b-GEGENPROBE) derselbe Server liefert unter / ${Math.round(wurzel.rumpf.length / 1024)} KB — es ist also nicht einfach alles gesperrt`
)

for (const zeile of ['GET /../CLAUDE.md', 'GET /..%2fCLAUDE.md', 'GET //CLAUDE.md', 'GET /tools/siegel.mjs']) {
  const roh = await rohAnfrage(PORT_A, zeile)
  const erste = roh.split('\r\n')[0]
  pruefe(
    / 404 /.test(erste) && !/Halle 400/.test(roh),
    `c) roh gesendet: "${zeile}" -> ${erste.trim() || 'keine Antwort'}`
  )
}

const symbol = await hol(PORT_A, '/favicon.ico')
pruefe(
  symbol.status === 204 && symbol.rumpf.length === 0,
  `d) /favicon.ico ergibt 204 ohne Rumpf (${symbol.status}, ${symbol.rumpf.length} Byte)`
)

const post = await hol(PORT_A, '/', 'POST')
pruefe(post.status === 405, `e) POST / ergibt 405 (${post.status})`)
pruefe(String(post.kopf.allow) === 'GET, HEAD', `e) und nennt die erlaubten Verben (${post.kopf.allow})`)

const kopfNur = await hol(PORT_A, '/', 'HEAD')
pruefe(
  kopfNur.status === 200 && kopfNur.rumpf.length === 0 && Number(kopfNur.kopf['content-length']) === platte.length,
  `f) HEAD / liefert Kopfzeilen mit Laenge ${kopfNur.kopf['content-length']}, aber keinen Rumpf (${kopfNur.rumpf.length} Byte)`
)

/* g) Frisch gelesen: nebenher geaendert -> nach dem Neuladen der neue Stand.
 *    Geaendert wird eine KOPIE, die dieser Server ausliefert — die echte
 *    Werkstatt-Datei anzufassen waere ein Gate, das das Projekt beschaedigt. */
const KOPIE = path.join(DIR, 'kopie.html')
fs.copyFileSync(DATEI, KOPIE)
const PORT_G = await freierPort()
const g = await starte(['--port', String(PORT_G), '--datei', KOPIE])
pruefe(g.gestartet, `g) ein zweiter Server liefert eine andere Datei (${path.basename(KOPIE)})`)
if (g.gestartet) {
  const vorher = await hol(PORT_G, '/')
  fs.appendFileSync(KOPIE, '\n<!-- nebenher neu gebaut -->\n')
  const nachher = await hol(PORT_G, '/')
  pruefe(
    nachher.rumpf.length > vorher.rumpf.length && /nebenher neu gebaut/.test(nachher.rumpf.toString('utf8')),
    `g) wer nebenher neu baut, sieht den neuen Stand nach dem Neuladen (${vorher.rumpf.length} -> ${nachher.rumpf.length} Byte)`
  )
  g.kind.kill()
}

/* i) Nur Loopback. */
const lan = lanAdresse()
if (lan) {
  let erreichbar = true
  try {
    await hol(PORT_A, '/', 'GET', lan)
  } catch (_) {
    erreichbar = false
  }
  pruefe(!erreichbar, `i) ueber die LAN-Adresse ${lan} nimmt der Server KEINE Verbindung an — nur 127.0.0.1`)
} else {
  pruefe(false, 'i) dieser Rechner hat keine LAN-Adresse — die Loopback-Bindung ist damit UNGEPRUEFT')
}

a.kind.kill()

/* ================================================================= B) Fehlstarts */

log('')
log('B) FEHLSTARTS — was der Server sagt, wenn es nicht geht')

const fehlt = await starte(['--datei', path.join(DIR, 'gibt-es-nicht.html')])
pruefe(
  !fehlt.gestartet && fehlt.code === 1 && /Erst bauen/.test(fehlt.aus),
  `j) eine fehlende Datei bricht ab (Exit ${fehlt.code}) und sagt, wie man baut`
)

const unsinn = await starte(['--port', 'dreitausend'])
pruefe(
  !unsinn.gestartet && unsinn.code === 1 && /1 bis 65535/.test(unsinn.aus),
  `k) ein unsinniger Port bricht ab (Exit ${unsinn.code}) und nennt den Bereich`
)

const PORT_L = await freierPort()
const halter = await starte(['--port', String(PORT_L)])
if (halter.gestartet) {
  const zweiter = await starte(['--port', String(PORT_L)])
  pruefe(
    !zweiter.gestartet && zweiter.code === 1 && /ist belegt/.test(zweiter.aus) && !/at Server\./.test(zweiter.aus),
    `l) ein belegter Port bricht mit Klartext ab (Exit ${zweiter.code}), ohne Stapelauszug`
  )
  halter.kind.kill()
} else {
  pruefe(false, 'l) der Halter-Server startete nicht — der belegte Port bleibt UNGEPRUEFT')
}

/* ============================================================ C) Handy-Adresse */

log('')
log('C) HANDY-ADRESSE — vier Zustaende, alle echt herbeigefuehrt')

const freigaben = gemappteFreigaben()
let abbildung = null
const belegte = []
for (const kandidat of freigaben) {
  if (await portBelegt(kandidat.port)) {
    belegte.push(kandidat.port)
    continue
  }
  abbildung = kandidat
  break
}

if (freigaben.length === 0) {
  pruefe(false, 'm) Tailscale nennt keine einzige Freigabe auf localhost — der Handy-Weg ist UNGEPRUEFT')
} else if (!abbildung) {
  pruefe(
    false,
    `m) alle ${freigaben.length} Freigaben zeigen auf belegte Ports (${belegte.join(', ')}) — ` +
      `das Gate braucht eine davon frei. Beende einen der laufenden Server und starte es erneut.`
  )
} else {
  if (belegte.length) {
    log(`       (uebersprungen, weil dort schon etwas laeuft: Port ${belegte.join(', ')})`)
  }
  const name = abbildung.wirt.split(':')[0]
  const aussen = Number(abbildung.wirt.split(':')[1]) || 443
  const erwartet = aussen === 443 ? `https://${name}/` : `https://${name}:${aussen}/`
  const m = await starte(['--port', String(abbildung.port)])
  pruefe(
    m.gestartet && m.aus.includes(erwartet),
    `m) auf dem abgebildeten Port ${abbildung.port} druckt der Server die WIRKLICHE Adresse ${erwartet}`
  )
  pruefe(
    m.gestartet && /den NAMEN eingeben, nicht die IP/.test(m.aus),
    'm) und den Hinweis, dass die IP am Handy 404 ergibt'
  )
  if (m.gestartet) m.kind.kill()
}

const PORT_OHNE = await freierPort()
const ohne = await starte(['--port', String(PORT_OHNE)])
pruefe(
  ohne.gestartet && /keine Freigabe/.test(ohne.aus) && !/https:\/\/\S+\.ts\.net/.test(ohne.aus),
  `m-GEGENPROBE) auf dem freigabelosen Port ${PORT_OHNE} steht KEINE Adresse, sondern der Anlege-Befehl`
)
pruefe(
  ohne.gestartet && /tailscale serve --bg/.test(ohne.aus),
  'm-GEGENPROBE) und der Befehl ist der, mit dem man die Freigabe anlegt'
)
if (ohne.gestartet) ohne.kind.kill()

const PORT_FEHLT = await freierPort()
const kein = await starte(['--port', String(PORT_FEHLT)], {
  H400_TAILSCALE: 'tailscale-gibt-es-hier-nicht'
})
pruefe(
  kein.gestartet && /kein Tailscale auf diesem Rechner/.test(kein.aus) && !/https:\/\/\S+\.ts\.net/.test(kein.aus),
  'n) fehlt Tailscale, erfindet der Server keine Adresse, sondern sagt es'
)
if (kein.gestartet) kein.kind.kill()

const PORT_STUMM = await freierPort()
const stumm = await starte(['--port', String(PORT_STUMM)], { H400_TAILSCALE: 'git' })
pruefe(
  stumm.gestartet && /antwortet nicht/.test(stumm.aus) && !/https:\/\/\S+\.ts\.net/.test(stumm.aus),
  'n) antwortet Tailscale mit Fehler, nennt der Server den Grund statt eine Adresse zu raten'
)
if (stumm.gestartet) stumm.kind.kill()

/* ==================================================================== Schluss */

log('')
log(fehler.length === 0 ? 'ALLE PRUEFUNGEN BESTANDEN' : `DURCHGEFALLEN: ${fehler.length}`)
fehler.forEach((f) => log('  - ' + f))
log(`Bericht: ${BERICHT}`)
process.exit(fehler.length === 0 ? 0 : 1)
