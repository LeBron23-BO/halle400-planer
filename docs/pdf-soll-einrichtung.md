# Das SOLL der Einrichtung — was auf dem Blatt steht (t2, W20)

**Quelle:** `C:\Users\dania\Desktop\Nur Büro.pdf` — die Grundwahrheit (Projekt-DNA Punkt 1).
**Zweck:** die eine Liste, gegen die `node tools/raum-inventar.mjs` gehalten wird.
Maschinenlesbar liegt sie in `data/pdf-soll.json`; dieses Dokument ist ihre Begründung.

## Drei Dinge vorweg, ohne die jede Zahl hier falsch gelesen wird

1. **Auf dem Blatt stehen keine Maße, kein Maßstab, keine m².** Jede Meterangabe wäre
   erfunden. Dieses Dokument zählt STÜCKE und beschreibt LAGEN — mehr gibt die Quelle nicht her.
2. **Diese Liste ist eine LESART, kein Messwert.** Ein gezeichnetes Symbol ist nicht
   immer eindeutig. Wo die Lesart unsicher ist, steht das ausdrücklich da und die
   maschinenlesbare Fassung trägt `null` statt einer Zahl — eine geratene Zahl sähe
   belegt aus und wäre schlimmer als eine offene Lücke.
3. **Die Lesart ist widerlegbar, und sie wurde schon einmal widerlegt.** Die erste
   Auswertung las am Konferenztisch „5 Stühle Nord + 5 Süd". Das Overlay
   (`python tools/mess_kachel.py --von 1 --bis 6 --mit-ausstattung`) zeigt sechs
   und sechs — die Modell-Umrisse liegen genau auf den gezeichneten Symbolen, und
   der Raumname sagt „10-12 Personen". Hier gilt die überprüfte Zahl: **12**.

## Wie geprüft wird, und warum nicht härter

`node tools/pruefe-soll-ist.mjs` meldet **nicht** jede Abweichung als Fehler. Es prüft:

- **A** — jeder benannte Raum und jede Zone des Solls existiert im Ist.
- **B** — jede Abweichung zwischen Soll und Ist ist in `data/pdf-soll.json` unter
  `abweichungen` **benannt**. Eine neue, unquittierte Abweichung ist rot.
- **C** — Gegenprobe: eine künstlich eingefügte Abweichung MUSS rot werden.

Der Grund für B statt „Soll == Ist": das Blatt ist freihändig gezeichnet und diese
Liste ist eine Lesart davon. Ein Gate, das jede Unschärfe rot meldet, wird nach dem
dritten Mal abgeschaltet — und dann meldet es auch den echten Fehler nicht mehr.
Benannt werden muss trotzdem jede einzelne: **stillschweigend gefüllt wird nichts.**

---

## A — Nord, von West nach Ost

| Raum | Was das Blatt zeigt | gezählt |
|---|---|---|
| Toiletten | 4 Kabinen an der Nordwand, Waschtisch mit 4 Becken (2×2), Kabinen öffnen nach Süden | 4 wc + 4 waschbecken |
| Teamtable | 1 Langtisch OST-WEST, 8 Hocker (4 nördlich, 4 südlich) | 1 tisch + 8 |
| Aufzug | Quadrat mit Diagonalkreuz, vorspringender Vorbau — keine Möblierung | 0 |
| Empfang | L-förmiger Tresen, 7-8 Felder, Längsseite NORD-SÜD, **kein einziger Stuhl**; östlich eine Sitznische: Bank mit 4 Polstern + 1 Rundsessel + 2 Hocker | Tresen + 7 |
| Einzelbüro (2×) | je 1 Schreibtisch NORD-SÜD, ca. 3 bzw. 2 Stühle | 1 tisch + ca. |
| Workspace Nord | ca. 4 Bench-Blöcke NORD-SÜD, je 3 Stühle West + 3 Ost | ca. |
| Loggia | 1 Langtisch OST-WEST, 3+3 Stühle | 1 tisch + 6 |
| Videokonf | 1 zweiteiliger Tisch NORD-SÜD, 2 Stühle gegenüber | 2 tisch + 2 |
| Storage | Regalriegel ca. 9 Fächer, sonst **leer** | ca. |
| WC-Block Ost | 4 Kabinen + 4 Becken — **auf dem Blatt unbeschriftet** | 4 wc + 4 waschbecken |
| Workshop Ost | 1 Tisch NORD-SÜD, 4 Hocker, Schrank 3 Fächer, Flipchart, Wandtafel an der Südwand | 1 tisch + 4 |

## B — Süd, von West nach Ost

| Raum | Was das Blatt zeigt | gezählt |
|---|---|---|
| Konferenz 10-12 Personen | 1 Rechtecktisch OST-WEST, **6 Stühle Nord + 6 Süd**, keine Kopfplätze, Sideboard an der Südwand, 3 Pflanzen an der Nordkante | 1 tisch + 12 + 1 schrank + 3 pflanze |
| Konferenz 6-8 Personen | **runder** Tisch, genau 6 Stühle ringsum | 1 rundtisch + 6 |
| Workspace Süd | 2 Cluster à 2×2 = 4 Tische, je 2 Stühle West + 2 Ost, Längsachsen NORD-SÜD | 4 tisch + 8 |
| Workshop 6-8 | 1 Tisch OST-WEST, 3+3 Stühle, 4 runde Poufs südlich | 1 tisch + 6 + 4 |
| Phone Booth | 2 Kabinen, je 1 V-Sitz (Öffnung nach Norden) + 1 ovaler Tisch. Derselbe Riegeltyp kommt **mindestens zweimal** vor, beschriftet ist nur einer | 2 tisch + 2 |
| Doppelbüro | 2 Schreibtischblöcke NORD-SÜD, dazwischen ein hoher Schrankbalken, je 2 Stühle **diagonal versetzt**, Regalriegel an der Ostwand | 2 tisch + 4 + 1 schrank |
| Break out | 2 Sofas einander gegenüber + 1 kleiner Quadrattisch | 1 tisch + 2 |
| Lager | **ausdrücklich leer gezeichnet** | 0 |

## C — Was außerdem auf dem Blatt steht

- **8 begrünte Loggien** (4 Nord, 4 Süd), davon eine leer, die übrigen mit Café-Sets.
- **Zwei Treppenhäuser** (West und Ost), schraffiert, außerhalb der grauen Bürofläche.
- **Regalriegel als Raumteiler**, mehrfach wiederkehrend.

## D — Die ehrlichen Lücken der Quelle

Diese Punkte sind auf dem Blatt **nicht sicher lesbar**. Sie tragen in
`data/pdf-soll.json` deshalb `null` und gelten nie als „geprüft":

1. Stuhl-, Pflanzen- und Beistellmöbel-Symbole sind in Einzel- und Doppelbüro nicht
   sicher zu unterscheiden — die Zahlen dort sind ca.-Werte.
2. Ob ein Bench-Block 4 oder 6 Plätze hat, hängt an einer teils verwischten Mittelfuge.
3. Die wiederkehrenden Leiter-Riegel sind als Regal gedeutet; beschriftet ist nur *Storage*.
4. Keine Küchenzeile ist beschriftet.
5. Der Nordpfeil trägt keine Buchstaben — „Norden oben" ist eine Lesart.
6. **13 der 27 Räume tragen keinen Namens-Anker.** Sie sind hier bewusst NICHT
   zugeordnet: die Zuordnung über den nächstgelegenen Namen ist eine Näherung, und
   die wurde gemessen verworfen (sie legte zwei Waschbecken in den Aufzug und fünf
   Schränke in das leer gezeichnete Lager). Was ohne Anker dasteht, bleibt ohne Namen.

## E — Befunde aus dem ersten Soll-Ist-Vergleich (2026-08-11)

Alle drei sind mit dem Overlay belegt, nicht mit Augenmaß:
`python tools/mess_kachel.py --von 6 --bis 13 --mit-ausstattung`

### E1 — Eine Sitzgruppe steht zweimal im Modell (schwer)

Das Blatt zeigt in *Konferenz 6-8* **einen** runden Tisch (Ø ca. 1,3 m, Mittelpunkt
bei ca. x 9,4 m) mit 6 Stühlen ringsum. Das Modell trägt dort **zwei** Sitzgruppen,
und keine liegt auf dem gezeichneten Kreis:

- `rundtisch 150×150` bei x 7,80 m mit 4 Stühlen — rund 1,6 m **westlich** davon,
  jenseits der Trennwand bei x 8,10 m, also in *Konferenz 10-12*. Dort ist auf dem
  Blatt leere Fläche.
- `rundtisch 170×170` bei x 10,45 m mit 6 Stühlen — rund 1 m **östlich** davon.

Die Belege verraten die Ursache: die westliche Gruppe trägt `mess/x0-10_…`, die
östliche `mess/x9-19_…`. **Dieselbe Sitzgruppe wurde in zwei benachbarten
Mess-Kacheln je einmal abgelesen**, beide Male am Kachelrand und beide Male mit
Versatz — und weil die Trennwand dazwischen läuft, verteilt sich das Ergebnis auf
zwei Räume. Das erklärt beide auffälligen Stückzahlen auf einen Schlag:
*Konferenz 10-12* zählt +4 Stühle und +1 Rundtisch, *Konferenz 6-8* +2 Stühle.

**Nicht in t2 repariert, und zwar bewusst:** die Korrektur setzt eine neue Position
in einer GEMESSENEN Quelle (`data/ausstattung.json`). Woher der Kreis wirklich kommt,
muss an der Kachel abgelesen werden — das ist eine Messrunde und keine Aufräumarbeit.
Sie steht als eigener Schritt an.

### E2 — Drei Pflanzen sind als `rundtisch` erfasst (mittel)

An der Nordkante von *Konferenz 10-12* (y ≈ 8,18 m) liegen drei Modell-Stücke vom Typ
`rundtisch` (75×55, 65×65, 70×55 cm). Das Overlay zeigt sie exakt auf drei
gezeichneten **Pflanzsymbolen** — Kreise mit Blattkontur. Die PDF-Lesart nennt für
diesen Raum 3 Pflanzen; das Modell führt im ganzen Raum **keine einzige**.

Folge: `rundtisch` ist mit 31 Stück überzählt, `pflanze` mit 14 unterzählt. Die
Reparatur ist ein reiner Typwechsel ohne neue Position — anders als E1.

### E3 — Die erste Lesart des Konferenztisches war falsch (behoben)

„5 Stühle Nord + 5 Süd" stand in der ersten Auswertung; gezeichnet sind 6 und 6.
Bemerkt hat es das Overlay, nicht das Nachzählen auf dem Blatt. Die Zahl ist in
diesem Dokument und in `data/pdf-soll.json` korrigiert. **Die Lehre gehört zum
Befund:** eine Zählung am Bild ist eine Behauptung, solange nichts sie hält —
zwölf Modell-Umrisse, die auf zwölf gezeichneten Symbolen liegen, sind ein Beleg.
