'use client'

import { useState } from 'react'
import { resolveReport, resolveCorrection } from '@/lib/admin/actions'
import { useToast } from '@/components/admin/toast'
import type { Dictionary } from '@/lib/i18n'
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
  const [busy, setBusy] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState('')

  const closed = correction.status === 'resolved' || correction.status === 'dismissed'

  async function run(status: 'investigating' | 'resolved' | 'dismissed', toast: string) {
    setBusy(true)
    const result = await resolveCorrection(correction.id, status, note.trim() || undefined)
    setBusy(false)
    if (result.ok) {
      addToast(toast, 'success')
      setNoteOpen(false)
      setNote('')
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
          <button type="button" onClick={() => setNoteOpen(!noteOpen)} disabled={busy} className={resolveBtn}>
            {copy.resolve}
          </button>
          <button
            type="button"
            onClick={() => run('dismissed', copy.toastCorrectionDismissed)}
            disabled={busy}
            className={ghostBtn + ' hover:text-destructive hover:border-destructive/50'}
          >
            {copy.dismiss}
          </button>
        </div>
      )}
      {noteOpen && (
        <div className="flex items-center justify-end gap-1.5">
          <input
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
    </div>
  )
}

export function ReportActions({ report, copy }: { report: ReportRow; copy: Copy }) {
  const { addToast } = useToast()
  const [busy, setBusy] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState('')

  const closed = report.status === 'resolved' || report.status === 'dismissed'

  async function run(status: 'investigating' | 'resolved' | 'dismissed', toast: string) {
    setBusy(true)
    const result = await resolveReport(report.id, status, note.trim() || undefined)
    setBusy(false)
    if (result.ok) {
      addToast(toast, 'success')
      setNoteOpen(false)
      setNote('')
    } else {
      addToast(result.error, 'error')
    }
  }

  return (
    <div className="space-y-2 text-right">
      {!closed && (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {report.status !== 'investigating' && (
            <button type="button" onClick={() => run('investigating', copy.toastInvestigating)} disabled={busy} className={ghostBtn}>
              {copy.investigate}
            </button>
          )}
          <button type="button" onClick={() => setNoteOpen(!noteOpen)} disabled={busy} className={resolveBtn}>
            {copy.resolve}
          </button>
          <button
            type="button"
            onClick={() => run('dismissed', copy.toastDismissed)}
            disabled={busy}
            className={ghostBtn + ' hover:text-destructive hover:border-destructive/50'}
          >
            {copy.dismiss}
          </button>
        </div>
      )}
      {noteOpen && (
        <div className="flex items-center justify-end gap-1.5">
          <input
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
    </div>
  )
}