'use client'

import { useMemo, useState } from 'react'

import { approveTheme, updateThemeDraft } from '@/lib/admin/actions/themes'
import { ThemePreview, type PreviewStateOption } from '@/components/admin/theme-preview'
import { useToast } from '@/components/admin/toast'
import { Field, ui } from '@/lib/admin/ui-constants'
import { fillCopy } from '@/lib/admin/format'
import {
  COLOR_VARIABLES,
  DARK_RAMP_COLORS,
  type BrandTheme,
  type ColorTokens,
  type ImageryTreatment,
  type MotionDuration,
  type SpacingDensity,
  type TypeScale,
} from '@/lib/branding/tokens'
import { SELF_HOSTED_FONT_TOKENS, parseColor, validateTheme } from '@/lib/branding/validation'
import type { Dictionary } from '@/lib/i18n'

type Copy = Dictionary['admin']['branding']
type Tab = 'identity' | 'typography' | 'colors' | 'components' | 'dark'

const TABS: Tab[] = ['identity', 'typography', 'colors', 'components', 'dark']
const SCALES: TypeScale[] = ['compact', 'default', 'spacious']
const DENSITIES: SpacingDensity[] = ['compact', 'comfortable', 'spacious']
const TREATMENTS: ImageryTreatment[] = ['standard', 'duotone', 'monochrome']
const DURATIONS: MotionDuration[] = ['minimal', 'reduced', 'full']
const BUTTON_SHAPES: BrandTheme['components']['buttonShape'][] = ['rounded', 'pill', 'square']
const CARD_ELEVATIONS: BrandTheme['components']['cardElevation'][] = ['flat', 'raised', 'floating']

const COLOR_KEYS = Object.keys(COLOR_VARIABLES) as (keyof ColorTokens)[]

/**
 * Every group is optional at the fix-up layer, so one generic merge keeps the
 * nineteen inputs below to one line each instead of nineteen near-identical
 * `setDraft` closures.
 */
type GroupKey = 'typography' | 'spacing' | 'radius' | 'shadows' | 'motion' | 'imagery' | 'components'

const swatchCls = 'h-9 w-9 shrink-0 rounded-md border border-border'
const chipCls = 'rounded-full border px-2 py-0.5 text-xs font-medium uppercase tracking-wide'
const monoCls = `${ui.input} font-mono text-xs`

/**
 * Spec §7–§10 editor. The draft lives here in the browser: every tab edits the
 * same `BrandTheme` object, the preview beside it re-renders through the real
 * token engine on every keystroke, and nothing reaches the database until Save
 * (which writes a new immutable version — §9). A published theme is read-only
 * because repainting the public site is a §44 publication, not a library edit.
 *
 * Client-side validation only gates the buttons; the same `validateTheme` runs
 * again in the server action before anything is stored or published.
 */
export function ThemeEditor({
  themeId,
  theme,
  status,
  isActive,
  states,
  copy,
}: {
  themeId: string
  theme: BrandTheme
  status: 'draft' | 'review' | 'approved' | 'published' | 'archived'
  isActive: boolean
  states: PreviewStateOption[]
  copy: Copy
}) {
  const { addToast } = useToast()
  const [draft, setDraft] = useState<BrandTheme>(theme)
  const [tab, setTab] = useState<Tab>('identity')
  const [summary, setSummary] = useState('')
  const [busy, setBusy] = useState(false)

  const report = useMemo(() => validateTheme(draft), [draft])
  const locked = isActive

  function setGroup<K extends GroupKey>(key: K, value: Partial<BrandTheme[K]>) {
    setDraft((current) => ({ ...current, [key]: { ...current[key], ...value } }))
  }

  function setColor(key: keyof ColorTokens, value: string) {
    setDraft((current) => ({ ...current, colors: { ...current.colors, [key]: value } }))
  }

  /** An empty value removes the deviation — absent means "inherit the ramp". */
  function setDarkColor(key: keyof ColorTokens, value: string) {
    setDraft((current) => {
      const darkColors = { ...current.darkColors }
      if (value.trim()) darkColors[key] = value
      else delete darkColors[key]
      return { ...current, darkColors }
    })
  }

  async function handleSave() {
    setBusy(true)
    try {
      const result = await updateThemeDraft(themeId, { tokens: draft, changeSummary: summary })
      if (!result.ok) {
        addToast(result.error, 'error')
        return
      }
      addToast(fillCopy(copy.toastSaved, { version: result.version }), 'success')
      setSummary('')
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Operation failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function handleApprove() {
    setBusy(true)
    try {
      const result = await approveTheme(themeId)
      if (!result.ok) {
        addToast(result.error, 'error')
        return
      }
      addToast(fillCopy(copy.toastApproved, { version: result.version }), 'success')
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Operation failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  function colorField(key: keyof ColorTokens) {
    const value = draft.colors[key]
    return (
      <div key={key} className="space-y-1">
        <span className="text-xs font-medium text-muted-foreground">{copy.colorLabels[key]}</span>
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={swatchCls}
            style={{ background: value }}
          />
          <input
            aria-label={copy.colorLabels[key]}
            className={monoCls}
            value={value}
            disabled={locked}
            onChange={(e) => setColor(key, e.target.value)}
          />
        </div>
        {parseColor(value) === null && <p className="text-xs text-destructive">{copy.colorInvalid}</p>}
      </div>
    )
  }

  function darkField(key: keyof ColorTokens) {
    const override = draft.darkColors[key]
    const inherited = DARK_RAMP_COLORS[key]
    return (
      <div key={key} className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">{copy.colorLabels[key]}</span>
          <span className={`${chipCls} ${override ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border bg-muted text-muted-foreground'}`}>
            {override ? copy.darkOverride : copy.darkInherited}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span aria-hidden className={swatchCls} style={{ background: override ?? inherited }} />
          <input
            aria-label={copy.colorLabels[key]}
            className={monoCls}
            value={override ?? ''}
            placeholder={inherited}
            disabled={locked}
            onChange={(e) => setDarkColor(key, e.target.value)}
          />
          {override && !locked && (
            <button
              type="button"
              className={`${ui.btnSm} shrink-0 border border-border bg-background text-muted-foreground hover:text-foreground`}
              onClick={() => setDarkColor(key, '')}
            >
              {copy.darkReset}
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-medium">{copy.editorHeading}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{copy.editorHint}</p>

        {locked && (
          <p className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900">
            {copy.liveLocked}
          </p>
        )}

        <div role="tablist" className="mt-3 flex flex-wrap gap-1 border-b border-border">
          {TABS.map((entry) => (
            <button
              key={entry}
              type="button"
              role="tab"
              aria-selected={tab === entry}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                tab === entry
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setTab(entry)}
            >
              {copy.tabs[entry]}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-4">
          {tab === 'identity' && (
            <>
              <h3 className="text-sm font-medium">{copy.identityHeading}</h3>
              <p className={ui.hint}>{copy.imageryHint}</p>
              <Field label={copy.logoLabel}>
                <input
                  className={monoCls}
                  value={draft.imagery.logoUrl ?? ''}
                  placeholder={copy.imageryPlaceholder}
                  disabled={locked}
                  onChange={(e) => setGroup('imagery', { logoUrl: e.target.value.trim() || null })}
                />
              </Field>
              <Field label={copy.faviconLabel}>
                <input
                  className={monoCls}
                  value={draft.imagery.faviconUrl ?? ''}
                  placeholder={copy.imageryPlaceholder}
                  disabled={locked}
                  onChange={(e) => setGroup('imagery', { faviconUrl: e.target.value.trim() || null })}
                />
              </Field>
              <Field label={copy.socialImageLabel}>
                <input
                  className={monoCls}
                  value={draft.imagery.socialImageUrl ?? ''}
                  placeholder={copy.imageryPlaceholder}
                  disabled={locked}
                  onChange={(e) => setGroup('imagery', { socialImageUrl: e.target.value.trim() || null })}
                />
              </Field>
              <Field label={copy.treatmentLabel}>
                <select
                  className={ui.select}
                  value={draft.imagery.treatment}
                  disabled={locked}
                  onChange={(e) => setGroup('imagery', { treatment: e.target.value as ImageryTreatment })}
                >
                  {TREATMENTS.map((entry) => (
                    <option key={entry} value={entry}>
                      {copy.treatments[entry]}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}

          {tab === 'typography' && (
            <>
              <h3 className="text-sm font-medium">{copy.typographyHeading}</h3>
              <Field label={copy.fontSansLabel} hint={copy.fontHint}>
                <select
                  className={ui.select}
                  value={draft.typography.fontSans}
                  disabled={locked}
                  onChange={(e) => setGroup('typography', { fontSans: e.target.value })}
                >
                  {SELF_HOSTED_FONT_TOKENS.map((token) => (
                    <option key={token} value={token}>
                      {token}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={copy.fontDisplayLabel}>
                <select
                  className={ui.select}
                  value={draft.typography.fontDisplay}
                  disabled={locked}
                  onChange={(e) => setGroup('typography', { fontDisplay: e.target.value })}
                >
                  {SELF_HOSTED_FONT_TOKENS.map((token) => (
                    <option key={token} value={token}>
                      {token}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={copy.headingWeightLabel}>
                <input
                  type="number"
                  min={400}
                  max={900}
                  step={100}
                  className={ui.input}
                  value={draft.typography.headingWeight}
                  disabled={locked}
                  onChange={(e) =>
                    setGroup('typography', { headingWeight: Number.parseInt(e.target.value, 10) || 400 })
                  }
                />
              </Field>
              <Field label={copy.bodyLeadingLabel}>
                <input
                  type="number"
                  min={1.1}
                  max={2.2}
                  step={0.05}
                  className={ui.input}
                  value={draft.typography.bodyLeading}
                  disabled={locked}
                  onChange={(e) =>
                    setGroup('typography', { bodyLeading: Number.parseFloat(e.target.value) || 1.6 })
                  }
                />
              </Field>
              <Field label={copy.scaleLabel}>
                <select
                  className={ui.select}
                  value={draft.typography.scale}
                  disabled={locked}
                  onChange={(e) => setGroup('typography', { scale: e.target.value as TypeScale })}
                >
                  {SCALES.map((entry) => (
                    <option key={entry} value={entry}>
                      {copy.scales[entry]}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}

          {tab === 'colors' && (
            <>
              <h3 className="text-sm font-medium">{copy.colorsHeading}</h3>
              <p className={ui.hint}>{copy.colorsHint}</p>
              <div className="grid gap-3 sm:grid-cols-2">{COLOR_KEYS.map(colorField)}</div>
            </>
          )}

          {tab === 'components' && (
            <>
              <h3 className="text-sm font-medium">{copy.componentsHeading}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={copy.densityLabel}>
                  <select
                    className={ui.select}
                    value={draft.spacing.density}
                    disabled={locked}
                    onChange={(e) => setGroup('spacing', { density: e.target.value as SpacingDensity })}
                  >
                    {DENSITIES.map((entry) => (
                      <option key={entry} value={entry}>
                        {copy.densities[entry]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={copy.sectionGapLabel}>
                  <input
                    className={monoCls}
                    value={draft.spacing.sectionGap}
                    disabled={locked}
                    onChange={(e) => setGroup('spacing', { sectionGap: e.target.value })}
                  />
                </Field>
                <Field label={copy.radiusLabel}>
                  <input
                    className={monoCls}
                    value={draft.radius.base}
                    disabled={locked}
                    onChange={(e) => setGroup('radius', { base: e.target.value })}
                  />
                </Field>
                <Field label={copy.motionEaseLabel}>
                  <input
                    className={monoCls}
                    value={draft.motion.ease}
                    disabled={locked}
                    onChange={(e) => setGroup('motion', { ease: e.target.value })}
                  />
                </Field>
                <Field label={copy.cardShadowLabel}>
                  <input
                    className={monoCls}
                    value={draft.shadows.card}
                    disabled={locked}
                    onChange={(e) => setGroup('shadows', { card: e.target.value })}
                  />
                </Field>
                <Field label={copy.liftShadowLabel}>
                  <input
                    className={monoCls}
                    value={draft.shadows.lift}
                    disabled={locked}
                    onChange={(e) => setGroup('shadows', { lift: e.target.value })}
                  />
                </Field>
                <Field label={copy.motionDurationLabel}>
                  <select
                    className={ui.select}
                    value={draft.motion.duration}
                    disabled={locked}
                    onChange={(e) => setGroup('motion', { duration: e.target.value as MotionDuration })}
                  >
                    {DURATIONS.map((entry) => (
                      <option key={entry} value={entry}>
                        {copy.motionDurations[entry]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={copy.buttonShapeLabel}>
                  <select
                    className={ui.select}
                    value={draft.components.buttonShape}
                    disabled={locked}
                    onChange={(e) =>
                      setGroup('components', {
                        buttonShape: e.target.value as BrandTheme['components']['buttonShape'],
                      })
                    }
                  >
                    {BUTTON_SHAPES.map((entry) => (
                      <option key={entry} value={entry}>
                        {copy.buttonShapes[entry]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={copy.cardElevationLabel}>
                  <select
                    className={ui.select}
                    value={draft.components.cardElevation}
                    disabled={locked}
                    onChange={(e) =>
                      setGroup('components', {
                        cardElevation: e.target.value as BrandTheme['components']['cardElevation'],
                      })
                    }
                  >
                    {CARD_ELEVATIONS.map((entry) => (
                      <option key={entry} value={entry}>
                        {copy.cardElevations[entry]}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </>
          )}

          {tab === 'dark' && (
            <>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-medium">{copy.darkHeading}</h3>
                  <p className={`${ui.hint} max-w-md`}>{copy.darkHint}</p>
                </div>
                {!locked && Object.keys(draft.darkColors).length > 0 && (
                  <button
                    type="button"
                    className={`${ui.btnSm} border border-border bg-background text-muted-foreground hover:text-foreground`}
                    onClick={() => setDraft((current) => ({ ...current, darkColors: {} }))}
                  >
                    {copy.darkResetAll}
                  </button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">{COLOR_KEYS.map(darkField)}</div>
            </>
          )}
        </div>

        {!locked && (
          <div className="mt-5 space-y-3 border-t border-border pt-4">
            <Field label={copy.changeSummaryLabel}>
              <input
                className={ui.input}
                value={summary}
                placeholder={copy.changeSummaryPlaceholder}
                onChange={(e) => setSummary(e.target.value)}
              />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={ui.btnPrimary} disabled={busy} onClick={handleSave}>
                {busy ? copy.saving : copy.save}
              </button>
              <button
                type="button"
                className={ui.btnSecondary}
                disabled={busy || !report.valid}
                onClick={handleApprove}
              >
                {copy.approve}
              </button>
              {!report.valid && <span className="text-xs text-destructive">{copy.validationInvalid}</span>}
            </div>
            {status === 'approved' && <p className="text-xs text-muted-foreground">{copy.approvedNote}</p>}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">{copy.previewHeading}</h2>
        <p className="text-xs text-muted-foreground">{copy.previewHint}</p>
        <ThemePreview theme={draft} copy={copy} states={states} />
      </section>
    </div>
  )
}
