'use client'

import { Settings } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getDictionary } from '@/lib/i18n'
import { getChromeStrings } from '@/lib/i18n/chrome'
import { useLocaleFromPath } from '@/components/site-header'
import { LanguageSwitcher } from '@/components/language-switcher'
import { ThemeToggle } from '@/components/theme-toggle'
import { cn } from '@/lib/utils'
import { useTableDensity, type TableDensity } from './nav-preferences'

/**
 * Appearance, language and density behind one control (AppShell).
 *
 * The shell previously carried a single icon button that flipped table density
 * with no visible state and nothing to say beside it — and it was the ONLY
 * preference in the admin chrome. An operator who wanted dark mode at 2am could
 * not get it, because `ThemeToggle` only ever shipped in the public header, and
 * a French staffer routed into an English admin page had no way back to French,
 * because `LanguageSwitcher` likewise lived only in public chrome.
 *
 * Both are REUSED rather than reimplemented. The theme control writes the same
 * `eea-theme` key the pre-paint script and the public header read, so signing out
 * to the site keeps your appearance; the switcher rewrites the locale segment of
 * the current path in place, so changing language mid-task keeps you on the same
 * admin screen with your filters intact (checklist items 1 + 12). Duplicating
 * either store in the shell is how the two halves of one product disagree.
 */

export function AdminPreferences() {
  const locale = useLocaleFromPath()
  const dict = getDictionary(locale)
  const chrome = getChromeStrings(locale)
  const topbar = dict.admin.topbar
  const common = dict.admin.common
  const { density, setDensity } = useTableDensity()

  const densityOption = (value: TableDensity, label: string) => (
    <button
      type="button"
      onClick={() => setDensity(value)}
      aria-pressed={density === value}
      className={cn(
        'flex w-full items-center rounded-sm px-2 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        density === value
          ? 'bg-accent font-medium text-accent-foreground'
          : 'font-medium text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground',
      )}
    >
      {label}
    </button>
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={topbar.preferences}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Settings className="h-4 w-4" aria-hidden />
          </button>
        }
      />
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>{topbar.appearance}</DropdownMenuLabel>
        <div className="flex items-center justify-between gap-2 px-2 pb-1.5">
          {/* Reused verbatim: it is a labelled, self-describing cycle control
              (aria-label carries the current value), not a bare icon. */}
          <span className="text-sm text-muted-foreground">{chrome.theme.label}</span>
          <ThemeToggle labels={chrome.theme} />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{topbar.language}</DropdownMenuLabel>
        <div className="px-2 pb-1.5">
          <LanguageSwitcher locale={locale} />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{common.density}</DropdownMenuLabel>
        <div className="px-1 pb-1">
          {densityOption('comfortable', common.densityComfortable)}
          {densityOption('compact', common.densityCompact)}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
