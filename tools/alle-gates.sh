#!/bin/sh
# Führt ALLE Prüfwerkzeuge nacheinander aus und meldet je eines Exit-Code +
# Prüfungszahl. Sequentiell und nicht parallel: jedes Werkzeug startet einen
# eigenen Chromium und misst am selben Server — nebeneinander stören sie sich.
cd "$(dirname "$0")/.." || exit 1
# pruefe-tueren, pruefe-planer-datei und pruefe-haertung standen bis W6 NICHT in
# dieser Liste — sie liefen also nie mit, obwohl sie zusammen mehr Pruefungen
# tragen als die Haelfte der uebrigen. Ein Sammelwerkzeug, das Gates auslaesst,
# meldet gruen fuer etwas, das es gar nicht angesehen hat.
# pruefe-uebernahme braucht weder Server noch Chromium (es misst auf Datei- und
# Kern-Ebene), laeuft aber sequentiell mit — ein Gate, das nur jemand von Hand
# startet, ist nach zwei Wochen ein Gate, das niemand startet.
# pruefe-schutz (W10) misst die drei schweren Punkte des Bedien-Audits: dass ein
# Zug im Verschieben-Werkzeug keine Wand mehr trifft, dass kein Stand mehr still
# verschwindet und dass „Zuruecksetzen" seinen Umfang nennt und rueckholbar ist.
# pruefe-zusammenlegen (W12) misst die RECHNUNG hinter „zwei Raeume zusammenlegen"
# (src/raum/raum-zusammenlegen.js) — ohne Browser, weil die ganze Entscheidung
# reine Geometrie ist. Dadurch lassen sich die Grenzfaelle DURCHFAHREN statt in
# einer Bedienung zu erahnen: L-Form, schiefer Raum, Grenze in drei Stuecken,
# Raeume die sich nur in einer Ecke beruehren. Es laedt AUSSTATTUNG_VORLAGEN aus
# dem uebersetzten Kern (tsc-Lauf, ~20 s) statt Moebelmasse abzuschreiben.
# pruefe-wand-bewegen (W12b) misst das, was der Nutzer als Hauptsache genannt
# hat: dass eine WAND sich ziehen laesst wie ein Moebel. Der harte Teil ist nicht
# das Ziehen, sondern dass die Endecken auf den Nachbarwaenden GLEITEN — naiv
# verschoben reisst der Grundriss auf, und aus einem Grundriss mit Luecken bildet
# findRooms KEINE Raeume mehr (Raumnamen weg, Flaechen null, ohne Fehlermeldung).
# Abschnitt F zieht die Wand am ECHTEN Floorplanner ueber zugBeginnen/zugSchritt —
# dieselben drei Methoden, die Maus, Blatt und Finger alle benutzen.
# pruefe-serve-datei (W10) misst den HANDY-WEG: die Datei laeuft am iPhone nicht
# per Doppelklick (Safari zeigt eine lokale .html seit iOS 18.5 als Text), also
# haengt der ganze Telefon-Zugang an tools/serve-datei.mjs. Gemessen wird beides:
# dass die eine Datei mit text/html herauskommt UND dass sonst NICHTS herauskommt
# — das Repo ist oeffentlich, ein Server mit Pfad-Abbildung waere ein Leck. Es
# braucht keinen Chromium und startet nur eigene Server auf freien Ports; nur
# fuer die Handy-Adresse braucht es EINE echte Tailscale-Freigabe auf einem
# freien Port (laeuft dort schon etwas, sagt es das statt es zu ueberspringen).
# pruefe-siegel (W11) misst das Einzige, was gegen BOESWILLIGKEIT hilft: dass
# der Plan eine Unterschrift traegt, dass ein einziges veraendertes Zeichen sie
# bricht, dass die Werkstatt ohne Passwort zu bleibt — und dass die Fassung fuer
# die Bank kein einziges Bedienelement enthaelt. Es legt sich dafuer ein eigenes
# Wegwerf-Siegel an und fasst das scharfe nicht an.
# pruefe-menue (W13) misst den WEG zur Funktion, nicht ihr Vorhandensein. Der
# Nutzerbefund aus W12 war „ich kann die Waende immer noch nicht bewegen",
# obwohl das Werkzeug seit W10 da war und seit W12b zog: gebaut, aber nicht
# gefunden. Gemessen wird deshalb, dass ein Griff auf ein Ding sagt, was mit
# DIESEM Ding geht — und dass die Trennwand ihre zwei Raeume kennt (W13b:
# Entfernen IST Verbinden). Abschnitt F fuehrt das BUENDEL wirklich aus: ein
# umbenannter Import waere im Planer unsichtbar und in der Doppelklick-Datei
# eine tote Bedienung ohne Fehlermeldung.
GATES="pruefe-kennungen pruefe-ziehen pruefe-palette pruefe-undo pruefe-ansicht pruefe-ausstattung pruefe-loeschen pruefe-zeichnen pruefe-axonometrie pruefe-touch pruefe-ausstattung-3d pruefe-tueren pruefe-planer-datei pruefe-haertung pruefe-uebernahme pruefe-axo-bearbeiten pruefe-finger pruefe-kennzahlen pruefe-schutz pruefe-siegel pruefe-serve-datei pruefe-zusammenlegen pruefe-wand-bewegen pruefe-menue"
if [ -n "$1" ]; then GATES="$*"; fi
gesamt=0
for g in $GATES; do
  [ -f "tools/$g.mjs" ] || { echo "FEHLT   $g"; gesamt=1; continue; }
  aus=$(node "tools/$g.mjs" 2>&1)
  code=$?
  # Drei Ausgabeformate sind historisch gewachsen (OK/FEHL, ✓/✗, BESTANDEN/
  # DURCHGEFALLEN). Alle drei zaehlen, sonst meldete das Sammelwerkzeug "0
  # Pruefungen" fuer ein Gate, das in Wahrheit ein Dutzend gefahren hat.
  ok=$(printf '%s' "$aus" | grep -c '^OK  \|^✓ \|^BESTANDEN')
  fehl=$(printf '%s' "$aus" | grep -c '^FEHL\|^✗ \|^DURCHGEFALLEN ')
  if [ "$code" -eq 0 ]; then
    echo "GRUEN   $g — $ok Pruefungen"
  else
    echo "ROT     $g — $ok ok / $fehl fehl (exit $code)"
    printf '%s\n' "$aus" | grep '^FEHL\|^✗ ' | head -8
    # Bei 0 gemeldeten Fehlern hat das Werkzeug nicht gepatzt, sondern ist
    # ABGESTUERZT. Dann sagt nur das Ende der Ausgabe, woran — ohne diese
    # Zeilen steht da "ROT" und sonst nichts, und man sucht im Falschen.
    if [ "$fehl" -eq 0 ]; then
      echo "        --- Absturz, letzte Zeilen ---"
      printf '%s\n' "$aus" | tail -12 | sed 's/^/        /'
    fi
    gesamt=1
  fi
done
exit $gesamt
