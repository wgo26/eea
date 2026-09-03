import * as React from "react";

/**
 * Minimal markdown-ish renderer for `policy_versions.content`:
 *  - `# ` / `## ` lead a block → heading
 *  - every line starting with `- ` → bullet list
 *  - `**bold**` inline → <strong>
 *  - blank-line separated blocks → paragraphs
 * Intentionally tiny: policy copy is short and editor-authored.
 */
function renderInline(text: string): React.ReactNode[] {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
        const match = part.match(/^\*\*([^*]+)\*\*$/);
        if (match) return <strong key={i}>{match[1]}</strong>;
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
                if (block.startsWith("## ")) {
                    return (
                        <h2 key={i} className="text-xl font-extrabold text-foreground">
                            {block.slice(3)}
                        </h2>
                    );
                }
                if (block.startsWith("# ")) {
                    return (
                        <h1 key={i} className="text-2xl font-extrabold text-foreground">
                            {block.slice(2)}
                        </h1>
                    );
                }
                const lines = block.split(/\n+/).map((l) => l.trim());
                const isList = lines.length > 0 && lines.every((l) => l.startsWith("- "));
                if (isList) {
                    return (
                        <ul key={i} className="list-disc space-y-1 pl-5">
                            {lines.map((line, j) => (
                                <li key={j}>{renderInline(line.slice(2))}</li>
                            ))}
                        </ul>
                    );
                }
                return <p key={i}>{renderInline(block)}</p>;
            })}
        </div>
    );
}
