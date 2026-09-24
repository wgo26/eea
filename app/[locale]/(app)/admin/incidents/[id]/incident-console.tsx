'use client'

import { useState } from 'react'
import {
  activateCriticalMode,
  closeIncident,
  requestCriticalModeApproval,
  transitionIncident,
  updateIncident,
} from '@/lib/admin/actions/incidents'
import { getApprovalState } from '@/lib/admin/actions/approvals'
import { useAdminMutation, ConfirmDialog } from '@/components/admin/confirm-dialog'
import { useToast } from '@/components/admin/toast'
import { formatRelative } from '@/lib/admin/format'
import { useLocaleFromPath } from '@/components/site-header'
import type { ApprovalListRow } from '@/lib/admin/queries/approvals'
import type { Dictionary } from '@/lib/i18n'

type Copy = Dictionary['admin']['incidents']
type CommonCopy = Dictionary['admin']['common']

export type ConsoleIncident = {
  id: string
  title: string
  severity: 'normal' | 'info' | 'warning' | 'critical'
  description: string | null
  affectedServices: string[]
  owner: string | null
  currentStatus: 'investigating' | 'identified' | 'mitigating' | 'monitoring' | 'resolved'
  publicStatusMessage: string | null
  internalNotes: string | null
}

const SEVERITIES = ['normal', 'info', 'warning', 'critical'] as const
const STATUSES = ['investigating', 'identified', 'mitigating', 'monitoring', 'resolved'] as const

const inputCls =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary'
const labelCls = 'block text-xs font-medium text-muted-foreground mb-1'
const btnPrimary =
  'inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50'
const btnGhost =
  'inline-flex items-center justify-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50'
const btnCritical =
  'inline-flex items-center justify-center rounded-md border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50'

/**
 * The operator console for one incident (spec §39/§40): details, the public
 * status message, staff-only notes, lifecycle advance, critical-mode escalation
 * and resolution. Read-only history (timeline + status transitions) renders on
 * the server page — nothing here re-implements it.
 *
 * Critical-mode escalation is the §44 two-person flow: request → a second
 * administrator approves in /admin/approvals → activate. `approval` carries the
 * caller's own live request; the server action re-checks it, so this console
 * cannot unlock the escalation on its own.
 */
export function IncidentConsole({
  incident,
  approval: initialApproval,
  copy,
  common,
}: {
  incident: ConsoleIncident
  approval: ApprovalListRow | null
  copy: Copy
  common: CommonCopy
}) {
  const locale = useLocaleFromPath()
  const { addToast } = useToast()
  const { run, loading } = useAdminMutation()
  const [title, setTitle] = useState(incident.title)
  const [severity, setSeverity] = useState<ConsoleIncident['severity']>(incident.severity)
  const [description, setDescription] = useState(incident.description ?? '')
  const [services, setServices] = useState(incident.affectedServices.join(', '))
  const [owner, setOwner] = useState(incident.owner ?? '')
  const [publicMessage, setPublicMessage] = useState(incident.publicStatusMessage ?? '')
  const [internalNotes, setInternalNotes] = useState(incident.internalNotes ?? '')
  const [resolution, setResolution] = useState('')
  const [resolveOpen, setResolveOpen] = useState(false)
  const [criticalOpen, setCriticalOpen] = useState(false)
  const [requestOpen, setRequestOpen] = useState(false)
  const [criticalNote, setCriticalNote] = useState('')
  const [approval, setApproval] = useState<ApprovalListRow | null>(initialApproval)
  const [requesting, setRequesting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const open = incident.currentStatus !== 'resolved'
  const forward = STATUSES.slice(STATUSES.indexOf(incident.currentStatus) + 1).filter((s) => s !== 'resolved')
  const approvalReady = approval?.usable === true
  const approvalPending = approval?.effectiveStatus === 'pending'

  async function refreshApproval() {
    setRefreshing(true)
    try {
      setApproval(await getApprovalState('incident.critical_mode', 'incident', incident.id))
    } finally {
      setRefreshing(false)
    }
  }

  async function saveDetails(e: React.FormEvent) {
    e.preventDefault()
    await run(
      () =>
        updateIncident(incident.id, {
          title,
          severity,
          description,
          affectedServices: services.split(',').map((s) => s.trim()).filter(Boolean),
          owner,
        }),
      copy.toastSaved,
    )
  }

  async function publishMessage() {
    await run(() => updateIncident(incident.id, { publicStatusMessage: publicMessage }), copy.toastPublicSaved)
  }

  async function saveNotes() {
    await run(() => updateIncident(incident.id, { internalNotes }), copy.toastNotesSaved)
  }

  async function handleResolve() {
    const ok = await run(() => closeIncident(incident.id, resolution), copy.toastResolved)
    if (ok) {
      setResolution('')
      setResolveOpen(false)
    }
  }

  async function handleRequestCritical() {
    setRequesting(true)
    try {
      const result = await requestCriticalModeApproval(incident.id, criticalNote)
      if (!result.ok) {
        addToast(result.error, 'error')
        return
      }
      addToast(copy.criticalToastRequested, 'success')
      setRequestOpen(false)
      setApproval(await getApprovalState('incident.critical_mode', 'incident', incident.id))
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Operation failed', 'error')
    } finally {
      setRequesting(false)
    }
  }

  async function handleCritical() {
    const ok = await run(
      () => activateCriticalMode(incident.id, criticalNote, approval?.id ?? null),
      copy.toastCritical,
    )
    if (ok) {
      setCriticalOpen(false)
      setCriticalNote('')
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-medium">{copy.detailsHeading}</h2>
          <form onSubmit={saveDetails} className="mt-3 space-y-3">
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
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>{copy.severityLabel}</label>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as ConsoleIncident['severity'])}
                  className={inputCls}
                >
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>{copy.severities[s]}</option>
                  ))}
                </select>
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
              <p className="mt-1 text-xs text-muted-foreground">{copy.servicesHint}</p>
            </div>
            <div className="flex justify-end">
              <button type="submit" className={btnPrimary} disabled={loading}>
                {copy.saveDetails}
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-medium">{copy.publicHeading}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{copy.publicHint}</p>
          <textarea
            value={publicMessage}
            onChange={(e) => setPublicMessage(e.target.value)}
            placeholder={copy.publicPlaceholder}
            rows={3}
            className={`mt-3 ${inputCls}`}
          />
          <div className="mt-3 flex justify-end">
            <button type="button" onClick={publishMessage} className={btnPrimary} disabled={loading}>
              {copy.publishMessage}
            </button>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-medium">{copy.internalHeading}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{copy.internalHint}</p>
          <textarea
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
            placeholder={copy.internalPlaceholder}
            rows={3}
            className={`mt-3 ${inputCls}`}
          />
          <div className="mt-3 flex justify-end">
            <button type="button" onClick={saveNotes} className={btnGhost} disabled={loading}>
              {copy.saveNotes}
            </button>
          </div>
        </section>
      </div>

      <div className="space-y-4">
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-medium">{copy.lifecycleHeading}</h2>
          {open && forward.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              {forward.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => run(() => transitionIncident(incident.id, s), copy.toastAdvanced)}
                  disabled={loading}
                  className={btnGhost}
                >
                  {copy.advanceTo.replace('{status}', copy.status[s])}
                </button>
              ))}
            </div>
          )}

          {open && (
            <div className="mt-4 space-y-2 border-t border-border pt-4">
              <button type="button" onClick={() => setResolveOpen(true)} className={btnPrimary}>
                {copy.resolve}
              </button>
              {severity !== 'critical' &&
                (approvalReady ? (
                  <div className="space-y-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                    <span>{copy.criticalApprovalReady}</span>
                    <button type="button" onClick={() => setCriticalOpen(true)} className={btnCritical}>
                      {copy.criticalConfirm}
                    </button>
                  </div>
                ) : approvalPending ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
                    <span>
                      {copy.criticalApprovalPending}
                      <span className="block text-muted-foreground">
                        {copy.criticalApprovalExpires.replace(
                          '{when}',
                          formatRelative(approval.expiresAt, locale),
                        )}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={refreshApproval}
                      disabled={refreshing}
                      className={btnGhost}
                    >
                      {copy.refresh}
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setRequestOpen(true)} className={btnCritical}>
                    {copy.criticalRequestTitle}
                  </button>
                ))}
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={resolveOpen}
        onOpenChange={setResolveOpen}
        title={copy.resolveTitle}
        description={copy.resolveBody}
        confirmLabel={copy.resolve}
        cancelLabel={common.cancel}
        loading={loading}
        tone="danger"
        onConfirm={handleResolve}
      >
        <div>
          <label className={labelCls}>{copy.resolutionLabel}</label>
          <textarea
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            placeholder={copy.resolutionPlaceholder}
            rows={3}
            className={inputCls}
          />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={requestOpen}
        onOpenChange={setRequestOpen}
        title={copy.criticalRequestTitle}
        description={copy.criticalRequestBody}
        confirmLabel={copy.criticalRequestTitle}
        cancelLabel={common.cancel}
        loading={requesting}
        tone="default"
        onConfirm={handleRequestCritical}
      >
        <div>
          <label className={labelCls}>{copy.criticalNoteLabel}</label>
          <textarea
            value={criticalNote}
            onChange={(e) => setCriticalNote(e.target.value)}
            placeholder={copy.resolutionPlaceholder}
            rows={2}
            className={inputCls}
          />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={criticalOpen}
        onOpenChange={setCriticalOpen}
        title={copy.criticalTitle}
        description={copy.criticalBody}
        confirmLabel={copy.criticalConfirm}
        cancelLabel={common.cancel}
        loading={loading}
        tone="danger"
        onConfirm={handleCritical}
      >
        <div>
          <label className={labelCls}>{copy.criticalNoteLabel}</label>
          <textarea
            value={criticalNote}
            onChange={(e) => setCriticalNote(e.target.value)}
            placeholder={copy.resolutionPlaceholder}
            rows={2}
            className={inputCls}
          />
        </div>
      </ConfirmDialog>
    </div>
  )
}
