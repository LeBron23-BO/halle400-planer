# Was der Plan hergibt — und was nicht

> Befunde der Geometrie-Extraktion (T2/T2b/T2c), Stand 2026-07-23.
> Zweck: die Grenzen des Ausgangsmaterials festhalten, bevor T3 daraus einen
> Grundriss baut. Ein Import ohne diese Grenzen erzeugt eine Nachbildung, die
> exakt **aussieht** und es nicht ist.
>
> Quelle: `C:/Users/dania/Desktop/Nur Büro.pdf`, eine Seite, `rotation = 90`.
> Werkzeuge: `tools/extract_plan.py`, `tools/measure_walls.py`, `tools/plan_tiles.py`.

## 1. Drei Ebenen — zwei exakt, eine unscharf

| Ebene | Inhalt | Güte |
|---|---|---|
| Text | 18 Raumbeschriftungen | **exakt** — echter Text, keine Pixel |
| Vektor | 18 Führungslinien | **exakt** — Ansatz am linken Textrand, 18/18 |
| Raster | die gesamte Bausubstanz | **unscharf** — Freihand-Duktus, 45 Bildkacheln |

Die Trennung ist keine Stilfrage, sondern bestimmt, welchen Zahlen man trauen
darf. Raumnamen und ihre Ankerpunkte sind belastbar. Jede Wandkoordinate ist
eine Messung an einer gezeichneten Linie mit endlicher Strichbreite.

### Es gibt keine Vektor-Ebene für die Wände (nachgeprüft)

Die naheliegende Hoffnung — die Wände liegen als Vektoren vor und man müsste
sie nur auslesen — trägt nicht. Gemessen mit `page.get_drawings()`:

```
56 senkrechte Linien   davon 18 Führungslinien
38 übrige senkrechte   ALLE bei y 1200…1210 (Anzeige) = 27,5…27,9 m
                       → weit unter der Südkante (15,31 m): Planstempel
317 Bezier-Kurven      245 ebenfalls im Planstempel, Rest < 10 px Ausdehnung
                       → Buchstaben-Rundungen der Beschriftungen
  4 Rechtecke          ebenfalls Planstempel
```

Damit ist die Pixelmessung nicht die bequeme, sondern die einzige Möglichkeit.
Der Befund spart die Suche nach einer Abkürzung, die es nicht gibt.

## 2. Der Maßstab ist kalibriert, nicht abgelesen

Der Plan trägt **keine Maßkette**. Die 78 m Länge sind eine gesetzte Angabe.
Der Maßstab wird darauf kalibriert und **isotrop** verwendet — ein
Architekturplan hat in beiden Achsen denselben Maßstab. Die Tiefe ist deshalb
ein Messwert (15,31 m), keine Vorgabe.

Unabhängige Gegenprobe: die gemessene Flurbreite ergibt 2,35 m gegen 2,40 m
aus der Vorarbeit. Zwei Wege, ein Ergebnis — die Kalibrierung trägt.

Konstanten stehen im Kopf von `tools/extract_plan.py`. Sie sind **gemessen**
(spaltenweise Außenkontur bei 3-fachem Render), nicht aus einer früheren
Sitzung geerbt; die geerbten Werte lagen im Osten sichtbar daneben.

## 3. Die Wände: was die Messung liefert

`tools/measure_walls.py` projiziert je Zeile (Nord = Nordkante…Flur,
Süd = Flur…Südkante) die dunklen Pixel spaltenweise und verschmilzt
Treffer im Umkreis von 0,6 m zu Kandidaten. Der Radius ist so groß, weil der
Freihand-Duktus **jede Wand als Doppellinie** zeichnet.

Stärkster mechanischer Filter ist **nicht** die Belegung, sondern der
Durchlauf: eine Trennwand berührt beide Bandränder, ein Tisch steht frei.
Die Belegung allein scheidet aus, weil eine Wand mit Türöffnung keine hohe
Belegung erreicht.

Ergebnis bei Schwelle 0,30 / Radius 0,60 m:

| Zeile | Kandidaten | davon durchlaufend |
|---|---|---|
| Nord | 38 | 30 |
| Süd | 45 | 26 |

**56 durchlaufende Kandidaten für 18 benannte Bereiche.** Der Filter arbeitet
korrekt und reicht trotzdem nicht — die Ursachen liegen im Plan, nicht im
Verfahren (Abschnitt 4). Deshalb liefert das Werkzeug bewusst *Kandidaten mit
Messwerten*, keine fertige Wandliste. Die Entscheidung „Wand oder Möbel" fällt
am Bild: `python tools/plan_tiles.py --kandidaten`.

## 4. Zwei Gründe, warum die Automatik hier endet

### 4.1 Der Riegel ist nicht durchgehend zweizeilig

Das Modell *Nordzeile / Flur / Südzeile mit senkrechten Trennwänden* stimmt
für **x ≈ 12…65 m**. Dort stehen die Wände sogar auf gemeinsamen Achsen durch
beide Zeilen. Außerhalb nicht:

* **West (0…12 m)** — Treppenhaus, Sanitärkerne, schmale Schächte. Andere Körnung.
* **Ost (65…78 m)** — Küche, Lager, Treppe; der Flur endet bei ≈ 72 m.

Eine Bandprojektion über die volle Länge misst dort Strukturen, die keine
Trennwände sind.

### 4.2 Es gibt offene Bereiche ohne Wände dazwischen

In der Nordzeile liegt zwischen **x 12,7 und 23,8 m keine einzige Trennwand**.
Küche, *Teamtable*, *Aufzug* und *Empfang* teilen sich einen offenen Bereich.

Daraus folgt eine Korrektur am Gate von T2c. Die ursprüngliche Fassung —
*„jeder der 18 Anker liegt zwischen genau zwei Trennwänden"* — ist nicht
erfüllbar, und zwar nicht wegen einer zu schwachen Messung, sondern weil der
Plan es nicht hergibt. Ein Verfahren, das dieses Gate grün bekommt, hat
Wände erfunden.

### 4.3 Nicht jede Beschriftung benennt einen Raum

Die 18 Beschriftungen sind dreierlei:

* **Räume** mit Wänden ringsum — *Einzelbüro*, *Videokonf*, *Lager*, *Storage*
* **Zonen** in einem offenen Bereich — *Empfang*, *Workspace*
* **Möbel** — *Teamtable* ist ein Tisch; *Loggia* ist ein Außenbereich;
  *Aufzug* springt als Vorbau nach Norden aus dem Riegel (Anker y = −1,78 m)

Das prägt T3 und T4: `roomMeta` kann nicht jede Beschriftung auf einen Raum
abbilden. Zonen und Möbel brauchen einen eigenen Träger, sonst entstehen
Wände, die es nicht gibt — oder Säulen-Zuordnungen ins Leere.

## 5. Was daraus folgt

1. Die Wandliste entsteht **kuratiert**: Messung liefert die Präzision (die
   Achse als belegungsgewichtete Mittellinie), die Sichtprüfung entscheidet
   über Wand oder Möbel. Beides ist im Ergebnis nachvollziehbar — die
   Kandidatennummer bleibt die Kennung.
2. Offene Bereiche werden **als offen geführt**, nicht zugemauert.
3. Das Gate von T2c wird ersetzt durch: *jeder Anker liegt in genau einem
   Fach ODER ist als Zone/Möbel in einem offenen Bereich gekennzeichnet* —
   plus Sichtprüfung des Overlays. Zahlen allein schließen T2c nicht ab.
4. Toleranz mitführen: Wandachse = Mittellinie des Duktus. Bei Konflikt
   gewinnt der Sicht-Vergleich, nicht die zweite Nachkommastelle.

## Sichtentscheidungen T2c-verfeinern (2026-07-23)

Grundlage: `python tools/plan_tiles.py --kandidaten --breite 10 --aus data/kacheln10`
(20-m-Kacheln zeigen zu wenig Detail — bei 10 m wird die Unterscheidung
Wand/Moebel am Freihand-Duktus erst sicher).

### Aufgenommen

- **nord-14 (29.1 m)** — Trennwand der beiden Nordbueros. Zwischen nord-12
  (25.76 m) und nord-16 (32.45 m) liegt eine 6.7 m breite Bueroeinheit;
  nord-14 teilt sie in zwei Zellen von je rund 3.3 m, jede mit eigenem
  Schreibtisch. Belegung nur 0.47, weil die Wand oben an der Loggia endet
  statt bis zur Aussenkante durchzulaufen — kein Messfehler, sondern die
  Bauform.

### Ausgeschlossen

- **sued-34 (54.45 m) und sued-36 (56.44 m)** — die beiden Laengskanten EINES
  freistehenden Konferenztisches, Stuehle auf beiden Seiten. Der Tisch nimmt
  fast die volle Bandhoehe ein und besteht dadurch den Durchlauf-Test. Eine
  Wand mitten durch einen ringsum bestuhlten Tisch gibt es nicht. Damit ist
  der bisherige ZU_PRUEFEN-Verdacht entschieden.

### Weiter offen (benannt, nicht geraten) — AUFGELÖST am 2026-07-23

- **nord-17 (35.30 m, beleg 0.73)** — fiel mit der gestrichelt gezeichneten
  Mittelfuge eines grossen, ringsum bestuhlten Tisches zusammen, also dasselbe
  Muster wie sued-34/36. Damals liess sich am Bild NICHT ausschliessen, dass
  dahinter eine Wand steht.
  **Entschieden im Volldurchgang (siehe Abschnitt unten): ausgeschlossen.**
  Auf der 10-m-Kachel ist erkennbar, was die 20-m-Kachel verschluckte — die
  Linie ist gestrichelt, und Waende sind in diesem Plan durchgezogen.
  ZU_PRUEFEN ist seitdem leer.

### Negativbefund: die Suedzeile 19..32 m ist WIRKLICH offen

Die 13-m-Luecke war der groesste Verdacht auf eine fehlende Messung. Sie ist
keine. Am Bild (`data/kacheln/kand_sued_1_19-39m.png`) ist der Bereich ein
durchgehend offener Workspace mit Tischgruppen und einer begruenten Loggia;
die dort verworfenen Kandidaten sued-11 bis sued-18 sind Tischkanten und die
Begrenzung des Aussenbereichs. Erst bei sued-19 (31.92 m) steht wieder eine
echte, durchgezeichnete Wand.

Ebenso in der Nordzeile: nord-13 (27.52 m) und nord-15 (30.62 m) liegen MITTEN
auf den beiden Bueroschreibtischen — sie sind durchlaufend, weil Tisch, Stuhl
und Pflanze zusammen die Bandhoehe fuellen, nicht weil dort eine Wand steht.

**Uebertragbar:** Eine niedrige Belegung bei durchlaufendem Kandidaten hat zwei
voellig verschiedene Ursachen — eine echte Wand mit Tueroeffnung ODER eine
Reihe zufaellig uebereinanderliegender Moebel. Die Zahl allein unterscheidet
sie nicht; nur der Blick aufs Bild tut es.

---

## 6. Volldurchgang aller Kandidaten (2026-07-23)

Alle 18 Kacheln aus `python tools/plan_tiles.py --kandidaten --breite 10 --aus
data/kacheln10` wurden einzeln angesehen. Damit ist **jede** der 83 Kennungen
entschieden; `ZU_PRUEFEN` ist leer. Ergebnis: **29 Trennwände** (vorher 32),
38 Wände gesamt, 54 verworfen.

Die Zahl sank, obwohl verfeinert wurde — weil vier Falsch-Positive
verschwanden und nur eine echte Wand hinzukam. Das ist der Sinn der Übung:
eine Wand, die es nicht gibt, ist schädlicher als eine, die noch fehlt.

### Drei Muster erklären fast alle Fälle

**Muster A — ein Tisch, drei Kandidaten.** Ein ringsum bestuhlter Tisch
erzeugt bis zu drei senkrechte Kandidaten: linke Kante, gezeichnete
Mittelfuge, rechte Kante. Belegt bei sued-7/8/9, sued-11/12/13, sued-17/18,
sued-34/35/36, nord-19/20. Alle drei bestehen den Durchlauf-Test, weil Tisch
plus Stühle die Bandhöhe füllen.

**Muster B — Loggia/Terrasse.** Die beigen Flächen mit Bepflanzung und Kies
sind Außenbereiche mit freier Möblierung. Was dort senkrecht misst, ist
Pflanzkübel oder Terrassenmöbel. Das betrifft ausgerechnet die beiden
Bereiche, die als „fehlende Messung" verdächtigt waren — Nord 45..64 m und
Süd 19..32 m. Beide sind keine Lücken, sondern offene Flächen.

**Muster C — gestrichelt statt durchgezogen.** Wände sind in diesem Plan
durchgezogen. Eine gestrichelte Senkrechte ist die Fuge zweier
zusammengeschobener Tische (nord-17, sued-35).

### Zwei Falsch-Positive, gefunden durch eine Gegenprobe ohne Auge

`nord-19` (41.50 m) und `nord-20` (42.89 m) standen als Wände in der Liste.
Ihr Abstand beträgt **1.39 m** — mitten im 6.86-m-Raum zwischen nord-18 und
nord-21, mit Stühlen links und rechts davon. Ebenso `sued-25` (42.29 m): die
Mittelfuge eines 1.92-m-Schreibtischblocks im 7.0-m-Raum sued-23..sued-27.

Gegenüberliegend zeigt der Plan dasselbe Bild: Nord 38.74..45.60 m und
Süd 38.94..45.92 m sind zwei etwa gleich große Räume mit je einem Tischblock
in der Mitte. Die Messung hatte im Norden die Tischkanten, im Süden die
Tischfuge für eine Wand gehalten.

**Der mechanische Test dahinter:** zwei benachbarte „Wände" mit weniger als
rund 1.5 m Abstand umschließen keinen Raum, sondern einen Körper. Dieser Test
braucht kein Bild und findet genau die Fehler, die am Bild leicht durchrutschen
— er ergänzt die Sichtprüfung, statt sie zu ersetzen.

### Was der Test noch anzeigt (bewusst so belassen)

- **Nord 10.02..10.99 m (0.97 m).** Zwei lange, durchgezogene Linien im
  Sanitärblock. Für einen begehbaren Raum knapp, für Installationsschacht oder
  WC-Kabine normal. Bleibt drin — die Linien sind eindeutig gezeichnet.
- **Nord 12.70..23.76 m (11.06 m)** und **Süd 18.64..31.92 m (13.28 m).** Die
  bekannten offenen Bereiche. Kein Messfehler, sondern das Gebäude.

### Aufgenommen in diesem Durchgang

- **sued-37 (58.80 m, beleg 0.56)** — kräftige, durchgezogene Senkrechte, die
  auf halber Bandhöhe ansetzt und bis zur Außenwand läuft: der Westabschluss
  der Ost-Loggia. Genau dieser Ansatz auf halber Höhe drückt die Belegung
  unter die Schwelle.

**Übertragbar:** Wo eine Messung strukturell mehrdeutig ist, hilft nicht das
feinere Parameter-Tuning, sondern eine **zweite, unabhängige Frage an dieselben
Daten**. Hier war es die Plausibilität der Raumbreite — sie stützt sich auf
gar keine Bildinformation und fand trotzdem drei Fehler, die die Sichtprüfung
allein übersehen hätte.
