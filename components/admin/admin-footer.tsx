import Link from 'next/link'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import type { Locale } from '@/lib/i18n'
import { getEnvironmentLabel } from '@/lib/config/env'
import { fillCopy } from '@/lib/admin/format'
import { classifyAssurance, type SessionAssurance } from '@/lib/admin/session-assurance'
import { cn } from '@/lib/utils'

/**
 * Build identity, so an operator quoting a problem can name the deploy they are
 * looking at. Same expression /api/health and lib/observability/metrics.ts
 * report — kept as a literal here rather than imported from either, because those
 * two read it per-request inside a metrics snapshot and this needs a constant.
 * `APP_VERSION` is set by the deploy (deploy/hostinger-business.md); a build with
 * no version stamped says so instead of pretending to be one.
 */
const APP_BUILD =
  process.env.APP_VERSION ?? process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev'

/**
 * Admin footer (plan Phase 6) — a 32px strip of facts you would otherwise have
 * to go and fetch.
 *
 * The rule for what earns a slot: the footer says the thing the docs currently
 * tell you to go and look up somewhere else. Four of the six files in
 * docs/system/* end by sending the operator to `/api/ready`, the Storage tab or
 * the automations strip to discover that a scheduled job may not have run; the
 * scheduler row collapses that to a glance on every screen. Audit retention is
 * read from the same `AUDIT_RETENTION_DAYS` the nightly purge honours
 * (app/api/cron/db-maintenance/route.ts), because docs/system/audit.md describes
 * a hard delete whose window nothing in the UI stated.
 *
 * Not here, deliberately: marketing links, legal links, a newsletter form.
 * `SiteFooter` owns those and this is a console, not a brochure — a second
 * navigational footer would only compete with the sidebar. Nothing here is a
 * control either: every row is a read-only fact or a link to the screen that
 * owns it, so the strip never becomes a place to *do* something.
 *
 * Server component. The one value that could leak between operators — session
 * assurance — is resolved per request by the layout and passed in, never read
 * here, so this component cannot become the reason a page is dynamic.
 */
export function AdminFooter({
  locale,
  assurance,
  schedulerIssueCount,
  canSeeScheduler,
  retentionDays,
}: {
  locale: Locale
  /** This session's 2FA standing; null when it could not be determined. */
  assurance: SessionAssurance | null
  /** Jobs not reporting `ok`, already capability-filtered by the shell. */
  schedulerIssueCount: number
  /** Whether the viewer may see scheduler detail at all (chief-only rows). */
  canSeeScheduler: boolean
  /** `AUDIT_RETENTION_DAYS`, as the nightly purge reads it. */
  retentionDays: number
}) {
  const dict = getDictionary(locale)
  const t = dict.admin.footer
  const env = getEnvironmentLabel()

  const rows: string[] = [env.name, APP_BUILD]

  // The three named states each say something the operator can act on; an
  // undeterminable assurance is not a fact about their session, so the row is
  // omitted rather than reporting the failure as a standing.
  const assuranceLevel = classifyAssurance(assurance)
  if (assuranceLevel !== 'unknown') rows.push(t.assurance[assuranceLevel])

  if (canSeeScheduler) {
    rows.push(
      schedulerIssueCount > 0
        ? fillCopy(t.schedulerFailing, { count: schedulerIssueCount })
        : t.schedulerHealthy,
    )
  }

  rows.push(fillCopy(t.auditRetention, { days: retentionDays }))

  return (
    <footer className="mt-auto border-t border-border/60 px-4 py-1.5 md:px-6 lg:px-8">
      {/* min-h-[32px] holds the strip's height exactly, so the row never grows a
          second line on a narrow viewport: `truncate` + `overflow-hidden` let the
          least important facts go first instead of re-flowing the shell. */}
      <div className="flex min-h-[32px] items-center gap-3 overflow-hidden text-xs text-muted-foreground">
        <ul className="flex min-w-0 items-center gap-3 truncate">
          {rows.map((row, i) => (
            <li key={`${i}:${row}`} className="flex min-w-0 items-center gap-3">
              {i > 0 && (
                <span aria-hidden className="shrink-0 text-muted-foreground/40">
                  ·
                </span>
              )}
              <span className={cn('truncate', i === 0 && 'font-medium tracking-wide')}>{row}</span>
            </li>
          ))}
        </ul>
        <Link
          href={localePath(locale, '/admin/dashboard')}
          className="ml-auto shrink-0 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t.statusSource}
        </Link>
      </div>
    </footer>
  )
}


