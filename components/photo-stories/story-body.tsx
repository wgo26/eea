/** Splits essay prose into paragraphs on blank lines or single newlines. */
function toParagraphs(text: string): string[] {
    return text
        .split(/\n{2,}/)
        .flatMap((block) => block.split("\n"))
        .map((paragraph) => paragraph.trim())
        .filter(Boolean);
}

/**
 * Renders the essay body from `content_translations.body`.
 *
 * Native drafts are plain text and keep the paragraph-list renderer (no HTML
 * is ever trusted from the database). Imported Blogger posts and admin
 * story-block sections arrive as markup, so the caller detects them with
 * `isHtmlBody`, sanitizes server-side and passes `bodyHtml` - the same
 * contract the news detail page uses. Without that branch a section-built
 * story showed readers literal `<h2>` / `<figure>` source text.
 *
 * Sanitizing in the page rather than here keeps `sanitize-html` out of any
 * client bundle this component ends up in.
 */
export function StoryBody({
    body,
    bodyHtml = null,
}: {
    body: string;
    /** Body already run through `sanitizeBodyHtml`; takes precedence. */
    bodyHtml?: string | null;
}) {
    const wrapper = "mx-auto max-w-3xl text-base leading-[1.85] text-foreground/90 md:text-[17px]";

    if (bodyHtml) {
        return (
            <div className={`${wrapper} article-body`}>
                <div className="max-w-none" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
            </div>
        );
    }

    const paragraphs = toParagraphs(body);

    return (
        <div className={`${wrapper} space-y-6`}>
            {paragraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
            ))}
        </div>
    );
}
