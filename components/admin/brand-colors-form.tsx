'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import { createThemeDraft } from '@/lib/admin/actions/themes'
import { useToast } from '@/components/admin/toast'
import { Field, ui } from '@/lib/admin/ui-constants'
import { fillCopy } from '@/lib/admin/format'
import { localePath } from '@/lib/i18n/urls'
import { useLocaleFromPath } from '@/components/site-header'
import type { Dictionary } from '@/lib/i18n'
import {
  applyBrandColors,
  brandColorsFrom,
  checkBrandColors,
  type BrandColorInput,
  type BrandColorKey,
} from '@/lib/branding/brand-colors'
import type { BrandTheme, ColorTokens } from '@/lib/branding/tokens'

type Copy = Dictionary['admin']['branding']

const FIELDS: {
  key: BrandColorKey
  label: (c: Copy) => string
  preview: (c: Copy) => string
}[] = [
  { key: 'primary', label: (c) => c.brandColorsPrimaryLabel, preview: (c) => c.brandColorsPreviewButton },
  { key: 'secondary', label: (c) => c.brandColorsSecondaryLabel, preview: (c) => c.brandColorsPreviewSecondary },
  { key: 'accent', label: (c) => c.brandColorsAccentLabel, preview: (c) => c.brandColorsPreviewAccent },
]

/**
 * The simple colour editor (gap 3). Three swatches for a non-designer admin,
 * not nineteen semantic tokens: every foreground is DERIVED to maximise the
 * contrast it can reach, and submitting creates a draft that carries the live
 * theme's other tokens untouched — changing the brand colours never resets
 * typography, radius, dark deviations or imagery.
 *
 * Deliberately does not write to the live theme. `updateThemeDraft` accepts an
 * invalid palette, and publication is a two-person operation (spec §44), so this
 * surface only ever produces a draft for the normal approve -> publish flow.
 */
export function BrandColorsForm({ base, copy }: { base: BrandTheme; copy: Copy }) {
  const locale = useLocaleFromPath()
  const router = useRouter()
  const { addToast } = useToast()

  const [colors, setColors] = useState<BrandColorInput>(() => brandColorsFrom(base.colors))
  const [name, setName] = useState(() => fillCopy(copy.brandColorsDraftDefault, { name: base.name }))
  const [summary, setSummary] = useState('')
  const [busy, setBusy] = useState(false)

  // Recomputed on every keystroke with the same pure functions the unit tests
  // cover, so the verdict shown is the verdict the server will store.
  const checks = useMemo(() => checkBrandColors(colors), [colors])
  const nextColors: ColorTokens = useMemo(() => applyBrandColors(base.colors, colors), [base.colors, colors])
  // `passes` is already false for a swatch that cannot be parsed, so this one
  // condition covers both "is it a colour" and "is it readable".
  const canSubmit = FIELDS.every((f) => checks[f.key].passes)

  function setColor(key: BrandColorKey, value: string) {
    setColors((current) => ({ ...current, [key]: value }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return addToast(copy.nameRequired, 'error')
    if (!canSubmit) return addToast(copy.brandColorsBlocked, 'error')
    setBusy(true)
    try {
      const result = await createThemeDraft({
        name,
        tokens: { ...base, colors: nextColors },
        changeSummary: summary.trim() || copy.brandColorsSummaryPlaceholder,
      })
      if (!result.ok) {
        addToast(result.error, 'error')
        return
      }
      addToast(copy.brandColorsToastCreated, 'success')
      router.push(localePath(locale, `/admin/branding/${result.id}`))
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Operation failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-5 xl:grid-cols-2">
      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        <p className={ui.hint}>{copy.brandColorsHint}</p>

        {FIELDS.map(({ key, label }) => {
          const check = checks[key]
          // ratio is null exactly when the swatch cannot be parsed, so one
          // value drives both the message and its severity — no second
          // "is it valid" predicate to drift out of sync with.
          const verdict =
            check.ratio === null
              ? copy.brandColorsUnmeasurable
              : `${fillCopy(copy.brandColorsRatio, { ratio: check.ratio })} · ${
                  check.passes ? copy.brandColorsReadable : copy.brandColorsUnreadable
                }`
          return (
            <Field key={key} label={label(copy)}>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label={label(copy)}
                  value={/^#[0-9a-f]{6}$/i.test(colors[key]) ? colors[key] : '#000000'}
                  onChange={(e) => setColor(key, e.target.value)}
                  className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-border bg-background p-1"
                />
                <input
                  type="text"
                  value={colors[key]}
                  onChange={(e) => setColor(key, e.target.value)}
                  className={ui.input}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <p className={ui.hint}>{verdict}</p>
            </Field>
          )
        })}

        <p className={ui.hint}>{copy.brandColorsFocusNote}</p>

        <Field label={copy.brandColorsDraftName}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={ui.input}
            autoComplete="off"
          />
        </Field>
        <Field label={copy.changeSummaryLabel}>
          <input
            type="text"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder={copy.brandColorsSummaryPlaceholder}
            className={ui.input}
            autoComplete="off"
          />
        </Field>

        <p className={ui.hint}>{copy.brandColorsWorkflowNote}</p>
        <div className="flex justify-end">
          <button type="submit" className={ui.btnPrimary} disabled={busy || !canSubmit}>
            {busy ? copy.saving : copy.brandColorsSubmit}
          </button>
        </div>
      </div>

      {/* Live preview rendered from the derived set, so the contrast verdict is
          seen and not only reported as a number. */}
      <div className="space-y-3 self-start rounded-lg border border-border bg-card p-4">
        <h3 className={ui.sectionHeading}>{copy.brandColorsPreview}</h3>
        <div className="space-y-2">
          {FIELDS.map(({ key, preview }) => {
            const foreground =
              key === 'primary'
                ? nextColors.primaryForeground
                : key === 'secondary'
                  ? nextColors.secondaryForeground
                  : nextColors.accentForeground
            return (
              <div key={key} className="flex items-center gap-3">
                <span
                  className="inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium"
                  style={{ background: colors[key], color: foreground }}
                >
                  {preview(copy)}
                </span>
                <code className="text-xs text-muted-foreground">{colors[key]}</code>
              </div>
            )
          })}
        </div>
        <p className={ui.hint}>{copy.brandColorsWhatIsLive}: {base.name} v{base.version}</p>
      </div>
    </form>
  )
}
