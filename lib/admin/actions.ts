'use server'

import { revalidatePath } from 'next/cache'
import { assertStaff, assertAdmin, assertCapability } from '@/lib/admin/auth'
import type { AppRole } from '@/lib/admin/queries'

/**
 * Server Functions for the admin section. Every mutation checks authorization
 * via assertStaff/assertAdmin (which throw plain Errors the client can catch),
 * performs the change through the service-role client, then revalidates the
 * affected paths so the UI reflects the new state.
 */

type ActionResult = { ok: true } | { ok: false; error: string }

function fail(e: unknown): ActionResult {
  return { ok: false, error: e instanceof Error ? e.message : 'Operation failed' }
}

/* ------------------------------------------------------------------ */
/* Moderation                                                          */
/* ------------------------------------------------------------------ */

export async function approveSubmission(submissionId: string, notes?: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertStaff()
    const now = new Date().toISOString()

    const { data: sub } = await supabase
      .from('submissions')
      .select('id, submission_type, status, payload, content_item_id')
      .eq('id', submissionId)
      .single()

    if (!sub) return { ok: false, error: 'Submission not found.' }
    if (sub.status !== 'pending') return { ok: false, error: `Submission is already ${sub.status}.` }

    if (sub.content_item_id) {
      const patch: Record<string, unknown> = { status: 'approved', reviewed_at: now }
      if (notes !== undefined) patch.internal_notes = notes
      await supabase.from('submissions').update(patch).eq('id', submissionId)
      await supabase.from('moderation_log').insert({
        action: 'approve', to_status: 'approved', notes: notes ?? null,
        submission_id: submissionId, actor_id: user.id,
      })
      revalidatePath('/admin/moderation')
      revalidatePath('/admin/moderation/[id]', 'page')
      return { ok: true }
    }

    const { data: created, error: createErr } = await supabase
      .from('content_items')
      .insert({ type: sub.submission_type, status: 'draft', submitted_by: user.id })
      .select('id')
      .single()

    if (createErr || !created) return { ok: false, error: createErr?.message ?? 'Could not create content item.' }

    const approvePatch: Record<string, unknown> = { status: 'approved', reviewed_at: now, content_item_id: created.id }
    if (notes !== undefined) approvePatch.internal_notes = notes
    await supabase.from('submissions').update(approvePatch).eq('id', submissionId)
    await supabase.from('moderation_log').insert({
      action: 'approve', to_status: 'approved', notes: notes ?? null,
      submission_id: submissionId, content_item_id: created.id, actor_id: user.id,
    })

    revalidatePath('/admin/moderation')
    revalidatePath('/admin/moderation/[id]', 'page')
    revalidatePath('/admin/content')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function rejectSubmission(submissionId: string, reason: string): Promise<ActionResult> {
  try {
    if (!reason.trim()) return { ok: false, error: 'A reason is required when rejecting.' }
    const { supabase, user } = await assertStaff()
    const now = new Date().toISOString()

    const { data: sub } = await supabase.from('submissions').select('id, status').eq('id', submissionId).single()
    if (!sub) return { ok: false, error: 'Submission not found.' }
    if (sub.status !== 'pending') return { ok: false, error: `Submission is already ${sub.status}.` }

    await supabase.from('submissions').update({ status: 'rejected', reviewed_at: now, rejection_reason: reason }).eq('id', submissionId)
    await supabase.from('moderation_log').insert({
      action: 'reject', to_status: 'rejected', notes: reason,
      submission_id: submissionId, actor_id: user.id,
    })

    revalidatePath('/admin/moderation')
    revalidatePath('/admin/moderation/[id]', 'page')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function updateSubmissionNotes(submissionId: string, notes: string): Promise<ActionResult> {
  try {
    const { supabase } = await assertStaff()
    const { error } = await supabase.from('submissions').update({ internal_notes: notes }).eq('id', submissionId)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/admin/moderation')
    revalidatePath('/admin/moderation/[id]', 'page')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/* ------------------------------------------------------------------ */
/* Content status transitions                                          */
/* ------------------------------------------------------------------ */

export async function updateContentStatus(contentId: string, status: string, scheduledFor?: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertStaff()
    const patch: Record<string, unknown> = { status }
    if (status === 'published') patch.published_at = new Date().toISOString()
    if (status === 'scheduled' && scheduledFor) patch.scheduled_for = scheduledFor

    const { error } = await supabase.from('content_items').update(patch).eq('id', contentId)
    if (error) return { ok: false, error: error.message }

    await supabase.from('moderation_log').insert({
      action: `status:${status}`, to_status: status, content_item_id: contentId, actor_id: user.id,
    })

    revalidatePath('/admin/content')
    revalidatePath('/admin/dashboard')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function setContentFeatured(contentId: string, isFeatured: boolean): Promise<ActionResult> {
  try {
    const { supabase } = await assertStaff()
    const { error } = await supabase.from('content_items').update({ is_featured: isFeatured }).eq('id', contentId)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/admin/content')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function archiveContent(contentId: string): Promise<ActionResult> {
  try {
    const { supabase } = await assertStaff()
    const { error } = await supabase.from('content_items').update({ is_archived: true, is_featured: false }).eq('id', contentId)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/admin/content')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/* ------------------------------------------------------------------ */
/* Homepage curation                                                  */
/* ------------------------------------------------------------------ */

export async function assignHomepageSlot(slotId: string, contentItemId: string | null): Promise<ActionResult> {
  try {
    const { supabase } = await assertStaff()
    const { error } = await supabase.from('homepage_slots').update({ content_item_id: contentItemId }).eq('id', slotId)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/admin/content')
    revalidatePath('/admin/dashboard')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function toggleSlotActive(slotId: string, isActive: boolean): Promise<ActionResult> {
  try {
    const { supabase } = await assertStaff()
    const { error } = await supabase.from('homepage_slots').update({ is_active: isActive }).eq('id', slotId)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/admin/content')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/* ------------------------------------------------------------------ */
/* User roles (admin only)                                             */
/* ------------------------------------------------------------------ */

export async function setUserRole(userId: string, role: AppRole, assign: boolean): Promise<ActionResult> {
  try {
    const { supabase } = await assertAdmin()
    if (assign) {
      const { error } = await supabase.from('user_roles').upsert({ user_id: userId, role })
      if (error) return { ok: false, error: error.message }
    } else {
      const { error } = await supabase.from('user_roles').delete().eq('user_id', userId).eq('role', role)
      if (error) return { ok: false, error: error.message }
    }
    revalidatePath('/admin/users')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/* ------------------------------------------------------------------ */
/* Ads                                                                */
/* ------------------------------------------------------------------ */

export async function createAdvertiser(input: { companyName: string; contactName?: string; email?: string; phone?: string }): Promise<ActionResult> {
  try {
    const { supabase } = await assertStaff()
    const { error } = await supabase.from('advertisers').insert({
      company_name: input.companyName,
      contact_name: input.contactName ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
    })
    if (error) return { ok: false, error: error.message }
    revalidatePath('/admin/ads')
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
}): Promise<ActionResult> {
  try {
    const { supabase } = await assertStaff()
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
    })
    if (error) return { ok: false, error: error.message }
    revalidatePath('/admin/ads')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function updateCampaignStatus(campaignId: string, status: string): Promise<ActionResult> {
  try {
    const { supabase } = await assertStaff()
    const { error } = await supabase.from('ad_campaigns').update({ status }).eq('id', campaignId)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/admin/ads')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/* ------------------------------------------------------------------ */
/* Community polls                                                     */
/* ------------------------------------------------------------------ */

export async function createPoll(input: {
  question: string
  options: string[]
  locale?: string
  closesInDays?: number | null
}): Promise<ActionResult> {
  try {
    const question = input.question.trim()
    const options = input.options.map((o) => o.trim()).filter(Boolean)
    if (!question || options.length < 2) {
      return { ok: false, error: 'A question and at least two options are required.' }
    }

    const { supabase } = await assertCapability('managePolls')

    const closesAt =
      input.closesInDays && input.closesInDays > 0
        ? new Date(Date.now() + input.closesInDays * 86_400_000).toISOString()
        : null

    const { data: created, error: createErr } = await supabase
      .from('polls')
      .insert({ question, locale: input.locale ?? 'en', is_active: true, closes_at: closesAt })
      .select('id')
      .single()
    if (createErr || !created) return { ok: false, error: createErr?.message ?? 'Could not create the poll.' }

    const { error: optionsErr } = await supabase
      .from('poll_options')
      .insert(options.map((label, index) => ({ poll_id: created.id, label, sort_order: index + 1 })))
    if (optionsErr) return { ok: false, error: optionsErr.message }

    revalidatePath('/admin/polls')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function activatePoll(pollId: string): Promise<ActionResult> {
  try {
    const { supabase } = await assertCapability('managePolls')
    // Clearing closes_at keeps a re-activated poll from instantly looking
    // expired to readers.
    const { error } = await supabase.from('polls').update({ is_active: true, closes_at: null }).eq('id', pollId)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/admin/polls')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function closePoll(pollId: string): Promise<ActionResult> {
  try {
    const { supabase } = await assertCapability('managePolls')
    const { error } = await supabase
      .from('polls')
      .update({ is_active: false, closes_at: new Date().toISOString() })
      .eq('id', pollId)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/admin/polls')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/* ------------------------------------------------------------------ */
/* Fundraising campaigns                                               */
/* ------------------------------------------------------------------ */

export async function updateFundraiser(
  contentItemId: string,
  input: {
    goalAmount?: number | null
    currency?: string
    organizerName?: string | null
    donationUrl?: string | null
    verificationNotes?: string | null
  },
): Promise<ActionResult> {
  try {
    if (input.goalAmount !== undefined && input.goalAmount !== null && input.goalAmount < 0) {
      return { ok: false, error: 'The goal cannot be negative.' }
    }
    if (input.donationUrl && !/^https?:\/\//i.test(input.donationUrl.trim())) {
      return { ok: false, error: 'The donation link must start with http:// or https://.' }
    }

    const { supabase } = await assertCapability('manageFundraisers')

    const patch: Record<string, unknown> = {}
    if (input.goalAmount !== undefined) patch.goal_amount = input.goalAmount
    if (input.currency) patch.currency = input.currency.toUpperCase().slice(0, 3)
    if (input.organizerName !== undefined) patch.organizer_name = input.organizerName || null
    if (input.donationUrl !== undefined) patch.donation_url = input.donationUrl?.trim() || null
    if (input.verificationNotes !== undefined) patch.verification_notes = input.verificationNotes || null
    if (Object.keys(patch).length === 0) return { ok: true }

    const { error } = await supabase.from('fundraisers').update(patch).eq('content_item_id', contentItemId)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/admin/fundraisers')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function closeFundraiser(contentItemId: string): Promise<ActionResult> {
  try {
    const { supabase } = await assertCapability('manageFundraisers')
    const { error } = await supabase
      .from('fundraisers')
      .update({ closed_at: new Date().toISOString() })
      .eq('content_item_id', contentItemId)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/admin/fundraisers')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function reopenFundraiser(contentItemId: string): Promise<ActionResult> {
  try {
    const { supabase } = await assertCapability('manageFundraisers')
    const { error } = await supabase.from('fundraisers').update({ closed_at: null }).eq('content_item_id', contentItemId)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/admin/fundraisers')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/* ------------------------------------------------------------------ */
/* Storage / backup                                                    */
/* ------------------------------------------------------------------ */

export async function triggerBackup(): Promise<ActionResult> {
  try {
    const { supabase } = await assertAdmin()
    const { error } = await supabase
      .from('media_assets')
      .update({ backup_requested_at: new Date().toISOString() })
      .eq('provider', 'r2')
      .is('backed_up_at', null)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/admin/storage-backup')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}
