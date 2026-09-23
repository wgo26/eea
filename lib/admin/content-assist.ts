/**
 * Content smart-assist (client-safe, no secrets, no network).
 *
 * "AI auto-fill" without an LLM provider: deterministic editorial heuristics
 * that draft the repetitive fields from what the editor already typed
 * (title + body), so creating content is one review pass instead of five
 * blank inputs. Every suggestion is written into the form for review —
 * nothing touches the DB until the editor saves.
 *
 * - `suggestExcerpt` — first meaty sentence(s) of the body, ≤280 chars.
 * - `suggestSeoDescription` — title + excerpt compressed to ≤160 chars.
 * - `suggestTags` — keyword candidates from title + body (stop-word
 *   filtered, EN+FR aware), capped at 8.
 * - `suggestSlug` — URL-safe slug base from the title.
 * - `suggestShareText` — WhatsApp one-liner (title, ≤280 chars).
 * - `serializeStoryBlocks` — story-block builder output → sanitizer-safe
 *   HTML (h2 + figure/img/figcaption + p only), so text/image pairings
 *   survive `sanitizeBodyHtml` and render with TOC/pull-quote support.
 */

export type StoryBlock = {
  id: string;
  heading: string;
  body: string;
  imageUrl: string;
  imageAlt: string;
  imageCaption: string;
  /** Visual pairing: image above the text, or floated beside it. */
  layout: "image-top" | "image-left" | "image-right";
};

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

function escapeHtmlAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeHtmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function paragraphsOf(body: string): string {
  return body
    .split(/\n{2,}|\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtmlText(p)}</p>`)
    .join("");
}

/**
 * Story blocks → sanitizer-safe HTML. Only h2/figure/img/figcaption/p are
 * emitted (the exact `sanitizeBodyHtml` allowlist), so a paired text+image
 * section survives ingestion AND render, gains TOC anchors (h2) and never
 * smuggles interactivity. Layouts map to inline `style` values the sanitizer
 * keeps (float/max-width); the public `article-body` prose styles the rest.
 */
export function serializeStoryBlocks(blocks: StoryBlock[]): string {
  const out: string[] = [];
  for (const b of blocks) {
    const heading = b.heading.trim();
    const body = b.body.trim();
    const img = b.imageUrl.trim();
    if (!heading && !body && !img) continue;
    if (heading) out.push(`<h2>${escapeHtmlText(heading)}</h2>`);
    if (img && /^https?:\/\//i.test(img)) {
      const alt = escapeHtmlAttr(b.imageAlt.trim() || heading || "Story image");
      const caption = b.imageCaption.trim();
      const style =
        b.layout === "image-left"
          ? ` style="float: left; max-width: 45%; margin-right: 16px; margin-bottom: 12px;"`
          : b.layout === "image-right"
            ? ` style="float: right; max-width: 45%; margin-left: 16px; margin-bottom: 12px;"`
            : "";
      out.push(
        `<figure${style}><img src="${escapeHtmlAttr(img)}" alt="${alt}" loading="lazy" />${
          caption ? `<figcaption>${escapeHtmlText(caption)}</figcaption>` : ""
        }</figure>`,
      );
    }
    if (body) out.push(paragraphsOf(body));
    if (b.layout !== "image-top" && img) out.push(`<div style="clear: both;"></div>`);
  }
  return out.join("\n");
}

export function createStoryBlock(partial: Partial<StoryBlock> = {}): StoryBlock {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    heading: "",
    body: "",
    imageUrl: "",
    imageAlt: "",
    imageCaption: "",
    layout: "image-top",
    ...partial,
  };
}
