'use server'

import { revalidateTag } from 'next/cache'
import { assertAnyCapability } from '@/lib/admin/auth'
import { getSessionUser } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { logger } from '@/lib/observability/logger'
import { CACHE_TAGS } from '@/lib/cache/tags'
import { audit, fail, revalidateLocalized } from '@/lib/admin/actions/_shared'
import { parseSkills, validateClaim, type ClaimInput } from './validate'

type ClaimResult = { ok: true; ref: string } | { ok: false; error: string }
type StaffResult = { ok: true } | { ok: false; error: string }

/**
 * Claim a trusted-professional listing. Guest-friendly (mirrors the
 * submissions model): honeypot + rate limit + length caps at intake, and
 * nothing publishes without staff approval — the review queue is the wall.
 */
export async function submitBusinessClaim(
  input: ClaimInput & { locationId?: string; website?: string },
): Promise<ClaimResult> {
  if (input.website?.trim()) {
    // Honeypot: bots fill it, humans never see it. Fail silently with a fake
    // success so the bot learns nothing.
    return { ok: true, ref: 'received' }
  }
  const limited = await checkRateLimit('directory:claim', {
    max: 5,
    windowMs: 60_000,
    policy: 'fail-open',
  })
  if (!limited.ok) return { ok: false, error: 'Too many attempts — try again in a minute.' }
  const field = validateClaim(input)
  if (field) return { ok: false, error: `Check the ${field} field and try again.` }
  const { user } = await getSessionUser()
  const db = createAdminClient()
  const { data, error } = await db
    .from('business_claims')
    .insert({
      business_name: input.businessName.trim().slice(0, 200),
      claimant_name: input.claimantName.trim().slice(0, 200),
      contact_phone: input.contactPhone.trim().slice(0, 40) || null,
      contact_email: input.contactEmail.trim().slice(0, 200) || null,
      whatsapp: input.whatsapp.trim().slice(0, 40) || null,
      location_id: input.locationId?.trim() || null,
      category_text: input.categoryText.trim().slice(0, 120) || null,
      skills: parseSkills(input.skillsRaw),
      description: input.description.trim().slice(0, 2000) || null,
      created_by: user?.id ?? null,
      status: 'pending',
    })
    .select('id')
  if (error || !data?.[0]) {
    logger.warn('directory/claim', 'insert failed', { error: error?.message })
    return { ok: false, error: 'Could not save your claim. Please try again.' }
  }
  return { ok: true, ref: (data as { id: string }[])[0].id.slice(0, 8) }
}

export type ClaimRow = {
  id: string
  businessName: string
  claimantName: string
  contactPhone: string | null
  contactEmail: string | null
  whatsapp: string | null
  locationName: string | null
  categoryText: string | null
  skills: string[]
  description: string | null
  status: string
  createdAt: string
}

/** Staff review queue (pending first). Same desks that run Listings. */
export async function getClaimsQueue(status = 'pending'): Promise<ClaimRow[]> {
  await assertAnyCapability(['manageContent', 'listings.manage'])
  const db = createAdminClient()
  const { data, error } = await db
    .from('business_claims')
    .select(
      'id, business_name, claimant_name, contact_phone, contact_email, whatsapp, category_text, skills, description, status, created_at, location:locations(name)',
    )
    .eq('status', status)
    .order('created_at', { ascending: true })
    .limit(50)
  if (error) throw new Error(error.message)
  return ((data ?? []) as {
    id: string
    business_name: string
    claimant_name: string
    contact_phone: string | null
    contact_email: string | null
    whatsapp: string | null
    category_text: string | null
    skills: string[] | null
    description: string | null
    status: string
    created_at: string
    location: { name: string | null } | { name: string | null }[] | null
  }[]).map((r) => {
    const loc = Array.isArray(r.location) ? r.location[0] : r.location
    return {
      id: r.id,
      businessName: r.business_name,
      claimantName: r.claimant_name,
      contactPhone: r.contact_phone,
      contactEmail: r.contact_email,
      whatsapp: r.whatsapp,
      locationName: loc?.name ?? null,
      categoryText: r.category_text,
      skills: r.skills ?? [],
      description: r.description,
      status: r.status,
      createdAt: r.created_at,
    }
  })
}

function slugifyName(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'pro'
  )
}

/**
 * Approve a claim: creates (or verifies) the `businesses` row. The pro goes
 * live as verified immediately — approval IS verification, decided by a human
 * reading the claim, not by an algorithm.
 */
export async function approveBusinessClaim(claimId: string): Promise<StaffResult> {
  try {
    const ctx = await assertAnyCapability(['manageContent', 'listings.manage'])
    const db = createAdminClient()
    const { data: claims } = await db.from('business_claims').select('*').eq('id', claimId).limit(1)
    const claim = ((claims ?? []) as Record<string, unknown>[])[0] as
      | {
          id: string
          business_name: string
          claimant_name: string
          contact_phone: string | null
          contact_email: string | null
          whatsapp: string | null
          location_id: string | null
          category_text: string | null
          skills: string[] | null
          description: string | null
          business_id: string | null
          status: string
        }
      | undefined
    if (!claim || claim.status !== 'pending') return { ok: false, error: 'Claim not found.' }

    // The claimant owns the row when they acted signed-in: ownership is what
    // later lets them buy a subscription or boost without staff help. Never
    // steal an existing owner — only fill a vacant one.
    const { data: claimant } = await db
      .from('business_claims')
      .select('created_by')
      .eq('id', claim.id)
      .limit(1)
    const claimantId = ((claimant ?? []) as { created_by: string | null }[])[0]?.created_by ?? null
    let businessId = claim.business_id
    if (businessId) {
      const patch: {
        is_verified?: boolean
        status?: string
        skills?: string[]
        owner_id?: string | null
        updated_at?: string
      } = {
        is_verified: true,
        status: 'active',
        skills: claim.skills ?? [],
        updated_at: new Date().toISOString(),
      }
      if (claimantId) {
        const { data: existing } = await db.from('businesses').select('owner_id').eq('id', businessId).limit(1)
        if (!((existing ?? []) as { owner_id: string | null }[])[0]?.owner_id) {
          patch.owner_id = claimantId
        }
      }
      const { error } = await db.from('businesses').update(patch).eq('id', businessId)
      if (error) throw new Error(error.message)
    } else {
      // Unique slug with a short suffix on collision (never fails the review).
      let slug = slugifyName(claim.business_name)
      const { data: clash } = await db.from('businesses').select('id').eq('slug', slug).limit(1)
      if (clash?.[0]) slug = `${slug}-${claim.id.slice(0, 6)}`
      const { data: created, error } = await db
        .from('businesses')
        .insert({
          name: claim.business_name,
          slug,
          description: claim.description,
          phone: claim.contact_phone,
          email: claim.contact_email,
          whatsapp: claim.whatsapp,
          location_id: claim.location_id,
          owner_id: claimantId,
          skills: claim.skills ?? [],
          is_verified: true,
          is_featured: false,
          status: 'active',
        })
        .select('id')
      if (error || !created?.[0]) throw new Error(error?.message ?? 'Could not create the listing.')
      businessId = (created as { id: string }[])[0].id
      // Best-effort category link: free-text match against the taxonomy.
      if (claim.category_text) {
        const needle = claim.category_text.trim().slice(0, 120)
        const { data: cats } = await db
          .from('categories')
          .select('id, slug')
          .or(`slug.ilike.*${needle}*,slug.eq.${needle.toLowerCase().replace(/\s+/g, '-')}`)
          .limit(1)
        const cat = ((cats ?? []) as { id: string }[])[0]
        if (cat && businessId) {
          await db.from('business_categories').upsert(
            { business_id: businessId, category_id: cat.id },
            { onConflict: 'business_id,category_id' },
          )
        }
      }
    }

    const { error: claimErr } = await db
      .from('business_claims')
      .update({
        status: 'approved',
        business_id: businessId,
        reviewed_by: ctx.user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', claim.id)
    if (claimErr) throw new Error(claimErr.message)
    await audit(db, ctx.user.id, {
      action: 'directory:claim_approved',
      entityType: 'business',
      entityId: businessId,
      notes: claim.business_name,
    })
    revalidateTag(CACHE_TAGS.listings, 'max')
    revalidateLocalized('/professionals')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function rejectBusinessClaim(claimId: string, note?: string): Promise<StaffResult> {
  try {
    const ctx = await assertAnyCapability(['manageContent', 'listings.manage'])
    const db = createAdminClient()
    const { error } = await db
      .from('business_claims')
      .update({
        status: 'rejected',
        review_note: (note ?? '').trim().slice(0, 500) || null,
        reviewed_by: ctx.user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', claimId)
      .eq('status', 'pending')
    if (error) throw new Error(error.message)
    await audit(db, ctx.user.id, {
      action: 'directory:claim_rejected',
      entityType: 'business_claim',
      entityId: claimId,
      notes: (note ?? '').trim().slice(0, 200) || null,
    })
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export type ReviewResult = { ok: true } | { ok: false; error: string }

export type ReviewRow = {
  id: string
  businessId: string
  businessName: string | null
  reviewerName: string
  rating: number
  body: string
  status: string
  createdAt: string
}

/**
 * Review a pro. Open intake (the reviewer hired them, we didn't) with caps;
 * nothing shows until staff approves — the same wall as claims.
 */
export async function submitBusinessReview(input: {
  businessId: string
  reviewerName: string
  rating: number
  body: string
  website?: string
}): Promise<ReviewResult> {
  if (input.website?.trim()) return { ok: true }
  const limited = await checkRateLimit('directory:review', {
    max: 5,
    windowMs: 60_000,
    policy: 'fail-open',
  })
  if (!limited.ok) return { ok: false, error: 'Too many attempts — try again in a minute.' }
  const name = input.reviewerName.trim().slice(0, 200)
  const body = input.body.trim().slice(0, 2000)
  const rating = Math.floor(Number(input.rating))
  if (name.length < 2) return { ok: false, error: 'Tell us your name.' }
  if (!(rating >= 1 && rating <= 5)) return { ok: false, error: 'Pick a rating from 1 to 5.' }
  if (body.length < 10) return { ok: false, error: 'Say a little more (10+ characters).' }
  const { user } = await getSessionUser()
  const db = createAdminClient()
  const { error } = await db.from('business_reviews').insert({
    business_id: input.businessId,
    reviewer_name: name,
    rating,
    body,
    status: 'pending',
    created_by: user?.id ?? null,
  })
  if (error) {
    logger.warn('directory/review', 'insert failed', { error: error.message })
    return { ok: false, error: 'Could not save your review. Please try again.' }
  }
  return { ok: true }
}

/** Staff review queue for pending pro reviews. */
export async function getReviewsQueue(status = 'pending'): Promise<ReviewRow[]> {
  await assertAnyCapability(['manageContent', 'listings.manage'])
  const db = createAdminClient()
  const { data, error } = await db
    .from('business_reviews')
    .select('id, business_id, reviewer_name, rating, body, status, created_at, businesses(name)')
    .eq('status', status)
    .order('created_at', { ascending: true })
    .limit(50)
  if (error) throw new Error(error.message)
  return ((data ?? []) as {
    id: string
    business_id: string
    reviewer_name: string
    rating: number
    body: string
    status: string
    created_at: string
    businesses: { name: string } | { name: string }[] | null
  }[]).map((r) => {
    const b = Array.isArray(r.businesses) ? r.businesses[0] : r.businesses
    return {
      id: r.id,
      businessId: r.business_id,
      businessName: b?.name ?? null,
      reviewerName: r.reviewer_name,
      rating: r.rating,
      body: r.body,
      status: r.status,
      createdAt: r.created_at,
    }
  })
}

export async function approveBusinessReview(id: string): Promise<StaffResult> {
  try {
    const ctx = await assertAnyCapability(['manageContent', 'listings.manage'])
    const db = createAdminClient()
    const { error } = await db
      .from('business_reviews')
      .update({ status: 'approved', reviewed_by: ctx.user.id, reviewed_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'pending')
    if (error) throw new Error(error.message)
    await audit(db, ctx.user.id, {
      action: 'directory:review_approved',
      entityType: 'business_review',
      entityId: id,
    })
    revalidateTag(CACHE_TAGS.listings, 'max')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function rejectBusinessReview(id: string): Promise<StaffResult> {
  try {
    const ctx = await assertAnyCapability(['manageContent', 'listings.manage'])
    const db = createAdminClient()
    const { error } = await db
      .from('business_reviews')
      .update({ status: 'rejected', reviewed_by: ctx.user.id, reviewed_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'pending')
    if (error) throw new Error(error.message)
    await audit(db, ctx.user.id, {
      action: 'directory:review_rejected',
      entityType: 'business_review',
      entityId: id,
    })
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export type BusinessContactResult =
  | { ok: true; contact: { phone: string | null; email: string | null; whatsapp: string | null } }
  | { ok: false; error: 'rate_limited' | 'not_found' | 'db' };

/**
 * Gated pro-contact reveal (parity with seller contact): verified + active
 * rows only, rate-limited, audit-logged best-effort. Nothing in SSR HTML.
 */
export async function revealBusinessContact(businessSlug: string): Promise<BusinessContactResult> {
  const identifier = (businessSlug ?? '').replace(/[,()%\\]/g, ' ').trim().slice(0, 200)
  if (!identifier) return { ok: false, error: 'not_found' }
  const limited = await checkRateLimit('directory:reveal_contact', {
    max: 30,
    windowMs: 60_000,
    policy: 'fail-closed',
  })
  if (!limited.ok) return { ok: false, error: 'rate_limited' }
  try {
    const db = createAdminClient()
    const { data, error } = await db
      .from('businesses')
      .select('id, phone, email, whatsapp')
      .eq('slug', identifier)
      .eq('status', 'active')
      .eq('is_verified', true)
      .limit(1)
    if (error || !data?.[0]) return { ok: false, error: 'not_found' }
    const row = (data as { id: string; phone: string | null; email: string | null; whatsapp: string | null }[])[0]
    try {
      await db.from('moderation_log').insert({
        action: 'contact_reveal',
        entity_type: 'business',
        entity_id: row.id,
        notes: 'pro contact revealed via rate-limited action',
      })
    } catch (logErr) {
      logger.warn('directory/reveal', 'audit log insert failed', {
        error: logErr instanceof Error ? logErr.message : String(logErr),
      })
    }
    return {
      ok: true,
      contact: { phone: row.phone?.trim() || null, email: row.email?.trim() || null, whatsapp: row.whatsapp?.trim() || null },
    }
  } catch (err) {
    logger.error('directory/reveal', 'lookup exception', {
      error: err instanceof Error ? err.message : String(err),
    })
    return { ok: false, error: 'db' }
  }
}
