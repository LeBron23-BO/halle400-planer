'use client'

import { Move, MoveDiagonal, Pencil, Trash2, Check, Undo2, Redo2, ZoomIn, ZoomOut, Maximize2, Magnet, DoorOpen } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useTranslations } from 'next-intl'
import { useIsMobile } from "@/hooks/use-media-query"
import type { OeffnungsArt } from '@blueprint3d/model/floorplan'

interface FloorplannerControlsProps {
  mode: 'move' | 'wand' | 'draw' | 'delete' | 'oeffnung'
  onModeChange: (mode: 'move' | 'wand' | 'draw' | 'delete' | 'oeffnung') => void
  onDone: () => void
  /** Rueckgaengig/Wiederholen (T5a) */
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  /** Ansicht (T7) */
  onZoomIn: () => void
  onZoomOut: () => void
  onFitAll: () => void
  /** Einrasten gezogener Moebel (W2) */
  einrasten: boolean
  onEinrastenChange: (an: boolean) => void
  /** Welche Oeffnung das Werkzeug gerade setzt (W4) */
  oeffnungsArt: OeffnungsArt
  onOeffnungsArtChange: (art: OeffnungsArt) => void
}

export function FloorplannerControls({
  mode,
  onModeChange,
  onDone,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onFitAll,
  einrasten,
  onEinrastenChange,
  oeffnungsArt,
  onOeffnungsArtChange
}: FloorplannerControlsProps) {
  const t = useTranslations('BluePrint.floorplanner')
  const isMobile = useIsMobile()

  // Die vier Arten einer Oeffnung (W4). Sie erscheinen NUR mit ihrem Werkzeug:
  // vier weitere Schaltflaechen in einer Zeile, deren Breite bereits gemessen
  // und knapp ist (siehe der Kommentar an `max-w` weiter unten), waeren sonst
  // dauerhaft im Weg, ohne je etwas zu bewirken.
  const oeffnungsArten: Array<{ art: OeffnungsArt; text: string }> = [
    { art: 'tuer', text: t('openingDoor') },
    { art: 'doppeltuer', text: t('openingDoubleDoor') },
    { art: 'fenster', text: t('openingWindow') },
    { art: 'durchgang', text: t('openingPassage') }
  ]

  const artenKnoepfe = (
    <>
      {oeffnungsArten.map(({ art, text }) => (
        <Button
          key={art}
          size="sm"
          variant={oeffnungsArt === art ? 'default' : 'secondary'}
          onClick={() => onOeffnungsArtChange(art)}
          className={cn(isMobile && 'min-h-[44px] shadow-lg active:scale-95 transition-transform')}
          title={t('openingHint')}
          aria-label={text}
          aria-pressed={oeffnungsArt === art}
        >
          {text}
        </Button>
      ))}
    </>
  )

  // Einmal definiert, an zwei Stellen platziert — am Schreibtisch in der
  // Werkzeugzeile, am Handy in einer eigenen zweiten Zeile (Begruendung unten).
  const historienKnoepfe = (
    <>
      <Button
        size="icon"
        variant="secondary"
        onClick={onUndo}
        disabled={!canUndo}
        className={cn(isMobile && 'h-11 w-11 shadow-lg active:scale-95 transition-transform')}
        title={t('undo')}
        aria-label={t('undo')}
      >
        <Undo2 className={cn(isMobile ? 'h-5 w-5' : 'h-4 w-4')} />
      </Button>
      <Button
        size="icon"
        variant="secondary"
        onClick={onRedo}
        disabled={!canRedo}
        className={cn(isMobile && 'h-11 w-11 shadow-lg active:scale-95 transition-transform')}
        title={t('redo')}
        aria-label={t('redo')}
      >
        <Redo2 className={cn(isMobile ? 'h-5 w-5' : 'h-4 w-4')} />
      </Button>
    </>
  )

  // Ansicht (T7). "Ganze Halle zeigen" ist der wichtigste Knopf hier: die
  // Halle ist 78 m lang und passt in keinem festen Massstab ins Bild.
  const ansichtsKnoepfe = (
    <>
      <Button
        size="icon"
        variant="secondary"
        onClick={onZoomOut}
        className={cn(isMobile && 'h-11 w-11 shadow-lg active:scale-95 transition-transform')}
        title={t('zoomOut')}
        aria-label={t('zoomOut')}
      >
        <ZoomOut className={cn(isMobile ? 'h-5 w-5' : 'h-4 w-4')} />
      </Button>
      <Button
        size="icon"
        variant="secondary"
        onClick={onZoomIn}
        className={cn(isMobile && 'h-11 w-11 shadow-lg active:scale-95 transition-transform')}
        title={t('zoomIn')}
        aria-label={t('zoomIn')}
      >
        <ZoomIn className={cn(isMobile ? 'h-5 w-5' : 'h-4 w-4')} />
      </Button>
      <Button
        size="icon"
        variant="secondary"
        onClick={onFitAll}
        className={cn(isMobile && 'h-11 w-11 shadow-lg active:scale-95 transition-transform')}
        title={t('fitAll')}
        aria-label={t('fitAll')}
      >
        <Maximize2 className={cn(isMobile ? 'h-5 w-5' : 'h-4 w-4')} />
      </Button>
    </>
  )

  // Einrasten (W2). Ein SCHALTER, kein Werkzeug: er wechselt nicht, was der
  // Zeiger tut, sondern wie genau ein Zug endet. Er steht darum bei der
  // Ansicht und nicht bei Verschieben/Zeichnen/Loeschen.
  const einrastKnopf = (
    <Button
      size="icon"
      variant={einrasten ? 'default' : 'secondary'}
      onClick={() => onEinrastenChange(!einrasten)}
      className={cn(isMobile && 'h-11 w-11 shadow-lg active:scale-95 transition-transform')}
      title={t('snap')}
      aria-label={t('snap')}
      aria-pressed={einrasten}
    >
      <Magnet className={cn(isMobile ? 'h-5 w-5' : 'h-4 w-4')} />
    </Button>
  )

  const trenner = <div className="w-px self-stretch bg-border/70 mx-0.5" aria-hidden="true" />

  return (
    <div className={cn('absolute left-0 top-0 w-full z-[60] pointer-events-none', isMobile ? 'my-3 px-3' : 'my-3 px-5')}>
      {/* flex-wrap: auf schmalen Geraeten rutscht die Zeile um, statt dass
          Schaltflaechen aus dem Bild laufen (Halle 400 wird am Handy bedient). */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        {/* max-w + flex-wrap sind PFLICHT, nicht Geschmack — GEMESSEN bei 1440 px:
            der Ansichts-Umschalter (2D/3D/Axonometrie) der Kopfleiste ist mittig
            absolut positioniert und rund 296 px breit, liegt also von 532 bis
            828 px. Diese Werkzeugzeile lief bis 740 px und deckte die linke
            Kante von "Axonometrie" bereits ab; mit dem Einrast-Schalter (761 bis
            797) lag sie MITTEN darauf, und der Umschalter war nicht mehr
            ausloesbar (Playwright: "intercepts pointer events"). Die Grenze ist
            die halbe Breite minus der halben Umschalter-Breite plus Rand — ab
            rund 1700 px bleibt alles wie bisher in einer Zeile, darunter
            rutscht die Zeile um, statt etwas zu verdecken. */}
        <div
          className={cn(
            'flex flex-wrap pointer-events-auto',
            isMobile ? 'gap-1.5' : 'gap-2 max-w-[calc(50%-170px)]'
          )}
        >
          <Button
            size={isMobile ? 'icon' : 'sm'}
            variant={mode === 'move' ? 'default' : 'secondary'}
            onClick={() => onModeChange('move')}
            className={cn(
              !isMobile && 'flex items-center gap-2',
              // Mobile: 44x44px touch target with better visual feedback
              isMobile && 'h-11 w-11 shadow-lg active:scale-95 transition-transform'
            )}
            title={isMobile ? t('moveFurniture') : undefined}
            aria-label={t('moveFurniture')}
            aria-pressed={mode === 'move'}
          >
            <Move className={cn(isMobile ? 'h-5 w-5' : 'h-4 w-4')} />
            {!isMobile && t('moveFurniture')}
          </Button>
          {/* Wände verschieben (W10). Ein EIGENES Werkzeug neben dem
              Verschieben: gemessen wurde, dass derselbe Zug, mit dem man einen
              Stuhl umstellt, ohne Rückfrage die Aussenwand um 2,24 m schob und
              damit das Aufmaß aufgab. Wer Mauerwerk bewegen will, soll es
              sagen müssen. */}
          <Button
            size={isMobile ? 'icon' : 'sm'}
            variant={mode === 'wand' ? 'default' : 'secondary'}
            onClick={() => onModeChange('wand')}
            className={cn(
              !isMobile && 'flex items-center gap-2',
              isMobile && 'h-11 w-11 shadow-lg active:scale-95 transition-transform'
            )}
            title={isMobile ? t('moveWalls') : undefined}
            aria-label={t('moveWalls')}
            aria-pressed={mode === 'wand'}
          >
            <MoveDiagonal className={cn(isMobile ? 'h-5 w-5' : 'h-4 w-4')} />
            {!isMobile && t('moveWalls')}
          </Button>
          <Button
            size={isMobile ? 'icon' : 'sm'}
            variant={mode === 'draw' ? 'default' : 'secondary'}
            onClick={() => onModeChange('draw')}
            className={cn(
              !isMobile && 'flex items-center gap-2',
              isMobile && 'h-11 w-11 shadow-lg active:scale-95 transition-transform'
            )}
            title={isMobile ? t('drawWalls') : undefined}
            aria-label={t('drawWalls')}
            aria-pressed={mode === 'draw'}
          >
            <Pencil className={cn(isMobile ? 'h-5 w-5' : 'h-4 w-4')} />
            {!isMobile && t('drawWalls')}
          </Button>
          <Button
            size={isMobile ? 'icon' : 'sm'}
            variant={mode === 'delete' ? 'default' : 'secondary'}
            onClick={() => onModeChange('delete')}
            className={cn(
              !isMobile && 'flex items-center gap-2',
              isMobile && 'h-11 w-11 shadow-lg active:scale-95 transition-transform'
            )}
            title={isMobile ? t('deleteWalls') : undefined}
            aria-label={t('deleteWalls')}
            aria-pressed={mode === 'delete'}
          >
            <Trash2 className={cn(isMobile ? 'h-5 w-5' : 'h-4 w-4')} />
            {!isMobile && t('deleteWalls')}
          </Button>
          {/* Türen & Fenster (W4). Ein EIGENES Werkzeug neben Verschieben,
              Zeichnen und Löschen: der Zeiger tut hier etwas anderes — er
              bietet eine Öffnung auf der nächsten Wand an, statt zu greifen. */}
          <Button
            size={isMobile ? 'icon' : 'sm'}
            variant={mode === 'oeffnung' ? 'default' : 'secondary'}
            onClick={() => onModeChange('oeffnung')}
            className={cn(
              !isMobile && 'flex items-center gap-2',
              isMobile && 'h-11 w-11 shadow-lg active:scale-95 transition-transform'
            )}
            title={t('openingHint')}
            aria-label={t('openings')}
            aria-pressed={mode === 'oeffnung'}
          >
            <DoorOpen className={cn(isMobile ? 'h-5 w-5' : 'h-4 w-4')} />
            {!isMobile && t('openings')}
          </Button>
          {/* Der Einrast-Schalter steht bei den WERKZEUGEN und nicht bei der
              Ansicht: er aendert, wie ein Zug im Verschieben-Werkzeug endet —
              er gehoert zum Bearbeiten, nicht zum Hinsehen. Ohne eigenen
              Trennstrich, damit er beim Umbruch mit seiner Gruppe wandert. */}
          {einrastKnopf}

          {/* Am Schreibtisch direkt neben den Werkzeugen, getrennt durch einen
              Strich: Rueckgaengig/Wiederholen sind keine Werkzeuge, sondern
              wirken AUF das mit den Werkzeugen Gebaute. */}
          {!isMobile && (
            <>
              {trenner}
              {historienKnoepfe}
              {trenner}
              {ansichtsKnoepfe}
            </>
          )}
        </div>

        <Button
          size={isMobile ? 'sm' : 'sm'}
          variant="default"
          onClick={onDone}
          className={cn(
            'font-medium pointer-events-auto',
            isMobile && 'shadow-lg min-h-[44px] active:scale-95 transition-transform px-4'
          )}
          aria-label={t('done')}
        >
          {isMobile ? (
            <>
              <Check className="h-4 w-4 mr-1.5" />
              <span className="font-medium">{t('done')}</span>
            </>
          ) : (
            <>{t('done')} &raquo;</>
          )}
        </Button>
      </div>

      {/* Am Handy eine EIGENE zweite Zeile. Nicht Geschmack, sondern
          Notwendigkeit: der 2D/3D-Umschalter der Kopfleiste ist mittig
          absolut positioniert und liegt mit z-[100] UEBER dieser Leiste
          (z-[60]) — bei 390 px verdeckte er die beiden Pfeile vollstaendig,
          sie waeren am Handy nicht ausloesbar gewesen. Die zweite Zeile
          liegt unter dem Umschalter und bleibt frei. */}
      {isMobile && (
        <div className="mt-2 flex w-fit items-center gap-1.5 pointer-events-auto">
          {historienKnoepfe}
          {trenner}
          {ansichtsKnoepfe}
        </div>
      )}

      {/* Die Arten der Öffnung in einer EIGENEN Zeile — an beiden Geräten.
          Sie gehören nicht in die Werkzeugzeile: die ist bei 1440 px bereits
          bis an die gemessene Grenze gefüllt (siehe `max-w` oben), und vier
          weitere Schaltflächen lägen dort auf dem Ansichts-Umschalter. */}
      {mode === 'oeffnung' && (
        <div className="mt-2 flex w-fit flex-wrap items-center gap-1.5 pointer-events-auto">
          {artenKnoepfe}
        </div>
      )}
    </div>
  )
}
