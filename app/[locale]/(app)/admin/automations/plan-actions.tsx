'use client'

import { useState } from 'react'
import {
  createPublishPlan,
  updatePublishPlan,
  deletePublishPlan,
  setPlanEnabled,
  runDuePlansNow,
  type PlanInput,
} from '@/lib/admin/actions/publish-plans'
import { useAdminMutation, ConfirmDialog } from '@/components/admin/confirm-dialog'
import { useToast } from '@/components/admin/toast'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Dictionary } from '@/lib/i18n'

type Copy = Dictionary['admin']['automations']
type CommonCopy = Dictionary['admin']['common']
type TemplateOption = { id: string; name: string }

const inputCls =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary'
const labelCls = 'block text-xs font-medium text-muted-foreground mb-1'
const btnPrimary =
  'inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50'
const btnGhost =
  'inline-flex items-center justify-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50'
const btnDanger =
  'inline-flex items-center justify-center rounded-md border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50'

type FormState = {
  name: string
  templateId: string
  horizon: 'daily' | 'weekly'
  dayOfWeek: string
  runTime: string
  leadMinutes: string
  reviewMode: 'draft-only' | 'auto-schedule'
  enabled: boolean
}

const emptyForm: FormState = {
  name: '',
  templateId: '',
  horizon: 'weekly',
  dayOfWeek: '1',
  runTime: '07:00',
  leadMinutes: '60',
  reviewMode: 'draft-only',
  enabled: true,
}

function toInput(form: FormState): PlanInput {
  return {
    name: form.name,
    templateId: form.templateId,
    horizon: form.horizon,
    dayOfWeek: form.horizon === 'weekly' ? Number(form.dayOfWeek) : null,
    runTime: form.runTime,
    leadMinutes: Number(form.leadMinutes),
    reviewMode: form.reviewMode,
    enabled: form.enabled,
  }
}

function PlanFields({ form, setForm, copy, templates }: { form: FormState; setForm: (f: FormState) => void; copy: Copy; templates: TemplateOption[] }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls}>{copy.planName}</label>
          <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} required />
        </div>
        <div>
          <label className={labelCls}>{copy.template}</label>
          <select value={form.templateId} onChange={(e) => setForm({ ...form, templateId: e.target.value })} className={inputCls} required>
            <option value="">—</option>
            {templates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <label className={labelCls}>{copy.horizon}</label>
          <select value={form.horizon} onChange={(e) => setForm({ ...form, horizon: e.target.value as FormState['horizon'] })} className={inputCls}>
            <option value="daily">{copy.horizonDaily}</option>
            <option value="weekly">{copy.horizonWeekly}</option>
          </select>
        </div>
        {form.horizon === 'weekly' ? (
          <div>
            <label className={labelCls}>{copy.dayOfWeek}</label>
            <select value={form.dayOfWeek} onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value })} className={inputCls}>
              {['0', '1', '2', '3', '4', '5', '6'].map((d) => (
                <option key={d} value={d}>
                  {new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' }).format(Date.UTC(2026, 0, 4 + Number(d)))}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div>
          <label className={labelCls}>{copy.runTime}</label>
          <input type="time" value={form.runTime} onChange={(e) => setForm({ ...form, runTime: e.target.value })} className={inputCls} required />
        </div>
        <div>
          <label className={labelCls}>{copy.leadMinutes}</label>
          <input type="number" min={5} max={1440} value={form.leadMinutes} onChange={(e) => setForm({ ...form, leadMinutes: e.target.value })} className={inputCls} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="radio"
            name={`mode-${form.name}`}
            checked={form.reviewMode === 'draft-only'}
            onChange={() => setForm({ ...form, reviewMode: 'draft-only' })}
          />
          {copy.modeDraftOnly}
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="radio"
            name={`mode-${form.name}`}
            checked={form.reviewMode === 'auto-schedule'}
            onChange={() => setForm({ ...form, reviewMode: 'auto-schedule' })}
          />
          {copy.modeAutoSchedule}
        </label>
      </div>
    </div>
  )
}

export function RunDuePlansButton({ copy }: { copy: Copy }) {
  const { addToast } = useToast()
  const [loading, setLoading] = useState(false)

  async function handleRun() {
    setLoading(true)
    const result = await runDuePlansNow()
    setLoading(false)
    if (!result.ok) addToast(result.error, 'error')
    else {
      const summary = result.summary as { due?: number } | undefined
      addToast(copy.toastRan.replace('{due}', String(summary?.due ?? 0)), 'success')
    }
  }

  return (
    <button type="button" onClick={handleRun} disabled={loading} className={btnGhost}>
      {loading ? copy.running : copy.runNow}
    </button>
  )
}

export function PlanCreateForm({ copy, templates }: { copy: Copy; templates: TemplateOption[] }) {
  const { addToast } = useToast()
  const [form, setForm] = useState<FormState>(emptyForm)
  const [loading, setLoading] = useState(false)

  async function handleCreate() {
    setLoading(true)
    const result = await createPublishPlan(toInput(form))
    setLoading(false)
    if (result.ok) {
      addToast(copy.toastSaved, 'success')
      setForm({ ...emptyForm, templateId: form.templateId })
    } else if (result.approvalRequired) {
      addToast(copy.approvalPending, 'error')
    } else {
      addToast(result.error, 'error')
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-medium">{copy.createTitle}</h3>
      <div className="mt-3 space-y-3">
        <PlanFields form={form} setForm={setForm} copy={copy} templates={templates} />
        <div className="flex justify-end">
          <button type="button" onClick={handleCreate} disabled={loading} className={btnPrimary}>
            {loading ? copy.running : copy.create}
          </button>
        </div>
      </div>
    </section>
  )
}

export function PlanRowActions({
  plan,
  copy,
  common,
  templates,
}: {
  plan: PlanInput & { id: string }
  copy: Copy
  common: CommonCopy
  templates: TemplateOption[]
}) {
  const { addToast } = useToast()
  const { run, loading: actionLoading } = useAdminMutation()
  const [saving, setSaving] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [form, setForm] = useState<FormState>({
    name: plan.name,
    templateId: plan.templateId,
    horizon: plan.horizon,
    dayOfWeek: String(plan.dayOfWeek ?? 1),
    runTime: plan.runTime,
    leadMinutes: String(plan.leadMinutes),
    reviewMode: plan.reviewMode,
    enabled: plan.enabled,
  })

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const result = await updatePublishPlan(plan.id, toInput(form))
    setSaving(false)
    if (result.ok) {
      addToast(copy.toastSaved, 'success')
      setEditOpen(false)
    } else if ('approvalRequired' in result && result.approvalRequired) {
      // §44: the request is filed — tell the editor to get a second admin, then re-save.
      addToast(copy.approvalPending, 'error')
    } else addToast(result.error, 'error')
  }

  async function handleToggle() {
    await run(() => setPlanEnabled(plan.id, !plan.enabled), copy.toastSaved)
  }

  async function handleDelete() {
    const ok = await run(() => deletePublishPlan(plan.id), copy.toastDeleted)
    if (ok) setDeleteOpen(false)
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <button type="button" onClick={handleToggle} disabled={actionLoading} className={btnGhost}>
        {plan.enabled ? copy.disable : copy.enable}
      </button>
      <button type="button" onClick={() => setEditOpen(true)} className={btnGhost}>
        {copy.edit}
      </button>
      <button type="button" onClick={() => setDeleteOpen(true)} className={btnDanger}>
        {copy.delete}
      </button>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{copy.edit}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <PlanFields form={form} setForm={setForm} copy={copy} templates={templates} />
            <DialogFooter>
              <button type="button" onClick={() => setEditOpen(false)} className={btnGhost} disabled={actionLoading}>
                {common.cancel}
              </button>
              <button type="submit" className={btnPrimary} disabled={actionLoading || saving}>
                {(actionLoading || saving) ? copy.running : copy.save}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={copy.confirmDeleteTitle}
        description={copy.confirmDeleteBody}
        confirmLabel={copy.delete}
        cancelLabel={common.cancel}
        loading={actionLoading}
        tone="danger"
        onConfirm={handleDelete}
      />
    </div>
  )
}
