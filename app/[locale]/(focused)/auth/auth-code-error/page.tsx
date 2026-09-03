import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { getDictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { localePath } from "@/lib/i18n/urls";

export async function generateMetadata(): Promise<Metadata> {
    const locale = await getRequestLocale();
    return {
        title: getDictionary(locale).auth.codeError.title,
        robots: { index: false, follow: false },
    };
}

/** Localized dead-end-free error screen for expired/invalid auth links. */
export default async function Page() {
    const locale = await getRequestLocale();
    const dict = getDictionary(locale);

    return (
        <div className="w-full max-w-md text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10">
                <AlertTriangle className="h-7 w-7 text-amber-500" aria-hidden />
            </div>
            <h1 className="mt-6 text-2xl font-semibold tracking-tight md:text-3xl">
                {dict.auth.codeError.title}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {dict.auth.codeError.body}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Link
                    href={localePath(locale, "/account/login")}
                    className="inline-flex min-h-[44px] items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                    {dict.auth.codeError.tryAgain}
                </Link>
                <Link
                    href={localePath(locale, "/")}
                    className="inline-flex min-h-[44px] items-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                    {dict.auth.codeError.backHome}
                </Link>
            </div>
        </div>
    );
}