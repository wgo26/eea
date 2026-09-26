'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { ConfirmDialog } from '@/components/admin/confirm-dialog'
import { useToast } from '@/components/admin/toast'

type MutationResult = { ok: true } | { ok: false; error: string }

export type BatchAction = {
  label: string
  action: (keys: string[]) => Promise<MutationResult>
  successToast: string
  tone?: 'default' | 'danger'
  confirmTitle?: string
  confirmBody?: string
  confirmLabel?: string
  cancelLabel?: string
  children?: React.ReactNode
  undoAction?: (keys: string[]) => Promise<MutationResult>
  undoToast?: string
  requirePhrase?: string
  phraseLabel?: string
}

/**
 * Centered batch-action bar for admin bulk-edit tables (trust-safety,
 * moderation). Sits at `fixed bottom-6 left-1/2 -translate-x-1/2 z-30` —
 * lower z-index than the ConfirmDialog overlays (z-40+) so it never paints
 * on top of a confirm sheet, and auto-hides while one is open.
 */
export function StickyBatchBar({
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
  actions: BatchAction[]
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
  const [pendingAction, setPendingAction] = useState<BatchAction | null>(null)
  const [overlayUp, setOverlayUp] = useState(false)

  useEffect(() => {
    function check(): boolean {
      return Boolean(
        document.querySelector(
          '[data-slot="alert-dialog-overlay"],[data-slot="sheet-overlay"],[data-slot="dialog-overlay"],[data-slot="drawer-overlay"],[role="alertdialog"]',
        ),
      )
    }

    setOverlayUp(check())

    function poll() {
      setOverlayUp(check())
    }

    window.addEventListener('focusin', poll)
    const id = window.setInterval(poll, 120)

    return () => {
      window.removeEventListener('focusin', poll)
      window.clearInterval(id)
    }
  }, [])

  if (selectedCount === 0) return null

  async function runAction(action: BatchAction, keys: string[]) {
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
      <div
         className={cn(
          'no-print',
          'fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 gap-1.5',
          'rounded-full border border-border/70 bg-background/95 px-3 py-1.5 shadow-lg',
          'backdrop-blur',
          overlayUp && 'hidden',
        )}
      >
        <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
          {selectedCount}
        </span>
        <span className="text-xs font-medium text-foreground">{selectedLabel}</span>
        <div className="flex items-center gap-1.5">
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
          onClick={() => {
            if (!loading) onClear()
          }}
          disabled={loading}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
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
