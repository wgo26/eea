/**
 * Dynamic tab icon (/icon.svg) — redirects to the uploaded site logo or
 * serves the built-in mark; logic lives in lib/site-icon.ts.
 *
 * `force-dynamic` avoids a build-time prerender against empty settings; the
 * underlying read is still unstable_cache'd and 'site'-tag invalidated, so a
 * /admin/site-content save revalidates it. The URL is proxy-exempt by the
 * asset-extension rule (never locale-redirected).
 */
import { getPublicSiteSettings } from "@/lib/admin/queries";
import { serveSiteIcon } from "@/lib/site-icon";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
    const settings = await getPublicSiteSettings();
    return serveSiteIcon(settings.logoUrl, request.url);
}
