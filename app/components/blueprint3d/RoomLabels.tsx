'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import type { Blueprint3d } from '@blueprint3d/blueprint3d'
import {
  assignRoomNames,
  roomCentroid,
  type PlanLabel,
  type ResolvedRoomName
} from '@/lib/roomNaming'

interface RoomLabelsProps {
  blueprint3d: Blueprint3d
  viewMode: '2d' | '3d'
  /** Nur im Edit-Tab sichtbar/aktiv (spart den rAF-Loop sonst). */
  active: boolean
  /** PDF-Label-Anker aus dem geladenen Plan (halle400.json → labels). */
  labels: PlanLabel[]
}

/**
 * Zeigt die Raumnamen als DOM-Overlay ueber der 2D- UND 3D-Ansicht und macht sie
 * per Doppelklick editierbar (T4).
 *
 * Zwei getrennte Takte:
 *  - Zuordnung Name→Raum (teuer, Punkt-in-Polygon) nur bei Plan-Load / Wand-
 *    Aenderung / Umbenennung → React-State `names`.
 *  - Positionierung (billig) jeden Frame per rAF, rein imperativ ueber die
 *    DOM-Refs (KEIN React-State pro Frame → kein Re-Render-Sturm beim Drehen).
 */
export function RoomLabels({ blueprint3d, viewMode, active, labels }: RoomLabelsProps) {
  const [names, setNames] = useState<Map<string, ResolvedRoomName>>(new Map())
  const [editing, setEditing] = useState<string | null>(null)

  const namesRef = useRef(names)
  namesRef.current = names
  const containerRef = useRef<HTMLDivElement>(null)
  const labelRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const rafRef = useRef<number | null>(null)

  // --- Namen (neu) zuordnen: Plan-Load, Wand-Aenderung, Label-/Override-Wechsel
  const recompute = useCallback(() => {
    const fp = blueprint3d.model.floorplan
    setNames(assignRoomNames(fp.getRooms(), labels, fp.getAllRoomMeta()))
  }, [blueprint3d, labels])

  useEffect(() => {
    let mounted = true
    const fp = blueprint3d.model.floorplan
    // fireOnUpdatedRooms feuert bei jeder Wand-Aktualisierung UND nach dem
    // Plan-Load (loadFloorplan ruft update()). Der mounted-Guard ersetzt das
    // fehlende removeListener der EventEmitter-API.
    fp.fireOnUpdatedRooms(() => {
      if (mounted) recompute()
    })
    recompute() // Fall: der Plan war beim Mount schon geladen
    return () => {
      mounted = false
    }
  }, [blueprint3d, recompute])

  // --- Positionierung pro Frame (imperativ)
  useEffect(() => {
    if (!active) return
    const three = blueprint3d.three
    const fp2d = blueprint3d.floorplanner
    const container = containerRef.current
    if (!container) return

    const ndc = new THREE.Vector3()
    const tick = () => {
      const rooms = blueprint3d.model.floorplan.getRooms()
      const byUuid = new Map<string, (typeof rooms)[number]>()
      for (const r of rooms) byUuid.set(r.getUuid(), r)

      const w = container.clientWidth
      const h = container.clientHeight

      namesRef.current.forEach((_rn, uuid) => {
        const el = labelRefs.current.get(uuid)
        if (!el) return
        const room = byUuid.get(uuid)
        if (!room) {
          el.style.display = 'none'
          return
        }
        const c = roomCentroid(room)

        let x: number
        let y: number
        let behind = false
        if (viewMode === '3d') {
          // Boden-Mittelpunkt (Floorplan-y → three-z, wie im Thumbnail-Code).
          // Eigene NDC→Pixel-Rechnung statt three.projectVector, weil wir hier
          // zusaetzlich das z fuer den "hinter der Kamera"-Test brauchen; die
          // Umrechnung ist identisch (main.ts:projectVector).
          ndc.set(c.x, 0, c.y).project(three.camera)
          behind = ndc.z > 1
          x = ndc.x * (w / 2) + w / 2
          y = -(ndc.y * (h / 2)) + h / 2
        } else if (fp2d) {
          x = fp2d.convertX(c.x)
          y = fp2d.convertY(c.y)
        } else {
          x = -9999
          y = -9999
        }

        const onscreen = !behind && x >= 0 && x <= w && y >= 0 && y <= h
        el.style.display = onscreen ? '' : 'none'
        el.style.transform =
          `translate(-50%, -50%) translate(${Math.round(x)}px, ${Math.round(y)}px)`
      })

      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [active, viewMode, blueprint3d])

  const setLabelRef = useCallback((uuid: string, el: HTMLDivElement | null) => {
    if (el) labelRefs.current.set(uuid, el)
    else labelRefs.current.delete(uuid)
  }, [])

  const commitEdit = useCallback(
    (uuid: string, value: string) => {
      // Leerer Name = Override loeschen → PDF-Default kommt zurueck (setRoomName).
      blueprint3d.model.floorplan.setRoomName(uuid, value)
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
      {[...names.entries()].map(([uuid, rn]) => (
        <div
          key={uuid}
          ref={(el) => setLabelRef(uuid, el)}
          className="absolute left-0 top-0 pointer-events-auto select-none"
          style={{ willChange: 'transform' }}
          onDoubleClick={() => setEditing(uuid)}
          title="Doppelklick zum Umbenennen"
        >
          {editing === uuid ? (
            <input
              autoFocus
              defaultValue={rn.name}
              className="w-28 rounded border border-primary bg-background px-1 py-0.5 text-xs text-foreground shadow outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  commitEdit(uuid, (e.target as HTMLInputElement).value)
                } else if (e.key === 'Escape') {
                  setEditing(null)
                }
              }}
              onBlur={(e) => commitEdit(uuid, e.target.value)}
            />
          ) : (
            <div className="flex cursor-text flex-col items-center rounded bg-background/80 px-1.5 py-0.5 text-center shadow-sm backdrop-blur-sm">
              <span className="whitespace-nowrap text-xs font-medium leading-tight text-foreground">
                {rn.name}
              </span>
              {rn.zusatz && (
                <span className="whitespace-nowrap text-[10px] leading-tight text-muted-foreground">
                  {rn.zusatz}
                </span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
