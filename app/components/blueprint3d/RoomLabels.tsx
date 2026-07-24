'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import type { Blueprint3d } from '@blueprint3d/blueprint3d'
import { resolveLabels, type PlanLabel, type ResolvedLabel } from '@/lib/roomNaming'

interface RoomLabelsProps {
  blueprint3d: Blueprint3d
  viewMode: '2d' | '3d'
  /** Nur im Edit-Tab sichtbar/aktiv (spart den rAF-Loop sonst). */
  active: boolean
  /** PDF-Label-Anker aus dem geladenen Plan (halle400.json → labels). */
  labels: PlanLabel[]
}

/**
 * Zeigt die PDF-Raumnamen als DOM-Overlay ueber der 2D- UND 3D-Ansicht und macht
 * sie per Doppelklick editierbar (T4).
 *
 * Positioniert wird jedes Label an seiner PDF-Ankerposition (cm), projiziert auf
 * den Bildschirm ueber die jeweils aktive Kamera — NICHT an einem abgeleiteten
 * Raum (siehe roomNaming.ts fuer die Begruendung). Die Projektion laeuft
 * imperativ pro Frame (rAF) ueber die DOM-Refs, damit das Drehen/Zoomen der
 * 3D-Kamera keinen React-Re-Render ausloest.
 */
export function RoomLabels({ blueprint3d, viewMode, active, labels }: RoomLabelsProps) {
  const [resolved, setResolved] = useState<ResolvedLabel[]>([])
  const [editing, setEditing] = useState<string | null>(null)

  const resolvedRef = useRef(resolved)
  resolvedRef.current = resolved
  const containerRef = useRef<HTMLDivElement>(null)
  const labelRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const rafRef = useRef<number | null>(null)

  // --- Namen aufloesen: PDF-Default + User-Overrides (roomMeta, key = labelKey)
  const recompute = useCallback(() => {
    const fp = blueprint3d.model.floorplan
    setResolved(resolveLabels(labels, fp.getAllRoomMeta()))
  }, [blueprint3d, labels])

  useEffect(() => {
    let mounted = true
    const fp = blueprint3d.model.floorplan
    // Nach einem Plan-Load koennen persistierte Overrides dazukommen.
    fp.roomLoadedCallbacks.add(() => {
      if (mounted) recompute()
    })
    recompute()
    return () => {
      mounted = false
    }
  }, [blueprint3d, recompute])

  // --- Positionierung pro Frame (imperativ, kein State pro Frame)
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

        const onscreen = !behind && x >= 0 && x <= w && y >= 0 && y <= h
        el.style.display = onscreen ? '' : 'none'
        el.style.transform =
          `translate(-50%, -50%) translate(${Math.round(x)}px, ${Math.round(y)}px)`
      }

      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [active, viewMode, blueprint3d])

  const setLabelRef = useCallback((key: string, el: HTMLDivElement | null) => {
    if (el) labelRefs.current.set(key, el)
    else labelRefs.current.delete(key)
  }, [])

  const commitEdit = useCallback(
    (key: string, value: string) => {
      // Leerer Name = Override loeschen → PDF-Default kommt zurueck (setRoomName).
      blueprint3d.model.floorplan.setRoomName(key, value)
      setEditing(null)
      recompute()
    },
    [blueprint3d, recompute]
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
          className="absolute left-0 top-0 pointer-events-auto select-none"
          style={{ willChange: 'transform' }}
          onDoubleClick={() => setEditing(label.key)}
          title="Doppelklick zum Umbenennen"
        >
          {editing === label.key ? (
            <input
              autoFocus
              defaultValue={label.name}
              className="w-28 rounded border border-primary bg-background px-1 py-0.5 text-xs text-foreground shadow outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  commitEdit(label.key, (e.target as HTMLInputElement).value)
                } else if (e.key === 'Escape') {
                  setEditing(null)
                }
              }}
              onBlur={(e) => commitEdit(label.key, e.target.value)}
            />
          ) : (
            <div className="flex cursor-text flex-col items-center rounded bg-background/80 px-1.5 py-0.5 text-center shadow-sm backdrop-blur-sm">
              <span className="whitespace-nowrap text-xs font-medium leading-tight text-foreground">
                {label.name}
              </span>
              {label.zusatz && (
                <span className="whitespace-nowrap text-[10px] leading-tight text-muted-foreground">
                  {label.zusatz}
                </span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
