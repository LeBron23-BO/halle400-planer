'use client'

import { useState, useEffect } from 'react'
import { X, Hand, Move, ZoomIn, RotateCw } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface TouchHelpProps {
  className?: string
}

/**
 * Mobile touch gesture help overlay
 * Shows helpful hints about touch controls on first visit
 */
export function TouchHelp({ className }: TouchHelpProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)

  useEffect(() => {
    // Check if user has already seen this
    const hasSeenHelp = localStorage.getItem('blueprint3d-touch-help-seen')

    // Only show on mobile devices and if not previously dismissed
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

    if (isMobile && !hasSeenHelp && !isDismissed) {
      // Show after a short delay
      const timer = setTimeout(() => {
        setIsVisible(true)
      }, 1000)

      return () => clearTimeout(timer)
    }
  }, [isDismissed])

  const handleDismiss = () => {
    setIsVisible(false)
    setIsDismissed(true)
    localStorage.setItem('blueprint3d-touch-help-seen', 'true')
  }

  if (!isVisible) return null

  return (
    <div
      className={cn(
        'absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm',
        'animate-in fade-in duration-300',
        className
      )}
      onClick={handleDismiss}
    >
      <div
        className="relative max-w-sm mx-4 p-6 bg-card rounded-lg shadow-2xl border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2"
          onClick={handleDismiss}
        >
          <X className="h-4 w-4" />
        </Button>

        <h3 className="text-lg font-semibold text-foreground mb-4">Bedienung per Finger</h3>

        <div className="space-y-4 text-sm text-muted-foreground">
          <div className="flex items-start gap-3">
            <div className="mt-1 p-2 rounded-full bg-primary/10">
              <Hand className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium text-foreground">Ein Finger</p>
              <p>Tippen zum Auswählen, ziehen zum Verschieben von Möbeln</p>
              <p className="text-xs mt-1">Wischen dreht die Ansicht</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="mt-1 p-2 rounded-full bg-primary/10">
              <ZoomIn className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium text-foreground">Zwei Finger</p>
              <p>Auf- und zuziehen zum Vergrößern und Verkleinern</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="mt-1 p-2 rounded-full bg-primary/10">
              <RotateCw className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium text-foreground">Möbel drehen</p>
              <p>Auf den Drehpfeil tippen, dann ziehen</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="mt-1 p-2 rounded-full bg-primary/10">
              <Move className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium text-foreground">Drei Finger</p>
              <p>Ziehen verschiebt den Bildausschnitt</p>
            </div>
          </div>
        </div>

        <Button className="w-full mt-6" onClick={handleDismiss}>
          Verstanden
        </Button>
      </div>
    </div>
  )
}
