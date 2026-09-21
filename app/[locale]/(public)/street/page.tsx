import type { Metadata } from "next";
import { Eye } from "lucide-react";
import { buildAlternates } from "@/lib/i18n/urls";
import { getDictionary, resolveLocale } from "@/lib/i18n";
import { getMicroStories } from "@/lib/queries/news";
import { StoryCard, EmptySection } from "@/components/home/story-card";
import { SectionHeader } from "@/components/home/section-header";
import { DEFAULT_OG_IMAGE } from "@/lib/seo/og";

export const revalidate = 300;

export async function generateMetadata({
    params,
}: {
    params: Promise<{ locale: string }>;
}): Promise<Metadata> {
    const { locale: raw } = await params;
    const locale = resolveLocale(raw);
    const dict = getDictionary(locale);
    return {
        title: dict.street.title,
        description: dict.street.description,
        alternates: buildAlternates(locale, "/street"),
        openGraph: {
            title: dict.street.title,
            description: dict.street.description,
            locale: locale === "fr" ? "fr_FR" : "en_GB",
            images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630 }],
        },
    };
}

/**
 * Phase 4 — Eye on the Street index (Differentiator #8). One-photo,
 * 50–100-word observations, newest first. Detail pages render in the news
 * one-photo template via the shared /news/[slug] route.
 */
export default async function StreetPage({
    params,
}: {
    params: Promise<{ locale: string }>;
}) {
    const { locale: raw } = await params;
    const locale = resolveLocale(raw);
    const dict = getDictionary(locale);
    const stories = await getMicroStories(locale, 24);

    return (
        <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 md:px-6 lg:px-8">
            <header className="overflow-hidden rounded-[28px] border border-border/70 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.20),transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(34,197,94,0.18),transparent_35%),linear-gradient(135deg,hsl(var(--background)),hsl(var(--muted)/0.55))] p-6 shadow-sm md:p-8">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                    <Eye className="h-3.5 w-3.5" aria-hidden />
                    {dict.news.streetEyebrow}
                </div>
                <h1 className="font-display text-3xl font-black tracking-tight md:text-5xl">
                    {dict.street.title}
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
                    {dict.street.description}
                </p>
            </header>

            {stories.length === 0 ? (
                <EmptySection dict={dict} href={`/${locale}/news`} label={dict.home.viewAll} />
            ) : (
                <section>
                    <SectionHeader
                        title={dict.street.title}
                        hint={dict.street.description}
                    />
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                        {stories.map((s) => (
                            <StoryCard key={s.id} story={s} dict={dict} locale={locale} />
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}
