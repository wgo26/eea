'use client'

import { useState } from 'react'
import { createLocation, updateLocation, deleteLocation, getLocationRedirects, deleteLocationRedirect } from '@/lib/admin/actions'
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
import type { AdminLocationRow } from '@/lib/admin/queries'

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
  slug: string
  locale: string
  locationType: string
  description: string
  latitude: string
  longitude: string
  parentId: string
  isActive: boolean
}

const emptyForm: LocationFormState = {
  name: '',
  slug: '',
  locale: 'en',
  locationType: '',
  description: '',
  latitude: '',
  longitude: '',
  parentId: '',
  isActive: true,
}

function formFromRow(row: AdminLocationRow): LocationFormState {
  return {
    name: row.name,
    slug: row.slug,
    locale: row.locale === 'fr' ? 'fr' : 'en',
    locationType: row.locationType ?? '',
    description: row.description ?? '',
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
  locations,
  excludeId,
  showSlugWarning,
}: {
  form: LocationFormState
  setForm: (f: LocationFormState) => void
  copy: Copy
  locations: AdminLocationRow[]
  excludeId?: string
  showSlugWarning: boolean
}) {
  const set = (patch: Partial<LocationFormState>) => setForm({ ...form, ...patch })
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls}>{copy.name}</label>
          <input value={form.name} onChange={(e) => set({ name: e.target.value })} className={inputCls} required />
        </div>
        <div>
          <label className={labelCls}>{copy.slug}</label>
          <input value={form.slug} onChange={(e) => set({ slug: e.target.value })} className={inputCls} placeholder="auto" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls}>{copy.localeLabel}</label>
          <select value={form.locale} onChange={(e) => set({ locale: e.target.value })} className={inputCls}>
            <option value="en">{copy.localeEn}</option>
            <option value="fr">{copy.localeFr}</option>
          </select>
        </div>
        <p className="text-xs text-muted-foreground self-end">{copy.sharedValueNotice}</p>
      </div>
      {showSlugWarning && <p className="text-xs text-amber-700 dark:text-amber-400">{copy.slugRenameWarning}</p>}
      {!showSlugWarning && <p className="-mt-1 text-xs text-muted-foreground">{copy.slugAutoHint}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls}>{copy.locationType}</label>
          <input
            value={form.locationType}
            onChange={(e) => set({ locationType: e.target.value })}
            className={inputCls}
            placeholder={copy.locationTypePh}
          />
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
      </div>
      <div>
          <label className={labelCls}>{copy.descriptionLabel}</label>
        <textarea
          value={form.description}
          onChange={(e) => set({ description: e.target.value })}
          rows={2}
          className={inputCls}
        />
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
    </div>
  )
}

export function LocationCreateForm({
  copy,
  common,
  locations,
}: {
  copy: Copy
  common: CommonCopy
  locations: AdminLocationRow[]
}) {
  const { run, loading } = useAdminMutation()
  const { addToast } = useToast()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<LocationFormState>(emptyForm)

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
          slug: form.slug.trim() || undefined,
          locale: form.locale,
          locationType: form.locationType.trim() || undefined,
          description: form.description.trim() || undefined,
          latitude,
          longitude,
          parentId: form.parentId || null,
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
  copy,
  common,
  canDelete,
}: {
  location: AdminLocationRow
  locations: AdminLocationRow[]
  copy: Copy
  common: CommonCopy
  canDelete: boolean
}) {
  const { run, loading } = useAdminMutation()
  const { addToast } = useToast()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<LocationFormState>(() => formFromRow(location))
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [reassignTo, setReassignTo] = useState('')

  const usage = location.contentCount + location.profileCount
  const targets = locations.filter((l) => l.id !== location.id)

  function openEditor() {
    setForm(formFromRow(location))
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
          slug: form.slug,
          locale: form.locale,
          locationType: form.locationType.trim() || null,
          description: form.description.trim() || null,
          latitude,
          longitude,
          parentId: form.parentId || null,
          isActive: form.isActive,
        }),
      copy.toastUpdated,
    )
    if (ok) setEditing(false)
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
                      <div className="text-[11px] text-muted-foreground/70">
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

