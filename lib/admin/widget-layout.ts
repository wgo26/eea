import type { AppRole } from '@/lib/auth/types'
import {
  BACK_TO_SCHOOL_STATE_ID,
  BACK_TO_SCHOOL_WIDGET_IDS,
  isBackToSchoolSeason,
} from '@/lib/platform/back-to-school'

/**
 * Phase 4.4 (spec §35) — the widget vocabulary and the layout algebra behind it.
 *
 * Widget ids are the contract shared by three places that must not depend on
 * each other: the renderer (components/admin/widget-registry.tsx), the save
 * action (lib/admin/actions/widgets.ts) and the persisted row
 * (`admin_widget_layouts.widgets`). They live in a plain module — no React, no
 * `server-only` — so the action can validate an incoming layout without
 * importing the component tree, and the rules below stay unit-testable.
 *
 * Widgets are code; only the arrangement is data. A saved layout is therefore
 * a list of ids, and anything unknown to this module is dropped on read *and*
 * on write: deleting a widget in a later deploy cannot leave a stored layout
 * pointing at a renderer that no longer exists.
 */

/** The ten base widgets (spec §35). */
export const BASE_WIDGET_IDS = [
  'pending-submissions',
  'editorial-queue',
  'moderation-queue',
  'active-notices',
  'marketplace-activity',
  'photo-archive',
  'platform-health',
  'active-incident',
  'recent-activity',
  'publishing-calendar',
] as const

/**
 * The full vocabulary: the base widgets plus the Back to School season's five
 * (spec §23, via the plugin in lib/platform/back-to-school.ts). The season does
 * not get a parallel catalogue — its ids join this one and are merely *gated*
 * by the season below.
 */
export const WIDGET_IDS = [...BASE_WIDGET_IDS, ...BACK_TO_SCHOOL_WIDGET_IDS] as const

export type WidgetId = (typeof WIDGET_IDS)[number]
export type EducationWidgetId = (typeof BACK_TO_SCHOOL_WIDGET_IDS)[number]

/**
 * Bound on how many cards one dashboard renders. The default layouts stay
 * inside it even with the season on (7 + 5 = 12), so the cap only ever trims a
 * hand-built layout, never a default.
 */
export const MAX_WIDGETS = 12

const WIDGET_ID_SET: ReadonlySet<string> = new Set(WIDGET_IDS)
const EDUCATION_WIDGET_SET: ReadonlySet<string> = new Set(BACK_TO_SCHOOL_WIDGET_IDS)

/**
 * Per-role defaults. Contributor and advertiser hold no `viewDashboard`
 * capability and cannot open the admin dashboard at all — their empty arrays
 * keep the record total rather than pretending those roles have a layout.
 */
export const DEFAULT_WIDGET_LAYOUTS: Record<AppRole, readonly WidgetId[]> = {
  admin: [
    'pending-submissions',
    'editorial-queue',
    'active-incident',
    'platform-health',
    'moderation-queue',
    'marketplace-activity',
    'recent-activity',
  ],
  editor: [
    'pending-submissions',
    'editorial-queue',
    'moderation-queue',
    'active-notices',
    'marketplace-activity',
    'recent-activity',
  ],
  contributor: [],
  advertiser: [],
}

export function isWidgetId(value: unknown): value is WidgetId {
  return typeof value === 'string' && WIDGET_ID_SET.has(value)
}

export function isEducationWidget(id: WidgetId): id is EducationWidgetId {
  return EDUCATION_WIDGET_SET.has(id)
}

/**
 * Is the Back to School season in effect? True when the season's state is lit
 * on the ladder (an operator can activate it by hand — `activation.manual`) or
 * when today falls inside the September window the schedule evaluates, so the
 * widgets appear even before the cron flips the flag.
 */
export function isEducationSeasonActive(date: Date, activeStateIds: readonly string[]): boolean {
  return activeStateIds.includes(BACK_TO_SCHOOL_STATE_ID) || isBackToSchoolSeason(date)
}

export function defaultWidgetLayout(role: AppRole, seasonActive: boolean): WidgetId[] {
  const base = [...(DEFAULT_WIDGET_LAYOUTS[role] ?? [])]
  if (!seasonActive) return base
  const season = BACK_TO_SCHOOL_WIDGET_IDS.filter((id) => !base.includes(id))
  return [...base, ...season]
}

/**
 * Drop everything a stored layout must not contain: ids no renderer owns,
 * duplicates, the season's widgets outside the season, and anything past the
 * cap. Order is preserved — it *is* the layout.
 */
export function sanitizeWidgetLayout(
  input: readonly unknown[],
  options: { seasonActive?: boolean } = {},
): WidgetId[] {
  const keepSeason = options.seasonActive !== false
  const out: WidgetId[] = []
  const seen = new Set<string>()
  for (const value of input) {
    if (out.length >= MAX_WIDGETS) break
    if (!isWidgetId(value) || seen.has(value)) continue
    if (!keepSeason && isEducationWidget(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

/**
 * What the dashboard actually renders: the saved layout when the user has one,
 * the role's defaults when they do not (`null` = no row), and — when a stored
 * layout lost *every* entry to sanitization (all ids retired, or only seasonal
 * widgets after the season closed) — the defaults again, because an empty
 * dashboard nobody asked for reads as a bug, while an empty dashboard the user
 * cleared themselves is a state worth honouring.
 */
export function resolveWidgetLayout(
  saved: readonly string[] | null,
  role: AppRole,
  seasonActive: boolean,
): WidgetId[] {
  if (saved === null) return defaultWidgetLayout(role, seasonActive)
  const kept = sanitizeWidgetLayout(saved, { seasonActive })
  if (kept.length === 0 && saved.length > 0) return defaultWidgetLayout(role, seasonActive)
  return kept
}
