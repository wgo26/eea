'use server'

import { revalidatePath } from 'next/cache'
import { getSessionUser } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'

// Buyer↔seller messaging tables. Renamed to listing_conversations (see
// 20261005000000_listing_conversations_rename.sql) because hosted DBs already
// own a legacy public.conversations table with an incompatible shape.
const CONVERSATIONS_TABLE = 'listing_conversations'
const MESSAGES_TABLE = 'listing_conversation_messages'

export type ConversationSummary = {
  id: string
  contentItemId: string
  listingTitle: string
  otherName: string | null
  lastMessage: string | null
  lastMessageAt: string | null
  updatedAt: string
}

export type ThreadMessage = {
  id: string
  senderId: string
  mine: boolean
  body: string
  createdAt: string
}

export type ThreadDetail = {
  id: string
  contentItemId: string
  listingTitle: string
  otherName: string | null
  otherUserId: string
  blockedByMe: boolean
  messages: ThreadMessage[]
}

type ActionResult = { ok: true } | { ok: false; error: string }

/** Resolve a listing's seller (owner) for starting a conversation. */
async function listingSeller(contentItemId: string): Promise<{ sellerId: string | null; title: string }> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('content_items')
      .select('submitted_by, author_id, translations:content_translations(title)')
      .eq('id', contentItemId)
      .maybeSingle()
    const row = data as {
      submitted_by?: string | null
      author_id?: string | null
      translations?: { title?: string | null } | { title?: string | null }[] | null
    } | null
    const tr = Array.isArray(row?.translations) ? row.translations[0] : row?.translations
    return { sellerId: row?.submitted_by ?? row?.author_id ?? null, title: tr?.title ?? 'Listing' }
  } catch {
    return { sellerId: null, title: 'Listing' }
  }
}

/**
 * Open (or reuse) the buyer's conversation about a listing. Sellers land in
 * their own inbox row too (same conversation, other side).
 */
export async function startConversation(
  contentItemId: string,
): Promise<{ ok: true; conversationId: string } | { ok: false; error: string }> {
  const { supabase, user } = await getSessionUser()
  if (!user) return { ok: false, error: 'Not authenticated.' }
  const { sellerId } = await listingSeller(contentItemId)
  if (!sellerId) return { ok: false, error: 'Seller not found.' }
  if (sellerId === user.id) return { ok: false, error: 'This is your own listing.' }
  // W14 safety: a block in either direction freezes new conversations. The
  // error stays generic so the blocked party is never told who blocked whom.
  const { data: blockedPair } = await supabase.rpc('is_blocked_between', {
    a: user.id,
    b: sellerId,
  })
  if (blockedPair === true) return { ok: false, error: 'Could not start the conversation.' }
  const { data: existing } = await supabase
    .from(CONVERSATIONS_TABLE)
    .select('id')
    .eq('content_item_id', contentItemId)
    .eq('buyer_id', user.id)
    .eq('seller_id', sellerId)
    .limit(1)
  const found = ((existing ?? []) as { id: string }[])[0]
  if (found) return { ok: true, conversationId: found.id }
  const { data: created, error } = await supabase
    .from(CONVERSATIONS_TABLE)
    .insert({ content_item_id: contentItemId, buyer_id: user.id, seller_id: sellerId })
    .select('id')
    .single()
  if (error || !created) return { ok: false, error: error?.message ?? 'Could not start the conversation.' }
  return { ok: true, conversationId: (created as { id: string }).id }
}

export async function getInbox(): Promise<ConversationSummary[]> {
  const { supabase, user } = await getSessionUser()
  if (!user) return []
  const { data } = await supabase
    .from(CONVERSATIONS_TABLE)
    .select(
      `id, content_item_id, buyer_id, seller_id, updated_at,
       content:content_items(translations:content_translations(title)),
       messages:listing_conversation_messages(body, created_at)`,
    )
    .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
    .order('updated_at', { ascending: false })
    .limit(50)
  // W14: the blocker stops seeing threads they blocked (the blocked party is
  // not notified — hiding there too would itself reveal the block).
  const { data: myBlocks } = await supabase
    .from('user_blocks')
    .select('blocked_id')
    .eq('blocker_id', user.id)
    .limit(500)
  const hidden = new Set(((myBlocks ?? []) as { blocked_id: string }[]).map((b) => b.blocked_id))
  return ((data ?? []) as unknown as Record<string, unknown>[])
    .filter((row) => {
      const other = (row.buyer_id === user.id ? row.seller_id : row.buyer_id) as string
      return !hidden.has(other)
    })
    .map((row) => {
    const content = (Array.isArray(row.content) ? row.content[0] : row.content) as {
      translations?: { title?: string | null } | { title?: string | null }[] | null
    } | null
    const tr = content?.translations
    const list = Array.isArray(tr) ? tr : tr ? [tr] : []
    const messages = (row.messages ?? []) as { body: string; created_at: string }[]
    const last = [...messages].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0]
    return {
      id: row.id as string,
      contentItemId: row.content_item_id as string,
      listingTitle: list[0]?.title ?? 'Listing',
      otherName: null,
      lastMessage: last?.body.slice(0, 120) ?? null,
      lastMessageAt: last?.created_at ?? null,
      updatedAt: row.updated_at as string,
    }
  })
}

export async function getThread(conversationId: string): Promise<ThreadDetail | null> {
  const { supabase, user } = await getSessionUser()
  if (!user) return null
  const { data: conv } = await supabase
    .from(CONVERSATIONS_TABLE)
    .select(
      `id, content_item_id, buyer_id, seller_id,
       content:content_items(translations:content_translations(title))`,
    )
    .eq('id', conversationId)
    .limit(1)
  const row = ((conv ?? []) as unknown as Record<string, unknown>[])[0]
  if (!row) return null
  if (row.buyer_id !== user.id && row.seller_id !== user.id) return null
  const otherId = row.buyer_id === user.id ? (row.seller_id as string) : (row.buyer_id as string)
  const { data: myBlock } = await supabase
    .from('user_blocks')
    .select('id')
    .eq('blocker_id', user.id)
    .eq('blocked_id', otherId)
    .maybeSingle()
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, full_name')
    .eq('id', otherId)
    .maybeSingle()
  const p = profile as { display_name?: string | null; full_name?: string | null } | null
  const content = (Array.isArray(row.content) ? row.content[0] : row.content) as {
    translations?: { title?: string | null } | { title?: string | null }[] | null
  } | null
  const tr = content?.translations
  const list = Array.isArray(tr) ? tr : tr ? [tr] : []
  const { data: msgs } = await supabase
    .from(MESSAGES_TABLE)
    .select('id, sender_id, body, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(200)
  return {
    id: row.id as string,
    contentItemId: row.content_item_id as string,
    listingTitle: list[0]?.title ?? 'Listing',
    otherName: p?.display_name ?? p?.full_name ?? null,
    otherUserId: otherId,
    blockedByMe: Boolean(myBlock),
    messages: ((msgs ?? []) as { id: string; sender_id: string; body: string; created_at: string }[]).map((m) => ({
      id: m.id,
      senderId: m.sender_id,
      mine: m.sender_id === user.id,
      body: m.body,
      createdAt: m.created_at,
    })),
  }
}

export async function sendMessage(conversationId: string, body: string): Promise<ActionResult> {
  const text = body.trim().slice(0, 2000)
  if (!text) return { ok: false, error: 'Write a message first.' }
  const { supabase, user } = await getSessionUser()
  if (!user) return { ok: false, error: 'Not authenticated.' }
  const { data: conv } = await supabase
    .from(CONVERSATIONS_TABLE)
    .select('id, buyer_id, seller_id')
    .eq('id', conversationId)
    .limit(1)
  const row = ((conv ?? []) as { id: string; buyer_id: string; seller_id: string }[])[0]
  if (!row || (row.buyer_id !== user.id && row.seller_id !== user.id)) {
    return { ok: false, error: 'Conversation not found.' }
  }
  // W14: blocks in either direction freeze the channel (enforced before every
  // insert, per the user_blocks migration); the message stays non-revealing.
  const other = row.buyer_id === user.id ? row.seller_id : row.buyer_id
  const { data: blockedPair } = await supabase.rpc('is_blocked_between', { a: user.id, b: other })
  if (blockedPair === true) return { ok: false, error: 'Conversation not found.' }
  const { error } = await supabase.from(MESSAGES_TABLE).insert({
    conversation_id: conversationId,
    sender_id: user.id,
    body: text,
  })
  if (error) return { ok: false, error: error.message }
  await supabase.from(CONVERSATIONS_TABLE).update({ updated_at: new Date().toISOString() }).eq('id', conversationId)
  revalidatePath('/account/messages', 'page')
  return { ok: true }
}

/**
 * W14 private safety controls. A block is unilateral: the row is RLS-scoped
 * to the blocker, the blocked party gets no notification (start/send fail
 * generically via `is_blocked_between`), and the thread leaves the blocker's
 * inbox. Each action appends a moderation_log row (member insert policy from
 * the user_blocks migration) so trust & safety can audit safety events — the
 * audit is best-effort: a failed log must never keep a harassment victim from
 * blocking.
 */
export async function blockUser(blockedId: string): Promise<ActionResult> {
  const { supabase, user } = await getSessionUser()
  if (!user) return { ok: false, error: 'Not authenticated.' }
  if (!blockedId || blockedId === user.id) return { ok: false, error: 'Could not update this block.' }
  const { error } = await supabase
    .from('user_blocks')
    .upsert(
      { blocker_id: user.id, blocked_id: blockedId },
      { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true },
    )
  if (error) return { ok: false, error: 'Could not update this block.' }
  await supabase.from('moderation_log').insert({
    action: 'user_block',
    actor_id: user.id,
    entity_type: 'user',
    entity_id: blockedId,
  })
  revalidatePath('/account/messages', 'page')
  return { ok: true }
}

export async function unblockUser(blockedId: string): Promise<ActionResult> {
  const { supabase, user } = await getSessionUser()
  if (!user) return { ok: false, error: 'Not authenticated.' }
  if (!blockedId || blockedId === user.id) return { ok: false, error: 'Could not update this block.' }
  const { error } = await supabase
    .from('user_blocks')
    .delete()
    .eq('blocker_id', user.id)
    .eq('blocked_id', blockedId)
  if (error) return { ok: false, error: 'Could not update this block.' }
  await supabase.from('moderation_log').insert({
    action: 'user_unblock',
    actor_id: user.id,
    entity_type: 'user',
    entity_id: blockedId,
  })
  revalidatePath('/account/messages', 'page')
  return { ok: true }
}
