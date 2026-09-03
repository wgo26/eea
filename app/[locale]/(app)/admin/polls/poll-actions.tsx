'use client'

import { useState } from 'react'
import { createPoll, activatePoll, closePoll } from '@/lib/admin/actions'
import { useToast } from '@/components/admin/toast'
import type { Locale, Dictionary } from '@/lib/i18n'

type Copy = Dictionary['admin']['polls']

/** Create form: question, one-option-per-line, optional closes-in-days. */
export function PollCreateForm({ copy, locale }: { copy: Copy; locale: Locale }) {
  const { addToast } = useToast()
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState('')
  const [closesInDays, setClosesInDays] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleCreate() {
    const optionLines = options.split('\n').map((l) => l.trim()).filter(Boolean)
    if (!question.trim() || optionLines.length < 2) {
      addToast(copy.errorMinOptions, 'error')
      return
    }
    setLoading(true)
    const result = await createPoll({
      question,
      options: optionLines,
      locale,
      closesInDays: closesInDays ? Number(closesInDays) : null,
    })
    setLoading(false)
    if (result.ok) {
      addToast(copy.toastCreated, 'success')
      setQuestion('')
      setOptions('')
      setClosesInDays('')
    } else {
      addToast(result.error, 'error')
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-medium">{copy.createTitle}</h2>
      <div className="mt-3 space-y-3">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={copy.questionPlaceholder}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <textarea
          value={options}
          onChange={(e) => setOptions(e.target.value)}
          placeholder={copy.optionsPlaceholder}
          rows={4}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              {copy.closesInDays} <span className="opacity-70">({copy.optional})</span>
            </span>
            <input
              type="number"
              min="1"
              step="1"
              value={closesInDays}
              onChange={(e) => setClosesInDays(e.target.value)}
              className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
          <button
            type="button"
            onClick={handleCreate}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? copy.creating : copy.create}
          </button>
        </div>
      </div>
    </section>
  )
}

/** Per-poll activate/close toggle. */
export function PollRowActions({ poll, copy }: { poll: { id: string; isActive: boolean }; copy: Copy }) {
  const { addToast } = useToast()
  const [loading, setLoading] = useState(false)

  async function handleToggle() {
    setLoading(true)
    const result = poll.isActive ? await closePoll(poll.id) : await activatePoll(poll.id)
    setLoading(false)
    if (result.ok) {
      addToast(poll.isActive ? copy.toastClosed : copy.toastActivated, 'success')
    } else {
      addToast(result.error, 'error')
    }
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={loading}
      className={
        poll.isActive
          ? 'inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 shrink-0'
          : 'inline-flex items-center rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 transition-colors disabled:opacity-50 shrink-0'
      }
    >
      {poll.isActive ? copy.close : copy.activate}
    </button>
  )
}
