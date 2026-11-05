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
import { cn } from '@/lib/utils'
import { ProEditor, type ProEditorToolbarCopy } from '@/components/admin/pro-editor'

/** The character-counter copy shared by every metered field. */
type MeterCopy = { charCount: string; charCountLabel: string }

/**
 * Small "<used>/<max>" counter rendered on a field's label row. Goes amber
 * once the soft target is passed — guidance, never a hard block: the field
 * still saves, the target is just what search results and cards will show.
 */
function CharCount({
  value,
  max,
  hint,
  copy,
}: {
  value: number
  max: number
  hint: string
  copy: MeterCopy
}) {
  const fill = (template: string) =>
    template.replace('{n}', String(value)).replace('{max}', String(max))
  const over = value > max
  return (
    <span
      className={cn(
        'shrink-0 text-xs tabular-nums',
        over ? 'font-semibold text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
      )}
      title={hint}
      aria-label={fill(copy.charCountLabel)}
    >
      {fill(copy.charCount)}
    </span>
  )
}

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
    charCount: string
    charCountLabel: string
    titleLengthHint: string
  }
  enTitle: string
  frTitle: string
  onTitle: (locale: 'en' | 'fr', v: string) => void
  required?: boolean
  showHint?: boolean
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field
        label={copy.enTitle}
        accessory={<CharCount value={enTitle.length} max={60} hint={copy.titleLengthHint} copy={copy} />}
      >
        <input
          value={enTitle}
          onChange={(e) => onTitle('en', e.target.value)}
          className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          required={required}
        />
      </Field>
      <Field
        label={copy.frTitle}
        hint={showHint ? copy.bilingualHint : undefined}
        accessory={<CharCount value={frTitle.length} max={60} hint={copy.titleLengthHint} copy={copy} />}
      >
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
  copy: { enExcerpt: string; frExcerpt: string; charCount: string; charCountLabel: string; excerptLengthHint: string }
  enExcerpt: string
  frExcerpt: string
  onExcerpt: (locale: 'en' | 'fr', v: string) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field
        label={copy.enExcerpt}
        accessory={<CharCount value={enExcerpt.length} max={200} hint={copy.excerptLengthHint} copy={copy} />}
      >
        <textarea
          value={enExcerpt}
          onChange={(e) => onExcerpt('en', e.target.value)}
          rows={2}
          className="w-full rounded-md border border-border bg-background p-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </Field>
      <Field
        label={copy.frExcerpt}
        accessory={<CharCount value={frExcerpt.length} max={200} hint={copy.excerptLengthHint} copy={copy} />}
      >
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
  toolbar,
  photoUrls = [],
}: {
  copy: { enBody: string; frBody: string }
  enBody: string
  frBody: string
  onBody: (locale: 'en' | 'fr', v: string) => void
  toolbar: ProEditorToolbarCopy
  photoUrls?: string[]
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Field label={copy.enBody}>
        <ProEditor label={copy.enBody} value={enBody} onChange={(v) => onBody('en', v)} copy={toolbar} photoUrls={photoUrls} />
      </Field>
      <Field label={copy.frBody}>
        <ProEditor label={copy.frBody} value={frBody} onChange={(v) => onBody('fr', v)} copy={toolbar} photoUrls={photoUrls} />
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
  copy: { enSeoDescription: string; frSeoDescription: string; seoHint: string; charCount: string; charCountLabel: string; seoLengthHint: string }
  enSeo: string
  frSeo: string
  onSeo: (locale: 'en' | 'fr', v: string) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field
        label={copy.enSeoDescription}
        hint={copy.seoHint}
        accessory={<CharCount value={enSeo.length} max={155} hint={copy.seoLengthHint} copy={copy} />}
      >
        <textarea
          value={enSeo}
          onChange={(e) => onSeo('en', e.target.value)}
          rows={2}
          className="w-full rounded-md border border-border bg-background p-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </Field>
      <Field
        label={copy.frSeoDescription}
        accessory={<CharCount value={frSeo.length} max={155} hint={copy.seoLengthHint} copy={copy} />}
      >
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