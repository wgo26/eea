'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateContentStatus, setContentFeatured, archiveContent, unarchiveContent } from '@/lib/admin/actions'
import { ConfirmDialog, useAdminMutation } from '@/components/admin/confirm-dialog'
import { useToast } from '@/components/admin/toast'
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
  const { addToast } = useToast()
  const router = useRouter()
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [confirmUnpublish, setConfirmUnpublish] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [scheduleFor, setScheduleFor] = useState('')
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

  async function handleUnpublish() {
    const ok = await run(() => updateContentStatus(content.id, 'draft'), copy.toastUnpublished, {
      duration: 8000,
      action: {
        label: common.undo,
        onSelect: () => {
          void (async () => {
            const republished = await updateContentStatus(content.id, 'published')
            addToast(republished.ok ? copy.toastPublished : republished.error, republished.ok ? 'success' : 'error')
            if (republished.ok) router.refresh()
          })()
        },
      },
    })
    if (ok) setConfirmUnpublish(false)
  }

  async function handleFeature() {
    if (content.status !== 'published') {
      addToast(copy.featureNeedsPublished, 'error')
      return
    }
    const endsAt = durationDays == null ? null : new Date(Date.now() + durationDays * DAY_MS).toISOString()
    const ok = await run(() => setContentFeatured(content.id, true, endsAt), copy.toastFeaturedOn)
    if (ok) {
      setFeatureOpen(false)
      router.refresh()
    }
  }

  async function handleUnfeature() {
    const ok = await run(() => setContentFeatured(content.id, false), copy.toastFeaturedOff)
    if (ok) {
      setUnfeatureOpen(false)
      router.refresh()
    }
  }

  async function handleArchive() {
    const ok = await run(() => archiveContent(content.id), copy.toastArchived, {
      duration: 8000,
      action: {
        label: common.undo,
        onSelect: () => {
          void (async () => {
            const restored = await unarchiveContent(content.id)
            addToast(restored.ok ? copy.toastRestored : restored.error, restored.ok ? 'success' : 'error')
            if (restored.ok) router.refresh()
          })()
        },
      },
    })
    if (ok) {
      setConfirmArchive(false)
      router.refresh()
    }
  }

  async function handleSchedule() {
    if (!scheduleFor) return
    const iso = new Date(scheduleFor).toISOString()
    if (Number.isNaN(Date.parse(scheduleFor)) || Date.parse(scheduleFor) <= Date.now()) return
    const ok = await run(() => updateContentStatus(content.id, 'scheduled', iso), copy.toastScheduled)
    if (ok) {
      setScheduleOpen(false)
      setScheduleFor('')
      router.refresh()
    }
  }

  const menuItems: ActionMenuEntry[] = transitions.map((t) => (
    t.key === 'draft' && content.status === 'published'
      ? {
        label: t.label,
        onSelect: () => setConfirmUnpublish(true),
        disabled: loading,
      }
      : t.key === 'scheduled' && content.status === 'draft'
        ? {
          label: t.label,
          onSelect: () => {
            setScheduleFor('')
            setScheduleOpen(true)
          },
          disabled: loading,
        }
        : {
          label: t.label,
          onSelect: () => handleStatusChange(t.key, t.toast),
          disabled: loading,
        }
  ))

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
    <div className="flex items-center justify-end gap-1.5 flex-nowrap whitespace-nowrap">
      {content.status !== 'published' && !content.isFeatured ? (
        <span
          className="inline-flex shrink-0 items-center rounded-md border border-dashed border-border px-2.5 py-1 text-xs font-medium text-muted-foreground"
          title={copy.featureNeedsPublished}
        >
          {copy.feature}
        </span>
      ) : (
      <button
        type="button"
        onClick={() => (content.isFeatured ? setUnfeatureOpen(true) : setFeatureOpen(true))}
        disabled={loading}
        className={`inline-flex shrink-0 items-center rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
          content.isFeatured
            ? 'bg-amber-100 border-amber-200 text-amber-800'
            : 'border-border text-muted-foreground hover:text-foreground'
        }`}
        title={content.isFeatured ? copy.featuredTitle : copy.featureTitle}
      >
        {content.isFeatured ? copy.featured : copy.feature}
      </button>
      )}

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
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        title={copy.scheduleTitle}
        description={copy.scheduleBody}
        confirmLabel={copy.scheduleConfirm}
        cancelLabel={common.cancel}
        loading={loading}
        onConfirm={handleSchedule}
      >
        <label className="mt-3 block space-y-1.5">
          <span className="block text-xs font-medium text-muted-foreground">{copy.scheduledFor}</span>
          <input
            type="datetime-local"
            value={scheduleFor}
            onChange={(e) => setScheduleFor(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </label>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmUnpublish}
        onOpenChange={setConfirmUnpublish}
        title={copy.unpublishConfirmTitle}
        description={copy.unpublishConfirmBody}
        confirmLabel={copy.unpublish}
        cancelLabel={common.cancel}
        loading={loading}
        onConfirm={handleUnpublish}
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
