'use server'

import { revalidateTag } from 'next/cache'
import { assertCapability } from '@/lib/admin/auth'
import { getSessionUser } from '@/lib/auth/guards'
import { getAppFlag } from '@/lib/automation/flags'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimitForKey } from '@/lib/security/rate-limit'
import { CACHE_TAGS } from '@/lib/cache/tags'
import { audit, fail, revalidateLocalized } from '@/lib/admin/actions/_shared'
import { isAllowedStreamUrl, isStreamProvider, type StreamProvider } from './stream'
import type { BroadcastStatus } from './queries'

type LiveResult = { ok: true } | { ok: false; error: string }

function bustEventCache(slugOrId: string) {
  revalidateTag(CACHE_TAGS.culture, 'max')
  revalidateLocalized(`/culture/events/${slugOrId}`)
}

/**
 * Push the live/recap moment to everyone holding a reminder for the event.
 * Reminder rows are user-owned by RLS, so this reads them service-side and
 * fans out through the normal user-notification outbox (in-app + email /
 * WhatsApp per each user's prefs) — the same door the hourly reminder cron
 * uses, just triggered by the broadcast instead of the clock.
 */
async function notifyReminderHolders(
  contentItemId: string,
  slugOrId: string,
  kind: 'live' | 'recap',
): Promise<void> {
  try {
    const db = createAdminClient()
    const { data } = await db
      .from('event_reminders')
      .select('user_id')
      .eq('content_item_id', contentItemId)
      .limit(200)
    const ids = [...new Set(((data ?? []) as { user_id: string }[]).map((r) => r.user_id))];
    if (ids.length === 0) return
    const { enqueueUser, listingNotifyTarget } = await import('@/lib/notify/queue')
    const target = await listingNotifyTarget(db, contentItemId).catch(() => ({ title: 'the event' }))
    for (const userId of ids) {
      try {
        await enqueueUser(
          'content.updated',
          userId,
          {
            title: target.title,
            status: kind === 'live' ? 'is live now' : 'recording + recap ready',
          },
          `/culture/events/${slugOrId}`,
        )
      } catch { /* per-user best-effort */ }
    }
  } catch { /* best-effort: never fail the broadcast */ }
}

/** Whether the viewer may run a broadcast (drives the staff-only controls). */
export async function canBroadcast(): Promise<boolean> {
  try {
    await assertCapability('broadcast.live')
    return true
  } catch {
    return false
  }
}

/** Whether native ingest is enabled (the admin resource gate for Mux/Livepeer). */
export async function isNativeLiveEnabled(): Promise<boolean> {
  return getAppFlag<boolean>('live.native_enabled', false)
}

async function getOrCreateBroadcast(contentItemId: string) {
  const db = createAdminClient()
  const { data } = await db
    .from('event_broadcasts')
    .select('id, status')
    .eq('content_item_id', contentItemId)
    .limit(1)
  const row = ((data ?? []) as { id: string; status: string }[])[0]
  if (row) return row
  const { data: created, error } = await db
    .from('event_broadcasts')
    .insert({ content_item_id: contentItemId, status: 'scheduled' })
    .select('id, status')
  if (error || !created?.[0]) throw new Error('Could not prepare the broadcast.')
  return created[0] as { id: string; status: string }
}

/**
 * Point the broadcast at a stream URL (scheduled state). Native ingest is
 * refused while the `live.native_enabled` flag is off — the control explains
 * what infrastructure it needs instead of failing silently.
 */
export async function setBroadcastStream(input: {
  contentItemId: string
  slugOrId: string
  provider: string
  streamUrl: string
}): Promise<LiveResult> {
  try {
    const ctx = await assertCapability('broadcast.live')
    if (!isStreamProvider(input.provider)) return { ok: false, error: 'Unknown stream provider.' }
    const provider: StreamProvider = input.provider
    if (provider === 'native' && !(await isNativeLiveEnabled())) {
      return {
        ok: false,
        error: 'Native streaming needs ingest infrastructure (Mux/Livepeer) — disabled. Use a YouTube or Facebook Live URL.',
      }
    }
    const url = input.streamUrl.trim()
    if (provider !== 'native' && !isAllowedStreamUrl(provider, url)) {
      return { ok: false, error: 'That URL is not a playable stream for this provider.' }
    }
    const db = createAdminClient()
    const row = await getOrCreateBroadcast(input.contentItemId)
    const { error } = await db
      .from('event_broadcasts')
      .update({ provider, stream_url: provider === 'native' ? null : url, updated_at: new Date().toISOString() })
      .eq('id', row.id)
    if (error) throw new Error(error.message)
    await audit(db, ctx.user.id, {
      action: 'broadcast:stream_set',
      contentItemId: input.contentItemId,
      entityType: 'event_broadcast',
      entityId: row.id,
      notes: provider,
    })
    bustEventCache(input.slugOrId)
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/** Take the event live (requires a playable stream URL, unless native). */
export async function startBroadcast(input: {
  contentItemId: string
  slugOrId: string
}): Promise<LiveResult> {
  try {
    const ctx = await assertCapability('broadcast.live')
    const db = createAdminClient()
    const row = await getOrCreateBroadcast(input.contentItemId)
    const { data } = await db
      .from('event_broadcasts')
      .select('provider, stream_url')
      .eq('id', row.id)
      .limit(1)
    const current = ((data ?? []) as { provider: string; stream_url: string | null }[])[0]
    if (!current) return { ok: false, error: 'Broadcast not found.' }
    if (current.provider !== 'native' && !current.stream_url) {
      return { ok: false, error: 'Set a stream URL before going live.' }
    }
    const { error } = await db
      .from('event_broadcasts')
      .update({ status: 'live', started_at: new Date().toISOString(), ended_at: null, updated_at: new Date().toISOString() })
      .eq('id', row.id)
    if (error) throw new Error(error.message)
    await audit(db, ctx.user.id, {
      action: 'broadcast:live',
      contentItemId: input.contentItemId,
      entityType: 'event_broadcast',
      entityId: row.id,
      fromStatus: row.status,
      toStatus: 'live',
    })
    // Everyone who asked for a reminder gets the "we're live" push — that is
    // what the reminder was for. Best-effort, capped, never fails go-live.
    void notifyReminderHolders(input.contentItemId, input.slugOrId, 'live')
    bustEventCache(input.slugOrId)
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/** End the broadcast; optionally attach the recording + recap story. */
export async function endBroadcast(input: {
  contentItemId: string
  slugOrId: string
  recordingUrl?: string
  recapId?: string
}): Promise<LiveResult> {
  try {
    const ctx = await assertCapability('broadcast.live')
    const db = createAdminClient()
    const row = await getOrCreateBroadcast(input.contentItemId)
    const recording = (input.recordingUrl ?? '').trim()
    if (recording && !/^https?:\/\//i.test(recording)) {
      return { ok: false, error: 'The recording URL must start with https://.' }
    }
    const recapId = (input.recapId ?? '').trim() || null
    if (recapId) {
      const { data: recap } = await db
        .from('content_items')
        .select('id')
        .eq('id', recapId)
        .eq('status', 'published')
        .limit(1)
      if (!recap?.[0]) return { ok: false, error: 'Recap story not found (must be published).' }
    }
    const { error } = await db
      .from('event_broadcasts')
      .update({
        status: 'ended',
        ended_at: new Date().toISOString(),
        recording_url: recording || null,
        recap_content_item_id: recapId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
    if (error) throw new Error(error.message)
    await audit(db, ctx.user.id, {
      action: 'broadcast:ended',
      contentItemId: input.contentItemId,
      entityType: 'event_broadcast',
      entityId: row.id,
      fromStatus: row.status,
      toStatus: 'ended',
    })
    // Ended with a recording or recap: tell the reminder holders where the
    // record lives, so "remind me" also means "don't let me miss it".
    if (recording || recapId) {
      void notifyReminderHolders(input.contentItemId, input.slugOrId, 'recap')
    }
    bustEventCache(input.slugOrId)
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export type ChatPostResult =
  | { ok: true; message: { id: string; body: string; createdAt: string; authorName: string | null } }
  | { ok: false; error: string }

const CHAT_SLOW_MODE_MS = 10_000

/**
 * Post a live-chat message. Live broadcasts only, 500 chars, 10s slow-mode
 * per viewer, authenticated rate-limited — the chat stays readable without a
 * moderator babysitting it.
 */
export async function postChatMessage(input: {
  broadcastId: string
  contentItemId: string
  body: string
}): Promise<ChatPostResult> {
  const { supabase, user } = await getSessionUser()
  if (!user) return { ok: false, error: 'Not authenticated.' }
  const body = input.body.trim().slice(0, 500)
  if (body.length < 1) return { ok: false, error: 'Write a message first.' }
  const limited = await checkRateLimitForKey(`live:chat:${user.id}`, {
    max: 20,
    windowMs: 60_000,
    policy: 'fail-closed',
  })
  if (!limited.ok) return { ok: false, error: 'Slow down — try again shortly.' }
  const admin = createAdminClient()
  const { data: live } = await admin
    .from('event_broadcasts')
    .select('id, status, chat_enabled')
    .eq('id', input.broadcastId)
    .eq('content_item_id', input.contentItemId)
    .limit(1)
  const bc = ((live ?? []) as { id: string; status: string; chat_enabled: boolean }[])[0]
  if (!bc || bc.status !== 'live' || !bc.chat_enabled) {
    return { ok: false, error: 'Chat is open while the event is live.' }
  }
  // Slow-mode: one message per viewer per 10s (defense in depth over RLS).
  const { data: recent } = await admin
    .from('event_broadcast_chats')
    .select('created_at')
    .eq('broadcast_id', input.broadcastId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
  const last = ((recent ?? []) as { created_at: string }[])[0]
  if (last && Date.now() - Date.parse(last.created_at) < CHAT_SLOW_MODE_MS) {
    return { ok: false, error: 'Slow mode is on — wait a few seconds.' }
  }
  const { data: inserted, error } = await supabase
    .from('event_broadcast_chats')
    .insert({ broadcast_id: input.broadcastId, user_id: user.id, body })
    .select('id, body, created_at')
  if (error || !inserted?.[0]) return { ok: false, error: error?.message ?? 'Could not send.' }
  const row = (inserted as { id: string; body: string; created_at: string }[])[0]
  const { data: profile } = await admin
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .limit(1)
  const name = ((profile ?? []) as { display_name: string | null }[])[0]?.display_name ?? null
  return {
    ok: true,
    message: { id: row.id, body: row.body, createdAt: row.created_at, authorName: name },
  }
}

/** Visible chat history (newest last). Staff additionally see hidden rows. */
export async function getChatMessages(broadcastId: string): Promise<
  { id: string; body: string; createdAt: string; authorName: string | null; isHidden: boolean }[]
> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('event_broadcast_chats')
      .select('id, body, created_at, is_hidden, user_id')
      .eq('broadcast_id', broadcastId)
      .order('created_at', { ascending: true })
      .limit(100)
    if (error) return []
    const rows = (data ?? []) as {
      id: string
      body: string
      created_at: string
      is_hidden: boolean
      user_id: string
    }[]
    // Staff see hidden rows; everyone else sees only visible ones.
    let staff = false
    try {
      await assertCapability('moderate')
      staff = true
    } catch {
      staff = false
    }
    const visible = staff ? rows : rows.filter((r) => !r.is_hidden)
    const ids = [...new Set(visible.map((r) => r.user_id))]
    const names = new Map<string, string | null>()
    if (ids.length > 0) {
      const { data: profiles } = await admin.from('profiles').select('id, display_name').in('id', ids)
      for (const p of ((profiles ?? []) as { id: string; display_name: string | null }[])) {
        names.set(p.id, p.display_name)
      }
    }
    return visible.map((r) => ({
      id: r.id,
      body: r.body,
      createdAt: r.created_at,
      authorName: names.get(r.user_id) ?? null,
      isHidden: r.is_hidden,
    }))
  } catch {
    return []
  }
}

/**
 * Report a chat message to the trust & safety queue. Signed-in viewers only
 * (identity is the anti-abuse here, so no Turnstile — the report lands in
 * the same `reports` table and queue as content reports, with the message id
 * in the description so a moderator can hide it in one hop).
 */
export async function reportChatMessage(input: {
  messageId: string
  contentItemId: string
}): Promise<LiveResult> {
  const { user } = await getSessionUser()
  if (!user) return { ok: false, error: 'Not authenticated.' }
  const limited = await checkRateLimitForKey(`live:chat-report:${user.id}`, {
    max: 10,
    windowMs: 60_000,
    policy: 'fail-closed',
  })
  if (!limited.ok) return { ok: false, error: 'Too many reports. Please try again later.' }
  try {
    const db = createAdminClient()
    const { data } = await db
      .from('event_broadcast_chats')
      .select('id, body, broadcast_id')
      .eq('id', input.messageId)
      .limit(1)
    const msg = ((data ?? []) as { id: string; body: string; broadcast_id: string }[])[0]
    if (!msg) return { ok: false, error: 'Message not found.' }
    const { error } = await db.from('reports').insert({
      report_type: 'abuse',
      content_item_id: input.contentItemId,
      reporter_id: user.id,
      subject: 'Live chat report',
      description: `Chat message ${msg.id} (broadcast ${msg.broadcast_id}): ${msg.body.slice(0, 400)}`,
      status: 'open',
    })
    if (error) throw new Error(error.message)
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/** Hide (or restore) a chat message — the `moderate` desk, audited. */
export async function setChatHidden(input: {
  messageId: string
  hidden: boolean
  contentItemId: string
  slugOrId: string
}): Promise<LiveResult> {
  try {
    const ctx = await assertCapability('moderate')
    const db = createAdminClient()
    const { error } = await db
      .from('event_broadcast_chats')
      .update({ is_hidden: input.hidden })
      .eq('id', input.messageId)
    if (error) throw new Error(error.message)
    await audit(db, ctx.user.id, {
      action: input.hidden ? 'broadcast:chat_hidden' : 'broadcast:chat_restored',
      contentItemId: input.contentItemId,
      entityType: 'event_broadcast_chat',
      entityId: input.messageId,
    })
    bustEventCache(input.slugOrId)
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export type RsvpResult =
  | { ok: true; going: boolean; count: number }
  | { ok: false; error: string }

/** "I'm going" toggle for an event (authenticated; count is public). */
export async function toggleRsvp(contentItemId: string): Promise<RsvpResult> {
  const { supabase, user } = await getSessionUser()
  if (!user) return { ok: false, error: 'Not authenticated.' }
  const { data: existing } = await supabase
    .from('event_rsvps')
    .select('user_id')
    .eq('user_id', user.id)
    .eq('content_item_id', contentItemId)
    .limit(1)
  if (existing?.[0]) {
    const { error } = await supabase
      .from('event_rsvps')
      .delete()
      .eq('user_id', user.id)
      .eq('content_item_id', contentItemId)
    if (error) return { ok: false, error: error.message }
  } else {
    const { error } = await supabase
      .from('event_rsvps')
      .insert({ user_id: user.id, content_item_id: contentItemId })
    if (error) return { ok: false, error: error.message }
  }
  const admin = createAdminClient()
  const { count } = await admin
    .from('event_rsvps')
    .select('user_id', { count: 'exact', head: true })
    .eq('content_item_id', contentItemId)
  return { ok: true, going: !existing?.[0], count: count ?? 0 }
}

export async function getRsvpState(
  contentItemId: string,
): Promise<{ going: boolean; count: number }> {
  const admin = createAdminClient()
  const { count } = await admin
    .from('event_rsvps')
    .select('user_id', { count: 'exact', head: true })
    .eq('content_item_id', contentItemId)
  const { user } = await getSessionUser()
  if (!user) return { going: false, count: count ?? 0 }
  const { data } = await admin
    .from('event_rsvps')
    .select('user_id')
    .eq('user_id', user.id)
    .eq('content_item_id', contentItemId)
    .limit(1)
  return { going: Boolean(data?.[0]), count: count ?? 0 }
}

export type { BroadcastStatus }
