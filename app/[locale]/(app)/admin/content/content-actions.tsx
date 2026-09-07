'use client'

import { useState } from 'react'
import { updateContentStatus, setContentFeatured, archiveContent } from '@/lib/admin/actions'
import { ConfirmDialog, useAdminMutation } from '@/components/admin/confirm-dialog'
import type { Dictionary } from '@/lib/i18n'
import type { ContentRow } from '@/lib/admin/queries'

type Copy = Dictionary['admin']['content']
type CommonCopy = Dictionary['admin']['common']

export function ContentActions({ content, copy, common }: { content: ContentRow; copy: Copy; common: CommonCopy }) {
  const { run, loading } = useAdminMutation()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)

  /** Status transitions, labels localized via the dictionary. */
  const transitions: { key: string; label: string; toast: string }[] = (
    content.status === 'draft' ? [
      { key: 'published', label: copy.publish, toast: copy.toastPublished },
      { key: 'scheduled', label: copy.schedule, toast: copy.toastScheduled },
    ] : content.status === 'scheduled' ? [
      { key: 'published', label: copy.publishNow, toast: copy.toastPublished },
      { key: 'draft', label: copy.unschedule, toast: copy.toastUnscheduled },
    ] : content.status === 'published' ? [
      { key: 'draft', label: copy.unpublish, toast: copy.toastUnpublished },
    ] : []
  )

  async function handleStatusChange(status: string, toast: string) {
    const ok = await run(() => updateContentStatus(content.id, status), toast)
    if (ok) setDropdownOpen(false)
  }

  async function handleToggleFeatured() {
    await run(
      () => setContentFeatured(content.id, !content.isFeatured),
      content.isFeatured ? copy.toastFeaturedOff : copy.toastFeaturedOn,
    )
  }

  async function handleArchive() {
    const ok = await run(() => archiveContent(content.id), copy.toastArchived)
    if (ok) {
      setConfirmArchive(false)
      setDropdownOpen(false)
    }
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={handleToggleFeatured}
        disabled={loading}
        className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
          content.isFeatured
            ? 'bg-amber-100 border-amber-200 text-amber-800'
            : 'border-border text-muted-foreground hover:text-foreground'
        }`}
        title={content.isFeatured ? copy.featuredTitle : copy.featureTitle}
      >
        {content.isFeatured ? copy.featured : copy.feature}
      </button>

      {transitions.length > 0 && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            disabled={loading}
            className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {loading ? common.working : copy.actions}
          </button>
          {dropdownOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
              <div className="absolute right-0 z-50 mt-1 w-40 rounded-md border border-border bg-card shadow-lg py-1">
                {transitions.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => handleStatusChange(t.key, t.toast)}
                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted transition-colors"
                  >
                    {t.label}
                  </button>
                ))}
                <div className="border-t border-border my-1" />
                <button
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false)
                    setConfirmArchive(true)
                  }}
                  className="w-full px-3 py-1.5 text-left text-sm text-destructive hover:bg-muted transition-colors"
                >
                  {copy.archive}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title={copy.archiveConfirmTitle}
        description={copy.archiveConfirmBody}
        confirmLabel={copy.archive}
        cancelLabel={common.cancel}
        loading={loading}
        onConfirm={handleArchive}
      />
    </div>
  )
}
