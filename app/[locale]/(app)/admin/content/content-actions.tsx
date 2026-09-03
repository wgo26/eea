'use client'

import { useState } from 'react'
import { updateContentStatus, setContentFeatured, archiveContent } from '@/lib/admin/actions'
import { useToast } from '@/components/admin/toast'
import type { Dictionary } from '@/lib/i18n'
import type { ContentRow } from '@/lib/admin/queries'

type Copy = Dictionary['admin']['content']

export function ContentActions({ content, copy }: { content: ContentRow; copy: Copy }) {
  const { addToast } = useToast()
  const [loading, setLoading] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)

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
    setLoading(true)
    const result = await updateContentStatus(content.id, status)
    setLoading(false)
    setDropdownOpen(false)
    if (result.ok) {
      addToast(toast, 'success')
    } else {
      addToast(result.error, 'error')
    }
  }

  async function handleToggleFeatured() {
    setLoading(true)
    const result = await setContentFeatured(content.id, !content.isFeatured)
    setLoading(false)
    if (result.ok) {
      addToast(content.isFeatured ? copy.toastFeaturedOff : copy.toastFeaturedOn, 'success')
    } else {
      addToast(result.error, 'error')
    }
  }

  async function handleArchive() {
    setLoading(true)
    const result = await archiveContent(content.id)
    setLoading(false)
    setDropdownOpen(false)
    if (result.ok) {
      addToast(copy.toastArchived, 'success')
    } else {
      addToast(result.error, 'error')
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
            {loading ? '…' : copy.actions}
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
                  onClick={handleArchive}
                  className="w-full px-3 py-1.5 text-left text-sm text-destructive hover:bg-muted transition-colors"
                >
                  {copy.archive}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
