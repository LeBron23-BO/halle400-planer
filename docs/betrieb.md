# Betrieb: entwickeln, bauen, ausliefern

## Kurzfassung

| Zweck | Befehl | Adresse |
|---|---|---|
| Entwickeln (Live-Reload) | `cd app && node node_modules/.bin/next dev -p 3300` | PC `http://localhost:3300/` · Handy `https://zen.taild936f8.ts.net:8457/` |
| Bauen (statischer Export) | `cd app && node node_modules/.bin/next build` | Ergebnis in `app/out/` |
| Ausliefern / benutzen | Doppelklick auf **`Halle400-Planer starten.bat`** | PC `http://localhost:3301/` · Handy `https://zen.taild936f8.ts.net:8458/` |

Paketmanager ist **pnpm** (`pnpm-lock.yaml` ist die Wahrheit). Falls `pnpm` nicht im
Pfad ist: `npm install -g pnpm`, dann liegt es in `%APPDATA%\npm`.

## Zwei Fallen, die Zeit kosten (beide belegt am 2026-07-22)

**1. `--turbopack` bricht den Fork.** Das Upstream-Skript `dev` startet mit
`--turbopack`. Turbopack ignoriert aber den `webpack:`-Block in `next.config.ts` —
und genau dort wird `three` für die Library unter `src/` aufgelöst (`src/` liegt
außerhalb von `app/`, deshalb der explizite Alias). Ergebnis: HTTP 500,
„Module not found: three" in `src/blueprint3d.ts:1`.
→ **Ohne `--turbopack` starten.** `next build` ist nicht betroffen (nutzt webpack).

**2. `pnpm exec` bricht wegen sharp ab.** pnpm 11 prüft vor jedem `exec` den
Dependency-Status und verweigert den Dienst, solange ein Build-Skript nicht
freigegeben ist (`ERR_PNPM_IGNORED_BUILDS: sharp`). Freigegeben ist es jetzt über
`pnpm.onlyBuiltDependencies` in der Root-`package.json` — nicht interaktiv über
`pnpm approve-builds`, damit es reproduzierbar bleibt.

## Warum kein Doppelklick auf eine HTML-Datei

Der Export ist ein reiner Dateiordner — zur Laufzeit läuft **kein** Next, kein Node-
Server, keine API. Trotzdem lässt er sich nicht per `file://` öffnen:

- Next schreibt absolute Asset-Pfade (`/_next/static/…`). Über `file://` zeigen die
  ins Laufwerks-Root und laufen ins Leere. Gemessen: **11× `ERR_FILE_NOT_FOUND`,
  weiße Seite**.
- Der übliche Ausweg — relatives `assetPrefix: './'` — **bricht den Build**:
  `next/font` verlangt „a leading slash or an absolute URL".

Deshalb liefert `tools/serve-local.mjs` den Ordner über HTTP aus (Node-Bordmittel,
keine Abhängigkeiten), und `Halle400-Planer starten.bat` macht daraus wieder einen
Doppelklick: Server starten + Browser öffnen. Über HTTP: **0 Console-Fehler.**

Der Server bindet nur an `127.0.0.1`, blockt Pfad-Ausbrüche (auch URL-kodiert,
verifiziert), cached gehashte Chunks dauerhaft und HTML nie — ein neuer Build ist
nach dem Neuladen sofort sichtbar.

## Handy

`tailscale serve` bildet die Ports ab: **8457 → 3300** (Entwicklung), **8458 → 3301**
(Auslieferung). Am Handy immer den Namen `zen.taild936f8.ts.net` verwenden, nie die
IP — `tailscale serve` unterscheidet nach Host-Header, eine IP-Anfrage endet in 404.

## Bekannte offene Punkte

- **Mobile Kopfleiste überlappt** (Upstream-Layout): bei 390 px verdeckt der
  2D/3D-Umschalter „Add Items" und „New Plan". Gehört zu T6 (Handy-Tauglichkeit).
- **Middleware ist im Export wirkungslos.** `app/middleware.ts` (next-intl-Routing)
  wird beim statischen Export ignoriert — Next warnt darüber, der Build bleibt grün.
  Die drei Sprachseiten (`en`/`zh`/`tw`) werden statisch vorgerendert. Beim
  Eindeutschen (T6) fällt die Middleware ersatzlos weg.
- **`index.html` wird nachträglich erzeugt.** Wegen `localePrefix: 'as-needed'`
  entsteht keine Wurzelseite, nur `en.html`. Bis zum Eindeutschen: nach dem Build
  `cp app/out/en.html app/out/index.html`.
