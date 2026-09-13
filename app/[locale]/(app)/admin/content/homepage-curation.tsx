'use client'

import { useCallback, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  assignHomepageSlot,
  toggleSlotActive,
  createHomepageSlot,
  deleteHomepageSlot,
  reorderHomepageSlot,
  updateHomepageSlotWindow,
  searchContentForSlot,
} from '@/lib/admin/actions'
import { useToast } from '@/components/admin/toast'
import { ConfirmDialog } from '@/components/admin/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Dictionary, Locale } from '@/lib/i18n'
import { formatDate, localePath } from '@/lib/i18n'
import type { HomepageSlot, SlotSearchResult } from '@/lib/admin/queries'

type Copy = Dictionary['admin']['content']

/**
 * The slot keys the homepage actually renders (lib/queries/home.ts queries
 * `hero` + `secondary`): `hero` is the lead story, `secondary` rows join the
 * featured carousel. Any other key would sit in this table but never render,
 * so the create form offers exactly these two.
 */
const RENDERED_SLOT_KEYS = ['hero', 'secondary'] as const

/** Visible-window state derived from the optional starts/ends bounds. */
type WindowState = 'always' | 'scheduled' | 'live' | 'expired'

function windowStateOf(slot: HomepageSlot): WindowState {
  const now = Date.now()
  if (slot.startsAt && Date.parse(slot.startsAt) > now) return 'scheduled'
  if (slot.endsAt && Date.parse(slot.endsAt) <= now) return 'expired'
  if (slot.startsAt || slot.endsAt) return 'live'
  return 'always'
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return ''
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`
}

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
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{copy.homepageHint}</p>
        <Link
          href={localePath(locale, '/')}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
        >
          {copy.viewHomepage}
        </Link>
      </div>
      <CreateSlotForm copy={copy} />
      {Object.entries(grouped).map(([prefix, groupSlots]) => (
        <div key={prefix}>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            {prefix}
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
  const [slotKey, setSlotKey] = useState<(typeof RENDERED_SLOT_KEYS)[number]>('secondary')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
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
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      addToast(copy.windowInvalid, 'error')
      return
    }
    setLoading(true)
    const result = await createHomepageSlot({
      slotKey: slotKey.trim(),
      startsAt: startsAt ? new Date(startsAt).toISOString() : null,
      endsAt: endsAt ? new Date(endsAt).toISOString() : null,
    })
    setLoading(false)
    if (result.ok) {
      addToast(copy.toastSlotCreated, 'success')
      setSlotKey('secondary')
      setStartsAt('')
      setEndsAt('')
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
        <select
          value={slotKey}
          onChange={(e) => setSlotKey(e.target.value as (typeof RENDERED_SLOT_KEYS)[number])}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {RENDERED_SLOT_KEYS.map((key) => (
            <option key={key} value={key}>
              {key === 'hero' ? copy.slotKeyHero : copy.slotKeySecondary}
            </option>
          ))}
        </select>
        <span className="block text-xs text-muted-foreground/80">{copy.slotKeyHint}</span>
      </label>
      <label className="space-y-1">
        <span className="block text-xs font-medium text-muted-foreground">{copy.windowStarts}</span>
        <input
          type="datetime-local"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </label>
      <label className="space-y-1">
        <span className="block text-xs font-medium text-muted-foreground">{copy.windowEnds}</span>
        <input
          type="datetime-local"
          value={endsAt}
          onChange={(e) => setEndsAt(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
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
  // Display-window editor (starts/ends bounds the slot is shown within).
  const [windowOpen, setWindowOpen] = useState(false)
  const [windowStarts, setWindowStarts] = useState(() => toDatetimeLocal(slot.startsAt))
  const [windowEnds, setWindowEnds] = useState(() => toDatetimeLocal(slot.endsAt))
  const [windowLoading, setWindowLoading] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { addToast } = useToast()
  const router = useRouter()

  async function saveWindow(clear = false) {
    const starts = clear ? '' : windowStarts
    const ends = clear ? '' : windowEnds
    if (!clear && starts && ends && new Date(ends) <= new Date(starts)) {
      addToast(copy.windowInvalid, 'error')
      return
    }
    setWindowLoading(true)
    const result = await updateHomepageSlotWindow(slot.id, {
      startsAt: starts ? new Date(starts).toISOString() : null,
      endsAt: ends ? new Date(ends).toISOString() : null,
    })
    setWindowLoading(false)
    if (result.ok) {
      addToast(copy.toastWindowSaved, 'success')
      setWindowOpen(false)
      router.refresh()
    } else {
      addToast(result.error, 'error')
    }
  }

  const state = windowStateOf(slot)
  const windowChip =
    state === 'always'
      ? { label: copy.stateAlways, cls: 'border-border bg-muted text-muted-foreground' }
      : state === 'scheduled'
        ? { label: copy.stateScheduled, cls: 'border-sky-200 bg-sky-100 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200' }
        : state === 'live'
          ? { label: copy.stateLive, cls: 'border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' }
          : { label: copy.stateExpired, cls: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200' }

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
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <span
              suppressHydrationWarning
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${windowChip.cls}`}
            >
              {windowChip.label}
            </span>
            <button
              type="button"
              onClick={() => {
                setWindowStarts(toDatetimeLocal(slot.startsAt))
                setWindowEnds(toDatetimeLocal(slot.endsAt))
                setWindowOpen(true)
              }}
              disabled={loading}
              title={copy.windowEdit}
              className="text-[11px] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline disabled:opacity-50"
            >
              {copy.windowEdit}
            </button>
          </div>
          {(slot.startsAt || slot.endsAt) && (
            <div className="mt-1 text-[11px] text-muted-foreground">
              {slot.startsAt ? formatDate(slot.startsAt, locale) : '…'} → {slot.endsAt ? formatDate(slot.endsAt, locale) : '…'}
            </div>
          )}
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

      {/* Display-window editor: optional bounds, either side can stay open. */}
      <Dialog open={windowOpen} onOpenChange={setWindowOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{copy.windowEdit}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">{copy.windowHint}</p>
          <div className="grid gap-3">
            <label className="space-y-1">
              <span className="block text-xs font-medium text-muted-foreground">{copy.windowStarts}</span>
              <input
                type="datetime-local"
                value={windowStarts}
                onChange={(e) => setWindowStarts(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </label>
            <label className="space-y-1">
              <span className="block text-xs font-medium text-muted-foreground">{copy.windowEnds}</span>
              <input
                type="datetime-local"
                value={windowEnds}
                onChange={(e) => setWindowEnds(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </label>
          </div>
          <DialogFooter>
            <button type="button" onClick={() => setWindowOpen(false)} disabled={windowLoading} className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-accent disabled:opacity-50">
              {copy.cancel}
            </button>
            <button
              type="button"
              onClick={() => void saveWindow(true)}
              disabled={windowLoading || (!windowStarts && !windowEnds)}
              className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              {copy.windowClear}
            </button>
            <button
              type="button"
              onClick={() => void saveWindow(false)}
              disabled={windowLoading}
              className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {windowLoading ? '…' : copy.windowSave}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
