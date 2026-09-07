import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { ArrowLeft } from "lucide-react";

import { getDictionary, resolveLocale } from "@/lib/i18n";
import { SubmitForm } from "@/components/submit/submit-form";
import { localePath } from "@/lib/i18n/urls";

export async function generateMetadata(): Promise<Metadata> {
    const locale = resolveLocale((await headers()).get("x-locale"));
    const dict = getDictionary(locale);
    return { title: dict.submit.types.buySell.title };
}

export default async function Page() {
    const locale = resolveLocale((await headers()).get("x-locale"));
    const dict = getDictionary(locale);
    const meta = dict.submit.types.buySell;
    return (
        <div className="mx-auto w-full max-w-2xl px-4 py-8 md:px-6 lg:px-8">
            <Link
                href={localePath(locale, "/submit")}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                {dict.submit.back}
            </Link>
            <h1 className="mt-4 text-2xl font-extrabold tracking-tight md:text-3xl">
                {meta.title}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{meta.blurb}</p>
            <div className="mt-6">
                <SubmitForm type="buy-sell" dict={dict} />
            </div>
        </div>
    );
}
