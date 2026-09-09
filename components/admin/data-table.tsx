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
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
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
          render: (_row: T) => null,
          headerClassName: selectWidth,
          className: selectWidth,
        } as Column<T>,
        ...columns,
      ]
    : columns

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              {effectiveColumns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide',
                    col.headerClassName,
                  )}
                >
                  {col.sortable && col.sortHref ? (
                    <a
                      href={col.sortHref(col.key, col.sortDir === 'asc' ? 'desc' : 'asc')}
                      className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                      aria-sort={col.sortDir === 'asc' ? 'ascending' : col.sortDir === 'desc' ? 'descending' : undefined}
                    >
                      {col.header}
                      {col.sortDir && (
                        <span className="text-foreground">{SORT_ICON[col.sortDir]}</span>
                      )}
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
          <tbody className="divide-y divide-border">
            {rows.map((row) => {
              const key = rowKey(row)
              const isSelected = selectedKeys?.has(key) ?? false
              return (
                <tr
                  key={key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    'bg-card transition-colors',
                    onRowClick && 'cursor-pointer hover:bg-muted/50',
                    isSelected && 'bg-primary/5',
                    getRowClassName?.(row),
                  )}
                >
                  {effectiveColumns.map((col) => (
                    <td key={col.key} className={cn('px-4 py-3', col.className)}>
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
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="bg-muted/50 border-b border-border px-4 py-3">
        <div className="h-3 w-24 bg-muted rounded animate-pulse" />
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-4 py-3 flex gap-4">
            {Array.from({ length: columns }).map((_, j) => (
              <div key={j} className="h-4 flex-1 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
