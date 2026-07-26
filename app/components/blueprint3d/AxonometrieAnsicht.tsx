'use client'

/**
 * AXONOMETRIE ALS DRITTE ANSICHT (X3)
 * ===================================
 *
 * Haengt den Renderer aus `src/axo/` neben den 2D-Zeichner und die 3D-Ansicht.
 *
 * WARUM HIER NICHT BEARBEITET WIRD — eine bewusste Entscheidung
 * Die Editier-Werkzeuge E1-E3 (Zeichnen, Loeschen, Verschieben) wirken in
 * dieser Ansicht NICHT; sie bleiben dem 2D-Zeichner vorbehalten. Grund ist die
 * Genauigkeit, die in diesem Projekt ueber allem steht: in einer schraegen
 * Parallelprojektion trifft ein Mausklick keinen eindeutigen Punkt des
 * Grundrisses, sondern einen Sehstrahl. Ein Klick auf eine Wand landet auf
 * ihrer Krone, nicht auf ihrem Fusspunkt — jede Eingabe braeuchte eine
 * Annahme darueber, in welcher Hoehe der Nutzer gerade zielt. Genau solche
 * stillen Annahmen erzeugen die Abweichungen, die dieses Projekt vermeiden
 * will.
 *
 * Die Ansicht ist darum ein FENSTER, kein Werkzeug: sie zeigt jede Aenderung
 * aus dem 2D-Zeichner sofort, weil sie ihre Szene bei jedem `updated_rooms`
 * neu aus dem lebenden Modell baut — nicht aus der Plan-Datei.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Configuration, configWallThickness } from '@blueprint3d/core/configuration'
import { baueSzene } from '@blueprint3d/axo/axo-szene.js'
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
  const [blickIndex, setBlickIndex] = useState(0)
  const [namen, setNamen] = useState<NamenModus>('alle')
  const [tafelOffen, setTafelOffen] = useState(true)
  const [vollausbau, setVollausbau] = useState(false)
  const [verortet, setVerortet] = useState<Record<number, string>>({})

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

    axoRef.current = erzeugeAxonometrie(canvas, szene, {
      namen,
      dunkel: !!dunkel,
      randRechts: tafelOffen ? TAFEL_BREITE + 24 : 0
    })
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
  }, [aktiv, baue, blueprint3d])

  useEffect(() => {
    if (!aktiv) return
    const beiGroesse = () => axoRef.current?.passeAn()
    globalThis.addEventListener('resize', beiGroesse)
    return () => globalThis.removeEventListener('resize', beiGroesse)
  }, [aktiv])

  if (!aktiv) return null

  const blick = BLICKE[blickIndex]

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: 'var(--axo-papier, #F2ECDE)' }}>
      <canvas ref={canvasRef} className="block h-full w-full touch-none" style={{ cursor: 'grab' }} />

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

      <div
        className="pointer-events-none absolute bottom-5 left-6 hidden text-[9.5px] uppercase tracking-[0.11em] opacity-80 md:block"
        style={{ fontFamily: 'Roboto Mono, monospace', color: '#6B7570' }}
      >
        Ziehen dreht · Rad zoomt · Umschalt+Ziehen verschiebt
      </div>

      <style jsx>{`
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
