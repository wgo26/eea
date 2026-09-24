import { cn } from '@/lib/utils'

/**
 * The dashboard's hand-rolled visualisation primitives.
 *
 * The project deliberately carries no chart library (`components/ui/chart.tsx`
 * and its sole dependency `recharts` were removed — see architecture-checklist),
 * so every visualisation on the admin dashboard is built from these tiny
 * server-renderable pieces: one flex row of coloured divs is a stacked share,
 * one filled div is a meter, a row of heights is a sparkline.
 *
 * Accessibility rule: each primitive is decoration *by default*
 * (`aria-hidden`) because the numbers next to it already carry the fact. Pass
 * a `label` when the graphic stands alone and it becomes `role="img"` with
 * that label instead.
 */

export type VizTone = 'primary' | 'emerald' | 'amber' | 'red' | 'blue' | 'violet' | 'muted'

const TONE_BG: Record<VizTone, string> = {
  primary: 'bg-primary/70',
  emerald: 'bg-emerald-500/85',
  amber: 'bg-amber-500/85',
  red: 'bg-red-500/85',
  blue: 'bg-blue-500/85',
  violet: 'bg-violet-500/85',
  muted: 'bg-muted-foreground/40',
}

/** Rotation for anonymous groupings (storage providers, etc.). */
export const PROVIDER_TONES: readonly VizTone[] = ['blue', 'violet', 'amber', 'emerald']

export type StackSegment = {
  key: string
  value: number
  tone: VizTone
  /** Tooltip for hoverers; the accessible story is the legend or `label`. */
  title?: string
}

/**
 * A horizontal 100% share bar. Segments with a value but a sub-pixel width
 * keep a 3px sliver so a single small item never vanishes from the chart.
 * Renders nothing when the total is zero — an all-zero stack is an empty
 * state, not a chart.
 */
export function StackedBar({
  segments,
  label,
  className,
}: {
  segments: readonly StackSegment[]
  label?: string
  className?: string
}) {
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0)
  if (total <= 0) return null
  return (
    <div
      className={cn('flex h-2 w-full overflow-hidden rounded-full bg-muted', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
    >
      {segments.map((segment) => {
        const value = Math.max(0, segment.value)
        if (value === 0) return null
        return (
          <span
            key={segment.key}
            className={cn('block h-full', TONE_BG[segment.tone])}
            style={{ width: `${(value / total) * 100}%`, minWidth: '3px' }}
            title={segment.title}
          />
        )
      })}
    </div>
  )
}

/** A single 0–`max` progress bar. Pass `label` only when it stands alone. */
export function MeterBar({
  value,
  max,
  tone = 'primary',
  label,
  className,
}: {
  value: number
  max: number
  tone?: VizTone
  label?: string
  className?: string
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
    >
      <div className={cn('h-full rounded-full', TONE_BG[tone])} style={{ width: `${pct}%` }} />
    </div>
  )
}

/**
 * A vertical sparkline over a daily series — the publishing widget's bar
 * chart, lifted into a shared primitive. `titles` gives each column the same
 * "date — count" tooltip the chart always had.
 */
export function MiniBars({
  values,
  titles,
  label,
  tone = 'primary',
  className,
}: {
  values: readonly number[]
  titles?: readonly string[]
  label?: string
  tone?: VizTone
  className?: string
}) {
  const peak = Math.max(1, ...values)
  return (
    <div
      className={cn('flex h-12 items-end gap-0.5', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
    >
      {values.map((value, index) => (
        <div
          key={index}
          title={titles?.[index]}
          className={cn(
            'min-h-[2px] flex-1 rounded-sm',
            value > 0 ? TONE_BG[tone] : 'bg-muted',
          )}
          style={{ height: `${Math.round((value / peak) * 100)}%` }}
        />
      ))}
    </div>
  )
}

/** A status dot for component/health lists. Decorative by design. */
export function StatusDot({ tone, className }: { tone: VizTone; className?: string }) {
  return <span className={cn('inline-block size-2 shrink-0 rounded-full', TONE_BG[tone], className)} aria-hidden="true" />
}
