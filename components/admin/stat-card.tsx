import { cn } from '@/lib/utils'

type StatCardProps = {
  label: string
  value: string | number
  icon?: React.ReactNode
  hint?: string
  trend?: { value: number; positive?: boolean }
  className?: string
}

export function StatCard({ label, value, icon, hint, trend, className }: StatCardProps) {
  return (
    <div className={cn('rounded-lg border border-border bg-card p-4 flex flex-col gap-1', className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
        {icon && <span className="h-4 w-4 text-muted-foreground">{icon}</span>}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums">{typeof value === 'number' ? value.toLocaleString() : value}</span>
        {trend && (
          <span className={cn(
            'text-xs font-medium',
            trend.positive ? 'text-emerald-600' : 'text-destructive',
          )}>
            {trend.positive ? '+' : ''}{trend.value}%
          </span>
        )}
      </div>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  )
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">{children}</div>
}
