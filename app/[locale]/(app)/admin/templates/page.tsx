import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { requireCapability } from '@/lib/auth/guards'
import { getContentTemplates, type ContentTemplateRow } from '@/lib/admin/queries'
import { PageHeader } from '@/components/admin/page-header'
import { EmptyState } from '@/components/admin/empty-state'
import { StatusBadge } from '@/components/admin/status-badge'
import { localizeStatus } from '@/lib/admin/labels'
import { formatRelative } from '@/lib/admin/format'
import { TemplateCreateForm, TemplateRowActions } from './template-actions'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.templates.title }
}

/**
 * Recap templates (Stream B, B3): the recipes the daily/weekly crons compile
 * into living drafts, with manual compile for editors who want one now.
 */
export default async function Page() {
  const locale = await getRequestLocale()
  await requireCapability('manageContent', '/admin/templates')
  const dict = getDictionary(locale)
  const t = dict.admin.templates
  const common = dict.admin.common

  const templates: ContentTemplateRow[] = await getContentTemplates()

  const sectionLabel = (row: ContentTemplateRow) =>
    ({
      news: t.sectionNews,
      photo: t.sectionPhoto,
      notice: t.sectionNotice,
      listing: t.sectionListing,
      culture: t.sectionCulture,
    })[row.section as 'news' | 'photo' | 'notice' | 'listing' | 'culture'] ?? row.section

  return (
    <div className="space-y-5">
      <PageHeader
        title={t.title}
        description={t.description}
        breadcrumb={[
          { label: dict.admin.sidebar.dashboard, href: localePath(locale, '/admin/dashboard') },
          { label: t.title },
        ]}
      />

      <TemplateCreateForm copy={t} />

      {templates.length === 0 ? (
        <EmptyState message={t.empty} />
      ) : (
        <div className="space-y-2">
          {templates.map((row) => (
            <div key={row.id} className="rounded-lg border border-border bg-card p-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={row.isActive ? 'active' : 'closed'} label={row.isActive ? t.active : t.inactive} />
                    <span className="rounded border border-border px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                      {sectionLabel(row)}
                    </span>
                    <span className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
                      {row.cadence === 'daily' ? t.cadenceDaily : t.cadenceWeekly}
                    </span>
                    {row.living ? (
                      <span className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground">{t.living}</span>
                    ) : (
                      <span className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground">{t.oneShot}</span>
                    )}
                    {row.locationSlug ? (
                      <span className="text-xs text-muted-foreground">@{row.locationSlug}</span>
                    ) : null}
                    {row.tagSlug ? <span className="text-xs text-muted-foreground">#{row.tagSlug}</span> : null}
                  </div>
                  <h3 className="mt-1 text-sm font-medium">{locale === 'fr' && row.nameFr ? row.nameFr : row.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {t.windowDays.replace('{days}', String(row.windowDays))}
                    {' · '}
                    {row.lastCompiledAt
                      ? t.lastCompiled.replace('{time}', formatRelative(row.lastCompiledAt, locale)).replace('{count}', String(row.lastAddedCount ?? 0))
                      : t.neverCompiled}
                    {row.draftId ? ` · ${t.hasDraft}` : ''}
                  </p>
                </div>
                <TemplateRowActions row={row} copy={t} common={common} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
