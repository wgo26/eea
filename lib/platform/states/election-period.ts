/**
 * Example future state: ELECTION_PERIOD (plan Phase 6.1, spec §63).
 *
 * A civic-event season: elevated verification emphasis, calmer motion and
 * civic content priority. Precedence 14 sits above generic seasons
 * (SEASONAL 10, BACK_TO_SCHOOL 12) and below every operational state, so
 * incidents, degradation or maintenance always outrank a cosmetic season
 * (spec §29). Uses the shared `seasonal` visual profile — no new tokens.
 */

import type { SystemStateConfig } from '../state-engine'

export const ELECTION_PERIOD_STATE: SystemStateConfig = {
  id: 'ELECTION_PERIOD',
  name: 'Election period',
  severity: 'info',
  precedence: 14,
  visualProfile: 'seasonal',
  behavior: {
    contentPriority: 'civic',
    notifications: 'elevated',
    motion: 'subtle',
  },
  accessibilityProfile: 'standard',
  affectedModules: ['home', 'news', 'notices', 'polls'],
  contentPriorities: ['civic-education', 'voter-information', 'community-notices'],
  activation: { manual: true, scheduled: true },
  defaultDurationHours: null,
}
