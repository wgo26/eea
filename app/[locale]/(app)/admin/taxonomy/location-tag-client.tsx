'use client'

import { useState } from 'react'
import { createLocationTag, updateLocationTag, deleteLocationTag } from '@/lib/admin/actions/taxonomy'
import { ConfirmDialog, useAdminMutation } from '@/components/admin/confirm-dialog'
import { useToast } from '@/components/admin/toast'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Dictionary } from '@/lib/i18n'
import type { AdminLocationTag } from '@/lib/admin/queries'

type Copy = Dictionary['admin']['taxonomy']
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

type LocationTagFormState = {
  slug: string
  nameEn: string
  nameFr: string
  color: string
}

const emptyForm: LocationTagFormState = {
  slug: '',
  nameEn: '',
  nameFr: '',
  color: '#0ea5e9',
}

function formFromRow(row: AdminLocationTag): LocationTagFormState {
  return {
    slug: row.slug,
    nameEn: row.nameEn,
    nameFr: row.nameFr,
    color: row.color ?? '#0ea5e9',
  }
}

export function LocationTagCreateForm({
  copy,
  common,
}: {
  copy: Copy
  common: CommonCopy
}) {
  const { run, loading } = useAdminMutation()
  const { addToast } = useToast()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<LocationTagFormState>(emptyForm)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const ok = await run(
      () =>
        createLocationTag({
          slug: form.slug.trim(),
          nameEn: form.nameEn.trim(),
          nameFr: form.nameFr.trim(),
          color: form.color.trim() || undefined,
        }),
      copy.toastCreated ?? 'Created.',
    )
    if (ok) {
      setForm(emptyForm)
      setOpen(false)
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={btnPrimary}>
        {copy.newLocationTag}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md space-y-4">
          <DialogHeader>
            <DialogTitle>{copy.newLocationTag}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={labelCls}>{copy.locationTagNameEn}</label>
              <input
                value={form.nameEn}
                onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className={labelCls}>{copy.locationTagNameFr}</label>
              <input
                value={form.nameFr}
                onChange={(e) => setForm({ ...form, nameFr: e.target.value })}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className={labelCls}>{copy.locationTagColor}</label>
              <input
                type="color"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="h-9 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm cursor-pointer"
              />
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
    </>
  )
}

export function LocationTagRowActions({
  tag,
  copy,
  common,
  canDelete,
}: {
  tag: AdminLocationTag
  copy: Copy
  common: CommonCopy
  canDelete: boolean
}) {
  const { run, loading } = useAdminMutation()
  const { addToast } = useToast()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<LocationTagFormState>(() => formFromRow(tag))
  const [deleteOpen, setDeleteOpen] = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const ok = await run(
      () =>
        updateLocationTag(tag.id, {
          slug: form.slug.trim(),
          nameEn: form.nameEn.trim(),
          nameFr: form.nameFr.trim(),
          color: form.color.trim() || null,
        }),
      copy.toastUpdated ?? 'Saved.',
    )
    if (ok) setEditing(false)
  }

  async function handleDelete() {
    const ok = await run(() => deleteLocationTag(tag.id), copy.toastDeleted ?? 'Deleted.')
    if (ok) setDeleteOpen(false)
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <button type="button" onClick={() => { setForm(formFromRow(tag)); setEditing(true) }} disabled={loading} className={btnGhost}>
        {copy.edit}
      </button>
      {canDelete && (
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          disabled={loading}
          className={btnDanger}
        >
          {copy.deleteLocationTag}
        </button>
      )}

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-md space-y-4">
          <DialogHeader>
            <DialogTitle>{copy.editLocationTag}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className={labelCls}>{copy.locationTagNameEn}</label>
              <input
                value={form.nameEn}
                onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className={labelCls}>{copy.locationTagNameFr}</label>
              <input
                value={form.nameFr}
                onChange={(e) => setForm({ ...form, nameFr: e.target.value })}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className={labelCls}>{copy.locationTagColor}</label>
              <input
                type="color"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="h-9 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm cursor-pointer"
              />
            </div>
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

      {canDelete && (
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title={`Delete ${tag.nameEn}?`}
          description={copy.deleteConfirmBody ?? 'This cannot be undone.'}
          confirmLabel={copy.delete}
          cancelLabel={common.cancel}
          loading={loading}
          onConfirm={handleDelete}
        />
      )}
    </div>
  )
}
