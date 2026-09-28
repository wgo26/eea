import type { DayCount, BreakdownRow, FunnelCounts } from '@/lib/admin/analytics'

/**
 * Insights visualisations — hand-rolled SVG, no chart library (project
 * standard: the dashboard's viz.tsx documents why recharts was removed).
 * Shared palette + compact-number + nice-axis helpers keep every card on
 * the page reading as one family. All charts are server-renderable SVG;
 * hover detail uses native `<title>` tooltips + CSS so they cost zero JS.
 */

export const INSIGHT_PALETTE = {
  views: '#2563eb',
  shares: '#16a34a',
  accent: '#8b5cf6',
  donut: ['#2563eb', '#16a34a', '#8b5cf6'],
} as const

export function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${Math.round((n / 1_000_000) * 10) / 10}M`
  if (n >= 1_000) return `${Math.round((n / 1_000) * 10) / 10}k`
  return `${n}`
}

export function niceCeil(max: number): number {
  if (max <= 4) return 4
  const mag = 10 ** Math.floor(Math.log10(max))
  const norm = max / mag
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10
  return step * mag
}

/** Short "12 Sep" label for a YYYY-MM-DD day, locale-aware. */
export function shortDayLabel(day: string, locale: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return day.slice(5)
  try {
    return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(d)
  } catch {
    return day.slice(5)
  }
}

/**
 * TrafficChart — hero visualisation: daily views (area + line) with daily
 * shares overlaid as columns on the same x-axis. Hovering any day reveals
 * a crosshair + dot via CSS; the same facts live in the aria-label + KPI
 * strip for keyboard / screen-reader users.
 */
export function TrafficChart({
  daily,
  dailyShares,
  ariaLabel,
  viewsLabel,
  sharesLabel,
  locale = 'en',
}: {
  daily: DayCount[]
  dailyShares?: DayCount[]
  ariaLabel: string
  viewsLabel: string
  sharesLabel: string
  locale?: string
}) {
  const shares = dailyShares ?? []
  if (daily.length === 0) {
    return <p className="text-xs text-muted-foreground">—</p>
  }

  const width = 640
  const height = 220
  const padding = { top: 18, right: 14, bottom: 30, left: 40 }
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom
  const viewsColor = INSIGHT_PALETTE.views
  const sharesColor = INSIGHT_PALETTE.shares
  const maxViews = Math.max(1, ...daily.map((d) => d.count))
  const maxShares = Math.max(0, ...shares.map((d) => d.count))
  const yMax = niceCeil(maxViews)
  const shareMax = Math.max(1, maxShares)
  const n = daily.length
  const xPos = (i: number) => padding.left + (n === 1 ? plotWidth / 2 : (i / (n - 1)) * plotWidth)
  const yViews = (v: number) => padding.top + plotHeight - (Math.min(v, yMax) / yMax) * plotHeight
  const yShares = (v: number) => padding.top + plotHeight - (v / shareMax) * plotHeight * 0.55
  const pts = daily.map((d, i) => ({ ...d, x: xPos(i), y: yViews(d.count) }))
  const linePath = `M ${pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ')}`
  const base = (padding.top + plotHeight).toFixed(1)
  const areaClose = `${pts[0].x.toFixed(1)},${base} ${pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} ${pts[n - 1].x.toFixed(1)},${base}`

  const peak = pts.reduce((best, p) => (p.count > (best?.count ?? -1) ? p : best), pts[0])
  const ticks = [0.25, 0.5, 0.75, 1].map((frac) => ({ y: padding.top + plotHeight - frac * plotHeight, value: Math.round(yMax * frac) }))
  const labelIdx = n <= 7 ? pts.map((_, i) => i) : [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1]
  const bandW = n > 1 ? plotWidth / (n - 1) : plotWidth
  const colW = Math.max(2, Math.min(14, bandW * 0.32))
  const tipShare = (s: DayCount) => `${shortDayLabel(s.day, locale)} — ${sharesLabel}: ${s.count.toLocaleString()}`
  void tipShare
  const tipDay = (p: DayCount, i: number) => `${shortDayLabel(p.day, locale)} — ${viewsLabel}: ${p.count.toLocaleString()}, ${sharesLabel}: ${(shares[i]?.count ?? 0).toLocaleString()}`

  return (
    <figure role="img" aria-label={ariaLabel} className="w-full">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-2 w-4 rounded-full" style={{ backgroundColor: viewsColor }} />
          {viewsLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-2 w-2.5 rounded-sm" style={{ backgroundColor: sharesColor }} />
          {sharesLabel}
        </span>
      </div>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="block w-full text-foreground" role="presentation">
        <defs>
          <linearGradient id="insights-traffic-views" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={viewsColor} stopOpacity={0.32} />
            <stop offset="100%" stopColor={viewsColor} stopOpacity={0.04} />
          </linearGradient>
        </defs>

        {/* Gridlines */}
        {ticks.map((t) => (
          <g key={t.value}>
            <line x1={padding.left} y1={t.y} x2={padding.left + plotWidth} y2={t.y} stroke="currentColor" strokeWidth={0.5} opacity={0.12} />
            <text x={padding.left - 6} y={t.y + 3} fontSize={10} textAnchor="end" fill="currentColor" opacity={0.45}>
              {formatCompact(t.value)}
            </text>
          </g>
        ))}

        {shares.map((s, i) => {
          if (s.count <= 0) return null
          const cx = xPos(i)
          const top = yShares(s.count)
          return (
            <rect key={s.day} x={cx - colW / 2} y={top} width={colW} height={padding.top + plotHeight - top} rx={2} fill={sharesColor} opacity={0.35}>
              <title>{tipShare(s)}</title>
            </rect>
          )
        })}

        <polygon points={areaClose} fill="url(#insights-traffic-views)" />
        <path d={linePath} fill="none" stroke={viewsColor} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
        {peak && peak.count > 0 && (
          <g>
            <circle cx={peak.x} cy={peak.y} r={8} fill={viewsColor} opacity={0.15} />
            <circle cx={peak.x} cy={peak.y} r={3.5} fill={viewsColor} stroke="white" strokeWidth={1.5} />
          </g>
        )}
        {pts.map((p, i) => (
          <g key={p.day} className="group">
            <rect x={p.x - bandW / 2} y={padding.top - 6} width={bandW} height={plotHeight + 12} fill="transparent">
              <title>{tipDay(p, i)}</title>
            </rect>
            <line x1={p.x} y1={padding.top - 4} x2={p.x} y2={padding.top + plotHeight} stroke="currentColor" strokeWidth={1} opacity={0} className="transition-opacity group-hover:opacity-25" />
            <circle cx={p.x} cy={p.y} r={4} fill={viewsColor} stroke="white" strokeWidth={1.5} opacity={0} className="transition-opacity group-hover:opacity-100" />
          </g>
        ))}

        {labelIdx.map((i) => (
          <text key={daily[i].day} x={xPos(i)} y={height - 8} fontSize={10} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fill="currentColor" opacity={0.6}>
            {shortDayLabel(daily[i].day, locale)}
          </text>
        ))}
      </svg>
    </figure>
  )
}

/** Single-series back-compat chart. */
export function DailyLineChart({
  daily,
  ariaLabel,
  color = INSIGHT_PALETTE.views,
  locale = 'en',
}: {
  daily: DayCount[]
  ariaLabel: string
  color?: string
  locale?: string
}) {
  void color
  return (
    <TrafficChart
      daily={daily}
      dailyShares={[]}
      ariaLabel={ariaLabel}
      viewsLabel={ariaLabel}
      sharesLabel=""
      locale={locale}
    />
  )
}

/**
 * Horizontal bar chart for categorical breakdowns.
 * Good for ranked data (by surface, by place, etc.).
 */
export function BreakdownBarChart({
  rows,
  ariaLabel,
  color = INSIGHT_PALETTE.views,
  limit = 8,
}: {
  rows: BreakdownRow[]
  ariaLabel: string
  color?: string
  limit?: number
}) {
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">—</p>
  }

  const total = rows.reduce((sum, r) => sum + r.count, 0)
  const shown = rows.slice(0, Math.max(1, limit))
  const hiddenRows = rows.length - shown.length
  const hiddenTotal = rows.slice(shown.length).reduce((s, r) => s + r.count, 0)
  const maxShown = Math.max(1, ...shown.map((r) => r.count))

  return (
    <div role="img" aria-label={ariaLabel} className="space-y-2">
      {shown.map((row, i) => {
        const pct = total > 0 ? Math.min(100, Math.max(0, (row.count / total) * 100)) : 0
        const widthPct = Math.max(row.count > 0 ? 4 : 0, (row.count / maxShown) * 100)
        return (
          <div key={row.key} className="group">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate font-medium capitalize" title={row.key}>
                {row.key}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {row.count.toLocaleString()}
                <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 font-semibold">
                  {pct >= 10 ? Math.round(pct) : Math.round(pct * 10) / 10}%
                </span>
              </span>
            </div>
            <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-muted" title={`${row.key}: ${row.count.toLocaleString()} (${Math.round(pct * 10) / 10}%)`}>
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${widthPct}%`, backgroundColor: color, opacity: i === 0 ? 1 : Math.max(0.45, 1 - i * 0.09) }}
              />
            </div>
          </div>
        )
      })}
      {hiddenRows > 0 && (
        <p className="pt-1 text-xs text-muted-foreground">
          +{hiddenRows} more · {hiddenTotal.toLocaleString()}
        </p>
      )}
    </div>
  )
}

/**
 * Donut chart for locale comparison (EN vs FR).
 */
export function LocaleDonut({
  rows,
  ariaLabel,
  colors = [...INSIGHT_PALETTE.donut],
}: {
  rows: BreakdownRow[]
  ariaLabel: string
  colors?: string[]
}) {
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">—</p>
  }

  const total = rows.reduce((sum, r) => sum + r.count, 0)
  if (total === 0) {
    return <p className="text-xs text-muted-foreground">—</p>
  }

  const radius = 40
  const cx = 50
  const cy = 50
  // Cumulative offsets computed without mutation (react-hooks/immutability).
  const offsets = rows.reduce<number[]>((acc, row) => {
    const prev = acc.length > 0 ? acc[acc.length - 1] : 0
    return [...acc, prev + (row.count / total) * 100]
  }, [])
  const segments = rows.map((row, i) => {
    const pct = (row.count / total) * 100
    const startPct = i === 0 ? 0 : offsets[i - 1]
    const endPct = offsets[i]
    const x1 = cx + radius * Math.cos((startPct / 100) * 2 * Math.PI - Math.PI / 2)
    const y1 = cy + radius * Math.sin((startPct / 100) * 2 * Math.PI - Math.PI / 2)
    const x2 = cx + radius * Math.cos((endPct / 100) * 2 * Math.PI - Math.PI / 2)
    const y2 = cy + radius * Math.sin((endPct / 100) * 2 * Math.PI - Math.PI / 2)
    const largeArc = pct > 50 ? 1 : 0
    return {
      path: `M ${cx},${cy} L ${x1.toFixed(2)},${y1.toFixed(2)} A ${radius},${radius} 0 ${largeArc},1 ${x2.toFixed(2)},${y2.toFixed(2)} Z`,
      color: colors[i % colors.length],
      label: row.key,
      count: row.count,
      pct,
    }
  })

  return (
    <div role="img" aria-label={ariaLabel} className="flex items-center gap-4">
      <svg width="120" height="120" viewBox="0 0 100 100" className="shrink-0 text-foreground" role="presentation">
        {segments.map((seg, i) => (
          <path key={seg.label + i} d={seg.path} fill={seg.color} stroke="white" strokeWidth={1}>
            <title>{`${seg.label}: ${seg.count.toLocaleString()} (${Math.round(seg.pct * 10) / 10}%)`}</title>
          </path>
        ))}
        <circle cx={50} cy={50} r={24} fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth={1} />
        <text x={50} y={48} fontSize={13} fontWeight={700} textAnchor="middle" fill="currentColor">
          {formatCompact(total)}
        </text>
        <text x={50} y={60} fontSize={7.5} textAnchor="middle" fill="currentColor" opacity={0.55}>
          total
        </text>
      </svg>
      <div className="flex min-w-0 flex-col gap-1.5">
        {segments.map((seg, i) => (
          <div key={seg.label + i} className="flex items-center gap-1.5 text-sm">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
            <span className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{seg.label}</span>
            <span className="tabular-nums text-xs font-semibold">{seg.count.toLocaleString()}</span>
            <span className="text-xs tabular-nums text-muted-foreground">({Math.round(seg.pct)}%)</span>
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
  labels,
  endToEndLabel,
}: {
  funnel: FunnelCounts
  ariaLabel: string
  labels?: readonly [string, string, string]
  endToEndLabel?: string
}) {
  const stages = [
    { label: labels?.[0] ?? 'Submit page views', value: funnel.submitPageViews, color: INSIGHT_PALETTE.views },
    { label: labels?.[1] ?? 'Submissions received', value: funnel.submissionsReceived, color: INSIGHT_PALETTE.shares },
    { label: labels?.[2] ?? 'Published', value: funnel.published, color: INSIGHT_PALETTE.accent },
  ] as const

  const maxVal = Math.max(1, ...stages.map((s) => s.value))

  const rates = [
    null,
    stages[0].value > 0 ? ((stages[1].value / stages[0].value) * 100) : 0,
    stages[1].value > 0 ? ((stages[2].value / stages[1].value) * 100) : 0,
  ]
  const endToEnd = stages[0].value > 0 ? (stages[2].value / stages[0].value) * 100 : null
  const fmtRate = (r: number) => (r >= 10 ? `${Math.round(r)}%` : `${Math.round(r * 10) / 10}%`)

  return (
    <div role="img" aria-label={ariaLabel} className="space-y-3">
      {stages.map((stage, i) => {
        const widthPct = Math.max(stage.value > 0 ? 6 : 2, Math.min(100, (stage.value / maxVal) * 100))
        const offsetPct = (100 - widthPct) / 2
        const rate = rates[i]
        return (
          <div key={stage.label} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2 font-medium">
                <span aria-hidden className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: stage.color }}>
                  {i + 1}
                </span>
                <span className="truncate">{stage.label}</span>
              </span>
              <span className="shrink-0 tabular-nums font-semibold">{stage.value.toLocaleString()}</span>
            </div>
            <div className="relative h-7" title={`${stage.label}: ${stage.value.toLocaleString()}`}>
              <div
                className="absolute inset-y-0 rounded-lg transition-all duration-500"
                style={{ left: `${offsetPct}%`, width: `${widthPct}%`, backgroundColor: stage.color, opacity: 0.88, minWidth: '24px' }}
              >
                <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-white drop-shadow">
                  {stage.value > 0 ? formatCompact(stage.value) : '—'}
                </span>
              </div>
            </div>
            {rate != null && (
              <div className="flex justify-end text-xs text-muted-foreground">
                {rate > 0 ? (
                  <span className="rounded-full bg-muted px-2 py-0.5 font-medium tabular-nums">
                    ↓ {fmtRate(rate)}
                  </span>
                ) : (
                  '—'
                )}
              </div>
            )}
          </div>
        )
      })}
      {endToEnd != null && endToEnd > 0 && (
        <p className="border-t pt-2 text-right text-xs text-muted-foreground">
          {endToEndLabel ?? 'End-to-end'}: <strong className="tabular-nums text-foreground">{fmtRate(endToEnd)}</strong>
        </p>
      )}
    </div>
  )
}
