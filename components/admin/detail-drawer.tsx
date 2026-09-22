'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/**
 * Shared read-only detail drawer for admin tables (Phase 1 foundation).
 * Renders field rows in a scrollable dialog so truncated cells in
 * notifications / audit-log / trust-safety have a full-content view
 * without leaving the list page.
 */
export function DetailDrawer({
  open,
  onOpenChange,
  title,
  fields,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  fields: { label: string; value: React.ReactNode }[]
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="break-words pr-8">{title}</DialogTitle>
        </DialogHeader>
        <dl className="space-y-3">
          {fields.map((f) => (
            <div key={f.label} className="rounded-md bg-muted/40 px-3 py-2">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {f.label}
              </dt>
              <dd className="mt-1 break-words text-sm text-foreground">{f.value}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Row-level "view details" ghost button that opens a DetailDrawer.
 * Keeps per-page wiring to a single useState<boolean>.
 */
export function DetailButton({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      {label}
    </button>
  )
}
