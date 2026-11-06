import { SITE } from "@/lib/constants";
import { loadBrandIdentity } from "@/lib/branding/identity";
import { createSiteMcpCard } from "@/lib/mcp/metadata";

/**
 * MCP Server Card (SEP-1649) — published at /.well-known/mcp/server-card.json
 *
 * Advertises the public, read-only MCP endpoint and its implemented tool.
 */
export const revalidate = 300;

export async function GET() {
    const identity = await loadBrandIdentity();
    const card = createSiteMcpCard(
        identity.siteName,
        identity.tagline?.trim() || SITE.description,
    );

    return new Response(JSON.stringify(card, null, 2), {
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "public, max-age=3600, stale-while-revalidate=7200",
            "Access-Control-Allow-Origin": "*", // Allow cross-origin discovery
        },
    });
}