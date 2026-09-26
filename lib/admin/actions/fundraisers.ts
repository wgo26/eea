'use server'

import { assertAdmin, assertCapability } from '@/lib/admin/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { type UpdateOf } from '@/lib/supabase/admin'
import { type ActionResult, audit, fail, revalidateLocalized } from './_shared'
import { deleteContentItem } from './content'

/* ------------------------------------------------------------------ */
/* Fundraising campaigns                                               */
/* ------------------------------------------------------------------ */

export async function createFundraiser(input: {
  titleEn: string
  titleFr?: string
  descriptionEn: string
  descriptionFr?: string
  goalAmount: number
  currency?: string
  organizerName?: string
  donationUrl?: string
  payoutMethod?: 'momo' | 'bank'
  payoutAccount?: string
  payoutAccountName?: string
}): Promise<ActionResult> {
  try {
    const titleEn = input.titleEn.trim()
    const descEn = input.descriptionEn.trim()
    if (!titleEn || !descEn) return { ok: false, error: 'English title and description are required.' }
    if (input.goalAmount <= 0) return { ok: false, error: 'Goal amount must be greater than zero.' }
    const currency = (input.currency || 'XAF').toUpperCase()
    if (!(FUNDRAISER_CURRENCIES as readonly string[]).includes(currency)) return { ok: false, error: 'Unsupported fundraiser currency.' }
    if (input.donationUrl && !/^https?:\/\//i.test(input.donationUrl.trim())) {
      return { ok: false, error: 'The donation link must start with http:// or https://.' }
    }

    const { supabase, user } = await assertCapability('manageFundraisers')
    const slug = `fundraiser-${Date.now()}`

    // Insert as draft, create the fundraiser detail row, then flip to
    // published: the location-publish trigger (20261112000000) exempts items
    // that already have a fundraisers row at flip time, and a brand-new id is
    // invisible to it before the insert — so the publish step must come last.
    const { data: created, error: cErr } = await supabase
      .from('content_items')
      .insert({ type: 'culture', slug, status: 'draft', author_id: user.id })
      .select('id')
      .single()
    if (cErr || !created) return { ok: false, error: cErr?.message ?? 'Could not create fundraiser item.' }

    // Insert the FR translation only when FR copy was actually provided.
    // The old `|| titleEn` fallback persisted English text as the French
    // translation, so French pages showed English content stored as "fr".
    const rows: { content_item_id: string; locale: string; title: string | null; body: string | null }[] = [
      { content_item_id: created.id, locale: 'en', title: titleEn, body: descEn },
    ]
    const titleFr = input.titleFr?.trim()
    const descFr = input.descriptionFr?.trim()
    if (titleFr || descFr) {
      rows.push({
        content_item_id: created.id,
        locale: 'fr',
        title: titleFr || null,
        body: descFr || null,
      })
    }
    const { error: translationError } = await supabase.from('content_translations').insert(rows)
    if (translationError) {
      await supabase.from('content_items').delete().eq('id', created.id)
      return { ok: false, error: translationError.message }
    }

    const { error: fErr } = await supabase.from('fundraisers').insert({
      content_item_id: created.id,
      goal_amount: input.goalAmount,
      currency,
      organizer_name: input.organizerName?.trim() || null,
      donation_url: input.donationUrl?.trim() || null,
      payout_method: input.payoutMethod ?? null,
      payout_account: input.payoutAccount?.trim() || null,
      payout_account_name: input.payoutAccountName?.trim() || null,
      // raised_amount is the running total (see init schema); current_amount
      // was never a column — caught by the generated database types (A6).
      raised_amount: 0,
    })
    if (fErr) {
      await supabase.from('content_items').delete().eq('id', created.id)
      return { ok: false, error: fErr.message }
    }

    // Fundraisers are place-optional (goal/progress, not coverage): flip to
    // published now that the fundraisers row exists so the location-publish
    // trigger exempts it.
    const { error: flipErr } = await supabase
      .from('content_items')
      .update({ status: 'published', published_at: new Date().toISOString() })
      .eq('id', created.id)
    if (flipErr) {
      await supabase.from('fundraisers').delete().eq('content_item_id', created.id)
      await supabase.from('content_items').delete().eq('id', created.id)
      return { ok: false, error: flipErr.message }
    }

    await audit(supabase, user.id, { action: 'fundraiser:create', contentItemId: created.id, notes: titleEn })
    revalidateLocalized('/admin/fundraisers')
    revalidateLocalized('/')
    revalidateLocalized('/fundraisers')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function updateFundraiser(
  contentItemId: string,
  input: {
    goalAmount?: number | null
    currency?: string
    organizerName?: string | null
    donationUrl?: string | null
    payoutMethod?: 'momo' | 'bank' | null
    payoutAccount?: string | null
    payoutAccountName?: string | null
    verificationNotes?: string | null
    titleEn?: string | null
    titleFr?: string | null
    descriptionEn?: string | null
    descriptionFr?: string | null
  },
): Promise<ActionResult> {
  try {
    if (input.goalAmount !== undefined && input.goalAmount !== null && input.goalAmount < 0) {
      return { ok: false, error: 'The goal cannot be negative.' }
    }
    if (input.donationUrl && !/^https?:\/\//i.test(input.donationUrl.trim())) {
      return { ok: false, error: 'The donation link must start with http:// or https://.' }
    }
    if (input.payoutMethod && !['momo', 'bank'].includes(input.payoutMethod)) {
      return { ok: false, error: 'Unsupported payout method.' }
    }
    if (input.payoutMethod && !input.payoutAccount?.trim()) {
      return { ok: false, error: 'A payout account is required.' }
    }
    if (input.currency && !(FUNDRAISER_CURRENCIES as readonly string[]).includes(input.currency.toUpperCase())) {
      return { ok: false, error: 'Unsupported fundraiser currency.' }
    }

    const { supabase, user } = await assertCapability('manageFundraisers')
    const { data: current } = await supabase.from('fundraisers').select('raised_amount').eq('content_item_id', contentItemId).single()
    const currentAmount = current?.raised_amount ?? 0

    if ((input.goalAmount !== undefined || input.currency) && currentAmount > 0) {
      await assertAdmin()
    }

    const patch: Record<string, unknown> = {}
    if (input.goalAmount !== undefined) patch.goal_amount = input.goalAmount
    if (input.currency) patch.currency = input.currency.toUpperCase()
    if (input.organizerName !== undefined) patch.organizer_name = input.organizerName || null
    if (input.donationUrl !== undefined) patch.donation_url = input.donationUrl?.trim() || null
    if (input.payoutMethod !== undefined) patch.payout_method = input.payoutMethod
    if (input.payoutAccount !== undefined) patch.payout_account = input.payoutAccount?.trim() || null
    if (input.payoutAccountName !== undefined) patch.payout_account_name = input.payoutAccountName?.trim() || null
    if (input.verificationNotes !== undefined) patch.verification_notes = input.verificationNotes || null
    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from('fundraisers').update(patch as UpdateOf<'fundraisers'>).eq('content_item_id', contentItemId)
      if (error) return { ok: false, error: error.message }
    }

    // Bilingual story fields live on content_translations (same model as
    // content create/edit). Upsert EN when provided; FR upserts when
    // non-empty and deletes when cleared so "FR missing" stays visible
    // instead of persisting stale copy.
    const storyTouched =
      input.titleEn !== undefined ||
      input.descriptionEn !== undefined ||
      input.titleFr !== undefined ||
      input.descriptionFr !== undefined
    if (storyTouched) {
      const { data: existing } = await supabase
        .from('content_translations')
        .select('locale, title, body')
        .eq('content_item_id', contentItemId)
      const rows = (existing ?? []) as { locale: string; title: string | null; body: string | null }[]
      const enRow = rows.find((r) => r.locale === 'en')
      const frRow = rows.find((r) => r.locale === 'fr')
      const nextEnTitle = input.titleEn !== undefined ? input.titleEn?.trim() || '' : (enRow?.title ?? '')
      const nextEnBody = input.descriptionEn !== undefined ? input.descriptionEn?.trim() || '' : (enRow?.body ?? '')
      if (!nextEnTitle) return { ok: false, error: 'English title is required.' }
      const { error: enErr } = await supabase.from('content_translations').upsert(
        { content_item_id: contentItemId, locale: 'en', voice: 'formal', title: nextEnTitle, body: nextEnBody || null },
        { onConflict: 'content_item_id,locale,voice' },
      )
      if (enErr) return { ok: false, error: enErr.message }
      const nextFrTitle = input.titleFr !== undefined ? input.titleFr?.trim() || '' : (frRow?.title ?? '')
      const nextFrBody = input.descriptionFr !== undefined ? input.descriptionFr?.trim() || '' : (frRow?.body ?? '')
      if (nextFrTitle || nextFrBody) {
        const { error: frErr } = await supabase.from('content_translations').upsert(
          { content_item_id: contentItemId, locale: 'fr', voice: 'formal', title: nextFrTitle || null, body: nextFrBody || null },
          { onConflict: 'content_item_id,locale,voice' },
        )
        if (frErr) return { ok: false, error: frErr.message }
      } else if (input.titleFr !== undefined || input.descriptionFr !== undefined) {
        await supabase.from('content_translations').delete().eq('content_item_id', contentItemId).eq('locale', 'fr')
      }
    }
    if (Object.keys(patch).length === 0 && !storyTouched) return { ok: true }
    await audit(supabase, user.id, {
      action: 'fundraiser:update',
      contentItemId,
      notes: Object.keys(patch).join(','),
    })
    revalidateLocalized('/admin/fundraisers')
    revalidateLocalized('/')
    revalidateLocalized('/fundraisers')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function closeFundraiser(contentItemId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageFundraisers')
    const { error } = await supabase
      .from('fundraisers')
      .update({ closed_at: new Date().toISOString() })
      .eq('content_item_id', contentItemId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'fundraiser:close', contentItemId })
    revalidateLocalized('/admin/fundraisers')
    revalidateLocalized('/')
    revalidateLocalized('/fundraisers')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function reopenFundraiser(contentItemId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageFundraisers')
    const { error } = await supabase.from('fundraisers').update({ closed_at: null }).eq('content_item_id', contentItemId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'fundraiser:reopen', contentItemId })
    revalidateLocalized('/admin/fundraisers')
    revalidateLocalized('/')
    revalidateLocalized('/fundraisers')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function deleteFundraiser(contentItemId: string): Promise<ActionResult> {
  try {
    await assertAdmin()
    // Service-role lookup (after the admin check): the session client has no
    // DELETE-adjacent guarantees on fundraisers and previously surfaced RLS
    // errors instead of deleting seeded "dummy" campaigns.
    const admin = createAdminClient()
    const { data: fundraiser, error: lookupErr } = await admin
      .from('fundraisers')
      .select('content_item_id')
      .eq('content_item_id', contentItemId)
      .single()
    if (lookupErr || !fundraiser) return { ok: false, error: 'Fundraiser not found.' }
    const result = await deleteContentItem(contentItemId)
    if (result.ok) {
      revalidateLocalized('/admin/fundraisers')
      revalidateLocalized('/')
      revalidateLocalized('/fundraisers')
    }
    return result
  } catch (e) {
    return fail(e)
  }
}
const FUNDRAISER_CURRENCIES = ['XAF', 'EUR', 'USD', 'GBP'] as const
