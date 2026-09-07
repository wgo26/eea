'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  createPolicyVersion,
  setCurrentPolicy,
  updatePolicyContent,
  deletePolicyVersion,
} from '@/lib/admin/actions'
import { useToast } from '@/components/admin/toast'
import { ConfirmDialog } from '@/components/admin/confirm-dialog'
import { StatusBadge } from '@/components/admin/status-badge'
import { PolicyContent } from '@/components/about/policy-content'
import { formatRelative } from '@/lib/admin/format'
import type { Dictionary, Locale } from '@/lib/i18n'
import type { AdminPolicyRow } from '@/lib/admin/queries'

type Copy = Dictionary['admin']['policies']

const POLICY_TYPES = ['terms', 'privacy', 'guidelines', 'copyright', 'contact'] as const

/** Publish form: type + locale + version + markdown body. */
export function PolicyCreateForm({ copy }: { copy: Copy }) {
  const { addToast } = useToast()
  const [policyType, setPolicyType] = useState<string>('terms')
  const [locale, setLocale] = useState<'en' | 'fr'>('en')
  const [version, setVersion] = useState('')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleCreate() {
    if (!policyType || !version.trim() || !content.trim()) {
      addToast(copy.errorContent, 'error')
      return
    }
    setLoading(true)
    const result = await createPolicyVersion({ policyType, locale, version, content })
    setLoading(false)
    if (result.ok) {
      addToast(copy.toastCreated, 'success')
      setVersion('')
      setContent('')
    } else {
      addToast(result.error, 'error')
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          <span>{copy.typeLabel}</span>
          <select
            value={policyType}
            onChange={(e) => setPolicyType(e.target.value)}
            className="h-9 rounded-md border border-border bg-background px-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {POLICY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          <span>{copy.localeLabel}</span>
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as 'en' | 'fr')}
            className="h-9 rounded-md border border-border bg-background px-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="en">EN</option>
            <option value="fr">FR</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          <span>{copy.versionLabel}</span>
          <input
            type="text"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder={copy.versionPh}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </label>
      </div>
      <label className="mt-3 flex flex-col gap-1.5 text-xs text-muted-foreground">
        <span>{copy.contentLabel}</span>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={copy.contentPh}
          rows={8}
          className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </label>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={handleCreate}
          disabled={loading}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {loading ? copy.creating : copy.create}
        </button>
      </div>
    </section>
  )
}

/**
 * One version row: status + meta, live preview, in-place edit, rollback,
 * delete (non-current only) and a link to the public page it drives.
 */
export function PolicyVersionCard({
  policy,
  copy,
  common,
  locale,
  viewHref,
}: {
  policy: AdminPolicyRow
  copy: Copy
  common: Dictionary['admin']['common']
  locale: Locale
  viewHref: string
}) {
  const { addToast } = useToast()
  const [mode, setMode] = useState<'view' | 'preview' | 'edit'>('view')
  const [draft, setDraft] = useState(policy.content ?? '')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function handleActivate() {
    setBusy(true)
    const result = await setCurrentPolicy(policy.id)
    setBusy(false)
    if (result.ok) addToast(copy.toastActivated, 'success')
    else addToast(result.error, 'error')
  }

  async function handleSave() {
    if (!draft.trim()) {
      addToast(copy.errorContent, 'error')
      return
    }
    setBusy(true)
    const result = await updatePolicyContent(policy.id, draft)
    setBusy(false)
    if (result.ok) {
      addToast(copy.toastSaved, 'success')
      setMode('view')
    } else {
      addToast(result.error, 'error')
    }
  }

  async function handleDelete() {
    setBusy(true)
    const result = await deletePolicyVersion(policy.id)
    setBusy(false)
    if (result.ok) {
      setConfirmDelete(false)
      addToast(copy.toastDeleted, 'success')
    } else addToast(result.error, 'error')
  }

  const btn =
    'inline-flex shrink-0 items-center justify-center rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50'

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {policy.isCurrent ? <StatusBadge status="active" /> : <StatusBadge status="closed" />}
            <span className="text-xs font-medium">
              {policy.policyType} · {policy.locale.toUpperCase()} · v{policy.version}
            </span>
            {policy.isCurrent ? (
              <span className="text-xs text-muted-foreground">· {copy.current}</span>
            ) : null}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {policy.publishedAt ? formatRelative(policy.publishedAt, locale) : null}
            {policy.excerpt ? ` · ${policy.excerpt}` : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={viewHref} className={btn}>
            {copy.viewPublic}
          </Link>
          <button type="button" onClick={() => setMode(mode === 'preview' ? 'view' : 'preview')} className={btn}>
            {copy.previewTitle}
          </button>
          <button type="button" onClick={() => setMode(mode === 'edit' ? 'view' : 'edit')} className={btn}>
            {copy.edit}
          </button>
          {!policy.isCurrent ? (
            <>
              <button type="button" onClick={handleActivate} disabled={busy} className={btn}>
                {copy.setCurrent}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
                className="inline-flex shrink-0 items-center justify-center rounded-md border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
              >
                {copy.delete}
              </button>
              <ConfirmDialog
                open={confirmDelete}
                onOpenChange={setConfirmDelete}
                title={copy.delete}
                description={copy.confirmDelete}
                confirmLabel={copy.delete}
                cancelLabel={common.cancel}
                loading={busy}
                onConfirm={handleDelete}
              />
            </>
          ) : null}
        </div>
      </div>

      {mode === 'preview' && policy.content ? (
        <div className="mt-4 rounded-md border border-border bg-background p-4">
          <PolicyContent content={policy.content} />
        </div>
      ) : null}

      {mode === 'edit' ? (
        <div className="mt-4 space-y-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={10}
            className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={busy}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {busy ? copy.saving : copy.save}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
