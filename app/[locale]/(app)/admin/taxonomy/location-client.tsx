'use client'

import { useState } from 'react'
import { createLocation, updateLocation, deleteLocation, getLocationRedirects, deleteLocationRedirect, createLocationType, updateLocationType, deleteLocationType, createLocationTag, updateLocationTag, deleteLocationTag, setLocationTag } from '@/lib/admin/actions/taxonomy'
import { getLocationTagIds } from '@/lib/admin/queries'
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
import type { AdminLocationRow, AdminLocationType, AdminLocationTag } from '@/lib/admin/queries'

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

type LocationFormState = {
  name: string
  nameFr: string
  slug: string
  locationTypeId: string
  description: string
  descriptionFr: string
  latitude: string
  longitude: string
  parentId: string
  isActive: boolean
}

const emptyForm: LocationFormState = {
  name: '',
  nameFr: '',
  slug: '',
  locationTypeId: '',
  description: '',
  descriptionFr: '',
  latitude: '',
  longitude: '',
  parentId: '',
  isActive: true,
}

function formFromRow(row: AdminLocationRow, types: AdminLocationType[], tags: AdminLocationTag[]): LocationFormState {
  return {
    name: row.name,
    nameFr: '',
    slug: row.slug,
    locationTypeId: row.locationTypeId ?? '',
    description: row.description ?? '',
    descriptionFr: '',
    latitude: row.latitude === null ? '' : String(row.latitude),
    longitude: row.longitude === null ? '' : String(row.longitude),
    parentId: row.parentId ?? '',
    isActive: row.isActive,
  }
}

function parseCoord(value: string): number | null | undefined {
  if (!value.trim()) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function LocationFields({
  form,
  setForm,
  copy,
  types,
  tags,
  locationTagIds,
  setLocationTagIds,
  locations,
  excludeId,
  showSlugWarning,
}: {
  form: LocationFormState
  setForm: (f: LocationFormState) => void
  copy: Copy
  types: AdminLocationType[]
  tags: AdminLocationTag[]
  locationTagIds: string[]
  setLocationTagIds: (ids: string[]) => void
  locations: AdminLocationRow[]
  excludeId?: string
  showSlugWarning: boolean
}) {
  const set = (patch: Partial<LocationFormState>) => setForm({ ...form, ...patch })
  const toggleTag = (tagId: string) => {
    setLocationTagIds(prev =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    )
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls}>{copy.name}</label>
          <input value={form.name} onChange={(e) => set({ name: e.target.value })} className={inputCls} required />
        </div>
        <div>
          <label className={labelCls}>{copy.nameFr}</label>
          <input value={form.nameFr} onChange={(e) => set({ nameFr: e.target.value })} className={inputCls} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls}>{copy.slug}</label>
          <input value={form.slug} onChange={(e) => set({ slug: e.target.value })} className={inputCls} placeholder="auto" />
        </div>
        <div>
          <label className={labelCls}>{copy.locationTypeField}</label>
          <select value={form.locationTypeId} onChange={(e) => set({ locationTypeId: e.target.value })} className={inputCls}>
            <option value="">{copy.noParent}</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nameEn} · {t.nameFr}
              </option>
            ))}
          </select>
        </div>
      </div>
      {showSlugWarning && <p className="text-xs text-amber-700 dark:text-amber-400">{copy.slugRenameWarning}</p>}
      {!showSlugWarning && <p className="-mt-1 text-xs text-muted-foreground">{copy.slugAutoHint}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls}>{copy.descriptionLabel}</label>
          <textarea
            value={form.description}
            onChange={(e) => set({ description: e.target.value })}
            rows={2}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>{copy.descriptionFr}</label>
          <textarea
            value={form.descriptionFr}
            onChange={(e) => set({ descriptionFr: e.target.value })}
            rows={2}
            className={inputCls}
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={labelCls}>{copy.latitude}</label>
          <input value={form.latitude} onChange={(e) => set({ latitude: e.target.value })} className={inputCls} inputMode="decimal" />
        </div>
        <div>
          <label className={labelCls}>{copy.longitude}</label>
          <input value={form.longitude} onChange={(e) => set({ longitude: e.target.value })} className={inputCls} inputMode="decimal" />
        </div>
        <label className="flex items-center gap-2 text-sm pt-5">
          <input type="checkbox" checked={form.isActive} onChange={(e) => set({ isActive: e.target.checked })} />
          {copy.isActive}
        </label>
      </div>
      <div>
        <label className={labelCls}>{copy.parent}</label>
        <select value={form.parentId} onChange={(e) => set({ parentId: e.target.value })} className={inputCls}>
          <option value="">{copy.noParent}</option>
          {locations
            .filter((l) => l.id !== excludeId)
            .map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.slug})
              </option>
            ))}
        </select>
      </div>
      <div>
        <label className={labelCls}>{copy.tags}</label>
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => {
            const active = locationTagIds.includes(tag.id)
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.id)}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-primary border-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground hover:bg-accent'
                }`}
              >
                {tag.nameEn} · {tag.nameFr}
              </button>
            )
          })}
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">{copy.noTags && tags.length === 0 ? copy.noTags : ''}</p>
      </div>
    </div>
  )
}

export function LocationCreateForm({
  copy,
  common,
  locations,
  types,
  tags,
}: {
  copy: Copy
  common: CommonCopy
  locations: AdminLocationRow[]
  types: AdminLocationType[]
  tags: AdminLocationTag[]
}) {
  const { run, loading } = useAdminMutation()
  const { addToast } = useToast()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<LocationFormState>(emptyForm)
  const [tagIds, setTagIds] = useState<string[]>([])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const latitude = parseCoord(form.latitude)
    const longitude = parseCoord(form.longitude)
    if (latitude === undefined || longitude === undefined) {
      addToast(copy.invalidCoords, 'error')
      return
    }
    const ok = await run(
      () =>
        createLocation({
          name: form.name,
          nameFr: form.nameFr || undefined,
          slug: form.slug.trim() || undefined,
          locationTypeId: form.locationTypeId || null,
          description: form.description.trim() || undefined,
          descriptionFr: form.descriptionFr.trim() || undefined,
          latitude,
          longitude,
          parentId: form.parentId || null,
          isActive: form.isActive,
        }),
      copy.toastCreated,
    )
    if (ok) {
      setForm(emptyForm)
      setTagIds([])
      setOpen(false)
    }
  }

  return (
    <>
      <div className="flex justify-end gap-2">
        <LocationRedirectsButton copy={copy} common={common} />
        <button type="button" onClick={() => setOpen(true)} className={btnPrimary}>
          {copy.newLocation}
        </button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{copy.newLocation}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <LocationFields
              form={form}
              setForm={setForm}
              copy={copy}
              types={types}
              tags={tags}
              locationTagIds={tagIds}
              setLocationTagIds={setTagIds}
              locations={locations}
              showSlugWarning={false}
            />
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

export function LocationRowActions({
  location,
  locations,
  types,
  tags,
  copy,
  common,
  canDelete,
}: {
  location: AdminLocationRow
  locations: AdminLocationRow[]
  types: AdminLocationType[]
  tags: AdminLocationTag[]
  copy: Copy
  common: CommonCopy
  canDelete: boolean
}) {
  const { run, loading } = useAdminMutation()
  const { addToast } = useToast()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<LocationFormState>(() => formFromRow(location, types, tags))
  const [tagIds, setTagIds] = useState<string[]>([])
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [reassignTo, setReassignTo] = useState('')

  const usage = location.contentCount + location.profileCount
  const targets = locations.filter((l) => l.id !== location.id)

  async function openEditor() {
    setForm(formFromRow(location, types, tags))
    const existing = await getLocationTagIds(location.id)
    setTagIds(existing)
    setEditing(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const latitude = parseCoord(form.latitude)
    const longitude = parseCoord(form.longitude)
    if (latitude === undefined || longitude === undefined) {
      addToast(copy.invalidCoords, 'error')
      return
    }
    const ok = await run(
      () =>
        updateLocation(location.id, {
          name: form.name,
          nameFr: form.nameFr || null,
          slug: form.slug,
          locationTypeId: form.locationTypeId || null,
          description: form.description.trim() || null,
          descriptionFr: form.descriptionFr.trim() || null,
          latitude,
          longitude,
          parentId: form.parentId || null,
          isActive: form.isActive,
        }),
      copy.toastUpdated,
    )
    if (ok) {
      // Sync tags to match the selection: remove unselected, add new.
      const existing = await getLocationTagIds(location.id)
      const existingSet = new Set(existing)
      const selectedSet = new Set(tagIds)
      for (const tagId of existing) {
        if (!selectedSet.has(tagId)) {
          await run(() => setLocationTag(location.id, tagId, false))
        }
      }
      for (const tagId of tagIds) {
        if (!existingSet.has(tagId)) {
          await run(() => setLocationTag(location.id, tagId, true))
        }
      }
      setEditing(false)
    }
  }

  async function handleDelete() {
    const ok = await run(() => deleteLocation(location.id, reassignTo || undefined), copy.toastDeleted)
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
            <DialogTitle>{copy.editLocation}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <LocationFields
              form={form}
              setForm={setForm}
              copy={copy}
              types={types}
              tags={tags}
              locationTagIds={tagIds}
              setLocationTagIds={setTagIds}
              locations={locations}
              excludeId={location.id}
              showSlugWarning={form.slug.trim() !== location.slug}
            />
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

      {canDelete && usage === 0 && (
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title={copy.deleteConfirmTitle.replace('{name}', location.name)}
          description={copy.deleteConfirmBody}
          confirmLabel={copy.delete}
          cancelLabel={common.cancel}
          loading={loading}
          onConfirm={handleDelete}
        />
      )}

      {canDelete && usage > 0 && (
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{copy.deleteConfirmTitle.replace('{name}', location.name)}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {location.contentCount} {copy.usageContent} · {location.profileCount} {copy.usageProfiles} ·{' '}
                {copy.reassignHintLocation}
              </p>
              <div>
                <label className={labelCls}>{copy.reassignTo}</label>
                <select value={reassignTo} onChange={(e) => setReassignTo(e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  {targets.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.slug})
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

export function LocationRedirectsButton({ copy, common }: { copy: Copy; common: CommonCopy }) {
  const [open, setOpen] = useState(false)
  const [redirects, setRedirects] = useState<Array<{
    id: string
    old_slug: string
    created_at: string
    location_id: string
    location_name: string
    location_slug: string
  }>>([])
  const [loading, setLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const { run, loading: actionLoading } = useAdminMutation()

  async function loadRedirects() {
    setLoading(true)
    const res = await getLocationRedirects()
    setLoading(false)
    if (res.ok && res.redirects) {
      setRedirects(res.redirects)
    }
  }

  function handleOpenChange(isOpen: boolean) {
    setOpen(isOpen)
    if (isOpen) {
      loadRedirects()
    }
  }

  async function handleDelete(id: string) {
    const ok = await run(() => deleteLocationRedirect(id), copy.toastDeleted)
    if (ok) {
      setRedirects((prev) => prev.filter((r) => r.id !== id))
      setDeleteTarget(null)
    }
  }

  return (
    <>
      <button type="button" onClick={() => handleOpenChange(true)} className={btnGhost}>
        {copy.tabRedirects}
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{copy.tabRedirects}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {loading ? (
              <div className="text-sm text-muted-foreground py-4 text-center">{common.working}</div>
            ) : redirects.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">{copy.redirectsEmpty}</div>
            ) : (
              <div className="border border-border rounded-md divide-y divide-border">
                {redirects.map((r) => (
                  <div key={r.id} className="p-3 flex items-center justify-between text-sm gap-2">
                    <div className="min-w-0">
                      <div className="font-mono text-xs text-foreground truncate">{r.old_slug}</div>
                      <div className="text-xs text-muted-foreground">
                        {copy.targetLocation}: <span className="font-medium text-foreground">{r.location_name}</span> ({r.location_slug})
                      </div>
                      <div className="text-xs text-muted-foreground/70">
                        {copy.createdAt}: {new Date(r.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(r.id)}
                      className={btnDanger}
                      disabled={actionLoading}
                    >
                      {copy.delete}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <button type="button" onClick={() => setOpen(false)} className={btnGhost}>
              {common.cancel}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {deleteTarget && (
        <ConfirmDialog
          open={Boolean(deleteTarget)}
          onOpenChange={(v) => !v && setDeleteTarget(null)}
          title={copy.deleteRedirectConfirmTitle.replace('{slug}', redirects.find((r) => r.id === deleteTarget)?.old_slug ?? '')}
          description={copy.deleteRedirectConfirmBody}
          confirmLabel={copy.delete}
          cancelLabel={common.cancel}
          loading={actionLoading}
          onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        />
      )}
    </>
  )
}
