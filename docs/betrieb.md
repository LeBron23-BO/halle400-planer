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

## Ausstattung: was in den Räumen steht (A1, A6)

Der Grundriss zeigt nicht nur die Bausubstanz, sondern auch die **Einrichtung** —
als Grundriss-Zeichen, wie ein Architekturplan sie führt: Tische als Rechtecke,
Stühle als kleine Rechtecke mit Lehne, Treppen als Stufenband, dazu Rundtisch,
Schrank (Rechteck mit Diagonale), WC, Waschbecken, Kochfeld, Pflanze, Aufzug
und Fläche (Loggia/Kiesbett).

**Warum als Zeichen und nicht als fertige Möbelmodelle.** Das Datenmodell kennt zwar
`items` mit `model_url` — aber der 2D-Editor zeichnet sie überhaupt nicht
(`floorplanner_view.draw()` kennt nur Raster, Räume, Wände, Ecken, Maße). Eine
als Item eingepflegte Einrichtung wäre also ausgerechnet im Grundriss
unsichtbar, der der PDF entspricht. Dazu trägt der Katalog des Upstreams eine
**Wohnungs**-Einrichtung (Betten, Sofas, Kleiderschränke) ohne Treppe, Sanitär,
Küchenzeile oder Aufzug, und jedes Modell wiegt Megabytes auf einem fremden
CDN — bei rund 200 Möbeln wären das Dutzende MB externe Anfragen je Aufruf.

**Stand:** die **ganze Halle** ist erfasst — 289 Zeichen von 1,95 m bis 76,35 m,
in jedem Zehntel der Länge vorhanden (`pruefe-ausstattung.mjs` prüft genau das:
eine bloße Gesamtzahl kann groß und trotzdem lückenhaft sein).

**Woher die Daten kommen.** `data/ausstattung.json` ist die kuratierte Quelle,
genau wie `data/walls.json` bei den Wänden: aus der PDF **gemessen**, jedes
Element mit `beleg` auf die Mess-Kachel, an der es abgelesen wurde. Der Export
prüft sie fail-closed — unbekannter Typ, fehlende Zahl oder eine Ausdehnung
≤ 0 brechen ab, statt lautlos ein unsichtbares Möbel zu erzeugen.

```
python tools/mess_kachel.py --von 27 --bis 37   # Lineal: Ausschnitt mit xy-Meterraster
python tools/export_blueprint.py                # traegt data/ausstattung.json in den Plan ein
node tools/pruefe-ausstattung.mjs               # Beweis am gerenderten Canvas
```

Die Ausstattung liegt im `floorplan`-Zweig (nicht in `items`) und erbt dadurch
die erprobte Speicher-/Lade-Mechanik — sie übersteht damit auch ein
**Rückgängig**, das seine Momentaufnahmen über genau diesen Pfad zieht.

Zwei Lesbarkeitsstufen, beide in Bildschirmpixeln pro cm gemessen (dieselbe
Lehre wie bei Maßangaben und Raumnamen in T7): ab **0,30** mit Details
(Treppenstufen, Kochfeld-Platten, Stuhllehnen), ab **0,03** nur der Umriss,
darunter gar nicht — bei eingepasster Halle am Handy (0,045) ist ein
160-cm-Schreibtisch sieben Pixel breit, dort sagt ein Umriss mehr als ein
Detail, das zu einem Fleck verklumpt.

**Eigene Linienfarbe mit Absicht:** `#7d8a9c` ist blaugrau, kein neutrales
Grau. Die Wand-Kante ist `#888888` (r=g=b) — ein neutralgraues Möbel wäre von
ihr weder für das Auge noch für eine Messung sicher zu trennen. Die erste
Fassung von `pruefe-ausstattung.mjs` hielt prompt jede Wandkante für
Ausstattung und meldete trotzdem „bestanden" (10.980 statt 695 Pixel). Der
Blaustich macht den Unterschied eindeutig.

### In der 3D-Ansicht (A6)

Die Ausstattung steht seit A6 auch **dreidimensional** im Raum — als einfache
Körper aus denselben gemessenen Daten (`src/three/ausstattung.ts`). Sie hängt
im selben Redraw wie Böden und Wände und übersteht dadurch ein Rückgängig
genauso wie die 2D-Zeichen. Je Typ entsteht eine `InstancedMesh`, damit die
289 Körper rund zehn statt 289 Zeichenaufrufe kosten — das zählt am Handy.

**Die Grundfläche ist gemessen, die Höhe ist gesetzt.** `x`, `y`, `breite`,
`tiefe` und `drehung` stammen unverändert aus der PDF. Eine Höhe steht in
keinem Grundriss: er ist ein waagerechter Schnitt und sagt, *wo* ein Tisch
steht, nicht *wie hoch* er ist. Jede Höhe in `OBERKANTE_CM` ist deshalb eine
gesetzte Angabe nach üblichen Möbelmaßen mit ihrer Quelle im Kommentar —
dieselbe Sorte Wert wie `wallHeight = 300 cm` und ausdrücklich **kein**
Messwert (Projekt-DNA Punkt 4).

Zwei Stellen, an denen bewusst *nichts* erfunden wird: **Tischplatten**
schweben auf Arbeitshöhe statt als Vollklotz vom Boden aufzusteigen (der Plan
zeigt die Platte; Beine sind nicht gemessen, und ein 290 × 350 cm großer
Konferenztisch als Vollkörper stellt den halben Raum zu). Und die **Treppe**
ist nur ein flacher Antritt: Geschosshöhe und Stufenzahl stehen nicht im
Grundriss, eine ansteigende Treppe wäre gerechnet, nicht gemessen.

```
node tools/pruefe-ausstattung-3d.mjs   # Beweis am gerenderten WebGL-Bild
```

Die Prüfung misst, was 3D-**spezifisch** schiefgehen kann: Erscheinen die
Körper, sitzen sie auf dem Boden statt daneben, ragt nichts durchs Gebäude,
überleben sie ein Rückgängig? Die Vollständigkeit prüft sie bewusst **nicht**
noch einmal — beide Ansichten lesen dieselbe Quelle, das wäre dieselbe Zahl
zweimal statt einer unabhängigen Gegenprobe.

Der zentimetergenaue Lagebeweis bleibt bei der 2D-Prüfung, die gegen die
Bausubstanz misst; die 3D-Prüfung fängt den groben Fehler (Achsentausch).

## Ganze Halle in 3D sichtbar (T7-3D)

Beim Bauen von A6 fiel auf, dass die 3D-Ansicht die Halle **nie ganz** zeigen
konnte: `controls.maxDistance` endete bei 1500 cm, die Halle ist 7800 cm lang.
Das Herauszoomen lief wortlos gegen eine unsichtbare Wand — das 3D-Gegenstück
zu dem Problem, das T7 für den 2D-Editor gelöst hat.

**Drei feste Zahlen mussten mitwachsen, nicht eine.** Nur die erste war
offensichtlich; die anderen beiden bezahlten den größeren Abstand mit
Bildfehlern und fielen erst beim ANSEHEN auf, während jede Kennzahl grün war:

| Wert | war | Symptom |
|---|---|---|
| `controls.maxDistance` | 1500 cm | Herauszoomen endet mittendrin |
| `Skybox.sphereRadius` | 4000 cm | Kamera steht außerhalb der Himmelskugel → **schwarzer** Hintergrund |
| `camera.far` | 10000 cm | ferne Himmelshälfte weggeschnitten → **schwarzes Loch** in der Bildmitte |

**Eingepasst wird eine Kugel, kein Quader.** Die Ansicht dreht sich beim
Öffnen von allein weiter, und bei 78 × 15 m ändert sich der Platzbedarf mit
dem Blickwinkel dramatisch — eine auf den Startwinkel gerechnete Einpassung
schneidet nach wenigen Sekunden Drehung wieder ab. Eine Kugel sieht aus jeder
Richtung gleich aus, damit gilt die Einpassung für jeden Drehwinkel. Der
Abstand ist exakt herleitbar (`radius / sin(halber Öffnungswinkel)`), es
bleibt kein geschätzter Anteil und keine an dieser Halle kalibrierte Zahl.

**Raumnamen folgen jetzt in BEIDEN Ansichten derselben Regel.** Die
Ausblendschwelle (`LABEL_MIN_PIXEL_PRO_CM = 0,12`) galt bisher nur in 2D,
weil die 3D-Kamera gar nicht weit genug herauskonnte, um das Problem zu
erzeugen. Seit sie die ganze Halle einpasst, legten sich dort exakt dieselben
18 Namen übereinander. Beim vollen Überblick stehen deshalb keine Namen —
beim Hineinzoomen kommen sie zurück, die näheren zuerst, weil der Maßstab je
Etikett aus seiner eigenen Entfernung zur Kamera folgt.

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

## Bank-Ansicht: das Modell für den Businessplan (E4)

Für den Businessplan gibt es eine **einzelne HTML-Datei**, die eine Bank per
Doppelklick öffnet — ohne Node, ohne Server, ohne Netz, ohne Installation.

```
node tools/baue-bank-ansicht.mjs     # erzeugt Halle400-Modell.html (~2 MB)
node tools/pruefe-bank-ansicht.mjs   # prüft sie UNTER Bank-Bedingungen + erzeugt bank-export/*.png
```

Ergebnis: `Halle400-Modell.html` (drehbares Modell) und vier Standbilder in
`bank-export/` fürs gedruckte Papier.

**Warum eine eigene Datei und nicht `app/out/`:** Der Next-Export schreibt
absolute Asset-Pfade und braucht deshalb `serve-local.mjs` — also eine
Node-Installation, die eine Bank nicht hat (siehe „Warum kein Doppelklick auf
eine HTML-Datei" weiter oben).

**Die drei Offline-Blocker** lagen im Renderpfad und luden alle von einem
FREMDEN CDN (`cdn-images.lumenfeng.com`): Bodentextur (`src/model/room.ts`),
Wandtextur (`src/model/wall.ts`), Wand-Lichtkarte (`src/three/edge.ts`). Die
Bank-Ansicht **rechnet** ihre Maserung stattdessen im Browser — das wiegt nichts
und kann nicht ausfallen, wenn ein fremder Anbieter seine URLs ändert.

**Die Prüfung ist der Zweck, die Bilder sind das Nebenprodukt.** Geprüft wird
unter genau den Bedingungen der Bank: `file://`, **Netz hart gesperrt**, keine
Konsolenfehler. Ohne die Netzsperre bestünde die Prüfung auch mit einer
verbliebenen CDN-URL — auf *diesem* Rechner ist das CDN ja erreichbar; der
Fehler zeigte sich erst bei der Bank, wo niemand mehr nachbessern kann.

**Grenzen, bewusst so:** Die Datei ist ein BETRACHTER, kein Editor. Sie zeichnet
die Geometrie eigenständig aus dem Grundriss-JSON und teilt sich den Code nicht
mit `src/three/` — den ganzen Editor-Graphen ohne Bündler in eine Datei zu
pressen wäre fragiler als 200 Zeilen Betrachter. Damit beide nicht
auseinanderlaufen, liest der Generator die Ausstattungs-Höhen zur Bauzeit aus
`src/three/ausstattung.ts`, statt sie abzuschreiben. Ändert dort jemand eine
Höhe, ändert sich die Bank-Ansicht mit; fehlt der Block, bricht der Generator ab.

Zwei Stolpersteine, falls `three` einmal aktualisiert wird — der Generator
bricht dann laut ab, statt eine weiße Seite auszuliefern:

- `three.module.js` ist **nicht selbstständig**, sondern ein Aufsatz auf
  `three.core.js`, und trägt DREI Modul-Blöcke (Import, Re-Export, eigener
  Export). Wer nur den letzten entfernt, bekommt „Unexpected token 'export'".
- Beide Dateien einfach aneinanderzuhängen scheitert an gleichnamigen internen
  Hilfsgrößen (`_m1$1`). Jede bekommt deshalb einen eigenen Scope, verbunden
  über einen gemeinsamen Namens-Beutel.

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
