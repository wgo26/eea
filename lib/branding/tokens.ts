/**
 * Brand design tokens (spec §7–§8) — the semantic vocabulary the branding
 * engine composes and the admin theme editor edits.
 *
 * DELIBERATELY PURE AND CLIENT-SAFE: the theme editor previews drafts in the
 * browser, so nothing here may touch the DB or import server-only modules.
 * The token names mirror the CSS custom properties in app/globals.css one to
 * one, which is what makes §42 composition work: a composed theme serializes
 * straight onto the design system's variables.
 */

export interface ColorTokens {
  primary: string
  primaryForeground: string
  background: string
  foreground: string
  card: string
  cardForeground: string
  popover: string
  popoverForeground: string
  muted: string
  mutedForeground: string
  accent: string
  accentForeground: string
  secondary: string
  secondaryForeground: string
  border: string
  input: string
  ring: string
  link: string
  destructive: string
}

/** Semantic token → CSS custom property. The one place the mapping is written. */
export const COLOR_VARIABLES: Record<keyof ColorTokens, string> = {
  primary: '--primary',
  primaryForeground: '--primary-foreground',
  background: '--background',
  foreground: '--foreground',
  card: '--card',
  cardForeground: '--card-foreground',
  popover: '--popover',
  popoverForeground: '--popover-foreground',
  muted: '--muted',
  mutedForeground: '--muted-foreground',
  accent: '--accent',
  accentForeground: '--accent-foreground',
  secondary: '--secondary',
  secondaryForeground: '--secondary-foreground',
  border: '--border',
  input: '--input',
  ring: '--ring',
  link: '--link',
  destructive: '--destructive',
}

/**
 * The colour variables app/globals.css declares that the token engine does NOT
 * yet own. Each is deferred for a reason, and `tokens.test.ts` asserts this map
 * plus COLOR_VARIABLES covers every colour var in the stylesheet — so the day
 * one of these gains a consumer, the test names it instead of the site quietly
 * rendering half-rebranded.
 *
 *   - chart-1..5   — `components/admin/viz.tsx` paints with the Tailwind
 *                    palette (`bg-emerald-500/85`), not these vars; nothing in
 *                    app/ or components/ reads them. A future charting surface
 *                    should claim them here.
 *   - sidebar-*    — `components/ui/sidebar.tsx` is the sole consumer of the
 *                    sidebar ramp and has zero importers today; the admin shell
 *                    uses its own `AppShell`/`AdminSidebar` styling. Wiring these
 *                    is a decision to adopt the shadcn sidebar, not a branding
 *                    gap.
 *
 * Unlike the mapped tokens, a deferred var is NOT theme-overridable: it keeps
 * whatever globals.css ships, so a rebrand cannot leave it stranded on the old
 * palette by accident — it simply is not part of the brand vocabulary yet.
 */
export const DEFERRED_COLOR_VARIABLES: Record<string, string> = {
  chart1: '--chart-1',
  chart2: '--chart-2',
  chart3: '--chart-3',
  chart4: '--chart-4',
  chart5: '--chart-5',
  sidebar: '--sidebar',
  sidebarForeground: '--sidebar-foreground',
  sidebarPrimary: '--sidebar-primary',
  sidebarPrimaryForeground: '--sidebar-primary-foreground',
  sidebarAccent: '--sidebar-accent',
  sidebarAccentForeground: '--sidebar-accent-foreground',
  sidebarBorder: '--sidebar-border',
  sidebarRing: '--sidebar-ring',
}

const COLOR_KEYS = Object.keys(COLOR_VARIABLES) as (keyof ColorTokens)[]

export type TypeScale = 'compact' | 'default' | 'spacious'

export interface TypographyTokens {
  fontSans: string
  fontDisplay: string
  headingWeight: number
  bodyLeading: number
  scale: TypeScale
}

export type SpacingDensity = 'compact' | 'comfortable' | 'spacious'

export interface SpacingTokens {
  density: SpacingDensity
  sectionGap: string
}

export interface RadiusTokens {
  /** Maps to --radius; every derived radius step scales from it. */
  base: string
}

export interface ShadowTokens {
  card: string
  lift: string
}

export type MotionDuration = 'minimal' | 'reduced' | 'full'

export interface MotionTokens {
  duration: MotionDuration
  ease: string
}

export type ImageryTreatment = 'standard' | 'duotone' | 'monochrome'

export interface ImageryTokens {
  logoUrl: string | null
  faviconUrl: string | null
  socialImageUrl: string | null
  treatment: ImageryTreatment
}

export interface ComponentTokens {
  buttonShape: 'rounded' | 'pill' | 'square'
  cardElevation: 'flat' | 'raised' | 'floating'
}

export interface BrandTheme {
  name: string
  version: string
  colors: ColorTokens
  /**
   * Optional dark-mode deviations. The shipped dark ramp in app/globals.css
   * (`.dark`) owns dark surfaces; a theme only lists the tokens it wants to
   * change there, so an empty object means "use the design system's dark
   * palette as-is" rather than "paint the light values over it".
   */
  darkColors: Partial<ColorTokens>
  typography: TypographyTokens
  spacing: SpacingTokens
  radius: RadiusTokens
  shadows: ShadowTokens
  motion: MotionTokens
  imagery: ImageryTokens
  components: ComponentTokens
}

/* ------------------------------------------------------------------ */
/* Version numbering (spec §9)                                        */
/* ------------------------------------------------------------------ */

const VERSION_RE = /^(\d+)\.(\d+)$/

/**
 * `1.4` → `1.5` — a saved edit. Snapshots are immutable, so every save gets a
 * version of its own; a version that does not parse starts a sane series rather
 * than throwing (the column is free text, so imported data may hold anything).
 */
export function nextMinorVersion(version: string): string {
  const match = VERSION_RE.exec(version.trim())
  return match ? `${match[1]}.${Number(match[2]) + 1}` : '1.1'
}

/** `1.4` → `2.0` — a publication. Major bumps mark what the public saw. */
export function nextMajorVersion(version: string): string {
  const match = VERSION_RE.exec(version.trim())
  return match ? `${Number(match[1]) + 1}.0` : '2.0'
}

/**
 * Baseline Eagle Eye Africa identity — the exact values the public design
 * system ships in app/globals.css (:root). Editing a theme never mutates this
 * object; every composition returns a new theme.
 */
export const DEFAULT_BRAND_THEME: BrandTheme = {
  name: 'Eagle Eye Africa',
  version: '1.0',
  colors: {
    primary: 'oklch(0.83 0.19 85)',
    primaryForeground: 'oklch(0.205 0 0)',
    background: 'oklch(1 0 0)',
    foreground: 'oklch(0.145 0 0)',
    card: 'oklch(1 0 0)',
    cardForeground: 'oklch(0.145 0 0)',
    popover: 'oklch(1 0 0)',
    popoverForeground: 'oklch(0.145 0 0)',
    muted: 'oklch(0.97 0 0)',
    mutedForeground: 'oklch(0.556 0 0)',
    accent: 'oklch(0.97 0 0)',
    accentForeground: 'oklch(0.205 0 0)',
    secondary: 'oklch(0.97 0 0)',
    secondaryForeground: 'oklch(0.205 0 0)',
    border: 'oklch(0.922 0 0)',
    input: 'oklch(0.922 0 0)',
    ring: 'oklch(0.75 0.14 85)',
    link: 'oklch(0.555 0.163 48.998)',
    destructive: 'oklch(0.577 0.245 27.325)',
  },
  // Empty = "the design system's dark palette, unmodified". A theme only lists
  // the tokens it actually wants to change after dark (`resolveDarkColors`).
  darkColors: {},
  typography: {
    fontSans: 'var(--font-sans)',
    fontDisplay: 'var(--font-display)',
    headingWeight: 700,
    bodyLeading: 1.6,
    scale: 'default',
  },
  spacing: { density: 'comfortable', sectionGap: '4rem' },
  radius: { base: '0.625rem' },
  shadows: {
    card: '0 1px 2px rgb(0 0 0 / 0.06), 0 4px 16px -4px rgb(0 0 0 / 0.12)',
    lift: '0 2px 4px rgb(0 0 0 / 0.08), 0 12px 32px -8px rgb(0 0 0 / 0.22)',
  },
  motion: { duration: 'full', ease: 'cubic-bezier(0.2, 0, 0, 1)' },
  imagery: { logoUrl: null, faviconUrl: null, socialImageUrl: null, treatment: 'standard' },
  components: { buttonShape: 'rounded', cardElevation: 'raised' },
}

/**
 * The design system's dark ramp, mirrored from `app/globals.css` (`.dark`).
 *
 * It lives here so dark mode can be reasoned about — validated for contrast,
 * serialized into a preview pane — without loading a stylesheet. It is a copy,
 * so `tokens.test.ts` parses globals.css and fails if the two ever drift:
 * update both, or neither.
 */
export const DARK_RAMP_COLORS: ColorTokens = {
  primary: 'oklch(0.83 0.19 85)',
  primaryForeground: 'oklch(0.205 0.02 75)',
  background: 'oklch(0.165 0.018 75)',
  foreground: 'oklch(0.975 0.008 75)',
  card: 'oklch(0.225 0.022 75)',
  cardForeground: 'oklch(0.975 0.008 75)',
  popover: 'oklch(0.225 0.022 75)',
  popoverForeground: 'oklch(0.975 0.008 75)',
  muted: 'oklch(0.285 0.02 75)',
  mutedForeground: 'oklch(0.74 0.02 75)',
  accent: 'oklch(0.285 0.02 75)',
  accentForeground: 'oklch(0.975 0.008 75)',
  secondary: 'oklch(0.285 0.02 75)',
  secondaryForeground: 'oklch(0.975 0.008 75)',
  border: 'oklch(1 0 0 / 10%)',
  input: 'oklch(1 0 0 / 15%)',
  ring: 'oklch(0.8 0.16 85)',
  link: 'oklch(0.86 0.19 87)',
  destructive: 'oklch(0.704 0.191 22.216)',
}

/** Dark is a brand layer, not a derived one: the shipped ramp + the theme's own deviations. */
export function resolveDarkColors(theme: BrandTheme): ColorTokens {
  return { ...DARK_RAMP_COLORS, ...theme.darkColors }
}

/* ------------------------------------------------------------------ */
/* Defensive parsing (brand_themes.tokens is jsonb)                   */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function str(row: Record<string, unknown>, key: string, fallback: string): string {
  const value = row[key]
  return typeof value === 'string' && value.trim() ? value : fallback
}

function num(row: Record<string, unknown>, key: string, fallback: number): number {
  const value = row[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function pick<T extends string>(row: Record<string, unknown>, key: string, allowed: readonly T[], fallback: T): T {
  const value = row[key]
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

function nullableStr(row: Record<string, unknown>, key: string): string | null {
  const value = row[key]
  return typeof value === 'string' && value.trim() ? value : null
}

/**
 * Dark deviations are partial BY CONSTRUCTION: only keys the theme actually
 * carries survive, so an absent (or empty) group keeps meaning "inherit the
 * shipped dark ramp" instead of silently pinning light values over it.
 */
function parseDarkColors(row: Record<string, unknown>): Partial<ColorTokens> {
  const out: Partial<ColorTokens> = {}
  for (const key of COLOR_KEYS) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) out[key] = value
  }
  return out
}

/** Merge an untrusted jsonb blob onto the defaults, group by group. */
export function parseBrandTheme(value: unknown, fallback: BrandTheme = DEFAULT_BRAND_THEME): BrandTheme {
  if (!isRecord(value)) return fallback
  const colors = isRecord(value.colors) ? value.colors : {}
  const darkColors = isRecord(value.darkColors) ? value.darkColors : {}
  const typography = isRecord(value.typography) ? value.typography : {}
  const spacing = isRecord(value.spacing) ? value.spacing : {}
  const radius = isRecord(value.radius) ? value.radius : {}
  const shadows = isRecord(value.shadows) ? value.shadows : {}
  const motion = isRecord(value.motion) ? value.motion : {}
  const imagery = isRecord(value.imagery) ? value.imagery : {}
  const components = isRecord(value.components) ? value.components : {}

  const color = (key: keyof ColorTokens) => str(colors, key, fallback.colors[key])

  return {
    name: str(value, 'name', fallback.name),
    version: str(value, 'version', fallback.version),
    colors: {
      primary: color('primary'),
      primaryForeground: color('primaryForeground'),
      background: color('background'),
      foreground: color('foreground'),
      card: color('card'),
      cardForeground: color('cardForeground'),
      popover: color('popover'),
      popoverForeground: color('popoverForeground'),
      muted: color('muted'),
      mutedForeground: color('mutedForeground'),
      accent: color('accent'),
      accentForeground: color('accentForeground'),
      secondary: color('secondary'),
      secondaryForeground: color('secondaryForeground'),
      border: color('border'),
      input: color('input'),
      ring: color('ring'),
      link: color('link'),
      destructive: color('destructive'),
    },
    darkColors: parseDarkColors(darkColors),
    typography: {
      fontSans: str(typography, 'fontSans', fallback.typography.fontSans),
      fontDisplay: str(typography, 'fontDisplay', fallback.typography.fontDisplay),
      headingWeight: num(typography, 'headingWeight', fallback.typography.headingWeight),
      bodyLeading: num(typography, 'bodyLeading', fallback.typography.bodyLeading),
      scale: pick(typography, 'scale', ['compact', 'default', 'spacious'] as const, fallback.typography.scale),
    },
    spacing: {
      density: pick(
        spacing,
        'density',
        ['compact', 'comfortable', 'spacious'] as const,
        fallback.spacing.density,
      ),
      sectionGap: str(spacing, 'sectionGap', fallback.spacing.sectionGap),
    },
    radius: { base: str(radius, 'base', fallback.radius.base) },
    shadows: {
      card: str(shadows, 'card', fallback.shadows.card),
      lift: str(shadows, 'lift', fallback.shadows.lift),
    },
    motion: {
      duration: pick(
        motion,
        'duration',
        ['minimal', 'reduced', 'full'] as const,
        fallback.motion.duration,
      ),
      ease: str(motion, 'ease', fallback.motion.ease),
    },
    imagery: {
      logoUrl: nullableStr(imagery, 'logoUrl'),
      faviconUrl: nullableStr(imagery, 'faviconUrl'),
      socialImageUrl: nullableStr(imagery, 'socialImageUrl'),
      treatment: pick(
        imagery,
        'treatment',
        ['standard', 'duotone', 'monochrome'] as const,
        fallback.imagery.treatment,
      ),
    },
    components: {
      buttonShape: pick(
        components,
        'buttonShape',
        ['rounded', 'pill', 'square'] as const,
        fallback.components.buttonShape,
      ),
      cardElevation: pick(
        components,
        'cardElevation',
        ['flat', 'raised', 'floating'] as const,
        fallback.components.cardElevation,
      ),
    },
  }
}

/* ------------------------------------------------------------------ */
/* Spec §42 — composition                                             */
/* ------------------------------------------------------------------ */

export type AccessibilityMode = 'standard' | 'high-contrast' | 'reduced-motion'

const STATE_COLOR_OVERRIDES: Record<string, Partial<ColorTokens>> = {
  SEASONAL: { accent: 'oklch(0.96 0.03 75)' },
  HIGH_ACTIVITY: { accent: 'oklch(0.95 0.05 85)', ring: 'oklch(0.7 0.15 85)' },
  MAINTENANCE: { primary: 'oklch(0.62 0.05 250)', ring: 'oklch(0.6 0.06 250)' },
  DEGRADED: { primary: 'oklch(0.72 0.14 65)', ring: 'oklch(0.68 0.15 65)', border: 'oklch(0.86 0.05 65)' },
  RECOVERY: { accent: 'oklch(0.95 0.06 165)', ring: 'oklch(0.68 0.12 165)' },
  INCIDENT: { primary: 'oklch(0.62 0.19 35)', ring: 'oklch(0.6 0.2 30)', border: 'oklch(0.86 0.06 30)' },
  CRITICAL: {
    primary: 'oklch(0.55 0.22 27)',
    primaryForeground: 'oklch(0.99 0 0)',
    ring: 'oklch(0.55 0.22 27)',
    border: 'oklch(0.72 0.12 27)',
    mutedForeground: 'oklch(0.42 0 0)',
  },
}

/**
 * Spec §30 — a system state may deviate semantic tokens. NORMAL (and any
 * unknown id) carries no deviations, so atmosphere never replaces identity.
 */
export function getStateTokenOverrides(stateId: string): {
  colors: Partial<ColorTokens>
  motion?: MotionDuration
  radius?: string
} {
  const id = (stateId ?? '').toUpperCase()
  const colors = STATE_COLOR_OVERRIDES[id]
  if (!colors) return { colors: {} }
  if (id === 'CRITICAL' || id === 'INCIDENT') {
    return { colors, motion: 'minimal', radius: '0.25rem' }
  }
  if (id === 'MAINTENANCE' || id === 'DEGRADED' || id === 'HIGH_ACTIVITY') {
    return { colors, motion: 'reduced' }
  }
  return { colors }
}

/** Spec §32/§33 — accessibility preferences override the composed theme. */
export function getAccessibilityTokenOverrides(mode: AccessibilityMode): {
  colors: Partial<ColorTokens>
  motion?: MotionDuration
} {
  if (mode === 'high-contrast') {
    return {
      colors: {
        foreground: 'oklch(0 0 0)',
        border: 'oklch(0.35 0 0)',
        mutedForeground: 'oklch(0.32 0 0)',
        ring: 'oklch(0.35 0 0)',
      },
    }
  }
  if (mode === 'reduced-motion') return { colors: {}, motion: 'minimal' }
  return { colors: {} }
}

/**
 * Spec §42 — Components = f(brand base, active system state, accessibility).
 * Later layers win; anything not overridden is carried through untouched.
 */
export function composeTheme(
  base: BrandTheme,
  stateId: string = 'NORMAL',
  accessibility: AccessibilityMode = 'standard',
): BrandTheme {
  const state = getStateTokenOverrides(stateId)
  const a11y = getAccessibilityTokenOverrides(accessibility)
  const colors: ColorTokens = {
    ...base.colors,
    ...state.colors,
    ...a11y.colors,
  }
  const radius = state.radius ?? base.radius.base
  const motionDuration = a11y.motion ?? state.motion ?? base.motion.duration
  return {
    ...base,
    colors,
    radius: { base: radius },
    motion: { ...base.motion, duration: motionDuration },
  }
}

/**
 * The theme as it renders in dark mode: shipped ramp → brand dark deviations →
 * state layer → accessibility layer. The state layer applies in both schemes
 * because that is what production does — a state's tokens ride an inline style,
 * which outranks the `.dark` class.
 */
export function composeDarkTheme(
  base: BrandTheme,
  stateId: string = 'NORMAL',
  accessibility: AccessibilityMode = 'standard',
): BrandTheme {
  return composeTheme({ ...base, colors: resolveDarkColors(base) }, stateId, accessibility)
}

/* ------------------------------------------------------------------ */
/* Serialization                                                      */
/* ------------------------------------------------------------------ */

const COLOR_VARS = COLOR_VARIABLES

/** Semantic tokens → CSS custom properties, ready for a React style prop. */
export function themeToCssVariables(theme: BrandTheme): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const key of COLOR_KEYS) {
    vars[COLOR_VARS[key]] = theme.colors[key]
  }
  vars['--radius'] = theme.radius.base
  vars['--shadow-card'] = theme.shadows.card
  vars['--shadow-lift'] = theme.shadows.lift
  vars['--ease-standard'] = theme.motion.ease
  vars['--brand-heading-weight'] = String(theme.typography.headingWeight)
  vars['--brand-body-leading'] = String(theme.typography.bodyLeading)
  vars['--brand-section-gap'] = theme.spacing.sectionGap
  if (theme.motion.duration === 'minimal') vars['--brand-motion'] = '0.001s'
  else if (theme.motion.duration === 'reduced') vars['--brand-motion'] = '120ms'
  else vars['--brand-motion'] = '200ms'
  return vars
}

/**
 * Dark-mode deviations ONLY — the shipped `.dark` ramp stays in charge of
 * everything the theme did not explicitly override, so an empty map truthfully
 * means "this theme does not touch dark mode".
 */
export function themeToDarkCssVariables(theme: BrandTheme): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const key of COLOR_KEYS) {
    const value = theme.darkColors[key]
    if (value) vars[COLOR_VARS[key]] = value
  }
  return vars
}

/**
 * A CSS declaration value must never be able to terminate its own declaration
 * or block. Brand tokens are authored by admins and stored as jsonb, and
 * `updateThemeDraft` saves a draft whether or not it validates (only publish
 * gates), so an injected `<style>` block cannot trust the string it was handed.
 * CSP is not a backstop here: style-src carries 'unsafe-inline' on purpose
 * (a nonce would opt every public page out of ISR — see lib/security/csp.ts).
 *
 * The allowlist covers everything the design system actually ships — oklch()
 * with alpha, hex, rgb(), comma-separated shadow stacks, cubic-bezier() and
 * bare lengths — and refuses `;`, braces, angle brackets, quotes, backslashes
 * and `@`, any of which is needed to break out of `property: value`.
 */
const SAFE_CSS_VALUE_RE = /^[a-zA-Z0-9 ,.()%/#+-]*$/
const MAX_CSS_VALUE_LENGTH = 512
/**
 * Refused explicitly rather than incidentally. The charset above lets `url(`
 * through on its own characters, and a token consumed as an image could reach
 * an arbitrary host — img-src is allowlisted precisely to stop image-beacon
 * exfiltration (see lib/security/csp.ts), so the brand filter must not become
 * the way back in. No shipped token is a url().
 */
const CSS_URL_RE = /url\s*\(/i

export function isSafeCssValue(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > MAX_CSS_VALUE_LENGTH) return false
  if (CSS_URL_RE.test(trimmed)) return false
  return SAFE_CSS_VALUE_RE.test(trimmed)
}

/** Custom properties as a CSS rule, for `<style>` injection ahead of paint. */
export function cssBlock(selector: string, variables: Record<string, string>): string {
  // A declaration with no braces or semicolons cannot escape its block, so the
  // unsafe ones are dropped rather than rewritten: the property simply keeps the
  // value app/globals.css ships for it, which is a stale brand, not a broken page.
  const declarations = Object.entries(variables)
    .filter(([, value]) => isSafeCssValue(value))
    .map(([property, value]) => `  ${property}: ${value};`)
    .join('\n')
  return `${selector} {\n${declarations}\n}`
}

/**
 * The theme as a stylesheet — `:root` plus a full `.dark` block. The dark block
 * is resolved rather than partial, so this source renders correctly wherever it
 * is injected, whether or not the shipped `.dark` class is present. Use
 * `themeToDarkCssVariables` when layering over the real `.dark` instead.
 */
export function serializeTheme(theme: BrandTheme): string {
  const light = cssBlock(':root', themeToCssVariables(theme))
  const dark = cssBlock('.dark', themeToCssVariables(composeDarkTheme(theme)))
  return `${light}\n\n${dark}`
}
