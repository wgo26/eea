import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { requireCapability } from '@/lib/auth/guards'
import { getSubmissionById, getSubmissions, getContentItemRef, getLocations, getCategoriesForType } from '@/lib/admin/queries'
import { PageHeader } from '@/components/admin/page-header'
import { StatusBadge, TypeBadge } from '@/components/admin/status-badge'
import { formatRelative } from '@/lib/admin/format'
import { ReviewActions } from './review-actions'
import type { ContentType } from '@/lib/auth/roles'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.review.title }
}

/** Humanize a payload key: "noticeType" → "Notice type". */
function humanizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())
}

/** Flatten a payload value for the preview list. */
function payloadValue(value: unknown): string {
  if (value == null) return ''
  if (Array.isArray(value)) return value.map((v) => String(v)).join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/** Keys that suggest image content, even without a file extension. */
const PHOTO_KEY_RE = /photo|image|picture|cover/i
const AV_KEY_RE = /video|audio|media|clip|voice|sound/i
const URL_RE = /https?:\/\/[^\s'",;\\]+/g

function kindOfUrl(url: string): 'video' | 'audio' | 'image' | 'file' {
  if (/\.(mp4|mov|webm|m4v)(\?.*)?$/i.test(url) || /youtube\.com|youtu\.be|vimeo\.com/i.test(url)) return 'video'
  if (/\.(mp3|m4a|wav|ogg|oga|opus|weba)(\?.*)?$/i.test(url) || /soundcloud\.com|spotify\.com|audiomack\.com/i.test(url)) return 'audio'
  if (/\.(jpe?g|png|webp|gif|avif)(\?.*)?$/i.test(url) || url.includes('/uploads') || url.includes('/media')) return 'image'
  return 'file'
}

/** Pull media URLs out of a flattened payload value (photos/videos/audios arrive newline-joined). */
function extractPhotoUrls(key: string, value: string): string[] {
  if (!value.includes('http')) return []
  const urls = value.match(URL_RE) ?? []
  if (urls.length === 0) return []
  // Video/audio keys return their URLs directly so the reviewer gets a
  // player instead of a broken image thumbnail.
  if (/video|audio/i.test(key)) return urls
  const imageUrls = urls.filter(
    (u) => /\.(jpe?g|png|webp|gif|avif)(\?.*)?$/i.test(u) || u.includes('/uploads') || u.includes('/media'),
  )
  // A photo-ish payload key wins even when the URLs lack a recognizable extension.
  if (PHOTO_KEY_RE.test(key)) return urls
  if (AV_KEY_RE.test(key)) return urls
  return imageUrls
}

/** Public detail path for a published item, mirroring lib/queries/home.ts. */
function publicHref(locale: string, type: string, id: string, slug: string | null): string {
  switch (type) {
    case 'photo_story':
      return `/${locale}/photo-stories/${slug ?? id}`
    case 'culture':
      return `/${locale}/culture/${slug ?? id}`
    case 'notice':
      return `/${locale}/notices/${id}`
    case 'listing':
      return `/${locale}/buy-sell/${id}`
    default:
      return `/${locale}/news/${slug ?? id}`
  }
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const locale = await getRequestLocale()
  await requireCapability('moderate', '/admin/moderation')
  const dict = getDictionary(locale)
  const t = dict.admin.review

  const submission = await getSubmissionById(id)
  if (!submission) notFound()

  const contentRef = submission.contentItemId ? await getContentItemRef(submission.contentItemId) : null

  // Reference data for the approve-with-content drawer. buy_sell submissions
  // become `listing` content items, so the category list uses that type.
  const contentTypeForCategories: ContentType =
    submission.submissionType === 'buy_sell' ? 'listing' : (submission.submissionType as ContentType)
  const [locations, categories, queue] = await Promise.all([
    getLocations(),
    getCategoriesForType(contentTypeForCategories, locale),
    getSubmissions({ status: ['pending', 'in_review'], limit: 2 }),
  ])
  // Top of the pending queue, excluding the submission being reviewed.
  const nextPending = queue.rows.find((r) => r.id !== submission.id) ?? null

  // Published items can be previewed on the public site; anything else
  // deep-links into the content manager filtered to its status.
  const contentHref = contentRef
    ? contentRef.status === 'published'
      ? publicHref(locale, contentRef.type, contentRef.id, contentRef.slug)
      : localePath(
          locale,
          `/admin/content?tab=content&status=${contentRef.status === 'draft' || contentRef.status === 'scheduled' ? contentRef.status : 'all'}&type=all`,
        )
    : null

  const payloadEntries = Object.entries(submission.payload ?? {})
    .map(([key, value]) => ({ key, value: payloadValue(value) }))
    .filter((entry) => entry.value !== '')

  // Locale-aware payload labels (dictionary map, humanized-key fallback).
  const labels: Record<string, string> = t.payloadLabels
  const labelFor = (key: string) => labels[key] ?? labels[key.replace(/[_-]/g, '')] ?? humanizeKey(key)

  return (
    <div className="space-y-5">
      <PageHeader
        title={t.title}
        breadcrumb={[
          { label: dict.admin.sidebar.moderation, href: localePath(locale, '/admin/moderation') },
          { label: t.title },
        ]}
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* Submitted content */}
        <section className="rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge type={submission.submissionType} />
            <StatusBadge status={submission.status} />
            {submission.submittedAt && (
              <time className="text-xs text-muted-foreground">{formatRelative(submission.submittedAt, locale)}</time>
            )}
          </div>

          <h2 className="mt-3 text-sm font-medium">{t.submittedContent}</h2>
          {payloadEntries.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{t.emptyPayload}</p>
          ) : (
            <dl className="mt-3 divide-y divide-border">
              {payloadEntries.map(({ key, value }) => {
                const photos = extractPhotoUrls(key, value)
                return (
                  <div key={key} className="grid gap-1 py-2 sm:grid-cols-[160px_1fr] sm:gap-3">
                    <dt className="text-xs font-medium text-muted-foreground">{labelFor(key)}</dt>
                    {photos.length > 0 ? (
                      <dd className="flex flex-wrap gap-2">
                        {photos.map((url) => {
                          const kind = kindOfUrl(url)
                          if (kind === 'video') {
                            return (
                              <video key={url} src={url} controls preload="metadata" playsInline className="h-24 max-w-48 rounded border border-border bg-black" />
                            )
                          }
                          if (kind === 'audio') {
                            return (
                              <audio key={url} src={url} controls preload="none" className="w-56" />
                            )
                          }
                          return (
                            <a key={url} href={url} target="_blank" rel="noreferrer" className="block">
                              {/* eslint-disable-next-line @next/next/no-img-element -- external photo hosts, thumbnail preview */}
                              <img src={url} alt="" className="h-16 w-16 rounded border border-border object-cover" />
                            </a>
                          )
                        })}
                      </dd>
                    ) : (
                      <dd className="whitespace-pre-wrap break-words text-sm">{value}</dd>
                    )}
                  </div>
                )
              })}
            </dl>
          )}
        </section>

        {/* Sidebar: submitter, consent, decisions */}
        <div className="space-y-4">
          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-medium">{t.submitter}</h2>
            <p className="mt-1.5 text-sm">{submission.guestName ?? t.anonymous}</p>
            {submission.guestEmail && (
              <p className="text-xs text-muted-foreground">{t.contact}: {submission.guestEmail}</p>
            )}
            {submission.guestPhone && <p className="text-xs text-muted-foreground">{submission.guestPhone}</p>}
            <div className="mt-3 space-y-1.5 text-xs">
              <p className={submission.consentConfirmed ? 'text-emerald-600' : 'text-destructive'}>
                {submission.consentConfirmed ? `✓ ${t.consent}` : `✗ ${t.notConfirmed} — ${t.consent}`}
              </p>
              <p className={submission.rightsConfirmed ? 'text-emerald-600' : 'text-destructive'}>
                {submission.rightsConfirmed ? `✓ ${t.rights}` : `✗ ${t.notConfirmed} — ${t.rights}`}
              </p>
            </div>
            {submission.reviewedAt && (
              <p className="mt-3 text-xs text-muted-foreground">
                {t.reviewedAt}: {formatRelative(submission.reviewedAt, locale)}
              </p>
            )}
            {submission.rejectionReason && (
              <div className="mt-3 rounded-md bg-red-50 dark:bg-red-950/30 px-2.5 py-1.5">
                <p className="text-xs font-medium text-destructive">{t.rejectionReason}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{submission.rejectionReason}</p>
              </div>
            )}
          </section>

          {contentRef && (
            <Link
              href={contentHref ?? localePath(locale, '/admin/content')}
              className="block rounded-lg border border-border bg-card px-4 py-3 text-sm text-primary hover:underline"
            >
              {t.viewContent} →
            </Link>
          )}

          {nextPending && (
            <Link
              href={localePath(locale, `/admin/moderation/${nextPending.id}`)}
              className="block rounded-lg border border-border bg-card px-4 py-3 text-sm text-primary hover:underline"
            >
              {t.nextPending} →
            </Link>
          )}

          <ReviewActions
            submission={submission}
            copy={t}
            common={dict.admin.common}
            locations={locations}
            categories={categories}
          />
        </div>
      </div>
    </div>
  )
}

