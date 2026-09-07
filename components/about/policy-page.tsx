import Link from "next/link";
import { ArrowLeft, Languages } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { PolicyContent } from "@/components/about/policy-content";
import { TakedownForm } from "@/components/about/takedown-form";
import { DataRequestForm } from "@/components/about/data-request-form";
import { PolicyAcceptButton } from "@/components/about/policy-accept-button";
import { PrintButton } from "@/components/about/print-button";
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

    const otherLocales = (policy?.availableLocales ?? []).filter((l) => l !== locale);
    const publishedLabel =
        policy?.publishedAt != null
            ? dict.about.published.replace(
                  "{date}",
                  new Date(policy.publishedAt).toLocaleDateString(locale, {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                  }),
              )
            : null;

    return (
        <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-6 lg:px-8">
            <div className="flex items-center justify-between gap-3">
                <Link
                    href={localePath(locale, "/about")}
                    className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ArrowLeft className="h-4 w-4" aria-hidden />
                    {dict.about.back}
                </Link>
                <PrintButton label={dict.about.print} />
            </div>

            <header className="mt-4">
                <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
                    {dict.footer[policyType]}
                </h1>
                {policy ? (
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                            <Languages className="h-3.5 w-3.5" aria-hidden />
                            {dict.about.languageNote.replace("{lang}", policy.locale.toUpperCase())}
                        </span>
                        {policy.version ? (
                            <span>{dict.about.version.replace("{version}", policy.version)}</span>
                        ) : null}
                        {publishedLabel ? <span>{publishedLabel}</span> : null}
                    </div>
                ) : null}
                {otherLocales.length > 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                        {dict.about.alsoAvailable}{" "}
                        {otherLocales.map((l, i) => (
                            <span key={l}>
                                {i > 0 ? ", " : null}
                                <Link
                                    href={localePath(l, `/about/${policyType}`)}
                                    className="font-medium text-primary underline underline-offset-2"
                                >
                                    {l.toUpperCase()}
                                </Link>
                            </span>
                        ))}
                    </p>
                ) : null}
            </header>

            <div className="mt-8 space-y-8">
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

                {policy?.id ? (
                    <PolicyAcceptButton policyVersionId={policy.id} locale={locale} />
                ) : null}

                {policyType === "copyright" ? (
                    <section aria-label={dict.about.takedownForm.title}>
                        <TakedownForm dict={dict} />
                    </section>
                ) : null}

                {policyType === "privacy" ? (
                    <section aria-label={dict.about.dataForm.title}>
                        <DataRequestForm dict={dict} />
                    </section>
                ) : null}
            </div>
        </div>
    );
}
