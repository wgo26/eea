'use client'

import { useState } from 'react'
import Link from 'next/link'
import { saveAboutSection } from '@/lib/admin/actions'
import { useToast } from '@/components/admin/toast'
import { localePath } from '@/lib/i18n/urls'
import type { Dictionary, Locale } from '@/lib/i18n'
import type { AboutSectionRow } from '@/lib/admin/queries'

type Copy = Dictionary['admin']['policies']

export type SectionDefault = {
  key: string
  label: string
  heading: string
  body: string | null
  cta: string | null
}

/**
 * About-page copy manager: per-language heading/body overrides for each
 * /about index section. Shows the built-in dictionary text beside every
 * field; saving an all-empty card deletes the override (dictionary returns).
 */
export function AboutSectionEditor({
  copy,
  sections,
  overrides,
  editLocale,
  locale,
  viewHref,
}: {
  copy: Copy
  sections: SectionDefault[]
  overrides: AboutSectionRow[]
  editLocale: Locale
  locale: Locale
  viewHref: string
}) {
  const base = `${localePath(locale, '/admin/policies')}?tab=about`

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-md border border-border bg-card p-1">
          {(['en', 'fr'] as const).map((l) => (
            <Link
              key={l}
              href={`${base}&locale=${l}`}
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

      <p className="text-sm text-muted-foreground">{copy.aboutBody}</p>

      <div className="space-y-3">
        {sections.map((section) => {
          const override = overrides.find(
            (o) => o.sectionKey === section.key && o.locale === editLocale,
          )
          return (
            <SectionCard
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

function SectionCard({
  copy,
  section,
  override,
  editLocale,
}: {
  copy: Copy
  section: SectionDefault
  override: AboutSectionRow | null
  editLocale: Locale
}) {
  const { addToast } = useToast()
  const [heading, setHeading] = useState(override?.heading ?? '')
  const [body, setBody] = useState(override?.body ?? '')
  const [ctaLabel, setCtaLabel] = useState(override?.ctaLabel ?? '')
  const [loading, setLoading] = useState(false)

  const hasOverride = Boolean(override?.heading ?? override?.body ?? override?.ctaLabel)

  async function handleSave() {
    setLoading(true)
    const result = await saveAboutSection({
      sectionKey: section.key,
      locale: editLocale,
      heading,
      body,
      ctaLabel: section.cta != null ? ctaLabel : null,
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
            <p className="font-semibold text-foreground">{section.heading}</p>
            {section.body ? <p className="mt-1">{section.body}</p> : null}
            {section.cta ? <p className="mt-1 font-medium">[{section.cta}]</p> : null}
          </div>
          <p className="text-[11px] text-muted-foreground">{copy.overrideHint}</p>
        </div>

        <div className="space-y-3">
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
          {section.cta != null ? (
            <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              <span>{copy.ctaLabelLabel}</span>
              <input
                type="text"
                value={ctaLabel}
                onChange={(e) => setCtaLabel(e.target.value)}
                placeholder={section.cta}
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
