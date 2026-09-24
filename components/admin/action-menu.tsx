'use client'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

export type ActionMenuItem = {
  label: string
  onSelect: () => void
  tone?: 'default' | 'danger'
  disabled?: boolean
}

export type ActionMenuSeparator = { separator: true }

export type ActionMenuEntry = ActionMenuItem | ActionMenuSeparator

/**
 * Shared admin row-action dropdown. Replaces the hand-rolled
 * `fixed inset-0 z-40` overlay menus in content-actions.tsx and
 * user-actions.tsx. Uses the Base UI Menu primitive so it gets keyboard nav,
 * focus trap, aria-haspopup/aria-controls, and Escape-to-close for free.
 *
 * Two Base UI contracts this file depends on (both silently broken if ignored,
 * which is exactly what happened here — the button rendered but did nothing):
 *
 *  1. `render` CLONES the element with the trigger's own props (`id`,
 *     `aria-controls`, `aria-haspopup`, `onMouseDown`/`onClick`/`onKeyDown`,
 *     `data-popup-open`, `ref`). The element must therefore forward every prop
 *     to its DOM node — see `ActionMenuTrigger`. Never also pass the element as
 *     `children`: that duplicates/nests it.
 *  2. Items activate through `onClick` (`closeOnClick` defaults to `true`).
 *     `onSelect` is a Radix-ism that Base UI spreads onto the item `div` as an
 *     unmapped DOM prop, so it never fires.
 */
export function ActionMenu({
  trigger,
  items,
  align = 'end',
  className,
}: {
  /** Trigger element — must forward props (e.g. `<ActionMenuTrigger />`). */
  trigger: React.ReactElement
  items: ActionMenuEntry[]
  align?: 'start' | 'center' | 'end'
  className?: string
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent align={align} className={cn('w-48', className)}>
        {items.map((entry, i) => {
          if ('separator' in entry) {
            return <DropdownMenuSeparator key={`sep-${i}`} />
          }
          return (
            <DropdownMenuItem
              key={entry.label}
              onClick={entry.onSelect}
              disabled={entry.disabled}
              className={cn(
                entry.tone === 'danger' && 'text-destructive focus:text-destructive',
              )}
            >
              {entry.label}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Standard "three dots" trigger button.
 *
 * Used as the `render` target of `DropdownMenuTrigger`, which merges the
 * trigger's props (handlers, id/aria, `data-popup-open`, ref) onto this
 * element — so every prop must be spread onto the `<button>`. Same contract as
 * `components/ui/button.tsx`; a version that only reads `label` compiles and
 * renders, but the menu never opens.
 */
export function ActionMenuTrigger({
  label = 'Actions',
  className,
  ref,
  ...props
}: React.ComponentPropsWithRef<'button'> & { label?: string }) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground transition-colors',
        className,
      )}
      aria-label={label}
      {...props}
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
      </svg>
    </button>
  )
}
