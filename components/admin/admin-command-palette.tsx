'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CornerDownLeft, Search } from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'
import { adminGlobalSearch, type AdminSearchResults } from '@/lib/admin/actions/content'
import { localePath } from '@/lib/i18n/urls'
import { getDictionary } from '@/lib/i18n'
import { useLocaleFromPath } from '@/components/site-header'
import { type AdminNavGroup, type SidebarKey } from './nav-items'

/**
 * Keyboard-first shortcuts (Phase A): the subset of the nav that starts work
 * rather than merely navigating. `?create=new` auto-opens the content dialog;
 * the others land on pages whose primary form is already above the fold. Each
 * entry keys off a nav item, so visibility follows the same capability filter
 * as the sidebar — a contributor never sees the emergency broadcast.
 */
const QUICK_ACTIONS: { key: SidebarKey; href: string }[] = [
  { key: 'content', href: '/admin/content?create=new' },
  { key: 'moderation', href: '/admin/moderation' },
  { key: 'emergency', href: '/admin/emergency' },
]

/**
 * Staff command palette (Cmd/Ctrl+K): capability-filtered quick actions, then
 * deep-link jumps grouped by operational domain — one CommandGroup per domain,
 * so results carry the same mental map as the sidebar — plus live content/user
 * search (top matches link to the edit dialog / user detail). Mounted in the
 * admin topbar, so every command-center page gets it.
 */
export function AdminCommandPalette({ groups }: { groups: AdminNavGroup[] }) {
  const locale = useLocaleFromPath()
  const dict = getDictionary(locale)
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AdminSearchResults>({ content: [], users: [], locations: [], media: [], auditEvents: [] })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    const q = query.trim()
    if (q.length < 2) return
    timer.current = setTimeout(async () => {
      setResults(await adminGlobalSearch(q))
    }, 250)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [query])

  function go(href: string) {
    setOpen(false)
    setQuery('')
    router.push(href)
  }

  // Stale results from a longer query never show for a short one.
  const liveResults = query.trim().length >= 2 ? results : { content: [], users: [], locations: [], media: [], auditEvents: [] }
  const common = dict.admin.common

  const visibleKeys = new Set(groups.flatMap((group) => group.items.map((item) => item.key)))
  const quickActions = QUICK_ACTIONS.flatMap((action) =>
    visibleKeys.has(action.key)
      ? [{ label: dict.admin.sidebar[action.key], href: localePath(locale, action.href) }]
      : [],
  )

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={common.search}
        title={common.search}
        className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-muted/50 px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:w-[220px] lg:w-[280px]"
      >
        <Search className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="hidden flex-1 truncate text-left md:inline">{common.searchPlaceholder}</span>
        <kbd className="ml-auto hidden rounded border border-border bg-background px-1 py-0.5 text-xs font-semibold lg:inline">⌘K</kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen} title={common.search} description={common.search} className="sm:max-w-xl">
        <CommandInput placeholder={common.search} value={query} onValueChange={setQuery} />
        <CommandList>
          <CommandEmpty>{common.noResults}</CommandEmpty>
          {quickActions.length > 0 && (
            <CommandGroup heading={dict.admin.dashboard.quickActions}>
              {quickActions.map((action) => (
                <CommandItem key={action.href} value={`action ${action.label}`} onSelect={() => go(action.href)}>
                  {action.label}
                  <CommandShortcut><CornerDownLeft className="h-3 w-3" /></CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {groups.map((group) => (
            <CommandGroup key={group.domain} heading={group.label}>
              {group.items.map((item) => (
                <CommandItem
                  key={item.path}
                  value={`${item.label} ${item.path}`}
                  onSelect={() => go(item.href)}
                >
                  <item.icon />
                  {item.label}
                  {item.badge != null && item.badge > 0 && (
                    <span className="ml-auto rounded-full bg-destructive px-1.5 text-xs font-medium text-destructive-foreground">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
          <CommandSeparator />
          {liveResults.content.length > 0 ? (
            <CommandGroup heading={dict.admin.sidebar.content}>
              {liveResults.content.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${c.title} ${c.id}`}
                  onSelect={() => go(`${localePath(locale, '/admin/content')}?edit=${c.id}`)}
                >
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{c.status}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {liveResults.users.length > 0 ? (
            <CommandGroup heading={dict.admin.sidebar.users}>
              {liveResults.users.map((u) => (
                <CommandItem
                  key={u.id}
                  value={`${u.name} ${u.email}`}
                  onSelect={() => go(localePath(locale, `/admin/users/${u.id}`))}
                >
                  <span className="min-w-0 flex-1 truncate">{u.name}</span>
                  <span className="shrink-0 truncate text-xs text-muted-foreground">{u.email}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {liveResults.locations.length > 0 ? (
            <CommandGroup heading={common.searchGroupLocations}>
              {liveResults.locations.map((l) => (
                <CommandItem
                  key={l.id}
                  value={`${l.name} ${l.slug}`}
                  onSelect={() => go(`${localePath(locale, '/admin/taxonomy')}?search=${encodeURIComponent(l.name)}`)}
                >
                  <span className="min-w-0 flex-1 truncate">{l.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {liveResults.media.length > 0 ? (
            <CommandGroup heading={common.searchGroupMedia}>
              {liveResults.media.map((m) => (
                <CommandItem
                  key={m.id}
                  value={`${m.caption} ${m.id}`}
                  onSelect={() => go(`${localePath(locale, '/admin/content')}?media=${m.id}`)}
                >
                  <span className="min-w-0 flex-1 truncate">{m.caption}</span>
                  <span className="shrink-0 truncate text-xs text-muted-foreground">{m.mimeType}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {liveResults.auditEvents.length > 0 ? (
            <CommandGroup heading={common.searchGroupAudit}>
              {liveResults.auditEvents.map((a) => (
                <CommandItem
                  key={a.id}
                  value={`${a.action} ${a.resourceType}`}
                  onSelect={() => go(`${localePath(locale, '/admin/audit-log')}?search=${encodeURIComponent(a.action)}`)}
                >
                  <span className="min-w-0 flex-1 truncate">{a.action}</span>
                  <span className="shrink-0 truncate text-xs text-muted-foreground">{a.resourceType}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
        </CommandList>
      </CommandDialog>
    </>
  )
}
