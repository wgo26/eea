'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { useLocaleFromPath } from '@/components/site-header'
import { type AppRole } from '@/lib/auth/types'
import { type AdminRole } from '@/lib/auth/admin-roles'
import { buildAdminNavGroups } from './nav-items'
import { QUICK_ACTIONS } from './admin-quick-actions'
import { cn } from '@/lib/utils'

/**
 * Selectors that match open modal/drawer overlays (Sheet, Dialog, Drawer).
 * Base UI React renders the Portal — and therefore the overlay — only while
 * the control is open, so the presence of any of these nodes means a table
 * drawer or modal dialog is active and the FAB should step back.
 */
const MODAL_OVERLAY_SELECTOR =
  '[data-slot="sheet-overlay"], [data-slot="dialog-overlay"], [data-slot="drawer-overlay"]'

export type FabAction = {
  id: string
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  count?: number
  severity?: 'alert' | 'neutral'
}

export function AdminFloatingQuickActions({
  roles,
  adminRoles = [],
  pendingCount = 0,
  unreadNotifications = 0,
  badges = {},
}: {
  roles: AppRole[]
  adminRoles?: AdminRole[]
  pendingCount?: number
  unreadNotifications?: number
  badges?: { translations?: number; digest?: number }
}) {
  const [open, setOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [focusedIdx, setFocusedIdx] = useState(-1)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const locale = useLocaleFromPath()
  const dict = getDictionary(locale)
  const topbar = dict.admin.topbar
  // Built here (client side) rather than handed down by the admin layout: the
  // entries carry lucide icon components, which cannot cross the RSC boundary.
  const items = buildAdminNavGroups(
    locale,
    dict,
    roles,
    pendingCount,
    adminRoles,
    unreadNotifications,
    badges,
  ).flatMap((group) => group.items)
  const visible = new Map(items.map((item) => [item.key, item]))

  const actions = QUICK_ACTIONS.flatMap((action) => {
    const item = visible.get(action.key)
    if (!item) return []
    return [
      {
        id: action.key,
        label: item.label,
        href: localePath(locale, action.path),
        icon: item.icon,
        count: item.badge,
        severity: item.badgeTone,
      },
    ]
  }) satisfies FabAction[]

  // Hide the FAB when a table drawer or modal dialog opens.
  useEffect(() => {
    const check = () => setModalOpen(document.querySelector(MODAL_OVERLAY_SELECTOR) !== null)
    check()
    const interval = setInterval(check, 200)
    return () => clearInterval(interval)
  }, [])

  // Close on Escape; arrow navigation when open.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!open) return
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
        setFocusedIdx(-1)
        triggerRef.current?.focus()
        return
      }
      if (!actions.length) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusedIdx((prev) => (prev + 1) % actions.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusedIdx((prev) => (prev - 1 + actions.length) % actions.length)
      } else if (e.key === 'Home') {
        e.preventDefault()
        setFocusedIdx(0)
      } else if (e.key === 'End') {
        e.preventDefault()
        setFocusedIdx(actions.length - 1)
      }
    }
    if (open) {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, actions.length])

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
        setFocusedIdx(-1)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  if (actions.length === 0 || modalOpen) return null

  return (
    <div
      ref={menuRef}
      className="no-print fixed bottom-6 right-6 z-40 flex flex-col items-end"
      aria-label={topbar.quickActions}
    >
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-[-1] bg-background/50 backdrop-blur-xs transition-opacity duration-200',
          open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* Action items list */}
      <div
        id="admin-speed-dial-menu"
        role="menu"
        aria-orientation="vertical"
        aria-hidden={!open}
        className={cn(
          'mb-3 flex flex-col items-end gap-2.5 transition-all duration-200',
          open ? 'pointer-events-auto translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
        )}
      >
        {actions.map((action, idx) => {
          const ActionIcon = action.icon
          const isFocused = idx === focusedIdx
          return (
            <div
              key={action.id}
              role="none"
              className={cn('flex items-center gap-2.5 transition-all duration-200', open ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0')}
              style={{ transitionDelay: open ? `${(actions.length - 1 - idx) * 30}ms` : '0ms' }}
            >
              <Link
                href={action.href}
                role="menuitem"
                tabIndex={open ? (isFocused ? 0 : -1) : -1}
                onFocus={() => setFocusedIdx(idx)}
                onClick={() => {
                  setOpen(false)
                  setFocusedIdx(-1)
                }}
                className="group flex items-center gap-2 rounded-full border border-border/80 bg-card/95 py-1.5 pl-3.5 pr-2.5 text-xs font-semibold text-foreground shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/85 transition-all hover:border-primary/50 hover:bg-card hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span>{action.label}</span>
                {typeof action.count === 'number' && action.count > 0 && (
                  <span
                    className={cn(
                      'inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-xs font-bold leading-none',
                      action.severity === 'alert' ? 'bg-destructive text-destructive-foreground' : 'bg-primary/15 text-primary'
                    )}
                  >
                    {action.count}
                  </span>
                )}
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <ActionIcon className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </Link>
            </div>
          )
        })}
      </div>

      {/* FAB Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setOpen((prev) => !prev)
          if (!open) setFocusedIdx(-1)
        }}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls="admin-speed-dial-menu"
        aria-label={open ? topbar.quickActionsClose : topbar.quickActionsOpen}
        title={open ? topbar.quickActionsClose : topbar.quickActionsOpen}
        className={cn(
          'group relative flex h-12 w-12 items-center justify-center rounded-full shadow-xl transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          open
            ? 'bg-muted-foreground text-background hover:bg-muted-foreground/90 rotate-90 scale-95'
            : 'bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-105 active:scale-95'
        )}
      >
        <Plus className={cn('h-5 w-5 transition-transform duration-300', open && 'rotate-45')} aria-hidden="true" />
      </button>
    </div>
  )
}
