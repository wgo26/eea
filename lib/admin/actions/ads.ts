'use server'

import { assertCapability, type AdminContext } from '@/lib/admin/auth'
import { type UpdateOf } from '@/lib/supabase/admin'
import { isAdFormat, sanitizeCreativeHtml, validateCreative, type AdFormat } from '@/lib/ads/creatives'
import { enqueueUser } from '@/lib/notify/queue'
import { type ActionResult, audit, fail, revalidateLocalized, revalidateAdsCache } from './_shared'

/* ------------------------------------------------------------------ */
/* Ads                                                                */
/* ------------------------------------------------------------------ */

export async function createAdvertiser(input: { companyName: string; contactName?: string; email?: string; phone?: string }): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageAds')
    const { error } = await supabase.from('advertisers').insert({
      company_name: input.companyName,
      contact_name: input.contactName ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
    })
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'advertiser:create', notes: input.companyName })
    revalidateLocalized('/admin/ads')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function createAdCampaign(input: {
  slotId: string
  advertiserId: string
  name: string
  destinationUrl?: string
  copyText?: string
  startsAt?: string
  endsAt?: string
  agreedPrice?: number
  currency?: string
  creativeType?: string
  creativeMediaId?: string | null
  mobileCreativeMediaId?: string | null
  posterMediaId?: string | null
  creativeHtml?: string | null
  creativeWidth?: number | null
  creativeHeight?: number | null
}): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageAds')
    if (input.destinationUrl && !/^https:\/\//i.test(input.destinationUrl.trim())) return { ok: false, error: 'Ad destination must use https://.' }
    if (input.startsAt && input.endsAt && new Date(input.endsAt) <= new Date(input.startsAt)) return { ok: false, error: 'Campaign end must be after its start.' }
    const creativeType: AdFormat = isAdFormat(input.creativeType) ? input.creativeType : 'sponsored'
    const creative = await resolveCreativeMedia(supabase, {
      creativeMediaId: input.creativeMediaId,
      mobileCreativeMediaId: input.mobileCreativeMediaId,
      posterMediaId: input.posterMediaId,
      kind: creativeType,
    })
    if (typeof creative === 'string') return { ok: false, error: creative }
    const slot = await getSlotConstraints(supabase, input.slotId)
    const html = creativeType === 'html' ? sanitizeCreativeHtml(input.creativeHtml) : null
    const creativeError = validateCreative({
      format: creativeType,
      allowedFormats: slot?.allowedFormats ?? null,
      maxDurationSeconds: slot?.maxDurationSeconds ?? null,
      desktopUrl: creative.desktopUrl,
      mobileUrl: creative.mobileUrl,
      posterUrl: creative.posterUrl,
      html: creativeType === 'html' ? (html ?? input.creativeHtml ?? null) : null,
      durationSeconds: creative.durationSeconds,
      destinationUrl: input.destinationUrl,
    })
    if (creativeError) return { ok: false, error: creativeError }
    const { error } = await supabase.from('ad_campaigns').insert({
      ad_slot_id: input.slotId,
      advertiser_id: input.advertiserId,
      name: input.name,
      destination_url: input.destinationUrl ?? null,
      copy_text: input.copyText ?? null,
      starts_at: input.startsAt ?? null,
      ends_at: input.endsAt ?? null,
      agreed_price: input.agreedPrice ?? null,
      currency: input.currency ?? null,
      status: 'active',
      creative_type: creativeType,
      creative_media_id: creative.desktopId,
      mobile_creative_media_id: creative.mobileId,
      poster_media_id: creative.posterId,
      creative_html: html,
      creative_width: input.creativeWidth ?? null,
      creative_height: input.creativeHeight ?? null,
      creative_status: creativeType === 'sponsored' ? 'approved' : 'pending',
    })
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, {
      action: 'ad:campaign:create',
      notes: `${input.name} slot=${input.slotId} advertiser=${input.advertiserId} format=${creativeType}`,
    })
    revalidateLocalized('/admin/ads')
    revalidateAdsCache()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/**
 * Resolve creative media references (media_assets id OR https URL) to public
 * https URLs (+ duration) for validation, creating lightweight media_assets
 * rows for pasted URLs so the FK columns stay the single source of truth
 * (same pattern as content syncPhotos). Returns the urls or an error string.
 */
async function resolveCreativeMedia(
  supabase: AdminContext['supabase'],
  input: { creativeMediaId?: string | null; mobileCreativeMediaId?: string | null; posterMediaId?: string | null; kind?: AdFormat },
): Promise<{ desktopId: string | null; mobileId: string | null; posterId: string | null; desktopUrl: string | null; mobileUrl: string | null; posterUrl: string | null; durationSeconds: number | null } | string> {
  const pick = async (ref: string | null | undefined, kind: AdFormat): Promise<{ id: string; url: string | null; duration: number | null } | string> => {
    if (!ref) return { id: '', url: null, duration: null } as unknown as { id: string; url: string | null; duration: number | null }
    const value = ref.trim()
    if (/^https?:\/\//i.test(value)) {
      if (!/^https:\/\//i.test(value)) return 'Creative links must use https://.'
      const { data: existing } = await supabase.from('media_assets').select('id, public_url, duration_seconds').eq('public_url', value).limit(1).maybeSingle()
      if (existing) {
        const row = existing as { id: string; public_url: string | null; duration_seconds: number | null }
        return { id: row.id, url: row.public_url, duration: row.duration_seconds }
      }
      const { data: inserted, error } = await supabase
        .from('media_assets')
        .insert({ kind, provider: 'r2', destination: 'public_photo', public_url: value })
        .select('id, public_url, duration_seconds')
        .single()
      if (error || !inserted) return 'Could not save the creative link.'
      const row = inserted as { id: string; public_url: string | null; duration_seconds: number | null }
      return { id: row.id, url: row.public_url, duration: row.duration_seconds }
    }
    const { data, error } = await supabase.from('media_assets').select('id, public_url, duration_seconds').eq('id', value).maybeSingle()
    if (error) return 'Could not verify creative media.'
    if (!data) return 'A selected creative file no longer exists.'
    const row = data as { id: string; public_url: string | null; duration_seconds: number | null }
    return { id: row.id, url: row.public_url, duration: row.duration_seconds }
  }
  const kind = input.kind ?? 'image'
  const desktop = await pick(input.creativeMediaId, kind === 'sponsored' || kind === 'html' ? 'image' : kind)
  if (typeof desktop === 'string') return desktop
  const mobile = await pick(input.mobileCreativeMediaId, kind === 'video' ? 'video' : 'image')
  if (typeof mobile === 'string') return mobile
  const poster = await pick(input.posterMediaId, 'image')
  if (typeof poster === 'string') return poster
  const durations = [desktop.duration, mobile.duration].filter((d): d is number => typeof d === 'number')
  return {
    desktopId: input.creativeMediaId ? desktop.id || null : null,
    mobileId: input.mobileCreativeMediaId ? mobile.id || null : null,
    posterId: input.posterMediaId ? poster.id || null : null,
    desktopUrl: desktop.url,
    mobileUrl: mobile.url,
    posterUrl: poster.url,
    durationSeconds: durations.length > 0 ? Math.max(...durations) : null,
  }
}

async function getSlotConstraints(
  supabase: AdminContext['supabase'],
  slotId: string,
): Promise<{ allowedFormats: string[]; maxDurationSeconds: number | null } | null> {
  const { data } = await supabase.from('ad_slots').select('allowed_formats, max_duration_seconds').eq('id', slotId).maybeSingle()
  if (!data) return null
  return {
    allowedFormats: Array.isArray((data as { allowed_formats: unknown }).allowed_formats)
      ? ((data as { allowed_formats: string[] }).allowed_formats)
      : [],
    maxDurationSeconds: (data as { max_duration_seconds: number | null }).max_duration_seconds ?? null,
  }
}

/** Approve a campaign's custom creative — only approved creative renders publicly. */
export async function approveCreative(campaignId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageAds')
    const { error } = await supabase
      .from('ad_campaigns')
      .update({ creative_status: 'approved', creative_rejection_reason: null })
      .eq('id', campaignId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'ad:creative:approve', entityType: 'ad_campaign', entityId: campaignId })
    revalidateLocalized('/admin/ads')
    revalidateAdsCache()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/** Reject a campaign's custom creative with a reason — falls back to the text card. */
export async function rejectCreative(campaignId: string, reason: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageAds')
    if (!reason.trim()) return { ok: false, error: 'A rejection reason is required.' }
    const { error } = await supabase
      .from('ad_campaigns')
      .update({ creative_status: 'rejected', creative_rejection_reason: reason.trim() })
      .eq('id', campaignId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'ad:creative:reject', entityType: 'ad_campaign', entityId: campaignId, notes: reason.trim() })
    revalidateLocalized('/admin/ads')
    revalidateAdsCache()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function updateCampaignStatus(campaignId: string, status: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageAds')
    const { error } = await supabase.from('ad_campaigns').update({ status }).eq('id', campaignId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, {
      action: 'ad:campaign:status',
      toStatus: status,
      notes: `campaign=${campaignId}`,
    })
    revalidateLocalized('/admin/ads')
    revalidateAdsCache()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function approveAdInquiry(campaignId: string, input: { slotId: string; startsAt?: string; endsAt?: string; agreedPrice?: number; currency?: string }): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageAds')
    if (input.startsAt && input.endsAt && new Date(input.endsAt) <= new Date(input.startsAt)) return { ok: false, error: 'Campaign end must be after its start.' }
    // Overlap check only makes sense with a real date window — dateless
    // approvals (run indefinitely) must not be blocked by dated campaigns.
    if (input.startsAt && input.endsAt) {
      const { data: overlap } = await supabase.from('ad_campaigns').select('id').eq('ad_slot_id', input.slotId).eq('status', 'active').lt('starts_at', input.endsAt).gt('ends_at', input.startsAt)
      if ((overlap ?? []).some((row) => row.id !== campaignId)) return { ok: false, error: 'This slot is already booked for the selected dates.' }
    }
    const { error } = await supabase.from('ad_campaigns').update({ ad_slot_id: input.slotId, starts_at: input.startsAt ?? null, ends_at: input.endsAt ?? null, agreed_price: input.agreedPrice ?? null, currency: input.currency?.toUpperCase() ?? null, status: 'active', approved_at: new Date().toISOString(), approved_by: user.id }).eq('id', campaignId).eq('status', 'pending')
    if (error) return { ok: false, error: error.message }
    await supabase.from('ad_inquiry_events').insert({ campaign_id: campaignId, actor_id: user.id, event_type: 'approved' })
    await audit(supabase, user.id, { action: 'ad:inquiry:approve', notes: `campaign=${campaignId}` })
    revalidateLocalized('/admin/ads')
    revalidateAdsCache()
    // Close the loop with the advertiser when the inquiry maps to an account.
    void supabase
      .from('ad_campaigns')
      .select('name, advertiser:advertisers(user_id)')
      .eq('id', campaignId)
      .maybeSingle()
      .then((res) => {
        const row = res.data as { name?: string; advertiser?: { user_id?: string | null } | { user_id?: string | null }[] | null } | null
        const adv = Array.isArray(row?.advertiser) ? row.advertiser[0] : row?.advertiser
        if (adv?.user_id) {
          void enqueueUser('advertise.approved', adv.user_id, { company: (row?.name ?? 'your campaign').slice(0, 120) }, '/account/dashboard')
        }
      })
    return { ok: true }
  } catch (e) { return fail(e) }
}

export async function rejectAdInquiry(campaignId: string, reason: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageAds')
    if (!reason.trim()) return { ok: false, error: 'A rejection reason is required.' }
    const { error } = await supabase.from('ad_campaigns').update({ status: 'rejected', rejection_reason: reason.trim() }).eq('id', campaignId).eq('status', 'pending')
    if (error) return { ok: false, error: error.message }
    await supabase.from('ad_inquiry_events').insert({ campaign_id: campaignId, actor_id: user.id, event_type: 'rejected', reason: reason.trim() })
    await audit(supabase, user.id, { action: 'ad:inquiry:reject', notes: `campaign=${campaignId}: ${reason.trim()}` })
    revalidateLocalized('/admin/ads')
    return { ok: true }
  } catch (e) { return fail(e) }
}

/** Delete a pending ad inquiry (spam / stale cleanup). Non-pending rows stay protected. */
export async function deleteAdInquiry(campaignId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageAds')
    const { data: row } = await supabase.from('ad_campaigns').select('id, status').eq('id', campaignId).limit(1)
    const found = (row ?? [])[0] as { id: string; status: string } | undefined
    if (!found) return { ok: false, error: 'Campaign not found.' }
    if (found.status !== 'pending') return { ok: false, error: 'Only pending inquiries can be deleted.' }

    const { error } = await supabase.from('ad_campaigns').delete().eq('id', campaignId)
    if (error) return { ok: false, error: error.message }

    await audit(supabase, user.id, { action: 'ad:inquiry:delete', notes: `campaign=${campaignId}` })
    revalidateLocalized('/admin/ads')
    return { ok: true }
  } catch (e) { return fail(e) }
}

export async function updateAdSlot(slotId: string, input: { name?: string; placement?: string | null; dimensions?: string | null; mobileDimensions?: string | null; allowedFormats?: string[]; maxDurationSeconds?: number | null; capacity?: number; basePrice?: number | null; currency?: string | null; isActive?: boolean }): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageAds')
    if (input.capacity != null && (!Number.isInteger(input.capacity) || input.capacity < 1)) return { ok: false, error: 'Capacity must be a positive whole number.' }
    if (input.allowedFormats !== undefined) {
      const valid = input.allowedFormats.filter((f) => isAdFormat(f))
      if (valid.length === 0) return { ok: false, error: 'A slot must accept at least one format.' }
      input = { ...input, allowedFormats: valid }
    }
    if (input.maxDurationSeconds != null && (!Number.isInteger(input.maxDurationSeconds) || input.maxDurationSeconds < 1)) return { ok: false, error: 'Max duration must be a positive whole number of seconds.' }
    const patch = { name: input.name?.trim(), placement: input.placement?.trim() || null, dimensions: input.dimensions?.trim() || null, mobile_dimensions: input.mobileDimensions?.trim() || null, allowed_formats: input.allowedFormats, max_duration_seconds: input.maxDurationSeconds ?? null, capacity: input.capacity, base_price: input.basePrice ?? null, currency: input.currency?.toUpperCase() || null, is_active: input.isActive }
    if (patch.name === '') return { ok: false, error: 'Slot name is required.' }
    const { error } = await supabase.from('ad_slots').update(patch as UpdateOf<'ad_slots'>).eq('id', slotId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'ad:slot:update', notes: `slot=${slotId}` })
    revalidateLocalized('/admin/ads')
    revalidateAdsCache()
    return { ok: true }
  } catch (e) { return fail(e) }
}

export async function updateAdvertiser(advertiserId: string, input: { companyName: string; contactName?: string; email?: string; phone?: string }): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageAds')
    const companyName = input.companyName.trim()
    if (!companyName) return { ok: false, error: 'Company name is required.' }
    if (input.email && !/^\S+@\S+\.\S+$/.test(input.email.trim())) return { ok: false, error: 'Enter a valid advertiser email.' }
    const { error } = await supabase.from('advertisers').update({
      company_name: companyName,
      contact_name: input.contactName?.trim() || null,
      email: input.email?.trim().toLowerCase() || null,
      phone: input.phone?.trim() || null,
    }).eq('id', advertiserId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'advertiser:update', entityType: 'advertiser', entityId: advertiserId })
    revalidateLocalized('/admin/ads')
    return { ok: true }
  } catch (e) { return fail(e) }
}

export async function deleteAdvertiser(advertiserId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageAds')
    const { count } = await supabase.from('ad_campaigns').select('id', { count: 'exact', head: true }).eq('advertiser_id', advertiserId)
    if ((count ?? 0) > 0) return { ok: false, error: 'Delete or reassign this advertiser\'s campaigns first.' }
    const { error } = await supabase.from('advertisers').delete().eq('id', advertiserId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'advertiser:delete', entityType: 'advertiser', entityId: advertiserId })
    revalidateLocalized('/admin/ads')
    return { ok: true }
  } catch (e) { return fail(e) }
}

export async function updateAdCampaign(campaignId: string, input: { name?: string; slotId?: string | null; destinationUrl?: string | null; copyText?: string | null; startsAt?: string | null; endsAt?: string | null; agreedPrice?: number | null; currency?: string | null; budgetLimit?: number | null; impressionLimit?: number | null; clickLimit?: number | null; creativeType?: string; creativeMediaId?: string | null; mobileCreativeMediaId?: string | null; posterMediaId?: string | null; creativeHtml?: string | null; creativeWidth?: number | null; creativeHeight?: number | null }): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageAds')
    if (input.destinationUrl && !/^https:\/\//i.test(input.destinationUrl.trim())) return { ok: false, error: 'Ad destination must use https://.' }
    if (input.startsAt && input.endsAt && new Date(input.endsAt) <= new Date(input.startsAt)) return { ok: false, error: 'Campaign end must be after its start.' }
    if (input.agreedPrice != null && input.agreedPrice < 0) return { ok: false, error: 'Price cannot be negative.' }
    const patch: Record<string, unknown> = {
      name: input.name?.trim(), ad_slot_id: input.slotId, destination_url: input.destinationUrl?.trim() || null,
      copy_text: input.copyText?.trim() || null, starts_at: input.startsAt || null, ends_at: input.endsAt || null,
      agreed_price: input.agreedPrice ?? null, currency: input.currency?.toUpperCase() || null,
      budget_limit: input.budgetLimit ?? null, impression_limit: input.impressionLimit ?? null, click_limit: input.clickLimit ?? null,
    }
    const touchesCreative =
      input.creativeType !== undefined || input.creativeMediaId !== undefined ||
      input.mobileCreativeMediaId !== undefined || input.posterMediaId !== undefined ||
      input.creativeHtml !== undefined || input.creativeWidth !== undefined || input.creativeHeight !== undefined
    if (touchesCreative) {
      // Load current creative so partial edits validate against the whole.
      const { data: current } = await supabase
        .from('ad_campaigns')
        .select('creative_type, creative_media_id, mobile_creative_media_id, poster_media_id, creative_html, ad_slot_id')
        .eq('id', campaignId)
        .maybeSingle()
      const cur = (current ?? {}) as { creative_type?: string; creative_media_id?: string | null; mobile_creative_media_id?: string | null; poster_media_id?: string | null; creative_html?: string | null; ad_slot_id?: string | null }
      const creativeType: AdFormat = isAdFormat(input.creativeType) ? input.creativeType : isAdFormat(cur.creative_type) ? cur.creative_type : 'sponsored'
      const creative = await resolveCreativeMedia(supabase, {
        creativeMediaId: input.creativeMediaId !== undefined ? input.creativeMediaId : (cur.creative_media_id ?? null),
        mobileCreativeMediaId: input.mobileCreativeMediaId !== undefined ? input.mobileCreativeMediaId : (cur.mobile_creative_media_id ?? null),
        posterMediaId: input.posterMediaId !== undefined ? input.posterMediaId : (cur.poster_media_id ?? null),
        kind: creativeType,
      })
      if (typeof creative === 'string') return { ok: false, error: creative }
      const slot = await getSlotConstraints(supabase, input.slotId ?? cur.ad_slot_id ?? '')
      const html = creativeType === 'html' ? sanitizeCreativeHtml(input.creativeHtml !== undefined ? input.creativeHtml : (cur.creative_html ?? null)) : null
      const creativeError = validateCreative({
        format: creativeType,
        allowedFormats: slot?.allowedFormats ?? null,
        maxDurationSeconds: slot?.maxDurationSeconds ?? null,
        desktopUrl: creative.desktopUrl,
        mobileUrl: creative.mobileUrl,
        posterUrl: creative.posterUrl,
        html: creativeType === 'html' ? (html ?? input.creativeHtml ?? null) : null,
        durationSeconds: creative.durationSeconds,
        destinationUrl: input.destinationUrl ?? undefined,
      })
      if (creativeError) return { ok: false, error: creativeError }
      patch.creative_type = creativeType
      if (input.creativeMediaId !== undefined) patch.creative_media_id = creative.desktopId
      if (input.mobileCreativeMediaId !== undefined) patch.mobile_creative_media_id = creative.mobileId
      if (input.posterMediaId !== undefined) patch.poster_media_id = creative.posterId
      if (creativeType === 'html') patch.creative_html = html
      else if (input.creativeHtml !== undefined) patch.creative_html = null
      if (input.creativeWidth !== undefined) patch.creative_width = input.creativeWidth
      if (input.creativeHeight !== undefined) patch.creative_height = input.creativeHeight
      // Swapping the creative re-arms moderation — the new asset renders
      // only after approval (sponsored text stays live throughout).
      if (creativeType !== 'sponsored') patch.creative_status = 'pending'
    }
    const { error } = await supabase.from('ad_campaigns').update(patch as UpdateOf<'ad_campaigns'>).eq('id', campaignId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'ad:campaign:update', entityType: 'ad_campaign', entityId: campaignId })
    revalidateLocalized('/admin/ads')
    revalidateAdsCache()
    return { ok: true }
  } catch (e) { return fail(e) }
}

export async function deleteAdCampaign(campaignId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageAds')
    const { error } = await supabase.from('ad_campaigns').delete().eq('id', campaignId).in('status', ['pending', 'rejected', 'ended', 'paused'])
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'ad:campaign:delete', entityType: 'ad_campaign', entityId: campaignId })
    revalidateLocalized('/admin/ads')
    revalidateAdsCache()
    return { ok: true }
  } catch (e) { return fail(e) }
}

/* ------------------------------------------------------------------ */
/* Ads business loop (W15): quote → invoice → paid                     */
/* ------------------------------------------------------------------ */

/**
 * W15 — record an invoice against a campaign.
 *
 * The "quote" is the slot rate card / agreed price; this stamps the
 * human-readable reference finance reconciles against, and flips the payment
 * state to `invoiced`. There is deliberately **no payment gateway**: money
 * moves out-of-band (mobile money, transfer) in this market — the product's
 * job is to make the *record* auditable, and every transition writes a
 * moderation_log row so the audit page shows who billed whom.
 *
 * Amount is optional: passing it updates the agreed price (the invoice total
 * becomes the record of truth for that booking); omitting it keeps the quote.
 */
export async function setAdCampaignInvoice(
  campaignId: string,
  input: { reference: string; amount?: number | null },
): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageAds')
    const reference = input.reference.trim()
    // Reference is echoed in the admin table and matched by hand against the
    // ledger: keep it short, printable, and bounded.
    if (reference.length < 3 || reference.length > 64) {
      return { ok: false, error: 'An invoice reference of 3–64 characters is required.' }
    }
    const patch: UpdateOf<'ad_campaigns'> = {
      invoice_reference: reference,
      payment_status: 'invoiced',
    }
    if (input.amount !== undefined && input.amount !== null) {
      if (!Number.isFinite(input.amount) || input.amount < 0) {
        return { ok: false, error: 'The invoice amount must be a positive number.' }
      }
      patch.agreed_price = input.amount
    }
    const { error } = await supabase.from('ad_campaigns').update(patch).eq('id', campaignId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, {
      action: 'ad:campaign:invoice',
      entityType: 'ad_campaign',
      entityId: campaignId,
      toStatus: 'invoiced',
      notes: reference,
    })
    revalidateLocalized('/admin/ads')
    revalidateAdsCache()
    return { ok: true }
  } catch (e) { return fail(e) }
}

/**
 * W15 — mark an invoiced campaign as paid.
 *
 * Refuses to skip the invoice step: an unpaid→paid jump with no reference is
 * exactly the state that makes an ad-revenue ledger unauditable later. The UI
 * also hides the button, but the server is the source of truth.
 */
export async function markAdCampaignPaid(campaignId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageAds')
    const { data: current, error: readError } = await supabase
      .from('ad_campaigns')
      .select('invoice_reference, payment_status')
      .eq('id', campaignId)
      .maybeSingle()
    if (readError) return { ok: false, error: readError.message }
    if (!current) return { ok: false, error: 'Campaign not found.' }
    const row = current as { invoice_reference: string | null; payment_status: string | null }
    if (!row.invoice_reference) {
      return { ok: false, error: 'Record an invoice reference before marking this campaign paid.' }
    }
    if (row.payment_status === 'paid') return { ok: true }
    const { error } = await supabase
      .from('ad_campaigns')
      .update({ payment_status: 'paid' } as UpdateOf<'ad_campaigns'>)
      .eq('id', campaignId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, {
      action: 'ad:campaign:paid',
      entityType: 'ad_campaign',
      entityId: campaignId,
      toStatus: 'paid',
      notes: row.invoice_reference,
    })
    revalidateLocalized('/admin/ads')
    revalidateAdsCache()
    return { ok: true }
  } catch (e) { return fail(e) }
}

/**
 * W15 — void an invoice (wrong reference, cancelled booking, refund).
 *
 * Returns the campaign to `unpaid` and clears the reference so a stale number
 * can never be marked paid later. The audit row keeps the voided reference.
 */
export async function voidAdCampaignInvoice(campaignId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageAds')
    const { data: current, error: readError } = await supabase
      .from('ad_campaigns')
      .select('invoice_reference')
      .eq('id', campaignId)
      .maybeSingle()
    if (readError) return { ok: false, error: readError.message }
    if (!current) return { ok: false, error: 'Campaign not found.' }
    const previous = (current as { invoice_reference: string | null }).invoice_reference
    const { error } = await supabase
      .from('ad_campaigns')
      .update({ invoice_reference: null, payment_status: 'unpaid' } as UpdateOf<'ad_campaigns'>)
      .eq('id', campaignId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, {
      action: 'ad:campaign:invoice:void',
      entityType: 'ad_campaign',
      entityId: campaignId,
      fromStatus: 'invoiced',
      toStatus: 'unpaid',
      notes: previous ?? 'no reference',
    })
    revalidateLocalized('/admin/ads')
    revalidateAdsCache()
    return { ok: true }
  } catch (e) { return fail(e) }
}

export async function createAdSlot(input: { slotKey: string; name: string; placement?: string; dimensions?: string; mobileDimensions?: string; allowedFormats?: string[]; maxDurationSeconds?: number | null; capacity?: number; basePrice?: number; currency?: string }): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageAds')
    const slotKey = input.slotKey.trim().toLowerCase()
    if (!/^[a-z0-9_-]+$/.test(slotKey) || !input.name.trim()) return { ok: false, error: 'Slot key and name are required.' }
    const allowedFormats = (input.allowedFormats ?? ['image', 'sponsored']).filter((f) => isAdFormat(f))
    if (allowedFormats.length === 0) return { ok: false, error: 'A slot must accept at least one format.' }
    if (input.maxDurationSeconds != null && (!Number.isInteger(input.maxDurationSeconds) || input.maxDurationSeconds < 1)) return { ok: false, error: 'Max duration must be a positive whole number of seconds.' }
    const { error } = await supabase.from('ad_slots').insert({ slot_key: slotKey, name: input.name.trim(), placement: input.placement?.trim() || null, dimensions: input.dimensions?.trim() || null, mobile_dimensions: input.mobileDimensions?.trim() || null, allowed_formats: allowedFormats, max_duration_seconds: input.maxDurationSeconds ?? null, capacity: input.capacity ?? 1, base_price: input.basePrice ?? null, currency: input.currency?.toUpperCase() || null })
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'ad:slot:create', entityType: 'ad_slot', notes: slotKey })
    revalidateLocalized('/admin/ads')
    revalidateAdsCache()
    return { ok: true }
  } catch (e) { return fail(e) }
}

export async function deleteAdSlot(slotId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageAds')
    const { count } = await supabase.from('ad_campaigns').select('id', { count: 'exact', head: true }).eq('ad_slot_id', slotId).eq('status', 'active')
    if ((count ?? 0) > 0) return { ok: false, error: 'An active campaign still uses this slot.' }
    const { error } = await supabase.from('ad_slots').delete().eq('id', slotId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'ad:slot:delete', entityType: 'ad_slot', entityId: slotId })
    revalidateLocalized('/admin/ads')
    revalidateAdsCache()
    return { ok: true }
  } catch (e) { return fail(e) }
}
