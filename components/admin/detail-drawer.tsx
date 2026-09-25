'use client'

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet'

/**
 * Shared read-only detail peek for admin tables (Phase C upgrade of the
 * Phase 1 foundation). Opens as a right-side slide-over Sheet instead of a
 * blocking center dialog, so truncated cells in notifications / audit-log /
 * trust-safety have a full-content view while the list keeps its position and
 * the eye stays on the row being inspected. The backdrop blurs rather than
 * blacks out; field rows keep the same rhythm as before.
 */
export function DetailDrawer({
  open,
  onOpenChange,
  title,
  description,
  fields,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** Optional context line under the title (type, id, status…). */
  description?: string
  fields: { label: string; value: React.ReactNode }[]
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-[min(26rem,100vw)] gap-0 p-0 sm:max-w-md"
        >
          <div className="flex h-full flex-col">
            <header className="border-b border-border px-5 py-4 pr-14">
              <SheetTitle className="font-heading break-words text-base leading-snug font-medium">
                {title}
              </SheetTitle>
              {description ? (
                <SheetDescription className="mt-1 text-xs text-muted-foreground">
                  {description}
                </SheetDescription>
              ) : null}
            </header>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <dl className="space-y-2.5">
              {fields.map((f) => (
                <div key={f.label} className="rounded-md bg-muted/40 px-3 py-2">
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {f.label}
                  </dt>
                  <dd className="mt-1 break-words text-sm text-foreground">{f.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </SheetContent>
    </Sheet>
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
