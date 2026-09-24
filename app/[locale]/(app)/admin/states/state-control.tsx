'use client'

import { useState } from 'react'
import { ConfirmDialog, useAdminMutation } from '@/components/admin/confirm-dialog'
import { Field, ui } from '@/lib/admin/ui-constants'
import { fillCopy } from '@/lib/admin/format'
import { activateState, deactivateState } from '@/lib/admin/actions/states'
import { cn } from '@/lib/utils'

/**
 * Manual entry/exit for one ladder state (plan Phase 4.2, spec §27/§28).
 *
 * The reason field is not decoration: `system_state_events.reason` is how a
 * later reader — including the responder of an incident that started hours
 * after this change — knows why the platform was in a context. Operational
 * states never reach this component (the incident console owns them), so the
 * only shapes here are "light it" and "clear it".
 */
export type StateControlLabels = {
  activate: string
  deactivate: string
  activateTitle: string
  activateDescription: string
  deactivateTitle: string
  deactivateDescription: string
  reason: string
  reasonHint: string
  reasonPlaceholder: string
  cancel: string
  activatedToast: string
  deactivatedToast: string
}

export function StateControl({
  stateId,
  stateLabel,
  active,
  labels,
}: {
  stateId: string
  stateLabel: string
  active: boolean
  labels: StateControlLabels
}) {
  const { run, loading } = useAdminMutation()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')

  const copy = (template: string) => fillCopy(template, { state: stateLabel })

  const confirm = async () => {
    const ok = await run(
      () => (active ? deactivateState(stateId, reason) : activateState(stateId, reason)),
      copy(active ? labels.deactivatedToast : labels.activatedToast),
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
        disabled={loading}
        onClick={() => setOpen(true)}
        className={cn(
          ui.btnSm,
          'whitespace-nowrap',
          active
            ? 'border border-border text-foreground hover:bg-accent'
            : 'bg-primary text-primary-foreground hover:bg-primary/90',
          loading && 'opacity-50',
        )}
      >
        {active ? labels.deactivate : labels.activate}
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        tone={active ? 'danger' : 'default'}
        title={copy(active ? labels.deactivateTitle : labels.activateTitle)}
        description={copy(active ? labels.deactivateDescription : labels.activateDescription)}
        confirmLabel={active ? labels.deactivate : labels.activate}
        cancelLabel={labels.cancel}
        loading={loading}
        onConfirm={confirm}
      >
        <Field label={labels.reason} hint={labels.reasonHint}>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={labels.reasonPlaceholder}
            maxLength={200}
            className={ui.input}
          />
        </Field>
      </ConfirmDialog>
    </>
  )
}
