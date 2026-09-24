import { Fragment } from 'react'
import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { requireCapability } from '@/lib/auth/guards'
import {
  SECURITY_CATEGORIES,
  isSecurityCategory,
  getSecurityEvents,
  getSecurityCounts,
  getFailedLoginAttempts,
  getSuspiciousActivity,
  getCredentialChanges,
  REPEAT_LOGIN_THRESHOLD,
  LARGE_OPERATION_THRESHOLD,
  type SecurityCategory,
  type SecurityEventRow,
} from '@/lib/admin/queries'
import { PageHeader } from '@/components/admin/page-header'
import { StatCard, StatGrid } from '@/components/admin/stat-card'
import { Tabs } from '@/components/admin/tabs'
import { DataTable } from '@/components/admin/data-table'
import { Pager } from '@/components/admin/pager'
import { EmptyState } from '@/components/admin/empty-state'
import { fillCopy, formatDateTime, formatRelative } from '@/lib/admin/format'

/**
 * Security monitoring (plan Phase 4.6, spec §53).
 *
 * One trail, two lenses: the audit log shows everything, this page shows the
 * security-relevant slice — repeated failed sign-ins, privilege escalation,
 * bulk/large operations and the credential lifecycle. Every number here comes
 * from `lib/admin/queries/security.ts`; the page only formats.
 */

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.security.title }
}

const PAGE_SIZE = 50
const LOGIN_WINDOW_DAYS = 7
const ACTIVITY_WINDOW_DAYS = 30
const CREDENTIAL_LIMIT = 12

/** Failed sign-ins are never a neutral signal — a fixed red ramp, not a brand tone. */
const HEAT_RGB = '220, 38, 38'

function heatStyle(count: number, max: number) {
  if (count <= 0) return undefined
  const ratio = max > 0 ? count / max : 1
  return { backgroundColor: `rgba(${HEAT_RGB}, ${(0.15 + ratio * 0.7).toFixed(2)})` }
}

const humanize = (value: string) => value.replace(/[:_]/g, ' ')

type ListCopy = { system: string; deletedUser: string; selection: string }

function actorNameOf(name: string | null, id: string | null, copy: ListCopy): string {
  return name ?? (id ? copy.deletedUser : copy.system)
}

/** The scalar metadata worth showing inline — bounded, never free-form JSON. */
function detailBitsOf(row: SecurityEventRow, selectionTemplate: string): string[] {
  const meta = row.metadata ?? {}
  const bits: string[] = []
  if (typeof meta.selection === 'number') {
    bits.push(fillCopy(selectionTemplate, { count: meta.selection }))
  }
  for (const key of ['reason', 'role', 'status', 'provider']) {
    const value = meta[key]
    if (typeof value === 'string' && value.length > 0) bits.push(humanize(value))
  }
  return bits
}

function EventList({
  rows,
  empty,
  showTiming = false,
  locale,
  copy,
}: {
  rows: SecurityEventRow[]
  empty: string
  showTiming?: boolean
  locale: 'en' | 'fr'
  copy: ListCopy
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground">
        {empty}
      </p>
    )
  }
  return (
    <ul className="divide-y divide-border">
      {rows.map((row) => {
        const bits = detailBitsOf(row, copy.selection)
        return (
          <li key={row.id} className="flex items-start justify-between gap-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{humanize(row.action)}</div>
              <div className="truncate text-xs text-muted-foreground">
                {actorNameOf(row.actorName, row.actorId, copy)}
                {row.actorRole ? ` · ${humanize(row.actorRole)}` : ''}
                {` · ${humanize(row.resourceType)}`}
              </div>
              {bits.length > 0 && (
                <div className="truncate text-xs text-muted-foreground/80">{bits.join(' · ')}</div>
              )}
            </div>
            {showTiming && (
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatRelative(row.createdAt, locale)}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

type SearchParams = {
  category?: string
  page?: string
  from?: string
  to?: string
}

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireCapability('viewAuditLog', '/admin/security')
  const locale = await getRequestLocale()
  const dict = getDictionary(locale)
  const t = dict.admin.security
  const common = dict.admin.common

  const params = await searchParams
  // Unknown categories fall back to "all" rather than erroring — a stale tab
  // link from a renamed category must not become a dead end.
  const category: SecurityCategory | 'all' = isSecurityCategory(params.category)
    ? params.category
    : 'all'
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1)

  const [events, counts, logins, suspicious, credentialChanges] = await Promise.all([
    getSecurityEvents({ limit: PAGE_SIZE, page, category, from: params.from, to: params.to }),
    getSecurityCounts(),
    getFailedLoginAttempts({ windowDays: LOGIN_WINDOW_DAYS }),
    getSuspiciousActivity({ windowDays: ACTIVITY_WINDOW_DAYS }),
    getCredentialChanges({ limit: CREDENTIAL_LIMIT }),
  ])

  const hrefFor = (next: { category?: string; page?: number }) => {
    const sp = new URLSearchParams()
    const nextCategory = next.category ?? category
    if (nextCategory !== 'all') sp.set('category', nextCategory)
    if (params.from) sp.set('from', params.from)
    if (params.to) sp.set('to', params.to)
    const nextPage = next.page ?? 1
    if (nextPage > 1) sp.set('page', String(nextPage))
    const qs = sp.toString()
    return `${localePath(locale, '/admin/security')}${qs ? `?${qs}` : ''}`
  }

  const categoryLabel: Record<SecurityCategory, string> = {
    auth: t.catAuth,
    permissions: t.catPermissions,
    credentials: t.catCredentials,
    bulk: t.catBulk,
    state: t.catState,
  }

  const listCopy: ListCopy = {
    system: dict.admin.audit.system,
    deletedUser: dict.admin.audit.deletedUser,
    selection: t.selection,
  }

  const heat = new Map(logins.cells.map((cell) => [`${cell.day}-${cell.hour}`, cell.count]))
  const heatMax = Math.max(0, ...logins.cells.map((cell) => cell.count))
  const dayLabels = [t.daySun, t.dayMon, t.dayTue, t.dayWed, t.dayThu, t.dayFri, t.daySat]

  const selectCls = 'rounded-md border border-border bg-background px-2.5 py-1.5 text-xs'

  return (
    <div className="space-y-5">
      <PageHeader title={t.title} description={t.description} />

      <StatGrid>
        <StatCard label={t.statEvents} value={counts.total} hint={t.statEventsHint} />
        <StatCard
          label={t.statFailed}
          value={logins.total}
          tone={logins.total > 0 ? 'amber' : 'default'}
          hint={fillCopy(t.statFailedHint, { days: logins.windowDays })}
        />
        <StatCard
          label={t.statRepeats}
          value={logins.repeated.length}
          tone={logins.repeated.length > 0 ? 'amber' : 'default'}
          hint={fillCopy(t.statRepeatsHint, { threshold: REPEAT_LOGIN_THRESHOLD })}
        />
        <StatCard
          label={t.statBulk}
          value={suspicious.bulk.length}
          hint={fillCopy(t.statBulkHint, { days: suspicious.windowDays })}
        />
        <StatCard
          label={t.statLarge}
          value={suspicious.large.length}
          tone={suspicious.large.length > 0 ? 'red' : 'default'}
          hint={fillCopy(t.statLargeHint, { threshold: LARGE_OPERATION_THRESHOLD })}
        />
        <StatCard
          label={t.statEscalation}
          value={suspicious.escalation.length}
          hint={t.statEscalationHint}
        />
        <StatCard
          label={t.statCritical}
          value={suspicious.critical.length}
          tone={suspicious.critical.length > 0 ? 'red' : 'default'}
          hint={t.statCriticalHint}
        />
        <StatCard label={t.statCredentials} value={credentialChanges.length} hint={t.statCredentialsHint} />
      </StatGrid>

      <section className="space-y-4 rounded-lg border border-border bg-card p-4">
        <div>
          <h2 className="text-sm font-semibold">{t.failedHeading}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {fillCopy(t.failedBody, { days: logins.windowDays })}
          </p>
        </div>

        {logins.total === 0 ? (
          <EmptyState message={t.noFailures} />
        ) : (
          <>
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t.heatHeading}
              </h3>
              <div className="mt-2 overflow-x-auto">
                <div
                  role="img"
                  aria-label={t.heatHeading}
                  className="grid min-w-[560px] grid-cols-[2.25rem_repeat(24,minmax(0,1fr))] gap-[3px]"
                >
                  <span />
                  {Array.from({ length: 24 }, (_, hour) => (
                    <span key={`h-${hour}`} className="text-center text-xs tabular-nums text-muted-foreground">
                      {hour % 3 === 0 ? String(hour).padStart(2, '0') : ''}
                    </span>
                  ))}
                  {dayLabels.map((label, day) => (
                    <Fragment key={label}>
                      <span className="text-xs text-muted-foreground leading-5">{label}</span>
                      {Array.from({ length: 24 }, (_, hour) => {
                        const count = heat.get(`${day}-${hour}`) ?? 0
                        return (
                          <span
                            key={`${day}-${hour}`}
                            title={fillCopy(t.heatCellTitle, {
                              day: label,
                              hour: `${String(hour).padStart(2, '0')}:00`,
                              count,
                            })}
                            style={heatStyle(count, heatMax)}
                            className={
                              count > 0
                                ? 'h-5 rounded-[3px]'
                                : 'h-5 rounded-[3px] border border-border/60 bg-muted/40'
                            }
                          />
                        )
                      })}
                    </Fragment>
                  ))}
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">{t.heatHint}</p>
                <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <span>{t.heatLess}</span>
                  {[0.15, 0.35, 0.55, 0.8].map((alpha) => (
                    <span
                      key={alpha}
                      className="h-3 w-3 rounded-[3px]"
                      style={{ backgroundColor: `rgba(${HEAT_RGB}, ${alpha})` }}
                    />
                  ))}
                  <span>{t.heatMore}</span>
                </div>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <div>
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t.byIdentityHeading}
                </h3>
                {logins.topIdentifiers.length === 0 ? (
                  <p className="mt-1.5 text-xs text-muted-foreground">{t.noFailures}</p>
                ) : (
                  <ul className="mt-1.5 divide-y divide-border">
                    {logins.topIdentifiers.map((stat) => (
                      <li key={stat.identifier} className="flex items-center justify-between gap-3 py-1.5">
                        <span className="truncate font-mono text-xs" title={stat.identifier}>
                          {stat.identifier}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {stat.count} {t.colAttempts.toLowerCase()} · {stat.blocked}{' '}
                          {t.colRefused.toLowerCase()} · {formatRelative(stat.lastAt, locale)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t.byIpHeading}
                </h3>
                {logins.topIps.length === 0 ? (
                  <p className="mt-1.5 text-xs text-muted-foreground">{t.noFailures}</p>
                ) : (
                  <ul className="mt-1.5 divide-y divide-border">
                    {logins.topIps.map((stat) => (
                      <li key={stat.ip} className="flex items-center justify-between gap-3 py-1.5">
                        <span className="truncate font-mono text-xs">{stat.ip}</span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {stat.count} {t.colAttempts.toLowerCase()} · {stat.blocked}{' '}
                          {t.colRefused.toLowerCase()}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t.repeatedHeading}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {fillCopy(t.repeatHint, { threshold: REPEAT_LOGIN_THRESHOLD })}
              </p>
              {logins.repeated.length === 0 ? (
                <p className="mt-1.5 text-xs text-muted-foreground">{t.noRepeats}</p>
              ) : (
                <ul className="mt-1.5 divide-y divide-border">
                  {logins.repeated.map((stat) => (
                    <li key={stat.identifier} className="flex items-center justify-between gap-3 py-1.5">
                      <span className="truncate font-mono text-xs" title={stat.identifier}>
                        {stat.identifier}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {stat.count} {t.colAttempts.toLowerCase()} · {stat.blocked}{' '}
                        {t.colRefused.toLowerCase()} · {formatRelative(stat.lastAt, locale)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-card p-4">
        <div>
          <h2 className="text-sm font-semibold">{t.suspiciousHeading}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {fillCopy(t.suspiciousBody, { days: suspicious.windowDays })}
          </p>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t.largeHeading}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {fillCopy(t.largeHint, { threshold: LARGE_OPERATION_THRESHOLD })}
            </p>
            <div className="mt-1.5">
              <EventList rows={suspicious.large} empty={t.noLarge} showTiming locale={locale} copy={listCopy} />
            </div>
          </div>
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t.escalationHeading}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{t.escalationHint}</p>
            <div className="mt-1.5">
              <EventList rows={suspicious.escalation} empty={t.noEscalation} showTiming locale={locale} copy={listCopy} />
            </div>
          </div>
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t.criticalHeading}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{t.criticalHint}</p>
            <div className="mt-1.5">
              <EventList rows={suspicious.critical} empty={t.noCritical} showTiming locale={locale} copy={listCopy} />
            </div>
          </div>
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t.bulkHeading}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{t.bulkHint}</p>
            <div className="mt-1.5">
              <EventList rows={suspicious.bulk} empty={t.noBulk} showTiming locale={locale} copy={listCopy} />
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div>
          <h2 className="text-sm font-semibold">{t.credentialsHeading}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t.credentialsBody}</p>
        </div>
        <DataTable
          rows={credentialChanges}
          rowKey={(row) => row.id}
          emptyMessage={t.noCredentialChanges}
          columns={[
            {
              key: 'credential',
              header: t.colCredential,
              render: (row) => (
                <span className="text-sm font-medium">{row.credentialName ?? row.credentialId.slice(0, 8)}</span>
              ),
            },
            {
              key: 'provider',
              header: t.colProvider,
              render: (row) => (
                <span className="text-xs text-muted-foreground">{row.provider ?? '—'}</span>
              ),
            },
            {
              key: 'change',
              header: t.colChange,
              render: (row) => (
                <span className="inline-flex items-center whitespace-nowrap rounded bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                  {humanize(row.action)}
                </span>
              ),
            },
            {
              key: 'actor',
              header: t.colActor,
              render: (row) => (
                <span className="block max-w-[140px] truncate text-xs">
                  {actorNameOf(row.actorName, row.actorId, listCopy)}
                </span>
              ),
            },
            {
              key: 'when',
              header: t.colWhen,
              render: (row) => (
                <div className="whitespace-nowrap text-xs">
                  <div className="font-medium">{formatDateTime(row.createdAt, locale)}</div>
                  <div className="text-muted-foreground">{formatRelative(row.createdAt, locale)}</div>
                </div>
              ),
            },
          ]}
        />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">{t.timelineHeading}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t.timelineBody}</p>
        </div>

        <Tabs
          tabs={[
            { key: 'all', label: t.tabAll, count: counts.total },
            ...SECURITY_CATEGORIES.map((key) => ({
              key,
              label: categoryLabel[key],
              count: counts[key],
            })),
          ]}
          active={category}
          hrefFor={(key) => hrefFor({ category: key })}
        />

        <form method="GET" className="flex flex-wrap items-center gap-1.5">
          {category !== 'all' && <input type="hidden" name="category" value={category} />}
          <input
            type="date"
            name="from"
            defaultValue={params.from ?? ''}
            aria-label={t.fromLabel}
            className={selectCls}
          />
          <input
            type="date"
            name="to"
            defaultValue={params.to ?? ''}
            aria-label={t.toLabel}
            className={selectCls}
          />
          <button type="submit" className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium">
            {t.filter}
          </button>
        </form>

        {events.rows.length === 0 ? (
          <EmptyState message={t.empty} />
        ) : (
          <DataTable
            rows={events.rows}
            rowKey={(row) => row.id}
            emptyMessage={t.empty}
            columns={[
              {
                key: 'when',
                header: t.colWhen,
                render: (row) => (
                  <div className="whitespace-nowrap text-xs">
                    <div className="font-medium">{formatDateTime(row.createdAt, locale)}</div>
                    <div className="text-muted-foreground">{formatRelative(row.createdAt, locale)}</div>
                  </div>
                ),
                className: 'whitespace-nowrap',
              },
              {
                key: 'action',
                header: t.colAction,
                render: (row) => (
                  <div className="flex flex-col items-start gap-1">
                    <span
                      className="inline-flex items-center whitespace-nowrap rounded bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
                      title={row.action}
                    >
                      {humanize(row.action)}
                    </span>
                    {row.category && (
                      <span className="inline-flex items-center whitespace-nowrap rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                        {categoryLabel[row.category]}
                      </span>
                    )}
                  </div>
                ),
                className: 'whitespace-nowrap',
              },
              {
                key: 'actor',
                header: t.colActor,
                render: (row) => (
                  <div className="min-w-[120px]">
                    <div className="truncate text-xs">{actorNameOf(row.actorName, row.actorId, listCopy)}</div>
                    {row.actorRole && (
                      <div className="truncate text-xs text-muted-foreground">{humanize(row.actorRole)}</div>
                    )}
                  </div>
                ),
              },
              {
                key: 'resource',
                header: t.colResource,
                render: (row) => (
                  <div className="min-w-[120px] max-w-[240px]">
                    <div className="truncate text-xs text-muted-foreground">{humanize(row.resourceType)}</div>
                    {row.resourceId && (
                      <div className="truncate font-mono text-xs text-muted-foreground/70" title={row.resourceId}>
                        {row.resourceId.slice(0, 8)}
                      </div>
                    )}
                  </div>
                ),
              },
              {
                key: 'details',
                header: common.viewDetails,
                render: (row) => {
                  const bits = detailBitsOf(row, t.selection)
                  return (
                    <span className="block max-w-[220px] truncate text-xs text-muted-foreground">
                      {bits.length > 0 ? bits.join(' · ') : '—'}
                    </span>
                  )
                },
                headerClassName: 'hidden xl:table-cell',
                className: 'hidden xl:table-cell',
              },
            ]}
          />
        )}

        <Pager
          page={page}
          pageSize={PAGE_SIZE}
          total={events.total}
          hrefFor={(p) => hrefFor({ page: p })}
          copy={common}
        />
      </section>
    </div>
  )
}
