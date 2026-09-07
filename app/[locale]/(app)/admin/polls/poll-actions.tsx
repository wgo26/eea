'use client'

import { useState } from 'react'
import { createPoll, updatePoll, deletePoll, exportPollResults, activatePoll, closePoll } from '@/lib/admin/actions'
import { useAdminMutation } from '@/components/admin/confirm-dialog'
import { useToast } from '@/components/admin/toast'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Locale, Dictionary } from '@/lib/i18n'

type Copy = Dictionary['admin']['polls']
type CommonCopy = Dictionary['admin']['common']

const inputCls =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary'
const labelCls = 'block text-xs font-medium text-muted-foreground mb-1'
const btnPrimary =
  'inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50'
const btnGhost =
  'inline-flex items-center justify-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50'
const btnDanger =
  'inline-flex items-center justify-center rounded-md border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50'

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
          className={inputCls}
        />
        <textarea
          value={options}
          onChange={(e) => setOptions(e.target.value)}
          placeholder={copy.optionsPlaceholder}
          rows={4}
          className={inputCls}
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
            className={btnPrimary}
          >
            {loading ? copy.creating : copy.create}
          </button>
        </div>
      </div>
    </section>
  )
}

/** Per-poll actions: toggle status, edit, export CSV, and delete. */
export function PollRowActions({
  poll,
  copy,
  common,
  canDelete,
}: {
  poll: {
    id: string
    question: string
    isActive: boolean
    totalVotes: number
    options: Array<{ id: string; label: string }>
  }
  copy: Copy
  common: CommonCopy
  canDelete: boolean
}) {
  const { addToast } = useToast()
  const { run, loading: actionLoading } = useAdminMutation()
  const [toggleLoading, setToggleLoading] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [overrideChecked, setOverrideChecked] = useState(false)

  const [question, setQuestion] = useState(poll.question)
  const [optionsText, setOptionsText] = useState(poll.options.map((o) => o.label).join('\n'))

  async function handleToggle() {
    setToggleLoading(true)
    const result = poll.isActive ? await closePoll(poll.id) : await activatePoll(poll.id)
    setToggleLoading(false)
    if (result.ok) {
      addToast(poll.isActive ? copy.toastClosed : copy.toastActivated, 'success')
    } else {
      addToast(result.error, 'error')
    }
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault()
    const optionLines = poll.totalVotes === 0 ? optionsText.split('\n').map((l) => l.trim()).filter(Boolean) : undefined
    const ok = await run(
      () =>
        updatePoll(poll.id, {
          question,
          options: optionLines,
        }),
      copy.toastUpdated,
    )
    if (ok) setEditOpen(false)
  }

  async function handleDelete() {
    const ok = await run(() => deletePoll(poll.id, overrideChecked), copy.toastDeleted)
    if (ok) setDeleteOpen(false)
  }

  async function handleExportCSV() {
    const res = await exportPollResults(poll.id)
    if (res.ok && res.data) {
      const rows = [['Option', 'Votes', 'Percentage']]
      for (const item of res.data) {
        rows.push([`"${item.label.replace(/"/g, '""')}"`, String(item.count), `${item.percentage}%`])
      }
      const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n')
      const encodedUri = encodeURI(csvContent)
      const link = document.createElement('a')
      link.setAttribute('href', encodedUri)
      link.setAttribute('download', `poll-${poll.id}-results.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } else if (res.error) {
      addToast(res.error, 'error')
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleToggle}
        disabled={toggleLoading}
        className={
          poll.isActive
            ? 'inline-flex items-center rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50'
            : 'inline-flex items-center rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 transition-colors disabled:opacity-50'
        }
      >
        {poll.isActive ? copy.close : copy.activate}
      </button>

      <button type="button" onClick={() => setEditOpen(true)} className={btnGhost}>
        {copy.edit}
      </button>

      <button type="button" onClick={handleExportCSV} className={btnGhost}>
        {copy.exportResults}
      </button>

      {canDelete && (
        <button type="button" onClick={() => setDeleteOpen(true)} className={btnDanger}>
          {copy.delete}
        </button>
      )}

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{copy.editTitle}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div>
              <label className={labelCls}>{copy.question}</label>
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className={labelCls}>{copy.options}</label>
              <textarea
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                disabled={poll.totalVotes > 0}
                rows={4}
                className={inputCls}
              />
              {poll.totalVotes > 0 && (
                <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  {copy.optionsLockedHint.replace('{count}', String(poll.totalVotes))}
                </p>
              )}
            </div>
            <DialogFooter>
              <button type="button" onClick={() => setEditOpen(false)} className={btnGhost} disabled={actionLoading}>
                {common.cancel}
              </button>
              <button type="submit" className={btnPrimary} disabled={actionLoading}>
                {actionLoading ? common.working : common.confirm}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      {deleteOpen && (
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{copy.deleteConfirmTitle}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {copy.deleteConfirmBody.replace('{count}', String(poll.totalVotes))}
              </p>
              {poll.totalVotes > 0 && (
                <label className="flex items-center gap-2 text-xs font-medium text-foreground">
                  <input
                    type="checkbox"
                    checked={overrideChecked}
                    onChange={(e) => setOverrideChecked(e.target.checked)}
                  />
                  {copy.overrideLabel}
                </label>
              )}
            </div>
            <DialogFooter>
              <button type="button" onClick={() => setDeleteOpen(false)} className={btnGhost} disabled={actionLoading}>
                {common.cancel}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className={btnDanger}
                disabled={actionLoading || (poll.totalVotes > 0 && !overrideChecked)}
              >
                {actionLoading ? common.working : copy.delete}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
