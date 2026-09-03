import Link from "next/link";
import { ArrowLeft, Languages } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { PolicyContent } from "@/components/about/policy-content";
import { getDictionary, type Locale } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/urls";
import { getPolicy, type PolicyType } from "@/lib/queries/about";

/** Shared renderer for the five /about/* policy pages. */
export async function PolicyPage({
    policyType,
    locale,
}: {
    policyType: PolicyType;
    locale: Locale;
}) {
    const dict = getDictionary(locale);
    const policy = await getPolicy(policyType, locale);

    return (
        <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-6 lg:px-8">
            <Link
                href={localePath(locale, "/about")}
                className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                {dict.about.back}
            </Link>

            <header className="mt-4">
                <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
                    {dict.footer[policyType]}
                </h1>
                {policy ? (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Languages className="h-3.5 w-3.5" aria-hidden />
                        {dict.about.languageNote.replace("{lang}", policy.locale.toUpperCase())}
                    </p>
                ) : null}
            </header>

            <div className="mt-8">
                {policy?.content ? (
                    <Card>
                        <CardContent className="p-6">
                            <PolicyContent content={policy.content} />
                        </CardContent>
                    </Card>
                ) : (
                    <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                        {dict.about.comingSoon}
                    </p>
                )}
            </div>
        </div>
    );
}
