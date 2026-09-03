import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { getDictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { localePath } from "@/lib/i18n/urls";

/**
 * "Authenticated but not authorized" screen (checklist items 4 + 5).
 * Every requireRole/requireStaff/requireAdmin failure lands here — in the
 * user's language, with a way out — instead of a silent bounce to `/`.
 */
export async function generateMetadata(): Promise<Metadata> {
    const locale = await getRequestLocale();
    const dict = getDictionary(locale);
    return {
        title: dict.system.notAuthorized.title,
        robots: { index: false, follow: false },
    };
}

export default async function NotAuthorizedPage() {
    const locale = await getRequestLocale();
    const dict = getDictionary(locale);

    return (
        <div className="mx-auto flex min-h-[70vh] w-full max-w-xl flex-col items-center justify-center px-4 py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                <ShieldAlert className="h-8 w-8 text-destructive" aria-hidden />
            </div>
            <h1 className="mt-6 text-2xl font-semibold tracking-tight md:text-3xl">
                {dict.system.notAuthorized.title}
            </h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                {dict.system.notAuthorized.body}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Link
                    href={localePath(locale, "/account/dashboard")}
                    className="inline-flex min-h-[44px] items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                    {dict.system.notAuthorized.dashboard}
                </Link>
                <Link
                    href={localePath(locale, "/")}
                    className="inline-flex min-h-[44px] items-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                    {dict.system.notAuthorized.home}
                </Link>
            </div>
        </div>
    );
}