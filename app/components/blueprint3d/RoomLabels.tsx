'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { Pencil } from 'lucide-react'
import type { Blueprint3d } from '@blueprint3d/blueprint3d'
import { resolveLabels, type PlanLabel, type ResolvedLabel } from '@/lib/roomNaming'
import { saveRoomMeta } from '@/lib/labelStore'

interface RoomLabelsProps {
  blueprint3d: Blueprint3d
  viewMode: '2d' | '3d'
  /** Nur im Edit-Tab sichtbar/aktiv (spart den rAF-Loop sonst). */
  active: boolean
  /** PDF-Label-Anker aus dem geladenen Plan (halle400.json → labels). */
  labels: PlanLabel[]
  /** Aktiver Plan-Name (?plan=…) — Schluessel fuer die Persistenz der Umbenennungen. */
  planName: string
  /**
   * Darf gerade umbenannt werden? Nur dann faengt das Stift-Icon Klicks ab.
   * Im 2D-Zeichnen-/Loesch-Modus MUSS das false sein: die Stifte sitzen genau
   * auf den Raum-Zentren und schluckten dort sonst den Werkzeug-Klick
   * (gemessen: 18 blockierte Stellen), d.h. eine Wand liesse sich ausgerechnet
   * in der Raummitte nicht zeichnen oder loeschen.
   */
  umbenennenErlaubt: boolean
}

/**
 * Zeigt die PDF-Raumnamen als DOM-Overlay ueber der 2D- UND 3D-Ansicht und macht
 * sie ueber ein Stift-Icon (Einzelklick/Tap) editierbar (T4).
 *
 * Positioniert wird jedes Label an seiner PDF-Ankerposition (cm), projiziert auf
 * den Bildschirm ueber die jeweils aktive Kamera — NICHT an einem abgeleiteten
 * Raum (Begruendung: roomNaming.ts). Die Projektion laeuft imperativ pro Frame
 * (rAF) ueber die DOM-Refs; Style-Writes werden gecacht (nur bei echter
 * Positions-/Sichtbarkeitsaenderung geschrieben), damit ein statischer View
 * keine Dauer-Reflows erzeugt.
 */
/**
 * Ab wieviel Bildschirm-Pixeln je Zentimeter die Raumnamen in der 2D-Ansicht
 * ueberhaupt sinnvoll lesbar sind (T7). Darunter werden sie ausgeblendet.
 * Hergeleitet: ein Etikett ist rund 90 px breit, ein Raum im Mittel etwa 7 m —
 * 90 / 700 cm ist 0.13; mit 0.12 bleibt der eingepasste Blick am Rechner
 * (gemessen 0.18) beschriftet, der am Handy (gemessen 0.045) nicht.
 */
const LABEL_MIN_PIXEL_PRO_CM = 0.12

export function RoomLabels({
  blueprint3d,
  viewMode,
  active,
  labels,
  planName,
  umbenennenErlaubt
}: RoomLabelsProps) {
  const [resolved, setResolved] = useState<ResolvedLabel[]>([])
  const [editing, setEditing] = useState<string | null>(null)

  const resolvedRef = useRef(resolved)
  resolvedRef.current = resolved
  const containerRef = useRef<HTMLDivElement>(null)
  const labelRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const rafRef = useRef<number | null>(null)
  const lastWriteRef = useRef<Map<string, string>>(new Map())
  const cancelledRef = useRef(false)

  // --- Namen aufloesen: PDF-Default + User-Overrides (roomMeta, key = labelKey)
  const recompute = useCallback(() => {
    const fp = blueprint3d.model.floorplan
    setResolved(resolveLabels(labels, fp.getAllRoomMeta()))
  }, [blueprint3d, labels])

  useEffect(() => {
    let mounted = true
    const fp = blueprint3d.model.floorplan
    // Named callback + remove: sonst akkumulieren tote Closures im EventEmitter
    // (er hat kein Auto-Cleanup), jede haelt das alte labels-Array fest.
    const onRoomLoaded = () => {
      if (mounted) recompute()
    }
    fp.roomLoadedCallbacks.add(onRoomLoaded)
    recompute()
    return () => {
      mounted = false
      fp.roomLoadedCallbacks.remove(onRoomLoaded)
    }
  }, [blueprint3d, recompute])

  // Wechselt der Nutzer ins Zeichnen/Loeschen, waehrend ein Namensfeld offen
  // ist, muss es schliessen: ein offenes Feld ist pointer-events-auto und wuerde
  // sonst genau ueber dem Raumzentrum weiter Werkzeug-Klicks abfangen.
  useEffect(() => {
    if (!umbenennenErlaubt) {
      cancelledRef.current = true
      setEditing(null)
    }
  }, [umbenennenErlaubt])

  // --- Positionierung pro Frame (imperativ, Style-Writes gecacht)
  useEffect(() => {
    if (!active) return
    const three = blueprint3d.three
    const fp2d = blueprint3d.floorplanner
    const container = containerRef.current
    if (!container) return

    const ndc = new THREE.Vector3()
    const tick = () => {
      const w = container.clientWidth
      const h = container.clientHeight

      for (const label of resolvedRef.current) {
        const el = labelRefs.current.get(label.key)
        if (!el) continue
        const [ax, ay] = label.anker_cm

        let x: number
        let y: number
        let behind = false
        if (viewMode === '3d') {
          // Boden-Punkt an der PDF-Ankerposition (Floorplan-y → three-z).
          // NDC→Pixel wie main.ts:projectVector, plus z fuer den "hinter der
          // Kamera"-Test.
          ndc.set(ax, 0, ay).project(three.camera)
          behind = ndc.z > 1
          x = ndc.x * (w / 2) + w / 2
          y = -(ndc.y * (h / 2)) + h / 2
        } else if (fp2d) {
          x = fp2d.convertX(ax)
          y = fp2d.convertY(ay)
        } else {
          x = -9999
          y = -9999
        }

        // Bei weit herausgezogener 2D-Ansicht die Namen weglassen (T7): die
        // Etiketten behalten ihre Groesse, der Plan schrumpft — auf dem Handy
        // legten sich beim Einpassen der ganzen 78-m-Halle alle 18 Namen
        // uebereinander und ergaben unlesbaren Buchstabensalat. Ein sauberer
        // Umriss sagt dort mehr; beim Hineinzoomen kommen die Namen zurueck.
        // Schwelle: rund 90 px Etikettenbreite brauchen etwa 7 m Raumbreite.
        const zuKleinFuerNamen =
          viewMode === '2d' && !!fp2d && fp2d.pixelProCm() < LABEL_MIN_PIXEL_PRO_CM

        const onscreen = !behind && !zuKleinFuerNamen && x >= 0 && x <= w && y >= 0 && y <= h
        const want = onscreen
          ? `1|translate(-50%,-50%) translate(${Math.round(x)}px,${Math.round(y)}px)`
          : '0'
        if (lastWriteRef.current.get(label.key) !== want) {
          if (onscreen) {
            el.style.display = ''
            el.style.transform = want.slice(2)
          } else {
            el.style.display = 'none'
          }
          lastWriteRef.current.set(label.key, want)
        }
      }

      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      lastWriteRef.current.clear()
    }
  }, [active, viewMode, blueprint3d])

  const setLabelRef = useCallback((key: string, el: HTMLDivElement | null) => {
    if (el) labelRefs.current.set(key, el)
    else labelRefs.current.delete(key)
  }, [])

  const commitEdit = useCallback(
    (key: string, value: string) => {
      // Leerer Name = Override loeschen → PDF-Default kommt zurueck (setRoomName).
      const fp = blueprint3d.model.floorplan
      fp.setRoomName(key, value)
      // F1: plan-skopiert persistieren, damit die Umbenennung einen Reload
      // (?plan=…) uebersteht — die statische Plan-Datei traegt kein roomMeta.
      saveRoomMeta(planName, fp.getAllRoomMeta())
      setEditing(null)
      recompute()
    },
    [blueprint3d, planName, recompute]
  )

  if (!active) return null

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-40 overflow-hidden pointer-events-none"
    >
      {resolved.map((label) => (
        <div
          key={label.key}
          ref={(el) => setLabelRef(label.key, el)}
          className="absolute left-0 top-0 select-none"
        >
          {editing === label.key && umbenennenErlaubt ? (
            <input
              autoFocus
              defaultValue={label.name}
              style={{ touchAction: 'manipulation' }}
              className="pointer-events-auto w-28 rounded border border-primary bg-background px-1 py-0.5 text-xs text-foreground shadow outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  commitEdit(label.key, (e.target as HTMLInputElement).value)
                } else if (e.key === 'Escape') {
                  cancelledRef.current = true
                  setEditing(null)
                }
              }}
              onBlur={(e) => {
                // Escape hat schon abgebrochen → nicht doch committen (der Unmount
                // feuert sonst blur mit dem geaenderten Wert).
                if (cancelledRef.current) {
                  cancelledRef.current = false
                  return
                }
                commitEdit(label.key, e.target.value)
              }}
            />
          ) : (
            // Pille bewusst pointer-events-none, damit sie Klicks auf den Canvas
            // darunter (Boden-Textur, Wand-Zeichnen) an den Raum-Zentren NICHT
            // schluckt. Editierbar ist nur das kleine Stift-Icon.
            <div className="flex items-center gap-1 rounded bg-background/80 px-1.5 py-0.5 shadow-sm backdrop-blur-sm">
              <div className="flex flex-col items-center text-center">
                <span className="whitespace-nowrap text-xs font-medium leading-tight text-foreground">
                  {label.name}
                </span>
                {label.zusatz && (
                  <span className="whitespace-nowrap text-[10px] leading-tight text-muted-foreground">
                    {label.zusatz}
                  </span>
                )}
              </div>
              {/* Im Zeichnen-/Loesch-Modus komplett weg (nicht nur inaktiv):
                  ein sichtbarer, aber wirkungsloser Stift waere irrefuehrend,
                  und der Canvas darunter bleibt so an JEDER Stelle bedienbar. */}
              {umbenennenErlaubt && (
                <button
                  type="button"
                  style={{ touchAction: 'manipulation' }}
                  className="pointer-events-auto shrink-0 rounded p-0.5 text-muted-foreground opacity-60 transition-opacity hover:bg-accent hover:opacity-100"
                  aria-label={`${label.name} umbenennen`}
                  title="Umbenennen"
                  onClick={() => setEditing(label.key)}
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
