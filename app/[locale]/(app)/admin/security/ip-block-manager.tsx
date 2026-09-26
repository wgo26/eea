'use client'

import { useState } from 'react'
import { blockIp, unblockIp } from '@/lib/admin/actions/ip-blocks'
import { ConfirmDialog, useAdminMutation } from '@/components/admin/confirm-dialog'
import { Field, ui } from '@/lib/admin/ui-constants'
import type { Dictionary } from '@/lib/i18n'

type Copy = Dictionary['admin']['security']
type BlockedIp = { ip: string; reason: string | null; blockedAt: string | null; expiresAt: string | null }

/**
 * Network enforcement console (the app has no edge firewall, so hostile
 * addresses from the heatmap are refused here instead). Blocking is silent
 * by design: sign-in answers with a generic error and intake reads as
 * throttled, while the trail records `security.ip_blocked` with the actor.
 */
export function BlockIpButton({ ip, copy }: { ip: string; copy: Copy }) {
  const { run, loading } = useAdminMutation()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [days, setDays] = useState('30')

  async function confirm() {
    const parsed = Number.parseInt(days, 10)
    const ok = await run(
      () => blockIp(ip, { reason, expiresInDays: Number.isFinite(parsed) ? parsed : null }),
      copy.toastBlocked,
    )
    if (ok) {
      setOpen(false)
      setReason('')
    }
  }

  return (
    <>
      <button
        type="button"
        className={`${ui.btnSm} border border-border bg-background text-muted-foreground hover:text-destructive`}
        disabled={loading}
        onClick={() => setOpen(true)}
      >
        {copy.blockIp}
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={copy.blockTitle}
        description={copy.blockBody.replace('{ip}', ip)}
        confirmLabel={copy.blockIp}
        cancelLabel={copy.cancel}
        loading={loading}
        tone="danger"
        onConfirm={confirm}
      >
        <div className="space-y-3">
          <Field label={copy.blockReasonLabel}>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={copy.blockReasonPlaceholder}
              maxLength={200}
              className={ui.input}
            />
          </Field>
          <Field label={copy.blockExpiryLabel} hint={copy.blockExpiryHint}>
            <input
              value={days}
              onChange={(e) => setDays(e.target.value)}
              placeholder={copy.blockExpiryPlaceholder}
              inputMode="numeric"
              className={ui.input}
            />
          </Field>
        </div>
      </ConfirmDialog>
    </>
  )
}

export function IpBlockManager({
  blocked,
  copy,
}: {
  blocked: BlockedIp[]
  copy: Copy
}) {
  const { run, loading } = useAdminMutation()
  const [ip, setIp] = useState('')

  async function handleUnblock(target: string) {
    await run(() => unblockIp(target), copy.toastUnblocked)
  }

  async function handleBlock(e: React.FormEvent) {
    e.preventDefault()
    const ok = await run(() => blockIp(ip, {}), copy.toastBlocked)
    if (ok) setIp('')
  }

  return (
    <div className="space-y-3">
      <form onSubmit={handleBlock} className="flex flex-wrap items-end gap-2">
        <Field label={copy.blockIpLabel}>
          <input
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            placeholder={copy.blockIpPlaceholder}
            className={`font-mono ${ui.input}`}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <button type="submit" className={ui.btnSecondary} disabled={loading}>
          {copy.blockIp}
        </button>
      </form>
      {blocked.length === 0 ? (
        <p className="text-xs text-muted-foreground">{copy.noBlocks}</p>
      ) : (
        <ul className="divide-y divide-border">
          {blocked.map((row) => (
            <li key={row.ip} className="flex items-center justify-between gap-3 py-1.5">
              <div className="min-w-0">
                <span className="truncate font-mono text-xs">{row.ip}</span>
                {row.reason && (
                  <span className="ml-2 truncate text-xs text-muted-foreground">{row.reason}</span>
                )}
              </div>
              <button
                type="button"
                className={`${ui.btnSm} border border-border bg-background text-muted-foreground hover:text-foreground`}
                disabled={loading}
                onClick={() => handleUnblock(row.ip)}
              >
                {copy.unblockIp}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
