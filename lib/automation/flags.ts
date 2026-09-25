import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/observability/logger'
import type { Json } from '@/lib/supabase/database.types'

/**
 * app_flags — the service-role key/value store for automation verdicts
 * (migration 20261108000000). No policies by design: anon/authenticated
 * cannot read or write it (same posture as analytics_daily), so this module
 * is the only door. Values must be JSON scalars or plain objects.
 */

export async function getAppFlag<T>(key: string, fallback: T): Promise<T> {
  try {
    const db = createAdminClient()
    const { data, error } = await db.from('app_flags').select('value').eq('key', key).maybeSingle()
    if (error || !data) return fallback
    return (data.value ?? fallback) as T
  } catch (e) {
    logger.warn('automation/flags', 'flag read failed', { key, error: e instanceof Error ? e.message : String(e) })
    return fallback
  }
}

export async function setAppFlag(key: string, value: Json): Promise<boolean> {
  try {
    const db = createAdminClient()
    const { error } = await db.from('app_flags').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (error) {
      logger.warn('automation/flags', 'flag write failed', { key, error: error.message })
      return false
    }
    return true
  } catch (e) {
    logger.warn('automation/flags', 'flag write exception', { key, error: e instanceof Error ? e.message : String(e) })
    return false
  }
}

/** E2 — the promoted digest pitch winner (null while the 50/50 A/B runs). */
export async function getPromotedPitch(): Promise<'standard' | 'diaspora' | null> {
  const raw = await getAppFlag<string | null>('digest.pitch_winner', null)
  return raw === 'diaspora' || raw === 'standard' ? raw : null
}
