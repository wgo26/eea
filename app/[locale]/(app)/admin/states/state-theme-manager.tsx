'use client'

import { useState } from 'react'
import { clearStateTheme, setStateTheme } from '@/lib/admin/actions/themes'
import { ConfirmDialog, useAdminMutation } from '@/components/admin/confirm-dialog'
import { ui } from '@/lib/admin/ui-constants'

/**
 * State → theme bindings (spec §42). A bound published theme becomes the
 * state's base palette whenever the state lights; the state's visual profile
 * still composes on top. Only published themes are bindable — drafts shift
 * underfoot, so the server refuses them.
 */
export type StateThemeManagerLabels = {
  bound: string
  unbound: string
  selectTheme: string
  save: string
  clear: string
  clearTitle: string
  clearBody: string
  cancel: string
  savedToast: string
  clearedToast: string
}

export function StateThemeManager({
  states,
  bindings,
  themes,
  labels,
}: {
  states: { id: string; label: string }[]
  bindings: { stateId: string; themeName: string }[]
  themes: { id: string; name: string; version: string }[]
  labels: StateThemeManagerLabels
}) {
  const { run, loading } = useAdminMutation()
  const [selection, setSelection] = useState<Record<string, string>>({})
  const [pendingClear, setPendingClear] = useState<string | null>(null)

  const boundByState = new Map(bindings.map((b) => [b.stateId, b.themeName]))

  async function handleSave(stateId: string) {
    const themeId = selection[stateId]
    if (!themeId) return
    await run(() => setStateTheme(stateId, themeId), labels.savedToast)
  }

  async function handleClear() {
    if (!pendingClear) return
    const ok = await run(() => clearStateTheme(pendingClear), labels.clearedToast)
    if (ok) setPendingClear(null)
  }

  if (states.length === 0) return null

  return (
    <div className="space-y-2">
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {states.map((state) => {
          const bound = boundByState.get(state.id)
          return (
            <li key={state.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <div className="min-w-[140px] flex-1">
                <div className="text-xs font-medium">{state.label}</div>
                <div className="text-xs text-muted-foreground">
                  {bound
                    ? labels.bound.replace('{theme}', bound)
                    : labels.unbound}
                </div>
              </div>
              <select
                value={selection[state.id] ?? ''}
                onChange={(e) => setSelection((s) => ({ ...s, [state.id]: e.target.value }))}
                aria-label={labels.selectTheme}
                className={`${ui.input} w-auto`}
              >
                <option value="">{labels.selectTheme}</option>
                {themes.map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {theme.name} v{theme.version}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={`${ui.btnSm} bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50`}
                disabled={loading || !selection[state.id]}
                onClick={() => handleSave(state.id)}
              >
                {labels.save}
              </button>
              {bound && (
                <button
                  type="button"
                  className={`${ui.btnSm} border border-border bg-background text-muted-foreground hover:text-destructive`}
                  disabled={loading}
                  onClick={() => setPendingClear(state.id)}
                >
                  {labels.clear}
                </button>
              )}
            </li>
          )
        })}
      </ul>

      <ConfirmDialog
        open={pendingClear !== null}
        onOpenChange={(open) => {
          if (!open) setPendingClear(null)
        }}
        title={labels.clearTitle}
        description={labels.clearBody}
        confirmLabel={labels.clear}
        cancelLabel={labels.cancel}
        loading={loading}
        tone="danger"
        onConfirm={handleClear}
      />
    </div>
  )
}
