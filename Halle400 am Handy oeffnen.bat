@echo off
rem Liefert die Halle-400-Datei ueber das eigene Netz aus — der WEG ZUM HANDY.
rem
rem Warum es diese zweite Startdatei braucht: am iPhone und iPad laeuft die
rem Datei NICHT per Doppelklick. Safari zeigt eine lokale .html seit iOS 18.5
rem als TEXT statt als Seite. Ueber diesen Server bekommt sie eine Kopfzeile
rem `Content-Type: text/html` — und damit ist sie wieder eine Seite.
rem
rem Die Nachbar-Datei "Halle400-Planer starten.bat" ist etwas anderes: sie
rem startet den grossen Planer aus app\out. Diese hier liefert die EINE
rem Doppelklick-Datei, und sonst nichts.
rem
rem Das Fenster nennt beim Start BEIDE Adressen — die fuer den Rechner und die
rem fuer das Handy. Solange das Fenster offen ist, ist die Seite erreichbar.
cd /d "%~dp0"
node tools\serve-datei.mjs --open
pause
