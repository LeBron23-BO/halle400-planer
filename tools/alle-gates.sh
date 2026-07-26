#!/bin/sh
# Führt ALLE Prüfwerkzeuge nacheinander aus und meldet je eines Exit-Code +
# Prüfungszahl. Sequentiell und nicht parallel: jedes Werkzeug startet einen
# eigenen Chromium und misst am selben Server — nebeneinander stören sie sich.
cd "$(dirname "$0")/.." || exit 1
GATES="pruefe-kennungen pruefe-ziehen pruefe-palette pruefe-undo pruefe-ansicht pruefe-ausstattung pruefe-loeschen pruefe-zeichnen pruefe-axonometrie pruefe-touch pruefe-ausstattung-3d"
if [ -n "$1" ]; then GATES="$*"; fi
gesamt=0
for g in $GATES; do
  [ -f "tools/$g.mjs" ] || { echo "FEHLT   $g"; gesamt=1; continue; }
  aus=$(node "tools/$g.mjs" 2>&1)
  code=$?
  ok=$(printf '%s' "$aus" | grep -c '^OK  \|^✓ ')
  fehl=$(printf '%s' "$aus" | grep -c '^FEHL\|^✗ ')
  if [ "$code" -eq 0 ]; then
    echo "GRUEN   $g — $ok Pruefungen"
  else
    echo "ROT     $g — $ok ok / $fehl fehl (exit $code)"
    printf '%s\n' "$aus" | grep '^FEHL\|^✗ ' | head -8
    gesamt=1
  fi
done
exit $gesamt
