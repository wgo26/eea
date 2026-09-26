import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, History } from "lucide-react";

import { ContentBreadcrumb } from "@/components/system/content-breadcrumb";
import { buildAlternates, localePath } from "@/lib/i18n/urls";
import {
    formatDate,
    getDictionary,
    resolveLocale,
    type Dictionary,
    type Locale,
} from "@/lib/i18n";
import { getCorrectionRegister, type RegisterEntry } from "@/lib/queries/corrections";

export const revalidate = 300;

/**
 * The public correction register.
 *
 * This page is what makes "a pan-African record" a defensible phrase. A feed
 * deletes its mistakes; a record prints them. Every row here began as a
 * reader pressing "report a correction" on an article and ended with an
 * editor confirming it — so the register is also the proof that the forms on
 * the detail pages lead somewhere.
 *
 * Scope, and why it is narrow: only RESOLVED corrections appear. Reports an
 * editor declined stay private — a corrections trail that doubles as a
 * disputes log stops recording what was wrong and starts being an argument.
 * Declined reports remain visible to staff in /admin/trust-safety.
 */
export async function generateMetadata({
    params,
}: {
    params: Promise<{ locale: string }>;
}): Promise<Metadata> {
    const { locale: rawLocale } = await params;
    const locale = resolveLocale(rawLocale);
    const dict = getDictionary(locale);
    return {
        title: dict.about.correctionsTitle,
        description: dict.about.correctionsMetaDesc,
        alternates: buildAlternates(locale, "/about/corrections"),
    };
}

export default async function CorrectionsRegisterPage({
    params,
}: {
    params: Promise<{ locale: string }>;
}) {
    const { locale: rawLocale } = await params;
    const locale = resolveLocale(rawLocale);
    const dict = getDictionary(locale);
    const c = dict.about;
    const entries = await getCorrectionRegister({ limit: 100, locale });

    return (
        <div className="mx-auto w-full max-w-4xl px-4 py-8 md:px-6 lg:px-8">
            <ContentBreadcrumb
                locale={locale}
                homeLabel={dict.nav.home}
                trail={[
                    { label: dict.nav.about, path: "/about" },
                    { label: c.correctionsTitle },
                ]}
            />

            <header className="mt-6 max-w-3xl">
                <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.24em] text-primary">
                    <History className="h-4 w-4" aria-hidden />
                    {c.correctionsTitle}
                </p>
                <h1 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">
                    {c.correctionsHeading}
                </h1>
                <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                    {c.correctionsIntro}
                </p>
                {entries.length > 0 ? (
                    <p className="mt-4 text-sm font-bold tabular-nums">
                        {c.correctionsCount.replace("{count}", String(entries.length))}
                    </p>
                ) : null}
            </header>

            {entries.length === 0 ? (
                <EmptyRegister dict={dict} locale={locale} />
            ) : (
                <ol className="mt-8 space-y-4">
                    {entries.map((entry) => (
                        <RegisterRow key={entry.id} entry={entry} dict={dict} locale={locale} />
                    ))}
                </ol>
            )}

            <p className="mt-8 rounded-2xl border bg-muted/40 p-4 text-sm leading-relaxed text-muted-foreground">
                <Link
                    href={localePath(locale, "/about/verification")}
                    className="font-bold text-primary hover:underline"
                >
                    {c.verificationTitle}
                </Link>
                {" — "}
                {c.verificationFooter}
            </p>
        </div>
    );
}

/**
 * Empty state with dignity. An empty register is not a claim of perfection —
 * it means the loop has not yet been walked, so the copy says that and hands
 * the reader the way in (find a story, use its correction form).
 */
function EmptyRegister({ dict, locale }: { dict: Dictionary; locale: Locale }) {
    const c = dict.about;
    return (
        <section className="mt-8 rounded-2xl border border-dashed p-8 text-center">
            <p className="text-sm font-extrabold">{c.correctionsEmpty}</p>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
                {c.correctionsEmptyBody}
            </p>
            <Link
                href={localePath(locale, "/news")}
                className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline"
            >
                {c.ctaExplore}
                <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
        </section>
    );
}

/** One published correction and the story it fixed. */
function RegisterRow({
    entry,
    dict,
    locale,
}: {
    entry: RegisterEntry;
    dict: Dictionary;
    locale: Locale;
}) {
    const c = dict.about;
    const label = entry.contentTitle || c.correctionsStoryLabel;

    return (
        <li className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                {entry.contentHref ? (
                    <Link
                        href={localePath(locale, entry.contentHref)}
                        className="text-base font-extrabold tracking-tight hover:underline"
                    >
                        {label}
                    </Link>
                ) : (
                    <span className="text-base font-extrabold tracking-tight">{label}</span>
                )}
                {entry.resolvedAt ? (
                    <span className="shrink-0 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        {c.correctionsResolvedOn.replace(
                            "{date}",
                            formatDate(entry.resolvedAt, locale),
                        )}
                    </span>
                ) : null}
            </div>

            <p className="mt-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {c.correctionsWhatWasWrong}
            </p>
            {/* Stored as the form's own two-part plain text; pre-line keeps it
                readable without introducing a markdown renderer. */}
            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">
                {entry.correctionText}
            </p>

            <p className="mt-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {c.correctionsWhatChanged}
            </p>
            <p className="mt-1 text-sm leading-relaxed">
                {entry.resolution || (
                    <span className="italic text-muted-foreground">{c.correctionsNoNote}</span>
                )}
            </p>
        </li>
    );
}
