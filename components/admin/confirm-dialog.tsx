'use client'

import { useCallback, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/components/admin/toast'
import { useLocaleFromPath } from '@/components/site-header'
import { ProductionWarning } from '@/components/admin/env-indicator'

type ToastActionOption = {
  label: string
  onSelect: () => void
}

/**
 * Shared destructive-action confirmation + mutation feedback for the admin
 * section (Phase 0 foundation, Phase C danger-state guard). Every
 * irreversible admin action (archive, remove, delete, role removal, ...)
 * renders this instead of `window.confirm` so copy stays localized and the
 * UX stays consistent.
 *
 * Double-confirmation: pass `requirePhrase` (e.g. "DELETE") and the confirm
 * button stays disabled until the exact phrase is typed — reserved for the
 * genuinely unrecoverable actions (bulk delete, permanent removal). Undo
 * affordances stay with the toast (see bulk-actions), so reversible actions
 * do not pay the typing cost.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  loading = false,
  tone = 'danger',
  requirePhrase,
  phraseLabel,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  loading?: boolean
  tone?: 'danger' | 'default'
  /** When set, confirm unlocks only after this exact phrase is typed. */
  requirePhrase?: string
  /** Copy around `{phrase}` (from `common.confirmPhrase`). */
  phraseLabel?: string
  children?: React.ReactNode
}) {
  const locale = useLocaleFromPath()
  const [typed, setTyped] = useState('')
  const phraseOk = !requirePhrase || typed.trim() === requirePhrase

  function handleOpenChange(next: boolean) {
    if (!next) setTyped('')
    onOpenChange(next)
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
          {children}
          {requirePhrase && (
            <label className="mt-1 block text-left">
              <span className="text-xs font-medium text-muted-foreground">
                {phraseLabel
                  ? phraseLabel.replace('{phrase}', requirePhrase)
                  : requirePhrase}
              </span>
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
          )}
          {tone === 'danger' && <ProductionWarning locale={locale} />}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            variant={tone === 'danger' ? 'destructive' : 'default'}
            disabled={loading || !phraseOk}
            onClick={(e) => {
              e.preventDefault()
              onConfirm()
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

type MutationResult = { ok: true } | { ok: false; error: string }

/**
 * Shared admin mutation pattern: runs a server action, toasts the localized
 * success copy or the returned error, and exposes the busy flag. Replaces the
 * ad-hoc `useState + try/result + addToast` blocks in admin row actions.
 */
export function useAdminMutation() {
  const { addToast } = useToast()
  const [loading, setLoading] = useState(false)

  const run = useCallback(
    async (
      action: () => Promise<MutationResult>,
      successToast: string,
      toastOptions?: { duration?: number; action?: ToastActionOption },
    ): Promise<boolean> => {
      setLoading(true)
      try {
        const result = await action()
        if (result.ok) {
          addToast(successToast, 'success', toastOptions)
          return true
        }
        addToast(result.error, 'error')
        return false
      } catch (e) {
        addToast(e instanceof Error ? e.message : 'Operation failed', 'error')
        return false
      } finally {
        setLoading(false)
      }
    },
    [addToast],
  )

  return { run, loading }
}
