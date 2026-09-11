'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/admin/toast'
import { MediaPicker } from '@/components/admin/media-picker'

export type MediaPickerCopy = {
  title: string
  search: string
  searchPlaceholder: string
  noResults: string
  loading: string
  cancel: string
  select: string
  images: string
  all: string
  reuse: string
}

export type UploadedPhoto = {
  url: string
  kind?: string
  mimeType?: string
  durationSeconds?: number | null
  alt?: string
  caption?: string
  credit?: string
  assetId?: string
}

type UploadResult = {
  assetId?: string
  publicUrl: string | null
  kind: string
  mimeType: string
  fileSizeBytes: number
  width?: number | null
  height?: number | null
  durationSeconds?: number | null
}

export type ExistingPhoto = {
  id: string
  url: string
  alt?: string | null
  caption?: string | null
  credit?: string | null
  isCover?: boolean
}

type MediaUploaderProps = {
  /** Existing photos to show (edit mode) */
  existingPhotos?: ExistingPhoto[]
  /** IDs of existing photos the user keeps (updated via onChange) */
  keepIds?: string[]
  /** New photos added via upload or URL paste */
  newPhotos?: UploadedPhoto[]
  onChange: (data: { keepIds: string[]; newPhotos: UploadedPhoto[] }) => void
  /** Content item ID for upload association (optional for new items) */
  contentItemId?: string
  /** Destination bucket: 'public_photo' for citizen content, 'admin_asset' for staff */
  destination?: 'public_photo' | 'admin_asset'
  /** Max file size in bytes (default 12MB) */
  maxSizeBytes?: number
  /** Accepted MIME types for the file picker */
  acceptedTypes?: string
  /** Show the URL paste fallback (default true) */
  allowUrlPaste?: boolean
  /** Show per-photo alt/caption fields (default true) */
  showAltCaption?: boolean
  /** When provided, shows the "reuse existing" media-library picker */
  pickerCopy?: MediaPickerCopy
  /** Label for the upload area */
  label?: string
  /** Hint text */
  hint?: string
  /** Copy strings */
  copy?: {
    label?: string
    hint?: string
    drop?: string
    browse?: string
    browseFiles?: string
    dropHere?: string
    or?: string
    pasteUrl?: string
    urlPlaceholder?: string
    addUrl?: string
    existing?: string
    altLabel?: string
    captionLabel?: string
    creditLabel?: string
    cover?: string
    removeCover?: string
    setCover?: string
    dragReorder?: string
    uploading?: string
    uploadError?: string
    tooLarge?: string
    wrongType?: string
    empty?: string
  }
}

/**
 * Browser metadata probe for video/audio duration. Creates an object URL
 * and reads `duration` once metadata loads — no upload involved. Resolves
 * null for images, unplayable files, or any probe failure (non-fatal: the
 * upload proceeds without duration_seconds).
 */
function probeDuration(file: File): Promise<number | null> {
  if (!file.type.startsWith('video/') && !file.type.startsWith('audio/')) {
    return Promise.resolve(null)
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const el = document.createElement(file.type.startsWith('video/') ? 'video' : 'audio')
    el.preload = 'metadata'
    const done = (value: number | null) => {
      URL.revokeObjectURL(url)
      resolve(value)
    }
    const timer = setTimeout(() => done(null), 8000)
    el.onloadedmetadata = () => {
      clearTimeout(timer)
      const d = el.duration
      done(Number.isFinite(d) && d > 0 ? Math.round(d * 10) / 10 : null)
    }
    el.onerror = () => {
      clearTimeout(timer)
      done(null)
    }
    el.src = url
  })
}

const DEFAULT_COPY: Required<NonNullable<MediaUploaderProps['copy']>> = {  label: 'Photos',
  hint: 'Upload images or paste image URLs. The first photo is the cover.',
  drop: 'Drop images here',
  browse: 'Browse files',
  browseFiles: 'Browse files',
  dropHere: 'Drop images here',
  or: 'or',
  pasteUrl: 'Paste URL',
  urlPlaceholder: 'https://…',
  addUrl: 'Add',
  existing: 'Existing photos',
  altLabel: 'Alt text',
  captionLabel: 'Caption',
  creditLabel: 'Credit',
  cover: 'Cover',
  removeCover: 'Remove cover',
  setCover: 'Set as cover',
  dragReorder: 'Drag to reorder',
  uploading: 'Uploading…',
  uploadError: 'Upload failed',
  tooLarge: 'File too large (max 12 MB)',
  wrongType: 'Unsupported file type',
  empty: 'No photos yet. Upload or paste URLs above.',
}

export function MediaUploader({
  existingPhotos = [],
  keepIds = [],
  newPhotos = [],
  onChange,
  contentItemId,
  destination = 'admin_asset',
  maxSizeBytes = 12 * 1024 * 1024,
  acceptedTypes = 'image/jpeg,image/png,image/webp,image/gif',
  allowUrlPaste = true,
  showAltCaption = true,
  pickerCopy,
  label,
  hint,
  copy,
}: MediaUploaderProps) {
  const c = useMemo(() => ({ ...DEFAULT_COPY, ...copy }), [copy])
  const { addToast } = useToast()
  const [uploading, setUploading] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [urlError, setUrlError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const dragItem = useRef<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  const allPhotos: (ExistingPhoto | UploadedPhoto)[] = [
    ...existingPhotos.filter((p) => keepIds.includes(p.id)),
    ...newPhotos,
  ]

  const updateKeepIds = useCallback((ids: string[]) => {
    onChange({ keepIds: ids, newPhotos })
  }, [newPhotos, onChange])

  const updateNewPhotos = useCallback((photos: UploadedPhoto[]) => {
    onChange({ keepIds, newPhotos: photos })
  }, [keepIds, onChange])

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const acceptList = acceptedTypes.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
    const matchesAccept = (type: string) => {
      if (acceptList.length === 0) return true
      return acceptList.some((a) => {
        if (a.endsWith('/*')) return type.toLowerCase().startsWith(a.slice(0, -1))
        return type.toLowerCase() === a
      })
    }
    const fileArr = Array.from(files).filter((f) => matchesAccept(f.type || ''))
    if (fileArr.length === 0) {
      addToast(c.wrongType, 'error')
      return
    }

    for (const file of fileArr) {
      if (file.size > maxSizeBytes) {
        addToast(c.tooLarge, 'error')
        return
      }
    }

    setUploading(true)
    const uploaded: UploadedPhoto[] = []

    for (const file of fileArr) {
      try {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('destination', destination)
        if (contentItemId) formData.append('contentItemId', contentItemId)
        // Advisory duration for video/audio (browser metadata probe — the
        // server has no transcoder, so this fills duration_seconds for
        // moderation triage). Probe failure is non-fatal.
        const duration = await probeDuration(file)
        if (duration != null) formData.append('durationSeconds', String(duration))

        const res = await fetch('/api/uploads', { method: 'POST', body: formData })
        const data: UploadResult & { error?: string } = await res.json()

        if (!res.ok) {
          addToast(data.error || c.uploadError, 'error')
          continue
        }

        uploaded.push({
          url: data.publicUrl ?? '',
          kind: data.kind,
          mimeType: data.mimeType,
          durationSeconds: data.durationSeconds ?? null,
          assetId: data.assetId,
        })
      } catch {
        addToast(c.uploadError, 'error')
      }
    }

    if (uploaded.length > 0) {
      updateNewPhotos([...newPhotos, ...uploaded])
      addToast(`${uploaded.length} photo${uploaded.length > 1 ? 's' : ''} uploaded.`, 'success')
    }
    setUploading(false)
  }, [addToast, c, maxSizeBytes, destination, contentItemId, newPhotos, updateNewPhotos, acceptedTypes])

  const handleUrlAdd = useCallback(() => {
    const url = urlInput.trim()
    if (!url) return
    if (!/^https?:\/\/.+/i.test(url)) {
      setUrlError('Enter a full https:// URL')
      return
    }
    setUrlError(null)
    updateNewPhotos([...newPhotos, { url }])
    setUrlInput('')
  }, [urlInput, newPhotos, updateNewPhotos])

  const removeExisting = (id: string) => updateKeepIds(keepIds.filter((k) => k !== id))
  const removeNew = (idx: number) => updateNewPhotos(newPhotos.filter((_, i) => i !== idx))

  const updateNewPhoto = (idx: number, patch: Partial<UploadedPhoto>) => {
    updateNewPhotos(newPhotos.map((p, i) => (i === idx ? { ...p, ...patch } : p)))
  }

  // Reorder via drag
  const reorderNew = (from: number, to: number) => {
    const arr = [...newPhotos]
    const [moved] = arr.splice(from, 1)
    arr.splice(to, 0, moved)
    updateNewPhotos(arr)
  }

  // Move existing to cover (put first in keepIds order)
  const setCoverExisting = (id: string) => {
    const reordered = [id, ...keepIds.filter((k) => k !== id)]
    updateKeepIds(reordered)
  }
  const setCoverNew = (idx: number) => {
    const arr = [...newPhotos]
    const [moved] = arr.splice(idx, 1)
    arr.unshift(moved)
    updateNewPhotos(arr)
  }

  return (
    <div className="space-y-3">
      {(label || c.label) && (
        <label className="text-sm font-medium text-foreground">{label ?? c.label}</label>
      )}
      {(hint || c.hint) && (
        <p className="text-xs text-muted-foreground">{hint ?? c.hint}</p>
      )}

      {/* Upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          handleFiles(e.dataTransfer.files)
        }}
        onClick={() => fileInput.current?.click()}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 cursor-pointer transition-colors',
          dragOver
            ? 'border-primary bg-primary/5'
            : 'border-border bg-muted/30 hover:bg-muted/50',
        )}
      >
        <svg className="h-8 w-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V4.5m0 0L7 9.5m5-5l5 5M3 18v1.5A1.5 1.5 0 0 0 4.5 21h15a1.5 1.5 0 0 0 1.5-1.5V18" />
        </svg>
        <p className="text-sm text-muted-foreground">
          {uploading ? c.uploading : (
            <>
              <span className="font-medium text-foreground">{c.browseFiles}</span>
              <span className="ml-1">{(c.dropHere ?? c.drop).toLowerCase()}</span>
            </>
          )}
        </p>
        <input
          ref={fileInput}
          type="file"
          accept={acceptedTypes}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {/* URL paste fallback */}
      {allowUrlPaste && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{c.or}</span>
          <input
            type="url"
            value={urlInput}
            onChange={(e) => { setUrlInput(e.target.value); setUrlError(null) }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleUrlAdd() } }}
            placeholder={c.urlPlaceholder}
            className={cn(
              'h-8 flex-1 rounded-md border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring',
              urlError && 'border-destructive',
            )}
          />
          <button
            type="button"
            onClick={handleUrlAdd}
            className="h-8 inline-flex items-center rounded-md border border-border bg-background px-3 text-xs font-medium text-muted-foreground hover:bg-accent"
          >
            {c.addUrl}
          </button>
          {urlError && <p className="text-xs text-destructive">{urlError}</p>}
        </div>
      )}

      {/* Reuse existing media — browsable library picker (G5) */}
      {pickerCopy && (
        <>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="inline-flex w-fit items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"
          >
            {pickerCopy.reuse}
          </button>
          <MediaPicker
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            copy={pickerCopy}
            onPick={(url, assetId) => updateNewPhotos([...newPhotos, { url, assetId }])}
          />
        </>
      )}

      {/* Thumbnail strip */}
      {allPhotos.length > 0 ? (
        <div className="space-y-2">
          {existingPhotos.length > 0 && keepIds.length > 0 && (
            <p className="text-xs font-medium text-muted-foreground">{c.existing}</p>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {allPhotos.map((photo, idx) => {
              const url = 'url' in photo ? photo.url : (photo as ExistingPhoto).url
              const isExisting = 'id' in photo
              const cover = idx === 0
              return (
                <div
                  key={isExisting ? (photo as ExistingPhoto).id : `new-${idx}`}
                  draggable
                  onDragStart={() => { dragItem.current = idx }}
                  onDragEnter={() => setDragOverIdx(idx)}
                  onDragEnd={() => {
                    if (dragItem.current !== null && dragItem.current !== idx) {
                      if (isExisting) {
                        // Reordering existing photos
                      } else {
                        const newIdx = idx - keepIds.length
                        if (newIdx >= 0) reorderNew(dragItem.current - keepIds.length, newIdx)
                      }
                    }
                    dragItem.current = null
                    setDragOverIdx(null)
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  className={cn(
                    'group relative overflow-hidden rounded-lg border border-border bg-muted/20',
                    dragOverIdx === idx && 'ring-2 ring-primary',
                    cover && 'ring-2 ring-primary/40',
                  )}
                >
                  {url.match(/\.(mp4|mov|webm|m4v)(\?|#|$)/i) || (photo as UploadedPhoto).kind === 'video' ? (
                    <video src={url} preload="metadata" muted playsInline className="h-28 w-full object-cover" />
                  ) : url.match(/\.(mp3|m4a|wav|ogg|oga|opus|weba)(\?|#|$)/i) || (photo as UploadedPhoto).kind === 'audio' ? (
                    <span className="flex h-28 w-full items-center justify-center bg-muted text-xs font-medium text-muted-foreground">Audio</span>
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={url}
                      alt={(photo as { alt?: string }).alt ?? ''}
                      className="h-28 w-full object-cover"
                    />
                  )}
                  <div className="absolute inset-0 flex flex-col justify-between bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100">
                    <div className="flex justify-end p-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (isExisting) removeExisting((photo as ExistingPhoto).id)
                          else removeNew(idx - keepIds.length)
                        }}
                        className="rounded-md bg-black/60 p-1 text-white hover:bg-black/80"
                        aria-label="Remove photo"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <div className="flex items-center gap-1 p-1.5">
                      {cover ? (
                        <span className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                          {c.cover}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (isExisting) setCoverExisting((photo as ExistingPhoto).id)
                            else setCoverNew(idx - keepIds.length)
                          }}
                          className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-black/80"
                        >
                          {c.setCover}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Alt/caption fields for new photos */}
          {showAltCaption && newPhotos.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                {c.altLabel} &amp; {c.captionLabel}
              </summary>
              <div className="mt-2 space-y-3">
                {newPhotos.map((photo, idx) => (
                  <div key={`meta-${idx}`} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.url} alt="" className="h-12 w-12 rounded object-cover" />
                    <input
                      type="text"
                      value={photo.alt ?? ''}
                      onChange={(e) => updateNewPhoto(idx, { alt: e.target.value })}
                      placeholder={c.altLabel}
                      className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                    />
                    <input
                      type="text"
                      value={photo.caption ?? ''}
                      onChange={(e) => updateNewPhoto(idx, { caption: e.target.value })}
                      placeholder={c.captionLabel}
                      className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                    />
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">{c.empty}</p>
      )}
    </div>
  )
}
