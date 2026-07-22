#!/usr/bin/env node
/**
 * Statischer Auslieferungs-Server für den Halle-400-Planer.
 *
 * Warum es ihn gibt: `next build` mit `output: 'export'` erzeugt einen reinen
 * Dateiordner (app/out) — zur Laufzeit wird KEIN Next/Node-Server gebraucht.
 * Per Doppelklick (file://) lässt sich der Ordner trotzdem nicht öffnen: Next
 * schreibt absolute /_next/… -Pfade, und ein relatives `assetPrefix` bricht den
 * Build (next/font verlangt führenden Slash). Belegt am 2026-07-22:
 * file:// -> 11× ERR_FILE_NOT_FOUND, über HTTP -> 0 Fehler.
 *
 * Dieser Server schließt genau diese Lücke — ohne Abhängigkeiten, nur Node.
 *
 *   node tools/serve-local.mjs [--port 3301] [--dir app/out] [--open]
 */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname, resolve, normalize, sep } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const PORT = Number(arg('port', 3301))
const ROOT = resolve(arg('dir', join(__dirname, '..', 'app', 'out')))
const OPEN = process.argv.includes('--open')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.gltf': 'model/gltf+json',
  '.glb': 'model/gltf-binary',
  '.txt': 'text/plain; charset=utf-8'
}

/** Verhindert, dass ein ../-Pfad aus dem Ausgabeordner ausbricht. */
function safeJoin(root, urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]).replace(/^\/+/, '')
  const full = resolve(join(root, normalize(clean)))
  if (full !== root && !full.startsWith(root + sep)) return null
  return full
}

async function resolveFile(pathname) {
  const base = safeJoin(ROOT, pathname)
  if (!base) return null

  // Reihenfolge: exakte Datei -> <pfad>.html -> <pfad>/index.html -> index.html
  const kandidaten = [base, `${base}.html`, join(base, 'index.html'), join(ROOT, 'index.html')]
  for (const k of kandidaten) {
    try {
      const s = await stat(k)
      if (s.isFile()) return k
    } catch {
      /* nächster Kandidat */
    }
  }
  return null
}

const server = createServer(async (req, res) => {
  try {
    const datei = await resolveFile(new URL(req.url, 'http://localhost').pathname)
    if (!datei) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      return res.end('404 — nicht gefunden')
    }
    const inhalt = await readFile(datei)
    const typ = MIME[extname(datei).toLowerCase()] ?? 'application/octet-stream'
    // Gehashte Chunks dürfen lange leben; HTML nie (sonst zeigt ein neuer Build alten Stand).
    const cache = datei.includes(`${sep}_next${sep}static${sep}`)
      ? 'public, max-age=31536000, immutable'
      : 'no-cache'
    res.writeHead(200, { 'Content-Type': typ, 'Cache-Control': cache })
    res.end(inhalt)
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end(`500 — ${err.message}`)
  }
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} ist belegt — läuft der Planer schon?`)
    console.error(`  Dann einfach im Browser öffnen:  http://localhost:${PORT}/\n`)
    process.exit(1)
  }
  throw err
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Halle-400-Planer`)
  console.log(`  ausgeliefert aus: ${ROOT}`)
  console.log(`\n  PC:    http://localhost:${PORT}/`)
  console.log(`  Handy: https://zen.taild936f8.ts.net:8458/   (Tailscale muss an sein)`)
  console.log(`\n  Beenden: dieses Fenster schließen oder Strg+C\n`)
  if (OPEN) {
    const cmd = process.platform === 'win32' ? 'explorer' : 'open'
    spawn(cmd, [`http://localhost:${PORT}/`], { detached: true, stdio: 'ignore' }).unref()
  }
})
