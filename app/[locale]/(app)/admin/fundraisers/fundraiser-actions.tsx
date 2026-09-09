'use client'

import { useState } from 'react'
import { createFundraiser, updateFundraiser, closeFundraiser, reopenFundraiser, deleteFundraiser } from '@/lib/admin/actions'
import { ConfirmDialog, useAdminMutation } from '@/components/admin/confirm-dialog'
import { useToast } from '@/components/admin/toast'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Dictionary } from '@/lib/i18n'
import type { AdminFundraiserRow } from '@/lib/admin/queries'

type Copy = Dictionary['admin']['fundraisers']
type CommonCopy = Dictionary['admin']['common']

type EditableFundraiser = Pick<
  AdminFundraiserRow,
  'contentItemId' | 'goalAmount' | 'raisedAmount' | 'currency' | 'organizerName' | 'donationUrl' | 'verificationNotes' | 'closedAt' | 'payoutMethod' | 'payoutAccount' | 'payoutAccountName' | 'storyTitleEn' | 'storyTitleFr' | 'storyBodyEn' | 'storyBodyFr' | 'missingLocale'
>

const inputCls =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary'
const labelCls = 'block text-xs font-medium text-muted-foreground mb-1'
const btnPrimary =
  'inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50'
const btnGhost =
  'inline-flex items-center justify-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50'
const btnDanger =
  'inline-flex items-center justify-center rounded-md border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50'

/** Create Fundraiser Form */
export function FundraiserCreateForm({ copy, common }: { copy: Copy; common: CommonCopy }) {
  const { run, loading } = useAdminMutation()
  const [open, setOpen] = useState(false)
  const [titleEn, setTitleEn] = useState('')
  const [titleFr, setTitleFr] = useState('')
  const [descEn, setDescEn] = useState('')
  const [descFr, setDescFr] = useState('')
  const [goal, setGoal] = useState('')
  const [currency, setCurrency] = useState('XAF')
  const [organizer, setOrganizer] = useState('')
  const [donationUrl, setDonationUrl] = useState('')
  const [payoutMethod, setPayoutMethod] = useState<'momo' | 'bank' | ''>('')
  const [payoutAccount, setPayoutAccount] = useState('')
  const [payoutAccountName, setPayoutAccountName] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const goalAmount = Number(goal)
    if (!goalAmount || goalAmount <= 0) return

    const ok = await run(
      () =>
        createFundraiser({
          titleEn,
          titleFr,
          descriptionEn: descEn,
          descriptionFr: descFr,
          goalAmount,
          currency,
          organizerName: organizer,
          donationUrl,
          payoutMethod: payoutMethod || undefined,
          payoutAccount,
          payoutAccountName,
        }),
      copy.toastSaved,
    )
    if (ok) {
      setTitleEn('')
      setTitleFr('')
      setDescEn('')
      setDescFr('')
      setGoal('')
      setOrganizer('')
      setDonationUrl('')
      setOpen(false)
    }
  }

  return (
    <>
      <div className="flex justify-end">
        <button type="button" onClick={() => setOpen(true)} className={btnPrimary}>
          {copy.createTitle}
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-xl">
          <DialogHeader>
            <DialogTitle>{copy.createTitle}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>{copy.titleEn}</label>
                <input value={titleEn} onChange={(e) => setTitleEn(e.target.value)} className={inputCls} required />
              </div>
              <div>
                <label className={labelCls}>{copy.titleFr}</label>
                <input value={titleFr} onChange={(e) => setTitleFr(e.target.value)} className={inputCls} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block"><span className={labelCls}>{copy.payoutMethod}</span><select value={payoutMethod} onChange={(e) => setPayoutMethod(e.target.value as 'momo' | 'bank' | '')} className={inputCls}><option value="">{copy.payoutNone}</option><option value="momo">{common.payoutMethods?.momo ?? 'MoMo'}</option><option value="bank">{common.payoutMethods?.bank ?? 'Bank'}</option></select></label>
              <label className="block"><span className={labelCls}>{copy.payoutAccount}</span><input value={payoutAccount} onChange={(e) => setPayoutAccount(e.target.value)} className={inputCls} /></label>
              <label className="block"><span className={labelCls}>{copy.payoutAccountName}</span><input value={payoutAccountName} onChange={(e) => setPayoutAccountName(e.target.value)} className={inputCls} /></label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>{copy.descEn}</label>
                <textarea value={descEn} onChange={(e) => setDescEn(e.target.value)} rows={3} className={inputCls} required />
              </div>
              <div>
                <label className={labelCls}>{copy.descFr}</label>
                <textarea value={descFr} onChange={(e) => setDescFr(e.target.value)} rows={3} className={inputCls} />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>{copy.goal}</label>
                <input type="number" min="1" value={goal} onChange={(e) => setGoal(e.target.value)} className={inputCls} required />
              </div>
              <div>
                <label className={labelCls}>{copy.currency}</label>
                <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} className={inputCls} />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>{copy.organizer}</label>
                <input value={organizer} onChange={(e) => setOrganizer(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{copy.donationUrl}</label>
                <input type="url" value={donationUrl} onChange={(e) => setDonationUrl(e.target.value)} className={inputCls} placeholder="https://…" />
              </div>
            </div>

            <DialogFooter>
              <button type="button" onClick={() => setOpen(false)} className={btnGhost} disabled={loading}>
                {common.cancel}
              </button>
              <button type="submit" className={btnPrimary} disabled={loading}>
                {loading ? copy.creating : copy.create}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * Inline edit (goal/organizer/donation link/verification notes) plus
 * close/reopen and delete, one card per campaign.
 */
export function FundraiserCard({ row, copy, common, canDelete }: { row: EditableFundraiser; copy: Copy; common: CommonCopy; canDelete: boolean }) {
  const { addToast } = useToast()
  const { run, loading: actionLoading } = useAdminMutation()
  const [editing, setEditing] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const [goal, setGoal] = useState(row.goalAmount ? String(row.goalAmount) : '')
  const [currency, setCurrency] = useState(row.currency || 'XAF')
  const [organizer, setOrganizer] = useState(row.organizerName ?? '')
  const [donationUrl, setDonationUrl] = useState(row.donationUrl ?? '')
  const [verificationNotes, setVerificationNotes] = useState(row.verificationNotes ?? '')
  const [payoutMethod, setPayoutMethod] = useState<'momo' | 'bank' | ''>((row.payoutMethod as 'momo' | 'bank' | null) ?? '')
  const [payoutAccount, setPayoutAccount] = useState(row.payoutAccount ?? '')
  const [payoutAccountName, setPayoutAccountName] = useState(row.payoutAccountName ?? '')
  const [titleEn, setTitleEn] = useState(row.storyTitleEn ?? '')
  const [titleFr, setTitleFr] = useState(row.storyTitleFr ?? '')
  const [descEn, setDescEn] = useState(row.storyBodyEn ?? '')
  const [descFr, setDescFr] = useState(row.storyBodyFr ?? '')

  async function handleSave() {
    setBusy(true)
    const result = await updateFundraiser(row.contentItemId, {
      goalAmount: goal.trim() ? Number(goal) : null,
      currency,
      organizerName: organizer,
      donationUrl,
      payoutMethod: payoutMethod || null,
      payoutAccount,
      payoutAccountName,
      verificationNotes,
      titleEn,
      titleFr,
      descriptionEn: descEn,
      descriptionFr: descFr,
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

  async function handleDelete() {
    const ok = await run(() => deleteFundraiser(row.contentItemId), copy.toastDeleted)
    if (ok) setDeleteOpen(false)
  }

  if (editing) {
    return (
      <div className="w-full space-y-3 rounded-md border border-border bg-background p-3">
        <div className="space-y-2 rounded-md border border-border/60 bg-muted/30 p-2.5">
          <p className="text-xs font-medium text-muted-foreground">{copy.editStoryTitle}</p>
          {row.missingLocale && (
            <p className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              {copy.missingTranslation}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs text-muted-foreground">{copy.titleEn}</span>
              <input value={titleEn} onChange={(e) => setTitleEn(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" required />
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">{copy.titleFr}</span>
              <div className="mt-1 flex items-start gap-1.5">
                <input value={titleFr} onChange={(e) => setTitleFr(e.target.value)} className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                <button
                  type="button"
                  onClick={() => { setTitleFr(titleEn); setDescFr(descEn) }}
                  disabled={!titleEn.trim() && !descEn.trim()}
                  title={copy.copyFromEn}
                  className="shrink-0 rounded-md border border-border px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                >
                  {copy.copyFromEn}
                </button>
              </div>
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs text-muted-foreground">{copy.descEn}</span>
              <textarea value={descEn} onChange={(e) => setDescEn(e.target.value)} rows={3} className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">{copy.descFr}</span>
              <textarea value={descFr} onChange={(e) => setDescFr(e.target.value)} rows={3} className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </label>
          </div>
        </div>
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
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block"><span className="text-xs text-muted-foreground">{copy.payoutMethod}</span><select value={payoutMethod} onChange={(e) => setPayoutMethod(e.target.value as 'momo' | 'bank' | '')} className={inputCls}><option value="">{copy.payoutNone}</option><option value="momo">{common.payoutMethods?.momo ?? 'MoMo'}</option><option value="bank">{common.payoutMethods?.bank ?? 'Bank'}</option></select></label>
          <label className="block"><span className="text-xs text-muted-foreground">{copy.payoutAccount}</span><input value={payoutAccount} onChange={(e) => setPayoutAccount(e.target.value)} className={inputCls} /></label>
          <label className="block"><span className="text-xs text-muted-foreground">{copy.payoutAccountName}</span><input value={payoutAccountName} onChange={(e) => setPayoutAccountName(e.target.value)} className={inputCls} /></label>
        </div>
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
      {canDelete && (
        <button type="button" onClick={() => setDeleteOpen(true)} className={btnDanger}>
          {copy.delete}
        </button>
      )}

      {deleteOpen && (
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title={copy.deleteConfirmTitle}
          description={copy.deleteConfirmBody}
          confirmLabel={copy.delete}
          cancelLabel={common.cancel}
          loading={actionLoading}
          onConfirm={handleDelete}
        />
      )}
    </div>
  )
}
