import Link from "next/link";
import { getDictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { localePath } from "@/lib/i18n/urls";

/**
 * Localized 404 for every route under /[locale] (P0-8, checklist item 6).
 * The locale comes from the request (x-locale header proxy.ts set), so a
 * bogus URL under /fr shows the French screen.
 */
export default async function LocaleNotFound() {
    const locale = await getRequestLocale();
    const dict = getDictionary(locale);

    return (
        <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
            <p className="text-7xl font-extrabold tracking-tight text-primary/70">404</p>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight md:text-3xl">
                {dict.system.notFound.title}
            </h1>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                {dict.system.notFound.body}
            </p>
            <Link
                href={localePath(locale, "/")}
                className="mt-8 inline-flex min-h-[44px] items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
                {dict.system.notFound.home}
            </Link>
        </div>
    );
}