import { getDictionary } from '@/lib/i18n'
import type { Locale } from '@/lib/i18n'

/**
 * Keyboard bypass into the page body (plan Phase 6).
 *
 * Every AppShell renders a chrome region before `<main>` — the admin shell puts
 * a sidebar, a topbar with six controls and a state banner in the tab order, the
 * account shell a topbar. Without a bypass, a keyboard user tabs through all of
 * it before reaching the content they came for, on every single page.
 *
 * The public shell already had one inline (`components/shells/public-shell.tsx`).
 * It is factored out here rather than duplicated because the two admin/account
 * trees need the identical behaviour and the identical `#main-content` target —
 * three copies is how one of them drifts. The id is a contract with the layouts
 * that render `<main id="main-content" tabIndex={-1}>`.
 *
 * WHY `tabIndex={-1}` MATTERS ON THE TARGET: a `sr-only` link that moves focus to
 * a `<main>` with no tabindex leaves focus on the link in several browser/AT
 * combinations, so the next Tab returns to the chrome it just skipped. The `-1`
 * makes the region programmatically focusable without adding it to the sequence.
 *
 * Server component with no hooks: the shell already knows its locale, so this
 * costs nothing and keeps the string on the server side of the boundary
 * (scripts/verify-client-dictionary.mjs forbids every-page client chrome from
 * runtime-importing the full dictionary).
 */
export function SkipLink({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale)
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
    >
      {dict.common.skipToContent}
    </a>
  )
}
