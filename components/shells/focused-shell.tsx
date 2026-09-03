import type { ReactNode } from 'react'
import Link from 'next/link'
import { Eye } from 'lucide-react'
import { getDictionary } from '@/lib/i18n'
import { getRequestLocale } from '@/lib/i18n/server'
import { localePath } from '@/lib/i18n/urls'
import { BackButton } from './back-button'

/**
 * FocusedShell (checklist items 2 + 3) — minimal chrome for login, signup,
 * password reset, submit forms and confirmation screens. No public
 * header/footer, no app nav; exactly one exit affordance (the back button)
 * plus a small inert brand mark for orientation.
 *
 * Fallback destination rule: the localized homepage. Flows with a stronger
 * contextual exit (e.g. submit forms → their section index) keep their
 * in-page back link; the shell's control is the safety net that guarantees
 * no focused screen dead-ends.
 */
export async function FocusedShell({ children }: { children: ReactNode }) {
  const locale = await getRequestLocale()
  const dict = getDictionary(locale)

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border/60 bg-background">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-3 px-4 md:px-6">
          <BackButton fallback={localePath(locale, '/')} label={dict.system.back} />
          <Link
            href={localePath(locale, '/')}
            className="flex items-center gap-2 rounded-md px-1 py-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Eye className="h-4 w-4" aria-hidden />
            </span>
            <span className="hidden sm:inline">Eagle Eye Africa</span>
          </Link>
        </div>
      </header>
      <main className="flex flex-1 flex-col items-center px-4 py-10 md:py-14">
        {children}
      </main>
    </div>
  )
}