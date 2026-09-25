import { cn } from '@/lib/utils'

export type SortDirection = 'asc' | 'desc' | null

export type Column<T> = {
  key: string
  header: string
  render: (row: T) => React.ReactNode
  className?: string
  headerClassName?: string
  /** When set, the column header becomes a sortable link */
  sortable?: boolean
  /** href template for sort; receives the column key and new direction */
  sortHref?: (key: string, dir: 'asc' | 'desc') => string
  /** Current sort state for this column */
  sortDir?: SortDirection
  /**
   * Pin this column to the right edge of the scroll container so row actions
   * stay visible without horizontal scrolling (e.g. the `actions` column).
   * The cell gets a solid background + edge shadow so scrolled content
   * slides underneath it instead of showing through.
   */
  stickyRight?: boolean
}

type DataTableProps<T> = {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  emptyMessage?: string
  /** Empty state node — when provided, replaces the default dashed box */
  emptyState?: React.ReactNode
  onRowClick?: (row: T) => void
  getRowClassName?: (row: T) => string | undefined
  /** Row selection support */
  selectable?: boolean
  selectedKeys?: Set<string>
  onToggleRow?: (key: string) => void
  onToggleAll?: () => void
  /** When selectable and all rows are checked */
  allSelected?: boolean
  /** Sticky selection column width */
  selectWidth?: string
}

const SORT_ICON: Record<string, string> = {
  asc: '↑',
  desc: '↓',
}

/**
 * Admin ops table. Cell padding is driven by the `--table-pad-*` variables so
 * the topbar density control (comfortable/compact) rescales every table at
 * once — see app/globals.css. Zebra striping, row hover, selection tint and
 * the sticky-edge background inheritance are also CSS-side, which is why the
 * component stays a Server Component (column `render` closures arrive from
 * server pages).
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyMessage = 'No items found.',
  emptyState,
  onRowClick,
  getRowClassName,
  selectable,
  selectedKeys,
  onToggleRow,
  onToggleAll,
  allSelected,
  selectWidth = 'w-10',
}: DataTableProps<T>) {
  if (rows.length === 0) {
    if (emptyState) return <>{emptyState}</>
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center">
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    )
  }

  const effectiveColumns = selectable
    ? [
        {
          key: '__select',
          header: '',
          sortable: false,
          render: () => null,
          headerClassName: selectWidth,
          className: selectWidth,
        } as Column<T>,
        ...columns,
      ]
    : columns

  return (
    <div className="max-w-full overflow-hidden rounded-lg border border-border bg-card">
      <div className="max-w-full overflow-x-auto">
        <table className="admin-table w-full min-w-0 border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {effectiveColumns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'px-(--table-pad-x) py-(--table-pad-y) text-left text-xs font-medium uppercase tracking-wide whitespace-nowrap align-middle text-muted-foreground',
                    col.key === '__select' &&
                      'table-sticky-cell sticky left-0 z-10 bg-muted shadow-[1px_0_0_0_var(--border)]',
                    col.stickyRight &&
                      'table-sticky-cell sticky right-0 z-10 bg-muted shadow-[-4px_0_12px_-6px_rgb(0_0_0/0.25)]',
                    col.headerClassName,
                  )}
                >
                  {col.sortable && col.sortHref ? (
                    <a
                      href={col.sortHref(col.key, col.sortDir === 'asc' ? 'desc' : 'asc')}
                      className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                      aria-sort={
                        col.sortDir === 'asc' ? 'ascending' : col.sortDir === 'desc' ? 'descending' : undefined
                      }
                    >
                      {col.header}
                      {col.sortDir && <span className="text-foreground">{SORT_ICON[col.sortDir]}</span>}
                    </a>
                  ) : col.key === '__select' && selectable ? (
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        checked={allSelected ?? false}
                        onChange={() => onToggleAll?.()}
                        className="h-4 w-4 rounded border-border"
                        aria-label="Select all rows"
                      />
                    </div>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const key = rowKey(row)
              const isSelected = selectedKeys?.has(key) ?? false
              return (
                <tr
                  key={key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  data-selected={isSelected || undefined}
                  className={cn(
                    'border-b border-border/60 last:border-b-0',
                    onRowClick && 'cursor-pointer',
                    getRowClassName?.(row),
                  )}
                >
                  {effectiveColumns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        'px-(--table-pad-x) py-(--table-pad-y) align-middle',
                        col.key === '__select' &&
                          'table-sticky-cell sticky left-0 z-10 shadow-[1px_0_0_0_var(--border)]',
                        col.stickyRight &&
                          'table-sticky-cell sticky right-0 z-10 shadow-[-4px_0_12px_-6px_rgb(0_0_0/0.25)]',
                        col.className,
                      )}
                    >
                      {col.key === '__select' && selectable ? (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => onToggleRow?.(key)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 rounded border-border"
                          aria-label={`Select row ${key}`}
                        />
                      ) : (
                        col.render(row)
                      )}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="border-b border-border bg-muted/50 px-4 py-3">
        <div className="h-3 w-24 rounded bg-muted animate-pulse" />
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-4 px-4 py-3">
            {Array.from({ length: columns }).map((_, j) => (
              <div key={j} className="h-4 flex-1 rounded bg-muted animate-pulse" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
