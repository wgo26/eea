'use client'

import { useRef, useState } from 'react'

import {
  archiveBrandAsset,
  createBrandAsset,
  replaceBrandAsset,
  updateBrandAssetMeta,
} from '@/lib/admin/actions/themes'
import { BRAND_ASSET_TYPES, type BrandAssetType } from '@/lib/branding/assets'
import { ConfirmDialog } from '@/components/admin/confirm-dialog'
import { EmptyState } from '@/components/admin/empty-state'
import { TypeBadge } from '@/components/admin/status-badge'
import { useToast } from '@/components/admin/toast'
import { Field, ui } from '@/lib/admin/ui-constants'
import { fillCopy, formatRelative } from '@/lib/admin/format'
import { useLocaleFromPath } from '@/components/site-header'
import type { BrandAssetRow } from '@/lib/admin/queries/themes'
import type { Dictionary } from '@/lib/i18n'

type Copy = Dictionary['admin']['branding']

type Uploaded = {
  publicUrl: string
  storageKey: string
  provider: string
  width: number | null
  height: number | null
  mimeType: string
  fileSizeBytes: number
}

const btnSmGhost = `${ui.btnSm} border border-border bg-background text-muted-foreground hover:text-foreground`
const chipCls = 'rounded-full border px-2 py-0.5 text-xs font-medium uppercase tracking-wide'
const ACCEPT = 'image/png,image/jpeg,image/webp'

function formatFromMime(mime: string): string | null {
  const sub = mime.split('/')[1]?.toLowerCase() ?? ''
  if (sub === 'jpeg' || sub === 'jpg') return 'jpeg'
  return sub || null
}

/**
 * Spec §11 asset library. Uploads go through /api/uploads first (validation,
 * hashing, storage) and only the resulting URL is registered here — the browser
 * never hands bytes to a server action. Replacing an asset writes version n+1
 * and reports how many live themes still point at the previous file, because a
 * published theme keeps the bytes it shipped with until it is republished.
 */
export function AssetLibrary({
  assets,
  copy,
  common,
}: {
  assets: BrandAssetRow[]
  copy: Copy
  common: Dictionary['admin']['common']
}) {
  const locale = useLocaleFromPath()
  const { addToast } = useToast()

  const [name, setName] = useState('')
  const [type, setType] = useState<BrandAssetType>('logo')
  const [restrictions, setRestrictions] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const [editing, setEditing] = useState<BrandAssetRow | null>(null)
  const [editName, setEditName] = useState('')
  const [editType, setEditType] = useState<BrandAssetType>('logo')
  const [editRestrictions, setEditRestrictions] = useState('')

  const [replacing, setReplacing] = useState<BrandAssetRow | null>(null)
  const [replaceFile, setReplaceFile] = useState<File | null>(null)
  const replaceInput = useRef<HTMLInputElement>(null)

  const [archiveFor, setArchiveFor] = useState<BrandAssetRow | null>(null)
  const [busy, setBusy] = useState<'upload' | 'edit' | 'replace' | 'archive' | null>(null)

  async function upload(fileToSend: File): Promise<Uploaded | null> {
    const form = new FormData()
    form.append('file', fileToSend)
    form.append('destination', 'admin_asset')
    const res = await fetch('/api/uploads', { method: 'POST', body: form })
    const json = (await res.json()) as Partial<Uploaded> & { publicUrl?: string; error?: string }
    if (!res.ok || !json.publicUrl) {
      addToast(json.error ?? copy.uploadFailed, 'error')
      return null
    }
    return {
      publicUrl: json.publicUrl,
      storageKey: json.storageKey ?? '',
      provider: json.provider ?? 'r2',
      width: json.width ?? null,
      height: json.height ?? null,
      mimeType: json.mimeType ?? '',
      fileSizeBytes: json.fileSizeBytes ?? fileToSend.size,
    }
  }

  async function handleCreate() {
    if (!name.trim()) {
      addToast(copy.nameRequired, 'error')
      return
    }
    if (!file) {
      addToast(copy.fileRequired, 'error')
      return
    }
    setUploading(true)
    setBusy('upload')
    try {
      const uploaded = await upload(file)
      if (!uploaded) return
      const result = await createBrandAsset({
        name,
        type,
        fileUrl: uploaded.publicUrl,
        provider: uploaded.provider,
        storageKey: uploaded.storageKey,
        width: uploaded.width,
        height: uploaded.height,
        format: formatFromMime(uploaded.mimeType),
        sizeBytes: uploaded.fileSizeBytes,
        usageRestrictions: restrictions || null,
      })
      if (!result.ok) {
        addToast(result.error, 'error')
        return
      }
      addToast(copy.toastUploaded, 'success')
      setName('')
      setRestrictions('')
      setFile(null)
      if (fileInput.current) fileInput.current.value = ''
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Operation failed', 'error')
    } finally {
      setUploading(false)
      setBusy(null)
    }
  }

  function openEdit(asset: BrandAssetRow) {
    setEditing(asset)
    setEditName(asset.name)
    setEditType(asset.type)
    setEditRestrictions(asset.usageRestrictions ?? '')
  }

  async function handleEdit() {
    if (!editing) return
    setBusy('edit')
    try {
      const result = await updateBrandAssetMeta(editing.id, {
        name: editName,
        type: editType,
        usageRestrictions: editRestrictions || null,
      })
      if (!result.ok) {
        addToast(result.error, 'error')
        return
      }
      addToast(copy.toastAssetUpdated, 'success')
      setEditing(null)
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Operation failed', 'error')
    } finally {
      setBusy(null)
    }
  }

  async function handleReplace() {
    if (!replacing) return
    if (!replaceFile) {
      addToast(copy.fileRequired, 'error')
      return
    }
    setBusy('replace')
    try {
      const uploaded = await upload(replaceFile)
      if (!uploaded) return
      const result = await replaceBrandAsset(replacing.id, {
        name: replacing.name,
        type: replacing.type,
        fileUrl: uploaded.publicUrl,
        provider: uploaded.provider,
        storageKey: uploaded.storageKey,
        width: uploaded.width,
        height: uploaded.height,
        format: formatFromMime(uploaded.mimeType),
        sizeBytes: uploaded.fileSizeBytes,
        usageRestrictions: replacing.usageRestrictions,
      })
      if (!result.ok) {
        addToast(result.error, 'error')
        return
      }
      addToast(fillCopy(copy.toastAssetReplaced, { version: result.version }), 'success')
      if (result.liveReferences > 0) {
        addToast(fillCopy(copy.liveReferences, { count: result.liveReferences }), 'info')
      }
      setReplacing(null)
      setReplaceFile(null)
      if (replaceInput.current) replaceInput.current.value = ''
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Operation failed', 'error')
    } finally {
      setBusy(null)
    }
  }

  async function handleArchive() {
    if (!archiveFor) return
    setBusy('archive')
    try {
      const result = await archiveBrandAsset(archiveFor.id)
      if (!result.ok) {
        addToast(result.error, 'error')
        return
      }
      addToast(copy.toastAssetArchived, 'success')
      setArchiveFor(null)
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Operation failed', 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-medium">{copy.uploadHeading}</h2>
        <p className="text-xs text-muted-foreground">{copy.uploadHint}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={copy.assetNameLabel}>
            <input
              className={ui.input}
              value={name}
              placeholder={copy.assetNamePlaceholder}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label={copy.assetTypeLabel}>
            <select
              className={ui.select}
              value={type}
              onChange={(e) => setType(e.target.value as BrandAssetType)}
            >
              {BRAND_ASSET_TYPES.map((entry) => (
                <option key={entry} value={entry}>
                  {copy.assetTypes[entry]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={copy.restrictionsLabel}>
          <textarea
            className={ui.textarea}
            rows={2}
            value={restrictions}
            placeholder={copy.restrictionsPlaceholder}
            onChange={(e) => setRestrictions(e.target.value)}
          />
        </Field>
        <Field label={copy.fileLabel} hint={copy.fileHint}>
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT}
            className={ui.input}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </Field>
        <div className="flex justify-end">
          <button
            type="button"
            className={ui.btnPrimary}
            disabled={uploading}
            onClick={handleCreate}
          >
            {uploading ? common.working : copy.uploadSubmit}
          </button>
        </div>
      </section>

      {assets.length === 0 ? (
        <EmptyState message={copy.emptyAssets} className="p-6" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {assets.map((asset) => (
            <article key={asset.id} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3">
              <div className="flex items-start gap-3">
                <a
                  href={asset.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border bg-muted/40"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={asset.fileUrl} alt={asset.name} className="h-full w-full object-contain" />
                </a>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-medium" title={asset.name}>
                      {asset.name}
                    </h3>
                    {!asset.isActive && (
                      <span className={`${chipCls} border-amber-300 bg-amber-50 text-amber-900`}>
                        {copy.superseded}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <TypeBadge type={asset.type} label={copy.assetTypes[asset.type]} />
                    <span className="rounded-md border border-border px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                      {copy.colAssetVersion} {asset.version}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{asset.meta}</p>
                </div>
              </div>

              {asset.usageRestrictions && (
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{copy.colRestrictions}:</span>{' '}
                  {asset.usageRestrictions}
                </p>
              )}

              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{copy.colUsedBy}:</span>
                {asset.usage.length === 0 ? (
                  <span className="block">{copy.usedByNone}</span>
                ) : (
                  <ul className="mt-0.5 space-y-0.5">
                    {asset.usage.map((row) => (
                      <li key={`${row.themeId}-${row.role}`}>
                        {fillCopy(copy.usageLine, {
                          name: row.themeName,
                          version: row.themeVersion,
                          role: row.role.replace(/_/g, ' '),
                        })}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                {asset.ownerName ?? '—'} · {asset.createdAt ? formatRelative(asset.createdAt, locale) : '—'}
              </p>

              <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-2">
                <button type="button" className={btnSmGhost} onClick={() => setReplacing(asset)}>
                  {copy.replace}
                </button>
                <button type="button" className={btnSmGhost} onClick={() => openEdit(asset)}>
                  {copy.editMeta}
                </button>
                <a href={asset.fileUrl} target="_blank" rel="noreferrer" className={btnSmGhost}>
                  {copy.viewAsset}
                </a>
                {asset.isActive && (
                  <button
                    type="button"
                    className={`${btnSmGhost} text-destructive`}
                    onClick={() => setArchiveFor(asset)}
                  >
                    {copy.archiveAsset}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        title={copy.editMeta}
        description={copy.editMetaBody}
        confirmLabel={copy.saveMeta}
        cancelLabel={common.cancel}
        loading={busy === 'edit'}
        tone="default"
        onConfirm={handleEdit}
      >
        <div className="space-y-3">
          <Field label={copy.assetNameLabel}>
            <input className={ui.input} value={editName} onChange={(e) => setEditName(e.target.value)} />
          </Field>
          <Field label={copy.assetTypeLabel}>
            <select
              className={ui.select}
              value={editType}
              onChange={(e) => setEditType(e.target.value as BrandAssetType)}
            >
              {BRAND_ASSET_TYPES.map((entry) => (
                <option key={entry} value={entry}>
                  {copy.assetTypes[entry]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={copy.restrictionsLabel}>
            <textarea
              className={ui.textarea}
              rows={2}
              value={editRestrictions}
              placeholder={copy.restrictionsPlaceholder}
              onChange={(e) => setEditRestrictions(e.target.value)}
            />
          </Field>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={replacing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setReplacing(null)
            setReplaceFile(null)
          }
        }}
        title={copy.replaceTitle}
        description={copy.replaceBody}
        confirmLabel={copy.replaceSubmit}
        cancelLabel={common.cancel}
        loading={busy === 'replace'}
        tone="default"
        onConfirm={handleReplace}
      >
        <Field label={copy.fileLabel} hint={copy.fileHint}>
          <input
            ref={replaceInput}
            type="file"
            accept={ACCEPT}
            className={ui.input}
            onChange={(e) => setReplaceFile(e.target.files?.[0] ?? null)}
          />
        </Field>
      </ConfirmDialog>

      <ConfirmDialog
        open={archiveFor !== null}
        onOpenChange={(open) => {
          if (!open) setArchiveFor(null)
        }}
        title={copy.archiveAsset}
        description={copy.archiveAssetBody}
        confirmLabel={copy.archiveAsset}
        cancelLabel={common.cancel}
        loading={busy === 'archive'}
        tone="danger"
        onConfirm={handleArchive}
      />
    </div>
  )
}
