'use client'

import type { LoeschZiel } from '@blueprint3d/floorplanner/floorplanner'

/**
 * Rückfrage vor dem Löschen (E1).
 *
 * Warum überhaupt eine Rückfrage: Vor E1 löschte ein Klick im Löschen-Werkzeug
 * SOFORT. Ein Griff daneben — die Greifzone ist 8 px breit — und eine Wand war
 * weg, ohne dass jemand sah, welche. Die Historie rettete zwar die Daten, aber
 * nur, wenn man den Fehler überhaupt bemerkte.
 *
 * Warum kein `window.confirm`: der blockiert den Ereignis-Umlauf (die Ansicht
 * kann die rote Hervorhebung dann gar nicht mehr zeichnen — man bestätigt also
 * blind), sieht auf jedem Gerät anders aus und ist am Handy ein Fremdkörper.
 *
 * Die Rückfrage liegt bewusst UNTEN MITTIG und nicht am Zeiger: am Zeiger
 * verdeckte sie genau das Objekt, über das sie eine Auskunft verlangt.
 */
export function LoeschRueckfrage({
  ziel,
  onBestaetigen,
  onAbbrechen
}: {
  ziel: LoeschZiel | null
  onBestaetigen: () => void
  onAbbrechen: () => void
}) {
  if (!ziel) {
    return null
  }

  return (
    <div
      className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[80] max-w-[92vw]"
      role="alertdialog"
      aria-live="assertive"
      aria-label="Löschen bestätigen"
    >
      <div className="flex flex-col gap-3 rounded-lg border border-red-300 bg-white/95 px-4 py-3 shadow-lg backdrop-blur-sm sm:flex-row sm:items-center sm:gap-4">
        <span className="text-sm text-neutral-800">
          <span className="font-medium text-red-600">Entfernen:</span> {ziel.beschreibung}?
        </span>
        <div className="flex shrink-0 gap-2">
          {/* Abbrechen steht zuerst und ist die ruhige Variante: die
              gefährliche Wahl darf nicht die bequemste sein. */}
          <button
            type="button"
            onClick={onAbbrechen}
            className="min-h-[44px] rounded-md border border-neutral-300 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={onBestaetigen}
            autoFocus
            className="min-h-[44px] rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Entfernen
          </button>
        </div>
      </div>
      <p className="mt-1 text-center text-xs text-neutral-500">
        Rückgängig mit Strg+Z · Abbrechen mit Esc
      </p>
    </div>
  )
}
