'use client'

import { useSyncExternalStore } from 'react'
import { Moon, Sun } from 'lucide-react'
import {
  applyTheme,
  isExplicitTheme,
  resolveAutomaticTheme,
  THEME_ORDER,
  THEME_STORAGE_KEY,
  type Theme,
} from '@/lib/theme'
import { getDictionary, type Locale } from '@/lib/i18n'

/**
 * The persisted theme is an external store (localStorage + prefers-color-scheme),
 * so it is read with useSyncExternalStore instead of being mirrored into React
 * state inside an effect (rejected by react-hooks/set-state-in-effect).
 * As in language-switcher.tsx, DOM side effects live at module scope.
 *
 * Only light/dark are user-selectable. When nothing is stored (or a legacy
 * "system" value remains), the toggle follows the OS preference automatically.
 */

/** In-memory mirror of the persisted theme, keeping the UI consistent even when storage is unavailable. */
let snapshot: Theme | null = null
const listeners = new Set<() => void>()

/** Reads the persisted theme, falling back to the OS preference when unset or storage is unavailable. */
function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (isExplicitTheme(stored)) return stored
    return resolveAutomaticTheme()
  } catch {
    return resolveAutomaticTheme()
  }
}

function getSnapshot(): Theme {
  return snapshot ?? readStoredTheme()
}

/** Matches the pre-paint script's resolution so the server HTML and hydration agree. */
function getServerSnapshot(): Theme {
  return 'light'
}

/** Persists the theme, applies it to <html> and notifies every mounted toggle. */
function writeTheme(next: Theme) {
  snapshot = next
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next)
  } catch {
    // Storage unavailable (e.g. private mode) — the in-memory theme still applies.
  }
  applyTheme(next)
  for (const listener of listeners) listener()
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  snapshot = readStoredTheme()
  applyTheme(snapshot)

  // While no explicit choice is stored, follow OS preference changes live.
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const onSystemChange = () => {
    let stored: string | null = null
    try {
      stored = localStorage.getItem(THEME_STORAGE_KEY)
    } catch {
      // Storage unavailable — treat as automatic.
    }
    if (!isExplicitTheme(stored)) {
      snapshot = null // force re-resolution from the OS preference
      applyTheme(resolveAutomaticTheme())
      for (const listener of listeners) listener()
    }
  }

  // Follow theme changes made in other tabs.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== THEME_STORAGE_KEY) return
    const next = readStoredTheme()
    if (next !== getSnapshot()) writeTheme(next)
  }

  mq.addEventListener('change', onSystemChange)
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(onChange)
    mq.removeEventListener('change', onSystemChange)
    window.removeEventListener('storage', onStorage)
  }
}

export function ThemeToggle({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).theme
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  function cycle() {
    writeTheme(THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length])
  }

  const Icon = theme === 'light' ? Sun : Moon
  const label = `${t.label}: ${theme === 'light' ? t.light : t.dark}`

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icon className="h-[18px] w-[18px]" aria-hidden />
    </button>
  )
}
