'use client'

import { useEffect, useState } from 'react'
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

  function confirmIfDirty(e: React.MouseEvent, targetLocale: Locale) {
    if (targetLocale === editLocale) {
      e.preventDefault()
      return
    }
    if (typeof document !== 'undefined' && document.querySelector('[data-dirty="true"]')) {
      if (!window.confirm(copy.save ?? 'You have unsaved changes. Switch language anyway?')) {
        e.preventDefault()
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-md border border-border bg-card p-1">
          {(['en', 'fr'] as const).map((l) => (
            <Link
              key={l}
              href={`${base}${l}`}
              onClick={(e) => confirmIfDirty(e, l)}
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
  const isDirty = heading !== (override?.heading ?? '') || body !== (override?.body ?? '')

  // Sync when the saved row for this locale changes — never clobber typing.
  /* eslint-disable react-hooks/set-state-in-effect -- locale-switch sync by design (guarded by isDirty) */
  useEffect(() => {
    if (!isDirty) {
      setHeading(override?.heading ?? '')
      setBody(override?.body ?? '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section.key, editLocale])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

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
    <section className="rounded-lg border border-border bg-card p-4" data-dirty={isDirty ? 'true' : undefined}>
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
 * Site branding: logo image (upload or URL) + per-locale site name +
 * tagline. Saving persists all five settings; an emptied field removes the
 * setting so the built-in wordmark/tagline/mark return. French name/tagline
 * fall back to the default (English) values when empty. The logo upload
 * reuses the staff-only `admin_asset` destination of /api/uploads (absolute
 * https URL it returns is stored as-is).
 */
export function SiteBrandingForm({
  copy,
  settings,
}: {
  copy: Copy
  settings: { site_logo_url: string | null; site_name: string | null; site_tagline: string | null; site_name_fr: string | null; site_tagline_fr: string | null }
}) {
  const { addToast } = useToast()
  const [logo, setLogo] = useState(settings.site_logo_url ?? '')
  const [siteName, setSiteName] = useState(settings.site_name ?? '')
  const [tagline, setTagline] = useState(settings.site_tagline ?? '')
  const [siteNameFr, setSiteNameFr] = useState(settings.site_name_fr ?? '')
  const [taglineFr, setTaglineFr] = useState(settings.site_tagline_fr ?? '')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)

  async function handleUpload(file: File) {
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('destination', 'admin_asset')
      const res = await fetch('/api/uploads', { method: 'POST', body: form })
      const json = (await res.json()) as { publicUrl?: string; error?: string }
      if (!res.ok || !json.publicUrl) {
        addToast(json.error ?? copy.errorUpload, 'error')
        return
      }
      setLogo(json.publicUrl)
      addToast(copy.logoCurrent, 'success')
    } catch {
      addToast(copy.errorUpload, 'error')
    } finally {
      setUploading(false)
    }
  }

  async function handleSave() {
    setLoading(true)
    for (const [key, val] of [
      ['site_logo_url', logo || null],
      ['site_name', siteName || null],
      ['site_tagline', tagline || null],
      ['site_name_fr', siteNameFr || null],
      ['site_tagline_fr', taglineFr || null],
    ] as const) {
      const result = await saveSiteSetting({ key, value: val })
      if (!result.ok) {
        setLoading(false)
        addToast(result.error, 'error')
        return
      }
    }
    setLoading(false)
    addToast(copy.toastBrandingSaved, 'success')
  }

  const input =
    'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary'

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{copy.brandingBody}</p>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            <span className="flex items-center justify-between">
              {copy.logoLabel}
              {settings.site_logo_url ? null : (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                  {copy.notSet}
                </span>
              )}
            </span>
            <input
              type="text"
              value={logo}
              onChange={(e) => setLogo(e.target.value)}
              placeholder={copy.urlPlaceholder}
              className={input}
            />
            <span className="text-[11px]">{copy.logoHint}</span>
          </label>

          <label className="inline-flex cursor-pointer items-center justify-center rounded-md border px-4 py-2 text-xs font-medium transition-colors hover:bg-accent">
            {uploading ? copy.uploading : copy.uploadLogo}
            <input
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              className="sr-only"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleUpload(file)
                e.target.value = ''
              }}
            />
          </label>

          {logo ? (
            <div className="flex items-center gap-3 rounded-md bg-muted/40 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo} alt={copy.logoPreview} className="h-10 max-w-40 rounded object-contain" />
              <span className="text-[11px] text-muted-foreground">{copy.logoCurrent}</span>
              <button
                type="button"
                onClick={() => setLogo('')}
                className="ml-auto text-[11px] text-destructive hover:underline"
              >
                {copy.notSet}
              </button>
            </div>
          ) : (
            <p className="rounded-md bg-muted/40 p-3 text-[11px] text-muted-foreground">{copy.noLogo}</p>
          )}
        </div>

        <div className="space-y-3">
          <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            <span>{copy.siteNameLabel}</span>
            <input
              type="text"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              placeholder="Eagle Eye Africa"
              maxLength={120}
              className={input}
            />
            <span className="text-[11px]">{copy.siteNameHint}</span>
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            <span>{copy.siteNameFrLabel}</span>
            <input
              type="text"
              value={siteNameFr}
              onChange={(e) => setSiteNameFr(e.target.value)}
              placeholder="Eagle Eye Africa"
              maxLength={120}
              className={input}
            />
            <span className="text-[11px]">{copy.siteNameFrHint}</span>
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            <span>{copy.siteTaglineLabel}</span>
            <input
              type="text"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              maxLength={120}
              className={input}
            />
            <span className="text-[11px]">{copy.siteTaglineHint}</span>
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            <span>{copy.siteTaglineFrLabel}</span>
            <input
              type="text"
              value={taglineFr}
              onChange={(e) => setTaglineFr(e.target.value)}
              maxLength={120}
              className={input}
            />
            <span className="text-[11px]">{copy.siteTaglineFrHint}</span>
          </label>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={loading || uploading}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {loading ? copy.saving : copy.save}
        </button>
      </div>
    </div>
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
