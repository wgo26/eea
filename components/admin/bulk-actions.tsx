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
  /** Optional undo: re-run with the same keys when the toast's Undo button is pressed. */
  undoAction?: (keys: string[]) => Promise<MutationResult>
  /** Success toast copy after the undo completes (falls back to successToast). */
  undoToast?: string
  /**
   * Double-confirmation (Phase C): confirm unlocks only when this exact
   * phrase is typed in the dialog (e.g. "DELETE"). Reserve for unrecoverable
   * actions; reversible ones keep the toast Undo affordance instead.
   */
  requirePhrase?: string
  /** Localized prompt around `{phrase}` — pass `common.confirmPhrase`. */
  phraseLabel?: string
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
  undoLabel = 'Undo',
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
  undoLabel?: string
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
        const undo = action.undoAction
        addToast(
          action.successToast.replace('{count}', String(keys.length)),
          'success',
          undo
            ? {
                duration: 8000,
                action: {
                  label: undoLabel,
                  onSelect: () => {
                    void (async () => {
                      const undone = await undo(keys)
                      addToast(
                        undone.ok
                          ? (action.undoToast ?? action.successToast).replace('{count}', String(keys.length))
                          : undone.error,
                        undone.ok ? 'success' : 'error',
                      )
                      if (undone.ok) onDone()
                    })()
                  },
                },
              }
            : undefined,
        )
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
      {/* Floating pill (Phase D): fixed bottom-center so the bulk bar stays
          reachable no matter how far the table has scrolled; translucent
          backdrop-blur keeps the table beneath readable. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
        <div className="pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-2 rounded-full border border-border/70 bg-background/95 px-4 py-2 shadow-lg backdrop-blur">
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
            {selectedCount}
          </span>
          <span className="text-xs font-medium text-foreground">{selectedLabel}</span>
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
                  'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border transition-colors disabled:opacity-50',
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
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {clearLabel}
          </button>
        </div>
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
        requirePhrase={pendingAction?.requirePhrase}
        phraseLabel={pendingAction?.phraseLabel}
        onConfirm={() => {
          if (pendingAction) void runAction(pendingAction, getKeys())
        }}
      >
        {pendingAction?.children}
      </ConfirmDialog>
    </>
  )
}
