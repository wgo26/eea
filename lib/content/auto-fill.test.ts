import { describe, expect, it } from "vitest";

import {
  draftRemainingFields,
  suggestAltFromCaption,
  suggestCategory,
  suggestCredit,
  suggestLocation,
  type AutoFillInput,
  type TaxonomyOption,
} from "./auto-fill";

const CATEGORIES: TaxonomyOption[] = [
  { id: "c-market", name: "Market & Trade" },
  { id: "c-culture", name: "Arts & Culture" },
  { id: "c-sport", name: "Football" },
  { id: "c-health", name: "Health" },
];

const LOCATIONS: TaxonomyOption[] = [
  { id: "l-bamenda", name: "Bamenda", slug: "bamenda" },
  { id: "l-douala", name: "Douala", slug: "douala" },
  { id: "l-limbe", name: "Limbé", slug: "limbe" },
];

describe("suggestCategory", () => {
  it("drafts the category the text is clearly about", () => {
    const s = suggestCategory(
      "Bamenda market traders rebuild stalls",
      "Traders at the Bamenda market are rebuilding their stalls after the fire, restoring trade across the region.",
      CATEGORIES,
    );
    expect(s?.id).toBe("c-market");
    expect(s!.confidence).toBeGreaterThan(0.3);
  });

  it("returns null rather than guessing into a required select", () => {
    expect(suggestCategory("Untitled", "", CATEGORIES)).toBeNull();
    expect(suggestCategory("A note", "Nothing here relates to any taxonomy at all.", CATEGORIES)).toBeNull();
  });

  it("does not invent a category when the options list is empty", () => {
    expect(suggestCategory("Market day", "Market traders sold out entirely.", [])).toBeNull();
  });

  it("ignores accents and case when matching a label", () => {
    const s = suggestCategory("Fete de la musique", "Musicians performed across the city all night long.", [
      { id: "x", name: "Fête de la Musique" },
    ]);
    expect(s?.id).toBe("x");
  });
});

describe("suggestLocation", () => {
  it("finds a place named in the prose", () => {
    const s = suggestLocation(
      "Water supply improves",
      "The Douala water board say new pumps will reach every district by the end of the year.",
      LOCATIONS,
    );
    expect(s?.id).toBe("l-douala");
  });

  it("matches an accented place name typed without accents", () => {
    const s = suggestLocation("Notes from Limbe", "A beach cleaning took place near the Limbe port on saturday.", LOCATIONS);
    expect(s?.id).toBe("l-limbe");
  });

  it("is null when several places are equally plausible", () => {
    const body =
      "Reporters in Bamenda and Douala filed the same account on prices, volumes and the border closure.";
    expect(suggestLocation("A split survey", body, LOCATIONS)).toBeNull();
  });
});

describe("suggestAltFromCaption", () => {
  it("prefers the editor's caption", () => {
    expect(suggestAltFromCaption("Women grinding pepper at dawn", "Market day")).toBe(
      "Women grinding pepper at dawn",
    );
  });

  it("carries the photographer into alt text a screen reader will announce", () => {
    expect(suggestAltFromCaption("Procession, photo by Ada Ngwa", "The procession")).toBe(
      "The procession — photo by Ada Ngwa",
    );
  });

  it("falls back to the title when there is no caption", () => {
    expect(suggestAltFromCaption("", "Bamenda market fire")).toBe("Bamenda market fire");
  });

  it("cleans a filename when nothing else is available", () => {
    expect(suggestAltFromCaption("", "", "https://cdn.example/IMG_2044_sunset.jpg")).toBe("IMG 2044 sunset");
  });

  it("returns empty when it has nothing to work with", () => {
    expect(suggestAltFromCaption("", "", null)).toBe("");
  });
});

describe("suggestCredit", () => {
  it("defaults the credit to the author when blank", () => {
    expect(suggestCredit("", "Ada Ngwa")).toBe("Ada Ngwa");
  });

  it("never overwrites a credit that exists", () => {
    expect(suggestCredit("Studio Fame", "Ada Ngwa")).toBe("Studio Fame");
  });
});

function baseInput(over: Partial<AutoFillInput> = {}): AutoFillInput {
  return {
    type: "news",
    enTitle: "Bamenda market traders rebuild after the fire",
    frTitle: "",
    enBody:
      "Traders at the Bamenda market are rebuilding their stalls. The fire destroyed forty shops. Trade and commerce have resumed slowly.",
    frBody: "",
    enExcerpt: "",
    frExcerpt: "",
    enSeo: "",
    frSeo: "",
    slug: "",
    tags: "",
    shareText: "",
    categoryId: "",
    locationId: "",
    authorName: "Ada Ngwa",
    categories: CATEGORIES,
    locations: LOCATIONS,
    ...over,
  };
}

describe("draftRemainingFields", () => {
  it("drafts every empty derived field in one pass", () => {
    const { patch, applied } = draftRemainingFields(baseInput());
    expect(applied).toContain("slug");
    expect(applied).toContain("enExcerpt");
    expect(applied).toContain("enSeo");
    expect(applied).toContain("tags");
    expect(applied).toContain("shareText");
    expect(patch.slug).toBe("bamenda-market-traders-rebuild-after-the-fire");
    expect(applied.length).toBeGreaterThanOrEqual(5);
  });

  it("never overwrites a field the editor already filled", () => {
    const { patch, applied } = draftRemainingFields(
      baseInput({ slug: "keep-me", enExcerpt: "My own excerpt." }),
    );
    expect(patch.slug).toBeUndefined();
    expect(patch.enExcerpt).toBeUndefined();
    expect(applied).not.toContain("slug");
  });

  it("never overwrites a touched field even when it is empty", () => {
    const { patch } = draftRemainingFields(
      baseInput({ touched: new Set(["tags", "categoryId", "locationId"]) }),
    );
    expect(patch.tags).toBeUndefined();
    expect(patch.categoryId).toBeUndefined();
    expect(patch.locationId).toBeUndefined();
  });

  it("reports the classifications it could not resolve instead of guessing", () => {
    const { patch, unresolved } = draftRemainingFields(
      baseInput({
        enTitle: "A short note",
        enBody: "Nothing here maps to any taxonomy at all, anywhere near us.",
      }),
    );
    expect(patch.categoryId).toBeUndefined();
    expect(patch.locationId).toBeUndefined();
    expect(unresolved.length).toBeGreaterThan(0);
  });

  it("leaves a fully-populated form untouched", () => {
    const filled = baseInput({
      slug: "s",
      enExcerpt: "e",
      frExcerpt: "e",
      enSeo: "seo",
      frSeo: "seo",
      // Tags stay empty: `suggestTags` is additive, so any keyword in the body
      // is legitimately still draftable. The append-only behaviour is asserted
      // separately below.
      tags: "",
      shareText: "share",
      categoryId: "c-market",
      locationId: "l-bamenda",
    });
    const { patch, applied } = draftRemainingFields({
      ...filled,
      touched: new Set(["tags"]),
    });
    expect(applied).toEqual([]);
    expect(patch).toEqual({});
  });

  it("appends to existing tags instead of replacing them", () => {
    const { patch } = draftRemainingFields(baseInput({ tags: "bamenda, fire" }));
    expect(patch.tags).toBeDefined();
    const parsed = (patch.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean);
    // The editor's own keywords must all survive the pass.
    expect(parsed).toEqual(expect.arrayContaining(["bamenda", "fire"]));
  });

  it("drafts prose from the body, not from generated section markup", () => {
    const { patch } = draftRemainingFields(
      baseInput({
        enBody:
          'Lead sentence about the market fire that is long enough to draft.\n\n<div class="story-blocks"><h2>Section</h2><figure><img src="https://cdn.example/a.jpg" alt="x" loading="lazy" /></figure></div>',
      }),
    );
    expect(patch.enExcerpt).toContain("Lead sentence");
    expect(patch.enExcerpt).not.toContain("<");
    expect(patch.enExcerpt).not.toContain("story-blocks");
  });

  it("never drafts French fields from English source text", () => {
    // The regression that shipped English under locale 'fr': the one-click
    // pass filled frExcerpt/frSeo with the same English-derived strings.
    const { patch } = draftRemainingFields(baseInput());
    expect(patch.enExcerpt).toBeTruthy();
    expect(patch.frExcerpt).toBeUndefined();
    expect(patch.frSeo).toBeUndefined();
  });

  it("drafts French fields from French prose when the editor wrote French", () => {
    const { patch } = draftRemainingFields(
      baseInput({
        frTitle: "Reconstruction du marché de Bamenda",
        frBody:
          "Les commerçants du marché de Bamenda reconstruisent leurs étals après l’incendie qui a tout détruit.",
      }),
    );
    expect(patch.frExcerpt).toContain("commerçants");
    expect(patch.frSeo).toContain("marché");
  });
});

