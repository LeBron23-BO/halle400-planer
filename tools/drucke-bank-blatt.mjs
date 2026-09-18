// DAS BLATT FUER DIE BANK — A3 und A4 aus der ausgelieferten Datei selbst.
//
//   node tools/drucke-bank-blatt.mjs --datei Hotel400-fuer-die-Bank.html --name Hotel400-Grundriss-Bank
//
// WARUM ALS WERKZEUG UND NICHT VON HAND
// Die erste Fassung dieser Blaetter entstand in einer Sitzung per Wegwerf-Aufruf.
// Danach bekam der Plan sechs Raumnamen und 45 Moebel — die Blaetter blieben auf
// dem alten Stand und lagen weiter auf dem Schreibtisch. Ein Ausdruck, der dem
// Modell widerspricht, ist schlimmer als gar keiner: die Bank sieht zwei
// Wahrheiten und traut keiner.
//
// WAS GEDRUCKT WIRD
// Die DRAUFSICHT mit eingeschalteten Raumnamen — nicht die Schraegansicht. Auf
// Papier gibt es kein Drehen; die Draufsicht ist die einzige Ansicht, in der
// jeder Raum seine eigene Flaeche zeigt und die Namen nicht uebereinander
// fallen.
//
// WARUM BILD IN PDF UND NICHT page.pdf()
// Die Seite ist eine Leinwand, die ihre Groesse zur Laufzeit ausrechnet. Der
// eingebaute PDF-Druck legt ein Druck-Stylesheet an, das die Leinwand neu
// vermisst — gemessen: das Blatt kam leer heraus. Ein Bild in fester Groesse
// kann das nicht passieren.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PW = 'file:///C:/Users/dania/.gemini/node_modules/playwright/index.js'
const { chromium } = (await import(process.env.PLAYWRIGHT_PFAD || PW)).default
const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, s) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : s }

const DATEI = path.resolve(WURZEL, arg('--datei', 'Hotel400-fuer-die-Bank.html'))
const NAME = arg('--name', 'Hotel400-Grundriss-Bank')
const ZIEL = path.resolve(arg('--nach', WURZEL))
if (!fs.existsSync(DATEI)) { console.error(`Nicht gefunden: ${DATEI}`); process.exit(1) }

// Blattmasse quer in Millimetern; 1 mm = 72/25.4 Punkte im PDF.
const BLAETTER = [
  { kuerzel: 'A3', mm: [420, 297] },
  { kuerzel: 'A4', mm: [297, 210] }
]
const PUNKT_JE_MM = 72 / 25.4

const browser = await chromium.launch()
const ergebnisse = []
for (const blatt of BLAETTER) {
  const [bmm, hmm] = blatt.mm
  // 150 dpi: scharf genug zum Ausdrucken, klein genug zum Mailen.
  const breite = Math.round(bmm / 25.4 * 150)
  const hoehe = Math.round(hmm / 25.4 * 150)
  const ctx = await browser.newContext({ viewport: { width: Math.round(breite / 2), height: Math.round(hoehe / 2) }, deviceScaleFactor: 2 })
  await ctx.route('http://**', r => r.abort())
  await ctx.route('https://**', r => r.abort())
  const seite = await ctx.newPage()
  const fehler = []
  seite.on('console', m => m.type() === 'error' && fehler.push(m.text()))
  await seite.goto(pathToFileURL(DATEI).href)
  await seite.waitForTimeout(2500)
  await seite.getByRole('button', { name: 'Plan', exact: true }).click({ timeout: 8000 })
  // „Knapp" und nicht „Alle": jeder Raum bekommt seinen Namen, aber keiner
  // seine Zusatzzeile. Auf Papier ist das kein Verlust, sondern der Grund, dass
  // ueberhaupt etwas zu lesen ist — die Zusatzzeile ist die breiteste Zeile
  // jedes Etiketts und schiebt am dichten Ende des Riegels die Namen der
  // Nachbarraeume vom Blatt.
  await seite.getByRole('button', { name: 'Knapp', exact: true }).click({ timeout: 8000 })
  // Die Bedienleisten gehoeren auf den Bildschirm, nicht aufs Papier: auf einem
  // Ausdruck sind "Axonometrie" und "Namen: alle" Knoepfe, die niemand druecken
  // kann. Der Titelblock (.kopf) bleibt — er traegt Bauwerk, Masse und Siegel.
  // Der Siegel-Abdruck steht in der Kopfleiste, die gleich verschwindet — auf
  // einem Blatt fuer die Bank ist genau er das Wertvollste daran: er sagt, von
  // wem der Plan ist. Er wandert darum in den Titelblock, bevor die Leiste geht.
  await seite.evaluate(() => {
    const marke = document.querySelector('#siegelMarke')
    const kopf = document.querySelector('.kopf')
    if (!marke || !kopf) return
    const zeile = document.createElement('div')
    zeile.className = 'sub'
    zeile.style.marginTop = '6px'
    zeile.textContent = marke.textContent.replace(/\s+/g, ' ').trim()
    kopf.appendChild(zeile)
  })
  // Was auf dem Bildschirm bedient wird, gehoert nicht aufs Papier: Knoepfe,
  // die niemand druecken kann, und der Hinweis "Ziehen dreht".
  // Hier stand einmal auch `.zusatz` in dieser Liste — als Versuch, die
  // Zusatzzeilen der Raumnamen wegzublenden. Gemessen: in der ausgelieferten
  // Datei gibt es KEIN Element dieser Klasse, die Regel hat nie gebissen. Die
  // Namen sind in die Leinwand GEMALT und lassen sich mit CSS ueberhaupt nicht
  // erreichen; darum macht das der Knopf "Knapp" oben, und zwar dort, wo die
  // Entscheidung hingehoert: im Zeichner.
  await seite.addStyleTag({ content: '.kopfleiste, .leiste, .hinweis { display: none !important; }' })
  // Erst nach dem Ausblenden ist der Platz frei; die Leinwand vermisst sich bei
  // einem resize neu und passt den Grundriss ueber das ganze Blatt ein.
  await seite.evaluate(() => window.dispatchEvent(new Event('resize')))
  await seite.waitForTimeout(1800)
  const png = path.join(ZIEL, `${NAME}-${blatt.kuerzel}.png`)
  await seite.screenshot({ path: png, timeout: 25000 })
  if (fehler.length) { console.error(`Konsolenfehler beim Druck (${blatt.kuerzel}): ${fehler.length}`); process.exit(1) }
  await ctx.close()
  ergebnisse.push({ blatt, png })
}
await browser.close()

// Das Bild ins Blatt setzen: PyMuPDF liegt im System und kann randlos einpassen.
const hilfsSkript = path.join(ZIEL, '_bild-in-blatt.py')
fs.writeFileSync(hilfsSkript, `import fitz, sys, json, os
from PIL import Image

# Zwei Groessenfallen, beide gemessen: ein Bildschirmfoto traegt tausende
# Zwischentoene aus der Kantenglaettung (637 KB), und PyMuPDF legt ein Bild
# ohne Zutun UNKOMPRIMIERT ins Blatt (12,7 MB). Ein Grundriss hat in
# Wahrheit ein paar Dutzend Farben; nach der Reduktion und mit
# deflate_images bleibt ein Blatt, das man verschicken kann.
for auftrag in json.loads(sys.argv[1]):
    b_pt, h_pt = auftrag["punkte"]
    bild = Image.open(auftrag["png"]).convert("RGB").quantize(colors=64, method=Image.MEDIANCUT)
    schmal = auftrag["png"].replace(".png", "-druck.png")
    bild.save(schmal, optimize=True)
    doc = fitz.open()
    seite = doc.new_page(width=b_pt, height=h_pt)
    seite.insert_image(fitz.Rect(0, 0, b_pt, h_pt), filename=schmal)
    doc.save(auftrag["pdf"], deflate=True, deflate_images=True, garbage=4)
    os.remove(schmal)
`, 'utf8')
const auftraege = ergebnisse.map(({ blatt, png }) => ({
  png,
  pdf: path.join(ZIEL, `${NAME}-${blatt.kuerzel}.pdf`),
  punkte: [blatt.mm[0] * PUNKT_JE_MM, blatt.mm[1] * PUNKT_JE_MM]
}))
const { execFileSync } = await import('node:child_process')
execFileSync('python', [hilfsSkript, JSON.stringify(auftraege)], { stdio: 'inherit' })
fs.unlinkSync(hilfsSkript)

// Rueckleseprobe: eine PDF-Datei, die es nicht gibt oder leer ist, meldet sich nicht von selbst.
for (const a of auftraege) {
  const gross = fs.existsSync(a.pdf) && fs.statSync(a.pdf).size > 20000
  if (!gross) { console.error(`Das Blatt ist nicht entstanden oder ist leer: ${a.pdf}`); process.exit(1) }
  console.log(`  ${path.basename(a.pdf)}  ${(fs.statSync(a.pdf).size / 1024).toFixed(0)} KB`)
}
console.log('Blaetter fertig.')
