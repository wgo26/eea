'use client'

import { useState } from 'react'
import { createCategory, updateCategory, deleteCategory } from '@/lib/admin/actions'
import { ConfirmDialog, useAdminMutation } from '@/components/admin/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Dictionary } from '@/lib/i18n'
import type { AdminCategoryRow } from '@/lib/admin/queries'

type Copy = Dictionary['admin']['taxonomy']
type CommonCopy = Dictionary['admin']['common']
type TypeFilters = Dictionary['admin']['typeFilters']

const CONTENT_TYPES = ['photo_story', 'news', 'listing', 'notice', 'culture'] as const

const TYPE_LABEL_KEY: Record<string, keyof TypeFilters> = {
  photo_story: 'photoStory',
  news: 'news',
  listing: 'listings',
  notice: 'notices',
  culture: 'culture',
}

const inputCls =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary'
const labelCls = 'block text-xs font-medium text-muted-foreground mb-1'
const btnPrimary =
  'inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50'
const btnGhost =
  'inline-flex items-center justify-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50'
const btnDanger =
  'inline-flex items-center justify-center rounded-md border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50'

type CategoryFormState = {
  contentType: string
  nameEn: string
  nameFr: string
  slug: string
  descriptionEn: string
  descriptionFr: string
  sortOrder: string
  isActive: boolean
}

const emptyForm: CategoryFormState = {
  contentType: 'news',
  nameEn: '',
  nameFr: '',
  slug: '',
  descriptionEn: '',
  descriptionFr: '',
  sortOrder: '0',
  isActive: true,
}

function formFromRow(row: AdminCategoryRow): CategoryFormState {
  return {
    contentType: row.contentType,
    nameEn: row.nameEn ?? '',
    nameFr: row.nameFr ?? '',
    slug: row.slug,
    descriptionEn: row.descriptionEn ?? '',
    descriptionFr: row.descriptionFr ?? '',
    sortOrder: String(row.sortOrder),
    isActive: row.isActive,
  }
}

function CategoryFields({
  form,
  setForm,
  copy,
  typeFilters,
  showType,
}: {
  form: CategoryFormState
  setForm: (f: CategoryFormState) => void
  copy: Copy
  typeFilters: TypeFilters
  showType: boolean
}) {
  const set = (patch: Partial<CategoryFormState>) => setForm({ ...form, ...patch })
  return (
    <div className="grid gap-3">
      {showType && (
        <div>
          <label className={labelCls}>{copy.contentType}</label>
          <select value={form.contentType} onChange={(e) => set({ contentType: e.target.value })} className={inputCls}>
            {CONTENT_TYPES.map((ct) => (
              <option key={ct} value={ct}>
                {typeFilters[TYPE_LABEL_KEY[ct]]}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls}>{copy.nameEn}</label>
          <input value={form.nameEn} onChange={(e) => set({ nameEn: e.target.value })} className={inputCls} required />
        </div>
        <div>
          <label className={labelCls}>{copy.nameFr}</label>
          <input value={form.nameFr} onChange={(e) => set({ nameFr: e.target.value })} className={inputCls} />
        </div>
      </div>
      <div>
        <label className={labelCls}>{copy.slug}</label>
        <input value={form.slug} onChange={(e) => set({ slug: e.target.value })} className={inputCls} placeholder="auto" />
        <p className="mt-1 text-xs text-muted-foreground">{copy.slugAutoHint}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls}>{copy.sortOrder}</label>
          <input
            type="number"
            value={form.sortOrder}
            onChange={(e) => set({ sortOrder: e.target.value })}
            className={inputCls}
          />
        </div>
        <label className="flex items-center gap-2 text-sm pt-5">
          <input type="checkbox" checked={form.isActive} onChange={(e) => set({ isActive: e.target.checked })} />
          {copy.isActive}
        </label>
      </div>
    </div>
  )
}

export function CategoryCreateForm({
  copy,
  common,
  typeFilters,
}: {
  copy: Copy
  common: CommonCopy
  typeFilters: TypeFilters
}) {
  const { run, loading } = useAdminMutation()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<CategoryFormState>(emptyForm)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const ok = await run(
      () =>
        createCategory({
          contentType: form.contentType,
          slug: form.slug.trim() || undefined,
          nameEn: form.nameEn,
          nameFr: form.nameFr.trim() || undefined,
          sortOrder: Number(form.sortOrder) || 0,
          isActive: form.isActive,
        }),
      copy.toastCreated,
    )
    if (ok) {
      setForm(emptyForm)
      setOpen(false)
    }
  }

  return (
    <>
      <div className="flex justify-end">
        <button type="button" onClick={() => setOpen(true)} className={btnPrimary}>
          {copy.newCategory}
        </button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{copy.newCategory}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <CategoryFields form={form} setForm={setForm} copy={copy} typeFilters={typeFilters} showType />
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
    </>
  )
}

export function CategoryRowActions({
  category,
  siblings,
  copy,
  common,
  typeFilters,
  canDelete,
}: {
  category: AdminCategoryRow
  siblings: AdminCategoryRow[]
  copy: Copy
  common: CommonCopy
  typeFilters: TypeFilters
  canDelete: boolean
}) {
  const { run, loading } = useAdminMutation()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<CategoryFormState>(() => formFromRow(category))
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [reassignTo, setReassignTo] = useState('')

  const targets = siblings.filter((s) => s.id !== category.id && s.contentType === category.contentType)

  function openEditor() {
    setForm(formFromRow(category))
    setEditing(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const ok = await run(
      () =>
        updateCategory(category.id, {
          contentType: form.contentType,
          slug: form.slug,
          nameEn: form.nameEn,
          nameFr: form.nameFr.trim() || null,
          sortOrder: Number(form.sortOrder) || 0,
          isActive: form.isActive,
        }),
      copy.toastUpdated,
    )
    if (ok) setEditing(false)
  }

  async function handleDelete() {
    const ok = await run(
      () => deleteCategory(category.id, reassignTo || undefined),
      copy.toastDeleted,
    )
    if (ok) setDeleteOpen(false)
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <button type="button" onClick={openEditor} disabled={loading} className={btnGhost}>
        {copy.edit}
      </button>
      {canDelete && (
        <button
          type="button"
          onClick={() => {
            setReassignTo('')
            setDeleteOpen(true)
          }}
          disabled={loading}
          className={btnDanger}
        >
          {copy.delete}
        </button>
      )}

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{copy.editCategory}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <CategoryFields form={form} setForm={setForm} copy={copy} typeFilters={typeFilters} showType />
            <DialogFooter>
              <button type="button" onClick={() => setEditing(false)} className={btnGhost} disabled={loading}>
                {common.cancel}
              </button>
              <button type="submit" className={btnPrimary} disabled={loading}>
                {loading ? common.working : copy.save}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {canDelete && category.itemCount === 0 && (
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title={copy.deleteConfirmTitle.replace('{name}', category.nameEn ?? category.slug)}
          description={copy.deleteConfirmBody}
          confirmLabel={copy.delete}
          cancelLabel={common.cancel}
          loading={loading}
          onConfirm={handleDelete}
        />
      )}

      {canDelete && category.itemCount > 0 && (
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{copy.deleteConfirmTitle.replace('{name}', category.nameEn ?? category.slug)}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {category.itemCount} {copy.usageContent} · {copy.reassignHintCategory}
              </p>
              <div>
                <label className={labelCls}>{copy.reassignTo}</label>
                <select value={reassignTo} onChange={(e) => setReassignTo(e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  {targets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nameEn ?? s.slug} ({s.slug})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <DialogFooter>
              <button type="button" onClick={() => setDeleteOpen(false)} className={btnGhost} disabled={loading}>
                {common.cancel}
              </button>
              <button type="button" onClick={handleDelete} className={btnPrimary} disabled={loading || !reassignTo}>
                {loading ? common.working : copy.delete}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
