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
 * user-actions.tsx. Uses the Radix DropdownMenu primitive so it
 * gets keyboard nav, focus trap, aria-expanded, and Escape-to-close
 * for free.
 */
export function ActionMenu({
  trigger,
  items,
  align = 'end',
  className,
}: {
  trigger: React.ReactNode
  items: ActionMenuEntry[]
  align?: 'start' | 'center' | 'end'
  className?: string
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className={cn('w-48', className)}>
        {items.map((entry, i) => {
          if ('separator' in entry) {
            return <DropdownMenuSeparator key={`sep-${i}`} />
          }
          return (
            <DropdownMenuItem
              key={entry.label}
              onSelect={(e) => {
                e.preventDefault()
                entry.onSelect()
              }}
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

/** Standard "three dots" trigger button */
export function ActionMenuTrigger({ label = 'Actions' }: { label?: string }) {
  return (
    <button
      type="button"
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      aria-label={label}
      aria-haspopup="menu"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
      </svg>
    </button>
  )
}
