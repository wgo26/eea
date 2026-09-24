import type { StateTone } from './state-engine'

export type { StateTone }

/**
 * Tone → utility classes for state surfaces. Kept out of the (server-only)
 * engine so the admin topbar pill and the server-rendered banner share one
 * mapping, and out of the components so both render identically (spec §25:
 * the visual language creates focus, not panic — tones are restrained, the
 * banner carries the explicit information).
 */
export type StateToneClasses = {
  /** Topbar pill: quiet at rest, tinted by severity. */
  pill: string
  /** Status dot inside the pill. */
  dot: string
  /** Banner container: border + surface. */
  banner: string
  /** Banner heading colour. */
  heading: string
}

const TONE_CLASSES: Record<StateTone, StateToneClasses> = {
  normal: {
    pill: 'bg-muted text-muted-foreground hover:bg-accent',
    dot: 'bg-emerald-500',
    banner: 'border-border bg-card',
    heading: 'text-foreground',
  },
  info: {
    pill: 'bg-sky-100 text-sky-900 hover:bg-sky-200 dark:bg-sky-950 dark:text-sky-100',
    dot: 'bg-sky-500',
    banner: 'border-sky-300 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/40',
    heading: 'text-sky-950 dark:text-sky-100',
  },
  warning: {
    pill: 'bg-amber-100 text-amber-900 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-100',
    dot: 'bg-amber-500',
    banner: 'border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40',
    heading: 'text-amber-950 dark:text-amber-100',
  },
  critical: {
    pill: 'bg-destructive/15 text-destructive hover:bg-destructive/25',
    dot: 'bg-destructive',
    banner: 'border-destructive/60 bg-destructive/10',
    heading: 'text-destructive',
  },
}

export function stateToneClasses(tone: string): StateToneClasses {
  return TONE_CLASSES[tone as StateTone] ?? TONE_CLASSES.normal
}

/**
 * State id → `admin.states` dictionary key. Names are localized, so the UI
 * never renders the DB `name` column (which is English seed text); an unknown
 * id degrades to the NORMAL label rather than showing a raw identifier.
 */
export const STATE_NAME_KEYS = {
  NORMAL: 'normal',
  SEASONAL: 'seasonal',
  BACK_TO_SCHOOL: 'backToSchool',
  HIGH_ACTIVITY: 'highActivity',
  MAINTENANCE: 'maintenance',
  DEGRADED: 'degraded',
  RECOVERY: 'recovery',
  INCIDENT: 'incident',
  CRITICAL: 'critical',
} as const

export type StateNameKey = (typeof STATE_NAME_KEYS)[keyof typeof STATE_NAME_KEYS]

export function stateNameKey(stateId: string): StateNameKey {
  return (STATE_NAME_KEYS as Record<string, StateNameKey>)[stateId.toUpperCase()] ?? 'normal'
}

/**
 * Human-readable incident reference (spec §26 mock shows `#INC-2026-009`).
 * `incidents` has no reference column — this derives a stable, sortable
 * display id from the row's creation year plus the first UUID segment.
 */
export function incidentRef(id: string, createdAt: string | null | undefined): string {
  const year = createdAt ? new Date(createdAt).getFullYear() : Number.NaN
  const y = Number.isNaN(year) ? '----' : String(year)
  return `INC-${y}-${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`
}
