'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { resolveReport, resolveCorrection, deleteReport } from '@/lib/admin/actions'
import { useToast } from '@/components/admin/toast'
import { ConfirmDialog } from '@/components/admin/confirm-dialog'
import { localePath } from '@/lib/i18n/urls'
import type { Dictionary, Locale } from '@/lib/i18n'
import type { ReportRow, CorrectionRow } from '@/lib/admin/queries'

type Copy = Dictionary['admin']['trustSafety']

const resolveBtn =
  'inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-50 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
const ghostBtn =
  'inline-flex items-center rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50'

/**
 * Trust & safety resolution controls (Phase 3): investigate / resolve /
 * dismiss with an optional resolution note, for community reports and
 * content corrections. Resolve accepts a note inline.
 */
export function CorrectionActions({ correction, copy }: { correction: CorrectionRow; copy: Copy }) {
  const { addToast } = useToast()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState('')
  const [dismissOpen, setDismissOpen] = useState(false)

  const closed = correction.status === 'resolved' || correction.status === 'dismissed'

  async function run(status: 'investigating' | 'resolved' | 'dismissed', toast: string) {
    setBusy(true)
    const result = await resolveCorrection(correction.id, status, note.trim() || undefined)
    setBusy(false)
    if (result.ok) {
      addToast(toast, 'success')
      setNoteOpen(false)
      setNote('')
      setDismissOpen(false)
      router.refresh()
    } else {
      addToast(result.error, 'error')
    }
  }

  return (
    <div className="space-y-2 text-right">
      {!closed && (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {correction.status !== 'investigating' && (
            <button type="button" onClick={() => run('investigating', copy.toastCorrectionInvestigating)} disabled={busy} className={ghostBtn}>
              {copy.investigate}
            </button>
          )}
          <button type="button" onClick={() => setNoteOpen(!noteOpen)} disabled={busy} aria-expanded={noteOpen} className={resolveBtn}>
            {copy.resolutionLabel ?? copy.resolve}
          </button>
          <button
            type="button"
            onClick={() => setDismissOpen(true)}
            disabled={busy}
            className={ghostBtn + ' hover:text-destructive hover:border-destructive/50'}
          >
            {copy.dismiss}
          </button>
        </div>
      )}
      {noteOpen && (
        <div className="flex items-center justify-end gap-1.5">
          <label htmlFor={`correction-note-${correction.id}`} className="sr-only">{copy.resolutionLabel}</label>
          <input
            id={`correction-note-${correction.id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={copy.resolutionPh}
            className="w-56 rounded-md border border-border bg-background px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            type="button"
            onClick={() => run('resolved', copy.toastCorrectionResolved)}
            disabled={busy}
            className="inline-flex items-center rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {copy.resolve}
          </button>
        </div>
      )}
      <ConfirmDialog
        open={dismissOpen}
        onOpenChange={setDismissOpen}
        title={copy.dismiss}
        description={copy.resolutionPh}
        confirmLabel={copy.dismiss}
        cancelLabel={copy.resolve === 'Resolve' ? 'Cancel' : 'Annuler'}
        loading={busy}
        onConfirm={() => run('dismissed', copy.toastCorrectionDismissed)}
      />
    </div>
  )
}

export function ReportActions({ report, copy, common, locale }: { report: ReportRow; copy: Copy; common: Dictionary['admin']['common']; locale: Locale }) {
  const { addToast } = useToast()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [dismissOpen, setDismissOpen] = useState(false)

  const closed = report.status === 'resolved' || report.status === 'dismissed'

  async function run(status: 'investigating' | 'resolved' | 'dismissed', toast: string) {
    setBusy(true)
    const result = await resolveReport(report.id, status, note.trim() || undefined)
    setBusy(false)
    if (result.ok) {
      addToast(toast, 'success')
      setNoteOpen(false)
      setNote('')
      setDismissOpen(false)
      router.refresh()
    } else {
      addToast(result.error, 'error')
    }
  }

  async function handleDelete() {
    setBusy(true)
    const result = await deleteReport(report.id)
    setBusy(false)
    if (result.ok) {
      setDeleteOpen(false)
      addToast(copy.toastReportDeleted, 'success')
      router.refresh()
    } else {
      addToast(result.error, 'error')
    }
  }

  return (
    <div className="space-y-2 text-right">
      {report.contentItemId && (
        <Link
          href={`${localePath(locale, '/admin/content')}?edit=${report.contentItemId}`}
          className="block text-xs text-primary hover:underline"
        >
          {copy.editContent}
        </Link>
      )}
      {!closed && (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {report.status !== 'investigating' && (
            <button type="button" onClick={() => run('investigating', copy.toastInvestigating)} disabled={busy} className={ghostBtn}>
              {copy.investigate}
            </button>
          )}
          <button type="button" onClick={() => setNoteOpen(!noteOpen)} disabled={busy} aria-expanded={noteOpen} className={resolveBtn}>
            {copy.resolutionLabel ?? copy.resolve}
          </button>
          <button
            type="button"
            onClick={() => setDismissOpen(true)}
            disabled={busy}
            className={ghostBtn + ' hover:text-destructive hover:border-destructive/50'}
          >
            {copy.dismiss}
          </button>
        </div>
      )}
      {noteOpen && (
        <div className="flex items-center justify-end gap-1.5">
          <label htmlFor={`report-note-${report.id}`} className="sr-only">{copy.resolutionLabel}</label>
          <input
            id={`report-note-${report.id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={copy.resolutionPh}
            className="w-56 rounded-md border border-border bg-background px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            type="button"
            onClick={() => run('resolved', copy.toastResolved)}
            disabled={busy}
            className="inline-flex items-center rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {copy.resolve}
          </button>
        </div>
      )}
      <ConfirmDialog
        open={dismissOpen}
        onOpenChange={setDismissOpen}
        title={copy.dismiss}
        description={copy.resolutionPh}
        confirmLabel={copy.dismiss}
        cancelLabel={common.cancel}
        loading={busy}
        onConfirm={() => run('dismissed', copy.toastDismissed)}
      />
      <button
        type="button"
        onClick={() => setDeleteOpen(true)}
        disabled={busy}
        className={ghostBtn + ' hover:text-destructive hover:border-destructive/50'}
      >
        {copy.deleteReport}
      </button>
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={copy.deleteReportConfirmTitle}
        description={copy.deleteReportConfirmBody}
        confirmLabel={copy.deleteReport}
        cancelLabel={common.cancel}
        loading={busy}
        onConfirm={handleDelete}
        tone="danger"
      />
    </div>
  )
}