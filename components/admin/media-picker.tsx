'use client'

import { useEffect, useState, useCallback } from 'react'
import { useDebouncedValue } from '@/hooks/use-debounce'

type MediaAsset = {
  id: string
  public_url: string
  mime_type: string
  file_size_bytes: number
  kind: string
  width: number | null
  height: number | null
  provider: string
}

/**
 * Browsable media library picker. Opens in a Dialog, shows a paginated
 * grid of media_assets from the database, supports search and filtering
 * by kind (image/video/document). The caller gets the selected asset's
 * URL back via onPick.
 *
 * Server action for fetching: searchMediaAssets(q, kind, page) — wired
 * via a fetch to /api/admin/media-search.
 */
export function MediaPicker({
  open,
  onOpenChange,
  onPick,
  copy,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (url: string, assetId: string) => void
  copy: {
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
}) {
  const [q, setQ] = useState('')
  const debouncedQ = useDebouncedValue(q, 350)
  const [kind, setKind] = useState<'all' | 'image' | 'video'>('all')
  const [assets, setAssets] = useState<MediaAsset[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 24

  const fetchAssets = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        q: debouncedQ,
        kind,
        page: String(page),
        pageSize: String(pageSize),
      })
      const res = await fetch(`/api/admin/media-search?${params}`)
      const data = await res.json()
      setAssets(data.assets ?? [])
      setTotal(data.total ?? 0)
    } catch {
      setAssets([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [debouncedQ, kind, page])

  useEffect(() => {
    if (!open) return
    // Defer past the effect body so loading state flips in a callback, not
    // synchronously inside the effect (react-hooks/set-state-in-effect).
    const timer = setTimeout(() => { void fetchAssets() }, 0)
    return () => clearTimeout(timer)
  }, [open, fetchAssets])

  if (!open) return null

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex h-[80vh] w-full max-w-3xl flex-col rounded-lg border border-border bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold text-foreground">{copy.title}</h2>
          <button
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search + filters */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          <input
            type="search"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1) }}
            placeholder={copy.searchPlaceholder}
            className="h-8 flex-1 rounded-md border border-border bg-background px-3 text-sm"
          />
          <select
            value={kind}
            onChange={(e) => { setKind(e.target.value as 'all' | 'image' | 'video'); setPage(1) }}
            className="h-8 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="all">{copy.all}</option>
            <option value="image">{copy.images}</option>
          </select>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="aspect-square animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : assets.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{copy.noResults}</p>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
              {assets.map((asset) => (
                <button
                  key={asset.id}
                  onClick={() => {
                    onPick(asset.public_url, asset.id)
                    onOpenChange(false)
                  }}
                  className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted/20 hover:ring-2 hover:ring-primary"
                >
                  {asset.kind === 'image' ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={asset.public_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <span className="text-xs text-muted-foreground">{asset.kind}</span>
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/30 group-hover:opacity-100">
                    <span className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground">
                      {copy.select}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {total > pageSize && (
          <div className="flex items-center justify-between border-t border-border px-4 py-2">
            <span className="text-xs text-muted-foreground">
              {copy.loading === 'Loading…' ? `${Math.min(page * pageSize, total)} / ${total}` : ''}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-md border border-border px-3 py-1 text-xs disabled:opacity-40"
              >
                ←
              </button>
              <span className="px-2 py-1 text-xs text-muted-foreground">{page} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-md border border-border px-3 py-1 text-xs disabled:opacity-40"
              >
                →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
