import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { ArrowLeft } from "lucide-react";

import { Placeholder } from "@/components/placeholder";
import { getDictionary, resolveLocale } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/urls";

/** Localized metadata for the correction flow (checklist items 6 + 10). */
export async function generateMetadata(): Promise<Metadata> {
    const locale = resolveLocale((await headers()).get("x-locale"));
    return {
        title: getDictionary(locale).news.correctionTitle,
        robots: { index: false, follow: false },
    };
}

export default async function Page({
    params,
}: {
    params: Promise<{ locale: string; slug: string }>;
}) {
    const { locale: rawLocale, slug } = await params;
    const locale = resolveLocale(rawLocale);
    const dict = getDictionary(locale);

    return (
        <div className="w-full max-w-2xl">
            <Link
                href={localePath(locale, `/news/${slug}`)}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                {dict.news.correctionBackToArticle}
            </Link>
            <Placeholder
                title={dict.news.correctionTitle}
                description={dict.news.correctionIntro}
            />
        </div>
    );
}
