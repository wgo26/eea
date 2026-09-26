/**
 * Content auto-fill (client-safe: no secrets, no network, no LLM provider).
 *
 * The repetitive fields of a post are *derived* from the two fields an editor
 * actually writes - the title and the body. These heuristics draft them
 * deterministically, so creating a post is one review pass instead of eight
 * blank inputs. Nothing here touches the DB: every suggestion lands in the form
 * and the editor saves as usual.
 *
 * Three rules keep it trustworthy:
 *  1. Never overwrite what was typed. `draftRemainingFields` fills only empty
 *     fields and reports which ones it touched, so the form can stop re-deriving
 *     a field the moment the editor edits it by hand.
 *  2. Suggest, never assert. `suggestCategory` / `suggestLocation` return null
 *     below the confidence floor instead of guessing into a required select -
 *     a wrong category silently mis-ships where the post appears site-wide.
 *  3. Stay client-safe and dependency-free, so the admin bundle keeps its size.
 */

import { stripStoryBlocksFromBody, type StoryBlock } from "@/lib/content/blocks";

const EN_STOP = new Set(
  "a,an,the,and,or,but,if,then,else,for,to,of,in,on,at,by,with,from,as,is,are,was,were,be,been,being,it,its,this,that,these,those,we,you,they,he,she,our,your,their,his,her,not,no,yes,do,does,did,have,has,had,will,would,can,could,should,may,might,must,shall,into,out,over,under,again,once,here,there,when,where,why,how,all,any,both,each,few,more,most,other,some,such,only,own,same,so,than,too,very,just,about,after,before,between,during,through,while,because,until,say,said,says".split(
    ",",
  ),
);

const FR_STOP = new Set(
  "le,la,les,un,une,des,du,de,au,aux,et,ou,mais,si,alors,pour,de,des,en,dans,sur,sous,par,avec,sans,comme,est,sont,était,étaient,être,avoir,ont,il,elle,nous,vous,ils,elles,son,sa,ses,notre,nos,votre,vos,leur,leurs,ce,cette,ces,cela,ça,que,qui,dont,où,quand,pourquoi,comment,plus,moins,très,tout,tous,toute,toutes,aucun,chaque,quelques,autre,autres,même,si,non,oui,faire,fait,font,aller,va,vont,dire,dit,après,avant,entre,pendant,parce,jusqu".split(
    ",",
  ),
);

function stripHtml(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+(?=[A-Z0-9«"“({\[])/u)
    .map((s) => s.trim())
    .filter((s) => s.length >= 20);
}

/** First meaty sentence(s) of the body, capped at 280 chars. */
export function suggestExcerpt(body: string, maxChars = 280): string {
  const plain = stripHtml(body);
  if (!plain) return "";
  const sentences = splitSentences(plain);
  const first = sentences[0] ?? plain;
  if (first.length <= maxChars) {
    const second = sentences[1];
    if (second && `${first} ${second}`.length <= maxChars) return `${first} ${second}`;
    return first;
  }
  const cut = first.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Meta description: title-led, ≤160 chars (search-engine budget). */
export function suggestSeoDescription(title: string, excerpt: string, maxChars = 160): string {
  const t = title.trim().replace(/\s+/g, " ");
  const e = stripHtml(excerpt).replace(/\s+/g, " ");
  if (!t && !e) return "";
  if (!e) return t.slice(0, maxChars);
  const combined = `${t} — ${e}`;
  if (combined.length <= maxChars) return combined;
  const cut = combined.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function slugifyBase(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** URL-safe slug base from the title (server collision-suffixes on save). */
export function suggestSlug(title: string, fallback = "story"): string {
  return slugifyBase(title) || fallback;
}

/** WhatsApp share line: title trimmed to the 280-char budget. */
export function suggestShareText(title: string, excerpt: string): string {
  const t = title.trim().replace(/\s+/g, " ");
  if (!t) return "";
  if (t.length <= 280) return t;
  const e = stripHtml(excerpt);
  const short = t.slice(0, 240);
  const lastSpace = short.lastIndexOf(" ");
  void e;
  return `${(lastSpace > 120 ? short.slice(0, lastSpace) : short).trimEnd()}…`;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zàâäéèêëîïôöùûüç'\- ]/gi, " ")
    .split(/[\s'’‘\-–—/.,;:!?()[\]{}"“”«»]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 4 && w.length <= 24 && !EN_STOP.has(w) && !FR_STOP.has(w) && !/^\d+$/.test(w));
}

/** Keyword candidates from title (×3 weight) + body, capped at 8. */
export function suggestTags(title: string, body: string, existing: string[] = [], maxTags = 8): string[] {
  const have = new Set(existing.map((t) => t.trim().toLowerCase()).filter(Boolean));
  const counts = new Map<string, number>();
  for (const w of tokenize(title)) counts.set(w, (counts.get(w) ?? 0) + 3);
  for (const w of tokenize(stripHtml(body))) counts.set(w, (counts.get(w) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([w]) => w)
    .filter((w) => !have.has(w))
    .slice(0, Math.max(0, maxTags - have.size));
}


export function suggestExcerptFromBlocks(blocks: StoryBlock[], maxChars = 280): string {
  const eligible = blocks.filter(
    (b) => b.isSummary !== false && (b.heading.trim() || b.body.trim()) && b.type !== "divider",
  );
  if (eligible.length === 0) return "";
  if (eligible.length === 1) {
    const only = eligible[0]!;
    return suggestExcerpt([only.heading, only.body].filter(Boolean).join("\n\n"), maxChars);
  }
  const ranked = [...eligible].sort(
    (a, b) => `${b.heading} ${b.body}`.length - `${a.heading} ${a.body}`.length,
  );
  return suggestExcerpt([ranked[0]!.heading, ranked[0]!.body].filter(Boolean).join("\n\n"), maxChars);
}

/* --------------------------------------------------------------------------
 * Classification + alt text: the fields the form could not draft before
 * ------------------------------------------------------------------------ */

/**
 * A candidate taxonomy row. Deliberately structural, so callers pass the option
 * lists the form already receives (`categoriesByType`, `locations`) — no new
 * query, no DB round-trip, nothing to keep in sync.
 */
export type TaxonomyOption = { id: string; name: string; slug?: string };

/** ASCII-folded, lowercased, whitespace-collapsed — accents must not matter. */
function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Tokens of a taxonomy label.
 *
 * Not `tokenize`: that drops words under 4 characters and all stop-words, which
 * is right for keywords but wrong for a name — "Art", "Food" and "Health" would
 * vanish and the label could then never be matched at all.
 */
function labelTokens(name: string): string[] {
  return fold(name)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !EN_STOP.has(w) && !FR_STOP.has(w));
}

/** True when `phrase` occurs in `haystack` on word boundaries (accent-free). */
function containsPhrase(haystack: string, phrase: string): boolean {
  if (!phrase) return false;
  const needle = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${needle}([^a-z0-9]|$)`, "i").test(haystack);
}

export type TaxonomySuggestion = {
  id: string;
  name: string;
  /** 0..1 — how much of the label was found, and where. */
  confidence: number;
};

/**
 * Shared scorer for a category and a location.
 *
 * A label scores by how many of its words appear in the post (weighted for the
 * title) and by full coverage: one word of a two-word label is a coincidence,
 * not a classification. The margin over the runner-up matters as much as the
 * score — when two taxonomies are equally plausible ("Market day" could be
 * Commerce or Culture) the honest answer is that the form does not know, so it
 * returns null and the editor picks. Guessing into a required select is worse
 * than leaving it empty, because a wrong value silently changes where the post
 * appears site-wide and nothing downstream ever flags it.
 */
function scoreTaxonomy(title: string, body: string, options: TaxonomyOption[]): TaxonomySuggestion | null {
  if (options.length === 0) return null;
  const foldedTitle = fold(title);
  const foldedBody = fold(stripHtml(body));
  if (!foldedTitle && !foldedBody) return null;

  const scored = options
    .map((opt) => {
      const tokens = labelTokens(opt.name);
      if (tokens.length === 0) return { opt, score: 0, confidence: 0 };
      let hits = 0;
      let raw = 0;
      for (const t of tokens) {
        const inTitle = containsPhrase(foldedTitle, t);
        const inBody = containsPhrase(foldedBody, t);
        if (!inTitle && !inBody) continue;
        hits += 1;
        raw += inTitle ? 3 : 1;
      }
      const coverage = hits / tokens.length;
      // The whole name appearing is the strongest single signal: "Bamenda" or
      // "Arts & Culture" as a unit beats its parts appearing apart.
      const wholeName = containsPhrase(foldedBody, fold(opt.name)) || containsPhrase(foldedTitle, fold(opt.name));
      if (wholeName) raw += tokens.length;
      const confidence = hits === 0 ? 0 : Math.min(1, (raw / (tokens.length * 4)) * (wholeName ? 1 : coverage));
      return { opt, score: raw, confidence };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;
  const best = scored[0]!;
  const runnerUp = scored[1];
  if (best.confidence < 0.35) return null;
  // A tie is an abstention, not a coin flip.
  if (runnerUp && best.score <= runnerUp.score) return null;
  return { id: best.opt.id, name: best.opt.name, confidence: Math.round(best.confidence * 100) / 100 };
}

/**
 * Draft the category from title + body against the categories already loaded
 * for this content type. Null when the text gives no clear answer, so the
 * required select stays honestly empty instead of wrongly filled.
 */
export function suggestCategory(title: string, body: string, categories: TaxonomyOption[]): TaxonomySuggestion | null {
  return scoreTaxonomy(title, body, categories);
}

/**
 * Draft the location from place names mentioned in the text. Accents are folded
 * both ways, so "Buea" matches a row stored as "Buéa" and vice versa.
 */
export function suggestLocation(title: string, body: string, locations: TaxonomyOption[]): TaxonomySuggestion | null {
  return scoreTaxonomy(title, body, locations);
}

/* --------------------------------------------------------------------------
 * Alt text + credit
 * ------------------------------------------------------------------------ */

/**
 * Alt text for one image: its caption first, then the post title (with the
 * photographer when the caption names one), then a cleaned filename.
 *
 * Before this, every block image with no alt fell back to the literal
 * "Story image". On an image-first platform that is a silent loss twice over: a
 * screen reader announces nothing, and the picture contributes nothing to
 * search or to a share card.
 */
export function suggestAltFromCaption(
  caption: string | null | undefined,
  title: string,
  filenameOrUrl?: string | null,
): string {
  const cap = (caption ?? "").trim();
  const t = (title ?? "").trim();
  if (cap && t && cap.toLowerCase() !== t.toLowerCase()) {
    // A credit inside the caption belongs in the alt too - it is the one piece
    // of attribution a reader who cannot see the image would otherwise lose.
    const photographer = cap.match(/(?:photos?|cr[ée]dits?|img|©)\s*[:\-]?\s*(?:by|par|de)?\s*([^,.;]+)/i)?.[1]?.trim();
    return photographer ? `${t} — photo by ${photographer}`.slice(0, 200) : cap.slice(0, 200);
  }
  if (cap) return cap.slice(0, 200);
  if (t) return t.slice(0, 200);

  const raw = (filenameOrUrl ?? "").trim();
  if (!raw) return "";
  try {
    const base = decodeURIComponent(new URL(raw).pathname.split("/").pop() ?? raw);
    return base
      .replace(/\.[a-z0-9]{2,5}$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);
  } catch {
    return raw
      .replace(/\.[a-z0-9]{2,5}$/i, "")
      .replace(/[-_/]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);
  }
}

/* --------------------------------------------------------------------------
 * draftRemainingFields — the five assist buttons collapsed into one
 * ------------------------------------------------------------------------ */

/** The fields "Draft the rest" can write, used as the touched-tracking keys. */
export type AutoFillField =
  | "slug"
  | "enExcerpt"
  | "frExcerpt"
  | "enSeo"
  | "frSeo"
  | "tags"
  | "categoryId"
  | "locationId"
  | "shareText";

export type AutoFillInput = {
  type: string;
  enTitle: string;
  frTitle: string;
  enBody: string;
  frBody: string;
  enExcerpt: string;
  frExcerpt: string;
  enSeo: string;
  frSeo: string;
  slug: string;
  tags: string;
  shareText: string;
  categoryId: string;
  locationId: string;
  authorName: string;
  categories: TaxonomyOption[];
  locations: TaxonomyOption[];
  /** Fields the editor already edited by hand - never overwritten. */
  touched?: ReadonlySet<AutoFillField>;
};

export type AutoFillResult = {
  /** Partial patch for the form; only the fields actually drafted. */
  patch: Partial<Record<AutoFillField, string>>;
  /** Which fields were written, so the UI can highlight them. */
  applied: AutoFillField[];
  /** Which required classifications stayed unresolved, to show why. */
  unresolved: AutoFillField[];
};

/**
 * Runs every drafter in one pass over the fields the editor left empty.
 *
 * This is the collapse the form needed: five separate ✨ buttons asked the
 * editor to know which derived fields exist, when one click does all of them.
 * The per-field buttons stay available for when only one is wrong.
 *
 * Two guards make it safe to run repeatedly: it only ever writes empty fields
 * (and any field in `touched`), and `suggestCategory` / `suggestLocation`
 * abstain rather than guess, so the result is "here is what the text supports",
 * never a filled-in form full of plausible nonsense. `categoryId` / `locationId`
 * are publish-readiness gates, so resolving them is what removes the manual
 * chore entirely.
 */
export function draftRemainingFields(input: AutoFillInput): AutoFillResult {
  const touched = input.touched ?? new Set<AutoFillField>();
  const patch: Partial<Record<AutoFillField, string>> = {};
  const applied: AutoFillField[] = [];
  const unresolved: AutoFillField[] = [];

  const write = (field: AutoFillField, value: string | null | undefined) => {
    if (touched.has(field)) return;
    const v = (value ?? "").trim();
    if (!v) return;
    patch[field] = v;
    applied.push(field);
  };

  const title = input.enTitle || input.frTitle;
  // Drafted from the prose, not from the generated section markup: an excerpt
  // that starts "<div class=story-blocks>" is worse than no excerpt.
  const excerptSource = stripStoryBlocksFromBody(input.enBody || "");
  // The French fields draft from FRENCH source text only. Drafting them from
  // the English body is what filled frExcerpt/frSeo with English and shipped
  // it; the fr pass exists to catch the fr-first editor, not to launder the
  // en pass. Empty French source → empty suggestion: translation is the
  // translate button's job (which runs the guarded pipeline), not this one.
  const frExcerptSource = stripStoryBlocksFromBody(input.frBody || "");
  const hasFrSource = Boolean((input.frTitle || input.frBody || "").trim());

  write("slug", input.slug ? null : suggestSlug(title));

  const excerpt = suggestExcerpt(excerptSource);
  if (excerpt) {
    write("enExcerpt", input.enExcerpt ? null : excerpt);
  }
  const frExcerpt = suggestExcerpt(frExcerptSource);
  if (hasFrSource && frExcerpt) {
    write("frExcerpt", input.frExcerpt ? null : frExcerpt);
  }

  const enSeo = suggestSeoDescription(input.enTitle || title, input.enExcerpt || excerpt || excerptSource);
  if (enSeo) write("enSeo", input.enSeo ? null : enSeo);
  if (hasFrSource) {
    const frSeo = suggestSeoDescription(input.frTitle || title, input.frExcerpt || frExcerpt || frExcerptSource);
    if (frSeo) write("frSeo", input.frSeo ? null : frSeo);
  }

  const existingTags = input.tags.split(",").map((t) => t.trim()).filter(Boolean);
  const tags = suggestTags(
    `${input.enTitle} ${input.frTitle}`,
    stripStoryBlocksFromBody(input.enBody || "") + " " + stripStoryBlocksFromBody(input.frBody || ""),
    existingTags,
  );
  if (tags.length > 0) {
    const merged = [...existingTags, ...tags].join(", ");
    // Only a real change counts as drafted. Writing the same string back would
    // make the derived-field effect re-fire forever, since its own output is
    // one of the values it watches.
    if (merged !== input.tags) write("tags", merged);
  }

  write("shareText", input.shareText ? null : suggestShareText(title, input.enExcerpt || excerpt || excerptSource));

  const proseForTaxonomy =
    stripStoryBlocksFromBody(input.enBody || "") + " " + stripStoryBlocksFromBody(input.frBody || "");
  if (!input.categoryId && !touched.has("categoryId")) {
    const c = suggestCategory(title, proseForTaxonomy, input.categories);
    if (c) write("categoryId", c.id);
    else if (input.categories.length > 0) unresolved.push("categoryId");
  }
  if (!input.locationId && !touched.has("locationId")) {
    const l = suggestLocation(title, proseForTaxonomy, input.locations);
    if (l) write("locationId", l.id);
    else if (input.locations.length > 0) unresolved.push("locationId");
  }

  return { patch, applied, unresolved };
}

/**
 * Default a photo credit to the byline/author when it is empty, so a 20-picture
 * drop does not publish with every credit blank.
 */
export function suggestCredit(
  credit: string | null | undefined,
  authorName: string | null | undefined,
): string {
  const c = (credit ?? "").trim();
  if (c) return c;
  return (authorName ?? "").trim();
}


