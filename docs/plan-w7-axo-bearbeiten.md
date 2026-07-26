# Welle 7 — Bearbeiten in der Axonometrie (Bauplan)

Erarbeitet 2026-07-27 aus zwei Untersuchungen: einer externen Recherche (wie lösen
es andere, was sagt die Mathematik) und einer Vermessung des eigenen Codes. Alle
Zahlen unten sind gemessen, nicht geschätzt.

## Die Festlegung, die zu präzisieren war

`CLAUDE.md` sagte: „In der Axonometrie wird nicht bearbeitet — ein Klick trifft
keinen Punkt, sondern einen Sehstrahl; die Zielhöhe wäre geraten."

Der Satz ist über die **Projektion** nie falsch gewesen, aber über den **Umfang**.
Denn: **für einen Körper mit bekannter Ober- und Unterkante ist der Sehstrahl keine
unendliche Gerade, sondern eine endliche Strecke.** Jeder Körper der Szene kennt
sein `y0`/`y1` (`axo-kontrakt.js:315-328`). Nichts muss geraten werden.

Sweet Home 3D erlaubt das Bearbeiten in der 3D-Ansicht seit Fassung 7.2 mit genau
dieser Begründung — bewegte Möbel *behalten* ihre Höhe. Und `blueprint3d`, die
Grundlage dieses Projekts, trägt den Mechanismus bereits in sich: eine unsichtbare
Ebene bei y = 0 (`src/three/controller.ts:124-130`) und je Objekt eine eigene
Schnittebene (`src/items/item.ts:273`, `wall_item.ts:227`).

## Die Mathematik, offengelegt

`projiziere` steht in `src/axo/axo-zeichnen.js:83-94`, Kameragrößen in `setzeKamera`
(`:101-136`), Drehachse `mitteY = 0.6` (`:81`).

```
dx = x−mx      dz = z−mz      dy = y−0,6
xr = dx·cosA − dz·sinA          zr = dx·sinA + dz·cosA
X  = ox + m·xr                  Y  = oy + m·(zr·sinE − dy·cosE)
p  = zr·cosE + dy·sinE                     (Tiefe, nur zum Sortieren)
```

**Umkehrung auf einer BEKANNTEN Höhe y = h** (dy = h−0,6), geschlossen, kein Iterieren:

```
xr = (X−ox)/m        zr = ((Y−oy)/m + dy·cosE)/sinE
dx = xr·cosA + zr·sinA        dz = −xr·sinA + zr·cosA
```

Die Jacobi-Determinante von (dx,dz) → (X,Y) ist **m²·sinE — unabhängig vom Azimut.**
Eindeutig umkehrbar für jeden Blickwinkel; entartet allein bei sinE → 0.

| Blick (`axo-kontrakt.js:164-169`) | el | sinE | 1 px → x | 1 px → z (Tiefe) |
|---|---|---|---|---|
| nord/süd (auch Startblick) | 0,62 | 0,581 | 7,5 cm | **13,0 cm** |
| west | 0,50 | 0,479 | 7,1 cm | 14,7 cm |
| plan | 1,44 | 0,992 | 7,6 cm | 7,7 cm |
| `neigeMin` (per Ziehen erreichbar) | 0,10 | **0,0998** | 7,5 cm | **75,5 cm** |
| nord bei `zoomMax` | 0,62 | 0,581 | 1,8 cm | 3,1 cm |

**Kein Blickwinkel der Leiste entartet.** Entartet ist nur, was der Nutzer selbst
herstellen kann: bei `neigeMin` sind 1 px Zittern 75 cm Tiefe — fünfzehn
Rasterschritte. Genau dort gehört Bearbeiten gesperrt.

**Der Fehler einer geratenen Höhe ist exakt `h · cot(el)`**: Tisch (74 cm) → 1,04 m,
Schrank (200) → 2,80 m, Wandkrone (1,16 m) → **1,63 m**. Deshalb wird nicht geraten,
sondern gegen die eigene Höhe jedes Kandidaten geprüft.

## Drei Befunde, die vor allem anderen kommen

**B1 — Ein Körper trägt keine Kennung.** `ausstattungsKoerper` (`axo-szene.js:144-171`)
liefert `{punkte, y0, y1, material, gesetzt}`; `el.id` und `el.typ` fallen weg,
`wandStuecke` (`:74-85`) führt `w.id` nicht mit, und `flaechenVon`
(`axo-zeichnen.js:142-203`) reicht nur `{pts, col, depth, gesetzt}` weiter. **Ohne
Rückverweis vom Bild zum Modell gibt es kein Bearbeiten.** Kosten: je eine Zeile.
(Der Index ließe sich missbrauchen — aber ein Typ ohne `AUSSTATTUNG_STIL` liefert
`null` und die Parität kippt lautlos: genau die zweite Wahrheit, die dieses Projekt
verbietet.)

**B2 — Die Kameragrößen kommen nicht heraus.** `erzeugeAxonometrie` gibt
`ox/oy/massstab/sinA/sinE` nicht zurück (`axo-zeichnen.js:509-536`). Eine Hülle kann
heute keinen einzigen Punkt zurückrechnen.

**B3 — Ein echter Fehler, der ohne Bearbeitung nur lästig ist und mit ihr fatal.**
`AxonometrieAnsicht.tsx:76` ruft `erzeugeAxonometrie` bei jedem Neubau auf demselben
Canvas, `:92` hängt jedes Mal ein neues `fireOnUpdatedRooms` an — `EventEmitter.remove`
existiert (`src/core/events.ts:26`) und wird nie gerufen. Die Zeiger-Abos stapeln
sich: nach drei Klicks auf die Legende dreht ein Zug **viermal so schnell**. Die
Doppelklick-Datei umgeht es, indem sie das Canvas tauscht
(`baue-planer-datei.mjs:1038-1053`) — und verliert dabei Zoom und Verschiebung.

## Treffer ermitteln — die Rechnung schlägt das Bild

Gemessen: 526 Körper, **1638 Füllungen je Bild**, `zeichne()` reiner JS-Anteil
**1,71 ms**, `baueSzene` **16,2 ms**.

| Verfahren | Kosten je Mausbewegung | Urteil |
|---|---|---|
| `isPointInPath` rückwärts | 1638 Pfade neu aufbauen ≈ 1,7 ms; Klick ins Leere = voller Preis | pixelgenau, aber teuerster Weg, nur im Browser prüfbar |
| Farb-Puffer im Nebencanvas | ein Vollbild je Szenen- ODER Blickänderung | eine ZWEITE Zeichenvorschrift — dieselbe Sünde, die dieses Projekt verbietet |
| **Rückrechnung + Test im Weltmaß** | 289 Strecke-gegen-Rechteck-Tests, **< 0,1 ms** | **empfohlen** |

Der Test, exakt: für jedes Element `P₀ = umkehre(X, Y, y0)` und `P₁ = umkehre(X, Y, y1)`.
Getroffen ist es, wenn die **Strecke P₀P₁ das gedrehte Grundriss-Rechteck schneidet**.
Bei Mehrfachtreffern gewinnt der größte Tiefenwert — per Konstruktion das, was zuletzt
gemalt wurde, also das, was man sieht. Der Test läuft **ohne Canvas und ohne Browser**
und ist damit als Einziger in Node prüfbar.

Untragbar ist allein `baueSzene` im Zug (16,2 ms). Deshalb: während des Zugs **einen**
Körper an Ort und Stelle ersetzen und nur neu zeichnen; der volle Neubau erst beim
Loslassen.

## Der Weg zurück ins Modell

Alles vorhanden: `verschiebeAusstattung(id,x,y)` (`floorplan.ts:947`, setzt `quelle`
fest verdrahtet auf `gesetzt`), `dreheAusstattung` (`:973`), `entferneAusstattung`
(`:926`), `fuegeAusstattungHinzu` (`:824`).

Das Einrasten steht in `Floorplanner.moebelEinrasten` (`floorplanner.ts:1217-1295`) —
**privat**, und `moebelZiehen` (`:1179-1195`) zieht seine Koordinaten aus `this.mouseX`.
Richtiger Griff: `moebelZiehen` in ein privates `moebelAufPunkt(weltX, weltY)`
aufteilen und drei öffentliche Methoden anbieten (`zugBeginnen(id, weltX, weltY)` /
`zugSchritt(weltX, weltY)` / `zugBeenden()`), die Maus-Weg und Axonometrie-Weg
**teilen**. Dann gibt es eine Einrast-Rechnung und einen Schnappschuss je Zug.

`update()` darf hier gerade NICHT gerufen werden — es baut Räume, Halbkanten,
Texturen und `versoehneOeffnungen` neu, für ein verschobenes Möbel alles umsonst.
Die Axonometrie ist selbst der Verursacher und ruft ihren Neubau direkt.

## Die Gesten-Trennung — der Treffer entscheidet, keine Zusatztaste

`pointerdown/-move` gehören heute dem Drehen (`axo-zeichnen.js:440-485`), Umschalt
schwenkt (`:474-476`), zwei Finger zoomen (`:459-468`).

- Druck **auf einen Körper** → greifen. Druck **auf Bühne, Boden oder Wand** → drehen
  wie bisher. Präzedenzfall ist die Schwenk-Sperre im Grundriss
  (`floorplanner.ts:1036-1048`): ohne sie wandert das Möbel UND der Plan.
- Solange etwas in der Hand ist: Drehen und Schwenken aus.
- Zeiger sagt es: `grab` / `grabbing`.
- Scharf nur im Bearbeiten-Zustand (`body.bearbeitet`) — sonst bleibt das Blatt für
  die Bank ein Blatt.
- **Sperre unter el < 0,35** (Tiefe > 22 cm je Bildpunkt): dort wird nur gedreht.
  Ehrlich anzeigen, nicht still verweigern.
- Q/E brauchen `tabindex=0` und Fokus; der Tastenweg muss zwischen Grundriss- und
  Axonometrie-Ansicht verzweigen.

## Die ehrliche Grenze

| Aktion | Urteil | Begründung |
|---|---|---|
| Möbel verschieben | **geht sauber** | y0/y1 bekannt → Strecke-Test exakt; Einrasten deckt die 13 cm/px Tiefe ab. Annahme: el ≥ 0,35 |
| Möbel drehen | **geht sauber** | reine Modell-Operation, keine Geometrie im Bild |
| Möbel löschen | **geht sauber** | derselbe Treffer, vorhandene Rückfrage |
| Palette ablegen | **mit benannter Annahme** | neues Stück steht auf y = 0 — gesetzt, nicht geraten. Der Puppenhaus-Schnitt verdeckt den Boden vor jeder Wandkrone |
| Wand verschieben | **mathematisch ja, hier NEIN** | eine verschobene gemessene Ecke bricht den Rückweg hart ab. Eine Bedienung, die in einen abgelehnten Zustand führt, ist keine |
| Wand zeichnen | **nein** | ein Punkt in leerer Luft hat keine bekannte Höhe; zielt man auf die sichtbare Krone, landet der Fuß 1,63 m daneben |
| Tür setzen / verschieben | **rechnerisch ja, vorerst nein** | Anschlag und Aufschlagseite sind in diesem Bild unsichtbar — man setzte blind zwei Merkmale |

## Der Bauplan — nach jedem Schritt etwas Benutzbares

1. **Rückverweis und Zugang.** `id`/`typ` in `axo-szene.js:152-170`, `wandId` durch
   `wandStuecke` (`:60,74`), `id` in `axo-zeichnen.js:162,196`. `erzeugeAxonometrie`
   gibt zusätzlich heraus: `projiziere`, `umkehre(X,Y,h)`, `setzeSzene(s)` und
   `zerstoere()` über einen `AbortController` an allen vier Abos. **Danach:** die
   Doppelklick-Datei kann das Canvas-Tauschen aufgeben und behält Zoom und
   Verschiebung; das Abo-Leck (B3) ist zu.
2. **`src/axo/axo-treffer.js`** — neues Modul, reine Rechnung: `umkehreAuf(kamera, X, Y, h)`
   und `koerperUnter(szene, kamera, X, Y)`. ⚠ `buendel-kern.mjs` bricht bei
   Namensgleichheit ab: `rechteck` und `liegtIn` sind bereits vergeben.
   **Danach:** der Zeiger zeigt `grab` über einem Möbel — sichtbar, ohne dass etwas
   passieren kann.
3. **Kern-Naht.** `moebelZiehen` aufteilen, `zugBeginnen/zugSchritt/zugBeenden`
   öffentlich. **Danach:** Ziehen im Grundriss unverändert (`pruefe-ziehen.mjs` grün).
4. **Ziehen in der Axonometrie.** Griff-Versatz im **Weltmaß** festhalten, im Zug
   einen Körper tauschen, beim Loslassen neu bauen. Drehsperre solange gegriffen.
5. **Drehen und Löschen.**
6. **Palette** (nur Doppelklick-Datei): `stueckAblegenWelt(weltX, weltY, vorlage)`.
7. **Bündel und Sammler.** `axo-treffer.js` in `AXO_MODULE` eintragen — fehlt es
   dort, ist die Bearbeitung im Planer grün und in der Bank-Datei tot. Neues Gate in
   `alle-gates.sh`.

## Die Prüfungen, jede mit Gegenprobe

**A · Hin und zurück, ohne Browser.** Für alle vier Blicke × Neigung Min/Max × Zoom
Min/Max: `umkehre(projiziere(P)) = P` auf 1e-9. **Gegenprobe:** mit erzwungenem
sinE = 0 MUSS der Test fehlschlagen.

**B · Selbsttreffer aller 289 Stücke, ohne Browser.** Mittelpunkt auf der eigenen
Deckelhöhe vorwärts projizieren → `koerperUnter` muss genau diese Kennung liefern.
**Gegenprobe 1:** mit auf y = 0 geratener Höhe muss die Trefferquote messbar
einbrechen — das beziffert `h·cot(el)` im Gate selbst. **Gegenprobe 2:** ein Punkt
zwei Halbmaße daneben darf das Stück nicht liefern.

**C · Pixel-Tinte am gerenderten Canvas.** Schwerpunkt der Materialfarbe vorher und
nachher; nach einem Zug muss er um den projizierten Sollweg ± 2 px gewandert sein.
**Gegenproben:** Zug mit Weg 0 → Schwerpunkt < 1 px; ein anderes Stück gezogen →
dieser Schwerpunkt unverändert.

**D · Modell.** `x`/`y` geändert, `quelle === 'gesetzt'`, Zähler +1, **genau ein**
Rückgängig stellt her. Gegenprobe: zwei Züge = zwei Schritte.

**E · Gesten-Trennung**, mit echten Zeiger-Ereignissen: Druck auf die Bühne ändert
den Blickwinkel und bewegt nichts; Druck auf ein Möbel bewegt es und lässt den
Blickwinkel unverändert.

**F · Kosten.** Marken je Zeigerbewegung < 16 ms. **Gegenprobe:** mit absichtlichem
vollem Szenen-Neubau je Bewegung MUSS das Gate rot werden (16,2 ms gemessen) — sonst
misst es nichts.

**G · Bank-Datei unangetastet:** die bestehenden Gates bleiben grün; das Blatt im
Auslieferungszustand nimmt weiterhin keinen Griff an.
