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

/**
 * Shared destructive-action confirmation + mutation feedback for the admin
 * section (Phase 0 foundation). Every irreversible admin action (archive,
 * remove, delete, role removal, …) renders this instead of `window.confirm`
 * so copy stays localized and the UX stays consistent.
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
  children?: React.ReactNode
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
          {children}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            variant={tone === 'danger' ? 'destructive' : 'default'}
            disabled={loading}
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
    async (action: () => Promise<MutationResult>, successToast: string): Promise<boolean> => {
      setLoading(true)
      try {
        const result = await action()
        if (result.ok) {
          addToast(successToast, 'success')
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
