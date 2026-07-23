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
