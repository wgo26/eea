'use client'

import { useState } from 'react'

import {
  archiveTheme,
  createPreviewLink,
  publishTheme,
  requestThemePublish,
} from '@/lib/admin/actions/themes'
import { getApprovalState } from '@/lib/admin/actions/approvals'
import { ConfirmDialog } from '@/components/admin/confirm-dialog'
import { useToast } from '@/components/admin/toast'
import { Field, ui } from '@/lib/admin/ui-constants'
import { fillCopy, formatRelative } from '@/lib/admin/format'
import { localePath } from '@/lib/i18n/urls'
import { useLocaleFromPath } from '@/components/site-header'
import type { ApprovalListRow } from '@/lib/admin/queries/approvals'
import type { Dictionary } from '@/lib/i18n'
import type { ThemeStatus } from '@/lib/branding'

type Copy = Dictionary['admin']['branding']

const btnSmGhost = `${ui.btnSm} border border-border bg-background text-muted-foreground hover:text-foreground`

/**
 * Publication console for one theme (spec §44 + §46). Publishing repaints the
 * public site, so it is the branding surface's two-person operation: request
 * here, a *different* administrator decides in /admin/approvals, then publish.
 * The approval is verified server-side before the change and consumed after it,
 * so a stale panel can never publish on its own.
 */
export function ThemePublishPanel({
  themeId,
  status,
  isActive,
  version,
  initialApproval,
  copy,
  common,
}: {
  themeId: string
  status: ThemeStatus
  isActive: boolean
  version: string
  initialApproval: ApprovalListRow | null
  copy: Copy
  common: Dictionary['admin']['common']
}) {
  const locale = useLocaleFromPath()
  const { addToast } = useToast()

  const [approval, setApproval] = useState<ApprovalListRow | null>(initialApproval)
  const [reason, setReason] = useState('')
  const [requestOpen, setRequestOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [busy, setBusy] = useState<'request' | 'publish' | 'archive' | 'approval' | 'share' | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const approvalReady = approval?.usable === true
  const approvalPending = approval?.effectiveStatus === 'pending'

  async function handleRequest() {
    setBusy('request')
    try {
      const result = await requestThemePublish(themeId, reason)
      if (!result.ok) {
        addToast(result.error, 'error')
        return
      }
      addToast(result.existing ? copy.requestExisting : copy.toastRequested, 'success')
      setRequestOpen(false)
      setApproval(await getApprovalState('branding.publish', 'brand_theme', themeId))
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Operation failed', 'error')
    } finally {
      setBusy(null)
    }
  }

  async function refreshApproval() {
    setBusy('approval')
    try {
      setApproval(await getApprovalState('branding.publish', 'brand_theme', themeId))
    } finally {
      setBusy(null)
    }
  }

  async function handlePublish() {
    setBusy('publish')
    try {
      const result = await publishTheme(themeId, { approvalId: approval?.id ?? null })
      if (!result.ok) {
        addToast(result.error, 'error')
        return
      }
      addToast(fillCopy(copy.toastPublished, { version: result.version }), 'success')
      setPublishOpen(false)
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Operation failed', 'error')
    } finally {
      setBusy(null)
    }
  }

  async function handleArchive() {
    setBusy('archive')
    try {
      const result = await archiveTheme(themeId)
      if (!result.ok) {
        addToast(result.error, 'error')
        return
      }
      addToast(copy.toastArchived, 'success')
      setArchiveOpen(false)
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Operation failed', 'error')
    } finally {
      setBusy(null)
    }
  }

  async function handleShare() {
    setBusy('share')
    try {
      const result = await createPreviewLink(themeId)
      if (!result.ok) {
        addToast(result.error, 'error')
        return
      }
      setShareUrl(`${window.location.origin}${localePath(locale, `/brand-preview/${result.token}`)}`)
      setCopied(false)
      addToast(copy.toastLinkCreated, 'success')
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Operation failed', 'error')
    } finally {
      setBusy(null)
    }
  }

  async function copyLink() {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
    } catch {
      addToast(copy.shareHint, 'error')
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-medium">{copy.publishHeading}</h2>
        <p className="text-xs text-muted-foreground">{copy.publishHint}</p>

        {isActive ? (
          <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
            <span className="font-medium">{copy.publishCurrent}</span>
            <span className="mt-0.5 block">{fillCopy(copy.publishLiveVersion, { version })}</span>
          </div>
        ) : approvalReady && approval ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
            <span>
              {copy.approvalReady}
              <span className="mt-0.5 block">
                {fillCopy(copy.approvedBy, { name: approval.approverName ?? copy.approvedByUnknown })}
              </span>
            </span>
            <button type="button" className={ui.btnPrimary} onClick={() => setPublishOpen(true)}>
              {copy.publish}
            </button>
          </div>
        ) : approvalPending && approval ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
            <span>
              {copy.awaitingApproval}
              <span className="mt-0.5 block text-muted-foreground">
                {fillCopy(copy.approvalExpires, { when: formatRelative(approval.expiresAt, locale) })}
              </span>
            </span>
            <button
              type="button"
              className={btnSmGhost}
              disabled={busy === 'approval'}
              onClick={refreshApproval}
            >
              {copy.refreshApproval}
            </button>
          </div>
        ) : status === 'archived' ? null : (
          <button
            type="button"
            className={ui.btnPrimary}
            disabled={busy === 'request'}
            onClick={() => setRequestOpen(true)}
          >
            {copy.requestPublish}
          </button>
        )}
      </section>

      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-medium">{copy.shareHeading}</h2>
        <p className="text-xs text-muted-foreground">{copy.shareHint}</p>
        {shareUrl ? (
          <div className="flex flex-wrap items-center gap-2">
            <input readOnly value={shareUrl} className={`${ui.input} min-w-0 flex-1 font-mono text-xs`} />
            <button type="button" className={ui.btnSecondary} onClick={copyLink}>
              {copied ? copy.copied : copy.copyLink}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={ui.btnSecondary}
            disabled={busy === 'share'}
            onClick={handleShare}
          >
            {copy.createShareLink}
          </button>
        )}

        {!isActive && status !== 'archived' && (
          <div className="border-t border-border pt-3">
            <button
              type="button"
              className={`${ui.btnSm} border border-border bg-background text-muted-foreground hover:text-foreground`}
              onClick={() => setArchiveOpen(true)}
            >
              {copy.archive}
            </button>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={requestOpen}
        onOpenChange={setRequestOpen}
        title={copy.requestTitle}
        description={copy.requestBody}
        confirmLabel={copy.requestSubmit}
        cancelLabel={common.cancel}
        loading={busy === 'request'}
        tone="default"
        onConfirm={handleRequest}
      >
        <Field label={copy.requestReasonLabel}>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={copy.requestReasonPlaceholder}
            rows={2}
            className={ui.textarea}
          />
        </Field>
      </ConfirmDialog>

      <ConfirmDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        title={copy.publish}
        description={copy.publishBody}
        confirmLabel={copy.publish}
        cancelLabel={common.cancel}
        loading={busy === 'publish'}
        tone="default"
        onConfirm={handlePublish}
      />

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={copy.archive}
        description={copy.archiveBody}
        confirmLabel={copy.archive}
        cancelLabel={common.cancel}
        loading={busy === 'archive'}
        tone="danger"
        onConfirm={handleArchive}
      />
    </div>
  )
}
