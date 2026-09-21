import { describe, expect, it } from "vitest";

import {
    articleJsonLd,
    breadcrumbJsonLd,
    eventJsonLd,
    imageGalleryJsonLd,
    personJsonLd,
    placeJsonLd,
    productJsonLd,
} from "./jsonld";
import { isRichResultsEligible, validateJsonLdGraph } from "./validate";

const SITE = "https://example.org";

/**
 * Local Rich-Results gate: every public detail type's graph must be
 * error-free (warnings are advisory). This replaces the external manual
 * Rich Results Test step with a CI check — drop a required field and
 * `npm test` fails instead of Search Console weeks later.
 */
describe("JSON-LD rich-results eligibility", () => {
    it("validates a news-style article + breadcrumb graph", () => {
        const graph = [
            articleJsonLd({
                headline: "Market fire contained",
                description: "Firefighters contained the blaze.",
                image: `${SITE}/img.jpg`,
                datePublished: "2026-09-21T06:00:00Z",
                authorName: "Amina Osei",
                url: `${SITE}/en/news/market-fire`,
            }),
            breadcrumbJsonLd([
                { name: "News", url: `${SITE}/en/news` },
                { name: "Market fire contained", url: `${SITE}/en/news/market-fire` },
            ]),
        ];
        expect(validateJsonLdGraph(graph)).toEqual([]);
        expect(isRichResultsEligible(graph)).toBe(true);
    });

    it("validates an image gallery with associated media", () => {
        const graph = [
            imageGalleryJsonLd({
                headline: "Dawn at the market",
                description: "Twelve frames.",
                image: `${SITE}/cover.jpg`,
                datePublished: "2026-09-21T06:00:00Z",
                authorName: "Jean-Pierre N.",
                url: `${SITE}/en/photo-stories/dawn`,
                photos: [
                    { url: `${SITE}/p1.jpg`, caption: "Stalls" },
                    { url: `${SITE}/p2.jpg`, caption: null },
                ],
                locationName: "Mankon",
            }),
            breadcrumbJsonLd([{ name: "Photo", url: `${SITE}/en/photo-stories/dawn` }]),
        ];
        expect(isRichResultsEligible(graph)).toBe(true);
    });

    it("validates an event with venue and organizer", () => {
        const graph = [
            eventJsonLd({
                name: "Ngondo Festival",
                description: "Water rites.",
                image: `${SITE}/e.jpg`,
                url: `${SITE}/en/culture/events/ngondo`,
                startDate: "2026-12-05T09:00:00Z",
                endDate: "2026-12-06T18:00:00Z",
                venue: "Wouri Banks",
                locationName: "Douala",
                organizerName: "Ngondo Council",
            }),
        ];
        expect(isRichResultsEligible(graph)).toBe(true);
    });

    it("validates a product with offer", () => {
        const graph = [
            productJsonLd({
                name: "Used milling machine",
                description: "Works well.",
                images: [`${SITE}/m.jpg`],
                url: `${SITE}/en/buy-sell/abc`,
                price: 250000,
                currency: "XAF",
                isSold: false,
                sellerName: "Boulangerie Bonne Santé",
            }),
        ];
        expect(isRichResultsEligible(graph)).toBe(true);
    });

    it("flags a price-less listing as warning-only (still eligible)", () => {
        const graph = [
            productJsonLd({
                name: "Free textbooks",
                description: null,
                images: [],
                url: `${SITE}/en/buy-sell/xyz`,
                price: null,
                currency: "XAF",
                isSold: false,
                sellerName: null,
            }),
        ];
        const issues = validateJsonLdGraph(graph);
        expect(issues.some((i) => i.severity === "error")).toBe(false);
        expect(isRichResultsEligible(graph)).toBe(true);
    });

    it("validates person and place graphs", () => {
        expect(
            isRichResultsEligible([
                personJsonLd({
                    name: "Sarah N.",
                    description: "Contributor.",
                    image: `${SITE}/s.jpg`,
                    url: `${SITE}/en/contributors/sarah`,
                    homeLocation: "Bamenda",
                }),
            ]),
        ).toBe(true);
        expect(
            isRichResultsEligible([
                placeJsonLd({ name: "Mankon", url: `${SITE}/en/locations/mankon`, parentName: "Bamenda" }),
            ]),
        ).toBe(true);
    });

    it("rejects graphs missing required fields", () => {
        expect(isRichResultsEligible([{ "@type": "Article" }])).toBe(false);
        expect(isRichResultsEligible([{ "@type": "Event", name: "No date" }])).toBe(false);
        expect(
            isRichResultsEligible([{ "@type": "BreadcrumbList", itemListElement: [] }]),
        ).toBe(false);
        expect(isRichResultsEligible([{ "@type": "Person" }])).toBe(false);
        const issues = validateJsonLdGraph([{ "@type": "Event", name: "No date" }]);
        expect(issues).toContainEqual(
            expect.objectContaining({ severity: "error", path: expect.stringContaining("startDate") }),
        );
    });
});
