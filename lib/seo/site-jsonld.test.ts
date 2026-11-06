import { describe, expect, it } from "vitest";

import { siteJsonLdGraph } from "./site-jsonld";
import { isRichResultsEligible, validateJsonLdGraph } from "./validate";

const FULL = {
    siteName: "Eagle Eye Africa",
    logoUrl: "https://cdn.example.com/logo.png",
    facebookUrl: "https://facebook.com/eagleeyeafrica",
    youtubeUrl: "https://youtube.com/@eagleeyeafrica",
    twitterUrl: "https://x.com/eagleeyeafrica",
    linkedinUrl: "https://linkedin.com/company/eagleeyeafrica",
    instagramUrl: "https://instagram.com/eagleeyeafrica",
    contactEmail: "info@eagleeyeafrica.org",
    contactPhone: "+237 6 12 34 56 78",
    contactAddressStreet: "123 Main Street",
    contactAddressCity: "Douala",
    contactAddressRegion: "Littoral",
    contactAddressCountry: "Cameroon",
    contactAddressPostalCode: "12345",
};

describe("site-wide Organization + WebSite JSON-LD", () => {
    it("is rich-results eligible with a configured brand", () => {
        const graph = siteJsonLdGraph(FULL);
        expect(validateJsonLdGraph(graph)).toEqual([]);
        expect(isRichResultsEligible(graph)).toBe(true);
        const org = graph[0] as Record<string, unknown>;
        expect(org["@type"]).toBe("Organization");
        expect(org["logo"]).toBe("https://cdn.example.com/logo.png");
        expect(org["sameAs"]).toEqual([
            "https://facebook.com/eagleeyeafrica",
            "https://youtube.com/@eagleeyeafrica",
            "https://x.com/eagleeyeafrica",
            "https://linkedin.com/company/eagleeyeafrica",
            "https://instagram.com/eagleeyeafrica",
        ]);
        expect(org["telephone"]).toBe("+237 6 12 34 56 78");
        expect(org["email"]).toBe("info@eagleeyeafrica.org");
        expect(org["address"]).toEqual({
            "@type": "PostalAddress",
            streetAddress: "123 Main Street",
            addressLocality: "Douala",
            addressRegion: "Littoral",
            postalCode: "12345",
            addressCountry: "Cameroon",
        });
        const site = graph[1] as Record<string, unknown>;
        expect(site["@type"]).toBe("WebSite");
        const action = site["potentialAction"] as Record<string, unknown>;
        const target = action["target"] as Record<string, unknown>;
        expect(target["urlTemplate"]).toContain("/en/search?q={search_term_string}");
    });

    it("omits logo/sameAs/telephone/address when the brand is unconfigured", () => {
        const graph = siteJsonLdGraph({
            siteName: "Eagle Eye Africa",
            logoUrl: null,
            facebookUrl: null,
            youtubeUrl: null,
            twitterUrl: null,
            linkedinUrl: null,
            instagramUrl: null,
            contactEmail: null,
            contactPhone: null,
            contactAddressStreet: null,
            contactAddressCity: null,
            contactAddressRegion: null,
            contactAddressCountry: null,
            contactAddressPostalCode: null,
        });
        const org = graph[0] as Record<string, unknown>;
        expect(org).not.toHaveProperty("logo");
        expect(org).not.toHaveProperty("sameAs");
        expect(org).not.toHaveProperty("telephone");
        expect(org).not.toHaveProperty("email");
        expect(org).not.toHaveProperty("address");
        expect(isRichResultsEligible(graph)).toBe(true);
    });

    it("absolutizes site-relative logos and drops unsafe social URLs", () => {
        const graph = siteJsonLdGraph({
            ...FULL,
            logoUrl: "/uploads/logo.png",
            facebookUrl: "javascript:alert(1)",
            youtubeUrl: "not a url",
        });
        const org = graph[0] as Record<string, unknown>;
        expect(org["logo"]).toContain("/uploads/logo.png");
        expect(org["sameAs"]).toEqual([
            "https://x.com/eagleeyeafrica",
            "https://linkedin.com/company/eagleeyeafrica",
            "https://instagram.com/eagleeyeafrica",
        ]);
    });
});
