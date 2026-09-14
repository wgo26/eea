'use server'

import { getSessionUser } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'

export type ReminderState = { remindAt: string | null }

export type ReminderResult = { ok: true; remindAt: string | null } | { ok: false; error: string }

/**
 * "Remind me" for culture events. The user picks how far before the start
 * they want the nudge; the /api/cron/reminders worker delivers due rows
 * through the normal notification outbox (in-app + email/WhatsApp per the
 * user's prefs) and stamps sent_at so each reminder fires once.
 */
export async function getReminderState(contentItemId: string): Promise<ReminderState> {
  const { supabase, user } = await getSessionUser()
  if (!user) return { remindAt: null }
  const { data } = await supabase
    .from('event_reminders')
    .select('remind_at')
    .eq('user_id', user.id)
    .eq('content_item_id', contentItemId)
    .limit(1)
  const row = ((data ?? []) as { remind_at: string }[])[0]
  return { remindAt: row?.remind_at ?? null }
}

export async function setEventReminder(
  contentItemId: string,
  eventStartsAt: string,
  offsetMs: number,
): Promise<ReminderResult> {
  const { supabase, user } = await getSessionUser()
  if (!user) return { ok: false, error: 'Not authenticated.' }
  const starts = Date.parse(eventStartsAt)
  if (Number.isNaN(starts) || starts <= Date.now()) return { ok: false, error: 'This event already started.' }
  const remindAt = new Date(starts - offsetMs)
  if (remindAt.getTime() <= Date.now()) return { ok: false, error: 'That reminder time is already past.' }
  // Confirm the event exists (and read nothing else) via the admin client —
  // the write itself stays on the RLS-bound session client.
  const admin = createAdminClient()
  const { data: event } = await admin
    .from('events')
    .select('content_item_id')
    .eq('content_item_id', contentItemId)
    .limit(1)
  if ((event?.length ?? 0) === 0) return { ok: false, error: 'Event not found.' }
  const { error } = await supabase.from('event_reminders').upsert(
    { user_id: user.id, content_item_id: contentItemId, remind_at: remindAt.toISOString(), sent_at: null },
    { onConflict: 'user_id,content_item_id' },
  )
  if (error) return { ok: false, error: error.message }
  return { ok: true, remindAt: remindAt.toISOString() }
}

export async function cancelEventReminder(contentItemId: string): Promise<ReminderResult> {
  const { supabase, user } = await getSessionUser()
  if (!user) return { ok: false, error: 'Not authenticated.' }
  const { error } = await supabase
    .from('event_reminders')
    .delete()
    .eq('user_id', user.id)
    .eq('content_item_id', contentItemId)
  if (error) return { ok: false, error: error.message }
  return { ok: true, remindAt: null }
}
