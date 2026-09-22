'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { adminGlobalSearch, type AdminSearchResults } from '@/lib/admin/actions'
import { localePath } from '@/lib/i18n/urls'
import { getDictionary } from '@/lib/i18n'
import { useLocaleFromPath } from '@/components/site-header'
import type { AdminNavItem } from './nav-items'

/**
 * Staff command palette (Cmd/Ctrl+K): jump to admin sections plus live
 * content/user search (top matches link to the edit drawer / user detail).
 * Mounted in the admin topbar — every command-center page gets it.
 */
export function AdminCommandPalette({ items }: { items: AdminNavItem[] }) {
  const locale = useLocaleFromPath()
  const dict = getDictionary(locale)
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AdminSearchResults>({ content: [], users: [] })
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

  const matchingSections = items.filter((item) =>
    item.label.toLowerCase().includes(query.trim().toLowerCase()),
  )
  // Stale results from a longer query never show for a short one.
  const liveResults = query.trim().length >= 2 ? results : { content: [], users: [] }
  const common = dict.admin.common

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={common.search}
        title={common.search}
        className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-muted/50 px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Search className="h-3.5 w-3.5" aria-hidden />
        <kbd className="hidden rounded border border-border bg-background px-1 py-0.5 text-xs font-semibold sm:inline">
          ⌘K
        </kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen} title={common.search} description={common.search}>
        <CommandInput
          placeholder={common.search}
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>{common.noResults}</CommandEmpty>
          <CommandGroup heading={dict.admin.sidebar.dashboard}>
            {(query.trim() ? matchingSections : items).map((item) => (
              <CommandItem
                key={item.path}
                value={`${item.label} ${item.path}`}
                onSelect={() => go(item.href)}
              >
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
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
        </CommandList>
      </CommandDialog>
    </>
  )
}
