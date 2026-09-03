import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getDictionary, resolveLocale } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/urls";

export async function generateMetadata(): Promise<Metadata> {
    const locale = resolveLocale((await headers()).get("x-locale"));
    return {
        title: getDictionary(locale).submit.successTitle,
        robots: { index: false, follow: false },
    };
}

export default async function Page() {
    const locale = resolveLocale((await headers()).get("x-locale"));
    const dict = getDictionary(locale);
    return (
        <div className="mx-auto w-full max-w-xl px-4 py-16 text-center md:px-6 lg:px-8">
            <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" aria-hidden />
            <h1 className="mt-5 text-2xl font-extrabold tracking-tight md:text-3xl">
                {dict.submit.successTitle}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">
                {dict.submit.successBody}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Button render={<Link href={localePath(locale, "/submit")} />} variant="outline">
                    {dict.submit.title}
                </Button>
                <Button render={<Link href={localePath(locale, "/")} />}>{dict.nav.home}</Button>
            </div>
        </div>
    );
}
