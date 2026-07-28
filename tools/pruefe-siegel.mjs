// Prueft DAS SIEGEL und DAS SCHLOSS (W11-Schutz).
//
//   node tools/pruefe-siegel.mjs
//   node tools/pruefe-siegel.mjs --nur rechnung | datei | schloss | ansicht
//
// Exit 0 = alle Pruefungen bestanden, 1 = mindestens eine durchgefallen.
//
// JEDE PRUEFUNG HAT EINE GEGENPROBE. Ein Siegel, das immer „echt" sagt, ist
// nutzlos und sieht genauso aus wie eines, das funktioniert — der einzige
// Unterschied ist die Frage, ob es auch NEIN sagen kann. Darum wird zu jeder
// bestandenen Pruefung auch der Fall gemessen, in dem sie fehlschlagen MUSS:
// ein veraendertes Byte, ein falsches Passwort, ein fremder Schluessel.
//
// DAS GATE FASST DAS ECHTE SIEGEL NICHT AN. Es legt sich in einem
// Wegwerf-Ordner ein eigenes Schluesselpaar an (HALLE400_DATEN /
// HALLE400_GEHEIM) und baut damit eigene Dateien. Liefe es mit den scharfen
// Dateien, haette es genau einen schlechten Tag, und danach waere die
// Auslieferung unbrauchbar.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HIER = path.dirname(fileURLToPath(import.meta.url))
const WURZEL = path.resolve(HIER, '..')
const PW_STANDARD = 'file:///C:/Users/dania/.gemini/node_modules/playwright/index.js'
const pwMod = await import(process.env.PLAYWRIGHT_PFAD || PW_STANDARD)
const { chromium } = pwMod.default || pwMod

const nur = (() => { const i = process.argv.indexOf('--nur'); return i > -1 ? process.argv[i + 1] : null })()
const laeuft = (teil) => !nur || nur === teil

let fehlgeschlagen = []
const ok = (satz, wert) => console.log('OK   ' + satz + (wert !== undefined ? ' (' + wert + ')' : ''))
const pruefe = (bedingung, satz, wert) => {
  if (bedingung) ok(satz, wert)
  else { console.log('FEHL ' + satz + (wert !== undefined ? ' (' + wert + ')' : '')); fehlgeschlagen.push(satz) }
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'h400-siegel-'))
const DATEN = path.join(TMP, 'daten'); fs.mkdirSync(DATEN)
const GEHEIM = path.join(TMP, 'geheim'); fs.mkdirSync(GEHEIM)
const PASSWORT = 'Probe-Probe-Probe-Probe-Probe-Probe'
const umgebung = { ...process.env, HALLE400_DATEN: DATEN, HALLE400_GEHEIM: GEHEIM }

const werkzeug = (args, opt = {}) =>
  execFileSync(process.execPath, [path.join(HIER, 'siegel.mjs'), ...args],
    { cwd: WURZEL, env: umgebung, encoding: 'utf8', stdio: 'pipe', ...opt })
// Ein Aufruf, der FEHLSCHLAGEN soll. Der Exit-Code ist die Messgroesse.
const werkzeugScheitert = (args) => {
  try { werkzeug(args); return { code: 0, text: '' } }
  catch (e) { return { code: e.status, text: String(e.stderr || '') } }
}
const bauen = (ziel, extra = []) =>
  execFileSync(process.execPath, [path.join(HIER, 'baue-planer-datei.mjs'), '--ziel', ziel, ...extra],
    { cwd: WURZEL, env: umgebung, encoding: 'utf8', stdio: 'pipe' })

const alsUrl = (p) => 'file:///' + p.replace(/\\/g, '/')

async function mitSeite(datei, tun) {
  const browser = await chromium.launch()
  const seite = await (await browser.newContext()).newPage()
  const fehler = []
  seite.on('pageerror', (e) => fehler.push('PAGE ' + e.message.split('\n')[0]))
  seite.on('console', (m) => { if (m.type() === 'error') fehler.push('CONSOLE ' + m.text().slice(0, 140)) })
  // Netz hart sperren: diese Datei darf NICHTS nachladen, und ein Siegel, das
  // nur mit Internet prueft, waere in genau dem Fall still, fuer den es da ist.
  await seite.route('**/*', (r) => (r.request().url().startsWith('file://') ? r.continue() : r.abort()))
  await seite.goto(alsUrl(datei))
  await seite.waitForFunction(
    () => document.querySelector('#siegelMarke') && !document.querySelector('#siegelMarke').classList.contains('pruefend'),
    { timeout: 20000 }).catch(() => {})
  try { await tun(seite, fehler) } finally { await browser.close() }
}

/* Das Wegwerf-Siegel entsteht IMMER, auch bei --nur ansicht: die spaeteren
   Teile bauen damit ihre Dateien. Ein `--nur`, das die Vorbereitung mit
   ueberspringt, meldet einen Abbruch, der nach einem Fehler im Geprueften
   aussieht und keiner ist. */
werkzeug(['erzeuge', '--inhaber', 'Probelauf', '--passwort', PASSWORT])
werkzeug(['signiere', '--passwort', PASSWORT])
const PROBE_VOLL = path.join(TMP, 'voll.html')
bauen(PROBE_VOLL)

/* ══ A · DIE RECHNUNG — ohne Browser, mit eigenem Wegwerf-Siegel ══ */
if (laeuft('rechnung')) {
  console.log('\n── A: Unterschrift und Schloss als reine Rechnung ──')
  pruefe(fs.existsSync(path.join(DATEN, 'siegel-oeffentlich.json')), 'A: der oeffentliche Schluessel entsteht')
  pruefe(fs.existsSync(path.join(GEHEIM, 'Halle400-SIEGEL-PRIVAT.json')), 'A: der private liegt AUSSERHALB des Repos', GEHEIM)
  pruefe(fs.existsSync(path.join(DATEN, 'schloss.json')), 'A: und das Schloss')
  const privatAkte = fs.readFileSync(path.join(GEHEIM, 'Halle400-SIEGEL-PRIVAT.json'), 'utf8')
  pruefe(!privatAkte.includes(PASSWORT), 'A: das Passwort steht NICHT in der privaten Akte')
  pruefe(!privatAkte.includes('"d"'), 'A: und der geheime Teil des Schluessels liegt dort verschlossen, nicht offen')
  const schlossAkte = fs.readFileSync(path.join(DATEN, 'schloss.json'), 'utf8')
  pruefe(!schlossAkte.includes(PASSWORT), 'A: auch im Schloss steht kein Passwort')

  werkzeug(['signiere', '--passwort', PASSWORT])
  pruefe(fs.existsSync(path.join(DATEN, 'siegel-halle400.json')), 'A: der Plan ist unterschrieben')

  const falsch = werkzeugScheitert(['signiere', '--passwort', 'Falsch-Falsch-Falsch-Falsch'])
  pruefe(falsch.code !== 0, 'A: GEGENPROBE — mit falschem Passwort wird NICHT unterschrieben', 'exit ' + falsch.code)
  const falschSchloss = werkzeugScheitert(['schloss', '--passwort', 'Falsch-Falsch-Falsch-Falsch'])
  pruefe(falschSchloss.code !== 0, 'A: GEGENPROBE — und kein Schloss gesetzt', 'exit ' + falschSchloss.code)

  // Passwort wechseln und zurueck: der Schluessel muss beides ueberleben.
  werkzeug(['passwort-aendern', '--alt', PASSWORT, '--neu', 'Zweites-Zweites-Zweites-Zweites'])
  const mitNeu = werkzeugScheitert(['signiere', '--passwort', 'Zweites-Zweites-Zweites-Zweites'])
  pruefe(mitNeu.code === 0, 'A: nach dem Wechsel unterschreibt das NEUE Passwort')
  const mitAlt = werkzeugScheitert(['signiere', '--passwort', PASSWORT])
  pruefe(mitAlt.code !== 0, 'A: GEGENPROBE — das alte tut es nicht mehr', 'exit ' + mitAlt.code)
  werkzeug(['passwort-aendern', '--alt', 'Zweites-Zweites-Zweites-Zweites', '--neu', PASSWORT])
  werkzeug(['signiere', '--passwort', PASSWORT])
}

/* ══ B · DIE AUSGELIEFERTE DATEI ══ */
if (laeuft('datei')) {
  console.log('\n── B: die ausgelieferte Datei traegt ein gueltiges Siegel ──')
  const echt = path.join(WURZEL, 'Halle400-Modell.html')
  if (!fs.existsSync(echt)) {
    pruefe(false, 'B: Halle400-Modell.html existiert', echt)
  } else {
    // Diese Pruefung laeuft gegen das ECHTE Siegel in data/ — deshalb OHNE die
    // umgelenkte Umgebung.
    let code = 0
    try { execFileSync(process.execPath, [path.join(HIER, 'siegel.mjs'), 'pruefe', echt], { cwd: WURZEL, stdio: 'pipe' }) }
    catch (e) { code = e.status }
    pruefe(code === 0, 'B: die ausgelieferte Datei ist ECHT und von dir unterschrieben', 'exit ' + code)

    /* GEGENPROBE mit einem einzigen veraenderten Zeichen. Genau so sieht die
       Boeswilligkeit aus, gegen die das Siegel steht: eine Wand um einen Meter
       versetzt, sonst alles wie gehabt. */
    const kopie = path.join(TMP, 'manipuliert.html')
    let inhalt = fs.readFileSync(echt, 'utf8')
    const stelle = inhalt.indexOf('PLAN_TEXT = "')
    const ersteZahl = inhalt.indexOf('\\"x\\":', stelle)
    inhalt = inhalt.slice(0, ersteZahl) + '\\"x\\":999' + inhalt.slice(inhalt.indexOf(',', ersteZahl))
    fs.writeFileSync(kopie, inhalt, 'utf8')
    let code2 = 0
    try { execFileSync(process.execPath, [path.join(HIER, 'siegel.mjs'), 'pruefe', kopie], { cwd: WURZEL, stdio: 'pipe' }) }
    catch (e) { code2 = e.status }
    pruefe(code2 === 1, 'B: GEGENPROBE — EIN veraenderter Wert und das Werkzeug sagt VERAENDERT', 'exit ' + code2)

    await mitSeite(echt, async (seite, fehler) => {
      const m = await seite.evaluate(() => ({
        art: document.querySelector('#siegelMarke').dataset.art,
        wort: document.querySelector('#siegelWort').textContent,
        sichtbar: document.querySelector("#siegelMarke").checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true }),
      }))
      pruefe(m.art === 'echt', 'B: und die DATEI SELBST sagt es beim Oeffnen', m.wort)
      pruefe(m.sichtbar, 'B: die Marke ist zu sehen')
      pruefe(fehler.length === 0, 'B: keine Konsolen- oder Seitenfehler', fehler.length)
    })

    await mitSeite(kopie, async (seite, fehler) => {
      const m = await seite.evaluate(() => ({
        art: document.querySelector('#siegelMarke').dataset.art,
        wort: document.querySelector('#siegelWort').textContent,
        meldung: (document.querySelector('#meldung') || {}).textContent,
        rot: document.querySelector('#siegelMarke').classList.contains('gebrochen'),
      }))
      pruefe(m.art === 'gebrochen', 'B: GEGENPROBE — die manipulierte Kopie sagt es AUCH', m.wort)
      pruefe(m.rot, 'B: und zwar sichtbar, nicht nur im Titel')
      pruefe(/nicht das Original/.test(m.meldung || ''), 'B: mit einer Meldung, die man nicht uebersieht',
        (m.meldung || '').slice(0, 60))
      // Der Ausdruck traegt es ebenfalls — dorthin wandert dieser Plan.
      const druck = await seite.evaluate(() => {
        window.dispatchEvent(new Event('beforeprint'))
        const d = document.querySelector('#siegelDruck')
        return { text: d.textContent, warnt: d.classList.contains('warnt') }
      })
      pruefe(/OHNE GÜLTIGES SIEGEL/.test(druck.text) && druck.warnt,
        'B: und das PAPIER sagt es auch', druck.text.slice(0, 50))
    })
  }
}

/* ══ C · DAS SCHLOSS ══ */
if (laeuft('schloss')) {
  console.log('\n── C: das Schloss vor der Werkstatt ──')
  await mitSeite(PROBE_VOLL, async (seite, fehler) => {
    const stand = () => seite.evaluate(() => ({
      bearbeitet: document.body.classList.contains('bearbeitet'),
      werkzeuge: document.querySelector('#werkzeuge').checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true }),
      frage: document.querySelector('#schlossFrage').checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true }),
      fuss: document.querySelector('#schlossFuss').textContent,
      symbol: document.querySelector('#btnBearbeiten .schloss').textContent,
    }))
    /* IN DEN GRUNDRISS, bevor irgendetwas ueber die Werkzeuge gesagt wird.
       Seit W7 wechselt „Bearbeiten" die Ansicht nicht mehr, und die
       Werkzeugleiste liegt IM Grundriss-Umschlag — im ruhenden Blatt ist sie
       `visibility:hidden` und damit zu Recht unsichtbar. Ohne diesen Griff
       misst die Pruefung „keine Werkzeuge" und meint „falsche Ansicht". */
    await seite.click('#btnAnsichtPlan')
    await seite.waitForTimeout(400)
    const s1 = await stand()
    pruefe(!s1.bearbeitet && !s1.werkzeuge, 'C: beim Oeffnen ist zu — keine Werkzeuge')
    pruefe(s1.symbol === '\u{1F512}', 'C: und der Knopf zeigt ein geschlossenes Schloss', s1.symbol)

    await seite.click('#btnBearbeiten')
    const s2 = await stand()
    pruefe(s2.frage && !s2.werkzeuge, 'C: ein Druck fragt nach dem Passwort, statt aufzuschliessen')

    await seite.fill('#schlossWort', 'garantiert-das-falsche-Wort')
    await seite.click('#btnSchlossJa')
    await seite.waitForFunction(() => document.querySelector('#schlossFrage').classList.contains('falsch'), { timeout: 20000 }).catch(() => {})
    const s3 = await stand()
    pruefe(!s3.bearbeitet && !s3.werkzeuge, 'C: GEGENPROBE — ein falsches Passwort schliesst NICHTS auf')
    pruefe(/passt nicht/.test(s3.fuss), 'C: und sagt es', s3.fuss)

    await seite.fill('#schlossWort', PASSWORT)
    await seite.press('#schlossWort', 'Enter')
    await seite.waitForFunction(() => document.body.classList.contains('bearbeitet'), { timeout: 25000 }).catch(() => {})
    const s4 = await stand()
    pruefe(s4.bearbeitet && s4.werkzeuge, 'C: das richtige schliesst auf')
    pruefe(s4.symbol === '\u{1F513}', 'C: und der Knopf zeigt es offen', s4.symbol)
    const imFeld = await seite.inputValue('#schlossWort')
    pruefe(imFeld === '', 'C: das Passwort bleibt nicht im Feld stehen')

    await seite.click('#btnBearbeiten')
    const s5 = await stand()
    pruefe(!s5.bearbeitet && s5.symbol === '\u{1F512}', 'C: Abschliessen geht ohne Rueckfrage')

    await seite.reload()
    await seite.waitForFunction(() => window.__bereit === true, { timeout: 20000 }).catch(() => {})
    await seite.click('#btnAnsichtPlan')
    await seite.waitForTimeout(400)
    const s6 = await stand()
    pruefe(!s6.bearbeitet && !s6.werkzeuge, 'C: nach dem Neuladen ist wieder zu — der Zustand wird nicht vererbt')
    pruefe(fehler.length === 0, 'C: keine Konsolen- oder Seitenfehler', fehler.length)
  })
}

/* ══ D · DIE REINE ANSICHT ══ */
if (laeuft('ansicht')) {
  console.log('\n── D: die Fassung fuer die Bank — die Werkzeuge sind nicht da ──')
  const ansicht = path.join(TMP, 'bank.html')
  bauen(ansicht, ['--nur-ansicht'])
  const roh = fs.readFileSync(ansicht, 'utf8')
  const WERKSTATT = ['palette', 'werkzeuge', 'zurueckFrage', 'schlossFrage', 'rueckfrage',
    'grpBearbeiten', 'standleiste', 'ortFrage', 'ladeFrage', 'dateiWahl',
    'btnExport', 'btnImport', 'btnZurueck', 'wzWand', 'wzDraw', 'wzDelete', 'btnBearbeiten']
  const nochDa = WERKSTATT.filter((id) => roh.includes('id="' + id + '"'))
  pruefe(nochDa.length === 0, 'D: kein einziges Bedienelement der Werkstatt steht in der Datei',
    nochDa.length ? nochDa.join(',') : WERKSTATT.length + ' geprueft')

  // GEGENPROBE: dieselbe Liste MUSS in der vollen Fassung vorkommen — sonst
  // misst die Pruefung oben nur, dass sie die Namen falsch geschrieben hat.
  const vollRoh = fs.readFileSync(PROBE_VOLL, 'utf8')
  const inVoll = WERKSTATT.filter((id) => vollRoh.includes('id="' + id + '"'))
  pruefe(inVoll.length === WERKSTATT.length,
    'D: GEGENPROBE — in der vollen Fassung sind genau dieselben Kennungen sehr wohl da',
    inVoll.length + '/' + WERKSTATT.length)
  pruefe(!/const SCHLOSS = \{/.test(roh), 'D: und die Ansicht traegt kein Schloss-Paket — es gibt nichts aufzuschliessen')

  await mitSeite(ansicht, async (seite, fehler) => {
    const z = await seite.evaluate(() => ({
      bereit: window.__bereit === true,
      siegel: document.querySelector('#siegelMarke').dataset.art,
      knoepfe: document.querySelectorAll('button').length,
      bearbeitbar: document.body.classList.contains('bearbeitet'),
      // Die tragende K3-Zeile: nimmt die Zeichenflaeche ueberhaupt Zeiger an?
      scharf: getComputedStyle(document.querySelector('#plan canvas')).pointerEvents,
    }))
    pruefe(z.bereit, 'D: die Datei laeuft durch')
    pruefe(fehler.length === 0, 'D: ohne einen einzigen Fehler', fehler.length ? fehler.join(' | ') : 0)
    pruefe(z.siegel === 'echt', 'D: das Siegel ist auch hier geprueft', z.siegel)
    pruefe(!z.bearbeitbar && z.scharf === 'none', 'D: die Zeichenflaeche nimmt keine Zeiger an (K3)', z.scharf)

    /* ANSEHEN muss vollstaendig gehen — eine Ansicht, die nichts kann, ist
       keine. Gemessen wird am MESSZUGANG und am Bild, nicht am Klick: dass ein
       Knopf sich druecken laesst, sagt nichts darueber, ob danach etwas
       anderes dasteht. */
    await seite.click('#btnAnsichtPlan')
    await seite.waitForTimeout(500)
    const p = await seite.evaluate(() => ({
      ansicht: window.__planerDatei.ansicht(),
      grundriss: document.querySelector('#plan').checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true }),
      blatt: document.querySelector('#blatt').checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true }),
      ecken: window.__planerDatei.zahlen().ecken,
    }))
    pruefe(p.ansicht === 'plan' && p.grundriss && !p.blatt && p.ecken > 70,
      'D: der Grundriss laesst sich ansehen', JSON.stringify(p))

    await seite.click('#btnAnsichtAxo')
    await seite.waitForTimeout(700)
    const a = await seite.evaluate(() => ({
      blatt: document.querySelector('#blatt').checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true }),
      bild: window.__planerDatei.bildBlatt(),
      blick: window.__planerDatei.axoBlick(),
    }))
    pruefe(a.blatt && a.bild && a.bild.tinte > 100, 'D: und das Planblatt ist wirklich gezeichnet',
      a.bild ? a.bild.tinte + ' Bildpunkte Tinte' : 'kein Bild')

    // Der Blickwechsel: gemessen an der KAMERA und am veraenderten Bild, mit
    // Gegenprobe (derselbe Blick noch einmal darf NICHTS aendern).
    await seite.click('[data-blick="1"]')
    await seite.waitForTimeout(700)
    const b1 = await seite.evaluate(() => ({ blick: window.__planerDatei.axoBlick(), bild: window.__planerDatei.bildBlatt() }))
    pruefe(JSON.stringify(b1.blick) !== JSON.stringify(a.blick) && b1.bild.summe !== a.bild.summe,
      'D: der Blick laesst sich wechseln und das Bild folgt', JSON.stringify(b1.blick))
    await seite.click('[data-blick="1"]')
    await seite.waitForTimeout(500)
    const b2 = await seite.evaluate(() => window.__planerDatei.bildBlatt())
    pruefe(b2.summe === b1.bild.summe, 'D: GEGENPROBE — derselbe Blick noch einmal aendert nichts')

    // Die Lese-Navigation im Grundriss: zoomen muss gehen, ohne dass
    // „Bearbeiten" je an war. Gemessen am Massstab, nicht am Ereignis.
    await seite.click('#btnAnsichtPlan')
    await seite.waitForTimeout(400)
    const zoom = await seite.evaluate(() => {
      const vor = window.__planerDatei.proCm()
      const c = document.querySelector('#plan canvas')
      const k = c.getBoundingClientRect()
      c.dispatchEvent(new WheelEvent('wheel', { deltaY: -240, bubbles: true, cancelable: true,
        clientX: k.left + k.width / 2, clientY: k.top + k.height / 2 }))
      return { vor, nach: window.__planerDatei.proCm() }
    })
    pruefe(zoom.nach > zoom.vor, 'D: die Lese-Navigation zoomt auch ohne Bearbeiten',
      zoom.vor.toFixed(4) + ' -> ' + zoom.nach.toFixed(4))
  })
}

fs.rmSync(TMP, { recursive: true, force: true })
console.log('')
if (fehlgeschlagen.length) {
  console.log(`DURCHGEFALLEN — ${fehlgeschlagen.length} Pruefung(en):`)
  for (const f of fehlgeschlagen) console.log('  · ' + f)
  process.exit(1)
}
console.log('BESTANDEN — alle Pruefungen gruen.')
