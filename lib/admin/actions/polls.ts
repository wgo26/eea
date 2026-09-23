'use server'

import { assertAdmin, assertCapability } from '@/lib/admin/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { type UpdateOf } from '@/lib/supabase/admin'
import { type ActionResult, audit, fail, revalidateLocalized } from './_shared'

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
    if (!question || options.length < 2 || options.length > 10) {
      return { ok: false, error: 'A question and between 2 and 10 options are required.' }
    }
    const lowerOptions = options.map((o) => o.toLowerCase())
    if (new Set(lowerOptions).size !== lowerOptions.length) {
      return { ok: false, error: 'Poll options must be unique.' }
    }

    const { supabase, user } = await assertCapability('managePolls')

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

    await audit(supabase, user.id, { action: 'poll:create', notes: `poll=${created.id} ${question}` })
    revalidateLocalized('/admin/polls')
    revalidateLocalized('/')
    revalidateLocalized('/polls')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function updatePoll(
  pollId: string,
  input: {
    question?: string
    options?: string[]
    closesInDays?: number | null
  },
): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('managePolls')
    const { data: poll } = await supabase.from('polls').select('id, is_active').eq('id', pollId).single()
    if (!poll) return { ok: false, error: 'Poll not found.' }
    if (poll.is_active) return { ok: false, error: 'Active polls must be closed before editing.' }
    const { count } = await supabase.from('poll_votes').select('id', { count: 'exact', head: true }).eq('poll_id', pollId)
    const voteCount = count ?? 0

    if (input.options !== undefined && voteCount > 0) {
      return { ok: false, error: 'Options cannot be modified once votes have been cast.' }
    }

    const patch: Record<string, unknown> = {}
    if (input.question !== undefined) {
      const q = input.question.trim()
      if (!q) return { ok: false, error: 'A question is required.' }
      patch.question = q
    }
    if (input.closesInDays !== undefined) {
      patch.closes_at =
        input.closesInDays && input.closesInDays > 0
          ? new Date(Date.now() + input.closesInDays * 86_400_000).toISOString()
          : null
    }

    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from('polls').update(patch as UpdateOf<'polls'>).eq('id', pollId)
      if (error) return { ok: false, error: error.message }
    }

    if (input.options !== undefined && voteCount === 0) {
      const cleaned = input.options.map((o) => o.trim()).filter(Boolean)
      if (cleaned.length < 2 || cleaned.length > 10) {
        return { ok: false, error: 'Polls must have between 2 and 10 options.' }
      }
      const lower = cleaned.map((o) => o.toLowerCase())
      if (new Set(lower).size !== lower.length) {
        return { ok: false, error: 'Poll options must be unique.' }
      }
      const { data: existingOptions } = await supabase.from('poll_options').select('id, label').eq('poll_id', pollId)
      const unused = [...(existingOptions ?? [])]
      const nextOptions = cleaned.map((label, index) => {
        const matchingIndex = unused.findIndex((option) => option.label.trim().toLowerCase() === label.toLowerCase())
        const match = matchingIndex >= 0 ? unused.splice(matchingIndex, 1)[0] : unused.shift()
        return { id: match?.id, poll_id: pollId, label, sort_order: index + 1 }
      })
      const { error: optErr } = await supabase.from('poll_options').upsert(nextOptions, { onConflict: 'id' })
      if (optErr) return { ok: false, error: optErr.message }
      const retainedIds = nextOptions.flatMap((option) => option.id ? [option.id] : [])
      const { error: removeErr } = await supabase.from('poll_options').delete().eq('poll_id', pollId).not('id', 'in', `(${retainedIds.join(',') || '00000000-0000-0000-0000-000000000000'})`)
      if (removeErr) return { ok: false, error: removeErr.message }
    }

    await audit(supabase, user.id, { action: 'poll:update', notes: `poll=${pollId}` })
    revalidateLocalized('/admin/polls')
    revalidateLocalized('/')
    revalidateLocalized('/polls')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function deletePoll(pollId: string, override = false): Promise<ActionResult> {
  try {
    const { user } = await assertCapability('managePolls')
    // Service-role for the destructive work (after the capability check):
    // `poll_votes` has no staff-readable SELECT policy, so a session-client
    // count always undercounted to 0 (hiding the override checkbox) and the
    // session-client vote delete was RLS-blocked — polls with ballots could
    // never be removed from the command center.
    const admin = createAdminClient()
    const { count, error: countErr } = await admin.from('poll_votes').select('id', { count: 'exact', head: true }).eq('poll_id', pollId)
    if (countErr) return { ok: false, error: countErr.message }
    const voteCount = count ?? 0

    if (voteCount > 0 && !override) {
      return {
        ok: false,
        error: `Cannot delete: poll has ${voteCount} vote${voteCount === 1 ? '' : 's'}. Admin override required.`,
      }
    }

    if (voteCount > 0 && override) {
      await assertAdmin()
    }

    const { error: votesErr } = await admin.from('poll_votes').delete().eq('poll_id', pollId)
    if (votesErr) return { ok: false, error: votesErr.message }
    const { error: optionsErr } = await admin.from('poll_options').delete().eq('poll_id', pollId)
    if (optionsErr) return { ok: false, error: optionsErr.message }
    const { error } = await admin.from('polls').delete().eq('id', pollId)
    if (error) return { ok: false, error: error.message }

    await audit(admin, user.id, {
      action: override ? 'poll:delete:override' : 'poll:delete',
      notes: `poll=${pollId} votes=${voteCount}`,
    })
    revalidateLocalized('/admin/polls')
    revalidateLocalized('/')
    revalidateLocalized('/polls')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function exportPollResults(pollId: string): Promise<{
  ok: boolean
  error?: string
  question?: string
  data?: Array<{ label: string; count: number; percentage: number }>
}> {
  try {
    const { supabase } = await assertCapability('managePolls')
    const { data: poll } = await supabase.from('polls').select('id, question').eq('id', pollId).single()
    if (!poll) return { ok: false, error: 'Poll not found.' }

    const { data: options } = await supabase
      .from('poll_options')
      .select('id, label, sort_order')
      .eq('poll_id', pollId)
      .order('sort_order', { ascending: true })

    const { data: votes } = await supabase.from('poll_votes').select('option_id').eq('poll_id', pollId)
    const totalVotes = (votes ?? []).length
    const counts: Record<string, number> = {}
    for (const v of votes ?? []) {
      counts[v.option_id] = (counts[v.option_id] ?? 0) + 1
    }

    const data = (options ?? []).map((o) => {
      const count = counts[o.id] ?? 0
      const percentage = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0
      return { label: o.label, count, percentage }
    })

    return { ok: true, question: poll.question, data }
  } catch (e) {
    return fail(e)
  }
}

export async function activatePoll(pollId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('managePolls')
    const { error } = await supabase.from('polls').update({ is_active: true, closes_at: null }).eq('id', pollId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'poll:activate', notes: `poll=${pollId}` })
    revalidateLocalized('/admin/polls')
    revalidateLocalized('/')
    revalidateLocalized('/polls')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function closePoll(pollId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('managePolls')
    const { error } = await supabase
      .from('polls')
      .update({ is_active: false, closes_at: new Date().toISOString() })
      .eq('id', pollId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'poll:close', notes: `poll=${pollId}` })
    revalidateLocalized('/admin/polls')
    revalidateLocalized('/')
    revalidateLocalized('/polls')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}
