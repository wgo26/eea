import * as React from "react";

/**
 * Minimal markdown-ish renderer for `policy_versions.content`:
 *  - `# ` / `## ` / `### ` lead a block → headings
 *  - every line starting with `- ` → bullet list
 *  - every line starting with `1. ` (etc.) → ordered list
 *  - `**bold**` inline → <strong>
 *  - `[text](url)` inline → <a> (same-origin relative links only; anything
 *    else opens in a new tab with noopener)
 *  - blank-line separated blocks → paragraphs
 * Intentionally tiny: policy copy is short and editor-authored.
 */
function renderInline(text: string): React.ReactNode[] {
    const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g);
    return parts.map((part, i) => {
        const bold = part.match(/^\*\*([^*]+)\*\*$/);
        if (bold) return <strong key={i}>{bold[1]}</strong>;
        const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (link) {
            const [, label, href] = link;
            const internal = href.startsWith("/") || href.startsWith("#");
            return internal ? (
                <a key={i} href={href} className="font-medium text-primary underline underline-offset-2">
                    {label}
                </a>
            ) : (
                <a
                    key={i}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-primary underline underline-offset-2"
                >
                    {label}
                </a>
            );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
    });
}

export function PolicyContent({ content }: { content: string }) {
    const blocks = content
        .split(/\n\n+/)
        .map((b) => b.trim())
        .filter(Boolean);

    return (
        <div className="max-w-3xl space-y-4 text-sm leading-relaxed text-muted-foreground md:text-base">
            {blocks.map((block, i) => {
                if (block.startsWith("### ")) {
                    return (
                        <h3 key={i} className="text-base font-extrabold text-foreground md:text-lg">
                            {renderInline(block.slice(4))}
                        </h3>
                    );
                }
                if (block.startsWith("## ")) {
                    return (
                        <h2 key={i} className="text-xl font-extrabold text-foreground">
                            {renderInline(block.slice(3))}
                        </h2>
                    );
                }
                if (block.startsWith("# ")) {
                    return (
                        <h1 key={i} className="text-2xl font-extrabold text-foreground">
                            {renderInline(block.slice(2))}
                        </h1>
                    );
                }
                const lines = block.split(/\n+/).map((l) => l.trim());
                const isBullet = lines.length > 0 && lines.every((l) => l.startsWith("- "));
                if (isBullet) {
                    return (
                        <ul key={i} className="list-disc space-y-1 pl-5">
                            {lines.map((line, j) => (
                                <li key={j}>{renderInline(line.slice(2))}</li>
                            ))}
                        </ul>
                    );
                }
                const isOrdered = lines.length > 0 && lines.every((l) => /^\d+[.)]\s/.test(l));
                if (isOrdered) {
                    return (
                        <ol key={i} className="list-decimal space-y-1 pl-5">
                            {lines.map((line, j) => (
                                <li key={j}>{renderInline(line.replace(/^\d+[.)]\s/, ""))}</li>
                            ))}
                        </ol>
                    );
                }
                return <p key={i}>{renderInline(block)}</p>;
            })}
        </div>
    );
}
