'use client'

import { useState } from 'react'

import { revertToThemeVersion } from '@/lib/admin/actions/themes'
import { ConfirmDialog } from '@/components/admin/confirm-dialog'
import { EmptyState } from '@/components/admin/empty-state'
import { useToast } from '@/components/admin/toast'
import { ui } from '@/lib/admin/ui-constants'
import { fillCopy, formatRelative } from '@/lib/admin/format'
import { useLocaleFromPath } from '@/components/site-header'
import type { Dictionary } from '@/lib/i18n'

type Copy = Dictionary['admin']['branding']

/** The serialisable slice of a version row — tokens stay on the server. */
export type ThemeVersionView = {
  id: string
  version: string
  changeSummary: string | null
  creatorName: string | null
  createdAt: string | null
}

/**
 * Spec §9 history. Every save wrote an immutable snapshot; restoring one writes
 * it forward as another version rather than rewriting history, so a restore is
 * always reversible by restoring the version it replaced.
 */
export function ThemeVersionHistory({
  themeId,
  versions,
  currentVersion,
  copy,
  common,
}: {
  themeId: string
  versions: ThemeVersionView[]
  currentVersion: string
  copy: Copy
  common: Dictionary['admin']['common']
}) {
  const locale = useLocaleFromPath()
  const { addToast } = useToast()
  const [restoreFor, setRestoreFor] = useState<ThemeVersionView | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleRestore() {
    if (!restoreFor) return
    setBusy(true)
    try {
      const result = await revertToThemeVersion(themeId, restoreFor.id)
      if (!result.ok) {
        addToast(result.error, 'error')
        return
      }
      addToast(fillCopy(copy.toastRestored, { version: result.version }), 'success')
      setRestoreFor(null)
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Operation failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium">{copy.versionsHeading}</h2>
      <p className="text-xs text-muted-foreground">{copy.versionsHint}</p>

      {versions.length === 0 ? (
        <EmptyState message={copy.noVersions} className="p-4" />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {versions.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
              <div className="min-w-0">
                <span className="font-mono text-xs font-medium">v{row.version}</span>
                {row.version === currentVersion && (
                  <span className="ml-2 rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-emerald-800">
                    {copy.versionCurrent}
                  </span>
                )}
                {row.changeSummary && (
                  <span className="ml-2 text-xs text-muted-foreground">{row.changeSummary}</span>
                )}
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {copy.versionAuthor}: {row.creatorName ?? '—'} · {copy.versionWhen}{' '}
                  {row.createdAt ? formatRelative(row.createdAt, locale) : '—'}
                </span>
              </div>
              {row.version !== currentVersion && (
                <button
                  type="button"
                  className={`${ui.btnSm} border border-border bg-background text-muted-foreground hover:text-foreground whitespace-nowrap`}
                  onClick={() => setRestoreFor(row)}
                >
                  {copy.restore}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={restoreFor !== null}
        onOpenChange={(open) => {
          if (!open) setRestoreFor(null)
        }}
        title={`${copy.restore} v${restoreFor?.version ?? ''}`}
        description={copy.restoreBody}
        confirmLabel={copy.restore}
        cancelLabel={common.cancel}
        loading={busy}
        tone="default"
        onConfirm={handleRestore}
      />
    </section>
  )
}
