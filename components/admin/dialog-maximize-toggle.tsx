'use client'

import { Maximize2, Minimize2 } from 'lucide-react'

/**
 * Header corner affordance for the wide editorial dialogs (Phase C): toggles
 * the parent DialogContent between the docked `sm:max-w-3xl` shell and a
 * near-viewport workspace for long articles, translations and dense media.
 * Rendered inside the sticky header, away from the popup's built-in close
 * button, so both stay clickable in either size.
 */
export function DialogMaximizeToggle({
  maximized,
  onToggle,
  labels,
}: {
  maximized: boolean
  onToggle: () => void
  labels: { maximize: string; minimize: string }
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={maximized}
      aria-label={maximized ? labels.minimize : labels.maximize}
      title={maximized ? labels.minimize : labels.maximize}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {maximized ? <Minimize2 className="h-4 w-4" aria-hidden /> : <Maximize2 className="h-4 w-4" aria-hidden />}
    </button>
  )
}

/**
 * Editor / live-preview switcher for the content dialogs (Phase C). Lives in
 * the sticky header so the switch is always reachable while scrolling the
 * form — the underlying <form> stays mounted in both tabs, so switching never
 * drops unsaved values and the sticky action dock keeps working.
 */
export function DialogTabSwitcher({
  tab,
  onTabChange,
  labels,
}: {
  tab: 'editor' | 'preview'
  onTabChange: (tab: 'editor' | 'preview') => void
  labels: { editor: string; preview: string }
}) {
  const base =
    'inline-flex h-7 items-center rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
  const active = 'bg-primary text-primary-foreground'
  const idle = 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
  return (
    <div className="flex items-center gap-1 rounded-md bg-muted/60 p-0.5" role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'editor'}
        onClick={() => onTabChange('editor')}
        className={`${base} ${tab === 'editor' ? active : idle}`}
      >
        {labels.editor}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'preview'}
        onClick={() => onTabChange('preview')}
        className={`${base} ${tab === 'preview' ? active : idle}`}
      >
        {labels.preview}
      </button>
    </div>
  )
}
