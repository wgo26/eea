'use client'

import { useSyncExternalStore } from 'react'
import { Moon, Sun } from 'lucide-react'
import {
  applyTheme,
  isExplicitTheme,
  readThemeSource,
  resolveAutomaticTheme,
  THEME_ORDER,
  THEME_STORAGE_KEY,
  type Theme,
} from '@/lib/theme'
import type { ChromeStrings } from '@/lib/i18n/chrome'

/**
 * The persisted theme is an external store (localStorage + cookie + prefers-color-scheme),
 * so it is read with useSyncExternalStore instead of being mirrored into React
 * state inside an effect (rejected by react-hooks/set-state-in-effect).
 * As in language-switcher.tsx, DOM side effects live at module scope.
 *
 * Only light/dark are user-selectable. When nothing is stored (or a legacy
 * "system" value remains), the toggle follows the OS preference automatically.
 */

let snapshot: Theme | null = null
const listeners = new Set<() => void>()

/** Reads the persisted theme from localStorage, falling back to the OS preference when unset. */
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

/** Reads the theme cookie on the server (via initial script) for SSR hydration match. */
function getServerSnapshot(): Theme {
  if (typeof window === "undefined") return "light"
  try {
    const cookie = document.cookie.split("; ").find((c) => c.startsWith("eea-theme="))?.split("=")[1]
    const fromCookie = readThemeSource(cookie)
    if (fromCookie) return fromCookie
    return resolveAutomaticTheme()
  } catch {
    return "light"
  }
}

/** Persists the theme to localStorage + cookie, applies it to <html> and notifies every mounted toggle. */
function writeTheme(next: Theme) {
  snapshot = next
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next)
    document.cookie = `eea-theme=${next}; max-age=31536000; path=/; SameSite=Lax`
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
      snapshot = null
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

/**
 * A2: the theme labels arrive as a prop from the server-rendered shell so
 * this every-page island never imports the full dictionary into the bundle.
 */
export function ThemeToggle({ labels }: { labels: ChromeStrings['theme'] }) {
  const t = labels
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
      className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-lens"
    >
      <Icon className="h-[18px] w-[18px]" aria-hidden />
    </button>
  )
}