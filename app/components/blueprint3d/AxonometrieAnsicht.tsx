'use client'

/**
 * AXONOMETRIE ALS DRITTE ANSICHT (X3)
 * ===================================
 *
 * Haengt den Renderer aus `src/axo/` neben den 2D-Zeichner und die 3D-Ansicht.
 *
 * WAS HIER BEARBEITET WIRD — UND WAS NICHT (W7)
 * Bis W6 stand hier: „in dieser Ansicht wird nicht bearbeitet". Ueber die
 * PROJEKTION war das nie falsch — ein Klick trifft keinen Punkt, sondern einen
 * Sehstrahl. Ueber den UMFANG war es zu weit: fuer einen Koerper mit bekannter
 * Ober- und Unterkante ist dieser Strahl eine ENDLICHE Strecke, und jedes
 * Ausstattungs-Stueck kennt sein `y0`/`y1`. Es wird also nichts geraten.
 *
 * MOEBEL lassen sich hier darum ziehen (Q/E drehen, Entf loescht). WAENDE und
 * OEFFNUNGEN nicht, und das bleibt so: der Klick auf eine Wandkrone landet
 * 1,63 m neben ihrem Fusspunkt, eine verschobene gemessene Ecke braeche den
 * Rueckweg ins Projekt (W5) hart ab, und Anschlag wie Aufschlagseite einer Tuer
 * sind in diesem Bild unsichtbar. Ein frei gesetzter Punkt in der Luft hat
 * keine bekannte Hoehe — dort gilt der alte Satz woertlich weiter.
 *
 * Die Ansicht bleibt im Uebrigen ein FENSTER: sie zeigt jede Aenderung aus dem
 * 2D-Zeichner sofort, weil sie ihre Szene bei jedem `updated_rooms` neu aus dem
 * lebenden Modell baut — nicht aus der Plan-Datei.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Configuration, configWallThickness } from '@blueprint3d/core/configuration'
import { ausstattungsKoerper, baueSzene } from '@blueprint3d/axo/axo-szene.js'
import { erzeugeAxonometrie } from '@blueprint3d/axo/axo-zeichnen.js'
import { BLICKE, SAEULEN } from '@blueprint3d/axo/axo-kontrakt.js'
import { OBERKANTE_CM, KOERPER_CM } from '@blueprint3d/three/ausstattung'

type NamenModus = 'alle' | 'saeulen' | 'aus'

interface Props {
  /** Die lebende blueprint3d-Instanz. */
  blueprint3d: any
  /** Namens-Anker aus der Plan-Datei (`labels[]`). */
  labels: any[]
  /** Nur zeichnen, wenn die Ansicht wirklich sichtbar ist. */
  aktiv: boolean
}

const TAFEL_BREITE = 270

export function AxonometrieAnsicht({ blueprint3d, labels, aktiv }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const axoRef = useRef<any>(null)
  /**
   * ZU WELCHEM Canvas der Renderer gehört (W7).
   *
   * GEMESSEN und nicht vorausgesehen: `if (!aktiv) return null` nimmt nur das
   * Markup weg, die Komponente selbst bleibt stehen — `axoRef` überlebt einen
   * Ansichtswechsel also, das Canvas-Element aber NICHT. Ohne diesen Vergleich
   * malte der zurückgekehrte Renderer weiter in ein Canvas, das kein Dokument
   * mehr hat: das Blatt blieb leer, und `pruefe-ziehen.mjs` Gate g sah zwei
   * verschiedene Prüfsummen für zweimal dasselbe Nichtstun.
   */
  const axoCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const [blickIndex, setBlickIndex] = useState(0)
  const [namen, setNamen] = useState<NamenModus>('alle')
  const [tafelOffen, setTafelOffen] = useState(true)
  const [vollausbau, setVollausbau] = useState(false)
  const [verortet, setVerortet] = useState<Record<number, string>>({})
  /**
   * „Zu flach zum Ziehen" — EHRLICH SAGEN statt still verweigern (W7).
   *
   * Unter einer Neigung von 0,35 bedeutet 1 Bildpunkt ueber 22 cm Tiefe; ein
   * Zittern der Hand legte das Stueck einen halben Meter weiter hinten ab, ohne
   * dass man es im Bild saehe. Dort wird nur gedreht — und der Nutzer erfaehrt,
   * warum.
   */
  const [zuFlach, setZuFlach] = useState(false)

  /** Szene aus dem LEBENDEN Modell bauen — nicht aus der Plan-Datei. */
  const baue = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !blueprint3d?.model?.floorplan) return
    const gespeichert = blueprint3d.model.floorplan.saveFloorplan()
    const dicke = Configuration.getNumericValue(configWallThickness)
    const szene = baueSzene(
      { floorplan: gespeichert, labels },
      // Hoehen aus der Tabelle des Projekts — dieselbe, aus der die
      // 3D-Ansicht ihre Koerper baut.
      { wandDicke: dicke, nurKernSaeulen: !vollausbau, hoehen: { oberkante: OBERKANTE_CM, koerper: KOERPER_CM } }
    )

    const belegt: Record<number, string> = {}
    for (const m of szene.marken) if (m.hervor && m.saeule != null) belegt[m.saeule] = m.text
    setVerortet(belegt)

    const dunkel =
      document.documentElement.classList.contains('dark') ||
      (!document.documentElement.classList.contains('light') &&
        globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches)

    // W7 — DENSELBEN Renderer weiterbenutzen, solange er zu DIESEM Canvas
    // gehört. Blick, Zoom und Verschiebung des Nutzers bleiben damit über eine
    // Änderung des Grundrisses hinweg stehen; vorher entstand bei jeder
    // Änderung ein zweiter Renderer auf demselben Canvas, dessen Zeiger-Abos
    // sich zu denen des ersten stapelten (B3).
    if (axoRef.current && axoCanvasRef.current === canvas) {
      axoRef.current.setzeSzene(szene)
      axoRef.current.setzeNamen(namen)
      axoRef.current.setzeDunkel(!!dunkel)
      axoRef.current.setzeRandRechts(tafelOffen ? TAFEL_BREITE + 24 : 0)
      return
    }
    // Anderes Canvas: der alte Renderer nimmt seine Abos mit, statt sie an
    // einem verwaisten Element liegen zu lassen.
    axoRef.current?.zerstoere?.()
    axoRef.current = erzeugeAxonometrie(canvas, szene, {
      namen,
      dunkel: !!dunkel,
      randRechts: tafelOffen ? TAFEL_BREITE + 24 : 0,
      /**
       * BEARBEITEN IM BLATT (W7) — ueber DENSELBEN Kern, der auch den
       * 2D-Zeichner bedient. Der Renderer meldet nur, WO im Weltmass gegriffen
       * wird; was daraus wird, entscheidet der Floorplanner mit seiner einen
       * Einrast-Rechnung. Zwei Zieh-Fassungen waeren zwei Ergebnisse fuer
       * dieselbe Bewegung.
       *
       * Anders als in der Doppelklick-Datei gibt es hier keinen
       * „Bearbeiten"-Schalter: der Planer IST der Editor, seine Ansichten sind
       * nur Ansichten desselben Modells. `aktiv` ist deshalb schlicht wahr.
       */
      bearbeitung: {
        aktiv: () => true,
        greife: (id: string, wx: number, wy: number) =>
          !!blueprint3d?.floorplanner?.zugBeginnen(id, wx, wy),
        ziehe: (wx: number, wy: number) => {
          const fpl = blueprint3d?.floorplanner
          if (!fpl?.zugSchritt(wx, wy)) return null
          const stueck = blueprint3d.model.floorplan.findeAusstattung(fpl.zugLaeuft())
          // NUR dieser eine Koerper, aus DERSELBEN Funktion, aus der
          // `baueSzene` ihn baut: ein voller Neubau kostet gemessen ueber
          // 16 ms je Zeigerbewegung.
          return stueck
            ? ausstattungsKoerper(stueck, { oberkante: OBERKANTE_CM, koerper: KOERPER_CM })[0] || null
            : null
        },
        lassLos: () => {
          const fpl = blueprint3d?.floorplanner
          const lief = fpl?.zugLaeuft()
          fpl?.zugBeenden()
          // Erst beim Loslassen der volle Neubau — und ueber `update()`, damit
          // auch alles andere (3D, Zaehler) den Zug mitbekommt.
          if (lief) blueprint3d.model.floorplan.update()
        },
        zuFlach: () => setZuFlach(true)
      }
    })
    axoCanvasRef.current = canvas
    axoRef.current.passeAn()
  }, [blueprint3d, labels, namen, tafelOffen, vollausbau])

  // Neu bauen, sobald die Ansicht sichtbar wird oder sich der Grundriss aendert.
  useEffect(() => {
    if (!aktiv) return
    baue()
    const fp = blueprint3d?.model?.floorplan
    if (!fp?.fireOnUpdatedRooms) return
    // Der Zeichner meldet jede Aenderung ueber dieses Ereignis; die Ansicht
    // haengt sich daran, statt in einem Zeitgeber nachzusehen.
    fp.fireOnUpdatedRooms(baue)
    // ... und meldet sich wieder ab. Ohne diese Zeile stapelten sich die
    // Rueckrufe bei jedem Neubau (B3): jeder Klick auf „Legende" oder „Namen"
    // erzeugte ein neues `baue` und liess das alte haengen.
    return () => fp.entferneUpdatedRooms?.(baue)
  }, [aktiv, baue, blueprint3d])

  // Der Renderer gehoert zu DIESER Ansicht. Verlaesst sie das Dokument, muss
  // er seine Abos mitnehmen — sonst haengen sie am Canvas, das gleich
  // verschwindet, und der naechste Aufbau setzt einen zweiten daneben.
  useEffect(() => {
    return () => {
      axoRef.current?.zerstoere?.()
      axoRef.current = null
      axoCanvasRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!aktiv) return
    const beiGroesse = () => axoRef.current?.passeAn()
    globalThis.addEventListener('resize', beiGroesse)
    return () => globalThis.removeEventListener('resize', beiGroesse)
  }, [aktiv])

  /**
   * Q, E und Entf wirken auf das Stueck UNTER DEM ZEIGER (W7) — dieselbe Regel
   * wie im 2D-Zeichner, wo es ebenfalls keine Auswahl gibt, die einen Klick
   * ueberdauert.
   *
   * IN DER FANG-PHASE mit `stopPropagation`: der Floorplanner hoert Q und E
   * selbst am Dokument ab und wirkt dabei auf `activeAusstattung` — das ist der
   * letzte Treffer im 2D-ZEICHNER und bleibt liegen, wenn der Zeiger dessen
   * Flaeche verlaesst. Ohne diesen Riegel drehte ein Q hier ein Stueck, das man
   * gar nicht sieht.
   */
  useEffect(() => {
    if (!aktiv) return
    const beiTaste = (e: KeyboardEvent) => {
      const ziel = e.target as HTMLElement | null
      if (ziel && (ziel.tagName === 'INPUT' || ziel.tagName === 'TEXTAREA' || ziel.isContentEditable)) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const taste = (e.key || '').toLowerCase()
      if (taste !== 'q' && taste !== 'e' && taste !== 'delete') return
      e.stopPropagation()
      const id = axoRef.current?.unterZeiger
      if (!id) return
      e.preventDefault()
      const fpl = blueprint3d?.floorplanner
      if (taste === 'delete') {
        fpl?.loeschStueckVorschlagen(id)
        return
      }
      if (fpl?.dreheStueck(id, taste === 'q' ? -1 : 1)) {
        const stueck = blueprint3d.model.floorplan.findeAusstattung(id)
        if (stueck) {
          axoRef.current.tauscheKoerper(
            id,
            ausstattungsKoerper(stueck, { oberkante: OBERKANTE_CM, koerper: KOERPER_CM })[0]
          )
        }
      }
    }
    document.addEventListener('keydown', beiTaste, true)
    return () => document.removeEventListener('keydown', beiTaste, true)
  }, [aktiv, blueprint3d])

  // Die Auskunft „zu flach" verschwindet von selbst — sie gehoert zu EINEM
  // Griff, nicht zum Zustand des Blattes.
  useEffect(() => {
    if (!zuFlach) return
    const uhr = setTimeout(() => setZuFlach(false), 5000)
    return () => clearTimeout(uhr)
  }, [zuFlach])

  if (!aktiv) return null

  const blick = BLICKE[blickIndex]

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: 'var(--axo-papier, #F2ECDE)' }}>
      {/* Der Grund-Zeiger steht in der Stilvorlage, NICHT als Inline-Stil: der
          Renderer setzt „move" ueber einem greifbaren Moebel inline (W7), und
          ein Inline-Stil aus React ueberschriebe ihn beim naechsten
          Neuzeichnen wieder. */}
      <canvas ref={canvasRef} className="axo-flaeche block h-full w-full touch-none" />

      {/* Blattkopf. Beginnt unterhalb der Navigationsleiste des Planers (h-12
          mobil, h-14 breit) — in der Vorlage sass er ganz oben, dort steht hier
          aber die Werkzeugleiste. */}
      <header className="pointer-events-none absolute left-0 top-12 max-w-[min(46ch,72vw)] px-5 pt-3 md:top-14 md:px-6 md:pt-4">
        <h1
          className="m-0 text-[19px] font-semibold leading-tight md:text-[27px]"
          style={{ fontFamily: 'Iowan Old Style, Palatino Linotype, Palatino, Georgia, serif', color: '#1E2A25' }}
        >
          Halle&nbsp;400 · Büro
        </h1>
        <div className="my-2 h-px max-w-[270px]" style={{ background: '#BAB09C' }} />
        <div
          className="text-[9px] uppercase leading-relaxed tracking-[0.13em] md:text-[10.5px]"
          style={{ fontFamily: 'Roboto Mono, Cascadia Mono, Consolas, monospace', color: '#6B7570' }}
        >
          Axonometrie · aus dem gemessenen Grundriss
          <br />
          {Object.keys(verortet).length} von 9 Säulen verortet
        </div>
      </header>

      {/* Säulen-Tafel */}
      {tafelOffen && (
        <aside
          className="absolute right-3 top-14 z-10 flex max-h-[calc(100%-12rem)] flex-col border md:top-16"
          style={{ width: TAFEL_BREITE, background: 'rgba(242,236,222,.92)', borderColor: '#C9C0AA' }}
        >
          <div
            className="flex items-baseline justify-between gap-2 border-b px-3.5 py-3"
            style={{ borderColor: '#C9C0AA' }}
          >
            <b
              className="text-[10px] font-medium uppercase tracking-[0.15em]"
              style={{ fontFamily: 'Roboto Mono, monospace', color: '#46514A' }}
            >
              Die neun Säulen
            </b>
            <span className="text-[10px] tabular-nums" style={{ fontFamily: 'Roboto Mono, monospace', color: '#6B7570' }}>
              {Object.keys(verortet).length}/9 verortet
            </span>
          </div>
          <div className="overflow-y-auto py-1">
            {SAEULEN.map((s: any, i: number) => {
              const raum = verortet[i]
              return (
                <div
                  key={s.n}
                  className="grid grid-cols-[26px_1fr] items-start gap-2 border-l-2 px-3.5 py-2"
                  style={{
                    borderLeftColor: raum ? '#C8703A' : 'transparent',
                    background: raum ? 'rgba(200,112,58,.09)' : 'transparent'
                  }}
                >
                  <div
                    className="pt-0.5 text-[10px] tabular-nums"
                    style={{ fontFamily: 'Roboto Mono, monospace', color: raum ? '#C8703A' : '#6B7570' }}
                  >
                    {s.n}
                  </div>
                  <div>
                    <div
                      className="text-[15px] leading-tight"
                      style={{ fontFamily: 'Iowan Old Style, Palatino, Georgia, serif', color: '#1E2A25' }}
                    >
                      {s.rolle}
                    </div>
                    {raum && (
                      <div
                        className="mt-0.5 text-[9.5px] uppercase tracking-[0.08em]"
                        style={{ fontFamily: 'Roboto Mono, monospace', color: '#C8703A' }}
                      >
                        {raum}
                      </div>
                    )}
                    <div className="mt-0.5 text-[11.5px] leading-snug" style={{ color: '#6B7570' }}>
                      {s.name}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="border-t px-3.5 py-2.5 text-[11px] leading-snug" style={{ borderColor: '#C9C0AA', color: '#6B7570' }}>
            {vollausbau
              ? 'Vollausbau — auch Teamtable, Konferenz, Workshop, Videokonf und Break out tragen eine Säule.'
              : 'Die vier Räume, die im Plan Workspace, Einzelbüro oder Doppelbüro heißen.'}
          </div>
        </aside>
      )}

      {/* Bedienleiste */}
      <div
        className="absolute bottom-4 left-1/2 z-10 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 flex-wrap justify-center gap-1 border p-1.5"
        style={{ background: 'rgba(242,236,222,.92)', borderColor: '#C9C0AA' }}
      >
        <span className="axo-lbl">Blick</span>
        {BLICKE.map((b: any, i: number) => (
          <button
            key={b.taste}
            type="button"
            className="axo-btn"
            aria-pressed={blickIndex === i}
            style={blickIndex === i ? { background: '#3F6757', color: '#F2ECDE' } : undefined}
            onClick={() => {
              setBlickIndex(i)
              axoRef.current?.setzeBlick(b.az, b.el)
            }}
          >
            {b.taste}
          </button>
        ))}
        <span className="axo-lbl ml-1 border-l pl-2" style={{ borderColor: '#C9C0AA' }}>
          Namen
        </span>
        {(
          [
            ['alle', 'Alle'],
            ['saeulen', 'Säulen'],
            ['aus', 'Aus']
          ] as [NamenModus, string][]
        ).map(([id, text]) => (
          <button
            key={id}
            type="button"
            className="axo-btn"
            aria-pressed={namen === id}
            style={namen === id ? { background: '#3F6757', color: '#F2ECDE' } : undefined}
            onClick={() => {
              setNamen(id)
              axoRef.current?.setzeNamen(id)
            }}
          >
            {text}
          </button>
        ))}
        <button
          type="button"
          className="axo-btn ml-1 border-l pl-2"
          style={{ borderColor: '#C9C0AA', ...(vollausbau ? { background: '#3F6757', color: '#F2ECDE' } : {}) }}
          aria-pressed={vollausbau}
          onClick={() => setVollausbau((v) => !v)}
        >
          9 Säulen
        </button>
        <button
          type="button"
          className="axo-btn"
          aria-pressed={tafelOffen}
          style={tafelOffen ? { background: '#3F6757', color: '#F2ECDE' } : undefined}
          onClick={() => setTafelOffen((t) => !t)}
        >
          Legende
        </button>
      </div>

      {/* W7: die Zeile sagt jetzt auch, was hier BEARBEITET werden kann. Ein
          Hinweis, der eine Bedienung verschweigt, die es gibt, lehrt den
          Nutzer, sie nicht zu versuchen. */}
      <div
        className="pointer-events-none absolute bottom-5 left-6 hidden text-[9.5px] uppercase leading-relaxed tracking-[0.11em] opacity-80 md:block"
        style={{ fontFamily: 'Roboto Mono, monospace', color: '#6B7570' }}
      >
        Ziehen dreht · Rad zoomt · Umschalt+Ziehen verschiebt
        <br />
        Möbel lassen sich hier ziehen · Q und E drehen · Entf löscht
      </div>

      {/* Die ehrliche Grenze, und zwar SICHTBAR: unter einer Neigung von 0,35
          bedeutet ein Bildpunkt über 22 cm Tiefe. Dort wird nur gedreht — und
          das steht da, statt dass ein Griff wortlos nichts tut. */}
      {zuFlach && (
        <div
          className="pointer-events-none absolute left-1/2 top-20 z-20 max-w-[46ch] -translate-x-1/2 border px-3.5 py-2 text-[11px] leading-snug md:top-24"
          role="status"
          style={{ background: 'rgba(242,236,222,.96)', borderColor: '#C8703A', color: '#46514A' }}
        >
          Das Blatt liegt zu flach zum Verschieben — ein Bildpunkt wäre hier über 22 cm Tiefe. Blatt
          aufrichten oder „Plan“ wählen. Drehen mit Q und E geht weiter.
        </div>
      )}

      <style jsx>{`
        .axo-flaeche {
          cursor: grab;
        }
        .axo-btn {
          font-family: 'Roboto Mono', 'Cascadia Mono', Consolas, monospace;
          font-size: 10.5px;
          letter-spacing: 0.09em;
          text-transform: uppercase;
          color: #46514a;
          background: transparent;
          border: 1px solid transparent;
          padding: 7px 10px;
          cursor: pointer;
          white-space: nowrap;
          transition: background 0.15s, color 0.15s;
        }
        .axo-btn:hover {
          background: #ded5c0;
          color: #1e2a25;
        }
        .axo-lbl {
          font-family: 'Roboto Mono', 'Cascadia Mono', Consolas, monospace;
          font-size: 9.5px;
          letter-spacing: 0.13em;
          text-transform: uppercase;
          color: #6b7570;
          padding: 0 7px 0 3px;
          align-self: center;
          user-select: none;
        }
      `}</style>
    </div>
  )
}
