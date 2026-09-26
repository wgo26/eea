'use client'

import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { type AdminNavItem, type SidebarKey } from './nav-items'
import { useLocaleFromPath } from '@/components/site-header'

/**
 * Quick actions (AppShell).
 *
 * Starting work used to require knowing the command palette did it: the "start
 * something" destinations lived behind ⌘K, invisible to anyone who had never
 * discovered the shortcut and unreachable by mouse on a shared ops workstation.
 * This promotes them to one visible control, and puts the recent-destinations
 * store — previously only rendered in the expanded sidebar — to use beside it.
 *
 * Gating is the nav, not a role test: an action appears only when its
 * destination is in the viewer's own capability-filtered entries, so a moderator
 * is never offered an emergency broadcast they cannot send.
 *
 * Deliberately NOT here: `?create=new` deep-links for polls and fundraisers.
 * Only the content screen implements that parameter (see
 * `app/[locale]/(app)/admin/content/page.tsx`); inventing equivalents would add
 * query params the pages ignore and advertise a button that opens nothing.
 */

/** Where each action goes. `key` is the nav entry whose visibility gates it. */
const QUICK_ACTIONS: { key: SidebarKey; labelKey?: SidebarKey; path: string }[] = [
  { key: 'content', path: '/admin/content?create=new' },
  { key: 'moderation', path: '/admin/moderation' },
  { key: 'emergency', path: '/admin/emergency' },
  { key: 'polls', path: '/admin/polls' },
  { key: 'fundraisers', path: '/admin/fundraisers' },
]

export function AdminQuickActions({
  items,
  recents,
}: {
  /** The viewer's visible nav entries — the single source of truth for gating. */
  items: AdminNavItem[]
  /** Recently visited entries, resolved against that same visible nav. */
  recents: AdminNavItem[]
}) {
  const locale = useLocaleFromPath()
  const dict = getDictionary(locale)
  const topbar = dict.admin.topbar
  const visible = new Map(items.map((item) => [item.key, item]))

  const actions = QUICK_ACTIONS.flatMap((action) => {
    const item = visible.get(action.key)
    if (!item) return []
    return [{ id: action.key, label: item.label, href: localePath(locale, action.path), icon: item.icon }]
  })

  const [primary, ...rest] = actions
  if (!primary) return null

  const PrimaryIcon = primary.icon

  return (
    <div className="flex shrink-0 items-center">
      {/* One click for the verb the console exists to perform. */}
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex" />}>
          <Link
            href={primary.href}
            className={
              rest.length > 0
                ? 'inline-flex h-9 items-center gap-1.5 rounded-md rounded-r-none bg-primary px-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                : 'inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            }
          >
            <PrimaryIcon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="hidden xl:inline">{primary.label}</span>
            <span className="sr-only xl:hidden">{topbar.new}</span>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="bottom">{primary.label}</TooltipContent>
      </Tooltip>

      {rest.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label={topbar.quickActions}
                className="inline-flex h-9 w-7 items-center justify-center rounded-md rounded-l-none border-l border-primary-foreground/25 bg-primary text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              </button>
            }
          />
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel>{topbar.quickActions}</DropdownMenuLabel>
            {rest.map((action) => (
              <DropdownMenuItem key={action.href} render={<Link href={action.href} />}>
                <action.icon />
                {action.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{dict.admin.sidebar.recents}</DropdownMenuLabel>
            {recents.length > 0 ? (
              recents.map((item) => (
                <DropdownMenuItem key={`recent-${item.path}`} render={<Link href={item.href} />}>
                  <item.icon />
                  {item.label}
                </DropdownMenuItem>
              ))
            ) : (
              <p className="px-2 py-1 text-xs text-muted-foreground">{topbar.noRecents}</p>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
