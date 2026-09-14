import Link from 'next/link'
import { cn } from '@/lib/utils'

type StatCardProps = {
  label: string
  value: string | number
  icon?: React.ReactNode
  hint?: string
  trend?: { value: number; positive?: boolean }
  /** When provided, wraps the card in a Link for drill-down navigation */
  href?: string
  /** Visual tone for urgent/colored cards */
  tone?: 'default' | 'amber' | 'emerald' | 'blue' | 'red'
  className?: string
}

const toneClasses: Record<string, string> = {
  default: '',
  amber: 'border-amber-200 dark:border-amber-900/50',
  emerald: 'border-emerald-200 dark:border-emerald-900/50',
  blue: 'border-blue-200 dark:border-blue-900/50',
  red: 'border-red-200 dark:border-red-900/50',
}

export function StatCard({ label, value, icon, hint, trend, href, tone = 'default', className }: StatCardProps) {
  const inner = (
    <div
      className={cn(
        'rounded-lg border border-border bg-card px-3 py-2.5 flex flex-col gap-0.5 transition-colors min-w-0',
        href && 'hover:bg-accent/50 cursor-pointer',
        toneClasses[tone],
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide truncate">{label}</span>
        {icon && <span className="h-4 w-4 shrink-0 text-muted-foreground">{icon}</span>}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-semibold tabular-nums text-foreground truncate">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
        {trend && (
          <span className={cn(
            'text-xs font-medium shrink-0',
            trend.positive ? 'text-emerald-600' : 'text-destructive',
          )}>
            {trend.positive ? '+' : ''}{trend.value}%
          </span>
        )}
      </div>
      {hint && <span className="text-[11px] leading-tight text-muted-foreground truncate">{hint}</span>}
    </div>
  )

  if (href) {
    return <Link href={href} className="block min-w-0">{inner}</Link>
  }
  return inner
}

export function StatGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-1 min-[480px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6 gap-2', className)}>{children}</div>
}
