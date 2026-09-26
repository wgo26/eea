import 'server-only'

import { getActiveStates } from '@/lib/admin/queries'
import { getEffectiveState } from '@/lib/platform/state-engine'

/**
 * Behavior-axis enforcement: the notifications/content-priority axes the
 * engine resolves are advisory until something reads them. This is the
 * reader for the bluntest axis — during an incident or critical mode the
 * platform stops *subscriber* fan-out (daily/weekly digests) so readers are
 * not marketed to while responders work. Staff alerts, transactional mail
 * (receipts, decisions) and publishing itself are never paused: an incident
 * must not silence the loops that resolve it.
 */
export async function isPublicFanoutPaused(): Promise<{ paused: boolean; stateId: string }> {
  try {
    const effective = getEffectiveState(await getActiveStates())
    const paused = effective.id === 'INCIDENT' || effective.id === 'CRITICAL'
    return { paused, stateId: effective.id }
  } catch {
    // Fail open: a telemetry hiccup must not silence scheduled mail.
    return { paused: false, stateId: 'NORMAL' }
  }
}
