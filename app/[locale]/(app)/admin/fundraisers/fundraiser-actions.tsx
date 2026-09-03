'use client'

import { useState } from 'react'
import { updateFundraiser, closeFundraiser, reopenFundraiser } from '@/lib/admin/actions'
import { useToast } from '@/components/admin/toast'
import type { Dictionary } from '@/lib/i18n'
import type { AdminFundraiserRow } from '@/lib/admin/queries'

type Copy = Dictionary['admin']['fundraisers']

type EditableFundraiser = Pick<
  AdminFundraiserRow,
  'contentItemId' | 'goalAmount' | 'currency' | 'organizerName' | 'donationUrl' | 'verificationNotes' | 'closedAt'
>

/**
 * Inline edit (goal/organizer/donation link/verification notes) plus
 * close/reopen, one card per campaign.
 */
export function FundraiserCard({ row, copy }: { row: EditableFundraiser; copy: Copy }) {
  const { addToast } = useToast()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [goal, setGoal] = useState(row.goalAmount ? String(row.goalAmount) : '')
  const [currency, setCurrency] = useState(row.currency || 'XAF')
  const [organizer, setOrganizer] = useState(row.organizerName ?? '')
  const [donationUrl, setDonationUrl] = useState(row.donationUrl ?? '')
  const [verificationNotes, setVerificationNotes] = useState(row.verificationNotes ?? '')

  async function handleSave() {
    setBusy(true)
    const result = await updateFundraiser(row.contentItemId, {
      goalAmount: goal.trim() ? Number(goal) : null,
      currency,
      organizerName: organizer,
      donationUrl,
      verificationNotes,
    })
    setBusy(false)
    if (result.ok) {
      addToast(copy.toastSaved, 'success')
      setEditing(false)
    } else {
      addToast(result.error, 'error')
    }
  }

  async function handleToggle() {
    setBusy(true)
    const result = row.closedAt ? await reopenFundraiser(row.contentItemId) : await closeFundraiser(row.contentItemId)
    setBusy(false)
    if (result.ok) {
      addToast(row.closedAt ? copy.toastReopened : copy.toastClosed, 'success')
    } else {
      addToast(result.error, 'error')
    }
  }

  if (editing) {
    return (
      <div className="w-full space-y-3 rounded-md border border-border bg-background p-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs text-muted-foreground">{copy.goal}</span>
            <input
              type="number"
              min="0"
              step="any"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground">{copy.currency}</span>
            <input
              type="text"
              maxLength={3}
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
        </div>
        <label className="block">
          <span className="text-xs text-muted-foreground">{copy.organizer}</span>
          <input
            type="text"
            value={organizer}
            onChange={(e) => setOrganizer(e.target.value)}
            placeholder={copy.organizerPlaceholder}
            className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </label>
        <label className="block">
          <span className="text-xs text-muted-foreground">{copy.donationUrl}</span>
          <input
            type="url"
            value={donationUrl}
            onChange={(e) => setDonationUrl(e.target.value)}
            placeholder={copy.donationUrlPlaceholder}
            className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </label>
        <label className="block">
          <span className="text-xs text-muted-foreground">{copy.verification}</span>
          <textarea
            value={verificationNotes}
            onChange={(e) => setVerificationNotes(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </label>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={busy}
            className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            {copy.cancel}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={busy}
            className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {busy ? copy.saving : copy.save}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {copy.edit}
      </button>
      <button
        type="button"
        onClick={handleToggle}
        disabled={busy}
        className={
          row.closedAt
            ? 'inline-flex items-center rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 transition-colors disabled:opacity-50'
            : 'inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-colors disabled:opacity-50'
        }
      >
        {row.closedAt ? copy.reopen : copy.markClosed}
      </button>
    </div>
  )
}

