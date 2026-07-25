// Prueft die Ausstattung in der 3D-Ansicht (A6): erscheinen die gemessenen
// Koerper, stehen sie auf dem Boden INNERHALB der Bausubstanz, ragen sie nicht
// durch das Gebaeude, und ueberleben sie ein Rueckgaengig?
//
// Voraussetzung: der Auslieferungs-Server laeuft.
//   node tools/serve-local.mjs --port 3301
//   node tools/pruefe-ausstattung-3d.mjs [--port 3301] [--plan halle400]
// Exit 0 = alle Pruefungen bestanden, 1 = mindestens eine durchgefallen.
//
// WAS HIER GEPRUEFT WIRD — UND WAS BEWUSST NICHT:
// Die 2D-Pruefung (tools/pruefe-ausstattung.mjs) weist bereits nach, dass alle
// 289 Zeichen vorhanden und ueber alle zehn Zehntel der Halle verteilt sind.
// Beide Ansichten lesen DIESELBE Quelle (floorplan.getAusstattung(), es gibt
// keine zweite Ablage) — die VOLLSTAENDIGKEIT hier noch einmal zu messen waere
// also keine unabhaengige Gegenprobe, sondern dieselbe Zahl zweimal.
//
// Was 3D-spezifisch NEU sein kann und deshalb hier geprueft wird, ist die
// UEBERSETZUNG: die Grundriss-y-Achse wird zur z-Achse, die Drehung kehrt ihr
// Vorzeichen um, und jeder Koerper bekommt eine gesetzte Hoehe. Jeder dieser
// drei Schritte kann einzeln falsch sein, ohne dass die Daten es merken —
// ein Achsentausch etwa wuerde die Moebel plausibel aussehen lassen und weit
// neben die Halle setzen.
//
// WIE GEMESSEN WIRD:
// Die Moebelfarben tragen einen kraeftigen Blaustich (b - r >= 40) und sind
// dunkel (r < 160). Beides zusammen ist im Bild exklusiv: Waende sind neutral
// (b - r = 0), der Holzboden ist rotstichig (r > b), und der Himmel ist zwar
// leicht blaeulich, aber hell (r ~ 213). Das ist dieselbe Lehre wie in A1 —
// dort zaehlte eine zu neutrale Moebelfarbe die WAENDE als Moebel und die
// Pruefung meldete trotzdem "bestanden".
//
// Der WebGL-Canvas gibt seine Pixel nicht ueber getContext('2d') her. Der
// Renderer laeuft aber mit preserveDrawingBuffer, deshalb liefert toDataURL
// ein gueltiges Bild, das in ein 2D-Canvas gezeichnet und dort ausgelesen wird.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PW_STANDARD = 'file:///C:/Users/dania/.gemini/node_modules/playwright/index.js'
const { chromium } = (await import(process.env.PLAYWRIGHT_PFAD || PW_STANDARD)).default

const arg = (name, standard) => {
  const i = process.argv.indexOf(name)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : standard
}
const PORT = arg('--port', '3301')
const PLAN = arg('--plan', 'halle400')

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'h400-ausstattung3d-'))
const log = (s) => {
  console.log(s)
  fs.appendFileSync(`${DIR}/bericht.txt`, s + '\n')
}

const BREITE = 1440
const HOEHE = 900
const MITTE_X = BREITE / 2
const MITTE_Y = HOEHE / 2

/**
 * Der Aufbau muss deterministisch sein, sonst zeigt jeder Lauf ein anderes
 * Bild: die Ansicht dreht sich von allein weiter, solange noch nie geklickt
 * wurde (Main.spin). Ein einzelner Klick stoppt das — erst danach sind
 * Zoom und Schwenk reproduzierbar.
 */
async function oeffne(browser) {
  const page = await browser.newPage({ viewport: { width: BREITE, height: HOEHE } })
  await page.goto(`http://localhost:${PORT}/?plan=${PLAN}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(9000)

  // Eigendrehung anhalten. Main.spin() laeuft nur, solange die Maus NICHT
  // ueber der Ansicht ist — ein blosses Hineinfahren genuegt also. Ein Klick
  // waere der naheliegende Weg und ist trotzdem falsch: er trifft einen Raum
  // und oeffnet das Panel "Boden anpassen", das anschliessend Messflaeche
  // verdeckt. Die Maus bleibt fuer den Rest des Laufs ueber der Ansicht.
  await page.mouse.move(MITTE_X, MITTE_Y)
  await page.waitForTimeout(400)

  await page.evaluate(() => {
    window.__messe3d = async () => {
      // Der 3D-Canvas ist das Kind von #viewer; #floorplanner-canvas ist die
      // 2D-Ansicht und hier bewusst NICHT gemeint.
      const gl = document.querySelector('#viewer canvas')
      const bild = new Image()
      bild.src = gl.toDataURL('image/png')
      // PFLICHT: ein Image laedt auch aus einer data-URL asynchron. Ohne
      // decode() zeichnet drawImage ein leeres Bild und die Messung meldet
      // null Pixel — ein Fehlschlag des Messwerkzeugs, der wie ein Fehlschlag
      // des Gemessenen aussieht.
      await bild.decode()
      const hilfs = document.createElement('canvas')
      hilfs.width = gl.width
      hilfs.height = gl.height
      const ctx = hilfs.getContext('2d')
      ctx.drawImage(bild, 0, 0)
      const d = ctx.getImageData(0, 0, hilfs.width, hilfs.height).data

      const leer = () => ({ n: 0, minX: 1e9, maxX: -1, minY: 1e9, maxY: -1 })
      const moebel = leer()
      const boden = leer()
      const nimm = (o, x, y) => {
        o.n++
        if (x < o.minX) o.minX = x
        if (x > o.maxX) o.maxX = x
        if (y < o.minY) o.minY = y
        if (y > o.maxY) o.maxY = y
      }

      for (let y = 0; y < hilfs.height; y++) {
        for (let x = 0; x < hilfs.width; x++) {
          const i = (y * hilfs.width + x) * 4
          if (d[i + 3] <= 10) continue
          const r = d[i]
          const g = d[i + 1]
          const b = d[i + 2]
          // Moebel: kraeftiger Blaustich UND dunkel. Der zweite Teil schliesst
          // den Himmel aus, der ebenfalls leicht blaeulich, aber hell ist.
          if (b - r >= 40 && r < 160) nimm(moebel, x, y)
          // Holzboden: rotstichig. Er ist der einzige verlaessliche Umriss der
          // Bausubstanz von oben, denn Waende sind weiss wie die Oberflaeche.
          else if (r - b >= 40 && r > 100) nimm(boden, x, y)
        }
      }
      // Wie viele Moebelpixel liegen INNERHALB des Bodenumrisses? Ein
      // Achsentausch (x/z vertauscht) wuerde die Koerper weit neben die Halle
      // werfen und diesen Anteil einbrechen lassen.
      let imBoden = 0
      if (boden.n > 0) {
        for (let y = 0; y < hilfs.height; y++) {
          for (let x = 0; x < hilfs.width; x++) {
            const i = (y * hilfs.width + x) * 4
            if (d[i + 3] <= 10) continue
            const r = d[i]
            const b = d[i + 2]
            if (b - r >= 40 && r < 160) {
              if (x >= boden.minX && x <= boden.maxX && y >= boden.minY && y <= boden.maxY) imBoden++
            }
          }
        }
      }
      return { cw: hilfs.width, ch: hilfs.height, moebel, boden, imBoden }
    }
  })
  return page
}

const messe = (page) => page.evaluate(async () => await window.__messe3d())

/** Kamera in die Draufsicht schwenken (senkrecht von oben auf den Boden). */
async function schwenkeNachOben(page) {
  await page.mouse.move(MITTE_X, MITTE_Y)
  await page.mouse.down()
  for (let i = 0; i < 30; i++) {
    await page.mouse.move(MITTE_X, MITTE_Y + i * 12)
    await page.waitForTimeout(20)
  }
  await page.mouse.up()
  await page.waitForTimeout(700)
}

const ergebnisse = []
const pruefe = (name, ok, zusatz = '') => {
  ergebnisse.push({ name, ok })
  log(`${ok ? 'BESTANDEN ' : 'DURCHGEF. '} ${name}${zusatz ? '  ' + zusatz : ''}`)
}

const browser = await chromium.launch()
try {
  const page = await oeffne(browser)

  // ---- Startansicht: erscheinen die Koerper, passt die Halle? -----------
  const schraeg = await messe(page)
  await page.screenshot({ path: `${DIR}/1-startansicht.png` })
  log(`Startansicht: Moebel ${schraeg.moebel.n} Pixel, Boden ${schraeg.boden.n} Pixel`)
  log(`  Bodenumriss x ${schraeg.boden.minX}..${schraeg.boden.maxX} (Bild 0..${schraeg.cw - 1})`)
  log(`             y ${schraeg.boden.minY}..${schraeg.boden.maxY} (Bild 0..${schraeg.ch - 1})`)
  pruefe(
    'Ausstattung erscheint in der 3D-Ansicht',
    schraeg.moebel.n > 2000,
    `${schraeg.moebel.n} Pixel`
  )

  // T7-3D: die GANZE Halle muss beim Oeffnen ins Bild passen. Beruehrt der
  // Boden einen Bildrand, ist sie abgeschnitten — genau der Zustand vor
  // T7-3D, als controls.maxDistance bei 1500 cm endete und von 7800 cm Halle
  // immer nur ein Abschnitt zu sehen war.
  const b0 = schraeg.boden
  const ganzImBild =
    b0.n > 0 && b0.minX > 0 && b0.maxX < schraeg.cw - 1 && b0.minY > 0 && b0.maxY < schraeg.ch - 1
  pruefe(
    'Die ganze Halle passt beim Oeffnen ins Bild',
    ganzImBild,
    ganzImBild ? 'ringsum Rand frei' : 'Boden stoesst an einen Bildrand'
  )

  // Nichts darf durch das Gebaeude nach oben durchstossen: der hoechste
  // gesetzte Koerper ist der Aufzugsschacht mit 300 cm, also genau die
  // Wandhoehe. In der Schraegsicht von oben heisst das: ueber der obersten
  // Bodenkante darf kein Moebelpixel mehr liegen.
  pruefe(
    'Kein Koerper ragt ueber das Gebaeude hinaus',
    schraeg.moebel.n > 0 && schraeg.moebel.minY >= schraeg.boden.minY - 4,
    `oberstes Moebel y=${schraeg.moebel.minY}, oberste Bodenkante y=${schraeg.boden.minY}`
  )

  // ---- Draufsicht: sitzen sie an der richtigen Stelle? ------------------
  await schwenkeNachOben(page)
  const oben = await messe(page)
  await page.screenshot({ path: `${DIR}/2-draufsicht.png` })
  const anteil = oben.moebel.n > 0 ? oben.imBoden / oben.moebel.n : 0
  log(`Draufsicht: Moebel ${oben.moebel.n} Pixel, davon ${oben.imBoden} im Bodenumriss`)
  log(`  Bodenumriss x ${oben.boden.minX}..${oben.boden.maxX}, y ${oben.boden.minY}..${oben.boden.maxY}`)
  log(`  Moebelumriss x ${oben.moebel.minX}..${oben.moebel.maxX}, y ${oben.moebel.minY}..${oben.moebel.maxY}`)

  pruefe('Ausstattung auch von oben sichtbar', oben.moebel.n > 2000, `${oben.moebel.n} Pixel`)
  // Lagebeweis: waeren x und z vertauscht, laege die Ausstattung weit neben
  // der Halle und dieser Anteil fiele gegen null.
  //
  // EHRLICHE EINORDNUNG: seit T7-3D fuellt der Boden nicht mehr den ganzen
  // Rahmen, sondern liegt mit freiem Rand darin — ein Moebel neben der Halle
  // faellt dadurch wirklich heraus. Vorher war der Test schwach, weil der
  // Bezugsrahmen praktisch das ganze Bild war. Ein Nachweis ZENTIMETER-genauer
  // Lage ist er trotzdem nicht; den fuehren die 2D-Pruefung (gegen die
  // Bausubstanz gemessen) und das Sicht-Gate.
  pruefe(
    'Ausstattung liegt auf dem Hallenboden, nicht daneben',
    anteil >= 0.97,
    `${(anteil * 100).toFixed(1)} % im Bodenumriss (Soll >= 97 %)`
  )
  // Von oben verdeckt der Boden alles, was UNTER ihm liegt. Sichtbare
  // Moebelpixel beweisen damit, dass die Koerper oberhalb y = 0 sitzen und
  // nicht im Boden versunken sind.
  pruefe(
    'Koerper stehen auf dem Boden (nicht darin versunken)',
    oben.moebel.n > schraeg.moebel.n * 0.5,
    `${oben.moebel.n} Pixel von oben gegen ${schraeg.moebel.n} schraeg`
  )

  // ---- Rueckgaengig ----------------------------------------------------
  // Die Ausstattung liegt auf derselben Speicher-/Ladeachse wie die Waende,
  // weil UndoManager seine Momentaufnahmen ueber save/load zieht. Faende ein
  // Rueckgaengig sie nicht wieder, waere genau diese Achse gebrochen.
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(1500)
  const nachUndo = await messe(page)
  await page.screenshot({ path: `${DIR}/3-nach-undo.png` })
  log(`Nach Strg+Z: Moebel ${nachUndo.moebel.n} Pixel`)
  pruefe(
    'Ausstattung ueberlebt Rueckgaengig',
    nachUndo.moebel.n > oben.moebel.n * 0.8,
    `${oben.moebel.n} -> ${nachUndo.moebel.n} Pixel`
  )

  await page.close()
} finally {
  await browser.close()
}

log('')
const durch = ergebnisse.filter((e) => !e.ok)
log(durch.length === 0 ? 'GESAMT: BESTANDEN' : `GESAMT: ${durch.length} DURCHGEFALLEN`)
log(`Bericht + Bildschirmfotos: ${DIR}`)
log('Das Sicht-Gate bleibt Pflicht: 2-draufsicht.png ANSEHEN — sitzen die')
log('Stuehle an den Tischkanten? Eine gespiegelte Drehung faellt nur dort auf.')
process.exit(durch.length === 0 ? 0 : 1)
