import type { SystemStateConfig, StateBehaviorProfile } from './state-engine'
import { getWindowInstants, isWithinWindow, type SeasonalWindow } from './seasonal-window'

export type { SeasonalWindow }

/**
 * Spec §22/§23/§64 — "Back to School" is a *plugin* state: it ships its own
 * config, its own seasonal window and its own content priorities, and installs
 * itself through `registerSystemState` in the engine's registration pass. No
 * component knows this state by name, so switching it on changes presentation
 * and operational emphasis without a single conditional in the UI.
 *
 * Spec §22 is explicit that this is not a gimmick — it is a planning season,
 * not a decoration: the token deviations are a controlled accent, the copy
 * stays corporate, and the operational half (content priorities, dashboard
 * widgets) is the part that actually matters (spec §23).
 *
 * Runtime state lives in `system_states` (`BACK_TO_SCHOOL`, seeded inactive);
 * the schedule that turns it on and off is the Sept window below, evaluated by
 * the `state-schedules` cron against the `state_schedules` table.
 */

export const BACK_TO_SCHOOL_STATE_ID = 'BACK_TO_SCHOOL'

/**
 * 1–30 September: the ramp-up to the academic year in the markets the platform
 * serves. Deliberately month/day (not dates) so the season recurs without an
 * annual edit — `state_schedules` stores the same shape.
 */
export const BACK_TO_SCHOOL_WINDOW: SeasonalWindow = {
  startMonth: 9,
  startDay: 1,
  endMonth: 9,
  endDay: 30,
}

/**
 * Spec §23 — categories the platform surfaces while the season is active.
 * Slugs (not display strings) so the dashboard and any feeds resolve them
 * against taxonomy rather than matching English text.
 */
export const BACK_TO_SCHOOL_CONTENT_PRIORITIES = [
  'education',
  'schools',
  'scholarships',
  'transport',
  'community-notices',
  'school-listings',
] as const

/**
 * Spec §23 dashboard widgets. The widget system (plan Phase 4.4) already ships
 * generic widgets; these ids are the season's *emphasis*, applied to the
 * default layout rather than a parallel widget catalogue.
 */
export const BACK_TO_SCHOOL_WIDGET_IDS = [
  'education-stories',
  'school-notices',
  'community-alerts',
  'upcoming-dates',
  'education-submissions',
] as const

/** Concrete instants for one year's window — what a schedule row resolves to. */
export function getBackToSchoolWindow(
  year: number,
  window: SeasonalWindow = BACK_TO_SCHOOL_WINDOW,
): { startsAt: string; endsAt: string } {
  return getWindowInstants(year, window)
}

/** Spec §22 — is the season in effect on this date (default: now)? */
export function isBackToSchoolSeason(
  date: Date = new Date(),
  window: SeasonalWindow = BACK_TO_SCHOOL_WINDOW,
): boolean {
  return isWithinWindow(date, window)
}

export function getBackToSchoolContentPriorities(): string[] {
  return [...BACK_TO_SCHOOL_CONTENT_PRIORITIES]
}

export function getBackToSchoolWidgets(): string[] {
  return [...BACK_TO_SCHOOL_WIDGET_IDS]
}

/**
 * The plugin config (spec §63 checklist): metadata, visual profile, behaviour,
 * content priorities, activation + expiration rules. `precedence` 12 sits above
 * generic SEASONAL (10) — this state is more specific — and below every
 * operational state, so high activity, maintenance, degradation or an incident
 * all correctly outrank a cosmetic season (spec §29).
 */
export const BACK_TO_SCHOOL_STATE: SystemStateConfig = {
  id: BACK_TO_SCHOOL_STATE_ID,
  name: 'Back to School',
  severity: 'info',
  precedence: 12,
  visualProfile: 'education-season',
  behavior: {
    // Spec §22 — planning-season emphasis: notices and dates lead, navigation
    // stays standard (the season is busy, not degraded).
    contentPriority: 'education-season',
    notifications: 'elevated',
    motion: 'subtle',
  } satisfies StateBehaviorProfile,
  accessibilityProfile: 'standard',
  affectedModules: ['home', 'news', 'notices', 'listings'],
  contentPriorities: [...BACK_TO_SCHOOL_CONTENT_PRIORITIES],
  activation: { manual: true, scheduled: true },
  // Closed by the schedule window, not by a countdown from activation.
  defaultDurationHours: null,
}
