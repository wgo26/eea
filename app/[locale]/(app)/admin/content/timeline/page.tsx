import Link from 'next/link'
import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { requireCapability } from '@/lib/auth/guards'
import { getContentItems } from '@/lib/admin/queries'
import { getTimelineEntriesWithContent } from '@/lib/queries/timeline'
import { PageHeader } from '@/components/admin/page-header'
import { TimelineEditor } from '@/components/admin/timeline-editor'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.content.timelineTitle }
}

/**
 * Phase 4 — Timeline manager (Differentiator #6). Editors pick a developing
 * story, then append timestamped updates that render live on the article
 * page (`TimelineSection`) and in RSS. Guarded by `manageContent` like the
 * rest of /admin/content.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ contentId?: string }>
}) {
  await requireCapability('manageContent', '/admin/content/timeline')
  const locale = await getRequestLocale()
  const dict = getDictionary(locale)
  const t = dict.admin.content

  const params = await searchParams
  const contentId = params.contentId?.trim() || null

  const [stories, entries] = await Promise.all([
    getContentItems({ status: 'published', type: 'news', limit: 50, locale }),
    contentId ? getTimelineEntriesWithContent(contentId, locale) : Promise.resolve([]),
  ])

  const base = localePath(locale, '/admin/content/timeline')

  return (
    <div className="space-y-5">
      <PageHeader title={t.timelineTitle} description={t.timelineDescription} />

      <form method="get" action={base} className="flex flex-wrap items-center gap-2">
        <label htmlFor="timeline-story" className="text-sm font-medium">
          {t.timelineStoryLabel}
        </label>
        <select
          id="timeline-story"
          name="contentId"
          defaultValue={contentId ?? ''}
          className="h-9 min-w-64 rounded-md border border-border bg-background px-3 text-sm"
        >
          <option value="">{t.timelinePickStory}</option>
          {stories.rows.map((row) => (
            <option key={row.id} value={row.id}>
              {(row.title ?? row.slug ?? row.id).slice(0, 80)}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {dict.admin.common.search}
        </button>
        <Link
          href={localePath(locale, '/admin/content')}
          className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-accent"
        >
          {dict.admin.common.cancel}
        </Link>
      </form>

      {contentId ? (
        <TimelineEditor
          contentItemId={contentId}
          initialEntries={entries.map((e) => ({
            id: e.id,
            contentItemId: e.contentItemId,
            timestamp: e.timestamp,
            title: e.title,
            body: e.body,
            locale: e.locale,
            isPublished: e.isPublished,
            sortOrder: e.sortOrder,
            createdBy: e.createdBy,
            createdAt: e.createdAt,
            updatedAt: e.updatedAt,
          }))}
          copy={{
            timelineEntryTitle: t.timelineEntryTitle,
            timelineEntryBody: t.timelineEntryBody,
            timelineEntryTime: t.timelineEntryTime,
            timelinePublishNow: t.timelinePublishNow,
            timelineAdd: t.timelineAdd,
            timelineEmpty: t.timelineEmpty,
            timelineDelete: t.timelineDelete,
            timelinePublish: t.timelinePublish,
            timelineUnpublish: t.timelineUnpublish,
            timelineSaved: t.timelineSaved,
            timelineFailed: t.timelineFailed,
          }}
        />
      ) : null}
    </div>
  )
}
