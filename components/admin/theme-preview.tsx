'use client'

import { useMemo, useState } from 'react'
import {
  PREVIEW_COMPONENTS,
  PREVIEW_VIEWPORTS,
  contrastHighlights,
  renderThemePreview,
  type PreviewBlockKind,
  type PreviewComponentId,
  type PreviewViewportId,
} from '@/lib/branding/preview-engine'
import type { AccessibilityMode, BrandTheme } from '@/lib/branding/tokens'
import { fillCopy } from '@/lib/admin/format'
import type { Dictionary } from '@/lib/i18n'

type Copy = Dictionary['admin']['branding']

export type PreviewStateOption = { id: string; name: string }

const ACCESSIBILITIES: AccessibilityMode[] = ['standard', 'high-contrast', 'reduced-motion']

const ACCESSIBILITY_KEY: Record<AccessibilityMode, keyof Copy['accessibilities']> = {
  standard: 'standard',
  'high-contrast': 'highContrast',
  'reduced-motion': 'reducedMotion',
}

const VIEWPORT_KEY: Record<PreviewViewportId, keyof Copy['viewports']> = {
  desktop: 'desktop',
  tablet: 'tablet',
  mobile: 'mobile',
}

const COMPONENT_KEY: Record<PreviewComponentId, keyof Copy['preview']['copy']> = {
  homepage: 'homepage',
  news: 'news',
  'photo-story': 'photo-story',
  notice: 'notice',
  'buy-sell': 'buy-sell',
}

const controlCls =
  'h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring'
const controlLabelCls = 'text-xs font-medium text-muted-foreground'

/**
 * Spec §10/§46 — the preview pane. It calls the same pure `renderThemePreview`
 * the publish-time report uses, on whatever theme it is handed, so an
 * unpublished draft in the editor previews exactly what the public shell would
 * paint once published.
 *
 * The state list arrives as a prop from the server page: `lib/platform` is
 * server-only, and the preview must not drag a service-role read path into the
 * browser bundle.
 */
export function ThemePreview({
  theme,
  copy,
  states,
  bare = false,
  className,
}: {
  theme: BrandTheme
  copy: Copy
  states: PreviewStateOption[]
  /** Hide the controls — the read-only share view renders one fixed sample. */
  bare?: boolean
  className?: string
}) {
  const [component, setComponent] = useState<PreviewComponentId>('homepage')
  const [viewportId, setViewportId] = useState<PreviewViewportId>('desktop')
  const [scheme, setScheme] = useState<'light' | 'dark'>('light')
  const [stateId, setStateId] = useState('NORMAL')
  const [accessibility, setAccessibility] = useState<AccessibilityMode>('standard')

  const render = useMemo(
    () => renderThemePreview(theme, component, { stateId, accessibility }),
    [theme, component, stateId, accessibility],
  )

  const viewport = PREVIEW_VIEWPORTS.find((entry) => entry.id === viewportId) ?? PREVIEW_VIEWPORTS[0]
  const variables = scheme === 'dark' ? render.darkVariables : render.variables
  const failures = contrastHighlights(render.validation)
  const errors = render.validation.issues.filter((issue) => issue.level === 'error')
  const warnings = render.validation.issues.filter((issue) => issue.level === 'warning')
  const sampleCopy = copy.preview.copy as unknown as Record<
    string,
    Partial<Record<PreviewBlockKind, string>> | undefined
  >
  const componentCopy = sampleCopy[COMPONENT_KEY[component]] ?? {}

  return (
    <div className={className}>
      {!bare && (
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className={controlLabelCls}>{copy.componentLabel}</span>
            <select
              className={controlCls}
              value={component}
              onChange={(e) => setComponent(e.target.value as PreviewComponentId)}
            >
              {PREVIEW_COMPONENTS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {sampleCopy[entry.id]?.heading ?? entry.id}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className={controlLabelCls}>{copy.viewportLabel}</span>
            <select
              className={controlCls}
              value={viewportId}
              onChange={(e) => setViewportId(e.target.value as PreviewViewportId)}
            >
              {PREVIEW_VIEWPORTS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {copy.viewports[VIEWPORT_KEY[entry.id]]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className={controlLabelCls}>{copy.schemeLabel}</span>
            <select
              className={controlCls}
              value={scheme}
              onChange={(e) => setScheme(e.target.value as 'light' | 'dark')}
            >
              <option value="light">{copy.light}</option>
              <option value="dark">{copy.dark}</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className={controlLabelCls}>{copy.stateLabel}</span>
            <select className={controlCls} value={stateId} onChange={(e) => setStateId(e.target.value)}>
              <option value="NORMAL">{copy.stateNormal}</option>
              {states
                .filter((state) => state.id !== 'NORMAL')
                .map((state) => (
                  <option key={state.id} value={state.id}>
                    {state.name}
                  </option>
                ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className={controlLabelCls}>{copy.accessibilityLabel}</span>
            <select
              className={controlCls}
              value={accessibility}
              onChange={(e) => setAccessibility(e.target.value as AccessibilityMode)}
            >
              {ACCESSIBILITIES.map((mode) => (
                <option key={mode} value={mode}>
                  {copy.accessibilities[ACCESSIBILITY_KEY[mode]]}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="rounded-lg border border-border bg-muted/40 p-3">
        <div
          className="mx-auto w-full overflow-hidden rounded-md border border-border shadow-sm"
          style={{
            maxWidth: viewport.width ? `${viewport.width}px` : undefined,
            ...(variables as React.CSSProperties),
            background: 'var(--background)',
            color: 'var(--foreground)',
          }}
        >
          <div className="p-4">
            {render.blocks.map((block) => {
              const text = componentCopy[block.kind] ?? ''
              if (block.kind === 'media') {
                return (
                  <div
                    key={block.kind}
                    role="img"
                    aria-label={text}
                    style={block.style as React.CSSProperties}
                  />
                )
              }
              return (
                <div
                  key={block.kind}
                  style={{ marginBlock: 0, ...(block.style as React.CSSProperties) }}
                >
                  {text}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs font-medium text-foreground">{copy.validationHeading}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {render.validation.valid ? copy.validationValid : copy.validationInvalid}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {errors.length > 0 && (
              <span className="rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                {fillCopy(copy.errorsCount, { count: errors.length })}
              </span>
            )}
            {warnings.length > 0 && (
              <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
                {fillCopy(copy.warningsCount, { count: warnings.length })}
              </span>
            )}
          </div>
          {render.validation.issues.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">{copy.noIssues}</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {render.validation.issues.slice(0, 6).map((issue, index) => (
                <li
                  key={`${issue.path}-${index}`}
                  className={issue.level === 'error' ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}
                >
                  {issue.message}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs font-medium text-foreground">{copy.contrastHeading}</p>
          {failures.length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">{copy.contrastOk}</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {failures.slice(0, 6).map((row, index) => (
                <li key={`${row.mode}-${row.foreground}-${row.background}-${index}`} className="text-xs text-muted-foreground">
                  <span className="mr-1 rounded bg-muted px-1 py-0.5 text-xs uppercase">
                    {row.mode === 'dark' ? copy.dark : copy.light}
                  </span>
                  {row.ratio === null
                    ? fillCopy(copy.contrastUnknown, {
                        fg: copy.colorLabels[row.foreground],
                        bg: copy.colorLabels[row.background],
                      })
                    : fillCopy(copy.contrastFail, {
                        fg: copy.colorLabels[row.foreground],
                        bg: copy.colorLabels[row.background],
                        ratio: row.ratio,
                        required: row.required,
                      })}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
