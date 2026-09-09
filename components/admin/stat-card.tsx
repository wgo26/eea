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
        'rounded-lg border border-border bg-card p-4 flex flex-col gap-1 transition-colors',
        href && 'hover:bg-accent/50 cursor-pointer',
        toneClasses[tone],
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
        {icon && <span className="h-4 w-4 text-muted-foreground">{icon}</span>}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums text-foreground">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
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

  if (href) {
    return <Link href={href} className="block">{inner}</Link>
  }
  return inner
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">{children}</div>
}
