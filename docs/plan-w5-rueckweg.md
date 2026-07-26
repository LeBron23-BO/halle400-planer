# Welle 5 — Der Rückweg: Bearbeitung zurück ins Projekt (Bauplan)

Erarbeitet 2026-07-26 am echten Code. Das Problem: `tools/export_blueprint.py`
erzeugt `app/public/plaene/halle400.json` neu aus der Pipeline. Der nächste Lauf
überschreibt jede Bearbeitung des Nutzers — **zwei Stunden Arbeit weg, ohne
Warnung.** Zugleich gilt die Projekt-DNA: die PDF ist die alleinige Grundwahrheit
der Geometrie und darf durch Nutzer-Eingaben nie beschädigt werden.

## Fünf Befunde, alle gemessen

**B1 — Die gesicherte Nutzerdatei ist provenienz-ÄRMER als das, was sie ersetzen
würde.** Der Export schreibt je Wand `herkunft` und `art`
(`tools/export_blueprint.py:137`), aber `SavedFloorplan.walls` kennt beide Felder
nicht (`src/model/floorplan.ts:315-323`); `saveFloorplan` schreibt nur
`id`/`corner1`/`corner2`/Texturen (`:636-647`). **Der erste Klick auf „Sichern"
löscht die Mess-Herkunft aller 100 Wandstücke.** Damit ist die naheliegende Idee
„die gesicherte Datei wird einfach der neue Auslieferungsstand" widerlegt — sie ist
nicht neutral, sie ist ein Provenienz-Verlust.

**B2 — „Gemessen oder angefasst" ist byte-genau entscheidbar, auch ohne
`quelle`-Feld an der Wand.** Die Ecken-Kennung IST der Hash ihrer Koordinate
(`tools/export_blueprint.py:58-62`). Gegengezählt: **76 von 76** Ecken im
gemessenen Plan erfüllen `id == ecken_id(x, y)`. Eine vom Nutzer gezeichnete Ecke
bekommt eine GUID (`src/model/corner.ts:38,40`), eine verschobene gemessene behält
ihre Kennung und fällt damit aus dem Hash. Die fehlende `quelle` an der Wand ist
eine Lücke im Feld, keine Lücke in der Information.

**B3 — Bei Möbeln trennt ein einziges vorhandenes Feld die zwei Fälle.**
`verschiebeAusstattung` setzt `quelle: 'gesetzt'`, lässt `beleg` aber ausdrücklich
stehen — „die Spur zurück" (`src/model/floorplan.ts:919-931`).
`fuegeAusstattungHinzu` kann keinen `beleg` haben (`:790-802`). Also:
**`gesetzt` MIT `beleg` = verschobenes Messstück · `gesetzt` OHNE `beleg` = neues
Stück.** Das ist nicht dasselbe und darf nicht dasselbe werden.

**B4 — Der Konfliktfall ist bereits gelöst, solange man ihn nicht kaputtmacht.**
Wand-Kennungen stehen im gemessenen Plan gar nicht, sie werden beim Laden aus dem
Eckenpaar abgeleitet (`src/model/floorplan.ts:389-391`) — also aus der Geometrie.
Der `anker` einer Öffnung ist genau für den Neu-Export gebaut (`:220-224`),
`versoehneOeffnungen` sucht 25 cm weit (`:284-292`). Eine um ein paar Zentimeter
gewanderte Wand nimmt ihre Tür mit; darüber hinaus wird die Tür verwaist und der
Blattkopf sagt es.

**B5 — Der naive Rückfluss wäre genau die verbotene Lüge.** `lade_ausstattung`
schneidet `id` und `quelle` weg (`tools/export_blueprint.py:222-232`), und beim
Laden ist der Standard `'gemessen'` (`src/model/floorplan.ts:829`). Ein Rückfluss
über diese Funktion machte aus jeder Setzung still ein Aufmaß.

## Was zurückfließt — und was nicht

| Kategorie | Erkennung | Rückfluss |
|---|---|---|
| Neu hingestelltes Möbel | `gesetzt`, **kein** `beleg` | `gesetzt.json → neue_stuecke` |
| Verschobenes gemessenes Möbel | `gesetzt`, `beleg` vorhanden | `gesetzt.json → verschiebungen` mit `erwartet:{x0,y0,typ}`. Nie als neues Stück, nie zurück in `data/ausstattung.json` — dort steht, wo es GEMESSEN wurde |
| Gelöschtes gemessenes Stück | fehlt gegenüber frischem Export | `gesetzt.json → entfernt`. Die Messung bleibt stehen, nur die Anzeige unterdrückt sie |
| Tür / Fenster / Durchgang | `floorplan.oeffnungen` | `gesetzt.json → oeffnungen`, **mit `anker`** (sonst stirbt B4) |
| Umbenannter Raum | `floorplan.roomMeta` | `gesetzt.json → raumnamen` |
| **Gezeichnete** Wand | beide Ecken nicht hash-treu | **nein, nur zählen und berichten.** Eine neue Wand ändert die Raumableitung, damit Flächen, damit die Zahlen im Businessplan — eigene Welle mit eigenem Gate |
| **Verschobene gemessene** Wand | Ecke hash-untreu | **nein, harter Abbruch mit Nennung der Ecke.** Das ist eine Behauptung über das Aufmaß, die nur die PDF machen darf |

## Die einzige Naht

Gemessenes entsteht ausschließlich in `extract_plan.py`, `measure_walls.py` →
`build_walls.py` und der handkuratierten `data/ausstattung.json` (289 Elemente,
289 mit `beleg`, gegengezählt). **Diese drei Dateien fasst niemand an.** Die einzige
Naht ist `main()` in `tools/export_blueprint.py:275-288` — dort werden `labels` und
`ausstattung` schon heute nachträglich in den fertigen Plan gehängt. Eine Zeile
weiter kommt die Setzungs-Schicht dazu: additiv, zuletzt, ohne die Quellen zu
berühren.

## Die Schritte

**1 · Der Wächter (~25 Zeilen, eine halbe Stunde).** Vor dem Schreiben
(`export_blueprint.py:287`) die vorhandene Zieldatei lesen und **fail-closed**
abbrechen, wenn sie Setzungen trägt, die die Quellen nicht hergeben: Möbel mit
`quelle: 'gesetzt'`, Öffnungen, hash-untreue Ecken, Raumnamen. Ist etwas davon
vorhanden und nicht durch `data/gesetzt.json` gedeckt → Abbruch mit Anleitung
(`uebernimm-bearbeitung.py <datei>` oder `--verwerfe-setzungen`).
Ab hier ist stiller Verlust unmöglich. Heute zählt die Zieldatei 0/0/0/0 — der
Export läuft also unverändert durch.

**2 · Der Trockenlauf ist der Standard.** `tools/uebernimm-bearbeitung.py <datei>`
liest, klassifiziert nach der Tabelle oben und **schreibt nichts**. Ohne Argument
sucht es die neueste `Halle400-Plan-*.json` im Download-Ordner — das ist der
Handy-Weg: Datei herüberkopieren, Befehl ohne Argument. Fassungsregeln wie im Kern:
fehlende `formatVersion` → Fassung 1 → „0 Setzungen, diese Datei KANN keine tragen";
höhere Fassung → ehrlich ablehnen.
Zusätzlich: die Nutzerdatei unverändert als `data/arbeitsstand-<datum>.json` ablegen
(Roh-Sicherung, git-verfolgt). Drei Zeilen, und der Nutzer hat immer einen
zurückholbaren Stand, auch wenn eine Übernahme später schiefgeht.

**3 · Schreiben nur mit `--schreibe`.** Ziel `data/gesetzt.json`, fünf getrennte
Abschnitte (kein Eimer — sonst kann der Export „neu hingestellt" nicht von
„verschoben" unterscheiden und schriebe Dubletten), dazu `_stand` mit Quelldatei und
Datum. Übernahme ist ersetzend je Abschnitt, **nie stumm schrumpfend**: wer eine
ältere Datei einspielt, muss `--auch-entfernen` sagen.

**4 · Additiv einhängen (~40 Zeilen).** `lade_gesetzt()` neben `lade_ausstattung()`;
im `main()` nach Zeile 278 anwenden: Verschiebungen (Treffer über Kennung → x/y/
Drehung, `quelle: 'gesetzt'` **explizit** schreiben, `beleg` behalten), Entferntes
herausfiltern, neue Stücke anhängen, Öffnungen und Raumnamen setzen.
**Kritisch:** `lade_ausstattung` bleibt unangetastet — sie darf `id`/`quelle`
weiter wegschneiden, sonst verliert die Messung ihre Sauberkeit (B5). Jede
Verschiebung, deren `erwartet` nicht mehr zur Quelle passt, wird **nicht**
angewendet, sondern als Warnung gedruckt.

**5 · Gate `tools/pruefe-uebernahme.mjs`, sechs Prüfungen mit Gegenproben.**
(1) `--ohne-gesetzt` erzeugt eine Datei, die byte-identisch mit dem letzten
gemessenen Stand ist — Gegenprobe: mit Setzungen MUSS sie abweichen.
(2) Übernahme → Export → Zahl der Setzungen im geladenen Plan == Zahl aus der
Nutzerdatei; Gegenprobe: `gesetzt.json` wegnehmen ⇒ Zahl fällt auf 0, Gate rot.
(3) alle Ecken hash-treu (heute 76/76); Gegenprobe: eine Ecke um 3 cm verschieben ⇒
rot. (4) kein Stück mit `beleg` trägt nach dem Bau `gemessen`, wenn es in den
Verschiebungen steht. (5) Attrappe mit verschobener gemessener Ecke ⇒ Abbruch mit
Exit ≠ 0. (6) Wand wandert 10 cm ⇒ Tür bleibt; 60 cm ⇒ verwaist, nicht gelöscht.
Danach in `tools/alle-gates.sh` eintragen, sonst fällt es durchs Netz.

**6 · Doku** — `CLAUDE.md` Werkzeugkette und ein Abschnitt „Der Rückweg", der
Bedienweg in drei Zeilen in `docs/betrieb.md`.

**7 · Später, eigene Welle: gezeichnete Wände** nach `data/gezeichnet-waende.json`,
das `build_walls.py` nicht kennt und `export_blueprint.py` als vierte Segmentquelle
mit `art: "gesetzt"` einliest — damit die Axonometrie sie topologisch trotzdem
richtig einordnet. Nicht jetzt: Raumableitung, Flächen und die Zahlen im
Businessplan hängen daran.

## Empfehlung

Zuerst nur den Wächter und die Roh-Sicherung — zusammen unter einer Stunde, und sie
beseitigen das eigentliche Risiko, den **stillen** Verlust, vollständig. Danach der
additive Rückweg genau in der Form aus Schritt 3 und 4: fünf getrennte Abschnitte,
`beleg` als Trennschärfe zwischen „verschoben" und „neu", `anker` mitgeführt,
`quelle` explizit geschrieben. Wände bleiben außen vor, weil die Geometrie allein
der PDF gehört. Die Nutzerdatei zum Auslieferungsstand zu machen ist der scheinbar
einfachere Weg und der einzige, der beweisbar Schaden anrichtet: sie trägt die
Mess-Herkunft der Wände nicht mehr.
