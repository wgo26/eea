'use client'

import { ToastProvider } from './toast'
import { useTableDensity } from './nav-preferences'

/**
 * Admin client roots. Hosts the toast system AND the table-density attribute:
 * `data-table-density` on this wrapper rescales every DataTable's cell
 * padding through the `--table-pad-*` variables (app/globals.css), so the
 * topbar toggle is one control for the whole command center. A real box is
 * used (not `display: contents`) — custom properties only inherit through
 * boxes that exist, so the attribute must sit on a rendered element.
 */
export function AdminClientWrapper({ children }: { children: React.ReactNode }) {
  const { density } = useTableDensity()
  return (
    <ToastProvider>
      <div data-table-density={density}>
        {children}
      </div>
    </ToastProvider>
  )
}
