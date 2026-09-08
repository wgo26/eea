'use client'

import { useState } from 'react'
import Link from 'next/link'
import { saveAdvertiseSection, saveSiteSetting } from '@/lib/admin/actions'
import { useToast } from '@/components/admin/toast'
import { localePath } from '@/lib/i18n/urls'
import type { Dictionary, Locale } from '@/lib/i18n'

type Copy = Dictionary['admin']['siteContent']

export type AdvertiseSectionDefault = {
  key: string
  label: string
  heading: string | null
  body: string | null
}

export type AdvertiseOverrideRow = {
  sectionKey: string
  locale: string
  heading: string | null
  body: string | null
}

/**
 * Advertise-page copy manager: per-language heading/body overrides for each
 * /advertise section (hero, intro, the three feature cards). Shows the
 * built-in dictionary text beside every field; saving an all-empty card
 * deletes the override (dictionary returns). Sections may carry heading
 * only, body only, or both — the editor renders whichever fields exist.
 */
export function AdvertiseSectionEditor({
  copy,
  sections,
  overrides,
  editLocale,
  locale,
  viewHref,
}: {
  copy: Copy
  sections: AdvertiseSectionDefault[]
  overrides: AdvertiseOverrideRow[]
  editLocale: Locale
  locale: Locale
  viewHref: string
}) {
  const base = `${localePath(locale, '/admin/site-content')}?locale=`

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-md border border-border bg-card p-1">
          {(['en', 'fr'] as const).map((l) => (
            <Link
              key={l}
              href={`${base}${l}`}
              aria-current={editLocale === l ? 'true' : undefined}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                editLocale === l
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {l.toUpperCase()}
            </Link>
          ))}
        </div>
        <Link
          href={viewHref}
          className="inline-flex items-center justify-center rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
        >
          {copy.viewPublic}
        </Link>
      </div>

      <p className="text-sm text-muted-foreground">{copy.advertiseBody}</p>

      <div className="space-y-3">
        {sections.map((section) => {
          const override = overrides.find(
            (o) => o.sectionKey === section.key && o.locale === editLocale,
          )
          return (
            <AdvertiseSectionCard
              key={`${section.key}-${editLocale}`}
              copy={copy}
              section={section}
              override={override ?? null}
              editLocale={editLocale}
            />
          )
        })}
      </div>
    </div>
  )
}

function AdvertiseSectionCard({
  copy,
  section,
  override,
  editLocale,
}: {
  copy: Copy
  section: AdvertiseSectionDefault
  override: { heading: string | null; body: string | null } | null
  editLocale: Locale
}) {
  const { addToast } = useToast()
  const [heading, setHeading] = useState(override?.heading ?? '')
  const [body, setBody] = useState(override?.body ?? '')
  const [loading, setLoading] = useState(false)

  const hasOverride = Boolean(override?.heading ?? override?.body)

  async function handleSave() {
    setLoading(true)
    const result = await saveAdvertiseSection({
      sectionKey: section.key,
      locale: editLocale,
      heading: section.heading != null ? heading : null,
      body: section.body != null ? body : null,
    })
    setLoading(false)
    if (result.ok) addToast(copy.toastSectionSaved, 'success')
    else addToast(result.error, 'error')
  }

  const input =
    'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary'

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">
          {section.label} · {editLocale.toUpperCase()}
        </h3>
        {hasOverride ? (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
            {copy.current}
          </span>
        ) : null}
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            {copy.liveDefault} — {section.label}
          </p>
          <div className="rounded-md bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
            {section.heading ? <p className="font-semibold text-foreground">{section.heading}</p> : null}
            {section.body ? <p className="mt-1">{section.body}</p> : null}
          </div>
          <p className="text-[11px] text-muted-foreground">{copy.overrideHint}</p>
        </div>

        <div className="space-y-3">
          {section.heading != null ? (
            <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              <span>{copy.headingLabel}</span>
              <input
                type="text"
                value={heading}
                onChange={(e) => setHeading(e.target.value)}
                placeholder={section.heading}
                className={input}
              />
            </label>
          ) : null}
          {section.body != null ? (
            <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              <span>{copy.bodyLabel}</span>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={section.body}
                rows={4}
                className={input}
              />
            </label>
          ) : null}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={loading}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? copy.saving : copy.save}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

/**
 * Footer social links: two optional URL fields. Saving persists both
 * (server-validated absolute http(s) only); an emptied field removes the
 * setting so the footer icon hides until a link is set again.
 */
export function SiteLinksForm({
  copy,
  settings,
}: {
  copy: Copy
  settings: { social_facebook_url: string | null; social_youtube_url: string | null }
}) {
  const { addToast } = useToast()
  const [facebook, setFacebook] = useState(settings.social_facebook_url ?? '')
  const [youtube, setYoutube] = useState(settings.social_youtube_url ?? '')
  const [loading, setLoading] = useState(false)

  async function handleSave() {
    setLoading(true)
    const fb = await saveSiteSetting({ key: 'social_facebook_url', value: facebook || null })
    if (!fb.ok) {
      setLoading(false)
      addToast(fb.error, 'error')
      return
    }
    const yt = await saveSiteSetting({ key: 'social_youtube_url', value: youtube || null })
    setLoading(false)
    if (!yt.ok) {
      addToast(yt.error, 'error')
      return
    }
    addToast(copy.toastSettingSaved, 'success')
  }

  const input =
    'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary'

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{copy.footerBody}</p>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          <span className="flex items-center justify-between">
            {copy.facebookLabel}
            {settings.social_facebook_url ? null : (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                {copy.notSet}
              </span>
            )}
          </span>
          <input
            type="url"
            value={facebook}
            onChange={(e) => setFacebook(e.target.value)}
            placeholder={copy.urlPlaceholder}
            className={input}
          />
          <span className="text-[11px]">{copy.urlHint}</span>
        </label>

        <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          <span className="flex items-center justify-between">
            {copy.youtubeLabel}
            {settings.social_youtube_url ? null : (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                {copy.notSet}
              </span>
            )}
          </span>
          <input
            type="text"
            value={youtube}
            onChange={(e) => setYoutube(e.target.value)}
            placeholder={copy.urlPlaceholder}
            className={input}
          />
          <span className="text-[11px]">{copy.urlHint}</span>
        </label>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={loading}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {loading ? copy.saving : copy.save}
        </button>
      </div>
    </div>
  )
}
