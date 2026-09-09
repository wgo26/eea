import { cn } from '@/lib/utils'

/**
 * Unified empty state for admin tables and lists. Replaces the 5+ ad-hoc
 * dashed-box implementations scattered across the admin pages.
 *
 * Pass `icon` for a visual anchor, `action` for a primary CTA, and
 * `secondaryAction` for a "Clear filters" link. The component is pure
 * server-renderable (no client JS).
 */
export function EmptyState({
  message,
  action,
  secondaryAction,
  icon,
  className,
}: {
  message: string
  action?: React.ReactNode
  secondaryAction?: React.ReactNode
  icon?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/20 p-10 text-center',
      className,
    )}>
      {icon && <div className="text-muted-foreground/60">{icon}</div>}
      <p className="text-sm text-muted-foreground">{message}</p>
      {(action || secondaryAction) && (
        <div className="flex items-center gap-3">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  )
}
