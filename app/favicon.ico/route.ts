/**
 * Dynamic favicon (/favicon.ico) — same resolution as /icon.svg: redirects
 * to the uploaded site logo or serves the built-in mark; logic lives in
 * lib/site-icon.ts. This covers browsers/tools that auto-request
 * /favicon.ico without honoring <link rel="icon">. The path is explicitly
 * proxy-exempt (never locale-redirected).
 */
import { getPublicSiteSettings } from "@/lib/admin/queries";
import { serveSiteIcon } from "@/lib/site-icon";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
    const settings = await getPublicSiteSettings();
    return serveSiteIcon(settings.logoUrl, request.url);
}
