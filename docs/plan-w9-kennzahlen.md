# W9 — Raumbuch, Stückliste und Norm-Hinweise

**Stand: Schritt 1 + 2 gebaut und grün (53 Prüfungen, 3-von-3).**
Schritt 3 (die ANZEIGE) baut die nächste Welle auf genau diesen Ausgängen auf.

Dieses Dokument ist der Bauplan für die ganze Welle — das Gebaute UND das, was
beim Bauen gelernt wurde. Wer die Anzeige baut, liest es zuerst.

---

## 1 · Was diese Welle liefert

| Datei | Rolle |
|---|---|
| `src/axo/axo-kennzahlen.js` | die **reine Rechnung** — kein Canvas, kein DOM, einziger Import: `axo-zyklen.js` |
| `tools/pruefe-kennzahlen.mjs` | das Gate — **ohne Browser**, jede Prüfung mit Gegenprobe, 53 Prüfungen |
| `tools/buendel-kern.mjs` | `AXO_MODULE` um `axo-kennzahlen.js` erweitert (nach `axo-zyklen.js`) |
| `tools/alle-gates.sh` | `pruefe-kennzahlen` in der `GATES`-Zeile |

### Die drei Ausgänge

```js
baueRaumbuch(plan, { namen, wandDicke })  // -> { raeume[], stueckliste[], summen, erschliessungIndex, wandDicke }
wandKantenVon(zyklus, walls)              // -> Wall.id[]   (Eckenpaar -> Wand-Kennung)
pruefeHinweise(plan, raumbuch)            // -> [{ art, text, betroffen[] }]
```

Dazu als Konstanten, damit die Anzeige keine zweite Fassung erfindet:
`LEGENDE_STUHLFLAECHE` · `FUSSZEILE` · `TUER_MINDESTBREITE_CM`
und die Schreibweisen `zahlText(wert, stellen)` · `meterText(cm)` · `flaecheText(qm)`.

Die **Wanddicke ist bewusst KEINE exportierte Konstante**, sondern
`opt.wandDicke ?? 12.5` — genau wie in `axo-szene.js`. Der Grund steht unten in
Befund 4 und ist kein Geschmack, sondern ein gemessener harter Syntaxfehler.

**Die Schreibweisen sind Teil des Vertrags.** Dieselbe Zahl darf im Raumbuch
nicht anders dastehen als im Hinweis darunter; wer in der Anzeige `toFixed(2)`
selbst schreibt, baut die zweite Wahrheit, die überall sonst in diesem Projekt
vermieden wird. Meter mit ZWEI Nachkommastellen (Projekt-DNA Punkt 3, wie
`Dimensioning.cmToMeasure`), Flächen mit EINER — der Plan ist freihändig
gezeichnet, 0,01 m² behauptete eine Genauigkeit, die das Original nicht hat.

### Ein Raum im Raumbuch

```
{ index, punkte[{x,y} in cm], ecken, flaeche (m²), mitte, wandIds[],
  istErschliessung, namensAnker[], name, bezeichnung,
  stuecke: [{typ, name, anzahl, gemessen, gesetzt}], stueckeGesamt,
  stuehle, flaecheJeStuhl (m² | null) }
```

`flaecheJeStuhl` ist `null` und nicht `0`, wenn kein Stuhl im Raum steht: kein
Stuhl heisst **keine Aussage**, nicht „unendlich viel Platz". Die Anzeige muss
das auch so schreiben („—", nicht „0,0").

`bezeichnung` ist immer gefüllt — Name aus den Ankern, sonst
`Raum bei x = 12,34 m`, für die Erschliessungszone `Erschließungszone`.

---

## 2 · Die drei Doktrin-Regeln (der eigentliche Wert)

**1 · Geprüft wird ausschliesslich, was der Nutzer GESETZT hat.**
Gemessen am Auslieferungszustand, und darum ist die Regel keine Meinung:

- Der gemessene Plan führt **0 Öffnungen** → eine Prüfung „Raum ohne Tür" über
  das Aufmass meldete sofort **24 von 24 Räumen**.
- **4 gemessene Stücke** haben ihren Mittelpunkt im Wandband (gemessen:
  3× `rundtisch` = die Lounge-Sessel, 1× `waschbecken` = die Spüle) → eine
  Prüfung „Möbel in Wand" über das Aufmass meldete sofort 4 Stück.

Beides wären genau die Zeilen, die man nach dem zweiten Blick nicht mehr liest —
und dann fällt auch der eine wichtige Hinweis nicht mehr auf. Die PDF ist die
Grundwahrheit (Projekt-DNA), kein Prüfling.

Der Beweis, dass hier nicht der Melder fehlt, sondern die Doktrin greift, steht
im Gate: **D10** zählt die 4 unabhängig nach (eigene Punkt-zu-Strecke-Rechnung,
keine Zeile mit dem Modul geteilt), **D11** belegt das Schweigen, **D12** kippt
dieselben 4 auf `gesetzt` und der Hinweis feuert mit genau 4 Betroffenen.

**2 · „m² je Stuhl" ist eine SPALTE, kein Hinweis.**
Als Hinweis feuerte sie auf **11 von 24 Räumen** (Gate D19, gemessen). ASR A1.2
nennt 8–10 m² je *Büroarbeitsplatz*; ein Konferenzstuhl, ein Loungesessel und
ein Hocker sind keine Arbeitsplätze, und der Plan weiss nicht, welcher Stuhl
welcher ist. Der Vergleichswert steht deshalb als `LEGENDE_STUHLFLAECHE` neben
der Zahl und überlässt den Schluss dem Leser.

**3 · Hinweise nur bei N > 0, nie als Sperre, jede Aussage mit ihrer Quelle.**
Im Auslieferungszustand ist `pruefeHinweise()` **leer** (Gate D1). Wo kein Beleg
existiert, steht „gesetzte Annahme" statt einer erfundenen DIN-Nummer — eine
erfundene Norm sähe belegt aus und wäre schädlicher als eine offene Annahme.

---

## 3 · Der geprüfte Wortlaut

Legende zur Spalte (`LEGENDE_STUHLFLAECHE`):

> Vergleichswert zur Spalte „m² je Stuhl": ASR A1.2 nennt 8–10 m² je
> Büroarbeitsplatz im Zellenbüro und 12–15 m² im Großraum, jeweils
> einschließlich Möblierung und anteiliger Verkehrsfläche (BAuA, ASR A1.2
> Nr. 5). Der Plan zählt Stühle, nicht Arbeitsplätze — ob ein Stuhl einer ist,
> sagt er nicht.

Fusszeile (`FUSSZEILE`):

> Flächen aus den gemessenen Wandachsen abgeleitet (Rohbaumaß, keine Nutzfläche
> nach DIN 277). Höhen sind gesetzte Annahmen. Fluchtweg-Längen, Brandschutz und
> Belegungszahlen prüft dieses Werkzeug nicht.

Die vier Hinweis-Arten (`art` in Klammern):

- `tuerbreite` — *„Die gesetzte Tür in ‚&lt;Raum&gt;' ist 0,88 m breit. ASR A2.3
  Tabelle 1 nennt für Durchgänge ab 6 Personen mindestens 0,90 m (bis 5
  Personen: 0,80 m). Das Standardmaß dieses Werkzeugs ist 87,5 cm — ein
  Baurichtmaß, keine Fluchtweg-Auslegung."*
- `raum-ohne-tuer` — *„&lt;N&gt; Räume tragen an keiner ihrer Wände eine Tür oder
  einen Durchgang: &lt;Namen&gt;. Gezählt werden gesetzte Öffnungen — das Aufmaß
  enthält keine (die PDF zeigt Wände, keine Türblätter)."*
- `moebel-in-wand` — *„&lt;N&gt; frei gesetzte Stücke stehen in einer Wand: &lt;Typ&gt;
  bei x = &lt;m&gt;. Gemessene Stücke sind ausgenommen — sie sind das Aufmaß."*
- `moebel-ausserhalb` — *„&lt;N&gt; frei gesetzte Stücke liegen außerhalb jeder
  Raumfläche: &lt;Typ&gt; bei x = &lt;m&gt;. Sie werden gezeichnet und mitgezählt,
  gehören aber zu keinem Raum im Raumbuch."*

**Eine Abweichung vom vorgegebenen Wortlaut, bewusst und begründet:** bei
MEHREREN zu schmalen Öffnungen lautet der erste Satz
*„&lt;N&gt; gesetzte Öffnungen sind schmaler als 0,90 m: Tür in ‚A' (0,88 m) · …"*;
die beiden Norm-Sätze danach stehen wörtlich gleich. Grund: der vorgegebene
Satz ist im Singular formuliert, und zwanzig gleich lautende Hinweise
untereinander liest niemand — genau dann fällt auch der eine wichtige nicht
mehr auf. Alle vier Hinweise fassen deshalb zusammen und tragen die
Einzelfälle in `betroffen[]`.

`betroffen[]` ist `[{ art: 'stueck'|'raum'|'oeffnung', kennung, text }]`.
`kennung` ist die Ausstattungs-/Öffnungs-Kennung bzw. der Raum-`index` — damit
kann die Anzeige auf den Betroffenen ZEIGEN und muss ihn nicht aus dem Text
zurückparsen.

---

## 4 · Der gemessene Bestand (alles im Gate nachgerechnet)

| Grösse | Wert | Gate |
|---|---|---|
| Zyklen | 25 = 24 Räume + 1 Erschliessungszone | A1 |
| Erschliessungszone | 46 Ecken, 479,9 m² | A6 |
| viereckig + achsparallel | 24 von 25 | A1 |
| Ausstattung | 289 = 224 in Räumen + 65 in der Erschliessungszone + 0 ausserhalb | B1/B2 |
| Namens-Anker | 12 von 18 in einem geschlossenen Raum, 6 in der Erschliessungszone | B4 |
| **Räume OHNE Namen in der PDF** | **12 von 24** — sie heissen nach ihrem Ort | B7 |
| Räume mit MEHREREN Ankern | genau 1: die Erschliessungszone (6 Namen) | — |
| Stühle | 144 | — |
| Arten in der Stückliste | 10 (von 14 möglichen) | E1 |
| gemessen / gesetzt | 289 / 0 | E2 |
| gemessene Stücke im Wandband | 4 | D10 |
| Räume unter 8 m² je Stuhl | 11 | D19 |
| Hinweise im Auslieferungszustand | **0** | D1 |
| Öffnungen | 0 | — |

---

### Vier Befunde, die erst beim Bauen sichtbar wurden

1. **Die halbe Halle hat keinen Namen.** 12 der 24 geschlossenen Räume tragen
   überhaupt keinen Textanker — die PDF beschriftet nur die andere Hälfte. Ein
   Raumbuch, das für diese Zeilen leer bleibt, ist unbrauchbar; sie heissen
   deshalb nach ihrem Ort: `Raum bei x = 8,85 m, y = 3,40 m`. Die Anzeige muss
   mit diesem Anteil rechnen — es ist die Hälfte der Tabelle, nicht ein
   Sonderfall.
2. **Der Ort braucht BEIDE Koordinaten.** Mit x allein sähe die Ersatz-
   Bezeichnung kürzer aus und wäre falsch: im gemessenen Plan liegen zwei
   namenlose Räume bei 55,62 m und 55,63 m — einen Zentimeter auseinander.
   Zwei übereinander liegende Räume derselben Achse (in einer Halle der
   Normalfall) hiessen mit x allein **identisch**, und ein Hinweis nennte
   zweimal denselben Namen für zwei verschiedene Räume. Der Nutzer suchte im
   falschen Raum, und das Werkzeug sähe dabei richtig aus. Gate **B7** prüft
   die Eindeutigkeit aller 25 Zeilen, **B8** stellt zwei Räume auf dieselbe
   x-Achse und verlangt verschiedene Bezeichnungen.
3. **Mehrfachnamen gibt es genau einmal — in der Erschliessungszone** (sie
   trägt 6 Anker: Teamtable, Aufzug, Empfang, Workshop, Workspace, Break out).
   Kein geschlossener Raum hat mehr als einen. Die Anzeige sollte diese sechs
   Namen trotzdem zeigen (`raum.namensAnker[]`), sonst verschwinden die offenen
   Arbeitsbereiche vollständig aus dem Raumbuch — sie sind kein Fehler der
   Ableitung, sondern die Wahrheit dieses Grundrisses.
4. **`pruefeNamen` bewacht die Hülle NICHT — und das hätte die ganze
   Doppelklick-Datei getötet.** Das Modul hiess seine Wanddicke zuerst
   `WAND_DICKE_CM`. `tools/baue-planer-datei.mjs:828` schreibt aber die Zeile
   `const WAND_DICKE_CM = 12.5;` in **denselben** Gültigkeitsbereich der
   gebauten Datei. `buendel-kern.mjs → pruefeNamen` vergleicht die Module nur
   UNTEREINANDER, nie gegen die Hülle — der Bau meldete darum brav
   *„144 Bezeichner geprueft, keine Kollision"* und schrieb eine Datei, die im
   Browser mit `Identifier 'WAND_DICKE_CM' has already been declared` stirbt.
   **Nicht nur das neue Modul: die ganze Datei.**

   Gemessen, nicht vermutet — Handprobe, jederzeit wiederholbar:

   ```bash
   node tools/baue-planer-datei.mjs --ziel /pfad/probe.html
   node -e "const fs=require('fs');const h=fs.readFileSync('/pfad/probe.html','utf8');
     const b=[...h.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
     b.forEach((x,i)=>{try{new Function(x)}catch(e){console.log('SYNTAXFEHLER',i,e.message)}});"
   ```

   Ergebnis: mit `WAND_DICKE_STANDARD_CM` übersetzt der 936 417 Zeichen lange
   Skript-Block **fehlerfrei** und enthält `baueRaumbuch` wie `pruefeHinweise`;
   dieselbe Datei mit dem alten Namen zurückgedreht → **`SyntaxError`**.
   Die Lehre ist allgemein und gilt für jedes weitere Modul in `src/axo/`:
   **ein neuer Name auf oberster Ebene muss gegen die HÜLLE geprüft werden,
   nicht nur gegen die Nachbarmodule.** `pruefe-kennzahlen.mjs` tut das seit
   W9 in der Vorprüfung (16 eigene Namen gegen 150 aus beiden Hüllen), mit
   der Gegenprobe, dass es genau diesen Fall findet.

---

## 5 · Die stillen Zweitstellen — PFLICHTLEKTÜRE für die Anzeige-Welle

Die Modulliste existiert in diesem Projekt **dreimal**. Zwei davon sind still:
sie melden nichts, wenn ein Modul fehlt, und das Ergebnis ist eine tote
Bedienung ohne Fehlermeldung.

1. **`tools/buendel-kern.mjs` → `AXO_MODULE`** — die eine gepflegte Liste.
   Erledigt (6 Module). `pruefe-axo-bearbeiten.mjs` UND `pruefe-kennzahlen.mjs`
   halten sie gegen `src/axo/`.
2. **`app/components/blueprint3d/AxonometrieAnsicht.tsx:30-32`** — die
   React-Ansicht importiert die Axonometrie-Module EINZELN
   (`axo-szene.js`, `axo-zeichnen.js`, `axo-kontrakt.js`). Wer im Planer ein
   Raumbuch zeigen will, muss `axo-kennzahlen.js` hier **selbst dazu
   importieren**; ein fehlender Import ist im Planer ein harter Fehler (gut),
   fällt aber erst zur Laufzeit auf.
3. **`tools/baue-bank-ansicht.mjs:66`** — die reine ANSICHT (E4/X4, Vorläufer)
   führt eine EIGENE 4er-Liste
   (`axo-kontrakt`, `axo-zyklen`, `axo-szene`, `axo-zeichnen`) und kennt
   `axo-treffer.js` schon heute nicht. Sie ist **nicht mehr das
   Auslieferungsziel**, bleibt aber baubar. Wer dort ein Raumbuch zeigen will,
   muss die Liste dort ebenfalls erweitern — oder das Werkzeug auf `AXO_MODULE`
   umstellen (die sauberere Lösung, aber eine eigene Entscheidung: die
   Bank-Ansicht wäre danach ~30 KB grösser für Code, den sie nicht ruft).

**Und die vierte Stelle, die niemand als Liste erkennt:** die
Doppelklick-Datei-Hülle in `tools/baue-planer-datei.mjs`. Dort steht der
Aufruf-Code, der die Module benutzt. Ein Modul im Bündel, das niemand ruft, ist
totes Gewicht — `baueRaumbuch` wird erst durch einen Aufruf dort lebendig.

---

## 6 · Wie die Anzeige an die deutschen Namen kommt

`AUSSTATTUNG_NAME` (`src/floorplanner/floorplanner.ts:89`) wird **hereingegeben,
nicht abgeschrieben** — `baueRaumbuch(plan, { namen })`. Dieselbe Bauart wie bei
den Höhen aus `src/three/ausstattung.ts` (`tools/lies-hoehen.mjs`) und aus
demselben Grund: eine Kopie wäre still veraltet, sobald jemand dort einen Namen
ändert, und die Stückliste hiesse dann etwas anderes als die Lösch-Rückfrage.

Warum kein direkter Import: `axo-kennzahlen.js` ist eine `.js`-Datei, die in
**drei** Welten laufen muss — Next/webpack, `file://` ohne jedes Nachladen, und
nacktes `node` im Gate. Ein `import … from '../floorplanner/floorplanner.js'`
funktioniert in genau einer davon (webpack, und auch dort nur über
`extensionAlias`); in `node` gibt es keine `floorplanner.js` auf der Platte, und
unter `file://` gibt es überhaupt kein `import`. Drei Wege je Welt:

| Welt | Woher `namen` kommt |
|---|---|
| Planer (React/Next) | `import { AUSSTATTUNG_NAME } from '@blueprint3d/floorplanner/floorplanner'` — TS zu TS, trivial |
| Doppelklick-Datei | `AUSSTATTUNG_NAME` steht bereits als `const` im gebündelten Kern (aus `floorplanner.js`, `export` wird beim Bündeln abgestreift) — die Hülle gibt es einfach herein. **Bewiesen** im Gate: „AUSSTATTUNG_NAME steht im gebündelten Kern (14 Namen)" |
| node-Werkzeuge | lesen die Tabelle aus dem TS-Quelltext (`liesAusstattungNamen()` in `tools/pruefe-kennzahlen.mjs`, gleiche Bauart wie `lies-hoehen.mjs`) |

Fehlt der Name eines Typs, steht die **technische Kennung** da (`stuhl` statt
`Stuhl`) — sichtbar falsch statt still erfunden. Das Gate prüft genau darauf
(E3) und hat dafür eine Gegenprobe mit einem erfundenen Typ (E4). Damit ist
**Stelle 5 der neunstelligen Typ-Kette** (siehe `CLAUDE.md`) ab sofort
maschinell bewacht.

> Wenn `liesAusstattungNamen()` ein zweites node-Werkzeug braucht, gehört sie
> nach `tools/lies-namen.mjs` neben `lies-hoehen.mjs`. Sie steht heute nur
> deshalb im Gate, weil sie genau einen Benutzer hat — eine zweite Datei für
> einen Aufrufer wäre die Abstraktion, die YAGNI verbietet.

---

## 7 · Die EINE bewusste Doppelung, und wie sie bewacht wird

Die Erschliessungszone wird an **zwei** Stellen bestimmt: `axo-szene.js:223-230`
(für das BILD) und `axo-kennzahlen.js` (für die ZAHLEN). Dieselbe Regel: der
Zyklus mit den meisten Ecken, Schwelle 8.

Sie zusammenzulegen ging nicht ohne Preis: `baueSzene` gibt seinen `flurIndex`
nur als Teil der fertigen Szene heraus, und eine reine Rechnung darf nicht das
canvas-nähere Modul laden (Bündel-Reihenfolge, und `baueSzene` braucht die
Höhen-Tabelle, die eine Raumbuch-Zeile nichts angeht).

Die Doppelung wird deshalb nicht schöngeredet, sondern **gemessen**: Gate **C1**
hält `erschliessungIndex` gegen `baueSzene(...).flurIndex`, **C2** zusätzlich
gegen die FLÄCHE (derselbe Index kann in zwei verschieden sortierten Listen auf
verschiedene Räume zeigen — der Vergleich der Zahl schliesst das aus). Laufen
sie auseinander, zeigt das Blatt einen anderen Flur als das Raumbuch, und das
Gate wird rot.

**Wenn die Anzeige-Welle `axo-szene.js` ohnehin anfasst**, ist die saubere
Auflösung: `flurIndexVon(raeume)` aus `axo-kennzahlen.js` exportieren und in
`axo-szene.js` importieren (die Bündel-Reihenfolge erlaubt es — `kennzahlen`
steht vor `szene`). Dann fällt C1/C2 als Prüfung weg und wird zur Tautologie.
Solange `axo-szene.js` unangetastet bleibt, ist die bewiesene Doppelung das
kleinere Übel.

---

## 8 · Was das Gate prüft (53 Prüfungen, jede mit Gegenprobe)

```
node tools/pruefe-kennzahlen.mjs      # ohne Browser, ~15 s (tsc), Exit 0/1
```

| Block | Prüfung | Gegenprobe |
|---|---|---|
| Vor | `AXO_MODULE` vollständig + Reihenfolge, Bündel übersteht `entkleide`, **keine Namenskollision mit den Hüllen** | die Kollisions-Prüfung findet `WAND_DICKE_CM` in der Hülle wieder — sie kann also rot werden. Die Doppelklick-Datei wird nur geprüft, wenn sie NEUER ist als das Modul |
| A | Gauss-Formel == Bounding-Box bei allen 24 achsparallelen Vierecken (grösste Abweichung 7,1e-15 m²) | Plan um 10 % gestaucht → **beide** Schätzer fallen um exakt 19,00 %; bliebe einer stehen, wäre er eine Konstante |
| B | 224 + 65 + 0 === 289; Histogramme summieren sich; 12 von 18 Ankern | ein Stück +200 m → „ausserhalb" wird 1, die Stückliste verliert es NICHT |
| C | `erschliessungIndex` === `baueSzene.flurIndex`, gleiche Fläche | ein einzelnes 400×300-Viereck hat KEINE Erschliessungszone (Index −1) und 12,0 m² |
| D | 21 Prüfungen: jeder Hinweis mit Auslöser und Nicht-Auslöser | Tür 87,5 feuert / 100 cm schweigt · 4 Wandband-Stücke `gesetzt` feuern / `gemessen` schweigen · Auslieferungszustand ist LEER |
| E | Stückliste summiert; jede Art hat ihren deutschen Namen | erfundener Typ steht mit technischer Kennung da und fällt auf; ein gekipptes Stück → 288/1 |
| F | Wandkanten gehören zum richtigen Zyklus, jede Kennung existiert | erfundener Zyklus → 0 Kennungen; eine Wand weniger → 3 statt 4 |

Die Prüfung heisst **A2 „grösste Abweichung"**, nicht „Abweichung bei Raum 7":
ein Maximum über alle 24 kann sich nicht hinter einem Mittelwert verstecken.

---

## 9 · Offen für die Anzeige-Welle (Schritt 3)

1. **Blatt-Anlage, Grundriss-Kopf, Legende, Massstabsleiste, Nordpfeil** — das
   eigentliche Ziel dieser Welle. Ausgänge stehen bereit.
2. **`Halle400-Modell.html` neu bauen** (`node tools/baue-planer-datei.mjs`).
   Solange das nicht geschieht, ist `axo-kennzahlen.js` in der Doppelklick-Datei
   **nicht enthalten**. Das Gate sagt es beim Lauf ausdrücklich, statt still
   grün zu melden. Absichtlich hier gelassen: die Anzeige-Welle baut die Datei
   ohnehin neu, und ein 965-KB-Artefakt ohne Aufrufer neu zu committen erzeugt
   nur einen Konflikt.
3. **Nordpfeil:** die Richtung ist im Plan **nicht gemessen**. `labels[].seite`
   führt `nord`/`sued` — das ist die Herkunft der Bezeichnung, nicht eine
   Kompassmessung. Ein Nordpfeil ist damit eine **gesetzte Annahme** und muss
   in der Legende als solche stehen (Projekt-DNA Punkt 4), sonst behauptet das
   Blatt eine Ausrichtung, die die PDF nicht hergibt.
4. **Massstabsleiste:** `baueSzene(...).grenzen` liefert die Ausdehnung in
   Metern; die Umrechnung Bild↔Welt steht in `axo-treffer.js` (`projiziereAuf`).
   Keine zweite Projektionsformel bauen — das war die Lehre aus W7 Punkt 2.
5. **Wo die Hinweise hingehören:** NICHT in den Grundriss-Kopf. Der trägt schon
   „N Stück frei gesetzt — kein Aufmass" und die Öffnungs-Zähler; ein Kopf, der
   bei 0 Hinweisen leer bleibt und bei 3 Hinweisen umbricht, verschiebt das
   ganze Blatt. Eigener Block unter dem Raumbuch, mit `FUSSZEILE` darunter.
6. **Unter 900 px fällt die Fussnote auf dem BILDSCHIRM weg** (bekannt aus W6,
   bewusst offen). Wer die `FUSSZEILE` dort einhängt, erbt das Problem — am
   Handy trägt die Aussage dann niemand. Entweder mit einhängen oder ausdrücklich
   entscheiden, dass die Kopf-Zähler es tragen.
7. **`m² je Stuhl` als Spalte darstellen**, `null` als „—". Und die
   `LEGENDE_STUHLFLAECHE` daneben, nicht in einer Fussnote drei Blöcke weiter:
   ein Vergleichswert, den man suchen muss, ist keiner.
