import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/branding/identity", () => ({
    loadBrandIdentity: async () => ({
        siteName: "Eagle Eye Africa",
        tagline: "Community reporting across Africa.",
    }),
}));

vi.mock("@/lib/admin/queries/settings", () => ({
    getPublicSiteSettings: async () => ({
        contactEmail: "contact@example.org",
        contactPhone: "+237 670 040 473",
        contactWhatsapp: null,
        contactAddressStreet: null,
        contactAddressCity: null,
        contactAddressRegion: null,
        contactAddressPostalCode: null,
        contactAddressCountry: null,
        facebookUrl: "https://www.facebook.com/share/1J2FYE1HhS/",
        twitterUrl: null,
        linkedinUrl: null,
        instagramUrl: null,
        youtubeUrl: null,
    }),
}));

vi.mock("@/lib/queries/home", () => ({
    getHomeData: async () => ({
        hero: null,
        featured: [],
        secondary: [],
        photoStories: [],
        news: [],
        notices: [],
        listings: [],
        culture: [],
        trending: [],
        ads: { banner: null, rail: null, inlineMid: null, inlineBottom: null },
    }),
}));

import { GET as getMarkdown } from "@/app/[locale]/md/route";
import { GET as getLlms } from "@/app/llms.txt/route";
import { POST as postMcp } from "@/app/api/mcp/route";
import { GET as getMcpCard } from "@/app/.well-known/mcp/server-card.json/route";
import robots from "@/app/robots";
import {
    MCP_OVERVIEW_TOOL,
    MCP_PROTOCOL_VERSION,
} from "@/lib/mcp/metadata";

function mcpRequest(body: Record<string, unknown>, initialized = false): Request {
    const headers = new Headers({
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
    });
    if (initialized) headers.set("MCP-Protocol-Version", MCP_PROTOCOL_VERSION);
    return new Request("https://eagleeyeafrica.org/api/mcp", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
    });
}

describe("agent readiness", () => {
    it("publishes the content-use signal in robots rules", () => {
        const config = robots();
        const rules = Array.isArray(config.rules) ? config.rules : [config.rules];
        expect(rules[0]).toMatchObject({
            userAgent: "*",
            other: { "Content-Signal": "search=yes, ai-train=no" },
        });
    });

    it("publishes configured contact and profile details in llms.txt", async () => {
        const response = await getLlms();
        const text = await response.text();

        expect(response.headers.get("content-type")).toContain("text/plain");
        expect(text).toContain("/en/photo-stories");
        expect(text).toContain("Email: contact@example.org");
        expect(text).toContain("Phone: +237 670 040 473");
        expect(text).toContain("Facebook: https://www.facebook.com/share/1J2FYE1HhS/");
    });

    it("serves a concise localized Markdown homepage", async () => {
        const response = await getMarkdown(
            new Request("https://eagleeyeafrica.org/fr/md"),
            { params: Promise.resolve({ locale: "fr" }) },
        );
        const markdown = await response.text();

        expect(response.headers.get("content-type")).toContain("text/markdown");
        expect(response.headers.get("vary")).toContain("Accept");
        expect(markdown).toContain("/fr/about");
        expect(markdown.length).toBeLessThan(10_000);
    });

    it("initializes MCP, lists its read-only tool, and serves the overview", async () => {
        const initialized = await postMcp(mcpRequest({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
                protocolVersion: MCP_PROTOCOL_VERSION,
                capabilities: {},
                clientInfo: { name: "test-client", version: "1.0.0" },
            },
        }));
        const initializeResult = await initialized.json();
        expect(initialized.status).toBe(200);
        expect(initializeResult.result.capabilities.tools).toEqual({ listChanged: false });

        const listed = await postMcp(mcpRequest({
            jsonrpc: "2.0",
            id: 2,
            method: "tools/list",
        }, true));
        const listResult = await listed.json();
        expect(listResult.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
            MCP_OVERVIEW_TOOL.name,
        ]);

        const called = await postMcp(mcpRequest({
            jsonrpc: "2.0",
            id: 3,
            method: "tools/call",
            params: { name: MCP_OVERVIEW_TOOL.name, arguments: {} },
        }, true));
        const callResult = await called.json();
        expect(callResult.result.content[0].text).toContain("## Public pages");
        expect(called.headers.get("access-control-allow-origin")).toBe("*");
    });

    it("does not claim write tools and publishes its server card", async () => {
        const unknownTool = await postMcp(mcpRequest({
            jsonrpc: "2.0",
            id: 4,
            method: "tools/call",
            params: { name: "submit_content", arguments: {} },
        }, true));
        const error = await unknownTool.json();
        expect(error.error.message).toBe("Unknown tool.");

        const response = await getMcpCard();
        const card = await response.json();
        expect(response.headers.get("content-type")).toContain("application/json");
        expect(card.name).toBe("Eagle Eye Africa");
        expect(card.endpoint).toContain("/api/mcp");
        expect(card.capabilities.tools).toEqual([MCP_OVERVIEW_TOOL]);
        expect(card.authentication).toEqual({ type: "none" });
    });
});
