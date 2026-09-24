/**
 * Example future state: HOLIDAY (plan Phase 6.1, spec §63).
 *
 * A low-urgency festive season: standard operations with a warm accent and
 * community content priority. Lowest seasonal precedence above SEASONAL so
 * any more specific season wins ties (spec §29). Manual + scheduled only —
 * never automated or incident-driven.
 */

import type { SystemStateConfig } from '../state-engine'

export const HOLIDAY_STATE: SystemStateConfig = {
  id: 'HOLIDAY',
  name: 'Holiday season',
  severity: 'info',
  precedence: 11,
  visualProfile: 'seasonal',
  behavior: {
    contentPriority: 'community',
    notifications: 'standard',
    motion: 'subtle',
  },
  accessibilityProfile: 'standard',
  affectedModules: ['home', 'culture', 'listings'],
  contentPriorities: ['community-notices', 'events', 'marketplace'],
  activation: { manual: true, scheduled: true },
  defaultDurationHours: null,
}
