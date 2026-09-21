import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { buildAlternates } from "@/lib/i18n/urls";
import { getDictionary, resolveLocale } from "@/lib/i18n";
import { OfflineSavedList } from "@/components/system/offline-saved-list";

/**
 * Phase 4 — offline fallback page. The service worker serves this for failed
 * navigations (per locale), and it lists explicitly saved articles from the
 * localStorage index — every entry backed by the worker's articles cache.
 * Fully static (no request APIs), so it is always in the precache.
 */
export async function generateMetadata({
    params,
}: {
    params: Promise<{ locale: string }>;
}): Promise<Metadata> {
    const { locale: raw } = await params;
    const locale = resolveLocale(raw);
    const dict = getDictionary(locale);
    return {
        title: dict.offline.title,
        description: dict.offline.body,
        alternates: buildAlternates(locale, "/offline"),
        robots: { index: false, follow: false },
    };
}

export default async function OfflinePage({
    params,
}: {
    params: Promise<{ locale: string }>;
}) {
    const { locale: raw } = await params;
    const locale = resolveLocale(raw);
    const dict = getDictionary(locale);

    return (
        <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-12 md:px-6">
            <div className="rounded-[28px] border border-border/70 bg-card p-6 text-center shadow-sm md:p-8">
                <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                    <WifiOff className="h-6 w-6 text-muted-foreground" aria-hidden />
                </span>
                <h1 className="text-2xl font-black tracking-tight md:text-3xl">
                    {dict.offline.title}
                </h1>
                <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                    {dict.offline.body}
                </p>
            </div>
            <OfflineSavedList title={dict.offline.savedTitle} empty={dict.offline.savedEmpty} />
        </div>
    );
}
