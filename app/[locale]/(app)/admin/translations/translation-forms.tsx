'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  assignReviewer,
  autoTranslateJob,
  createMissingTranslationJobs,
  createTranslationJob,
  type TranslationJob,
  type TranslationLocale,
} from '@/lib/admin/actions/translations'
import { useToast } from '@/components/admin/toast'
import type { Dictionary } from '@/lib/i18n'

type Copy = Dictionary['admin']['translations']
type CommonCopy = Dictionary['admin']['common']

const inputCls =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary'
const labelCls = 'block text-xs font-medium text-muted-foreground mb-1'
const btnPrimary =
  'inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50'
const btnGhost =
  'inline-flex items-center justify-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50'

const LOCALES: TranslationLocale[] = ['en', 'fr']

export function TranslationJobCreateForm({ copy, common }: { copy: Copy; common: CommonCopy }) {
  const { addToast } = useToast()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [contentId, setContentId] = useState('')
  const [target, setTarget] = useState<TranslationLocale>('fr')
  const [source, setSource] = useState<TranslationLocale>('en')

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!contentId.trim()) return
    setLoading(true)
    const result = await createTranslationJob(contentId.trim(), target, source)
    setLoading(false)
    if (!result.ok) {
      addToast(result.error, 'error')
      return
    }
    addToast(copy.toastCreated, 'success')
    setContentId('')
    router.refresh()
  }

  return (
    <form onSubmit={handleCreate} className="grid gap-3 md:grid-cols-4 md:items-end">
      <div className="md:col-span-2">
        <label className={labelCls}>{copy.contentLabel}</label>
        <input type="text" value={contentId} onChange={(e) => setContentId(e.target.value)} placeholder={copy.contentPlaceholder} className={inputCls} required />
      </div>
      <div>
        <label className={labelCls}>{copy.sourceLabel}</label>
        <select value={source} onChange={(e) => setSource(e.target.value as TranslationLocale)} className={inputCls}>
          {LOCALES.map((l) => (
            <option key={l} value={l}>{l.toUpperCase()}</option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelCls}>{copy.targetLabel}</label>
        <select value={target} onChange={(e) => setTarget(e.target.value as TranslationLocale)} className={inputCls}>
          {LOCALES.map((l) => (
            <option key={l} value={l}>{l.toUpperCase()}</option>
          ))}
        </select>
      </div>
      <div className="md:col-span-4">
        <button type="submit" className={btnPrimary} disabled={loading}>
          {loading ? common.working : copy.create}
        </button>
      </div>
    </form>
  )
}

export function TranslationJobRowActions({ copy, job }: { copy: Copy; job: TranslationJob }) {
  const { addToast } = useToast()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [reviewer, setReviewer] = useState('')

  async function handleAuto() {
    setBusy(true)
    const result = await autoTranslateJob(job.id)
    setBusy(false)
    addToast(result.ok ? copy.toastAutoDone : result.error, result.ok ? 'success' : 'error')
    router.refresh()
  }

  async function handleReviewer(e: React.FormEvent) {
    e.preventDefault()
    if (!reviewer.trim()) return
    setBusy(true)
    const result = await assignReviewer(job.id, reviewer.trim())
    setBusy(false)
    addToast(result.ok ? copy.toastReviewer : result.error, result.ok ? 'success' : 'error')
    if (result.ok) setReviewer('')
    router.refresh()
  }

  if (job.status === 'completed') return <span className="text-xs text-muted-foreground">—</span>

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" onClick={handleAuto} className={btnGhost} disabled={busy}>
        {busy ? copy.autoTranslating : copy.autoTranslate}
      </button>
      <form onSubmit={handleReviewer} className="flex items-center gap-1.5">
        <input
          type="text"
          value={reviewer}
          onChange={(e) => setReviewer(e.target.value)}
          placeholder={copy.reviewerPlaceholder}
          aria-label={copy.assignReviewer}
          className="w-32 rounded-md border border-border bg-background px-2 py-1 text-xs"
        />
        <button type="submit" className={btnGhost} disabled={busy}>
          {copy.assignReviewer}
        </button>
      </form>
    </div>
  )
}

export function TranslationBulkCreate({ copy, common }: { copy: Copy; common: CommonCopy }) {
  const { addToast } = useToast()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [target, setTarget] = useState<TranslationLocale>('fr')

  async function handleBulk() {
    setLoading(true)
    const result = await createMissingTranslationJobs(target)
    setLoading(false)
    if (!result.ok) {
      addToast(result.error, 'error')
      return
    }
    addToast(copy.toastBulkCreated.replace('{count}', String(result.created)), 'success')
    router.refresh()
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={target} onChange={(e) => setTarget(e.target.value as TranslationLocale)} className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs" aria-label={copy.targetLabel}>
        {LOCALES.map((l) => (
          <option key={l} value={l}>{l.toUpperCase()}</option>
        ))}
      </select>
      <button type="button" onClick={handleBulk} className={btnPrimary} disabled={loading}>
        {loading ? common.working : `${copy.bulkCreate} ${target.toUpperCase()}`}
      </button>
    </div>
  )
}
