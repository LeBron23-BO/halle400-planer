'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { TopNavBar } from './TopNavBar'
import { ItemsDrawer } from './ItemsDrawer'
import { ProjectsView } from './ProjectsView'
import { SettingsDialog } from './SettingsDialog'
import { ContextMenu } from './ContextMenu'
import { BedSizeInput } from './BedSizeInput'
import { FloorplannerControls } from './FloorplannerControls'
import { RoomLabels } from './RoomLabels'
import { AxonometrieAnsicht } from './AxonometrieAnsicht'
import { TextureSelector } from './TextureSelector'
import type { PlanLabel } from '@/lib/roomNaming'
import { loadRoomMeta } from '@/lib/labelStore'
import { SaveFloorplanDialog } from './SaveFloorplanDialog'
import { TouchHelp } from './TouchHelp'
import { ControlsHelp } from './ControlsHelp'
import { LoeschRueckfrage } from './LoeschRueckfrage'
import type { LoeschZiel } from '@blueprint3d/floorplanner/floorplanner'
import DefaultFloorplan from '@blueprint3d/templates/default.json'
import { blueprintStorage } from '@/services/storage'

import { Blueprint3d } from '@blueprint3d/blueprint3d'
import { floorplannerModes } from '@blueprint3d/floorplanner/floorplanner_view'
import {
  Configuration, configDimUnit, configWallHeight, configWallThickness
} from '@blueprint3d/core/configuration'
import type { Item } from '@blueprint3d/items/item'
import type { HalfEdge } from '@blueprint3d/model/half_edge'
import type { Room } from '@blueprint3d/model/room'
import { Blueprint3DModes, type Blueprint3DMode } from '@blueprint3d/config/modes'
import { RoomType } from '@blueprint3d/types/room_types'

export interface Blueprint3DAppConfig {
  enableWheelZoom?: boolean | (() => boolean)
  mode?: Blueprint3DMode
  onBlueprint3DReady?: (blueprint3d: Blueprint3d) => void
  onBedSizeChange?: (width: number, length: number) => void
  isLanguageOption?: boolean
  openMyFloorplans?: boolean
  isFullscreen?: boolean
  onFullscreenToggle?: () => void
  onViewModeChange?: (mode: '2d' | '3d' | 'axo') => void
  renderOverlay?: () => React.ReactNode
  alwaysSpin?: boolean
}

interface Blueprint3DAppBaseProps {
  config?: Blueprint3DAppConfig
}

export function Blueprint3DAppBase({ config = {} }: Blueprint3DAppBaseProps) {
  const {
    enableWheelZoom = true,
    mode = Blueprint3DModes.BEDROOM,
    onBlueprint3DReady,
    onBedSizeChange,
    isLanguageOption = false,
    openMyFloorplans = false,
    isFullscreen = false,
    onViewModeChange,
    renderOverlay,
    alwaysSpin = false
  } = config

  const t = useTranslations('BluePrint.saveDialog')
  const tItems = useTranslations('BluePrint.items')
  const tFloorplanner = useTranslations('BluePrint.floorplanner')
  const tMyFloorplans = useTranslations('BluePrint.myFloorplans')

  const contentRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<HTMLDivElement>(null)
  const floorplannerCanvasRef = useRef<HTMLCanvasElement>(null)
  const blueprint3dRef = useRef<Blueprint3d | null>(null)
  const loadingToastsRef = useRef<Array<{ toastId: string | number; itemName: string }>>([])

  const [activeTab, setActiveTab] = useState<'projects' | 'edit' | 'items'>(
    openMyFloorplans ? 'projects' : 'edit'
  )
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)
  const [floorplannerMode, setFloorplannerMode] = useState<'move' | 'draw' | 'delete'>('move')
  const [textureType, setTextureType] = useState<'floor' | 'wall' | null>(null)
  const [currentTarget, setCurrentTarget] = useState<HalfEdge | Room | null>(null)
  const [itemsLoading, setItemsLoading] = useState(0)
  const [viewMode, setViewMode] = useState<'2d' | '3d' | 'axo'>('3d')
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  // Raum-Label-Anker aus dem geladenen Plan + Bereitschaft der blueprint3d-Instanz
  const [planLabels, setPlanLabels] = useState<PlanLabel[]>([])
  const [planName, setPlanName] = useState('')
  const [ready, setReady] = useState(false)
  // Rueckgaengig/Wiederholen (T5a): gespiegelter Zustand der Historie, damit
  // die Schaltflaechen ausgegraut sind, wenn es nichts zurueckzunehmen gibt.
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  // Was gerade zum Loeschen vorgeschlagen ist (E1) — gespiegelt aus dem
  // Floorplanner, damit die Rueckfrage im React-Baum leben kann.
  const [loeschAnfrage, setLoeschAnfrage] = useState<LoeschZiel | null>(null)

  const [currentBlueprint, setCurrentBlueprint] = useState<{
    id: string
    name: string
    roomType: RoomType
  } | null>(null)

  const [currentMode, setCurrentMode] = useState<Blueprint3DMode>(mode)

  const getWheelZoomEnabled = useCallback(() => {
    if (typeof enableWheelZoom === 'function') {
      return enableWheelZoom()
    }
    return enableWheelZoom
  }, [enableWheelZoom])

  // Initialize Blueprint3d
  useEffect(() => {
    if (!viewerRef.current || blueprint3dRef.current) return

    const savedUnit = localStorage.getItem('dimensionUnit')
    if (savedUnit) {
      Configuration.setValue(configDimUnit, savedUnit)
    }

    // Halle 400: die Buero-Einbauten sind 3.00 m hoch. Ein Grundriss gibt keine
    // Hoehe her (T3b) — 300 cm ist die vom Nutzer gesetzte Raumhoehe, bewusst
    // statt des 250-cm-Defaults. Dicke ebenso bewusst gesetzt: 12.5 cm als
    // Standard-Trennwand (Aussenwaende sind real dicker — bekannte Vereinfachung,
    // die Wandliste fuehrt Mittellinien). MUSS vor loadSerialized stehen, weil
    // Wall Hoehe/Dicke bei der Erzeugung aus Configuration liest, nicht aus dem JSON.
    Configuration.setValue(configWallHeight, 300)
    Configuration.setValue(configWallThickness, 12.5)

    const opts = {
      floorplannerElement: 'floorplanner-canvas',
      threeElement: '#viewer',
      textureDir: '/models/textures/',
      widget: false,
      enableWheelZoom: getWheelZoomEnabled(),
      alwaysSpin
    }

    const blueprint3d = new Blueprint3d(opts)
    blueprint3dRef.current = blueprint3d
    setReady(true)

    // Messzugang fuer die Pruefwerkzeuge (tools/pruefe-*.mjs). Ohne ihn kann ein
    // Pruefskript nur das BILD befragen und muss aus Pixeln raten, was das Modell
    // gerade denkt — genau die Messfehler-Klasse, die in dieser Codebasis schon
    // dreimal ein Gate falsch rot gemeldet hat. Bewusst nur lesend gedacht und
    // ohne Nutzen fuer die Seite selbst; er kostet nichts und luegt nicht.
    ;(window as unknown as { __planer?: Blueprint3d }).__planer = blueprint3d

    if (onBlueprint3DReady) {
      onBlueprint3DReady(blueprint3d)
    }

    // Historie -> React spiegeln (T5a). Ein eigenes Abmelden ist nicht noetig:
    // die blueprint3d-Instanz lebt genau so lange wie diese Komponente.
    blueprint3d.undo.changed.add(() => {
      setCanUndo(blueprint3d.undo.canUndo())
      setCanRedo(blueprint3d.undo.canRedo())
    })

    // Werkzeugwechsel -> React spiegeln (E2). Der Floorplanner schaltet auch von
    // SELBST zurueck: bei Escape, bei einem Klick ins Leere im Loeschen-Werkzeug
    // und wenn ein Streckenzug an einer vorhandenen Ecke schliesst. Ohne diese
    // Spiegelung blieb die Leiste auf "Waende zeichnen" stehen, obwohl laengst
    // das Verschieben aktiv war — die Anzeige log ueber den Zustand.
    blueprint3dRef.current.floorplanner?.addModeResetCallback((m) => {
      setFloorplannerMode(
        m === floorplannerModes.DRAW ? 'draw' : m === floorplannerModes.DELETE ? 'delete' : 'move'
      )
    })

    // Loesch-Rueckfrage -> React spiegeln (E1). Der Floorplanner meldet mit
    // `null`, wenn der Vorschlag hinfaellig ist — die Rueckfrage muss also nie
    // selbst raten, wann sie wieder verschwindet.
    blueprint3d.floorplanner?.addLoeschAnfrageCallback((ziel) => {
      setLoeschAnfrage(ziel)
    })

    blueprint3d.three.itemSelectedCallbacks.add((item) => {
      setSelectedItem(item)
      setTextureType(null)
    })

    blueprint3d.three.itemUnselectedCallbacks.add(() => {
      setSelectedItem(null)
    })

    blueprint3d.three.wallClicked.add((halfEdge) => {
      setCurrentTarget(halfEdge)
      setTextureType('wall')
      setSelectedItem(null)
    })

    blueprint3d.three.floorClicked.add((room) => {
      setCurrentTarget(room)
      setTextureType('floor')
      setSelectedItem(null)
    })

    blueprint3d.three.nothingClicked.add(() => {
      setTextureType(null)
      setCurrentTarget(null)
    })

    blueprint3d.model.scene.itemLoadingCallbacks.add(() => {
      setItemsLoading((prev) => prev + 1)
    })

    blueprint3d.model.scene.itemLoadedCallbacks.add((item) => {
      setItemsLoading((prev) => prev - 1)
      const loadingToasts = loadingToastsRef.current
      if (loadingToasts.length > 0) {
        const { toastId, itemName } = loadingToasts.shift()!
        toast.success(tItems('loadedSuccess', { name: itemName }), { id: toastId })
      }
    })

    blueprint3d.model.scene.itemLoadErrorCallbacks.add(() => {
      setItemsLoading((prev) => prev - 1)
      const loadingToasts = loadingToastsRef.current
      if (loadingToasts.length > 0) {
        const { toastId, itemName } = loadingToasts.shift()!
        toast.error(tItems('loadError', { name: itemName }), { id: toastId })
      }
    })

    // Load floorplan from IndexedDB or use default
    const loadInitialFloorplan = async () => {
      try {
        // Vorrang: ein mitgelieferter Plan aus public/plaene, angefordert per
        // ?plan=<name> — so laesst sich Halle 400 oeffnen, ohne den
        // gespeicherten Arbeitsstand in IndexedDB zu ueberschreiben.
        // Der Name wird streng gefiltert: der Parameter darf ausschliesslich
        // einen Dateinamen benennen, niemals einen Pfad (kein ../, kein /).
        const gewuenscht = new URLSearchParams(window.location.search).get('plan')
        if (gewuenscht && /^[a-z0-9-]{1,40}$/.test(gewuenscht)) {
          const antwort = await fetch(`plaene/${gewuenscht}.json`)
          if (antwort.ok) {
            const planData = await antwort.json()
            // Die Raum-Label liegen als eigener Top-Level-Zweig neben
            // floorplan/items; loadSerialized ignoriert sie, das RoomLabels-
            // Overlay liest sie hier aus dem rohen Plan-JSON.
            setPlanLabels(Array.isArray(planData.labels) ? planData.labels : [])
            setPlanName(gewuenscht)
            // User-Umbenennungen (plan-skopiert im localStorage) in den Plan
            // injizieren, damit loadFloorplan sie als roomMeta uebernimmt — die
            // statische Datei traegt keine, sonst ginge die Umbenennung beim
            // Reload verloren.
            const savedMeta = loadRoomMeta(gewuenscht)
            if (Object.keys(savedMeta).length > 0) {
              planData.floorplan = planData.floorplan ?? {}
              planData.floorplan.roomMeta = savedMeta
            }
            blueprint3d.model.loadSerialized(JSON.stringify(planData))
            return
          }
          console.warn(`[Blueprint3DAppBase] Plan "${gewuenscht}" nicht gefunden`)
        }

        const { blueprintTemplateDB } = await import('@blueprint3d/indexdb/blueprint-template')
        const savedTemplate = await blueprintTemplateDB.getTemplate()

        if (savedTemplate) {
          blueprint3d.model.loadSerialized(JSON.stringify(savedTemplate))
          return
        }

        const { getModeConfig } = await import('@blueprint3d/config/modes')
        const modeConfig = getModeConfig(mode)
        blueprint3d.model.loadSerialized(JSON.stringify(modeConfig.defaultTemplate))
      } catch (error) {
        console.error('[Blueprint3DAppBase] Error loading template:', error)
        blueprint3d.model.loadSerialized(JSON.stringify(DefaultFloorplan))
      }
    }

    loadInitialFloorplan()

    return () => {
      // Cleanup if needed
    }
  }, [getWheelZoomEnabled, tItems, mode, onBlueprint3DReady])

  // Update wheel zoom setting when it changes
  useEffect(() => {
    if (blueprint3dRef.current) {
      blueprint3dRef.current.three.controls.enableWheelZoom = getWheelZoomEnabled()
    }
  }, [getWheelZoomEnabled])

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (blueprint3dRef.current && activeTab === 'edit') {
        if (viewMode === '3d') {
          blueprint3dRef.current.three.updateWindowSize()
        } else {
          blueprint3dRef.current.floorplanner?.resizeView()
        }
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [activeTab, viewMode])

  // Handle resize with ResizeObserver for accurate sizing
  useEffect(() => {
    if (!contentRef.current || !blueprint3dRef.current) return

    const resizeObserver = new ResizeObserver(() => {
      if (!blueprint3dRef.current || activeTab !== 'edit') return
      if (viewMode === '3d') {
        blueprint3dRef.current.three.updateWindowSize()
      } else {
        blueprint3dRef.current.floorplanner?.resizeView()
      }
    })

    resizeObserver.observe(contentRef.current)
    return () => resizeObserver.disconnect()
  }, [activeTab, viewMode])

  const handleViewChange = useCallback(
    (mode: '2d' | '3d' | 'axo') => {
      if (!blueprint3dRef.current) return
      setViewMode(mode)
      onViewModeChange?.(mode)

      // Die Axonometrie ist eine eigene Zeichenflaeche, keine Betriebsart der
      // 3D-Engine — `three.setViewMode('axo')` kennt sie nicht. Sie braucht nur
      // einen frischen Grundriss, den Rest macht ihr eigener Renderer.
      if (mode === 'axo') {
        blueprint3dRef.current.model.floorplan.update()
        return
      }
      blueprint3dRef.current.three.setViewMode(mode)

      if (mode === '2d') {
        setTimeout(() => {
          if (blueprint3dRef.current) {
            // reset() passt seit T7 den ganzen Grundriss ein; das frueher hier
            // zusaetzlich gerufene resetOrigin() waere nur eine zweite,
            // gleichlautende Zentrierung.
            blueprint3dRef.current.floorplanner?.reset()
          }
        }, 50)
      } else {
        setTimeout(() => {
          if (blueprint3dRef.current) {
            blueprint3dRef.current.model.floorplan.update()
            blueprint3dRef.current.three.updateWindowSize()
          }
        }, 50)
      }
    },
    [onViewModeChange]
  )

  const handleDeleteItem = useCallback(() => {
    if (selectedItem) {
      selectedItem.removeFromScene()
      setSelectedItem(null)
    }
  }, [selectedItem])

  const handleResizeItem = useCallback(
    (height: number, width: number, depth: number) => {
      if (selectedItem) selectedItem.resize(height, width, depth)
    },
    [selectedItem]
  )

  const handleFixedChange = useCallback(
    (fixed: boolean) => {
      if (selectedItem) selectedItem.setFixed(fixed)
    },
    [selectedItem]
  )

  // Generate top-down thumbnail
  const generateTopDownThumbnail = useCallback((): string => {
    if (!blueprint3dRef.current) return ''

    const three = blueprint3dRef.current.three
    const camera = three.camera
    const controls = three.controls
    const renderer = three.renderer

    const savedPosition = camera.position.clone()
    const savedTarget = controls.target.clone()
    const savedRotation = camera.rotation.clone()
    const savedAspect = camera.aspect

    const currentCanvas = renderer.domElement
    const savedWidth = currentCanvas.width
    const savedHeight = currentCanvas.height

    const targetWidth = 1800
    const targetHeight = 1200

    try {
      renderer.setSize(targetWidth, targetHeight, false)
      camera.aspect = targetWidth / targetHeight
      camera.updateProjectionMatrix()

      const center = blueprint3dRef.current.model.floorplan.getCenter()
      const size = blueprint3dRef.current.model.floorplan.getSize()

      const targetAspect = 3 / 2
      const roomAspect = size.x / size.z
      const margin = 1.4

      let viewWidth: number, viewHeight: number
      if (roomAspect > targetAspect) {
        viewWidth = size.x * margin
        viewHeight = viewWidth / targetAspect
      } else {
        viewHeight = size.z * margin
        viewWidth = viewHeight * targetAspect
      }

      const fov = camera.fov * (Math.PI / 180)
      const distance = Math.max(viewWidth, viewHeight) / (2 * Math.tan(fov / 2))

      controls.target.set(center.x, 0, center.z)
      camera.position.set(center.x, distance, center.z)
      camera.lookAt(controls.target)
      camera.updateProjectionMatrix()
      controls.update()

      renderer.clear()
      renderer.render(three.scene.getScene(), camera)

      return currentCanvas.toDataURL('image/webp', 0.85)
    } finally {
      renderer.setSize(savedWidth, savedHeight, false)
      camera.aspect = savedAspect
      camera.position.copy(savedPosition)
      controls.target.copy(savedTarget)
      camera.rotation.copy(savedRotation)
      camera.updateProjectionMatrix()
      controls.update()

      renderer.clear()
      renderer.render(three.scene.getScene(), camera)
    }
  }, [])

  // Save: update existing or show dialog
  const handleSave = useCallback(async () => {
    if (currentBlueprint) {
      if (!blueprint3dRef.current) return
      const toastId = toast.loading(t('saving') || 'Saving floorplan...')
      try {
        const data = blueprint3dRef.current.model.exportSerialized()
        const thumbnail = generateTopDownThumbnail()
        const layoutData = JSON.parse(data)
        await blueprintStorage.update(currentBlueprint.id, {
          name: currentBlueprint.name,
          layoutData,
          thumbnailBase64: thumbnail,
          roomType: currentBlueprint.roomType
        })
        toast.success(t('saveSuccess'), { id: toastId })
      } catch (error) {
        console.error('Failed to update floorplan:', error)
        toast.error(t('saveError'), { id: toastId })
      }
    } else {
      setSaveDialogOpen(true)
    }
  }, [currentBlueprint, generateTopDownThumbnail, t])

  const handleNew = useCallback(() => {
    setSaveDialogOpen(true)
  }, [])

  // Create new blueprint via dialog
  const handleSaveFloorplan = useCallback(
    async (name: string, roomType: RoomType) => {
      if (!blueprint3dRef.current) return
      const toastId = toast.loading(t('saving') || 'Saving floorplan...')
      try {
        const data = blueprint3dRef.current.model.exportSerialized()
        const thumbnail = generateTopDownThumbnail()
        const layoutData = JSON.parse(data)
        const result = await blueprintStorage.create({
          name,
          layoutData,
          thumbnailBase64: thumbnail,
          roomType
        })
        setCurrentBlueprint({ id: result.id, name, roomType })
        toast.success(t('saveSuccess'), { id: toastId })
      } catch (error) {
        console.error('Failed to save floorplan:', error)
        toast.error(t('saveError'), { id: toastId })
      }
    },
    [generateTopDownThumbnail, t]
  )

  // Load from saved floorplan
  const handleLoadFloorplan = useCallback(
    (data: string, loadedMode?: RoomType, blueprintId?: string, blueprintName?: string) => {
      if (!blueprint3dRef.current) return
      blueprint3dRef.current.model.loadSerialized(data)
      if (loadedMode) setCurrentMode(loadedMode as Blueprint3DMode)
      if (blueprintId && blueprintName) {
        setCurrentBlueprint({
          id: blueprintId,
          name: blueprintName,
          roomType: loadedMode || RoomType.BEDROOM
        })
      }
      setActiveTab('edit')
    },
    []
  )

  const handleUnitChange = useCallback(
    (unit: string) => {
      Configuration.setValue(configDimUnit, unit)
      if (blueprint3dRef.current && activeTab === 'edit' && viewMode === '2d') {
        blueprint3dRef.current.floorplanner?.reset()
      }
    },
    [activeTab, viewMode]
  )

  const handleTabChange = useCallback(
    (tab: 'projects' | 'edit' | 'items') => {
      setActiveTab(tab)
      setTextureType(null)

      if (blueprint3dRef.current && tab === 'edit') {
        blueprint3dRef.current.three.stopSpin()
        blueprint3dRef.current.three.getController().setSelectedObject(null)

        if (viewMode === '2d') {
          const canvas = floorplannerCanvasRef.current
          if (canvas) {
            const resizeObserver = new ResizeObserver(() => {
              if (blueprint3dRef.current && canvas.clientWidth > 0) {
                // Erst wenn der Canvas eine Breite hat, kann eingepasst werden
                // (T7) — vorher waere der Massstab durch Null geteilt.
                blueprint3dRef.current.floorplanner?.reset()
                resizeObserver.disconnect()
              }
            })
            resizeObserver.observe(canvas)
          }
        } else {
          blueprint3dRef.current.model.floorplan.update()
          setTimeout(() => {
            if (blueprint3dRef.current) {
              blueprint3dRef.current.three.updateWindowSize()
            }
          }, 100)
        }
      }
    },
    [viewMode]
  )

  const handleFloorplannerModeChange = useCallback((mode: 'move' | 'draw' | 'delete') => {
    setFloorplannerMode(mode)
    if (!blueprint3dRef.current) return
    const modeMap = {
      move: floorplannerModes.MOVE,
      draw: floorplannerModes.DRAW,
      delete: floorplannerModes.DELETE
    }
    blueprint3dRef.current.floorplanner?.setMode(modeMap[mode])
  }, [])

  // Loeschen bestaetigen/abbrechen (E1). Der Floorplanner meldet ueber den
  // Callback selbst zurueck, dass die Rueckfrage zu schliessen ist — hier wird
  // der Zustand deshalb bewusst NICHT zusaetzlich genullt, sonst gaebe es zwei
  // Wahrheiten darueber, ob die Rueckfrage noch offen ist.
  const handleLoeschenBestaetigen = useCallback(() => {
    blueprint3dRef.current?.floorplanner?.loeschungBestaetigen()
  }, [])

  const handleLoeschenAbbrechen = useCallback(() => {
    blueprint3dRef.current?.floorplanner?.loeschungAbbrechen()
  }, [])

  const handleFloorplannerDone = useCallback(() => {
    setViewMode('3d')
    if (blueprint3dRef.current) {
      blueprint3dRef.current.model.floorplan.update()
    }
  }, [])

  // Ansicht (T7). Ohne diese Bedienung war von der 78 m langen Halle am
  // Rechner nur gut ein Drittel und am Handy ein Zehntel zu sehen.
  const handleZoomIn = useCallback(() => {
    blueprint3dRef.current?.floorplanner?.zoomeUmFaktor(1.25)
  }, [])

  const handleZoomOut = useCallback(() => {
    blueprint3dRef.current?.floorplanner?.zoomeUmFaktor(1 / 1.25)
  }, [])

  const handleFitAll = useCallback(() => {
    blueprint3dRef.current?.floorplanner?.allesEinpassen()
  }, [])

  const handleUndo = useCallback(() => {
    blueprint3dRef.current?.undo.undo()
  }, [])

  const handleRedo = useCallback(() => {
    blueprint3dRef.current?.undo.redo()
  }, [])

  // Tastenkuerzel Strg/Cmd+Z bzw. +Y / +Shift+Z (T5a).
  // Bewusst nur im 2D-Editor: dort wird die Geometrie bearbeitet. In der
  // 3D-Ansicht erwartete man ein Zuruecknehmen der Moebel — das kann diese
  // Historie NICHT (sie fuehrt nur den Grundriss), also fasst sie dort nichts an.
  useEffect(() => {
    if (viewMode !== '2d' || activeTab !== 'edit') return

    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return

      // Steht der Nutzer in einem Textfeld (Raum umbenennen), gehoert Strg+Z
      // der Texteingabe — sonst nehmen wir ihm mitten im Tippen eine Wand weg.
      const ziel = e.target as HTMLElement | null
      if (
        ziel &&
        (ziel.tagName === 'INPUT' || ziel.tagName === 'TEXTAREA' || ziel.isContentEditable)
      ) {
        return
      }

      const taste = e.key.toLowerCase()
      if (taste === 'z' && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
      } else if (taste === 'y' || (taste === 'z' && e.shiftKey)) {
        e.preventDefault()
        handleRedo()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [viewMode, activeTab, handleUndo, handleRedo])

  const handleItemSelect = useCallback(
    (item: {
      name: string
      key: string
      model: string
      type: string
      description?: string
    }) => {
      if (!blueprint3dRef.current) return
      const translatedName = tItems(item.key)
      const toastId = toast.loading(tItems('loadingItem', { name: translatedName }))
      loadingToastsRef.current.push({ toastId, itemName: translatedName })

      const metadata = {
        itemName: item.name,
        itemKey: item.key,
        resizable: true,
        modelUrl: item.model,
        itemType: parseInt(item.type),
        description: item.description
      }

      blueprint3dRef.current.model.scene.addItem(parseInt(item.type), item.model, metadata)
      setActiveTab('edit')
      setViewMode('3d')
    },
    [tItems]
  )

  const handleTextureSelect = useCallback(
    (textureUrl: string, stretch: boolean, scale: number) => {
      if (currentTarget) {
        currentTarget.setTexture(textureUrl, stretch, scale)
      }
    },
    [currentTarget]
  )

  return (
    <div className="relative h-full w-full">
      {/* Top Navigation Bar */}
      {!isFullscreen && (
        <div className="absolute top-0 left-0 right-0 z-50">
          <TopNavBar
            activeTab={activeTab}
            onTabChange={handleTabChange}
            viewMode={viewMode}
            onViewModeChange={handleViewChange}
            onSettingsClick={() => setSettingsOpen(true)}
            onSave={handleSave}
            onNew={handleNew}
            currentBlueprintName={currentBlueprint?.name}
          />
        </div>
      )}

      {/* Main Content Area */}
      <div ref={contentRef} className="h-full w-full relative overflow-hidden">
        <TouchHelp />

        {/* Projects View */}
        <div
          className="absolute inset-0"
          style={{ display: activeTab === 'projects' ? 'block' : 'none' }}
        >
          {activeTab === 'projects' && (
            <ProjectsView
              onBlueprintLoad={(layoutData, roomType, id, name) => {
                handleLoadFloorplan(layoutData, roomType, id, name)
                setActiveTab('edit')
                setViewMode('3d')
              }}
            />
          )}
        </div>

        {/* Edit View */}
        <div
          className="absolute inset-0"
          style={{ display: activeTab === 'edit' || activeTab === 'items' ? 'block' : 'none' }}
        >
          {/* 3D Viewer */}
          <div
            id="viewer"
            ref={viewerRef}
            className="absolute inset-0"
            style={{ display: viewMode === '3d' ? 'block' : 'none' }}
          >
            {viewMode === '3d' && (
              <>
                {!isFullscreen && <ControlsHelp viewMode="3d" />}
                {renderOverlay && renderOverlay()}

                {itemsLoading > 0 && (
                  <div id="loading-modal">
                    <div className="loading-content">
                      <p>
                        {tMyFloorplans('loading')}
                        <span className="loading-dots">
                          <span></span>
                          <span></span>
                          <span></span>
                        </span>
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* 2D Floorplanner */}
          <div
            id="floorplanner"
            className="absolute inset-0"
            style={{ display: viewMode === '2d' ? 'block' : 'none' }}
          >
            <canvas id="floorplanner-canvas" ref={floorplannerCanvasRef}></canvas>
            {viewMode === '2d' && !isFullscreen && (
              <>
                <FloorplannerControls
                  mode={floorplannerMode}
                  onModeChange={handleFloorplannerModeChange}
                  onDone={handleFloorplannerDone}
                  canUndo={canUndo}
                  canRedo={canRedo}
                  onUndo={handleUndo}
                  onRedo={handleRedo}
                  onZoomIn={handleZoomIn}
                  onZoomOut={handleZoomOut}
                  onFitAll={handleFitAll}
                />
                {floorplannerMode === 'draw' && (
                  <div className="absolute left-5 bottom-5 bg-black/50 text-primary-foreground px-2.5 py-1.5 rounded text-sm">
                    {tFloorplanner('escHint')}
                  </div>
                )}
                <ControlsHelp viewMode="2d" />
              </>
            )}
          </div>

          {/* Axonometrie (X3): dritte Ansicht neben 2D und 3D. Sie baut ihre
              Szene aus dem LEBENDEN Modell, nicht aus der Plan-Datei — was im
              2D-Zeichner geaendert wird, steht hier sofort im Bild. Bearbeitet
              wird bewusst nur in 2D; die Begruendung steht in der Komponente. */}
          {ready && blueprint3dRef.current && (
            <AxonometrieAnsicht
              blueprint3d={blueprint3dRef.current}
              labels={planLabels}
              aktiv={viewMode === 'axo' && (activeTab === 'edit' || activeTab === 'items')}
            />
          )}

          {/* Raum-Labels (T4): PDF-Namen ueber 2D + 3D, editierbar per Stift-Klick.
              Umbenennen nur, wenn kein Zeichen-/Loesch-Werkzeug aktiv ist —
              sonst blockierten die Stifte die Raum-Zentren (s. RoomLabels).
              In der Axonometrie nicht: die zeichnet ihre Namen selbst, mit
              Fuehrungslinien ausserhalb des Baukoerpers. */}
          {ready && blueprint3dRef.current && viewMode !== 'axo' && (
            <RoomLabels
              blueprint3d={blueprint3dRef.current}
              viewMode={viewMode}
              active={activeTab === 'edit'}
              labels={planLabels}
              planName={planName}
              umbenennenErlaubt={viewMode === '3d' || floorplannerMode === 'move'}
            />
          )}

          {/* Context Menu */}
          {selectedItem && !textureType && !isFullscreen && (
            <div className="absolute right-2 md:right-4 top-16 md:top-20 z-[70]">
              <ContextMenu
                selectedItem={selectedItem}
                onDelete={handleDeleteItem}
                onResize={handleResizeItem}
                onFixedChange={handleFixedChange}
              />
            </div>
          )}

          {/* Texture Selector */}
          {textureType && !isFullscreen && (
            <div className="absolute right-2 md:right-4 top-16 md:top-20 z-[70] max-h-[calc(100vh-100px)] md:max-h-[calc(100vh-120px)] overflow-y-auto">
              <TextureSelector type={textureType} onTextureSelect={handleTextureSelect} />
            </div>
          )}

          {/* Bed Size Input for generator mode */}
          {mode === 'generator' && !selectedItem && !textureType && onBedSizeChange && !isFullscreen && (
            <div className="absolute right-2 md:right-4 top-16 md:top-20 z-[70]">
              <BedSizeInput onSizeChange={onBedSizeChange} />
            </div>
          )}
        </div>
      </div>

      {/* Current Blueprint Name indicator */}
      {currentBlueprint && !isFullscreen && activeTab !== 'projects' && (
        <div className="absolute bottom-3 left-3 z-40 pointer-events-none">
          <span className="text-xs text-muted-foreground/60 bg-background/30 backdrop-blur-sm px-2 py-1 rounded">
            {currentBlueprint.name}
          </span>
        </div>
      )}

      {/* Rueckfrage vor dem Loeschen (E1) */}
      <LoeschRueckfrage
        ziel={loeschAnfrage}
        onBestaetigen={handleLoeschenBestaetigen}
        onAbbrechen={handleLoeschenAbbrechen}
      />

      {/* Items Drawer */}
      <ItemsDrawer
        isOpen={activeTab === 'items'}
        onClose={() => setActiveTab('edit')}
        onItemSelect={handleItemSelect}
      />

      {/* Settings Dialog */}
      <SettingsDialog
        isOpen={settingsOpen}
        onOpenChange={setSettingsOpen}
        onUnitChange={handleUnitChange}
        isLanguageOption={isLanguageOption}
      />

      {/* Save Floorplan Dialog */}
      <SaveFloorplanDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        onSave={handleSaveFloorplan}
        defaultName={`Floorplan ${new Date().toLocaleDateString()}`}
        defaultRoomType={
          Object.values(RoomType).includes(currentMode as RoomType)
            ? (currentMode as RoomType)
            : RoomType.BEDROOM
        }
      />
    </div>
  )
}
