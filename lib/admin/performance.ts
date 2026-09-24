/**
 * Admin performance helpers (plan Phase 5.7, spec §58).
 *
 * Client-safe (no `server-only`): pagination arithmetic and the debounced
 * search wrapper are used by both server components (page/limit math) and
 * client components (keystroke debouncing). Table virtualization itself lives
 * in `components/admin/virtualizer.tsx`.
 */

export const PAGINATION_DEFAULTS = {
  page: 1,
  pageSize: 20,
  maxPageSize: 100,
} as const

export type Pagination = { page: number; limit: number; offset: number }

/** Clamp raw page/pageSize input into a bounded { page, limit, offset }. */
export function buildPagination(page?: number, pageSize?: number): Pagination {
  const safePage = Number.isFinite(page) && (page as number) > 0 ? Math.floor(page as number) : PAGINATION_DEFAULTS.page
  const rawSize = Number.isFinite(pageSize) ? Math.floor(pageSize as number) : PAGINATION_DEFAULTS.pageSize
  const limit = Math.min(Math.max(rawSize, 1), PAGINATION_DEFAULTS.maxPageSize)
  return { page: safePage, limit, offset: (safePage - 1) * limit }
}

/** Total pages for a count + page size (at least 1, so pagers never divide by zero). */
export function totalPages(total: number, pageSize: number): number {
  const size = Math.max(1, Math.floor(pageSize) || PAGINATION_DEFAULTS.pageSize)
  return Math.max(1, Math.ceil(Math.max(0, total) / size))
}

/**
 * Spec §58 debounced search: returns a wrapper that postpones `fn` until
 * `delay` ms pass without another call. The wrapper exposes `cancel` so
 * unmounting components never set state from a stale timer.
 */
export function debouncedSearch<A extends unknown[]>(
  fn: (...args: A) => void | Promise<unknown>,
  delay = 300,
): ((...args: A) => void) & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null
  const wrapped = (...args: A): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void fn(...args)
    }, Math.max(0, delay))
  }
  wrapped.cancel = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }
  return wrapped
}
