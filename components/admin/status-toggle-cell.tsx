'use client'

import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { updateContentStatus } from '@/lib/admin/actions/content'
import { useAdminMutation } from '@/components/admin/confirm-dialog'
import { StatusBadge } from '@/components/admin/status-badge'
import { localizeStatus } from '@/lib/admin/labels'
import type { Dictionary } from '@/lib/i18n'
import type { ContentRow } from '@/lib/admin/queries'

type Copy = Dictionary['admin']['content']

type StatusToggleCellProps = {
  row: ContentRow
  copy: Copy
  common: Dictionary['admin']['common']
}

/**
 * The single Status cell of the content table: badge + quick publish toggle.
 * Published ↔ draft flips in place; non-toggleable states (archived,
 * scheduled, pending) show the badge alone — deeper transitions live in the
 * row's action menu.
 */
export function StatusToggleCell({ row, copy, common }: StatusToggleCellProps) {
  const router = useRouter()
  const { run, loading } = useAdminMutation()

  const isTogglable = row.status === 'published' || row.status === 'draft'
  const isPublished = row.status === 'published'
  const nextStatus = isPublished ? 'draft' : 'published'
  const actionLabel = isPublished ? copy.unpublish : copy.publish

  async function handleToggle() {
    const ok = await run(
      () => updateContentStatus(row.id, nextStatus),
      isPublished ? copy.toastUnpublished : copy.toastPublished,
    )
    if (ok) router.refresh()
  }

  return (
    <div className="inline-flex items-center gap-1.5">
      <StatusBadge status={row.status} label={localizeStatus(row.status, common)} />
      {isTogglable ? (
        <button
          type="button"
          onClick={handleToggle}
          disabled={loading}
          aria-label={actionLabel}
          className="rounded p-1 text-muted-foreground opacity-70 transition-opacity hover:bg-accent hover:text-foreground hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
          title={actionLabel}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : isPublished ? (
            <EyeOff className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Eye className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
      ) : null}
    </div>
  )
}
