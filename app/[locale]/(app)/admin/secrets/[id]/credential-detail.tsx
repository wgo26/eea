'use client'

import { useState } from 'react'
import {
  disableCredential,
  enableCredential,
  markRotationStep,
  requestCredentialRevocation,
  revealCredentialSecret,
  revokeCredential,
  rotateCredential,
  testCredential,
  updateCredential,
} from '@/lib/admin/actions/credentials'
import { getApprovalState } from '@/lib/admin/actions/approvals'
import { SecretReveal } from '@/components/admin/secret-reveal'
import { ConfirmDialog, useAdminMutation } from '@/components/admin/confirm-dialog'
import { useToast } from '@/components/admin/toast'
import { Field, ui } from '@/lib/admin/ui-constants'
import { formatDateTime, formatRelative } from '@/lib/admin/format'
import { useLocaleFromPath } from '@/components/site-header'
import type { ApprovalListRow } from '@/lib/admin/queries/approvals'
import type {
  CredentialCategory,
  CredentialStatus,
  RotationCycle,
  RotationStep,
  RotationStepState,
} from '@/lib/security/credential-manager'
import type { Dictionary } from '@/lib/i18n'

type Copy = Dictionary['admin']['secrets']

export type DetailCredential = {
  id: string
  name: string
  provider: string
  category: CredentialCategory | null
  status: CredentialStatus
  version: number
  createdAt: string
  updatedAt: string
  expiresAt: string | null
  notes: string | null
  rotationPolicy: { intervalDays: number | null }
}

const STEP_TONE: Record<RotationStepState['status'], string> = {
  done: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  failed: 'border-destructive/40 bg-destructive/10 text-destructive',
  current: 'border-primary bg-primary/10 text-primary',
  pending: 'border-border bg-muted text-muted-foreground',
}

const btnSmGhost = `${ui.btnSm} border border-border bg-background text-muted-foreground hover:text-foreground`

/**
 * Detail console for one credential (spec §12–§16). It holds no secret value:
 * the only plaintext it ever sees arrives in the response to its own rotate
 * or step-up reveal calls and is rendered once by `SecretReveal`. Emergency
 * revocation is the §44 two-person flow — request here, a second admin
 * decides in /admin/approvals, then revoke — and every mutation is
 * re-checked server-side, so the capability flags below only hide controls;
 * they never widen access.
 */
export function CredentialDetail({
  credential,
  rotation,
  approval: initialApproval,
  caps,
  mask,
  categories,
  copy,
  common,
}: {
  credential: DetailCredential
  rotation: RotationCycle
  approval: ApprovalListRow | null
  caps: { manage: boolean; rotate: boolean; revoke: boolean; reveal: boolean }
  mask: string
  categories: readonly CredentialCategory[]
  copy: Copy
  common: Dictionary['admin']['common']
}) {
  const locale = useLocaleFromPath()
  const { addToast } = useToast()
  const { run, loading } = useAdminMutation()

  const [name, setName] = useState(credential.name)
  const [provider, setProvider] = useState(credential.provider)
  const [category, setCategory] = useState<CredentialCategory | ''>(credential.category ?? '')
  const [expiresAt, setExpiresAt] = useState(credential.expiresAt ? credential.expiresAt.slice(0, 10) : '')
  const [rotationDays, setRotationDays] = useState(
    credential.rotationPolicy.intervalDays ? String(credential.rotationPolicy.intervalDays) : '',
  )
  const [notes, setNotes] = useState(credential.notes ?? '')

  const [rotateOpen, setRotateOpen] = useState(false)
  const [rotateMode, setRotateMode] = useState<'generate' | 'paste'>('generate')
  const [rotateSecret, setRotateSecret] = useState('')
  const [rotateReason, setRotateReason] = useState('')
  const [rotating, setRotating] = useState(false)
  const [revealed, setRevealed] = useState<{
    secret: string
    version: number
    generated: boolean
  } | null>(null)

  const [approval, setApproval] = useState<ApprovalListRow | null>(initialApproval)
  const [revokeReason, setRevokeReason] = useState('')
  const [requestOpen, setRequestOpen] = useState(false)
  const [revokeOpen, setRevokeOpen] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [revealOpen, setRevealOpen] = useState(false)
  const [revealing, setRevealing] = useState(false)

  const revoked = credential.status === 'revoked'
  const approvalReady = approval?.usable === true
  const approvalPending = approval?.effectiveStatus === 'pending'

  async function saveDetails(e: React.FormEvent) {
    e.preventDefault()
    await run(
      () =>
        updateCredential(credential.id, {
          name,
          provider,
          category: category || null,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
          rotationPolicy: {
            intervalDays: rotationDays ? Number.parseInt(rotationDays, 10) || null : null,
          },
          notes,
        }),
      copy.toastSaved,
    )
  }

  async function handleRotate() {
    const provided = rotateMode === 'paste' ? rotateSecret.trim() : ''
    if (rotateMode === 'paste' && !provided) {
      addToast(copy.secretRequired, 'error')
      return
    }
    setRotating(true)
    try {
      const result = await rotateCredential(credential.id, {
        newSecret: provided || undefined,
        reason: rotateReason,
      })
      if (!result.ok) {
        addToast(result.error, 'error')
        return
      }
      addToast(copy.toastRotated, 'success')
      setRotateOpen(false)
      setRotateSecret('')
      setRotateReason('')
      setRevealed({ secret: result.secret, version: result.version, generated: result.generated })
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Operation failed', 'error')
    } finally {
      setRotating(false)
    }
  }

  async function handleReveal() {
    setRevealing(true)
    try {
      const result = await revealCredentialSecret(credential.id)
      if (!result.ok) {
        addToast(result.error, 'error')
        return
      }
      setRevealOpen(false)
      setRevealed({ secret: result.secret, version: result.version, generated: result.generated })
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Operation failed', 'error')
    } finally {
      setRevealing(false)
    }
  }

  async function handleRequest() {
    setRequesting(true)
    try {
      const result = await requestCredentialRevocation(credential.id, revokeReason)
      if (!result.ok) {
        addToast(result.error, 'error')
        return
      }
      addToast(copy.toastRequested, 'success')
      setRequestOpen(false)
      setApproval(await getApprovalState('secret.revoke', 'api_credential', credential.id))
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Operation failed', 'error')
    } finally {
      setRequesting(false)
    }
  }

  async function refreshApproval() {
    setRefreshing(true)
    try {
      setApproval(await getApprovalState('secret.revoke', 'api_credential', credential.id))
    } finally {
      setRefreshing(false)
    }
  }

  async function handleRevoke() {
    const ok = await run(
      () =>
        revokeCredential(credential.id, {
          approvalId: approval?.id ?? null,
          reason: revokeReason,
        }),
      copy.toastRevoked,
    )
    if (ok) {
      setRevokeOpen(false)
      setRevokeReason('')
    }
  }

  const stepCopy: Record<RotationStep, string> = {
    generate: copy.rotationStepGenerate,
    validate: copy.rotationStepValidate,
    deploy: copy.rotationStepDeploy,
    verify: copy.rotationStepVerify,
    retire_old: copy.rotationStepRetire,
  }

  const stepStatusCopy: Record<RotationStepState['status'], string | null> = {
    done: copy.rotationDone,
    failed: copy.rotationFailed,
    current: copy.rotationCurrent,
    pending: null,
  }

  function stepAction(step: RotationStepState) {
    if (!caps.rotate || step.status !== 'current' || revoked) return null
    if (step.step === 'validate') {
      return (
        <button
          type="button"
          className={btnSmGhost}
          disabled={loading}
          onClick={() => run(() => testCredential(credential.id), copy.toastValidated)}
        >
          {copy.validate}
        </button>
      )
    }
    if (step.step === 'generate') return null
    const verb =
      step.step === 'deploy' ? copy.markDeploy : step.step === 'verify' ? copy.markVerify : copy.markRetire
    return (
      <button
        type="button"
        className={btnSmGhost}
        disabled={loading}
        onClick={() => run(() => markRotationStep(credential.id, step.step as 'deploy' | 'verify' | 'retire_old'), copy.toastStep)}
      >
        {verb}
      </button>
    )
  }

  return (
    <div className="space-y-5">
      {revealed && (
        <SecretReveal
          secret={revealed.secret}
          version={revealed.version}
          generated={revealed.generated}
          copy={copy}
          onDone={() => setRevealed(null)}
        />
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="space-y-3 rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-medium">{copy.secretHeading}</h2>
          <p className="text-xs text-muted-foreground">{copy.secretNote}</p>
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
            <div className="font-mono text-sm tracking-widest">{mask}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {copy.colVersion} {credential.version} · {copy.updatedAtLabel}{' '}
              {formatRelative(credential.updatedAt, locale)}
            </div>
          </div>
          {caps.rotate && !revoked && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={ui.btnSecondary}
                disabled={loading}
                onClick={() => run(() => testCredential(credential.id), copy.toastValidated)}
              >
                {copy.validate}
              </button>
              <button type="button" className={ui.btnPrimary} onClick={() => setRotateOpen(true)}>
                {copy.rotate}
              </button>
            </div>
          )}
          {caps.reveal && !revoked && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={btnSmGhost}
                disabled={loading || revealing}
                onClick={() => setRevealOpen(true)}
              >
                {copy.reveal}
              </button>
              <span className="text-xs text-muted-foreground">{copy.revealHint}</span>
            </div>
          )}
          <p className="text-xs text-muted-foreground">{copy.rotateHint}</p>
        </section>

        <section className="space-y-3 rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-medium">{copy.rotationHeading}</h2>
          <ol className="space-y-2">
            {rotation.steps.map((step) => (
              <li
                key={step.step}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 ${STEP_TONE[step.status]}`}
              >
                <div className="min-w-0">
                  <span className="text-xs font-medium">{stepCopy[step.step]}</span>
                  {step.at && (
                    <span className="ml-2 text-xs opacity-80">{formatDateTime(step.at, locale)}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {stepStatusCopy[step.status] && (
                    <span className="text-xs font-medium">{stepStatusCopy[step.status]}</span>
                  )}
                  {stepAction(step)}
                </div>
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground">
            {rotation.startedAt
              ? `${copy.rotationStarted}: ${formatDateTime(rotation.startedAt, locale)}`
              : copy.rotationStarted}
            {' — '}
            {copy.retireHint}
          </p>
        </section>
      </div>

      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-medium">{copy.detailsHeading}</h2>
        <form onSubmit={saveDetails} className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={copy.nameLabel}>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={ui.input}
                disabled={!caps.manage}
                required
              />
            </Field>
            <Field label={copy.providerLabel} hint={copy.providerHint}>
              <input
                type="text"
                value={provider}
                onChange={(e) => setProvider(e.target.value.toLowerCase())}
                className={ui.input}
                disabled={!caps.manage}
              />
            </Field>
            <Field label={copy.categoryLabel}>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as CredentialCategory | '')}
                className={ui.select}
                disabled={!caps.manage}
              >
                <option value="">{copy.categoryNone}</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {copy.categories[c]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={copy.rotationIntervalLabel} hint={copy.rotationHint}>
              <input
                type="number"
                min={1}
                value={rotationDays}
                onChange={(e) => setRotationDays(e.target.value)}
                placeholder={copy.rotationIntervalPlaceholder}
                className={ui.input}
                disabled={!caps.manage}
              />
            </Field>
            <Field label={copy.expiresLabel} hint={copy.expiresHint}>
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className={ui.input}
                disabled={!caps.manage}
              />
            </Field>
          </div>
          <Field label={copy.notesLabel}>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={copy.notesPlaceholder}
              rows={2}
              className={ui.textarea}
              disabled={!caps.manage}
            />
          </Field>
          {caps.manage && (
            <div className="flex items-center justify-between gap-3">
              {!revoked && (
                <button
                  type="button"
                  className={ui.btnGhost}
                  disabled={loading}
                  onClick={() =>
                    run(
                      () =>
                        credential.status === 'disabled'
                          ? enableCredential(credential.id)
                          : disableCredential(credential.id),
                      credential.status === 'disabled' ? copy.toastEnabled : copy.toastDisabled,
                    )
                  }
                >
                  {credential.status === 'disabled' ? copy.enable : copy.disable}
                </button>
              )}
              <button type="submit" className={ui.btnPrimary} disabled={loading}>
                {loading ? common.working : copy.saveDetails}
              </button>
            </div>
          )}
        </form>
      </section>

      {caps.revoke && !revoked && (
        <section className="space-y-3 rounded-lg border border-destructive/40 bg-card p-4">
          <h2 className="text-sm font-medium">{copy.revokeHeading}</h2>
          <p className="text-xs text-muted-foreground">{copy.revokeHint}</p>

          {approvalReady && approval ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
              <span>{copy.approvalReady}</span>
              <button type="button" className={ui.btnDanger} onClick={() => setRevokeOpen(true)}>
                {copy.revoke}
              </button>
            </div>
          ) : approvalPending && approval ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
              <span>
                {copy.approvalPending}
                <span className="block text-muted-foreground">
                  {copy.approvalExpires.replace('{when}', formatRelative(approval.expiresAt, locale))}
                </span>
              </span>
              <button type="button" className={btnSmGhost} disabled={refreshing} onClick={refreshApproval}>
                {copy.refresh}
              </button>
            </div>
          ) : (
            <button type="button" className={ui.btnDanger} onClick={() => setRequestOpen(true)}>
              {copy.requestApproval}
            </button>
          )}
        </section>
      )}

      <ConfirmDialog
        open={rotateOpen}
        onOpenChange={setRotateOpen}
        title={copy.rotateTitle}
        description={copy.rotateBody}
        confirmLabel={copy.rotate}
        cancelLabel={common.cancel}
        loading={rotating}
        tone="default"
        onConfirm={handleRotate}
      >
        <div className="space-y-3">
          <div className="flex gap-2">
            <button
              type="button"
              className={rotateMode === 'generate' ? `${ui.btnSm} border border-primary bg-primary/10 text-primary` : btnSmGhost}
              onClick={() => setRotateMode('generate')}
            >
              {copy.rotateModeGenerate}
            </button>
            <button
              type="button"
              className={rotateMode === 'paste' ? `${ui.btnSm} border border-primary bg-primary/10 text-primary` : btnSmGhost}
              onClick={() => setRotateMode('paste')}
            >
              {copy.rotateModePaste}
            </button>
          </div>
          {rotateMode === 'paste' && (
            <Field label={copy.secretLabel} hint={copy.secretHint}>
              <input
                type="text"
                value={rotateSecret}
                onChange={(e) => setRotateSecret(e.target.value)}
                placeholder={copy.secretPlaceholder}
                className={`font-mono ${ui.input}`}
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
          )}
          <Field label={copy.rotateReasonLabel}>
            <input
              type="text"
              value={rotateReason}
              onChange={(e) => setRotateReason(e.target.value)}
              placeholder={copy.rotateReasonPlaceholder}
              className={ui.input}
            />
          </Field>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={requestOpen}
        onOpenChange={setRequestOpen}
        title={copy.requestTitle}
        description={copy.requestBody}
        confirmLabel={copy.requestApproval}
        cancelLabel={common.cancel}
        loading={requesting}
        tone="default"
        onConfirm={handleRequest}
      >
        <Field label={copy.revokeReasonLabel}>
          <textarea
            value={revokeReason}
            onChange={(e) => setRevokeReason(e.target.value)}
            placeholder={copy.revokeReasonPlaceholder}
            rows={2}
            className={ui.textarea}
          />
        </Field>
      </ConfirmDialog>

      <ConfirmDialog
        open={revokeOpen}
        onOpenChange={setRevokeOpen}
        title={copy.revoke}
        description={copy.revokeBody}
        confirmLabel={copy.revoke}
        cancelLabel={common.cancel}
        loading={loading}
        tone="danger"
        onConfirm={handleRevoke}
      >
        <Field label={copy.revokeReasonLabel}>
          <textarea
            value={revokeReason}
            onChange={(e) => setRevokeReason(e.target.value)}
            placeholder={copy.revokeReasonPlaceholder}
            rows={2}
            className={ui.textarea}
          />
        </Field>
      </ConfirmDialog>

      <ConfirmDialog
        open={revealOpen}
        onOpenChange={setRevealOpen}
        title={copy.revealTitle}
        description={copy.revealCurrentBody}
        confirmLabel={copy.reveal}
        cancelLabel={common.cancel}
        loading={revealing}
        tone="danger"
        onConfirm={handleReveal}
      >
        <p className="text-xs text-muted-foreground">{copy.revealAuditNote}</p>
      </ConfirmDialog>
    </div>
  )
}
