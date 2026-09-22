'use client'

import { useRouter } from 'next/navigation'
import { updateContentStatus } from '@/lib/admin/actions'
import { useAdminMutation } from '@/components/admin/confirm-dialog'
import { StatusBadge } from '@/components/admin/status-badge'
import { localizeStatus } from '@/lib/admin/labels'
import type { Dictionary } from '@/lib/i18n'
import type { ContentRow } from '@/lib/admin/queries'

type Copy = Dictionary['admin']['content']

type StatusToggleCellProps = {
  row: ContentRow
  copy: Copy
  typeLabels: Dictionary['admin']['common']
}

/**
 * Inline status toggle rendered inside the status column of ContentTable.
 * Shows the current status via StatusBadge with a toggle button that flips
 * between published ↔ draft. For non-toggleable states (archived, scheduled,
 * pending) the badge is shown without a toggle.
 */
export function StatusToggleCell({ row, copy, typeLabels }: StatusToggleCellProps) {
  const router = useRouter()
  const { run, loading } = useAdminMutation()

  const isTogglable = row.status === 'published' || row.status === 'draft'
  const isPublished = row.status === 'published'
  const nextStatus = isPublished ? 'draft' : 'published'

  async function handleToggle() {
    const ok = await run(
      () => updateContentStatus(row.id, nextStatus),
      isPublished ? copy.toastUnpublished : copy.toastPublished,
    )
    if (ok) router.refresh()
  }

  return (
    <div className="inline-flex items-center gap-1.5">
      <StatusBadge status={row.status} label={localizeStatus(row.status, typeLabels)} />
      {isTogglable ? (
        <button
          type="button"
          onClick={handleToggle}
          disabled={loading}
          aria-label={isPublished ? copy.unpublish : copy.publish}
          title={isPublished ? copy.unpublish : copy.publish}
          className="rounded p-0.5 text-xs font-bold text-muted-foreground opacity-60 transition-opacity hover:opacity-100 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? '…' : isPublished ? '●' : '○'}
        </button>
      ) : null}
    </div>
  )
}
