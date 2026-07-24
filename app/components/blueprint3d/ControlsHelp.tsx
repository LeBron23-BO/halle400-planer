'use client'

import { useState } from 'react'
import { HelpCircle, X, Hand, Move, ZoomIn, RotateCw, MousePointer2, Pencil, Trash2 } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/use-media-query"

interface ControlsHelpProps {
  className?: string
  viewMode?: '2d' | '3d'
}

/**
 * Persistent floating help button showing control hints
 * Always visible in bottom-right corner
 */
export function ControlsHelp({ className, viewMode = '3d' }: ControlsHelpProps) {
  const [isOpen, setIsOpen] = useState(false)
  const isMobile = useIsMobile()

  const toggleHelp = () => {
    setIsOpen(!isOpen)
  }

  return (
    <>
      {/* Floating Help Button */}
      <Button
        onClick={toggleHelp}
        className={cn(
          'fixed bottom-5 right-5 z-[80] rounded-full shadow-lg',
          'hover:scale-110 transition-transform duration-200',
          isMobile ? 'h-14 w-14' : 'h-12 w-12',
          className
        )}
        variant="default"
        size="icon"
        aria-label="Show controls help"
      >
        <HelpCircle className={cn(isMobile ? 'h-7 w-7' : 'h-6 w-6')} />
      </Button>

      {/* Help Modal */}
      {isOpen && (
        <div
          className={cn(
            'fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm',
            'animate-in fade-in duration-300'
          )}
          onClick={toggleHelp}
        >
          <div
            className={cn(
              'relative max-w-md w-full mx-4 bg-card rounded-lg shadow-2xl',
              'animate-in zoom-in-95 duration-300',
              isMobile ? 'max-h-[80vh] overflow-y-auto' : ''
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className={cn('font-semibold', isMobile ? 'text-xl' : 'text-lg')}>
                {viewMode === '2d' ? 'Bedienung des 2D-Grundrisses' : 'Bedienung der 3D-Ansicht'}
              </h2>
              <Button
                onClick={toggleHelp}
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Content */}
            <div className={cn('p-6 space-y-6', isMobile ? 'text-base' : 'text-sm')}>
              {viewMode === '2d' ? (
                <>
                  {/* 2D Floorplanner Controls */}
                  <div className="space-y-4">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Move className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-medium mb-1">Bewegen</h3>
                        <p className="text-muted-foreground text-sm">
                          Wände oder Ecken anklicken und ziehen, um den Raumzuschnitt zu ändern
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Pencil className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-medium mb-1">Zeichnen</h3>
                        <p className="text-muted-foreground text-sm">
                          Klicken setzt neue Wandpunkte. Mit ESC das Zeichnen beenden.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Trash2 className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-medium mb-1">Löschen</h3>
                        <p className="text-muted-foreground text-sm">
                          Wände oder Ecken anklicken, um sie zu entfernen
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <ZoomIn className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-medium mb-1">Zoomen und Verschieben</h3>
                        <p className="text-muted-foreground text-sm">
                          {isMobile ? 'Auf- und zuziehen zum Zoomen, mit zwei Fingern ziehen verschiebt den Ausschnitt' : 'Mausrad zoomt, Ziehen mit der mittleren Maustaste verschiebt den Ausschnitt'}
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* 3D Viewer Controls */}
                  {isMobile ? (
                    <div className="space-y-4">
                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Hand className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-medium mb-1">Ein Finger</h3>
                          <p className="text-muted-foreground text-sm">
                            Ziehen dreht die Ansicht um die Szene
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <ZoomIn className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-medium mb-1">Zwei Finger</h3>
                          <p className="text-muted-foreground text-sm">
                            Auf- und zuziehen vergrößert und verkleinert
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Move className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-medium mb-1">Drei Finger</h3>
                          <p className="text-muted-foreground text-sm">
                            Ziehen verschiebt den Bildausschnitt
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <MousePointer2 className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-medium mb-1">Möbel antippen</h3>
                          <p className="text-muted-foreground text-sm">
                            Möbel auswählen, um es zu verschieben, zu drehen oder zu löschen
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <RotateCw className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-medium mb-1">Linke Maustaste + ziehen</h3>
                          <p className="text-muted-foreground">
                            Dreht die Ansicht um die Szene
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <ZoomIn className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-medium mb-1">Mausrad</h3>
                          <p className="text-muted-foreground">
                            Scrollen vergrößert und verkleinert
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Move className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-medium mb-1">Rechte Maustaste + ziehen</h3>
                          <p className="text-muted-foreground">
                            Verschiebt den Bildausschnitt
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <MousePointer2 className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-medium mb-1">Möbel anklicken</h3>
                          <p className="text-muted-foreground">
                            Möbel auswählen, um es zu verschieben, zu drehen oder zu löschen
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Footer Tip */}
              <div className="pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground text-center">
                  {viewMode === '2d'
                    ? 'Tipp: Am Ende auf „Fertig" klicken, um in die 3D-Ansicht zu wechseln'
                    : 'Tipp: Oben mittig lässt sich zwischen 2D und 3D umschalten'
                  }
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
