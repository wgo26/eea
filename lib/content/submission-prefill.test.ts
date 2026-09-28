import { describe, expect, it } from "vitest";
import {
  detectSubmissionLocale,
  parseMediaLines,
  prefillFromSubmission,
} from "./submission-prefill";

/**
 * Submission → form prefill.
 *
 * Each rule here encodes a bug the inline version of this mapping shipped with:
 *  - it guessed the language from `*_fr` keys and a `submission_locale` field
 *    intake never writes, so EVERY submission (including every French one) was
 *    treated as English and landed in the English column;
 *  - it copied the generic text into BOTH locale columns, which reads to the
 *    reviewer as "already translated" and publishes untranslated English;
 *  - it dropped any key it could not place, silently.
 */

const LOCATIONS = [{ id: "loc-douala", name: "Douala" }];
const CATEGORIES = [
  { id: "cat-market", name: "Marketplace" },
  { id: "cat-notice", name: "Public notice" },
];

const prefill = (payload: Record<string, unknown>, submissionType = "news") =>
  prefillFromSubmission({ payload, submissionType, locations: LOCATIONS, categories: CATEGORIES });

describe("detectSubmissionLocale", () => {
  it("reads French from diacritics alone", () => {
    expect(detectSubmissionLocale("Une histoire de la ville")).toBe("fr");
  });
  it("reads French from function words alone", () => {
    expect(detectSubmissionLocale("Le marche est ferme")).toBe("fr");
  });
  it("does not claim plain English is French", () => {
    expect(detectSubmissionLocale("The market is closed today")).toBe("unknown");
  });
  it("returns unknown for empty text rather than defaulting to a language", () => {
    expect(detectSubmissionLocale("   ")).toBe("unknown");
  });
});

describe("parseMediaLines", () => {
  it("splits the caption on the first spaced dash only", () => {
    const [photo] = parseMediaLines("https://cdn.test/a.jpg - On the - street");
    expect(photo.url).toBe("https://cdn.test/a.jpg");
    expect(photo.caption).toBe("On the - street");
  });
  it("keeps a bare URL caption-free rather than setting an empty string", () => {
    expect(parseMediaLines("https://cdn.test/a.jpg")).toEqual([{ url: "https://cdn.test/a.jpg" }]);
  });
  it("drops blank lines", () => {
    expect(parseMediaLines("\n\nhttps://a.test/1.jpg\n \n")).toHaveLength(1);
  });
});

describe("prefillFromSubmission — language", () => {
  it("prefills a news headline and description into the English column", () => {
    const r = prefill({ headline: "Flood hits Koumpen", description: "Water rose overnight." });
    expect(r.values.enTitle).toBe("Flood hits Koumpen");
    expect(r.values.enBody).toBe("Water rose overnight.");
    // The load-bearing assertion: nothing may appear in the other locale, or
    // the reviewer sees a translation that does not exist.
    expect(r.values.frTitle).toBeUndefined();
    expect(r.values.frBody).toBeUndefined();
  });

  it("sends French prose to the French column, not the English one", () => {
    const r = prefill({ headline: "Inondation à Douala", description: "L'eau a monté." });
    expect(r.sourceLocale).toBe("fr");
    expect(r.values.frTitle).toBe("Inondation à Douala");
    expect(r.values.enTitle).toBeUndefined();
  });

  it("honours an explicit locale field over any text guess", () => {
    const r = prefill({ submission_locale: "fr", headline: "Market closed" });
    expect(r.sourceLocale).toBe("fr");
    expect(r.values.frTitle).toBe("Market closed");
  });

  it("prefers locale-suffixed keys when intake recorded both", () => {
    const r = prefill({ headline_en: "Market closed", headline_fr: "Marché fermé" });
    expect(r.values.enTitle).toBe("Market closed");
    expect(r.values.frTitle).toBe("Marché fermé");
  });

  it("maps photo_story's `what` prose to a body, never to a title", () => {
    const r = prefill({ what: "A street scene photographed at dusk." }, "photo_story");
    expect(r.values.enBody).toBe("A street scene photographed at dusk.");
    expect(r.values.enTitle).toBeUndefined();
  });
});


describe("prefillFromSubmission — taxonomy, media and attribution", () => {
  it("parses the submitter's photo lines into photos with captions", () => {
    const r = prefill(
      { what: "Scene", photos: "https://cdn.test/1.jpg - First\nhttps://cdn.test/2.jpg" },
      "photo_story",
    );
    expect(r.photos).toEqual([
      { url: "https://cdn.test/1.jpg", caption: "First" },
      { url: "https://cdn.test/2.jpg" },
    ]);
  });

  it("accepts location_id only when the form can actually offer it", () => {
    expect(prefill({ location_id: "loc-douala" }).values.locationId).toBe("loc-douala");

    const stale = prefill({ location_id: "loc-deleted" });
    expect(stale.values.locationId).toBeUndefined();
    // And it says so, instead of dropping the reviewer's data silently.
    expect(stale.unmapped).toContain("location_id");
  });

  it("resolves a buy_sell category slug against the category names", () => {
    const r = prefill(
      { category: "market", item: "Bicycle", description: "Hardly used." },
      "buy_sell",
    );
    expect(r.values.categoryId).toBe("cat-market");
    expect(r.values.enTitle).toBe("Bicycle");
  });

  it("routes notice fields to the notice extension row", () => {
    const r = prefill(
      {
        noticeType: "announcement",
        item: "Water shutdown",
        message: "Supply off Thursday.",
        organization: "Camwater",
        date: "2026-10-01",
        expiry: "2026-10-08",
      },
      "notice",
    );
    expect(r.values.noticeType).toBe("announcement");
    expect(r.values.organization).toBe("Camwater");
    expect(r.values.noticeDate).toBe("2026-10-01");
    expect(r.values.noticeExpiry).toBe("2026-10-08");
    expect(r.values.enBody).toBe("Supply off Thursday.");
    expect(r.values.enTitle).toBe("Water shutdown");
  });

  it("keeps a culture submission's date as the event start", () => {
    const r = prefill({ headline: "Festival", description: "Three days.", date: "2026-12-01" }, "culture");
    expect(r.values.eventStartsAt).toBe("2026-12-01");
  });

  it("uses the contributor's name as the byline and default photo credit", () => {
    const r = prefill({ contributorName: "Awa N.", headline: "Story" });
    expect(r.values.byline).toBe("Awa N.");
    expect(r.values.credit).toBe("Awa N.");
  });

  it("lets an explicit photo credit win over the contributor name", () => {
    const r = prefill({ contributorName: "Awa N.", photographerCredit: "Emmanuel T." });
    expect(r.values.byline).toBe("Awa N.");
    expect(r.values.credit).toBe("Emmanuel T.");
  });

  it("keeps a notice's noticeType out of a non-notice submission", () => {
    const r = prefill({ noticeType: "announcement", headline: "x" }, "news");
    expect(r.values.noticeType).toBeUndefined();
    expect(r.unmapped).toContain("noticeType");
  });

  it("reports an unmapped key instead of dropping it silently", () => {
    const r = prefill({ somethingUnheardOf: "value" });
    expect(r.unmapped).toContain("somethingUnheardOf");
  });

  it("survives an empty or null payload without inventing anything", () => {
    for (const payload of [null, {}, { headline: "   " }]) {
      const r = prefillFromSubmission({
        payload,
        submissionType: "news",
        locations: LOCATIONS,
        categories: CATEGORIES,
      });
      expect(r.values.enTitle).toBeUndefined();
      expect(r.values.frTitle).toBeUndefined();
      expect(r.photos).toEqual([]);
    }
  });
});
