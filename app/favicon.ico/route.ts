/**
 * Dynamic favicon (/favicon.ico) — same resolution as /icon.svg: redirects to
 * the brand logo or serves the built-in mark; logic lives in
 * lib/site-icon.ts with identity resolution in lib/branding/identity.ts. This
 * covers browsers/tools that auto-request /favicon.ico without honoring
 * <link rel="icon">. The path is explicitly proxy-exempt (never locale-redirected).
 */
import { loadBrandIdentity } from "@/lib/branding/identity";
import { serveSiteIcon } from "@/lib/site-icon";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
    const identity = await loadBrandIdentity();
    return serveSiteIcon(identity.faviconUrl, request.url);
}
