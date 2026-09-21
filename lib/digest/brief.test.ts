import { describe, expect, it } from "vitest";

import {
    BRIEF_CAPS,
    BRIEF_MAX_CHARS,
    briefLine,
    buildDailyBrief,
    groupBriefStories,
    type BriefStory,
} from "./brief";

function story(overrides: Partial<BriefStory> & { title: string }): BriefStory {
    return { type: "news", path: "/news/x", ...overrides };
}

describe("Daily Brief (Differentiator #9)", () => {
    it("buckets stories into the five Diff. #9 sections with caps", () => {
        const stories: BriefStory[] = [
            // Newest-first input order wins capped slots: the micro-story is newest.
            story({ title: "street", type: "micro_story", path: "/news/street" }),
            ...Array.from({ length: 5 }, (_, i) => story({ title: `photo ${i}`, type: "photo_story", path: `/photo-stories/p${i}` })),
            ...Array.from({ length: 5 }, (_, i) => story({ title: `news ${i}`, type: "news", path: `/news/n${i}` })),
            ...Array.from({ length: 4 }, (_, i) => story({ title: `notice ${i}`, type: "notice", path: `/notices/t${i}` })),
            ...Array.from({ length: 9 }, (_, i) => story({ title: `listing ${i}`, type: "listing", path: `/buy-sell/l${i}` })),
            ...Array.from({ length: 5 }, (_, i) => story({ title: `culture ${i}`, type: "culture", path: `/culture/c${i}` })),
        ];
        const sections = groupBriefStories(stories);
        expect(sections.visual).toHaveLength(BRIEF_CAPS.visual);
        expect(sections.notices).toHaveLength(BRIEF_CAPS.notices);
        expect(sections.listings).toHaveLength(BRIEF_CAPS.listings);
        expect(sections.culture).toHaveLength(BRIEF_CAPS.culture);
        // 5 news + 1 micro_story compete for the 3 community slots.
        expect(sections.community).toHaveLength(BRIEF_CAPS.community);
        expect(sections.community.map((s) => s.title)).toContain("street");
    });

    it("prefers the Pidgin/Camfranglais share line", () => {
        expect(briefLine(story({ title: "Formal title", shareText: "See dis tori!" }))).toBe("See dis tori!");
        expect(briefLine(story({ title: "Formal title", shareText: "  " }))).toBe("Formal title");
        expect(briefLine(story({ title: "Formal title" }))).toBe("Formal title");
    });

    it("builds the five-line WhatsApp-first format in EN and FR", () => {
        const sections = groupBriefStories([
            story({ title: "Photo", type: "photo_story", path: "/photo-stories/p" }),
            story({ title: "News", type: "news", path: "/news/n" }),
            story({ title: "Notice", type: "notice", path: "/notices/t" }),
            story({ title: "Listing", type: "listing", path: "/buy-sell/l" }),
            story({ title: "Culture", type: "culture", path: "/culture/c" }),
        ]);
        const en = buildDailyBrief(sections, {
            locale: "en",
            dateLabel: "2026-09-21",
            siteUrl: "https://example.org",
            digestPath: "/en/digest",
        });
        expect(en.title).toContain("daily digest");
        expect(en.body).toContain("TODAY'S EAGLE EYE");
        for (const emoji of ["📸", "📰", "📍", "🛍️", "🎭"]) {
            expect(en.body).toContain(emoji);
        }
        expect(en.body).toContain("https://example.org/news/n");
        const fr = buildDailyBrief(sections, {
            locale: "fr",
            dateLabel: "2026-09-21",
            siteUrl: "https://example.org",
            digestPath: "/fr/digest",
        });
        expect(fr.body).toContain("L'ŒIL DU JOUR");
        expect(fr.body).toContain("STOP");
    });

    it("truncates to the template-safe cap", () => {
        const sections = groupBriefStories(
            Array.from({ length: 30 }, (_, i) =>
                story({ title: `Very long story title number ${i} `.repeat(10), type: "listing", path: `/buy-sell/${i}` }),
            ),
        );
        const { body } = buildDailyBrief(sections, {
            locale: "en",
            dateLabel: "2026-09-21",
            siteUrl: "https://example.org",
            digestPath: "/en/digest",
        });
        expect(body.length).toBeLessThanOrEqual(BRIEF_MAX_CHARS);
    });
});
