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

## Ansicht: die ganze Halle sehen (T7)

Beim Öffnen des 2D-Editors wird der **gesamte Grundriss eingepasst**. Vorher war
der Maßstab eine Konstante (2,032 cm/Pixel) — die 78 m lange Halle war damit am
Rechner nur zu **38 %** und am Handy zu **10 %** sichtbar, ohne jede Abhilfe.

Bedienung: **Mausrad** (zoomt dorthin, wo der Zeiger steht), am Handy **zwei
Finger spreizen**, ein Finger schiebt. Dazu drei Schaltflächen — näher heran,
weiter weg, **Ganze Halle zeigen**. Zoombereich 0,04 bis 8.

Zwei Dinge skalieren bewusst **nicht** mit, weil sie sonst unlesbar würden:

- **Maßangaben** werden ab einer Wandlänge unter 45 Bildschirmpixeln weggelassen
  — sonst lägen bei voller Übersicht hundert Zahlen übereinander.
- **Raumnamen** verschwinden unterhalb von 0,12 Pixel/cm. Am Handy ist die
  eingepasste Halle bei 0,045 — dort ergäben alle 18 Namen übereinander nur
  Buchstabensalat; beim Hineinzoomen kommen sie zurück.

Die **Greifzone** für Wände und Ecken ist seit T7 in Bildschirmpixeln definiert
(8 px), nicht mehr in Zentimetern. Sonst wären Wände bei eingepasster Ansicht
nur noch rund 2 Pixel breit zu treffen gewesen.

Nachprüfbar bei laufendem Server: **`node tools/pruefe-ansicht.mjs`**
(Exit 0 = bestanden) — misst am echten Bild, ob der Grundriss vollständig und
mit Rand im Fenster liegt, und ob Mausrad, Finger und Schaltflächen zoomen.

## Rückgängig / Wiederholen (T5a)

Im 2D-Editor: die beiden Pfeile in der Werkzeugleiste, oder **Strg+Z** und
**Strg+Y** (auch **Strg+Umschalt+Z**). Am Handy stehen die Pfeile in einer
**eigenen zweiten Zeile** — der mittig positionierte 2D/3D-Umschalter der
Kopfleiste liegt sonst darüber und schluckt die Berührung (siehe unten).

Die Historie führt **50 Schritte** und umfasst den **Grundriss**: Wände zeichnen,
Wände und Ecken löschen, Wände und Ecken ziehen. Ein Ziehen ist **ein** Schritt,
egal über wie viele Bewegungen es geht. Beim Laden eines anderen Plans wird die
Historie verworfen — sonst spielte ein Rückgängig Wände eines fremden Grundrisses ein.

**Bewusst nicht enthalten:** Möbel (die stehen nach einem Rückgängig unverändert)
und Raumnamen (die liegen getrennt im localStorage; nähme ein Rückgängig sie mit,
zeigte der Plan einen anderen Namen als der gespeicherte Stand).

Nachprüfbar bei laufendem Server: **`node tools/pruefe-undo.mjs`** fährt die
zwölf Schritte im echten Browser ab und misst die gezeichneten Pixel vor und
nach jedem Zug (Exit 0 = bestanden). Dass die Wiederherstellung auf Abweichung
**0** landet, beweist zugleich, dass die Ansicht nicht springt — ein verschobener
Ausschnitt ergäbe bei identischer Geometrie ein anderes Bild.

## Bekannte offene Punkte

- **Mobile Kopfleiste überlappt** (Upstream-Layout): bei 390 px verdeckt der
  2D/3D-Umschalter „Add Items" und „New Plan". Gehört zu T6 (Handy-Tauglichkeit).
  Aus demselben Grund stehen die Rückgängig-Pfeile am Handy in der zweiten Zeile.
- **Wandgebundene Möbel und Rückgängig** (relevant erst mit T3a Türen/Fenster):
  ein Rückgängig erzeugt alle Wände als neue Objekte. Ein Item, das an einer Wand
  hängt, hält danach eine Referenz auf eine Wand, die es nicht mehr gibt. Solange
  nur freistehende Möbel im Einsatz sind, ist das folgenlos; mit T3a muss die
  Wand-Bindung nach dem Zurückspielen neu aufgelöst werden.
- **Middleware ist im Export wirkungslos.** `app/middleware.ts` (next-intl-Routing)
  wird beim statischen Export ignoriert — Next warnt darüber, der Build bleibt grün.
  Die vier Sprachseiten (`de`/`en`/`zh`/`tw`) werden statisch vorgerendert.
- **`index.html` wird nachträglich erzeugt.** Wegen `localePrefix: 'as-needed'`
  entsteht keine Wurzelseite. Seit T6 ist Deutsch die Standardsprache, deshalb
  nach dem Build **`cp app/out/de.html app/out/index.html`** (vorher `en.html`).
