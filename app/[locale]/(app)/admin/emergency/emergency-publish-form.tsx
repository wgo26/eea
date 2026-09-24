'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { publishEmergencyNotice, type EmergencySeverity } from '@/lib/admin/actions/emergency'
import { useToast } from '@/components/admin/toast'
import { ProductionWarning } from '@/components/admin/env-indicator'
import { localePath } from '@/lib/i18n/urls'
import type { Dictionary, Locale } from '@/lib/i18n'

type Copy = Dictionary['admin']['emergency']
type CommonCopy = Dictionary['admin']['common']
type Preset = { id: string; name: string; requiresTwoPerson: boolean; template: Record<string, unknown> }

const inputCls =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary'
const labelCls = 'block text-xs font-medium text-muted-foreground mb-1'
const btnPrimary =
  'inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50'

const SEVERITIES: EmergencySeverity[] = ['info', 'warning', 'critical']

/**
 * Emergency publish console (spec §41/§44): freehand or preset-based rapid
 * publish with the production warning and the two-person gate inline.
 */
export function EmergencyPublishForm({
  copy,
  common,
  locale,
  presets,
}: {
  copy: Copy
  common: CommonCopy
  locale: Locale
  presets: Preset[]
}) {
  const { addToast } = useToast()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [severity, setSeverity] = useState<EmergencySeverity>('critical')
  const [presetId, setPresetId] = useState('')
  const [reason, setReason] = useState('')
  const [approvalId, setApprovalId] = useState('')
  const [pendingApproval, setPendingApproval] = useState<string | null>(null)

  const preset = presets.find((p) => p.id === presetId) ?? null
  const gated = severity === 'critical' || preset?.requiresTwoPerson === true

  function applyPreset(id: string) {
    setPresetId(id)
    const p = presets.find((x) => x.id === id)
    if (!p) return
    const t = p.template
    if (typeof t.title === 'string' && t.title) setTitle(t.title)
    if (typeof t.body === 'string' && t.body) setBody(t.body)
  }

  async function handlePublish(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !body.trim()) {
      addToast(copy.titleRequired, 'error')
      return
    }
    setLoading(true)
    const result = await publishEmergencyNotice({
      title,
      body,
      severity,
      presetId: presetId || null,
      reason: reason.trim() || null,
      approvalId: approvalId.trim() || null,
    })
    setLoading(false)
    if (!result.ok) {
      if (result.approvalRequired) {
        setPendingApproval(result.approvalId ?? null)
        if (result.approvalId) setApprovalId(result.approvalId)
        addToast(copy.approvalNeeded, 'error')
      } else {
        addToast(result.error, 'error')
      }
      return
    }
    addToast(copy.toastPublished, 'success')
    setTitle('')
    setBody('')
    setReason('')
    setApprovalId('')
    setPendingApproval(null)
    router.refresh()
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-medium">{copy.publishHeading}</h2>
      <div className="mt-2">
        <ProductionWarning locale={locale} />
      </div>
      <form onSubmit={handlePublish} className="mt-3 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className={labelCls}>{copy.severityLabel}</label>
            <select value={severity} onChange={(e) => setSeverity(e.target.value as EmergencySeverity)} className={inputCls}>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>{copy.severities[s]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>{copy.presetLabel}</label>
            <select value={presetId} onChange={(e) => applyPreset(e.target.value)} className={inputCls}>
              <option value="">{copy.noPreset}</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.requiresTwoPerson ? ` · ${copy.requiresTwoPerson}` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className={labelCls}>{copy.titleLabel}</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={copy.titlePlaceholder} className={inputCls} required />
        </div>
        <div>
          <label className={labelCls}>{copy.bodyLabel}</label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={copy.bodyPlaceholder} rows={5} className={inputCls} required />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className={labelCls}>{copy.reasonLabel}</label>
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={copy.reasonPlaceholder} className={inputCls} />
          </div>
          {gated ? (
            <div>
              <label className={labelCls}>{copy.approvalLabel}</label>
              <input type="text" value={approvalId} onChange={(e) => setApprovalId(e.target.value)} placeholder={pendingApproval ?? ''} className={inputCls} />
              {pendingApproval ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {copy.approvalHint.replace('{id}', pendingApproval)}{' '}
                  <Link href={localePath(locale, '/admin/approvals')} className="text-primary hover:underline">
                    {copy.colPreset}
                  </Link>
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
        <button type="submit" className={btnPrimary} disabled={loading}>
          {loading ? common.working : copy.publish}
        </button>
      </form>
    </section>
  )
}
