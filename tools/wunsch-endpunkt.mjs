/**
 * DER ENDPUNKT DES STIFTS (W17) — `POST /wunsch`
 * ==============================================
 *
 * Nimmt einen umfahrenen Bereich und einen getippten Wunsch entgegen, fragt
 * `claude -p` und gibt eine GEPRUEFTE Werkzeug-Kette zurueck. Ungeprueftes
 * verlaesst diese Datei nicht.
 *
 * WARUM DER ENDPUNKT HIER SITZT UND NICHT IM BROWSER
 * --------------------------------------------------
 * Die Doppelklick-Datei laeuft bei der Bank unter `file://` — ohne Netz, und
 * `pruefe-planer-datei.mjs` sperrt jeden Zugriff nach draussen ausdruecklich.
 * Das bleibt so: der Stift ist dort GAR NICHT VORHANDEN, nicht nur
 * abgeschaltet. Ueber den Server (`serve-datei.mjs`) erscheint er. Damit
 * bleibt die Auslieferungsdatei genau das, was sie sein soll — eine Datei,
 * die man doppelklickt.
 *
 * DIE DREI RIEGEL DES AUFRUFS
 * ---------------------------
 * 1. `--bare` ist PFLICHT: ohne ihn erbt der Unterprozess die Umgebung der
 *    laufenden Sitzung (`CLAUDECODE`) und kann Hooks derselben Sitzung erneut
 *    ausloesen — eine Schleife, die niemand bestellt hat.
 * 2. `--max-budget-usd` und `--max-turns` sind harte Deckel. Ein Aufruf ohne
 *    Deckel kann entgleisen, und der Nutzer merkt es an der Rechnung.
 * 3. `--disallowedTools` sperrt Werkzeuge, die hier nichts zu suchen haben.
 *    Das Modell soll EINE Antwort geben, nicht in Dateien schreiben.
 *
 * UND DER WICHTIGSTE: die Antwort geht durch `pruefeKette`, BEVOR sie den
 * Browser erreicht. Ein Modell, das halluziniert, kommt hier nicht vorbei.
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const HIER = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const WURZEL = path.resolve(HIER, '..')

const { pruefeKette, WZ_TYPEN, WZ_NUTZUNGEN, WZ_OEFFNUNGEN, WZ_GRENZEN, wzText } = await import(
  pathToFileURL(path.join(WURZEL, 'src/raum/wunsch-werkzeuge.js')).href
)

/** Deckel. Ueberschreibbar, aber nie unbegrenzt. */
export const WUNSCH_DECKEL = {
  budgetUsd: Number(process.env.HALLE400_BUDGET_USD || '0.20'),
  // GEMESSEN: die strukturierte Antwort laeuft selbst ueber einen Werkzeug-
  // Aufruf, der Lauf braucht also mindestens zwei Zuege (`num_turns: 2`,
  // `stop_reason: tool_use`). Mit `--max-turns 1` bricht er wortlos mit Exit 1
  // ab — es gibt keine Fehlermeldung, nur nichts. Vier laesst Luft fuer einen
  // Nachfass und ist immer noch ein harter Deckel.
  turns: 4,
  zeitMs: Number(process.env.HALLE400_ZEIT_MS || '90000'),
  bodyBytes: 256 * 1024,
  modell: process.env.HALLE400_MODELL || 'claude-haiku-4-5-20251001'
}

/**
 * Das Schema, das die Antwort erfuellen MUSS. `--json-schema` laesst die CLI
 * validieren; was hier nicht hineinpasst, kommt gar nicht erst zurueck.
 *
 * Es gibt bewusst KEIN Feld fuer eine Norm oder Quelle. Ein Modell, das ein
 * solches Feld haette, wuerde es fuellen — und eine erfundene DIN-Nummer sieht
 * belegt aus. Es gibt stattdessen `annahme` in Alltagssprache.
 */
export const WUNSCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['annahme', 'werkzeuge'],
  properties: {
    annahme: {
      type: 'string',
      maxLength: WZ_GRENZEN.TEXT_MAX,
      description:
        'Ein Satz in Alltagssprache, der jede geschaetzte Stueckzahl offenlegt. ' +
        'Beispiel: "Fuer 20 Personen 2 WC und 2 Waschbecken angenommen." ' +
        'NIEMALS eine Norm, DIN- oder ASR-Nummer nennen.'
    },
    antwort: {
      type: 'string',
      maxLength: WZ_GRENZEN.TEXT_MAX,
      description: 'Nur ausfuellen, wenn der Wunsch NICHT umsetzbar ist — dann der Grund.'
    },
    werkzeuge: {
      type: 'array',
      maxItems: WZ_GRENZEN.KETTE_MAX,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['werkzeug', 'args'],
        properties: {
          werkzeug: {
            type: 'string',
            enum: ['raum_auslegen', 'stueck_setzen', 'wand_zeichnen', 'oeffnung_setzen', 'stueck_entfernen']
          },
          args: { type: 'object' }
        }
      }
    }
  }
}

/** Der Auftrag an das Modell. Kurz, konkret, mit den Grenzen zuerst. */
export function baueAuftrag(wunsch, welt) {
  const ring = (welt.ring || []).map((p) => `${Math.round(p.x)}/${Math.round(p.y)}`).join(' · ')
  const kasten = welt.kasten
    ? `Er misst etwa ${Math.round(welt.kasten.breite)} × ${Math.round(welt.kasten.tiefe)} cm.`
    : ''
  const drin = (welt.moebel || []).length
  const gemessen = (welt.gemesseneEcken || []).length

  return [
    'Du planst einen Ausschnitt eines Grundrisses. Alle Masse sind ZENTIMETER.',
    '',
    `WUNSCH DES NUTZERS: "${wzText(wunsch)}"`,
    '',
    `DER BEREICH, den er umfahren hat (Eckpunkte x/y): ${ring}`,
    kasten,
    `Darin stehen zurzeit ${drin} Ausstattungsstuecke.`,
    gemessen ? `In der Naehe liegen ${gemessen} GEMESSENE Ecken.` : '',
    '',
    'DIE WERKZEUGE UND IHRE PFLICHTANGABEN — andere Felder gibt es nicht:',
    '',
    '  stueck_setzen   { "typ": <Art>, "x": <Zahl>, "y": <Zahl>, "drehung"?: <Grad> }',
    '      Stellt EIN Stueck an eine Stelle. Das ist das Werkzeug fuer alles,',
    '      was einzeln steht — auch fuer ein Badezimmer (wc, waschbecken).',
    '',
    `  raum_auslegen   { "nutzung": <${WZ_NUTZUNGEN.join('|')}>, "anzahl"?: <Zahl> }`,
    '      Fuellt den GANZEN Bereich mit einem Belegungs-Muster im Raster.',
    '      NUR fuer diese fuenf Muster. Passt keines, nimm stueck_setzen.',
    '',
    '  wand_zeichnen   { "x1": <Zahl>, "y1": <Zahl>, "x2": <Zahl>, "y2": <Zahl> }',
    `  oeffnung_setzen { "wandId": <Kennung>, "art": <${WZ_OEFFNUNGEN.join('|')}>, `,
    '                    "breite": <Zahl>, "lage": <Zahl> }',
    '  stueck_entfernen{ "id": <Kennung> }',
    '',
    'REGELN, die du nicht brechen darfst:',
    `1. Es gibt genau diese Arten: ${WZ_TYPEN.join(', ')}.`,
    '   Es gibt KEINE Dusche, kein Urinal, keine Kabinenwand als Art.',
    '   Fehlt dir eine Art, sag es in "antwort" — ERSETZE sie NICHT durch eine aehnliche.',
    '2. JEDES Werkzeug braucht ALLE seine Pflichtangaben. Eine fehlende Angabe',
    '   verwirft die ganze Kette.',
    '3. Jede Koordinate MUSS innerhalb des Bereichs liegen.',
    '4. Zeichne keine Wand, die naeher als 20 cm an einer gemessenen Ecke endet.',
    '5. Nenne NIEMALS eine Norm, DIN- oder ASR-Nummer. Schreibe deine Schaetzung',
    '   stattdessen als Satz in "annahme".',
    '6. Stelle die Stuecke mit Abstand zueinander auf, nicht uebereinander.',
    '',
    'BEISPIEL fuer den Aufbau (nicht abschreiben, nur die FORM):',
    '{"annahme":"Fuer 12 Personen 2 WC und 2 Waschbecken angenommen.",',
    ' "werkzeuge":[{"werkzeug":"stueck_setzen","args":{"typ":"wc","x":80,"y":80}},',
    '              {"werkzeug":"stueck_setzen","args":{"typ":"waschbecken","x":220,"y":80}}]}',
    '',
    'Antworte NUR mit dem geforderten JSON.'
  ]
    .filter(Boolean)
    .join('\n')
}

/** Ruft `claude -p` und gibt den Rohtext der Antwort zurueck. */
function frageModell(auftrag) {
  return new Promise((fertig) => {
    // DER AUFTRAG GEHT UEBER STDIN, nicht als Argument. Gemessen:
    // `--disallowedTools` nimmt MEHRERE Werte (`<tools...>`) und verschluckt
    // jedes folgende Argument — der Prompt landete als weiterer Werkzeugname
    // in der Liste, und claude meldete "Input must be provided". Ueber stdin
    // gibt es dieses Problem strukturell nicht, und die Laenge des Auftrags
    // stoesst nirgends an eine Kommandozeilen-Grenze.
    const args = [
      '-p',
      '--bare',
      '--output-format', 'json',
      '--json-schema', JSON.stringify(WUNSCH_SCHEMA),
      '--model', WUNSCH_DECKEL.modell,
      '--max-turns', String(WUNSCH_DECKEL.turns),
      '--max-budget-usd', String(WUNSCH_DECKEL.budgetUsd),
      '--disallowedTools', 'Edit', 'Write', 'Bash', 'WebFetch', 'WebSearch'
    ]
    const kind = spawn('claude', args, {
      cwd: WURZEL,
      // Die Umgebung wird BEWUSST gereinigt: CLAUDECODE vererbt sich sonst in
      // den Unterprozess und kann Hooks derselben Sitzung erneut ausloesen.
      env: { ...process.env, CLAUDECODE: '', CLAUDE_CODE_SESSION_ID: '' },
      windowsHide: true
    })
    let aus = ''
    let err = ''
    const uhr = setTimeout(() => {
      kind.kill()
      fertig({ ok: false, grund: `Es kam keine Antwort in ${Math.round(WUNSCH_DECKEL.zeitMs / 1000)} Sekunden.` })
    }, WUNSCH_DECKEL.zeitMs)

    kind.stdout.on('data', (d) => (aus += d))
    kind.stderr.on('data', (d) => (err += d))
    kind.on('error', (e) => {
      clearTimeout(uhr)
      fertig({ ok: false, grund: `claude liess sich nicht starten: ${e.message}` })
    })
    kind.on('close', (code) => {
      clearTimeout(uhr)
      if (code !== 0) {
        return fertig({ ok: false, grund: `claude endete mit ${code}. ${err.slice(0, 200)}` })
      }
      fertig({ ok: true, roh: aus })
    })
    kind.stdin.write(auftrag)
    kind.stdin.end()
  })
}

/** Holt die eigentliche Antwort aus der Huelle, die `--output-format json` baut. */
export function schaeleAntwort(roh) {
  let huelle
  try {
    huelle = JSON.parse(roh)
  } catch (_) {
    return null
  }
  if (huelle && huelle.is_error) return null
  // Bevorzugt das validierte Feld; sonst der Text, der dann selbst JSON sein muss.
  if (huelle && typeof huelle.structured_output === 'object' && huelle.structured_output) {
    return huelle.structured_output
  }
  const text = huelle && typeof huelle.result === 'string' ? huelle.result : ''
  // Manche Antworten kommen in Markdown-Zaeunen. Der Zaun wird entfernt, der
  // Inhalt NICHT repariert — wer kein JSON liefert, bekommt eine Absage.
  const ohneZaun = text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')
  try {
    return JSON.parse(ohneZaun)
  } catch (_) {
    return null
  }
}

/**
 * Der ganze Weg: fragen, schaelen, PRUEFEN. Gibt immer eine Antwort in
 * Alltagssprache zurueck — auch im Fehlerfall.
 */
export async function bearbeiteWunsch(körper) {
  const wunsch = wzText(körper && körper.wunsch)
  if (!wunsch) return { gueltig: false, grund: 'Es wurde kein Wunsch geschrieben.' }

  const welt = (körper && körper.welt) || {}
  if (!Array.isArray(welt.ring) || welt.ring.length < 3) {
    return { gueltig: false, grund: 'Es wurde kein Bereich umfahren.' }
  }

  const antwort = await frageModell(baueAuftrag(wunsch, welt))
  if (!antwort.ok) return { gueltig: false, grund: antwort.grund }

  const kette = schaeleAntwort(antwort.roh)
  if (!kette) return { gueltig: false, grund: 'Die Antwort war nicht lesbar.' }

  // DIE SCHLEUSE. Ab hier gilt nur noch, was `pruefeKette` durchlaesst.
  const geprueft = pruefeKette(kette, welt)
  return { ...geprueft, wunsch }
}

/**
 * Haengt den Endpunkt in einen node-http-Server.
 * Gibt `true` zurueck, wenn die Anfrage hier behandelt wurde.
 */
export function behandleWunschAnfrage(req, res) {
  const pfad = String(req.url || '').split('?')[0]
  if (pfad !== '/wunsch') return false

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8', Allow: 'POST' })
    res.end(JSON.stringify({ gueltig: false, grund: 'Hier wird nur POST angenommen.' }))
    return true
  }

  let roh = ''
  let zuGross = false
  req.on('data', (d) => {
    if (zuGross) return
    roh += d
    if (roh.length > WUNSCH_DECKEL.bodyBytes) {
      zuGross = true
      res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ gueltig: false, grund: 'Die Anfrage ist zu gross.' }))
      req.destroy()
    }
  })
  req.on('end', async () => {
    if (zuGross) return
    let körper = null
    try {
      körper = JSON.parse(roh)
    } catch (_) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' })
      return res.end(JSON.stringify({ gueltig: false, grund: 'Die Anfrage war nicht lesbar.' }))
    }
    let ergebnis
    try {
      ergebnis = await bearbeiteWunsch(körper)
    } catch (e) {
      ergebnis = { gueltig: false, grund: `Unerwarteter Fehler: ${e.message}` }
    }
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    })
    res.end(JSON.stringify(ergebnis))
  })
  return true
}
