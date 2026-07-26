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
GATES="pruefe-kennungen pruefe-ziehen pruefe-palette pruefe-undo pruefe-ansicht pruefe-ausstattung pruefe-loeschen pruefe-zeichnen pruefe-axonometrie pruefe-touch pruefe-ausstattung-3d pruefe-tueren pruefe-planer-datei pruefe-haertung pruefe-uebernahme"
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
