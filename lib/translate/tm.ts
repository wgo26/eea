import 'server-only'

import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Translation memory read side.
 *
 * The write side (rememberSegment in lib/admin/actions/translations.ts)
 * upserts sha256(`locale:locale:source`) → target text; it has never been
 * read back, so identical boilerplate re-consumed quota on every story.
 * `lookupSegment` closes that loop: an exact-match hit returns the human
 * (or reviewed) target text for free, and keeps recurring lines consistent.
 *
 * The hash format is load-bearing — it must byte-for-byte match what
 * rememberSegment writes. Keep the two in sync.
 */

function segmentHash(sourceLocale: string, targetLocale: string, source: string): string {
  return createHash('sha256').update(`${sourceLocale}:${targetLocale}:${source.trim()}`).digest('hex')
}

export async function lookupSegment(
  source: string,
  sourceLocale: string,
  targetLocale: string,
): Promise<string | null> {
  if (!source.trim()) return null
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('translation_memory')
      .select('target_text')
      .eq('source_text_hash', segmentHash(sourceLocale, targetLocale, source))
      .maybeSingle()
    const text = (data as { target_text: string | null } | null)?.target_text
    return text?.trim() ? text : null
  } catch {
    // TM is a pure optimization; a lookup failure must never fail a save.
    return null
  }
}
