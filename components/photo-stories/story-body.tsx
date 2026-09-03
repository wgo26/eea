/** Splits essay prose into paragraphs on blank lines or single newlines. */
function toParagraphs(text: string): string[] {
    return text
        .split(/\n{2,}/)
        .flatMap((block) => block.split("\n"))
        .map((paragraph) => paragraph.trim())
        .filter(Boolean);
}

/**
 * Renders the essay's prose from `content_translations.body`. Purposely
 * plain-text: no HTML is ever trusted from the database, and the typography
 * carries the editorial tone (spec §1 "one community board" tone).
 */
export function StoryBody({ body }: { body: string }) {
    const paragraphs = toParagraphs(body);

    return (
        <div className="mx-auto max-w-3xl space-y-6 text-base leading-[1.85] text-foreground/90 md:text-[17px]">
            {paragraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
            ))}
        </div>
    );
}