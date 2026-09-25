'use client'
/* eslint-disable react-hooks/set-state-in-effect -- edit dialog fetches on open by design */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { deleteContentItem, getContentItemEditData as fetchEditDataAction, getContentHistoryData } from '@/lib/admin/actions/content'
import { ConfirmDialog, useAdminMutation } from '@/components/admin/confirm-dialog'
import { useToast } from '@/components/admin/toast'
import { formatRelative } from '@/lib/admin/format'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DialogMaximizeToggle, DialogTabSwitcher } from '@/components/admin/dialog-maximize-toggle'
import { ContentForm } from './content-form'
import { contentLivePath } from './content-actions'
import { ui } from '@/lib/admin/ui-constants'
import { localePath } from '@/lib/i18n/urls'
import { useLocaleFromPath } from '@/components/site-header'
import type { Dictionary } from '@/lib/i18n'
import type { ContentRow } from '@/lib/admin/queries'

type Copy = Dictionary['admin']['content']
type CommonCopy = Dictionary['admin']['common']
type TypeFilters = Dictionary['admin']['typeFilters']
type Option = { id: string; name: string; slug?: string }

// Wrapper so the edit dialog can fetch via a client-callable server action.
async function fetchEditData(contentItemId: string) {
  return fetchEditDataAction(contentItemId)
}

type DialogShellProps = {
  copy: Copy
  common: CommonCopy
  typeFilters: TypeFilters
  locations: Option[]
  categoriesByType: Record<string, Option[]>
}

/**
 * Thin shell over the shared ContentForm: primary "New content" trigger +
 * a max-w-3xl dialog with sticky header/footer. All field state and payload
 * construction live in content-form.tsx. `autoOpen` is the ⌘K "New content"
 * deep-link (`?create=new`) — the page passes it from the search params and
 * the URL is cleaned up when the dialog closes.
 */
export function ContentCreateDialog({
  copy,
  common,
  typeFilters,
  locations,
  categoriesByType,
  autoOpen = false,
}: DialogShellProps & { autoOpen?: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(autoOpen)
  const [maximized, setMaximized] = useState(false)
  const [tab, setTab] = useState<'editor' | 'preview'>('editor')

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) setTab('editor')
    if (!next && autoOpen) {
      // Strip only `create` — the list filters in the URL survive.
      const url = new URL(window.location.href)
      url.searchParams.delete('create')
      router.replace(`${url.pathname}${url.search}`)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={ui.btnPrimary}
      >
        {copy.newContent}
      </button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          maximized={maximized}
          showCloseButton={false}
          className={maximized ? 'gap-4 overflow-y-auto p-6' : 'max-h-[90vh] overflow-y-auto sm:max-w-3xl'}
        >
          <DialogHeader className="sticky top-0 z-10 -mx-6 -mt-6 flex-row items-start justify-between gap-3 border-b border-border bg-background px-6 pb-3 pt-6">
            <div className="min-w-0">
              <DialogTitle>{copy.newContentTitle}</DialogTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {copy.newContentBody}
              </p>
            </div>
            <span className="flex shrink-0 items-center gap-2">
              <DialogTabSwitcher tab={tab} onTabChange={setTab} labels={common} />
              <DialogMaximizeToggle
                maximized={maximized}
                onToggle={() => setMaximized((v) => !v)}
                labels={common}
              />
              <DialogClose
                render={
                  <button
                    type="button"
                    aria-label={common.close}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                }
              />
            </span>
          </DialogHeader>
          {open && (
            <ContentForm
              mode="create"
              copy={copy}
              common={common}
              typeFilters={typeFilters}
              locations={locations}
              categoriesByType={categoriesByType}
              tab={tab}
              onDone={() => handleOpenChange(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * Thin shell over the shared ContentForm for editing. Kept as a button-less
 * data loader here — the table row title is the visible edit trigger (a
 * `?edit=` deep-link); `autoOpen` opens the dialog on page load from that
 * param. Failures surface as a retryable error panel + toast.
 */
export function ContentEditTrigger({
  content,
  copy,
  common,
  typeFilters,
  locations,
  categoriesByType,
  autoOpen = false,
}: DialogShellProps & {
  content: ContentRow
  /** Deep-link: pass `autoOpen` to open the dialog on page load (the content
   *  page derives it from the `edit` query param). */
  autoOpen?: boolean
}) {
  const { addToast } = useToast()
  const localeFromPath = useLocaleFromPath()
  const [open, setOpen] = useState(autoOpen)
  const [maximized, setMaximized] = useState(false)
  const [tab, setTab] = useState<'editor' | 'preview'>('editor')
  const [data, setData] = useState<Awaited<
    ReturnType<typeof fetchEditData>
  > | null>(null)
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Data fetch on dialog open — mirrors moderation review pattern.
  // Reloads on every open so switching rows (or reopening after an edit)
  // never shows a stale previous item; resets error/data for a clean slate.
  // Failures surface as a retryable error panel + toast, never the bare "—".
  const loadEditData = async (contentId: string) => {
    setFetching(true)
    setFetchError(null)
    try {
      const loaded = await fetchEditData(contentId)
      if (!loaded) {
        const message = copy.editLoadMissing ?? 'Content not found — it may have been deleted.'
        setFetchError(message)
        setData(null)
        addToast(message, 'error')
      } else {
        setData(loaded)
      }
    } catch (e) {
      const message = e instanceof Error && e.message ? e.message : (copy.editLoadError ?? 'Could not load content for editing.')
      setFetchError(message)
      setData(null)
      addToast(message, 'error')
    } finally {
      setFetching(false)
    }
  }

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setData(null)
    setFetching(true)
    setFetchError(null)
    fetchEditData(content.id)
      .then((loaded) => {
        if (cancelled) return
        if (!loaded) {
          const message = copy.editLoadMissing ?? 'Content not found — it may have been deleted.'
          setFetchError(message)
          addToast(message, 'error')
        } else {
          setData(loaded)
        }
      })
      .catch((e) => {
        if (cancelled) return
        const message = e instanceof Error && e.message ? e.message : (copy.editLoadError ?? 'Could not load content for editing.')
        setFetchError(message)
        addToast(message, 'error')
      })
      .finally(() => {
        if (!cancelled) setFetching(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, content.id]) // eslint-disable-line react-hooks/exhaustive-deps -- copy/addToast stable per locale

  const handleRetry = () => {
    void loadEditData(content.id)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setTab('editor')
      }}
    >
      <DialogContent
        maximized={maximized}
        showCloseButton={false}
        className={maximized ? 'gap-4 overflow-y-auto p-6' : 'max-h-[90vh] overflow-y-auto sm:max-w-3xl'}
      >
        <DialogHeader className="sticky top-0 z-10 -mx-6 -mt-6 flex-row items-start justify-between gap-3 border-b border-border bg-background px-6 pb-3 pt-6">
          <div className="min-w-0">
            <DialogTitle>{copy.editContent}</DialogTitle>
            {data ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {data.enTitle ?? data.title ?? content.title ?? content.slug ?? content.id.slice(0, 8)}
                {data.status ? ` · ${data.status}` : ''}
              </p>
            ) : null}
          </div>
          <span className="flex shrink-0 items-center gap-2">
            <DialogTabSwitcher tab={tab} onTabChange={setTab} labels={common} />
            {contentLivePath(content) && (
              <Link
                href={localePath(localeFromPath, contentLivePath(content)!)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {copy.viewLive}
              </Link>
            )}
            <DialogMaximizeToggle
              maximized={maximized}
              onToggle={() => setMaximized((v) => !v)}
              labels={common}
            />
            <DialogClose
              render={
                <button
                  type="button"
                  aria-label={common.close}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              }
            />
          </span>
        </DialogHeader>
        {fetching ? (
          <div className="grid gap-2" aria-live="polite">
            <div className="h-8 animate-pulse rounded-md bg-muted" />
            <div className="h-8 animate-pulse rounded-md bg-muted" />
            <div className="h-24 animate-pulse rounded-md bg-muted" />
            <p className="text-sm text-muted-foreground">{common.working}</p>
          </div>
        ) : fetchError ? (
          <div className="grid gap-3" role="alert">
            <p className="text-sm text-destructive">{fetchError}</p>
            <div className="flex gap-2">
              <button type="button" onClick={handleRetry} className={ui.btnPrimary}>
                {copy.editRetry ?? 'Retry'}
              </button>
              <button type="button" onClick={() => setOpen(false)} className={ui.btnSecondary}>
                {common.cancel}
              </button>
            </div>
          </div>
        ) : data ? (
          <ContentForm
            key={data.id}
            mode="edit"
            copy={copy}
            common={common}
            typeFilters={typeFilters}
            locations={locations}
            categoriesByType={categoriesByType}
            data={data}
            tab={tab}
            onDone={() => setOpen(false)}
          >
            <ContentHistory contentItemId={data.id} copy={copy} />
          </ContentForm>
        ) : (
          <p className="text-sm text-muted-foreground">—</p>
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * Per-item change history at the foot of the edit drawer: who did what and
 * when (status transitions, edits with changed fields, feature/archive).
 * Read-only audit — translations carry no snapshots, so there is nothing
 * to revert to; the empty state says so by omission (historyEmpty).
 */
function ContentHistory({
  contentItemId,
  copy,
}: {
  contentItemId: string
  copy: Copy
}) {
  const [entries, setEntries] = useState<
    | {
        id: string
        action: string
        actorName: string | null
        createdAt: string | null
        notes: string | null
      }[]
    | null
  >(null)

  useEffect(() => {
    let cancelled = false
    getContentHistoryData(contentItemId).then((rows) => {
      if (!cancelled) setEntries(rows)
    })
    return () => {
      cancelled = true
    }
  }, [contentItemId])

  if (entries === null) return null

  return (
    <details className="rounded-md border border-border bg-muted/30 px-3 py-2">
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
        {copy.historyTitle}
        {entries.length > 0 ? ` · ${entries.length}` : ''}
      </summary>
      {entries.length === 0 ? (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {copy.historyEmpty}
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {entries.map((e) => (
            <li key={e.id} className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground/80">
                {e.action.replace(/[:_]/g, ' ')}
              </span>
              {e.actorName ? <span> · {e.actorName}</span> : null}
              {e.createdAt ? (
                <span> · {formatRelative(e.createdAt)}</span>
              ) : null}
              {e.notes ? (
                <span className="block truncate">{e.notes}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}

/**
 * Standalone delete confirm (kept for non-table callers). Inside the content
 * table, delete lives as the danger item of the row ActionMenu instead.
 */
export function ContentDeleteButton({
  content,
  copy,
  common,
}: {
  content: ContentRow
  copy: Copy
  common: CommonCopy
}) {
  const { run, loading } = useAdminMutation()
  const [open, setOpen] = useState(false)

  async function handleDelete() {
    const ok = await run(
      () => deleteContentItem(content.id),
      copy.toastDeleted ?? 'Deleted.',
    )
    if (ok) setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={loading}
        className={ui.btnDanger}
      >
        {copy.delete}
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={copy.deleteConfirmTitle.replace(
          '{title}',
          content.title ?? content.slug ?? content.id.slice(0, 8),
        )}
        description={copy.deleteConfirmBody}
        confirmLabel={copy.delete}
        cancelLabel={common.cancel}
        loading={loading}
        requirePhrase="DELETE"
        phraseLabel={common.confirmPhrase}
        onConfirm={handleDelete}
      />
    </>
  )
}
