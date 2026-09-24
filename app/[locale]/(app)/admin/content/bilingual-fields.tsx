/**
 * Shared bilingual content fields — the EN/FR title, excerpt, body and SEO
 * blocks are identical between the create and edit dialogs. This module
 * renders them once per surface so the two forms cannot drift.
 *
 * Each field is a thin wrapper around the shared `Field` primitive; the
 * translate/assist buttons are wired through callbacks so the parent owns
 * mutation state.
 */
import { Field } from '@/lib/admin/ui-constants'

export function BilingualHeadings({
  copy,
  enTitle,
  frTitle,
  onTitle,
  required,
  showHint = true,
}: {
  copy: {
    enTitle: string
    frTitle: string
    bilingualHint: string
  }
  enTitle: string
  frTitle: string
  onTitle: (locale: 'en' | 'fr', v: string) => void
  required?: boolean
  showHint?: boolean
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={copy.enTitle}>
        <input
          value={enTitle}
          onChange={(e) => onTitle('en', e.target.value)}
          className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          required={required}
        />
      </Field>
      <Field label={copy.frTitle} hint={showHint ? copy.bilingualHint : undefined}>
        <input
          value={frTitle}
          onChange={(e) => onTitle('fr', e.target.value)}
          className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </Field>
    </div>
  )
}

export function BilingualExcerpts({
  copy,
  enExcerpt,
  frExcerpt,
  onExcerpt,
}: {
  copy: { enExcerpt: string; frExcerpt: string }
  enExcerpt: string
  frExcerpt: string
  onExcerpt: (locale: 'en' | 'fr', v: string) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={copy.enExcerpt}>
        <textarea
          value={enExcerpt}
          onChange={(e) => onExcerpt('en', e.target.value)}
          rows={2}
          className="w-full rounded-md border border-border bg-background p-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </Field>
      <Field label={copy.frExcerpt}>
        <textarea
          value={frExcerpt}
          onChange={(e) => onExcerpt('fr', e.target.value)}
          rows={2}
          className="w-full rounded-md border border-border bg-background p-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </Field>
    </div>
  )
}

export function BilingualBody({
  copy,
  enBody,
  frBody,
  onBody,
}: {
  copy: { enBody: string; frBody: string }
  enBody: string
  frBody: string
  onBody: (locale: 'en' | 'fr', v: string) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={copy.enBody}>
        <textarea
          value={enBody}
          onChange={(e) => onBody('en', e.target.value)}
          rows={8}
          className="w-full rounded-md border border-border bg-background p-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </Field>
      <Field label={copy.frBody}>
        <textarea
          value={frBody}
          onChange={(e) => onBody('fr', e.target.value)}
          rows={8}
          className="w-full rounded-md border border-border bg-background p-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </Field>
    </div>
  )
}

export function BilingualSeo({
  copy,
  enSeo,
  frSeo,
  onSeo,
}: {
  copy: { enSeoDescription: string; frSeoDescription: string; seoHint: string }
  enSeo: string
  frSeo: string
  onSeo: (locale: 'en' | 'fr', v: string) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={copy.enSeoDescription} hint={copy.seoHint}>
        <textarea
          value={enSeo}
          onChange={(e) => onSeo('en', e.target.value)}
          rows={2}
          className="w-full rounded-md border border-border bg-background p-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </Field>
      <Field label={copy.frSeoDescription}>
        <textarea
          value={frSeo}
          onChange={(e) => onSeo('fr', e.target.value)}
          rows={2}
          className="w-full rounded-md border border-border bg-background p-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </Field>
    </div>
  )
}