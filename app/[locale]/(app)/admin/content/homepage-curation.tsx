'use client'

import { useCallback, useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  assignHomepageSlot,
  toggleSlotActive,
  createHomepageSlot,
  deleteHomepageSlot,
  reorderHomepageSlot,
  searchContentForSlot,
} from '@/lib/admin/actions'
import { useToast } from '@/components/admin/toast'
import { ConfirmDialog } from '@/components/admin/confirm-dialog'
import type { Dictionary, Locale } from '@/lib/i18n'
import { formatDate } from '@/lib/i18n'
import type { HomepageSlot, SlotSearchResult } from '@/lib/admin/queries'

type Copy = Dictionary['admin']['content']

export function HomepageCuration({
  slots,
  copy,
  locale,
}: {
  slots: HomepageSlot[]
  copy: Copy
  locale: Locale
}) {
  const { addToast } = useToast()
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)

  async function run(
    slotId: string,
    action: () => Promise<{ ok: true } | { ok: false; error: string }>,
    success: string,
  ) {
    setLoading(slotId)
    const result = await action()
    setLoading(null)
    if (result.ok) {
      addToast(success, 'success')
      router.refresh()
    } else {
      addToast(result.error, 'error')
    }
  }

  // Group slots by their key prefix for display, keeping sort order.
  const grouped = slots.reduce<Record<string, HomepageSlot[]>>((acc, slot) => {
    const prefix = slot.slotKey.split('_')[0]
    if (!acc[prefix]) acc[prefix] = []
    acc[prefix].push(slot)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <CreateSlotForm copy={copy} />
      {Object.entries(grouped).map(([prefix, groupSlots]) => (
        <div key={prefix}>
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
            {prefix}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {groupSlots.map((slot, index) => (
              <SlotCard
                key={slot.id}
                slot={slot}
                copy={copy}
                locale={locale}
                loading={loading === slot.id}
                canMoveUp={index > 0}
                canMoveDown={index < groupSlots.length - 1}
                onAssign={(id) => run(slot.id, () => assignHomepageSlot(slot.id, id), copy.slotUpdated)}
                onToggleActive={(active) =>
                  run(slot.id, () => toggleSlotActive(slot.id, active), active ? copy.slotActivated : copy.slotDeactivated)
                }
                onMove={(direction) =>
                  run(slot.id, () => reorderHomepageSlot(slot.id, direction), copy.slotUpdated)
                }
                onDelete={() =>
                  run(slot.id, () => deleteHomepageSlot(slot.id), copy.toastSlotDeleted)
                }
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function CreateSlotForm({ copy }: { copy: Copy }) {
  const { addToast } = useToast()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [slotKey, setSlotKey] = useState('')
  const [loading, setLoading] = useState(false)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border border-dashed border-border bg-muted/30 p-3 text-center text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
      >
        {copy.newSlot}
      </button>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const result = await createHomepageSlot({ slotKey: slotKey.trim() })
    setLoading(false)
    if (result.ok) {
      addToast(copy.toastSlotCreated, 'success')
      setSlotKey('')
      setOpen(false)
      router.refresh()
    } else {
      addToast(result.error, 'error')
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-end"
    >
      <label className="flex-1 space-y-1">
        <span className="block text-xs font-medium text-muted-foreground">{copy.slotKey}</span>
        <input
          type="text"
          value={slotKey}
          onChange={(e) => setSlotKey(e.target.value)}
          placeholder="hero_4"
          required
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <span className="block text-xs text-muted-foreground/80">{copy.slotKeyHint}</span>
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? copy.searching : copy.createSlot}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="inline-flex items-center justify-center rounded-md border px-4 py-2 text-xs font-medium transition-colors hover:bg-accent"
        >
          {copy.cancel}
        </button>
      </div>
    </form>
  )
}

function SlotCard({
  slot,
  copy,
  locale,
  loading,
  canMoveUp,
  canMoveDown,
  onAssign,
  onToggleActive,
  onMove,
  onDelete,
}: {
  slot: HomepageSlot
  copy: Copy
  locale: Locale
  loading: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onAssign: (contentItemId: string | null) => void
  onToggleActive: (active: boolean) => void
  onMove: (direction: 'up' | 'down') => void
  onDelete: () => void
}) {
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SlotSearchResult[]>([])
  const [busy, setBusy] = useState(false)
  const [noResults, setNoResults] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runSearch = useCallback(async (value: string) => {
    setBusy(true)
    setNoResults(false)
    const q = value.trim()
    if (!q) {
      setResults([])
      setBusy(false)
      return
    }
    const found = await searchContentForSlot(q, 8)
    setResults(found)
    setNoResults(found.length === 0)
    setBusy(false)
  }, [])

  function handleQueryChange(value: string) {
    setQuery(value)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      void runSearch(value)
    }, 350)
  }

  return (
    <div className={`rounded-lg border bg-card p-4 ${slot.isActive ? 'border-border' : 'border-dashed opacity-70'}`}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{slot.slotKey}</div>
          <div className="text-xs text-muted-foreground">{copy.position.replace('{n}', String(slot.sortOrder))}</div>
          {slot.endsAt ? (
            <div className="text-xs text-muted-foreground">
              {copy.slotUntil.replace('{date}', formatDate(slot.endsAt, locale))}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={loading || !canMoveUp}
            onClick={() => onMove('up')}
            title={copy.moveUp}
            aria-label={copy.moveUp}
            className="inline-flex h-6 w-6 items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:bg-accent disabled:opacity-30"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </button>
          <button
            type="button"
            disabled={loading || !canMoveDown}
            onClick={() => onMove('down')}
            title={copy.moveDown}
            aria-label={copy.moveDown}
            className="inline-flex h-6 w-6 items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:bg-accent disabled:opacity-30"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => setDeleteOpen(true)}
            title={copy.deleteSlot}
            aria-label={copy.deleteSlot}
            className="inline-flex h-6 w-6 items-center justify-center rounded border border-destructive/40 text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-30"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              <path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onToggleActive(!slot.isActive)}
        disabled={loading}
        className={`mb-3 inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium transition-colors ${
          slot.isActive
            ? 'border-emerald-200 bg-emerald-100 text-emerald-800'
            : 'border-border bg-muted text-muted-foreground'
        }`}
      >
        {slot.isActive ? copy.active : copy.inactive}
      </button>

      {slot.contentItemId && slot.title ? (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-border bg-muted/30 p-2">
          {slot.coverUrl && (
            <Image src={slot.coverUrl} alt="" width={32} height={32} className="h-8 w-8 shrink-0 rounded object-cover" />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium">{slot.title}</div>
            {slot.type && <div className="text-xs text-muted-foreground">{slot.type}</div>}
            {slot.missingLocale && (
              <div className="mt-1 inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                {locale === 'fr' ? 'FR manquant — EN affiché' : 'FR missing — showing EN'}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => onAssign(null)}
            disabled={loading}
            className="text-xs text-destructive hover:underline disabled:opacity-50"
          >
            {copy.remove}
          </button>
        </div>
      ) : (
        <div className="mb-3 rounded-md border border-dashed border-border bg-muted/30 p-3 text-center">
          <p className="mb-2 text-xs text-muted-foreground">{copy.noContentAssigned}</p>
          <button
            type="button"
            onClick={() => setSearching(true)}
            disabled={loading}
            className="text-xs text-primary hover:underline disabled:opacity-50"
          >
            {copy.assignContent}
          </button>
        </div>
      )}

      {searching && (
        <div className="mt-2 space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder={copy.searchContent}
              autoFocus
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              type="button"
              onClick={() => {
                setSearching(false)
                setQuery('')
                setResults([])
              }}
              className="shrink-0 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
            >
              {copy.cancel}
            </button>
          </div>
          {busy ? (
            <p className="px-1 text-xs text-muted-foreground">{copy.searching}</p>
          ) : noResults ? (
            <p className="px-1 text-xs text-muted-foreground">{copy.noMatches}</p>
          ) : results.length > 0 ? (
            <ul className="divide-y divide-border rounded-md border border-border bg-background">
              {results.map((r) => (
                <li key={r.id} className="flex items-center gap-2 p-2">
                  {r.coverUrl && (
                    <Image src={r.coverUrl} alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">
                      {locale === 'fr' ? (r.titleFr ?? r.titleEn) : (r.titleEn ?? r.titleFr)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {r.type} · {r.status}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      onAssign(r.id)
                      setSearching(false)
                      setQuery('')
                      setResults([])
                    }}
                    className="shrink-0 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                  >
                    {copy.assign}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={copy.deleteSlotConfirmTitle}
        description={copy.deleteSlotConfirmBody}
        confirmLabel={copy.deleteSlot}
        cancelLabel={copy.cancel}
        loading={loading}
        onConfirm={() => {
          setDeleteOpen(false)
          onDelete()
        }}
      />
    </div>
  )
}
