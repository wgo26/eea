'use server'

import { revalidateTag } from 'next/cache'
import { assertAnyCapability } from '@/lib/admin/auth'
import { getSessionUser } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { logger } from '@/lib/observability/logger'
import { CACHE_TAGS } from '@/lib/cache/tags'
import { audit, fail, revalidateLocalized } from '@/lib/admin/actions/_shared'
import {
  detectMomoProvider,
  momoLabel,
  newPaymentReference,
  normalizeMomoNumber,
  promotionPlan,
  subscriptionPlan,
} from './plans'

type IntentResult =
  | { ok: true; reference: string; amountXaf: number; provider: string }
  | { ok: false; error: string }
type StaffResult = { ok: true } | { ok: false; error: string }

const STAFF_CAPS = ['manageContent', 'listings.manage'] as const

function bustBillingCache() {
  revalidateTag(CACHE_TAGS.listings, 'max')
  revalidateLocalized('/locations')
  revalidateLocalized('/buy-sell')
}

/** Business the caller may pay for: its owner, or staff. */
async function ownBusiness(
  businessId: string,
): Promise<
  | { db: ReturnType<typeof createAdminClient>; userId: string; businessId: string }
  | { error: string }
> {
  const { user } = await getSessionUser()
  if (!user) return { error: 'Authentication required.' as const }
  const db = createAdminClient()
  const { data } = await db.from('businesses').select('id, owner_id').eq('id', businessId).limit(1)
  const row = ((data ?? []) as { id: string; owner_id: string | null }[])[0]
  if (!row) return { error: 'Business not found.' as const }
  if (row.owner_id !== user.id) {
    try {
      await assertAnyCapability([...STAFF_CAPS])
    } catch {
      return { error: 'This business is not yours.' as const }
    }
  }
  return { db, userId: user.id, businessId: row.id }
}

/** Listing the caller may boost: its owner (submitted_by/author), or staff. */
async function ownListing(
  contentItemId: string,
): Promise<
  | { db: ReturnType<typeof createAdminClient>; userId: string; itemId: string }
  | { error: string }
> {
  const { user } = await getSessionUser()
  if (!user) return { error: 'Authentication required.' as const }
  const db = createAdminClient()
  const { data } = await db
    .from('content_items')
    .select('id, type, submitted_by, author_id')
    .eq('id', contentItemId)
    .limit(1)
  const row = ((data ?? []) as { id: string; type: string; submitted_by: string | null; author_id: string | null }[])[0]
  if (!row || row.type !== 'listing') return { error: 'Listing not found.' as const }
  if (row.submitted_by !== user.id && row.author_id !== user.id) {
    try {
      await assertAnyCapability([...STAFF_CAPS])
    } catch {
      return { error: 'This listing is not yours.' as const }
    }
  }
  return { db, userId: user.id, itemId: row.id }
}

/**
 * Start a pro-subscription payment: creates the pending row and returns the
 * reference the MoMo prompt/webhook will settle against. Money never moves
 * here — activation happens on webhook or staff confirm only.
 */
export async function createSubscriptionIntent(input: {
  businessId: string
  planId: string
  momoNumber: string
}): Promise<IntentResult> {
  // fail-closed: money surface — a limiter outage must block, never allow
  // unlimited payment-intent creation.
  const limited = await checkRateLimit('billing:intent', { max: 10, windowMs: 60_000, policy: 'fail-closed' })
  if (!limited.ok) return { ok: false, error: 'Too many attempts — try again in a minute.' }
  const plan = subscriptionPlan(input.planId)
  if (!plan) return { ok: false, error: 'Unknown plan.' }
  const number = normalizeMomoNumber(input.momoNumber)
  if (!number) return { ok: false, error: 'Enter a valid Cameroon mobile number.' }
  const own = await ownBusiness(input.businessId)
  if ('error' in own) return { ok: false, error: own.error }
  const provider = detectMomoProvider(number)
  const reference = newPaymentReference()
  const { error } = await own.db.from('professional_subscriptions').insert({
    business_id: own.businessId,
    tier: plan.tier,
    plan_id: plan.id,
    amount_xaf: plan.amountXaf,
    days: plan.days,
    status: 'pending',
    momo_provider: provider,
    momo_number: number,
    reference,
    created_by: own.userId,
  })
  if (error) {
    logger.warn('billing/sub-intent', 'insert failed', { error: error.message })
    return { ok: false, error: 'Could not start the payment. Please try again.' }
  }
  return { ok: true, reference, amountXaf: plan.amountXaf, provider: momoLabel(provider) }
}

/** Start a listing-boost payment (same pending → webhook/staff-confirm shape). */
export async function createPromotionIntent(input: {
  contentItemId: string
  planId: string
  momoNumber: string
}): Promise<IntentResult> {
  // fail-closed: money surface (see createSubscriptionIntent).
  const limited = await checkRateLimit('billing:intent', { max: 10, windowMs: 60_000, policy: 'fail-closed' })
  if (!limited.ok) return { ok: false, error: 'Too many attempts — try again in a minute.' }
  const plan = promotionPlan(input.planId)
  if (!plan) return { ok: false, error: 'Unknown plan.' }
  const number = normalizeMomoNumber(input.momoNumber)
  if (!number) return { ok: false, error: 'Enter a valid Cameroon mobile number.' }
  const own = await ownListing(input.contentItemId)
  if ('error' in own) return { ok: false, error: own.error }
  const { data: link } = await own.db
    .from('listings')
    .select('business_id')
    .eq('content_item_id', own.itemId)
    .limit(1)
  const businessId = ((link ?? []) as { business_id: string | null }[])[0]?.business_id ?? null
  const provider = detectMomoProvider(number)
  const reference = newPaymentReference()
  const { error } = await own.db.from('listing_promotions').insert({
    content_item_id: own.itemId,
    business_id: businessId,
    plan_id: plan.id,
    amount_xaf: plan.amountXaf,
    days: plan.days,
    status: 'pending',
    momo_provider: provider,
    momo_number: number,
    reference,
    created_by: own.userId,
  })
  if (error) {
    logger.warn('billing/promo-intent', 'insert failed', { error: error.message })
    return { ok: false, error: 'Could not start the payment. Please try again.' }
  }
  return { ok: true, reference, amountXaf: plan.amountXaf, provider: momoLabel(provider) }
}

async function activateSubscription(
  db: ReturnType<typeof createAdminClient>,
  row: { id: string; business_id: string; plan_id: string; days: number },
  confirmedBy: string | null,
  providerRef?: string,
) {
  const now = Date.now()
  const { error } = await db
    .from('professional_subscriptions')
    .update({
      status: 'active',
      starts_at: new Date(now).toISOString(),
      ends_at: new Date(now + row.days * 86_400_000).toISOString(),
      confirmed_by: confirmedBy,
      provider_ref: providerRef ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .eq('status', 'pending')
  if (error) throw new Error(error.message)
  // Paid featuring is namespaced: expiry only clears what paid set.
  const { error: featErr } = await db
    .from('businesses')
    .update({ is_featured: true, featured_source: 'paid' })
    .eq('id', row.business_id)
  if (featErr) throw new Error(featErr.message)
}

async function activatePromotion(
  db: ReturnType<typeof createAdminClient>,
  row: { id: string; days: number },
) {
  const now = Date.now()
  const { error } = await db
    .from('listing_promotions')
    .update({
      status: 'active',
      starts_at: new Date(now).toISOString(),
      ends_at: new Date(now + row.days * 86_400_000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .eq('status', 'pending')
  if (error) throw new Error(error.message)
}

/**
 * Webhook settlement: flip a pending intent to active by its reference.
 * The amount MUST match the plan price — a callback claiming less (or more)
 * never activates. Idempotent: only `pending` rows move.
 */
export async function settleByReference(input: {
  reference: string
  providerRef?: string
  amountXaf?: number
}): Promise<{ ok: true; kind: 'subscription' | 'promotion' } | { ok: false; error: string }> {
  const db = createAdminClient()
  const ref = input.reference.trim().slice(0, 64)
  if (!ref) return { ok: false, error: 'Missing reference.' }
  const { data: subs } = await db
    .from('professional_subscriptions')
    .select('id, business_id, plan_id, days, amount_xaf, status')
    .eq('reference', ref)
    .limit(1)
  const sub = ((subs ?? []) as { id: string; business_id: string; plan_id: string; days: number; amount_xaf: number; status: string }[])[0]
  if (sub) {
    if (sub.status !== 'pending') return { ok: false, error: 'Already settled.' }
    if (input.amountXaf != null && input.amountXaf !== sub.amount_xaf) {
      logger.warn('billing/settle', 'amount mismatch', { ref })
      return { ok: false, error: 'Amount mismatch.' }
    }
    await activateSubscription(db, sub, null, input.providerRef)
    await db.from('moderation_log').insert({
      action: 'billing:subscription_active',
      entity_type: 'professional_subscription',
      entity_id: sub.id,
      notes: `webhook ${ref}`,
    })
    bustBillingCache()
    return { ok: true, kind: 'subscription' }
  }
  const { data: promos } = await db
    .from('listing_promotions')
    .select('id, days, amount_xaf, status')
    .eq('reference', ref)
    .limit(1)
  const promo = ((promos ?? []) as { id: string; days: number; amount_xaf: number; status: string }[])[0]
  if (promo) {
    if (promo.status !== 'pending') return { ok: false, error: 'Already settled.' }
    if (input.amountXaf != null && input.amountXaf !== promo.amount_xaf) {
      logger.warn('billing/settle', 'amount mismatch', { ref })
      return { ok: false, error: 'Amount mismatch.' }
    }
    await activatePromotion(db, promo)
    await db.from('moderation_log').insert({
      action: 'billing:promotion_active',
      entity_type: 'listing_promotion',
      entity_id: promo.id,
      notes: `webhook ${ref}`,
    })
    bustBillingCache()
    return { ok: true, kind: 'promotion' }
  }
  return { ok: false, error: 'Unknown reference.' }
}

/** Staff manual confirm (the advertise-inquiry precedent): MoMo arrived, webhook didn't. */
export async function confirmSubscriptionIntent(id: string): Promise<StaffResult> {
  try {
    const ctx = await assertAnyCapability([...STAFF_CAPS])
    const db = createAdminClient()
    const { data } = await db
      .from('professional_subscriptions')
      .select('id, business_id, plan_id, days, status')
      .eq('id', id)
      .limit(1)
    const row = ((data ?? []) as { id: string; business_id: string; plan_id: string; days: number; status: string }[])[0]
    if (!row || row.status !== 'pending') return { ok: false, error: 'Intent not found.' }
    await activateSubscription(db, row, ctx.user.id)
    await audit(db, ctx.user.id, {
      action: 'billing:subscription_confirmed',
      entityType: 'professional_subscription',
      entityId: row.id,
    })
    bustBillingCache()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function confirmPromotionIntent(id: string): Promise<StaffResult> {
  try {
    const ctx = await assertAnyCapability([...STAFF_CAPS])
    const db = createAdminClient()
    const { data } = await db
      .from('listing_promotions')
      .select('id, days, status')
      .eq('id', id)
      .limit(1)
    const row = ((data ?? []) as { id: string; days: number; status: string }[])[0]
    if (!row || row.status !== 'pending') return { ok: false, error: 'Intent not found.' }
    await activatePromotion(db, row)
    await audit(db, ctx.user.id, {
      action: 'billing:promotion_confirmed',
      entityType: 'listing_promotion',
      entityId: row.id,
    })
    bustBillingCache()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export type PendingIntent = {
  id: string
  kind: 'subscription' | 'promotion'
  label: string
  amountXaf: number
  provider: string | null
  number: string | null
  reference: string
  createdAt: string
}

/** Staff money queue: every pending intent, newest first. */
export async function getPendingIntents(): Promise<PendingIntent[]> {
  await assertAnyCapability([...STAFF_CAPS])
  const db = createAdminClient()
  const [{ data: subs }, { data: promos }] = await Promise.all([
    db
      .from('professional_subscriptions')
      .select('id, plan_id, amount_xaf, momo_provider, momo_number, reference, created_at, businesses(name)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(50),
    db
      .from('listing_promotions')
      .select('id, plan_id, amount_xaf, momo_provider, momo_number, reference, created_at, content_item_id')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(50),
  ])
  const out: PendingIntent[] = []
  for (const r of ((subs ?? []) as {
    id: string; plan_id: string; amount_xaf: number; momo_provider: string | null;
    momo_number: string | null; reference: string; created_at: string;
    businesses: { name: string } | { name: string }[] | null
  }[])) {
    const b = Array.isArray(r.businesses) ? r.businesses[0] : r.businesses
    out.push({
      id: r.id, kind: 'subscription', label: b?.name ?? r.plan_id,
      amountXaf: r.amount_xaf, provider: r.momo_provider, number: r.momo_number,
      reference: r.reference, createdAt: r.created_at,
    })
  }
  for (const r of ((promos ?? []) as {
    id: string; plan_id: string; amount_xaf: number; momo_provider: string | null;
    momo_number: string | null; reference: string; created_at: string; content_item_id: string
  }[])) {
    out.push({
      id: r.id, kind: 'promotion', label: r.content_item_id.slice(0, 8),
      amountXaf: r.amount_xaf, provider: r.momo_provider, number: r.momo_number,
      reference: r.reference, createdAt: r.created_at,
    })
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export type BillingState = {
  subscription: {
    id: string
    planId: string
    status: string
    endsAt: string | null
    reference: string
  } | null
  promotions: { id: string; planId: string; status: string; endsAt: string | null; reference: string; content_item_id: string }[]
  isOwner: boolean
}

/** Owner-visible billing state for one business (or staff preview). */
export async function getBusinessBilling(businessId: string): Promise<BillingState & { ok: true } | { ok: false; error: string }> {
  const { user } = await getSessionUser()
  const db = createAdminClient()
  const { data: biz } = await db.from('businesses').select('id, owner_id').eq('id', businessId).limit(1)
  const row = ((biz ?? []) as { id: string; owner_id: string | null }[])[0]
  if (!row) return { ok: false, error: 'Business not found.' }
  const isOwner = Boolean(user && row.owner_id === user.id)
  if (!isOwner) {
    try {
      await assertAnyCapability([...STAFF_CAPS])
    } catch {
      return { ok: false, error: 'This business is not yours.' }
    }
  }
  const nowIso = new Date().toISOString()
  const [{ data: subs }, { data: promos }] = await Promise.all([
    db
      .from('professional_subscriptions')
      .select('id, plan_id, status, ends_at, reference')
      .eq('business_id', businessId)
      .in('status', ['pending', 'active'])
      .order('created_at', { ascending: false })
      .limit(5),
    db
      .from('listing_promotions')
      .select('id, plan_id, status, ends_at, reference, content_item_id')
      .eq('business_id', businessId)
      .in('status', ['pending', 'active'])
      .order('created_at', { ascending: false })
      .limit(10),
  ])
  type SubRow = { id: string; plan_id: string; status: string; ends_at: string | null; reference: string }
  type PromoRow = SubRow & { content_item_id: string }
  // Awaiting the sweep: an `active` row past ends_at reads as expired.
  const live = (r: SubRow) => r.status === 'active' && (!r.ends_at || r.ends_at > nowIso)
  const sub = ((subs ?? []) as SubRow[]).find((s) => live(s)) ?? null
  const active = sub
    ? { id: sub.id, planId: sub.plan_id, status: sub.status, endsAt: sub.ends_at, reference: sub.reference }
    : null
  return {
    ok: true,
    subscription: active,
    promotions: ((promos ?? []) as PromoRow[])
      .filter((p) => p.status === 'pending' || live(p))
      .map((p) => ({
        id: p.id,
        planId: p.plan_id,
        status: p.status,
        endsAt: p.ends_at,
        reference: p.reference,
        content_item_id: p.content_item_id,
      })),
    isOwner,
  }
}

/** content_item_ids with a live boost (drives "newest" ranking + badge). */
export async function getActivePromotionMap(): Promise<Record<string, true>> {
  const db = createAdminClient()
  const nowIso = new Date().toISOString()
  const { data, error } = await db
    .from('listing_promotions')
    .select('content_item_id')
    .eq('status', 'active')
    .or(`ends_at.is.null,ends_at.gt.${nowIso}`)
    .limit(500)
  if (error) {
    logger.warn('billing/promo-map', 'query failed', { error: error.message })
    return {}
  }
  const map: Record<string, true> = {}
  for (const r of (data ?? []) as { content_item_id: string }[]) map[r.content_item_id] = true
  return map
}
