'use client'

/**
 * Admin shell chrome preferences (Phase A/B) as an external store backed by
 * localStorage, consumed through `useSyncExternalStore`.
 *
 * This deliberately is not `useState` + a hydration effect: syncing a stored
 * preference in an effect cascades a second render on every mount (and the
 * `react-hooks/set-state-in-effect` gate rejects it). Treating localStorage as
 * the store instead means the server snapshot is always the default, the
 * client snapshot is read during render, and React reconciles the two without
 * an extra pass — the same shape `state-provider.tsx` uses for the reduced-
 * motion media query.
 *
 * Because both the sidebar and the topbar subscribe to the same store (no
 * context provider), the rail toggle in the topbar drives the sidebar width
 * directly, and a second tab stays in sync via the `storage` event.
 */

import { useCallback, useSyncExternalStore } from 'react'

export const SIDEBAR_RAIL_KEY = 'eea-admin-sidebar-rail'
export const SIDEBAR_GROUPS_KEY = 'eea-admin-sidebar-groups'
export const TABLE_DENSITY_KEY = 'eea-admin-table-density'
export const SIDEBAR_RECENTS_KEY = 'eea-admin-sidebar-recents'

type Persisted<T> = {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => T
  getServerSnapshot: () => T
  set: (value: T) => void
}

function persisted<T>(
  key: string,
  fallback: T,
  parse: (raw: string) => T,
  serialize: (value: T) => string,
): Persisted<T> {
  const listeners = new Set<() => void>()
  // Cache keyed on the raw string so getSnapshot returns an identical value
  // between renders while nothing changed — a new array every call would make
  // useSyncExternalStore loop forever.
  let cacheRaw: string | null | undefined
  let cacheValue: T = fallback

  function read(): T {
    if (typeof window === 'undefined') return fallback
    let raw: string | null
    try {
      raw = window.localStorage.getItem(key)
    } catch {
      return fallback
    }
    if (raw === cacheRaw) return cacheValue
    cacheRaw = raw
    cacheValue = raw === null ? fallback : parse(raw)
    return cacheValue
  }

  function emit() {
    for (const listener of listeners) listener()
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      const onStorage = (event: StorageEvent) => {
        if (event.key === null || event.key === key) {
          cacheRaw = undefined
          emit()
        }
      }
      window.addEventListener('storage', onStorage)
      return () => {
        listeners.delete(listener)
        window.removeEventListener('storage', onStorage)
      }
    },
    getSnapshot: read,
    // Stable identity matters only for the first paint: the server always
    // renders the default (expanded sidebar, nothing collapsed).
    getServerSnapshot: () => fallback,
    set(value) {
      try {
        window.localStorage.setItem(key, serialize(value))
      } catch {
        /* private mode / disabled storage — the session still gets the change */
      }
      cacheRaw = undefined
      read()
      emit()
    },
  }
}

const railStore = persisted<boolean>(
  SIDEBAR_RAIL_KEY,
  false,
  (raw) => raw === 'true',
  String,
)

const domainsStore = persisted<string[]>(
  SIDEBAR_GROUPS_KEY,
  [],
  (raw) => {
    try {
      const parsed: unknown = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
    } catch {
      return []
    }
  },
  JSON.stringify,
)

/** Icon-only rail preference, shared by the sidebar and the topbar toggle. */
export function useSidebarRail(): { rail: boolean; toggleRail: () => void } {
  const rail = useSyncExternalStore(railStore.subscribe, railStore.getSnapshot, railStore.getServerSnapshot)
  const toggleRail = useCallback(() => railStore.set(!railStore.getSnapshot()), [])
  return { rail, toggleRail }
}

/**
 * Table row density (Phase D): `comfortable` is the default; `compact` fits
 * more rows on screen for dense ops tables. It only drives vertical padding
 * through CSS (the `data-table-density` attribute on the shell) — type size
 * never shrinks, so the 12px legibility floor (find-tiny-text.mjs) always
 * holds. Shared across the admin area through one store, not per-page state.
 */
export type TableDensity = 'comfortable' | 'compact'

const densityStore = persisted<TableDensity>(
  TABLE_DENSITY_KEY,
  'comfortable',
  (raw) => (raw === 'compact' ? 'compact' : 'comfortable'),
  String,
)

export function useTableDensity(): { density: TableDensity; setDensity: (d: TableDensity) => void } {
  const density = useSyncExternalStore(
    densityStore.subscribe,
    densityStore.getSnapshot,
    densityStore.getServerSnapshot,
  )
  const setDensity = useCallback((next: TableDensity) => densityStore.set(next), [])
  return { density, setDensity }
}

/** Domains the staff member collapsed in the sidebar (expanded is the default). */
export function useCollapsedDomains(): {
  collapsed: string[]
  toggleDomain: (domain: string) => void
} {
  const collapsed = useSyncExternalStore(
    domainsStore.subscribe,
    domainsStore.getSnapshot,
    domainsStore.getServerSnapshot,
  )
  const toggleDomain = useCallback((domain: string) => {
    const current = domainsStore.getSnapshot()
    domainsStore.set(
      current.includes(domain) ? current.filter((d) => d !== domain) : [...current, domain],
    )
  }, [])
  return { collapsed, toggleDomain }
}

/**
 * Quick Recents (Phase A): the most-recently visited admin destinations,
 * keyed by the locale-free canonical path. Resolving label/href/icon happens
 * against the *current* nav at render time, so switching language, roles, or
 * revoking a capability never shows a stale or unauthorized entry.
 */
const RECENTS_LIMIT = 6

const recentsStore = persisted<string[]>(
  SIDEBAR_RECENTS_KEY,
  [],
  (raw) => {
    try {
      const parsed: unknown = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
    } catch {
      return []
    }
  },
  JSON.stringify,
)

export function useRecentPaths(): { paths: string[]; pushPath: (path: string) => void } {
  const paths = useSyncExternalStore(
    recentsStore.subscribe,
    recentsStore.getSnapshot,
    recentsStore.getServerSnapshot,
  )
  // Deduping + capping happen at write time: getSnapshot must stay a stable
  // pure read, or useSyncExternalStore would loop.
  const pushPath = useCallback((path: string) => {
    recentsStore.set([path, ...recentsStore.getSnapshot().filter((p) => p !== path)].slice(0, RECENTS_LIMIT))
  }, [])
  return { paths, pushPath }
}
