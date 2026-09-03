'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Globe } from 'lucide-react'
import { locales, LOCALE_COOKIE, type Locale } from '@/lib/i18n'

/**
 * DOM side effects live at module scope: direct writes to globals such as
 * `document` inside a component are rejected by react-hooks/immutability.
 */

/** Persists the visitor's language choice (read back by proxy.ts and the auth callback). */
function setLocaleCookie(value: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`
}

/** Updates <html lang> immediately so it matches the pending navigation. */
function setHtmlLang(value: Locale) {
  document.documentElement.lang = value
}

/**
 * Language switcher: swaps the locale segment of the current path in place —
 * same page, same position in the site, query string preserved (search,
 * filters, `next`) — so switching language never 404s and never drops
 * context (checklist items 1 + 12). Every user-facing route exists under
 * both locales, so the target is guaranteed to resolve.
 */
export function LanguageSwitcher({ locale }: { locale: Locale }) {
  const router = useRouter()
  const pathname = usePathname() ?? '/'

  function switchTo(next: Locale) {
    if (next === locale) return
    // filter(Boolean) drops the empty strings produced by leading/trailing
    // slashes, so segments[0] is the first real path segment ("/" becomes []).
    const segments = pathname.split('/').filter(Boolean)
    if ((locales as readonly string[]).includes(segments[0])) {
      segments[0] = next
    } else {
      segments.unshift(next)
    }
    // Read the query string at click time (avoids useSearchParams, which
    // would force a suspense boundary on statically prerendered pages).
    const query = window.location.search.replace(/^\?/, '')
    const target = `/${segments.join('/')}${query ? `?${query}` : ''}`
    setLocaleCookie(next)
    setHtmlLang(next)
    router.push(target)
  }

  return (
    <div
      role="group"
      aria-label="Language"
      className="flex items-center gap-0.5 rounded-full border border-border bg-background/60 p-0.5"
    >
      <Globe className="ml-1.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      {locales.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => switchTo(l)}
          aria-pressed={l === locale}
          title={l === 'en' ? 'English' : 'Français'}
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide transition-colors ${
            l === locale
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
