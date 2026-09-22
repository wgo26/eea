import type { DayCount, BreakdownRow, FunnelCounts } from '@/lib/admin/analytics'

/**
 * Interactive 14-day area line chart (SVG-based, no chart library dependency).
 * Shows daily page views with hover tooltips, axis labels, and a gradient fill.
 */
export function DailyLineChart({
  daily,
  ariaLabel,
  color = '#2563eb',
}: {
  daily: DayCount[]
  ariaLabel: string
  color?: string
}) {
  if (daily.length === 0) {
    return <p className="text-xs text-muted-foreground">—</p>
  }

  const max = Math.max(1, ...daily.map((d) => d.count))
  const width = 480
  const height = 140
  const padding = { top: 16, right: 16, bottom: 24, left: 28 }
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom

  const points = daily.map((d, i) => {
    const x = (i / (daily.length - 1)) * plotWidth
    const y = plotHeight - (d.count / max) * plotHeight
    return { ...d, x: padding.left + x, y: padding.top + y }
  })

  const areaPoints = points.map((p) => `${p.x},${p.y}`).join(' ')
  const areaPointsClose = `${points[0]?.x ?? 0},${plotHeight + padding.top} ${areaPoints} ${points.at(-1)?.x ?? plotWidth},${plotHeight + padding.top}`
  const linePath = `M ${points.map((p) => `${p.x},${p.y}`).join(' L ')}`

  const gradientId = 'daily-gradient'

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className="relative w-full max-w-[480px] cursor-crosshair"
    >
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="text-foreground">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0.05} />
          </linearGradient>
        </defs>

        {/* Horizontal gridlines */}
        {[0.25, 0.5, 0.75, 1].map((frac) => {
          const y = padding.top + plotHeight - frac * plotHeight
          const value = Math.round(max * frac)
          return (
            <g key={frac}>
              <line x1={padding.left} y1={y} x2={padding.left + plotWidth} y2={y} stroke="currentColor" strokeWidth={0.5} opacity={0.1} />
              <text x={padding.left - 6} y={y + 3} fontSize={9} textAnchor="end" fill="currentColor" opacity={0.4}>
                {value}
              </text>
            </g>
          )
        })}

        {/* Area fill */}
        <polygon
          points={areaPointsClose}
          fill={`url(#${gradientId})`}
        />

        {/* Line */}
          <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {/* Data points with hover tooltips */}
        {points.map((p) => (
          <g key={p.day}>
            <circle cx={p.x} cy={p.y} r={3.5} fill={color} className="opacity-0 group-hover:opacity-100 transition-opacity" />
            <title>{`${p.day}: ${p.count} views`}</title>
          </g>
        ))}

        {/* X-axis labels (first, middle, last) */}
        <text x={points[0]?.x} y={height - 4} fontSize={9} textAnchor="start" fill="currentColor" opacity={0.6}>
          {daily[0]?.day.slice(5)}
        </text>
        <text x={points[Math.floor(points.length / 2)]?.x} y={height - 4} fontSize={9} textAnchor="middle" fill="currentColor" opacity={0.6}>
          {daily[Math.floor(daily.length / 2)]?.day.slice(5)}
        </text>
        <text x={points.at(-1)?.x} y={height - 4} fontSize={9} textAnchor="end" fill="currentColor" opacity={0.6}>
          {daily.at(-1)?.day.slice(5)}
        </text>
      </svg>
    </div>
  )
}

/**
 * Horizontal bar chart for categorical breakdowns.
 * Good for ranked data (by surface, by place, etc.).
 */
export function BreakdownBarChart({
  rows,
  ariaLabel,
  color = '#2563eb',
}: {
  rows: BreakdownRow[]
  ariaLabel: string
  color?: string
}) {
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">—</p>
  }

  const maxCount = Math.max(1, ...rows.map((r) => r.count))

  return (
    <div role="img" aria-label={ariaLabel} className="space-y-1.5">
      {rows.map((row) => (
        <div key={row.key} className="flex items-center gap-2 text-sm">
          <span className="w-24 min-w-[6rem] max-w-[10rem] truncate text-xs text-muted-foreground text-right">
            {row.key}
          </span>
          <div className="relative flex-1 h-5 rounded bg-muted/30 overflow-hidden">
            <div
              className="h-full rounded transition-all duration-300"
              style={{
                width: `${(row.count / maxCount) * 100}%`,
                backgroundColor: color,
                minWidth: '2px',
              }}
            />
            <span className="absolute inset-0 flex items-center justify-end px-1.5 text-xs font-medium text-foreground">
              {row.count.toLocaleString()}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Donut chart for locale comparison (EN vs FR).
 */
export function LocaleDonut({
  rows,
  ariaLabel,
}: {
  rows: BreakdownRow[]
  ariaLabel: string
}) {
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">—</p>
  }

  const total = rows.reduce((sum, r) => sum + r.count, 0)
  if (total === 0) {
    return <p className="text-xs text-muted-foreground">0 views</p>
  }

  const colors = ['#2563eb', '#ec4899']
  const segments = rows.map((row, i) => {
    const startPct = (rows.slice(0, i).reduce((sum, r) => sum + r.count, 0) / total) * 100
    const pct = (row.count / total) * 100
    const endPct = ((rows.slice(0, i + 1).reduce((sum, r) => sum + r.count, 0)) / total) * 100

    const radius = 40
    const cx = 50
    const cy = 50
    const x1 = cx + radius * Math.cos((startPct / 100) * 2 * Math.PI - Math.PI / 2)
    const y1 = cy + radius * Math.sin((startPct / 100) * 2 * Math.PI - Math.PI / 2)
    const x2 = cx + radius * Math.cos((endPct / 100) * 2 * Math.PI - Math.PI / 2)
    const y2 = cy + radius * Math.sin((endPct / 100) * 2 * Math.PI - Math.PI / 2)

    const largeArc = pct > 50 ? 1 : 0

    return {
      path: `M ${cx},${cy} L ${x1},${y1} A ${radius},${radius} 0 ${largeArc},1 ${x2},${y2} Z`,
      color: colors[i % colors.length],
      label: row.key,
      count: row.count,
      pct: pct,
    }
  })

  return (
    <div role="img" aria-label={ariaLabel} className="flex items-center gap-3">
      <svg width="100" height="100" viewBox="0 0 100 100" className="text-foreground">
        {segments.map((seg, i) => (
          <path key={i} d={seg.path} fill={seg.color} stroke="white" strokeWidth={1} />
        ))}
        <circle cx={50} cy={50} r={22} fill="hsl(var(--background))" />
      </svg>
      <div className="flex flex-col gap-1">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-1.5 text-sm">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
            <span className="text-xs text-muted-foreground">{seg.label}</span>
            <span className="tabular-nums text-xs font-medium">{seg.count.toLocaleString()}</span>
            <span className="text-xs text-muted-foreground">({Math.round(seg.pct)}%)</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Funnel chart visualizing conversion from page views → submissions → published.
 * Shows absolute values and conversion rate between stages.
 */
export function FunnelChart({
  funnel,
  ariaLabel,
}: {
  funnel: FunnelCounts
  ariaLabel: string
}) {
  const stages = [
    { label: 'Submit page views', value: funnel.submitPageViews, color: '#2563eb' },
    { label: 'Submissions received', value: funnel.submissionsReceived, color: '#10b981' },
    { label: 'Published', value: funnel.published, color: '#8b5cf6' },
  ] as const

  const maxVal = Math.max(1, ...stages.map((s) => s.value))

  const rates = [
    null,
    stages[0].value > 0 ? ((stages[1].value / stages[0].value) * 100) : 0,
    stages[1].value > 0 ? ((stages[2].value / stages[1].value) * 100) : 0,
  ]

  return (
    <div role="img" aria-label={ariaLabel} className="space-y-2.5">
      {stages.map((stage, i) => {
        const widthPct = Math.min(100, (stage.value / maxVal) * 100)
        const offsetPct = (100 - widthPct) / 2
        const rate = rates[i]
        return (
          <div key={stage.label} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="font-medium">{stage.label}</span>
              <span className="tabular-nums">{stage.value.toLocaleString()}</span>
            </div>
            <div className="relative h-6">
              <div
                className="absolute inset-y-0 rounded transition-all"
                style={{
                  left: `${offsetPct}%`,
                  width: `${widthPct}%`,
                  backgroundColor: stage.color,
                  minWidth: '4px',
                }}
              />
            </div>
            {rate != null && (
              <div className="flex justify-end text-xs text-muted-foreground">
                {rate > 0 ? `${Math.round(rate)}% conversion` : '—'}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
