/**
 * Dynamic tab icon (/icon.svg) — redirects to the brand logo or serves the
 * built-in mark; resolution lives in lib/branding/identity.ts, serving in
 * lib/site-icon.ts.
 *
 * The identity read prefers the published theme's `imagery.faviconUrl` (then its
 * logo) over `site_logo_url`, so publishing a rebrand in the branding editor
 * changes the tab icon instead of leaving it pinned to the old upload.
 *
 * `force-dynamic` avoids a build-time prerender against empty settings; the
 * underlying reads are still unstable_cache'd and invalidated by the `brand` and
 * `site` tags, so a theme publish or a /admin/site-content save revalidates it.
 * The URL is proxy-exempt by the asset-extension rule (never locale-redirected).
 */
import { loadBrandIdentity } from "@/lib/branding/identity";
import { serveSiteIcon } from "@/lib/site-icon";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
    const identity = await loadBrandIdentity();
    return serveSiteIcon(identity.faviconUrl, request.url);
}
