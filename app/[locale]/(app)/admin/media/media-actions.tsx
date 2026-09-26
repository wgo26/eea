'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, ArchiveRestore } from 'lucide-react'
import { archiveMedia, restoreMedia } from '@/lib/admin/actions/media'
import { ConfirmDialog, useAdminMutation } from '@/components/admin/confirm-dialog'
import type { MediaAssetRow } from '@/lib/admin/queries'
import type { Dictionary } from '@/lib/i18n'
import { cn } from '@/lib/utils'

type Copy = Dictionary['admin']['mediaArchive']

/**
 * Rights / consent cell for one asset.
 *
 * Text plus colour, never colour alone: an uncleared photo is a legal state and
 * a screen-reader user must be able to tell "rights unset" from "confirmed".
 */
export function MediaRightsCell({ row, copy }: { row: MediaAssetRow; copy: Copy }) {
  const status = row.rightsStatus
  const consent = row.consentStatus
  const cleared = status === 'cleared' || status === 'confirmed'
  const tone = !status
    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
    : cleared
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
      : 'bg-muted text-muted-foreground'
  // `rights_status` is a free text column with a CHECK over today's values; a
  // value outside the dictionary renders raw rather than as "undefined".
  const rightsNames = copy.rights as Record<string, string>
  const label = !status ? copy.rightsUnset : (rightsNames[status] ?? status)
  const consentLabel = !consent
    ? null
    : consent === 'pending'
      ? copy.consentPending
      : consent === 'withdrawn'
        ? copy.consentWithdrawn
        : consent === 'not_required'
          ? copy.consentNotRequired
          : copy.consentConfirmed

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', tone)}>{label}</span>
      {consentLabel && (
        <span
          className={cn(
            'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
            consent === 'withdrawn'
              ? 'bg-destructive/10 text-destructive'
              : 'bg-muted text-muted-foreground',
          )}
        >
          {consentLabel}
        </span>
      )}
      {row.rightsHolder && (
        <span className="block w-full truncate text-xs text-muted-foreground">{row.rightsHolder}</span>
      )}
    </span>
  )
}

/**
 * Archive / restore one asset — the two reversible writes `media.manage` gates
 * in lib/admin/actions/media.ts.
 *
 * The confirmation is the ordinary dialog, not the destructive variant the
 * storage screen uses for delete: both directions are undoable (`archiveMedia`
 * sets `archived_at`, `restoreMedia` clears it). Capability is asserted inside
 * the action, never inferred from the button being rendered.
 */
export function MediaArchiveActions({ row, copy }: { row: MediaAssetRow; copy: Copy }) {
  const router = useRouter()
  const { run, loading } = useAdminMutation()
  const [confirming, setConfirming] = useState<'archive' | 'restore' | null>(null)
  const archived = row.archivedAt != null
  const restoring = confirming === 'restore'

  return (
    <>
      <button
        type="button"
        disabled={loading}
        onClick={() => setConfirming(archived ? 'restore' : 'archive')}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
      >
        {archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
        {archived ? copy.restore : copy.archive}
      </button>
      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null)
        }}
        title={restoring ? copy.restoreTitle : copy.archiveTitle}
        description={restoring ? copy.restoreBody : copy.archiveBody}
        confirmLabel={restoring ? copy.restoreConfirm : copy.archiveConfirm}
        cancelLabel={copy.cancel}
        loading={loading}
        onConfirm={async () => {
          const ok = await run(
            () => (restoring ? restoreMedia(row.id) : archiveMedia(row.id)),
            restoring ? copy.toastRestored : copy.toastArchived,
          )
          setConfirming(null)
          // Re-runs the page query; a toast host already exists in the shell.
          if (ok) router.refresh()
        }}
      />
    </>
  )
}

