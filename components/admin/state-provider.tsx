'use client'

import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react'
import type { StateTone } from '@/lib/platform/state-presentation'

/**
 * Spec §30 — State → Semantic Tokens → Design System → Components.
 *
 * The admin layout resolves the effective state server-side (one DB read per
 * request) and hands the resolved values here; this component is the single
 * place a state becomes a DOM fact. It does three things:
 *
 *   1. writes the state's token overrides as CSS custom properties on the
 *      shell, so every component consumes them through the ordinary design
 *      system (`bg-primary`, `ring-ring`, …) with no state-aware code;
 *   2. publishes `data-system-state` for state-scoped CSS and context for
 *      client components that must react to the state (no prop drilling);
 *   3. resolves reduced motion (spec §25/§32) as the OR of the state's own
 *      profile and the visitor's OS preference, so a critical-mode shell stays
 *      motionless even for a visitor who never set the preference.
 *
 * Client component only because of (3): the OS preference is a live media
 * query, not something the server can know.
 */

export type SystemStateValue = {
  /** Registry id, e.g. `CRITICAL` — the stable identity. */
  id: string
  /** Localized, human name (never the DB `name` column). */
  name: string
  tone: StateTone
  /** Explicit accessible status line (spec §21/§33). */
  statusLabel: string
  /** Where to inspect the state — omitted when the viewer cannot act on it. */
  href?: string
}

const SystemStateContext = createContext<SystemStateValue | null>(null)

/** The active state, or null outside the admin shell. */
export function useSystemState(): SystemStateValue | null {
  return useContext(SystemStateContext)
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function subscribeToReducedMotion(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const query = window.matchMedia(REDUCED_MOTION_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function getReducedMotionSnapshot(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(REDUCED_MOTION_QUERY).matches
    : false
}

function usePrefersReducedMotion(): boolean {
  // Both functions are module-level constants, so the store subscription is
  // stable across renders without a memo wrapper. The server snapshot is
  // `false`; hydration corrects it in a passive effect, so the markup never
  // disagrees with itself.
  return useSyncExternalStore(subscribeToReducedMotion, getReducedMotionSnapshot, () => false)
}

export function SystemStateProvider({
  state,
  tokens,
  reduceMotion,
  className,
  children,
}: {
  state: SystemStateValue
  /** Semantic-token overrides from the state's visual profile. */
  tokens: Record<string, string>
  /** True when the state's own profile calls for reduced motion (spec §25). */
  reduceMotion: boolean
  className?: string
  children: ReactNode
}) {
  const preferred = usePrefersReducedMotion()
  const motionReduced = reduceMotion || preferred
  const style = tokens as React.CSSProperties

  return (
    <SystemStateContext.Provider value={state}>
      <div
        className={className}
        data-system-state={state.id}
        data-state-motion={motionReduced ? 'reduced' : undefined}
        style={style}
      >
        {children}
      </div>
    </SystemStateContext.Provider>
  )
}
