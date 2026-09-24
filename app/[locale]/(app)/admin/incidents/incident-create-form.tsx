'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createIncident } from '@/lib/admin/actions/incidents'
import { useToast } from '@/components/admin/toast'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { localePath } from '@/lib/i18n/urls'
import type { Dictionary, Locale } from '@/lib/i18n'

type Copy = Dictionary['admin']['incidents']
type CommonCopy = Dictionary['admin']['common']

const inputCls =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary'
const labelCls = 'block text-xs font-medium text-muted-foreground mb-1'
const btnPrimary =
  'inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50'
const btnGhost =
  'inline-flex items-center justify-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50'

const OPEN_SEVERITIES = ['info', 'warning', 'critical'] as const

/**
 * Opens an incident (spec §39). Creating one is the platform's "incident mode"
 * switch — the create action activates the operational state — so the severity
 * select only offers the levels that map to an operational state.
 */
export function IncidentCreateForm({ copy, common, locale }: { copy: Copy; common: CommonCopy; locale: Locale }) {
  const { addToast } = useToast()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [title, setTitle] = useState('')
  const [severity, setSeverity] = useState<(typeof OPEN_SEVERITIES)[number]>('warning')
  const [description, setDescription] = useState('')
  const [services, setServices] = useState('')
  const [owner, setOwner] = useState('')
  const [publicMessage, setPublicMessage] = useState('')

  function reset() {
    setTitle('')
    setSeverity('warning')
    setDescription('')
    setServices('')
    setOwner('')
    setPublicMessage('')
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      addToast(copy.titleRequired, 'error')
      return
    }
    setLoading(true)
    const result = await createIncident({
      title,
      severity,
      description,
      affectedServices: services.split(',').map((s) => s.trim()).filter(Boolean),
      owner,
      publicStatusMessage: publicMessage,
    })
    setLoading(false)
    if (!result.ok) {
      addToast(result.error, 'error')
      return
    }
    addToast(copy.toastCreated, 'success')
    setOpen(false)
    reset()
    router.push(localePath(locale, `/admin/incidents/${result.id}`))
    router.refresh()
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium">{copy.createTitle}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{copy.createHint}</p>
        </div>
        <button type="button" onClick={() => setOpen(true)} className={btnPrimary}>
          {copy.create}
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{copy.createTitle}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className={labelCls}>{copy.titleLabel}</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={copy.titlePlaceholder}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className={labelCls}>{copy.severityLabel}</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as (typeof OPEN_SEVERITIES)[number])}
                className={inputCls}
              >
                {OPEN_SEVERITIES.map((s) => (
                  <option key={s} value={s}>{copy.severities[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{copy.descriptionLabel}</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={copy.descriptionPlaceholder}
                rows={3}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>{copy.servicesLabel}</label>
              <input
                type="text"
                value={services}
                onChange={(e) => setServices(e.target.value)}
                placeholder={copy.servicesHint}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>{copy.ownerLabel}</label>
              <input
                type="text"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder={copy.ownerPlaceholder}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>{copy.publicHeading}</label>
              <textarea
                value={publicMessage}
                onChange={(e) => setPublicMessage(e.target.value)}
                placeholder={copy.publicPlaceholder}
                rows={2}
                className={inputCls}
              />
              <p className="mt-1 text-xs text-muted-foreground">{copy.publicHint}</p>
            </div>
            <DialogFooter>
              <button type="button" onClick={() => setOpen(false)} className={btnGhost} disabled={loading}>
                {common.cancel}
              </button>
              <button type="submit" className={btnPrimary} disabled={loading}>
                {loading ? common.working : copy.create}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  )
}
