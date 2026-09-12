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

const DAY_MS = 24 * 60 * 60 * 1000

type DurationOption = { days: number | null; labelKey: keyof Pick<Copy, 'featureDuration1d' | 'featureDuration3d' | 'featureDuration7d' | 'featureDuration14d' | 'featureDuration30d' | 'featureDurationIndefinite'> }

const DURATION_OPTIONS: DurationOption[] = [
  { days: 1, labelKey: 'featureDuration1d' },
  { days: 3, labelKey: 'featureDuration3d' },
  { days: 7, labelKey: 'featureDuration7d' },
  { days: 14, labelKey: 'featureDuration14d' },
  { days: 30, labelKey: 'featureDuration30d' },
  { days: null, labelKey: 'featureDurationIndefinite' },
]

export function ContentActions({ content, copy, common }: { content: ContentRow; copy: Copy; common: CommonCopy }) {
  const { run, loading } = useAdminMutation()
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [featureOpen, setFeatureOpen] = useState(false)
  const [unfeatureOpen, setUnfeatureOpen] = useState(false)
  const [durationDays, setDurationDays] = useState<number | null>(7)

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

  async function handleFeature() {
    const endsAt = durationDays == null ? null : new Date(Date.now() + durationDays * DAY_MS).toISOString()
    const ok = await run(() => setContentFeatured(content.id, true, endsAt), copy.toastFeaturedOn)
    if (ok) setFeatureOpen(false)
  }

  async function handleUnfeature() {
    const ok = await run(() => setContentFeatured(content.id, false), copy.toastFeaturedOff)
    if (ok) setUnfeatureOpen(false)
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
        onClick={() => (content.isFeatured ? setUnfeatureOpen(true) : setFeatureOpen(true))}
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
        open={featureOpen}
        onOpenChange={setFeatureOpen}
        title={copy.featureDialogTitle}
        description={copy.featureDialogBody}
        confirmLabel={copy.featureConfirm}
        cancelLabel={common.cancel}
        loading={loading}
        tone="default"
        onConfirm={handleFeature}
      >
        <span className="mt-3 block text-xs font-medium text-muted-foreground">{copy.featureDurationLabel}</span>
        <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label={copy.featureDurationLabel}>
          {DURATION_OPTIONS.map((opt) => (
            <button
              key={opt.labelKey}
              type="button"
              role="radio"
              aria-checked={durationDays === opt.days}
              onClick={() => setDurationDays(opt.days)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                durationDays === opt.days
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {copy[opt.labelKey]}
            </button>
          ))}
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={unfeatureOpen}
        onOpenChange={setUnfeatureOpen}
        title={copy.unfeatureTitle}
        description={copy.unfeatureBody}
        confirmLabel={copy.unfeatureConfirm}
        cancelLabel={common.cancel}
        loading={loading}
        onConfirm={handleUnfeature}
      />

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
