'use client'

import { useState } from 'react'
import { updateContentStatus, setContentFeatured, archiveContent } from '@/lib/admin/actions'
import { ConfirmDialog, useAdminMutation } from '@/components/admin/confirm-dialog'
import { ActionMenu, ActionMenuTrigger } from '@/components/admin/action-menu'
import type { ActionMenuEntry } from '@/components/admin/action-menu'
import type { Dictionary } from '@/lib/i18n'
import type { ContentRow } from '@/lib/admin/queries'

type Copy = Dictionary['admin']['content']
type CommonCopy = Dictionary['admin']['common']

export function ContentActions({ content, copy, common }: { content: ContentRow; copy: Copy; common: CommonCopy }) {
  const { run, loading } = useAdminMutation()
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
    await run(() => updateContentStatus(content.id, status), toast)
  }

  async function handleToggleFeatured() {
    await run(
      () => setContentFeatured(content.id, !content.isFeatured),
      content.isFeatured ? copy.toastFeaturedOff : copy.toastFeaturedOn,
    )
  }

  async function handleArchive() {
    const ok = await run(() => archiveContent(content.id), copy.toastArchived)
    if (ok) setConfirmArchive(false)
  }

  const menuItems: ActionMenuEntry[] = transitions.map((t) => ({
    label: t.label,
    onSelect: () => handleStatusChange(t.key, t.toast),
    disabled: loading,
  }))

  if (transitions.length > 0) {
    menuItems.push({ separator: true })
    menuItems.push({
      label: copy.archive,
      onSelect: () => setConfirmArchive(true),
      tone: 'danger',
      disabled: loading,
    })
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

      {menuItems.length > 0 && (
        <ActionMenu
          trigger={<ActionMenuTrigger label={copy.actions} />}
          items={menuItems}
        />
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
