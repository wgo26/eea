/**
 * Shared admin UI constants. Replaces the ad-hoc `inputCls`, `btnPrimary`,
 * `btnGhost`, `btnDanger` string literals duplicated across 10+ files
 * (content-dialogs.tsx, review-actions.tsx, etc.).
 *
 * Import as: import { ui } from '@/lib/admin/ui-constants'
 * Then use: className={ui.input}, className={ui.btnPrimary}, etc.
 */
export const ui = {
  input:
    'h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring',
  textarea:
    'w-full rounded-md border border-border bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring',
  select:
    'h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring',
  label: 'text-sm font-medium text-foreground',
  hint: 'text-xs text-muted-foreground',
  btnPrimary:
    'inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors',
  btnSecondary:
    'inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50 transition-colors',
  btnGhost:
    'inline-flex h-8 items-center justify-center rounded-md px-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors',
  btnDanger:
    'inline-flex h-9 items-center justify-center rounded-md bg-destructive px-4 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 transition-colors',
  btnSm:
    'inline-flex h-7 items-center justify-center rounded-md px-2.5 text-xs font-medium transition-colors',
  field: 'space-y-1.5',
  fieldRow: 'flex flex-col gap-1.5',
  card: 'rounded-lg border border-border bg-card p-4',
  sectionHeading: 'text-sm font-medium text-foreground',
} as const

/** The Field component, also previously duplicated across files. */
export function Field({
  label,
  hint,
  children,
  className,
}: {
  label?: string
  hint?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ''}`}>
      {label && (
        <label className="text-sm font-medium text-foreground">{label}</label>
      )}
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
