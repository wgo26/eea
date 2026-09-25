'use client'

import { useState } from 'react'
import {
  createTemplate,
  updateTemplate,
  deleteTemplate,
  compileTemplateNow,
  type TemplateInput,
} from '@/lib/admin/actions/digest'
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

type Copy = Dictionary['admin']['templates']
type CommonCopy = Dictionary['admin']['common']

const inputCls =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary'
const labelCls = 'block text-xs font-medium text-muted-foreground mb-1'
const btnPrimary =
  'inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50'
const btnGhost =
  'inline-flex items-center justify-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50'
const btnDanger =
  'inline-flex items-center justify-center rounded-md border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50'

const SECTION_OPTIONS = ['news', 'photo', 'notice', 'listing', 'culture'] as const

function sectionOptions(copy: Copy): { value: (typeof SECTION_OPTIONS)[number]; label: string }[] {
  return [
    { value: 'news', label: copy.sectionNews },
    { value: 'photo', label: copy.sectionPhoto },
    { value: 'notice', label: copy.sectionNotice },
    { value: 'listing', label: copy.sectionListing },
    { value: 'culture', label: copy.sectionCulture },
  ]
}

type FormState = {
  name: string
  nameFr: string
  slugBase: string
  section: (typeof SECTION_OPTIONS)[number]
  windowDays: string
  cadence: 'daily' | 'weekly'
  living: boolean
}

const emptyForm: FormState = {
  name: '',
  nameFr: '',
  slugBase: '',
  section: 'news',
  windowDays: '7',
  cadence: 'weekly',
  living: true,
}

function toInput(form: FormState): TemplateInput {
  return {
    name: form.name,
    nameFr: form.nameFr || null,
    slugBase: form.slugBase,
    section: form.section,
    windowDays: Number(form.windowDays),
    cadence: form.cadence,
    living: form.living,
  }
}

function TemplateFields({ form, setForm, copy }: { form: FormState; setForm: (f: FormState) => void; copy: Copy }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls}>{copy.name}</label>
          <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} required />
        </div>
        <div>
          <label className={labelCls}>{copy.nameFr}</label>
          <input type="text" value={form.nameFr} onChange={(e) => setForm({ ...form, nameFr: e.target.value })} className={inputCls} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={labelCls}>{copy.slugBase}</label>
          <input type="text" value={form.slugBase} onChange={(e) => setForm({ ...form, slugBase: e.target.value })} className={inputCls} required />
        </div>
        <div>
          <label className={labelCls}>{copy.sectionLabel}</label>
          <select
            value={form.section}
            onChange={(e) => setForm({ ...form, section: e.target.value as FormState['section'] })}
            className={inputCls}
          >
            {sectionOptions(copy).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>{copy.windowDaysLabel}</label>
          <input
            type="number"
            min={1}
            max={90}
            value={form.windowDays}
            onChange={(e) => setForm({ ...form, windowDays: e.target.value })}
            className={inputCls}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="radio"
            name="cadence"
            checked={form.cadence === 'weekly'}
            onChange={() => setForm({ ...form, cadence: 'weekly' })}
          />
          {copy.cadenceWeekly}
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="radio"
            name="cadence"
            checked={form.cadence === 'daily'}
            onChange={() => setForm({ ...form, cadence: 'daily' })}
          />
          {copy.cadenceDaily}
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={form.living} onChange={(e) => setForm({ ...form, living: e.target.checked })} />
          {copy.livingLabel}
        </label>
      </div>
    </div>
  )
}

export function TemplateCreateForm({ copy }: { copy: Copy }) {
  const { addToast } = useToast()
  const [form, setForm] = useState<FormState>(emptyForm)
  const [loading, setLoading] = useState(false)

  async function handleCreate() {
    setLoading(true)
    const result = await createTemplate(toInput(form))
    setLoading(false)
    if (result.ok) {
      addToast(copy.toastCreated, 'success')
      setForm(emptyForm)
    } else {
      addToast(result.error, 'error')
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-medium">{copy.createTitle}</h2>
      <div className="mt-3 space-y-3">
        <TemplateFields form={form} setForm={setForm} copy={copy} />
        <div className="flex justify-end">
          <button type="button" onClick={handleCreate} disabled={loading} className={btnPrimary}>
            {loading ? copy.creating : copy.create}
          </button>
        </div>
      </div>
    </section>
  )
}

type Row = {
  id: string
  name: string
  nameFr: string | null
  slugBase: string
  section: string
  sourceType: string | null
  locationSlug: string | null
  tagSlug: string | null
  windowDays: number
  cadence: 'daily' | 'weekly'
  living: boolean
  isActive: boolean
}

export function TemplateRowActions({ row, copy, common }: { row: Row; copy: Copy; common: CommonCopy }) {
  const { addToast } = useToast()
  const { run, loading: actionLoading } = useAdminMutation()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [compileLoading, setCompileLoading] = useState(false)
  const [form, setForm] = useState<FormState>({
    name: row.name,
    nameFr: row.nameFr ?? '',
    slugBase: row.slugBase,
    section: (SECTION_OPTIONS as readonly string[]).includes(row.section) ? (row.section as FormState['section']) : 'news',
    windowDays: String(row.windowDays),
    cadence: row.cadence,
    living: row.living,
  })

  async function handleCompile() {
    setCompileLoading(true)
    const result = await compileTemplateNow(row.id)
    setCompileLoading(false)
    if (result.ok) {
      addToast(
        (result.added ?? 0) > 0 ? copy.toastCompiled.replace('{count}', String(result.added ?? 0)) : copy.toastCompiledEmpty,
        'success',
      )
    } else addToast(result.error, 'error')
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault()
    const ok = await run(() => updateTemplate(row.id, { ...toInput(form), isActive: row.isActive }), copy.toastUpdated)
    if (ok) setEditOpen(false)
  }

  async function handleDelete() {
    const ok = await run(() => deleteTemplate(row.id), copy.toastDeleted)
    if (ok) setDeleteOpen(false)
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <button type="button" onClick={handleCompile} disabled={compileLoading || actionLoading} className={btnGhost}>
        {compileLoading ? copy.compiling : copy.compileNow}
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
            <DialogTitle>{copy.editTitle}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <TemplateFields form={form} setForm={setForm} copy={copy} />
            <DialogFooter>
              <button type="button" onClick={() => setEditOpen(false)} className={btnGhost} disabled={actionLoading}>
                {common.cancel}
              </button>
              <button type="submit" className={btnPrimary} disabled={actionLoading}>
                {actionLoading ? common.working : common.confirm}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={copy.deleteConfirmTitle}
        description={copy.deleteConfirmBody}
        confirmLabel={copy.delete}
        cancelLabel={common.cancel}
        loading={actionLoading}
        tone="danger"
        onConfirm={handleDelete}
      />
    </div>
  )
}
