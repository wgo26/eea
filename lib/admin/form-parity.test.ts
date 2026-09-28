import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { en } from "@/lib/i18n/en";
import { SUBMISSION_TO_CONTENT } from "@/lib/content/submission-types";
import { prefillFromSubmission } from "@/lib/content/submission-prefill";
import {
  formFromRow,
  payloadFromForm,
  type FormValues,
} from "@/app/[locale]/(app)/admin/content/form/values";

/**
 * Create ↔ approve form parity.
 *
 * Every rule here encodes a drift class that actually shipped when the
 * moderation approve path was a second, hand-maintained content form:
 * approved stories arrived without event rows, tags, slugs, bylines,
 * share lines, contact emails and photo asset passthrough — and nothing
 * failed, because nothing watched the two payloads converge.
 *
 * The invariant: the approve surface builds its payload through the SAME
 * `payloadFromForm` funnel as the create surface, from values seeded by the
 * tested `prefillFromSubmission` adapter. A field the funnel emits is
 * available to both screens immediately.
 */

/* fixtures ------------------------------------------------------------ */

const LOCATIONS = [{ id: "loc-douala", name: "Douala" }];
const CATEGORIES = [{ id: "cat-news", name: "News" }];

function fullValues(type: FormValues["type"]): FormValues {
  return {
    ...formFromRow(),
    type,
    publish: "now",
    scheduledFor: "",
    expiresAt: "2030-01-01",
    publishedAt: "",
    slug: "my-story-slug",
    tags: "douala, market",
    byline: "A. Reporter",
    shareText: "Read this story",
    voiceType: "formal",
    enTitle: "English title",
    frTitle: "Titre français",
    enExcerpt: "English excerpt",
    frExcerpt: "Extrait français",
    enBody: "<p>English body</p>",
    frBody: "<p>Corps français</p>",
    enSeo: "English SEO",
    frSeo: "SEO français",
    credit: "Photo credit",
    verification: "verified",
    locationId: "loc-douala",
    categoryId: "cat-news",
    videos: "https://example.com/v.mp4",
    audios: "https://example.com/a.mp3",
    documents: "https://example.com/d.pdf",
    newPhotos: [
      {
        url: "https://example.com/p.jpg",
        kind: "photo",
        mimeType: "image/jpeg",
        alt: "Alt text",
        caption: "Caption",
        assetId: "asset-1",
      },
    ],
    keepIds: [],
    authorId: "author-1",
    authorName: "Author",
    noticeType: "public_notice",
    organization: "Org",
    noticeDate: "2026-01-01",
    noticeExpiry: "2026-02-01",
    isOfficial: true,
    price: "5000",
    currency: "XAF",
    sellerName: "Seller",
    contactPhone: "+237600000000",
    contactEmail: "seller@example.com",
    whatsappNumber: "+237600000000",
    eventStartsAt: "2026-03-01T10:00",
    eventEndsAt: "2026-03-01T12:00",
    venueName: "Venue",
    ticketUrl: "https://example.com/tickets",
    organizerName: "Organizer",
    organizerPhone: "+237600000001",
    organizerEmail: "org@example.com",
  };
}

/* the funnel emits everything, for every type -------------------------- */

describe("payloadFromForm create funnel", () => {
  it("emits the full field set for a news post", () => {
    const out = payloadFromForm(fullValues("news"), null);
    expect(out.kind).toBe("create");
    if (out.kind !== "create") return;
    const d = out.input.draft;
    expect(d.slug).toBe("my-story-slug");
    expect(d.tags).toContain("douala");
    expect(d.authorId).toBe("author-1");
    expect(d.translations).toHaveLength(2);
    const en = d.translations.find((t) => t.locale === "en");
    expect(en?.byline).toBe("A. Reporter");
    expect(en?.shareText).toBe("Read this story");
    expect(en?.voiceType).toBe("formal");
    expect(en?.seoDescription).toBe("English SEO");
    // Photo asset passthrough (prevents duplicate URL-only rows the DB rejects).
    expect(d.photos?.[0]).toMatchObject({ assetId: "asset-1", kind: "photo", alt: "Alt text" });
    // Video / audio / document attachments travel as typed rows.
    expect((d.attachments ?? []).map((a) => a.kind).sort()).toEqual(["audio", "document", "video"]);
  });

  it("emits the listing extension fields (incl. email + whatsapp)", () => {
    const out = payloadFromForm(fullValues("listing"), null);
    expect(out.kind).toBe("create");
    if (out.kind !== "create") return;
    expect(out.input.draft.listing).toMatchObject({
      price: 5000,
      contactEmail: "seller@example.com",
      whatsappNumber: "+237600000000",
      sellerName: "Seller",
    });
  });

  it("emits the notice extension fields (incl. dates + isOfficial)", () => {
    const out = payloadFromForm(fullValues("notice"), null);
    expect(out.kind).toBe("create");
    if (out.kind !== "create") return;
    expect(out.input.draft.notice).toMatchObject({
      noticeType: "public_notice",
      organizationName: "Org",
      isOfficial: true,
    });
    expect(out.input.draft.notice?.noticeDate).toBeTruthy();
  });

  it("emits the culture event fields (the row the old approve copy never wrote)", () => {
    const out = payloadFromForm(fullValues("culture"), null);
    expect(out.kind).toBe("create");
    if (out.kind !== "create") return;
    expect(out.input.draft.event).toMatchObject({
      venueName: "Venue",
      ticketUrl: "https://example.com/tickets",
      organizerName: "Organizer",
    });
  });
});

/* the approve surface reaches the same funnel --------------------------- */

describe("approve surface parity", () => {
  const payloads: Record<string, Record<string, string>> = {
    photo_story: { what: "A photo story", photos: "https://example.com/p.jpg - caption" },
    news: { headline: "Headline", description: "Body text here" },
    culture: { headline: "Concert", description: "Music night" },
    notice: { noticeType: "public_notice", item: "Road works", message: "Details" },
    buy_sell: { category: "phones", item: "Phone", description: "For sale", price: "5000" },
  };

  for (const [submissionType, payload] of Object.entries(payloads)) {
    it(`prefill(${submissionType}) feeds the create funnel without loss of shape`, () => {
      const pre = prefillFromSubmission({
        payload,
        submissionType,
        locations: LOCATIONS,
        categories: CATEGORIES,
      });
      // The approve dialog merges these values over a blank form and submits
      // through payloadFromForm — the same funnel the create dialog uses.
      const values: FormValues = {
        ...formFromRow(),
        ...(pre.values as Partial<FormValues>),
        newPhotos: pre.photos.map((p) => ({ url: p.url, caption: p.caption })),
      };
      const out = payloadFromForm(values, null);
      expect(out.kind).toBe("create");
      if (out.kind !== "create") return;
      // The submitter's text survives the funnel in at least one locale
      // column (photo_story's `what` is prose, so it lands in the body —
      // the reviewer/AI supplies the title, which is the honest flow).
      const texts = out.input.draft.translations.flatMap((t) => [t.title, t.body]);
      expect(texts.some((t) => (t ?? "").trim())).toBe(true);
    });
  }

  it("every submission type maps to a content type the single builder handles", () => {
    // content-create.ts CONTENT_TYPES is the source; mirrored here so this
    // suite never imports a server-only module into the unit gate.
    const BUILDER_TYPES = ["photo_story", "news", "listing", "notice", "culture", "micro_story"];
    for (const [sub, content] of Object.entries(SUBMISSION_TO_CONTENT)) {
      expect(BUILDER_TYPES).toContain(content);
    }
    expect(SUBMISSION_TO_CONTENT).toMatchObject({
      buy_sell: "listing",
      notice: "notice",
      culture: "culture",
    });
  });

  it("the shared builder writes every extension table (listings/notices/events)", () => {
    const src = readFileSync(resolve(__dirname, "actions/content-create.ts"), "utf8");
    for (const table of ["from('listings')", "from('notices')", "from('events')"]) {
      expect(src).toContain(table);
    }
  });

  it("the approve dialog renders the shared ContentForm, not a second form", () => {
    const root = resolve(__dirname, "../../app/[locale]/(app)/admin/moderation/[id]");
    const dialog = readFileSync(resolve(root, "approve-content-dialog.tsx"), "utf8");
    expect(dialog).toContain('mode="approve"');
    expect(dialog).toContain("ContentForm");
    const review = readFileSync(resolve(root, "review-actions.tsx"), "utf8");
    // The 37-useState bespoke drawer must not come back.
    expect(review).not.toContain("ApproveDrawer");
  });
});

/* dictionary convergence -------------------------------------------------- */

describe("review dictionary convergence", () => {
  // Field labels live in admin.content — the single form reads only that
  // dictionary. If one of these keys reappears under admin.review, the two
  // surfaces can drift again without a compile error.
  const CONTENT_OWNED = [
    "enTitle",
    "frTitle",
    "enBody",
    "frBody",
    "photosLabel",
    "verificationLabel",
    "translateEnToFr",
    "publishNow",
    "scheduledFor",
    "locationLabel",
    "categoryLabel",
    "priceLabel",
    "noticeTypeLabel",
    "slugBase",
    "bilingualHint",
  ];
  it("admin.review carries no content field labels", () => {
    const review = (en.admin as Record<string, Record<string, unknown>>).review;
    for (const key of CONTENT_OWNED) {
      expect(review, `admin.review must not define '${key}'`).not.toHaveProperty(key);
    }
  });
});
