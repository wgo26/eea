import { loadDocumentTheme } from '@/lib/branding/document'

/**
 * Paints the published brand theme ahead of first paint (gap 1).
 *
 * Rendered as the first child of <body>, after the compiled stylesheet links
 * Next puts in <head>. Position is the whole mechanism, not cosmetics:
 *
 *  - **Order decides brand vs baseline.** `:root` and `.dark` are both
 *    specificity (0,1,0) and both match <html>, so the later rule wins. As a
 *    <style> in body this block always follows app/globals.css, which is what
 *    lets it override the shipped palette without raising specificity.
 *  - **Specificity decides accessibility vs brand.** globals.css states the
 *    reader's overrides at `html.high-contrast` (0,1,1) and
 *    `html.high-contrast.dark` (0,2,1). This block stays at (0,1,0) on purpose
 *    so those keep winning — a rebrand must never out-vote a contrast
 *    guarantee. Do not "fix" a perceived tie by adding a class or element to
 *    these selectors.
 *  - **No `precedence` prop deliberately.** React 19 hoists a styled `<style>`
 *    to <head> only when it carries `href` + `precedence`; without them the tag
 *    renders exactly here, which keeps the ordering above deterministic instead
 *    of dependent on hoist buckets.
 *
 * Nothing is emitted while the platform runs on the shipped baseline. That is
 * not a byte saving: DEFAULT_BRAND_THEME is a hand-maintained mirror of
 * globals.css, so injecting it would silently overwrite any later edit to the
 * stylesheet's :root with a stale copy of it.
 */
export async function BrandThemeStyle() {
  const { isBaseline, css } = await loadDocumentTheme()
  if (isBaseline) return null
  return <style id="brand-theme" dangerouslySetInnerHTML={{ __html: css }} />
}
