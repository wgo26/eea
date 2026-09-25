/**
 * Phase 4 — WhatsApp-first Daily Brief (Differentiator #9).
 *
 * Pure builders for the five-line format from the spec:
 *   TODAY'S EAGLE EYE
 *   📸 3 visual stories / 📰 3 community stories / 📍 2 notices /
 *   🛍 5 listings / 🎭 3 culture & events
 *
 * Story lines prefer the editor's Pidgin/Camfranglais `share_text` (the
 * distribution register) with the formal title as fallback, and every line
 * carries the story URL so WhatsApp unfurls the link preview (the OG tags
 * from Phase 4.1 matter more than usual here).
 *
 * Pure (no I/O) so the format is unit-tested in lib/digest/brief.test.ts.
 */

export type BriefStory = {
    title: string;
    /** content type (news, micro_story, photo_story, notice, listing, culture) */
    type: string;
    /** locale-free story path, e.g. `/news/slug` */
    path: string;
    /** Pidgin/Camfranglais share line (optional). */
    shareText?: string | null;
    /** Taxonomy snapshot from the digest slot — carried for personalized
     *  follow-brief filtering, ignored by the renderer. */
    locationId?: string | null;
    categoryId?: string | null;
};

export type BriefSections = {
    visual: BriefStory[];
    community: BriefStory[];
    notices: BriefStory[];
    listings: BriefStory[];
    culture: BriefStory[];
};

/** Per-section caps straight from Diff. #9. */
export const BRIEF_CAPS: Record<keyof BriefSections, number> = {
    visual: 3,
    community: 3,
    notices: 2,
    listings: 5,
    culture: 3,
};

const SECTION_FOR_TYPE: Record<string, keyof BriefSections> = {
    photo_story: "visual",
    news: "community",
    micro_story: "community",
    timeline: "community",
    notice: "notices",
    listing: "listings",
    culture: "culture",
    fundraiser: "community",
};

/** Buckets newest-first stories into the five Diff. #9 sections with caps. */
export function groupBriefStories(stories: BriefStory[]): BriefSections {
    const sections: BriefSections = { visual: [], community: [], notices: [], listings: [], culture: [] };
    for (const story of stories) {
        const section = SECTION_FOR_TYPE[story.type] ?? "community";
        if (sections[section].length < BRIEF_CAPS[section]) {
            sections[section].push(story);
        }
    }
    return sections;
}

/** Display line: share register first, formal title as fallback. */
export function briefLine(story: BriefStory): string {
    return story.shareText?.trim() || story.title;
}

export type BriefCopy = {
    heading: string;
    visualLabel: string;
    communityLabel: string;
    noticesLabel: string;
    listingsLabel: string;
    cultureLabel: string;
    fullBrief: string;
    stopLine: string;
};

/**
 * W18 — diaspora framing ("home, today"): same stories, memory-oriented
 * heading for readers following home from abroad. Keyed off the
 * subscriber's `diaspora_mode` flag at delivery, not the pitch experiment.
 */
const DIASPORA_HEADING: Record<"en" | "fr", string> = {
    en: "EAGLE EYE — HOME, TODAY",
    fr: "EAGLE EYE — LE PAYS, AUJOURD'HUI",
};

const COPY: Record<"en" | "fr", BriefCopy> = {
    en: {
        heading: "TODAY'S EAGLE EYE",
        visualLabel: "visual stories",
        communityLabel: "community stories",
        noticesLabel: "important notices",
        listingsLabel: "interesting listings",
        cultureLabel: "culture & events",
        fullBrief: "Full brief",
        stopLine: "To stop: reply STOP",
    },
    fr: {
        heading: "L'ŒIL DU JOUR",
        visualLabel: "histoires visuelles",
        communityLabel: "histoires communautaires",
        noticesLabel: "avis importants",
        listingsLabel: "annonces intéressantes",
        cultureLabel: "culture & événements",
        stopLine: "Pour arrêter : répondez STOP",
        fullBrief: "Résumé complet",
    },
};

const SECTION_META: { key: keyof BriefSections; emoji: string; labelKey: keyof BriefCopy }[] = [
    { key: "visual", emoji: "📸", labelKey: "visualLabel" },
    { key: "community", emoji: "📰", labelKey: "communityLabel" },
    { key: "notices", emoji: "📍", labelKey: "noticesLabel" },
    { key: "listings", emoji: "🛍️", labelKey: "listingsLabel" },
    { key: "culture", emoji: "🎭", labelKey: "cultureLabel" },
];

/** Total cap so the single-parameter WhatsApp template never overflows. */
export const BRIEF_MAX_CHARS = 1500;

export function buildDailyBrief(
    sections: BriefSections,
    options: { locale: "en" | "fr"; dateLabel: string; siteUrl: string; digestPath: string; framing?: "standard" | "diaspora" },
): { title: string; body: string } {
    const copy = COPY[options.locale];
    const heading = options.framing === "diaspora" ? DIASPORA_HEADING[options.locale] : copy.heading;
    const lines: string[] = [`*${heading} — ${options.dateLabel}*`];
    for (const { key, emoji, labelKey } of SECTION_META) {
        const stories = sections[key];
        if (stories.length === 0) continue;
        const label = copy[labelKey] as string;
        lines.push(``, `${emoji} ${stories.length} ${label}`);
        for (const story of stories) {
            const line = briefLine(story).slice(0, 120);
            lines.push(`• ${line}\n  ${options.siteUrl}${story.path}`);
        }
    }
    lines.push(``, `${copy.fullBrief}: ${options.siteUrl}${options.digestPath}`, copy.stopLine);
    const title = options.locale === "fr" ? "Eagle Eye Africa — résumé du jour" : "Eagle Eye Africa — daily digest";
    let body = lines.join("\n");
    if (body.length > BRIEF_MAX_CHARS) {
        body = `${body.slice(0, BRIEF_MAX_CHARS - 1)}…`;
    }
    return { title, body };
}
