# W11 — Das Siegel und das Schloss (2026-07-28)

> **Hinweis zur Ablage:** Dieser Text stand zunächst in `CLAUDE.md`. Die
> Projekt-DNA ist User-Territorium und wird nur mit ausdrücklicher Freigabe
> geändert — deshalb liegt er hier. Wenn er in die DNA soll, ist der fertige
> Abschnitt unten ab „Für CLAUDE.md" bereit zum Übernehmen.

Nutzerwunsch, wörtlich: *„einer von außen kann nicht bearbeiten … wenn zb die
bankberaterin böswillig sein sollte könnte diese den plan gänzlich umändern
oder auch ausversehen bearbeiten. nur ich soll dazu imstande sein."*

---

## Zwei Probleme, zwei Antworten

Wer sie in einen Topf wirft, löst keines:

| | Antwort | Warum die andere nicht reicht |
|---|---|---|
| **Versehen** — jemand klickt und verschiebt eine Wand | die Werkzeuge sind in der Bank-Fassung **nicht vorhanden** | Ein Siegel merkt es erst hinterher |
| **Absicht** — jemand ändert den Plan gezielt | das **Siegel**: jede Änderung ist beweisbar | Werkzeuge entfernen hilft nicht — ein Texteditor reicht |

---

## Sieben Festlegungen

1. **Verhindern geht nicht, beweisen schon.** Wer die Datei besitzt, kann sie
   umschreiben. Was man bauen kann, ist eine Unterschrift, die dabei bricht.
   Wer stattdessen die Prüfung herausschneidet, hält eine Datei **ohne** Siegel
   in der Hand — und die ist erkennbar nicht das Original.

2. **ECDSA P-256, nicht Ed25519 — GEMESSEN, nicht angenommen.** Unter `file://`
   mit hart gesperrtem Netz:

   | Motor | Ed25519 | ECDSA P-256 |
   |---|---|---|
   | Chromium 1228 | ja | ja |
   | Firefox 151 | ja | ja |
   | **WebKit 26.5** | **NEIN** (`NotSupportedError`) | ja |

   WebKit ist Safari, und der Nutzer arbeitet oft vom Telefon — Ed25519 wäre
   das modernere Verfahren gewesen und hätte in der Hälfte der Fälle
   geschwiegen. `isSecureContext` ist unter `file://` in allen drei `true`; nur
   deshalb gibt es dort überhaupt `crypto.subtle`.

3. **Unterschrieben wird der ROH-TEXT**, nicht das Objekt. Der Bauer legt
   `PLAN_TEXT` ab und liest `PLAN` daraus. Ein Objekt müsste man vor dem
   Vergleich kanonisieren, und jede Abweichung zwischen den zwei
   Kanonisierungen wäre ein stiller Fehlalarm. Wer den Plan ändern will, muss
   diese eine Zeile anfassen — womit die Unterschrift bricht.

4. **Node und Browser prüfen mit DERSELBEN API** (`crypto.webcrypto.subtle`).
   Die Verträglichkeit ist gebaut, nicht gehofft: es ist buchstäblich derselbe
   Aufruf mit denselben Parametern.

5. **Das Schloss ist echte Verschlüsselung, kein Abgleich.** PBKDF2-SHA256
   (600 000 Runden) + AES-GCM. In der Datei steht **kein** Passwort und **kein**
   Abdruck davon; AES-GCM ist beglaubigend und scheitert bei falschem Schlüssel
   mit einem Fehler statt mit Unsinn. Ein `if (wort === …)`, das man
   überspringen könnte, existiert nicht.
   **Nach jedem Neuladen fällt es wieder zu** — ein Schloss, das ein Neuladen
   überdauert, ist keines, und man wüsste morgen nicht mehr, ob die eigene
   Kopie offen ist.

6. **Das Schloss muss nicht DevTools-fest sein**, und das ist kein Nachgeben:
   eine Bearbeitung verändert die **Datei** gar nicht. Der eingebaute Plan
   bleibt unangetastet, der Arbeitsstand liegt im Browser-Speicher und reist
   mit keiner Kopie mit. Das Schloss deckt das Versehen — und die
   wahrscheinlichste Panne des ganzen Vorhabens: **die falsche Datei
   verschickt.**

7. **Das Siegel gilt dem EINGEBAUTEN Plan, angezeigt wird der Arbeitsstand.**
   Ohne Zusatz stünde auf einem Ausdruck mit vier verschobenen Wänden
   „unterschrieben und geprüft" — ein wahrer Satz an der falschen Stelle, und
   das ist schlimmer als eine Lüge, weil er sich nicht widerlegen lässt. Die
   Marke sagt darum **„gesiegelt · geändert"**, das Papier den ganzen Satz.
   Abgelesen wird das an den drei Zählern im Blattkopf, nicht neu gerechnet —
   zwei Rechnungen liefen irgendwann auseinander.

---

## Die reine Ansicht (`--nur-ansicht`)

Sie schneidet zehn Blöcke mechanisch aus dem Gerüst (`palette`, `werkzeuge`,
`zurueckFrage`, `schlossFrage`, `rueckfrage`, `grpBearbeiten`, `standleiste`,
`ortFrage`, `ladeFrage`, `dateiWahl`) und **bricht ab**, wenn einer übrig
bliebe.

Die Liste der dabei verschwundenen Kennungen entsteht aus dem Vergleich
vorher/nachher — nicht von Hand — und wandert als `ENTFERNT` in die Datei:
`el()` gibt für genau diese, und nur diese, ein loses Ersatz-Element aus, damit
die 91 Verdrahtungs-Stellen nicht ins Leere laufen. Für jede **andere** fehlende
Kennung bricht `el()` weiterhin laut ab; aus der Bequemlichkeit darf keine
stille Fehlertoleranz werden.

**Bekannte Grenze, ehrlich benannt:** der Werkstatt-CODE liegt in der
Ansichts-Fassung noch in der Datei, nur ohne Bedienelemente. Ihn ganz zu
entfernen hieße, die Bank-Fassung aus `baue-bank-ansicht.mjs` aufzubauen (die
nie Werkstatt gesehen hat) — eine eigene Welle. Praktische Folge heute: keine,
weil Bearbeiten die Datei ohnehin nicht verändert (Festlegung 6).

---

## Die Gates mussten aufschließen lernen

`tools/werkstatt-auf.mjs` ist der EINE Weg dorthin. Er umgeht das Schloss
nicht, er beantwortet es mit dem echten Passwort — aus `HALLE400_PASSWORT` oder
aus einer Zeile in `<Desktop>/hotel400 3d bild/Halle400-PASSWORT.txt`, beides
außerhalb des Repos. Ein Schalter, der das Schloss für Prüfungen aushebelte,
säße in derselben Datei, die den Schutz behauptet, und wäre damit der Schutz.

Angepasst: `pruefe-palette`, `pruefe-tueren`, `pruefe-schutz`,
`pruefe-planer-datei`, `pruefe-haertung`, `pruefe-axo-bearbeiten`,
`pruefe-finger`.

Eine echte Verhaltensänderung steckt darin, keine Regression:
`pruefe-planer-datei G6` prüfte „der Neustart bringt Bearbeiten-Zustand UND
Ansicht zurück". Die Ansicht ja — der Bearbeiten-Zustand bewusst nicht mehr
(Festlegung 5). Das Gate misst jetzt beides getrennt, samt Gegenprobe, dass mit
dem Passwort sofort wieder alles da ist.

---

## Werkzeugkette

```
node tools/siegel.mjs erzeuge      # Schluesselpaar + Passwort. EINMAL. Der private
                                   #   Schluessel landet im Desktop-Ordner, NIE im Repo.
node tools/siegel.mjs signiere --passwort "..."   # nach JEDER Aenderung am gemessenen Plan
node tools/siegel.mjs pruefe <datei.html>         # 0 = echt · 1 = veraendert · 2 = kein Siegel
node tools/siegel.mjs schloss --passwort "..."    # Schloss allein neu setzen
node tools/siegel.mjs passwort-aendern --alt "..." --neu "..."
node tools/siegel.mjs zeige        # Inhaber, Datum, Abdruck

node tools/baue-planer-datei.mjs   # -> Halle400-Modell.html (~1,0 MB): mit Siegel UND Schloss
node tools/baue-planer-datei.mjs --nur-ansicht --ziel <pfad>
                                   # die Fassung FUER DIE BANK — kein Bedienelement der Werkstatt

node tools/pruefe-siegel.mjs       # 43 Pruefungen, jede mit Gegenprobe. Legt sich ein
                                   #   eigenes Wegwerf-Siegel an (HALLE400_DATEN /
                                   #   HALLE400_GEHEIM) und fasst das scharfe nicht an.
                                   #   --nur rechnung | datei | schloss | ansicht
```

Der Bau **bricht ab**, wenn der Plan nicht unterschrieben ist oder die
Unterschrift nicht mehr zum jetzigen Plan passt. `--ohne-siegel` erlaubt es
ausdrücklich.

---

## Für CLAUDE.md

Falls dieser Abschnitt in die Projekt-DNA soll: er gehört zwischen
„Die Doppelklick-Datei (W1)" und „Der SCHUTZ (W10)", und die Werkzeugkette oben
gehört in den Block `# Die Doppelklick-Datei fuer die Bank`. Der fertige
Patch liegt in `/tmp/claude-md-w11.patch` (nur diese Session) — sag Bescheid,
dann trage ich es ein.
