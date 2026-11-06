import { SITE } from "@/lib/constants";
import { localePath } from "@/lib/i18n/urls";

export const MCP_SERVER_VERSION = "1.0.0";
export const MCP_PROTOCOL_VERSION = "2025-11-25";
export const MCP_OVERVIEW_TOOL = {
    name: "get_site_overview",
    description: "Read a concise overview of Eagle Eye Africa and links to its public sections.",
    inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
    },
    annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
    },
} as const;

const siteUrl = SITE.url.replace(/\/$/, "");

export function createSiteMcpCard(siteName: string, siteDescription: string) {
    return {
        name: siteName,
        version: MCP_SERVER_VERSION,
        description: siteDescription,
        endpoint: new URL("/api/mcp", siteUrl).toString(),
        capabilities: {
            tools: [MCP_OVERVIEW_TOOL],
        },
        authentication: { type: "none" },
        homepage: siteUrl,
    };
}

export function getSiteOverviewText(siteName: string, siteDescription: string): string {
    return [
        `# ${siteName}`,
        "",
        siteDescription,
        "",
        "## Public pages",
        ...SITE.locales.flatMap((locale) => [
            "",
            `### ${locale.toUpperCase()}`,
            `- Home: ${siteUrl}${localePath(locale, "/")}`,
            `- News: ${siteUrl}${localePath(locale, "/news")}`,
            `- Photo stories: ${siteUrl}${localePath(locale, "/photo-stories")}`,
            `- Notices: ${siteUrl}${localePath(locale, "/notices")}`,
            `- Culture: ${siteUrl}${localePath(locale, "/culture")}`,
            `- Marketplace: ${siteUrl}${localePath(locale, "/buy-sell")}`,
            `- About: ${siteUrl}${localePath(locale, "/about")}`,
        ]),
        "",
        `Agent summary: ${siteUrl}/llms.txt`,
    ].join("\n");
}
