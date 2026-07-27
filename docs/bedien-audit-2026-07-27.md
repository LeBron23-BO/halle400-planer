# Bedien-Audit der Doppelklick-Datei (2026-07-27)

Erhoben durch **Bedienen**, nicht durch Lesen: 30 Playwright-Skripte mit echten
Zeiger-Ereignissen gegen die gebaute Datei, Zustand über `window.__planerDatei`
ausgelesen. Alle Zahlen unten sind gemessen.

## A · Die Reibung

| Aufgabe | heute | möglich | was stört |
|---|---|---|---|
| Einstieg (Ansicht + Werkzeuge) | **2 Klicks** | 0 | Datei startet im Blatt, „Bearbeiten" ist grau und sieht deaktiviert aus |
| auf Arbeitszoom kommen | **5 Klicks** (40 % → 122 %) | 0 | bei 40 % ist ein Stuhl **8,9 px** groß — nichts ist bedienbar |
| einen Stuhl umstellen | 1 Zug | 1 | in Ordnung, solange der Nachbar > 61 cm entfernt steht |
| fünf Stühle an einen anderen Tisch | **5 Züge, 467 px Mausweg** | 2 | keine Mehrfachauswahl |
| einen Tisch um 90° drehen | **6 Tastendrücke** | 1 | Q/E drehen je 15°, keine 90°-Rastung, im Grundriss nirgends erklärt |
| ein Möbel löschen | **4 Klicks, 1608 px** | 1 | Werkzeug hin, Klick, Rückfrage bestätigen, Werkzeug zurück |
| eine Trennwand einziehen | 4 Klicks + Esc | 2 | Ziehen erzeugt **keine** Wand, nur Klick-Klick — nirgends erklärt |
| eine Tür setzen | 3 Klicks | 2 | funktioniert gut, aber die Werkzeugleiste springt dabei |
| **einen Raum leerräumen (8 Stück)** | **18 Klicks, 12 862 px** | 2 | 2,25 Klicks je Stück plus 1608 px hin und zurück zur festen Rückfrage |
| den Stand sichern | 1 Klick | 1 | in Ordnung |

**R1 — Man zielt, statt zu handeln.** Greifradius **12 px = 61 cm** im Startzoom;
das Ziel selbst ist 45 cm groß. Die Fehlertoleranz ist größer als der Gegenstand.

**R2 — Schwenken und Ziehen sind dieselbe Geste.** 3 von 20 Schwenkversuchen
verschoben stattdessen ein Möbel. Der Zeiger meldet nichts: über Möbel, Wand und
Leerraum ist er immer derselbe.

**R3 — Derselbe Fehlgriff zerstört das Aufmaß.** Ein Zug auf eine Wand-Ecke —
identische Geste, kein Werkzeugwechsel, keine Rückfrage — verschob die Außenwand um
**2,24 m**. Die Zeile lautete sofort „3 Wände verschoben, 3 gemessene Wände fehlen —
kein Aufmaß". Rückgängig heilt es, wenn man es bemerkt.

**R4 — Die Werkzeugleiste springt.** Beim Wechsel auf „Türen & Fenster" bewegen sich
**13 von 24 Knöpfen**, bis zu 520 px. Der alte Platz von „Laden" liegt danach unter
**„Zurücksetzen"**.

**R5 — Die Palette verdeckt den Plan.** 132 px breit, darunter liegen 14 der 289
Stücke. Ein Zug dort ist eine stille Nullaktion.

**R6 — Was man in einer Ansicht lernt, gilt in der anderen nicht.** Das Blatt lehrt
„Möbel ziehen, Q und E drehen, Entf löscht" — im Grundriss tun Entf und Rücktaste
nichts, und es steht dort kein Hinweis.

**R7 — Kein Kopieren.** Alt-, Strg-, Umschalt-Zug und Strg+D sind alle wirkungslos.
Ein zweiter Stuhl kostet den vollen Weg zur Palette (825 px).

**R8 — „Einrasten" wirkt nicht auf Möbel.** Mit und ohne gemessen: kein Unterschied.
Der Knopf steht trotzdem in der Möbel-Zeile.

**R9 — Das Verweilen von 700 ms gibt es mit der Maus nicht.** Auch 0 ms Drücken
öffnet die Rückfrage. Die einzige Sicherung ist der Dialog.

**R10 — Kein Widerspruch bei Unsinn.** Tisch mitten in eine Wand, zwei Stühle exakt
aufeinander, Möbel weit außerhalb der Halle — jedes Mal wortlos angenommen.

## B · Die Vorschläge, nach Nutzen je Aufwand

**V1 — Entf löscht das Stück unter dem Zeiger.** *(mittel)* Rückgängig-Hinweis in der
Meldungszeile statt Dialog. **Verdrängt** das Werkzeug „Löschen", das Verweilen, den
Dialog und zwei Werkzeugwechsel je Löschung. Raum leerräumen: 18 Klicks / 12 862 px →
**8 Tastendrücke / 0 px**.

**V2 — Rahmen um mehrere Stücke ziehen und gemeinsam schieben.** *(mittel)* Klick
wählt, Umschalt-Klick ergänzt, Rahmen über Leerraum wählt; Ausgewähltes zieht, dreht
und löscht gemeinsam. Schwenken wandert auf Leertaste-Zug und mittlere Taste (beide
gemessen frei). **Verdrängt R2 vollständig.**

**V3 — Vor dem Drücken sehen, was man greift.** *(klein)* Umriss und Greifhand unter
dem Zeiger; Griff nach dem **kleinsten** Treffer statt nach dem nächsten in 61 cm;
Wand-Ecken nur greifbar, wenn ein Wand-Werkzeug aktiv ist. **Verdrängt R1, R3 und
macht die stille Nullaktion aus R5 sichtbar.**

**V4 — E dreht auf 90°.** *(klein)* Umschalt+Q/E für 15°; der Hinweis steht auch im
Grundriss. 6 Tastendrücke → 1.

**V5 — Beim Öffnen genau dort weitermachen, wo man aufgehört hat.** *(klein)* Ansicht,
Zoom, Schwenklage und Werkzeug in denselben Speicher wie den Plan. Spart 7 Klicks je
Sitzung und behebt den unbenutzbaren 40-%-Start.

**V6 — Alt halten und ziehen kopiert das Stück.** *(klein)* Ersetzt den 825-px-Weg zur
Palette bei jeder Wiederholung.

**V7 — Die Werkzeugleiste bleibt stehen.** *(klein)* Zeile für die Öffnungsarten
dauerhaft reservieren. Verdrängt R4 und den Fehlgriff „Laden" → „Zurücksetzen".

**V8 — Beim Arbeiten sehen, wie viel Aufmaß schon aufgegeben ist.** *(klein)* Die
Zeile steht heute nur im Blatt; sie gehört in den Grundriss, wo die Arbeit passiert —
anklickbar, um genau diese Stücke zurückzusetzen.

**V9 — Stühle rasten an Tischkanten.** *(mittel)* Erst nach V1–V3.

**Zuerst V1, V2, V3** — sie sind derselbe Umbau (Absicht statt Modus) und beseitigen
die zwei teuersten Aufgaben *und* den einzigen Weg, das Aufmaß versehentlich zu
zerstören.

**Was weg kann:** „Löschen" (→ V1) · „Einrasten" aus der Möbel-Zeile (wirkt dort
nachweislich nicht) · „Zoom −/+" und die Prozentanzeige (das Rad zoomt bereits,
„Ganze Halle" genügt) · „Wiederholen" (Strg+Y reicht) · „Zurücksetzen" (siehe C3) ·
der Zustand „Bearbeiten" (die erste Berührung kann ihn schalten).
**Sechs von zwölf Knöpfen der unteren Leiste.**

## C · Produktionsreife-Lücken

**C1 · SCHWER — Die Arbeit verschwindet still.** Datei in einen anderen Ordner kopiert
→ gesetzte Stücke 4 → **0**, kein Dialog, kein Wort. Die Erkennung ist zudem
unzuverlässig (drei Läufe: 1, 1, 0). Auch eine neue Bau-Version derselben Datei
startet bei null. Die Rettungsmechanik ist gebaut und hat in **keinem** Szenario
ausgelöst. → beim Start alle Stände zum selben Plan **und** zu anderen Plänen
anbieten, statt sie nur zu zählen.

**C2 · SCHWER — Das Aufmaß ist mit einer Handbewegung zerstörbar** (R3), ohne
Rückfrage, ohne Warnfarbe, ohne Zeigerwechsel. Genau dieses Aufmaß ist das Argument
gegenüber der Bank.

**C3 · SCHWER — „Zurücksetzen" ist irreversibel.** Danach ist Rückgängig abgeschaltet,
alles weg. Die Rückfrage nennt den Umfang nicht. Zusammen mit R4 rückt der Knopf beim
Werkzeugwechsel unter den alten Platz von „Laden" — der gefährlichste Knopf der Datei.

**C4 · MITTEL — Erste Minute ohne Anleitung.** Der Fremde sieht das Blatt, einen grauen
„Bearbeiten"-Knopf und zwei Sätze, die beide vom Aufmaß handeln. Nichts sagt: *hier
kannst du umstellen*.

**C5 · MITTEL — Widersprüchliche Tastatur** (R6).

**C6 · MITTEL — Der Grundriss-Ausdruck hat keinen Kopf.** Nackte Zeichnung ohne Titel,
Datum, Maßstab und Herkunftszeile — während der Blatt-Ausdruck alles trägt.

**C7 · MITTEL — Tastaturbedienung nur formal.** Tab läuft erst durch alle fünf
Palettenknöpfe; kein Kürzel für Werkzeuge, keine Pfeiltasten-Feinverschiebung.

**C8 · LEICHT — Wand löschen nimmt still einen Raum mit** (25 → 24). Die Rückfrage
nennt nur die Wand.

**C9 · LEICHT — Im Auslieferungsstand steckt eine 1 cm lange Wand.**

**C10 · LEICHT — Das Werkzeug bleibt über den Ansichtswechsel scharf.**

**Verdikt: BLOCKED** — drei schwere Punkte (C1, C2, C3).
