import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { ContactForm } from "@/components/about/contact-form";
import { PolicyContent } from "@/components/about/policy-content";
import { Card, CardContent } from "@/components/ui/card";
import { buildAlternates, localePath } from "@/lib/i18n/urls";
import { getDictionary, resolveLocale, type Locale } from "@/lib/i18n";
import { getPolicy } from "@/lib/queries/about";
import { headers } from "next/headers";

export async function generateMetadata(): Promise<Metadata> {
    const locale = resolveLocale((await headers()).get("x-locale"));
    const dict = getDictionary(locale);
    return {
        title: dict.footer.contact,
        description: dict.about.contactMetaDesc,
        alternates: buildAlternates(locale, "/about/contact"),
    };
}

export default async function Page() {
    const locale: Locale = resolveLocale((await headers()).get("x-locale"));
    const dict = getDictionary(locale);
    // Optional editor-authored intro from the policy table; the form below is
    // the actual contact channel (not a policy document).
    const intro = await getPolicy("contact", locale);

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
                    {dict.footer.contact}
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground md:text-base">
                    {dict.about.contactIntro}
                </p>
            </header>

            <div className="mt-8 space-y-8">
                {intro?.content ? (
                    <Card>
                        <CardContent className="p-6">
                            <PolicyContent content={intro.content} />
                        </CardContent>
                    </Card>
                ) : null}

                <div className="rounded-2xl border bg-card p-5 md:p-6">
                    <h2 className="text-base font-extrabold tracking-tight">
                        {dict.about.contactForm.title}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">{dict.about.contactForm.body}</p>
                    <div className="mt-5">
                        <ContactForm dict={dict} />
                    </div>
                </div>
            </div>
        </div>
    );
}
