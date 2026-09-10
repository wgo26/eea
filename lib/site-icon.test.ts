import { describe, expect, it } from "vitest";
import { BUILTIN_ICON_SVG, resolveSiteIconUrl, serveSiteIcon } from "./site-icon";

const REQ = "https://eea.example/icon.svg";

describe("resolveSiteIconUrl", () => {
    it("accepts absolute http(s) URLs", () => {
        expect(resolveSiteIconUrl("https://cdn.example/logo.png")).toBe("https://cdn.example/logo.png");
        expect(resolveSiteIconUrl("http://cdn.example/logo.png")).toBe("http://cdn.example/logo.png");
    });

    it("rejects javascript:, data:, and other unsafe schemes", () => {
        expect(resolveSiteIconUrl("javascript:alert(1)")).toBeNull();
        expect(resolveSiteIconUrl("data:image/png;base64,x")).toBeNull();
        expect(resolveSiteIconUrl("ftp://cdn.example/logo.png")).toBeNull();
    });

    it("accepts site-relative paths", () => {
        expect(resolveSiteIconUrl("/uploads/logo.png")).toBe("/uploads/logo.png");
    });

    it("rejects traversal, whitespace, and markup in relative paths", () => {
        expect(resolveSiteIconUrl("/../secret")).toBeNull();
        expect(resolveSiteIconUrl('/uploads/a"b.png')).toBeNull();
        expect(resolveSiteIconUrl("/uploads/a b.png")).toBeNull();
    });

    it("rejects missing and unparseable values", () => {
        expect(resolveSiteIconUrl(null)).toBeNull();
        expect(resolveSiteIconUrl("")).toBeNull();
        expect(resolveSiteIconUrl("   ")).toBeNull();
        expect(resolveSiteIconUrl("not a url at all")).toBeNull();
    });
});

describe("serveSiteIcon", () => {
    it("redirects to the uploaded logo (absolute URL)", () => {
        const res = serveSiteIcon("https://cdn.example/logo.png", REQ);
        expect(res.status).toBe(307);
        expect(res.headers.get("location")).toBe("https://cdn.example/logo.png");
    });

    it("redirects a site-relative logo onto the request origin", () => {
        const res = serveSiteIcon("/uploads/logo.png", REQ);
        expect(res.status).toBe(307);
        expect(res.headers.get("location")).toBe("https://eea.example/uploads/logo.png");
    });

    it("serves the built-in mark when the logo is missing or unsafe", async () => {
        for (const bad of [null, "", "javascript:alert(1)"]) {
            const res = serveSiteIcon(bad, REQ);
            expect(res.status).toBe(200);
            expect(res.headers.get("content-type")).toBe("image/svg+xml; charset=utf-8");
            expect(await res.text()).toBe(BUILTIN_ICON_SVG);
        }
    });
});
