'use client'

import { useState } from 'react'
import { approveCreative, deleteAdCampaign, rejectCreative, updateAdCampaign, updateCampaignStatus } from '@/lib/admin/actions'
import { ConfirmDialog, useAdminMutation } from '@/components/admin/confirm-dialog'
import { MediaUploader, type UploadedPhoto } from '@/components/admin/media-uploader'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ui } from '@/lib/admin/ui-constants'
import type { Dictionary } from '@/lib/i18n'
import type { AdCampaignRow } from '@/lib/admin/queries'

type Copy = Dictionary['admin']['ads']

const IMAGE_ACCEPTS = 'image/jpeg,image/png,image/webp,image/gif'
const VIDEO_ACCEPTS = 'video/mp4,video/quicktime,video/webm'
const AUDIO_ACCEPTS = 'audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/webm'

function acceptsFor(format: string): string {
  if (format === 'video') return VIDEO_ACCEPTS
  if (format === 'audio') return AUDIO_ACCEPTS
  return IMAGE_ACCEPTS
}

function singleUrl(photos: UploadedPhoto[]): string {
  const first = photos[0]
  if (!first) return ''
  return first.assetId ?? first.url ?? ''
}

export function CampaignActions({ campaign, copy }: { campaign: AdCampaignRow; copy: Copy }) {
  const { run, loading } = useAdminMutation()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')

  // Edit form state — reset to campaign values each time the dialog opens
  const [name, setName] = useState(campaign.name)
  const [destinationUrl, setDestinationUrl] = useState(campaign.destinationUrl ?? '')
  const [copyText, setCopyText] = useState(campaign.copyText ?? '')
  const [creativeType, setCreativeType] = useState(campaign.creativeType ?? 'sponsored')
  const [desktop, setDesktop] = useState<UploadedPhoto[]>([])
  const [mobile, setMobile] = useState<UploadedPhoto[]>([])
  const [poster, setPoster] = useState<UploadedPhoto[]>([])
  const [html, setHtml] = useState(campaign.creativeHtml ?? '')
  const [width, setWidth] = useState(campaign.creativeWidth != null ? String(campaign.creativeWidth) : '')
  const [height, setHeight] = useState(campaign.creativeHeight != null ? String(campaign.creativeHeight) : '')

  function openEdit() {
    setName(campaign.name)
    setDestinationUrl(campaign.destinationUrl ?? '')
    setCopyText(campaign.copyText ?? '')
    setCreativeType(campaign.creativeType ?? 'sponsored')
    setDesktop(campaign.imageUrl ? [{ url: campaign.imageUrl }] : [])
    setMobile(campaign.mobileImageUrl ? [{ url: campaign.mobileImageUrl }] : [])
    setPoster(campaign.posterUrl ? [{ url: campaign.posterUrl }] : [])
    setHtml(campaign.creativeHtml ?? '')
    setWidth(campaign.creativeWidth != null ? String(campaign.creativeWidth) : '')
    setHeight(campaign.creativeHeight != null ? String(campaign.creativeHeight) : '')
    setEditOpen(true)
  }

  async function handleEdit() {
    const desktopRef = singleUrl(desktop)
    const mobileRef = singleUrl(mobile)
    const posterRef = singleUrl(poster)
    const ok = await run(
      () =>
        updateAdCampaign(campaign.id, {
          name: name.trim(),
          destinationUrl: destinationUrl.trim() || null,
          copyText: copyText.trim() || null,
          creativeType,
          // Unchanged prefill (URL without a fresh upload) resolves to the
          // existing media row server-side; cleared fields send null.
          creativeMediaId: desktopRef || null,
          mobileCreativeMediaId: mobileRef || null,
          posterMediaId: posterRef || null,
          creativeHtml: creativeType === 'html' ? html : null,
          creativeWidth: width.trim() ? Number(width) : null,
          creativeHeight: height.trim() ? Number(height) : null,
        }),
      copy.saved,
    )
    if (ok) setEditOpen(false)
  }

  async function handleToggle() {
    const next = campaign.status === 'active' ? 'paused' : 'active'
    await run(() => updateCampaignStatus(campaign.id, next), copy.saved)
  }

  async function handleApproveCreative() {
    await run(() => approveCreative(campaign.id), copy.creativeApproved)
  }

  async function handleRejectCreative() {
    if (!reason.trim()) return
    const ok = await run(() => rejectCreative(campaign.id, reason.trim()), copy.creativeRejected)
    if (ok) {
      setRejectOpen(false)
      setReason('')
    }
  }

  const isBusy = loading

  async function handleDelete() {
    const ok = await run(() => deleteAdCampaign(campaign.id), copy.deleted)
    if (ok) setDeleteOpen(false)
  }

  const needsReview = campaign.creativeType !== 'sponsored' && campaign.creativeStatus === 'pending'

  return (
    <>
      <div className="flex justify-end gap-2">
        {needsReview ? (
          <>
            <button
              type="button"
              onClick={handleApproveCreative}
              disabled={isBusy}
              className="rounded-md border border-emerald-500/40 px-2 py-1 text-xs text-emerald-600 disabled:opacity-50 hover:bg-emerald-500/10 transition-colors"
            >
              {copy.approveCreative}
            </button>
            <button
              type="button"
              onClick={() => setRejectOpen(true)}
              disabled={isBusy}
              className="rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive disabled:opacity-50 hover:bg-destructive/10 transition-colors"
            >
              {copy.rejectCreative}
            </button>
          </>
        ) : null}
        <button
          type="button"
          onClick={handleToggle}
          disabled={isBusy}
          className="rounded-md border border-border px-2 py-1 text-xs disabled:opacity-50 hover:bg-accent transition-colors"
        >
          {campaign.status === 'active' ? copy.pause : copy.activate}
        </button>
        <button
          type="button"
          onClick={openEdit}
          disabled={isBusy}
          className="rounded-md border border-border px-2 py-1 text-xs disabled:opacity-50 hover:bg-accent transition-colors"
        >
          {copy.edit}
        </button>
        <button
          type="button"
          disabled={isBusy || campaign.status === 'active'}
          onClick={() => setDeleteOpen(true)}
          className="rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive disabled:opacity-50"
        >
          {copy.delete}
        </button>
      </div>

      {/* Edit dialog — text, scheduling copy, and the full creative */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{copy.edit}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">{copy.campaignName}</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={ui.input}
                placeholder={copy.campaignName}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">{copy.destinationUrl}</span>
                <input
                  type="url"
                  value={destinationUrl}
                  onChange={(e) => setDestinationUrl(e.target.value)}
                  className={ui.input}
                  placeholder="https://…"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">{copy.creativeFormat}</span>
                <select value={creativeType} onChange={(e) => setCreativeType(e.target.value)} className={ui.input}>
                  <option value="sponsored">{copy.formatSponsored}</option>
                  <option value="image">{copy.formatImage}</option>
                  <option value="video">{copy.formatVideo}</option>
                  <option value="audio">{copy.formatAudio}</option>
                  <option value="html">{copy.formatHtml}</option>
                </select>
              </label>
            </div>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">{copy.copyText}</span>
              <textarea value={copyText} onChange={(e) => setCopyText(e.target.value)} rows={2} className={ui.input} />
            </label>

            {creativeType === 'image' || creativeType === 'video' || creativeType === 'audio' ? (
              <div className="grid gap-3 rounded-md border border-border bg-background p-3">
                <p className="text-xs font-medium text-muted-foreground">{copy.creativeAssets}</p>
                <MediaUploader
                  newPhotos={desktop}
                  onChange={({ newPhotos: np }) => setDesktop(np.slice(0, 1))}
                  destination="public_photo"
                  showAltCaption={false}
                  acceptedTypes={acceptsFor(creativeType)}
                  maxSizeBytes={creativeType === 'video' ? 50 * 1024 * 1024 : creativeType === 'audio' ? 25 * 1024 * 1024 : 15 * 1024 * 1024}
                  copy={{ label: copy.creativeDesktop, hint: copy.creativeDesktopHint }}
                />
                {creativeType !== 'audio' ? (
                  <MediaUploader
                    newPhotos={mobile}
                    onChange={({ newPhotos: np }) => setMobile(np.slice(0, 1))}
                    destination="public_photo"
                    showAltCaption={false}
                    acceptedTypes={acceptsFor(creativeType)}
                    maxSizeBytes={creativeType === 'video' ? 50 * 1024 * 1024 : 15 * 1024 * 1024}
                    copy={{ label: copy.creativeMobile, hint: copy.creativeMobileHint }}
                  />
                ) : null}
                {creativeType === 'video' ? (
                  <MediaUploader
                    newPhotos={poster}
                    onChange={({ newPhotos: np }) => setPoster(np.slice(0, 1))}
                    destination="public_photo"
                    showAltCaption={false}
                    acceptedTypes={IMAGE_ACCEPTS}
                    maxSizeBytes={15 * 1024 * 1024}
                    copy={{ label: copy.creativePoster, hint: copy.creativePosterHint }}
                  />
                ) : null}
                <p className="text-[11px] text-muted-foreground">{copy.creativeReviewNote}</p>
              </div>
            ) : null}

            {creativeType === 'html' ? (
              <div className="grid gap-3 rounded-md border border-border bg-background p-3">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">{copy.creativeHtmlLabel}</span>
                  <textarea value={html} onChange={(e) => setHtml(e.target.value)} rows={5} className={`${ui.input} font-mono`} placeholder="<div>…" />
                </label>
                <p className="text-[11px] text-muted-foreground">{copy.creativeHtmlHint}</p>
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">{copy.creativeWidth}</span>
                    <input type="number" min="1" max="2000" value={width} onChange={(e) => setWidth(e.target.value)} className={ui.input} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">{copy.creativeHeight}</span>
                    <input type="number" min="1" max="1200" value={height} onChange={(e) => setHeight(e.target.value)} className={ui.input} />
                  </label>
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <button type="button" onClick={() => setEditOpen(false)} className={ui.btnSecondary} disabled={loading}>
              {copy.cancel}
            </button>
            <button type="button" onClick={handleEdit} className={ui.btnPrimary} disabled={loading || !name.trim()}>
              {loading ? '…' : copy.saved}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Creative reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{copy.rejectCreative}</DialogTitle>
          </DialogHeader>
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{copy.rejectionReason}</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={ui.input} />
          </label>
          <DialogFooter>
            <button type="button" onClick={() => setRejectOpen(false)} className={ui.btnSecondary} disabled={loading}>
              {copy.cancel}
            </button>
            <button type="button" onClick={handleRejectCreative} className={ui.btnPrimary} disabled={loading || !reason.trim()}>
              {loading ? '…' : copy.reject}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm — replaces window.confirm */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={copy.delete}
        description={copy.deleteCampaignConfirm}
        confirmLabel={copy.delete}
        cancelLabel={copy.cancel}
        onConfirm={handleDelete}
        loading={loading}
        tone="danger"
      />
    </>
  )
}
