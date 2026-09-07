import { cn } from '@/lib/utils'

type StatusVariant = 'pending' | 'approved' | 'rejected' | 'published' | 'draft' | 'scheduled' | 'active' | 'inactive' | 'archived' | 'default'

const variantStyles: Record<StatusVariant, string> = {
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  approved: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  rejected: 'bg-red-100 text-red-800 border-red-200',
  published: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  draft: 'bg-slate-100 text-slate-700 border-slate-200',
  scheduled: 'bg-blue-100 text-blue-800 border-blue-200',
  active: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  inactive: 'bg-slate-100 text-slate-600 border-slate-200',
  archived: 'bg-orange-100 text-orange-800 border-orange-200',
  default: 'bg-slate-100 text-slate-600 border-slate-200',
}

function normalizeStatus(status: string): StatusVariant {
  const s = status.toLowerCase()
  if (s.includes('pend') || s === 'open' || s.includes('clarification')) return 'pending'
  if (s.includes('approv') || s.includes('resolved')) return 'approved'
  if (s.includes('reject')) return 'rejected'
  if (s.includes('publish')) return 'published'
  if (s.includes('draft')) return 'draft'
  if (s.includes('schedul') || s.includes('investigat')) return 'scheduled'
  if (s.includes('active')) return 'active'
  if (s.includes('inactive') || s.includes('expired') || s.includes('ended') || s.includes('dismissed')) return 'inactive'
  if (s.includes('archiv')) return 'archived'
  return 'default'
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const variant = normalizeStatus(status)
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
      variantStyles[variant],
      className,
    )}>
      {status}
    </span>
  )
}

export function TypeBadge({ type, className }: { type: string; className?: string }) {
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-secondary text-secondary-foreground',
      className,
    )}>
      {type.replace(/_/g, ' ')}
    </span>
  )
}
