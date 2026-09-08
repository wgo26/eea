import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { ArrowLeft } from "lucide-react";

import { getDictionary, resolveLocale } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/urls";
import { CorrectionForm } from "@/components/news/correction-form";

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
        <div className="mx-auto w-full max-w-2xl px-4 py-8 md:px-6 lg:px-8">
            <Link
                href={localePath(locale, `/news/${slug}`)}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                {dict.news.correctionBackToArticle}
            </Link>
            <h1 className="mt-4 text-2xl font-extrabold tracking-tight md:text-3xl">
                {dict.news.correctionTitle}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{dict.news.correctionIntro}</p>
            <div className="mt-6">
                <CorrectionForm slug={slug} dict={dict} locale={locale} />
            </div>
        </div>
    );
}

