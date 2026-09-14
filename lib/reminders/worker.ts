import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/observability/logger'
import { enqueueNotification } from '@/lib/notify/queue'

export type ReminderSummary = { due: number; enqueued: number; skipped: number }

/**
 * Deliver due event reminders: every unsent row with remind_at <= now whose
 * event has not been deleted becomes one `event.reminder` outbox entry
 * (the existing notify worker fans it out per the user's channel prefs),
 * then gets stamped sent_at. Idempotent — only sent_at IS NULL rows match.
 */
export async function processDueReminders(limit = 100): Promise<ReminderSummary> {
  const supabase = createAdminClient()
  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('event_reminders')
    .select(
      `user_id, content_item_id, remind_at,
       content:content_items(id, type, slug,
         translations:content_translations(locale, title),
         event:events(starts_at))`,
    )
    .is('sent_at', null)
    .lte('remind_at', nowIso)
    .order('remind_at', { ascending: true })
    .limit(limit)
  if (error) {
    logger.error('reminders', 'due query failed', { error: error.message })
    return { due: 0, enqueued: 0, skipped: 0 }
  }
  const rows = (data ?? []) as unknown as {
    user_id: string
    content_item_id: string
    remind_at: string
    content: {
      id: string
      type: string
      slug: string | null
      translations: { locale: string; title: string | null }[] | null
      event: { starts_at: string | null }[] | { starts_at: string | null } | null
    } | null
  }[]
  let enqueued = 0
  let skipped = 0
  for (const row of rows) {
    const translations = row.content?.translations ?? []
    const title = translations[0]?.title ?? row.content?.slug ?? 'An event you follow'
    const event = Array.isArray(row.content?.event) ? row.content.event[0] : row.content?.event
    const startsAt = event?.starts_at ? new Date(event.starts_at) : null
    // Event deleted or already started long ago — retire without notifying.
    if (!row.content || (startsAt && startsAt.getTime() < Date.now() - 6 * 3_600_000)) {
      await supabase.from('event_reminders').update({ sent_at: nowIso }).eq('user_id', row.user_id).eq('content_item_id', row.content_item_id)
      skipped += 1
      continue
    }
    const typePath =
      row.content.type === 'photo_story'
        ? `/photo-stories/${row.content.slug ?? row.content.id}`
        : row.content.type === 'culture'
          ? `/culture/${row.content.slug ?? row.content.id}`
          : row.content.type === 'listing'
            ? `/buy-sell/${row.content.id}`
            : `/news/${row.content.slug ?? row.content.id}`
    const when = startsAt
      ? startsAt.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : 'soon'
    await enqueueNotification({
      event: 'event.reminder',
      audience: 'user',
      userId: row.user_id,
      path: typePath,
      data: { title: title.slice(0, 140), when },
    })
    await supabase.from('event_reminders').update({ sent_at: nowIso }).eq('user_id', row.user_id).eq('content_item_id', row.content_item_id)
    enqueued += 1
  }
  return { due: rows.length, enqueued, skipped }
}
