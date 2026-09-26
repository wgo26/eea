import Link from "next/link";
import { History, PenLine } from "lucide-react";

import { formatDate, type Dictionary, type Locale } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/urls";
import type { PublicCorrection } from "@/lib/queries/corrections";

/**
 * The per-story correction trail.
 *
 * The record's credibility lives here rather than in an adjective: when an
 * editor confirms a reader's report, the change is stamped on the story that
 * changed. This is the public half of the loop that /news/[slug]'s inline
 * CorrectionForm already opens — a reader can see that reporting errors is
 * what the form is *for*, not a dead end.
 *
 * Rendered server-side from getCorrectionsForContent() (PII-free by
 * construction — see that file's privacy contract). Zero rows renders
 * nothing: an absent block is honest, an empty "no corrections" panel on
 * every one of thousands of stories would be noise.
 */
export function CorrectionsNotice({
    corrections,
    dict,
    locale,
    /** Slug of the page it is mounted on, for the "report an error" anchor. */
    storyHref,
}: {
    corrections: PublicCorrection[];
    dict: Dictionary;
    locale: Locale;
    storyHref?: string | null;
}) {
    if (corrections.length === 0) return null;
    const c = dict.about;
    const isSingle = corrections.length === 1;

    return (
        <section
            aria-labelledby="corrections-heading"
            className="rounded-2xl border border-border/70 bg-muted/40 p-4 md:p-5"
        >
            <h2
                id="corrections-heading"
                className="flex items-center gap-2 text-sm font-extrabold tracking-tight"
            >
                <History className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                {isSingle ? c.correctionsOneOnThisStory : c.correctionsOnThisStory}
                {isSingle ? null : (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary tabular-nums">
                        {corrections.length}
                    </span>
                )}
            </h2>

            <ol className="mt-3 space-y-3">
                {corrections.map((correction) => (
                    <li
                        key={correction.id}
                        className="rounded-xl border border-border/60 bg-card p-3.5 text-sm"
                    >
                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            {c.correctionsWhatWasWrong}
                        </p>
                        {/* The stored text is the form's own two-part shape
                            ("What is wrong:\n…\nSuggested correction:\n…").
                            whitespace-pre-line keeps it readable without
                            shipping markdown, and it is plain user text. */}
                        <p className="mt-1 whitespace-pre-line leading-relaxed text-foreground/90">
                            {correction.correctionText}
                        </p>

                        <p className="mt-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            {c.correctionsWhatChanged}
                        </p>
                        <p className="mt-1 flex items-start gap-1.5 leading-relaxed text-foreground/90">
                            {correction.resolution ? (
                                <>
                                    <PenLine className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                                    <span>{correction.resolution}</span>
                                </>
                            ) : (
                                /* No note recorded: say what happened rather
                                   than show an empty field. */
                                <span className="italic text-muted-foreground">
                                    {c.correctionsNoNote}
                                </span>
                            )}
                        </p>

                        <p className="mt-2.5 text-xs text-muted-foreground">
                            {correction.resolvedAt
                                ? c.correctionsResolvedOn.replace(
                                      "{date}",
                                      formatDate(correction.resolvedAt, locale),
                                  )
                                : null}
                            {correction.resolvedAt && correction.reportedAt ? " · " : null}
                            {correction.reportedAt
                                ? c.correctionsReportedOn.replace(
                                      "{date}",
                                      formatDate(correction.reportedAt, locale),
                                  )
                                : null}
                        </p>
                    </li>
                ))}
            </ol>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
                <Link
                    href={localePath(locale, "/about/corrections")}
                    className="font-bold text-primary hover:underline"
                >
                    {c.correctionsViewRegister}
                </Link>
                {storyHref ? (
                    <a
                        href={`${localePath(locale, storyHref)}#correction`}
                        className="font-medium text-muted-foreground hover:text-foreground hover:underline"
                    >
                        {c.correctionsReportOnStory}
                    </a>
                ) : null}
            </div>
        </section>
    );
}
