'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { ConfirmDialog } from '@/components/admin/confirm-dialog'
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
  /** Optional extra confirm-dialog content (e.g. a rejection-reason textarea). */
  children?: React.ReactNode
}

/**
 * Sticky bulk-action bar shown when rows are selected in a DataTable.
 * Renders above the table, shows the selection count, and runs a server
 * action against all selected keys at once. Keys are pulled at run time via
 * `getKeys` so the parent stays the single owner of the selection state.
 * Destructive actions (confirmTitle) confirm through the shared ConfirmDialog.
 */
export function BulkActionsBar({
  selectedCount,
  actions,
  getKeys,
  onClear,
  onDone,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  clearLabel = 'Clear',
  selectedLabel = 'selected',
}: {
  selectedCount: number
  actions: BulkAction[]
  getKeys: () => string[]
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
    if (keys.length === 0) return
    setLoading(true)
    try {
      const result = await action.action(keys)
      if (result.ok) {
        addToast(action.successToast.replace('{count}', String(keys.length)), 'success')
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
                  void runAction(action, getKeys())
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

      <ConfirmDialog
        open={pendingAction !== null}
        onOpenChange={(v) => { if (!v) setPendingAction(null) }}
        title={pendingAction?.confirmTitle ?? ''}
        description={pendingAction?.confirmBody ?? ''}
        confirmLabel={pendingAction?.confirmLabel ?? confirmLabel}
        cancelLabel={pendingAction?.cancelLabel ?? cancelLabel}
        loading={loading}
        tone={pendingAction?.tone === 'danger' ? 'danger' : 'default'}
        onConfirm={() => {
          if (pendingAction) void runAction(pendingAction, getKeys())
        }}
      >
        {pendingAction?.children}
      </ConfirmDialog>
    </>
  )
}
