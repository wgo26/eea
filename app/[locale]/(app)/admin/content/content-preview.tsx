'use client'

import { useMemo, useState } from 'react'
import { Monitor, Smartphone } from 'lucide-react'
import type { FormValues } from './content-form'
import type { Dictionary } from '@/lib/i18n'
import type { ContentEditData } from '@/lib/admin/queries'
import { ArticleBodyView } from '@/components/content/article-body-view'
import { blocksFromBody, stripStoryBlocksFromBody } from '@/lib/content/blocks'

type CommonCopy = Dictionary['admin']['common']
type Copy = Dictionary['admin']['content']

/**
 * Live editorial preview (Phase C): renders the *current, unsaved* form
 * values at an optional device width, in either language. A draft-preview
 * banner makes it explicit that visitors still see the published version —
 * the pane shows what Save would produce, not what is live.
 *
 * Sections built in the block editor are rendered from the parsed block model
 * (components/content/article-body-view) rather than as tag-stripped text, so
 * what the editor sees is the same document structure the public page will
 * show. Raw HTML is never injected here: the sanitizer is server-only and this
 * pane displays unsaved input, so React's own escaping is the safety net.
 */
export function ContentPreview({
  v,
  dataPhotos,
  copy,
  common,
  locale,
}: {
  v: FormValues
  /** Existing stored photos for edit mode — previewed when still kept. */
  dataPhotos: ContentEditData['photos']
  copy: Copy
  common: CommonCopy
  locale: 'en' | 'fr'
}) {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [lang, setLang] = useState(locale)

  const title = lang === 'fr' ? v.frTitle : v.enTitle
  const excerpt = lang === 'fr' ? v.frExcerpt : v.enExcerpt
  const rawBody = lang === 'fr' ? v.frBody : v.enBody

  // Memoised on body identity: the form re-renders on every keystroke of any
  // field, and re-parsing a 5k-word body each time is the preview's whole cost.
  const { prose, blocks } = useMemo(() => {
    if (!rawBody.trim()) return { prose: '', blocks: [] }
    return {
      prose: stripStoryBlocksFromBody(rawBody),
      blocks: blocksFromBody(rawBody),
    }
  }, [rawBody])

  // Both ExistingPhoto and UploadedPhoto carry url/caption/credit, so the
  // cover can be read uniformly regardless of which list it came from.
  const coverPhoto =
    v.newPhotos.find((p) => p.kind !== 'video' && p.kind !== 'audio') ??
    (v.keepIds.length > 0
      ? dataPhotos.find((p) => v.keepIds.includes(p.id))
      : undefined)
  const cover = coverPhoto?.url

  // Mirrors what the public hero renders: the story-level credit the save
  // writes to media_assets.photographer_credit, with a per-photo value
  // overriding it. Without this the field looked dead in the preview.
  const coverCredit = coverPhoto?.credit?.trim() || v.credit.trim()
  const coverCaption = coverPhoto?.caption?.trim() || ''

  const isEmpty = !title.trim() && !prose.trim() && blocks.length === 0

  const seg =
    'inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium transition-colors'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5" role="group" aria-label={common.preview}>
          <button
            type="button"
            onClick={() => setDevice('desktop')}
            aria-pressed={device === 'desktop'}
            className={`${seg} ${device === 'desktop' ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Monitor className="h-3.5 w-3.5" aria-hidden />
            {common.previewDesktop}
          </button>
          <button
            type="button"
            onClick={() => setDevice('mobile')}
            aria-pressed={device === 'mobile'}
            className={`${seg} ${device === 'mobile' ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Smartphone className="h-3.5 w-3.5" aria-hidden />
            {common.previewMobile}
          </button>
        </div>
        <div className="flex items-center gap-1.5" role="group" aria-label={common.localeLabel}>
          {(['en', 'fr'] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              aria-pressed={lang === l}
              className={`${seg} ${lang === l ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {l === 'en' ? common.localeEn : common.localeFr}
            </button>
          ))}
        </div>
      </div>

      <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-400">
        {common.previewDraftNote}
      </p>

      <div className="flex justify-center rounded-lg bg-muted/40 p-4">
        <div
          className="overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-[max-width] duration-300"
          style={{ maxWidth: device === 'mobile' ? '390px' : '100%', width: '100%' }}
        >
          {isEmpty ? (
            <p className="p-6 text-center text-sm text-muted-foreground">{common.previewEmpty}</p>
          ) : (
            <article className={device === 'mobile' ? 'p-4' : 'p-6 md:p-8'}>
              {cover ? (
                <figure className="mb-4">
                  <div className="relative aspect-video w-full overflow-hidden rounded-md bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element -- unsaved blob URLs can't use next/image */}
                    <img src={cover} alt={coverPhoto?.alt?.trim() ?? ''} className="h-full w-full object-cover" />
                  </div>
                  {coverCaption || coverCredit ? (
                    <figcaption className="flex flex-wrap items-baseline justify-between gap-2 pt-2 text-xs text-muted-foreground">
                      <span className="min-w-0 flex-1 leading-relaxed">{coverCaption || title}</span>
                      {coverCredit ? (
                        <span className="shrink-0 font-semibold">
                          {copy.photographerCredit}: {coverCredit}
                        </span>
                      ) : null}
                    </figcaption>
                  ) : null}
                </figure>
              ) : (
                <div className="mb-4 aspect-video w-full rounded-md bg-muted" aria-hidden />
              )}
              <h2 className={`font-heading font-semibold leading-tight ${device === 'mobile' ? 'text-lg' : 'text-2xl'}`}>
                {title || copy.untitled}
              </h2>
              {excerpt ? (
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{excerpt}</p>
              ) : null}
              <ArticleBodyView
                prose={prose}
                blocks={blocks}
                className={`article-body mt-4 text-foreground/90 ${device === 'mobile' ? 'text-sm leading-relaxed' : 'text-base leading-[1.8]'}`}
              />
            </article>
          )}
        </div>
      </div>
    </div>
  )
}
