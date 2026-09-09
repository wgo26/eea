'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/admin/toast'

type MutationResult = { ok: true } | { ok: false; error: string }

type BulkAction = {
  label: string
  /** Server action that receives the selected keys and returns MutationResult */
  action: (keys: string[]) => Promise<MutationResult>
  successToast: string
  tone?: 'default' | 'danger'
  confirmTitle?: string
  confirmBody?: string
  confirmLabel?: string
  cancelLabel?: string
}

/**
 * Sticky bulk-action bar shown when rows are selected in a DataTable.
 * Renders above the table, shows the selection count, and lets the user
 * run a server action against all selected keys at once.
 *
 * Uses ConfirmDialog internally for destructive actions.
 */
export function BulkActionsBar({
  selectedCount,
  actions,
  onClear,
  onDone,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  clearLabel = 'Clear',
  selectedLabel = 'selected',
}: {
  selectedCount: number
  actions: BulkAction[]
  onClear: () => void
  onDone: () => void
  confirmLabel?: string
  cancelLabel?: string
  clearLabel?: string
  selectedLabel?: string
}) {
  const { addToast } = useToast()
  const [loading, setLoading] = useState(false)
  const [pendingAction, setPendingAction] = useState<BulkAction | null>(null)

  if (selectedCount === 0) return null

  const runAction = async (action: BulkAction, keys: string[]) => {
    setLoading(true)
    try {
      const result = await action.action(keys)
      if (result.ok) {
        addToast(action.successToast, 'success')
        onDone()
      } else {
        addToast(result.error, 'error')
      }
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Bulk action failed', 'error')
    } finally {
      setLoading(false)
      setPendingAction(null)
    }
  }

  return (
    <>
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5">
        <span className="text-sm font-medium text-foreground">
          {selectedCount} {selectedLabel}
        </span>
        <div className="flex items-center gap-2">
          {actions.map((action) => (
            <button
              key={action.label}
              disabled={loading}
              onClick={() => {
                if (action.confirmTitle) {
                  setPendingAction(action)
                } else {
                  // We need the keys — but they're managed by the parent.
                  // The parent passes onDone and we trigger via a custom event.
                  const evt = new CustomEvent('bulk-action', { detail: action })
                  window.dispatchEvent(evt)
                }
              }}
              className={cn(
                'inline-flex items-center rounded-md px-3 py-1 text-xs font-medium border transition-colors disabled:opacity-50',
                action.tone === 'danger'
                  ? 'border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10'
                  : 'border-border bg-background text-foreground hover:bg-accent',
              )}
            >
              {action.label}
            </button>
          ))}
        </div>
        <button
          onClick={onClear}
          disabled={loading}
          className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {clearLabel}
        </button>
      </div>

      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-lg">
            <h3 className="text-base font-semibold text-foreground">{pendingAction.confirmTitle}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{pendingAction.confirmBody}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setPendingAction(null)}
                disabled={loading}
                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent"
              >
                {cancelLabel}
              </button>
              <button
                onClick={async () => {
                  // Trigger the parent to collect keys and run
                  const evt = new CustomEvent('bulk-action-confirm', { detail: pendingAction })
                  window.dispatchEvent(evt)
                }}
                disabled={loading}
                className={cn(
                  'inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium',
                  pendingAction.tone === 'danger'
                    ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90',
                )}
              >
                {loading ? '…' : confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
