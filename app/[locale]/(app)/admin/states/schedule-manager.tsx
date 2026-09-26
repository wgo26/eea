'use client'

import { useState } from 'react'
import { ConfirmDialog, useAdminMutation } from '@/components/admin/confirm-dialog'
import { Field, ui } from '@/lib/admin/ui-constants'
import {
  createStateSchedule,
  deleteStateSchedule,
  setScheduleEnabled,
} from '@/lib/admin/actions/state-schedules'
import type { StateScheduleRow } from '@/lib/admin/queries'

/**
 * Schedule management for the state ladder (spec §28). The page table stays
 * a read surface; this console owns the writes: pause/resume and delete per
 * row, plus a compact create form for a new annual window.
 *
 * Deletion is guarded server-side while the schedule's state is still lit by
 * it — removing the schedule first would orphan a live seasonal state with
 * no owner to clear it.
 */
export type ScheduleManagerLabels = {
  state: string
  name: string
  namePlaceholder: string
  start: string
  end: string
  month: string
  day: string
  add: string
  addedToast: string
  updatedToast: string
  deletedToast: string
  enable: string
  disable: string
  delete: string
  deleteTitle: string
  deleteBody: string
  cancel: string
}

export function ScheduleManager({
  schedules,
  schedulable,
  labels,
}: {
  schedules: StateScheduleRow[]
  /** Registered states whose activation routes include `scheduled`. */
  schedulable: { id: string; label: string }[]
  labels: ScheduleManagerLabels
}) {
  const { run, loading } = useAdminMutation()
  const [stateId, setStateId] = useState(schedulable[0]?.id ?? '')
  const [name, setName] = useState('')
  const [startMonth, setStartMonth] = useState('9')
  const [startDay, setStartDay] = useState('1')
  const [endMonth, setEndMonth] = useState('9')
  const [endDay, setEndDay] = useState('30')
  const [pendingDelete, setPendingDelete] = useState<StateScheduleRow | null>(null)

  const num = (value: string, fallback: number) => {
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? parsed : fallback
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const ok = await run(
      () =>
        createStateSchedule({
          stateId,
          label: name,
          startMonth: num(startMonth, 0),
          startDay: num(startDay, 0),
          endMonth: num(endMonth, 0),
          endDay: num(endDay, 0),
        }),
      labels.addedToast,
    )
    if (ok) setName('')
  }

  async function handleToggle(row: StateScheduleRow) {
    await run(() => setScheduleEnabled(row.id, !row.enabled), labels.updatedToast)
  }

  async function handleDelete() {
    if (!pendingDelete) return
    const ok = await run(() => deleteStateSchedule(pendingDelete.id), labels.deletedToast)
    if (ok) setPendingDelete(null)
  }

  const inputCls = `${ui.input} w-20`
  const btnGhost = `${ui.btnSm} border border-border bg-background text-muted-foreground hover:text-foreground`

  return (
    <div className="space-y-3">
      <ul className="flex flex-wrap gap-2">
        {schedules.map((row) => (
          <li
            key={row.id}
            className="flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-3 pr-1 text-xs"
          >
            <span className="font-medium">{row.label}</span>
            <span className="text-muted-foreground">
              {row.startMonth}/{row.startDay}–{row.endMonth}/{row.endDay}
            </span>
            <button
              type="button"
              className={btnGhost}
              disabled={loading}
              onClick={() => handleToggle(row)}
            >
              {row.enabled ? labels.disable : labels.enable}
            </button>
            <button
              type="button"
              className={`${btnGhost} hover:text-destructive`}
              disabled={loading}
              onClick={() => setPendingDelete(row)}
            >
              {labels.delete}
            </button>
          </li>
        ))}
      </ul>

      {schedulable.length > 0 && (
        <form
          onSubmit={handleAdd}
          className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-3"
        >
          <Field label={labels.state}>
            <select
              value={stateId}
              onChange={(e) => setStateId(e.target.value)}
              className={ui.input}
              required
            >
              {schedulable.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={labels.name}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={labels.namePlaceholder}
              maxLength={120}
              className={ui.input}
              required
            />
          </Field>
          <Field label={labels.start}>
            <div className="flex gap-1">
              <input
                value={startMonth}
                onChange={(e) => setStartMonth(e.target.value)}
                placeholder={labels.month}
                inputMode="numeric"
                aria-label={labels.month}
                className={inputCls}
                required
              />
              <input
                value={startDay}
                onChange={(e) => setStartDay(e.target.value)}
                placeholder={labels.day}
                inputMode="numeric"
                aria-label={labels.day}
                className={inputCls}
                required
              />
            </div>
          </Field>
          <Field label={labels.end}>
            <div className="flex gap-1">
              <input
                value={endMonth}
                onChange={(e) => setEndMonth(e.target.value)}
                placeholder={labels.month}
                inputMode="numeric"
                aria-label={labels.month}
                className={inputCls}
                required
              />
              <input
                value={endDay}
                onChange={(e) => setEndDay(e.target.value)}
                placeholder={labels.day}
                inputMode="numeric"
                aria-label={labels.day}
                className={inputCls}
                required
              />
            </div>
          </Field>
          <button type="submit" className={ui.btnPrimary} disabled={loading}>
            {labels.add}
          </button>
        </form>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        title={labels.deleteTitle}
        description={labels.deleteBody}
        confirmLabel={labels.delete}
        cancelLabel={labels.cancel}
        loading={loading}
        tone="danger"
        onConfirm={handleDelete}
      />
    </div>
  )
}
