import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { ArrowLeft } from "lucide-react";

import { getDictionary, resolveLocale } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/urls";
import { SubmitFormGated } from "@/components/submit/submit-form-gated";

export async function generateMetadata(): Promise<Metadata> {
    const locale = resolveLocale((await headers()).get("x-locale"));
    return {
        title: getDictionary(locale).buySell.postTitle,
        robots: { index: false, follow: false },
    };
}

export default async function Page({
    params,
}: {
    params: Promise<{ locale: string }>;
}) {
    const { locale: rawLocale } = await params;
    const locale = resolveLocale(rawLocale);
    const dict = getDictionary(locale);

    return (
        <div className="mx-auto w-full max-w-2xl px-4 py-8 md:px-6 lg:px-8">
            <Link
                href={localePath(locale, "/buy-sell")}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                {dict.nav.buySell}
            </Link>
            <h1 className="mt-4 text-2xl font-extrabold tracking-tight md:text-3xl">
                {dict.buySell.postTitle}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{dict.buySell.postTagline}</p>
            <div className="mt-6">
                <SubmitFormGated type="buy-sell" dict={dict} />
            </div>
        </div>
    );
}

