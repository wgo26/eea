import type { Metadata } from "next";
import { buildAlternates } from "@/lib/i18n/urls";
import { headers } from "next/headers";
import { Megaphone, Users, BadgeDollarSign, LayoutPanelTop } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdvertiseForm } from "@/components/advertise/advertise-form";
import { getDictionary, resolveLocale } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
    const locale = resolveLocale((await headers()).get("x-locale"));
    const dict = getDictionary(locale);
    return {
        title: dict.advertise.title,
        description: dict.advertise.tagline,
        alternates: buildAlternates(locale, "/advertise"),
    };
}

export default async function AdvertisePage() {
    const locale = resolveLocale((await headers()).get("x-locale"));
    const dict = getDictionary(locale);

    const features = [
        {
            icon: LayoutPanelTop,
            title: dict.advertise.placementsTitle,
            body: dict.advertise.placementsBody,
        },
        {
            icon: Users,
            title: dict.advertise.audienceTitle,
            body: dict.advertise.audienceBody,
        },
        {
            icon: BadgeDollarSign,
            title: dict.advertise.pricingTitle,
            body: dict.advertise.pricingBody,
        },
    ];

    return (
        <div className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6 lg:px-8">
            <header className="mb-8 max-w-2xl">
                <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                    <Megaphone className="h-4 w-4" aria-hidden />
                    {dict.advertise.tagline}
                </span>
                <h1 className="mt-3 text-3xl font-extrabold tracking-tight md:text-4xl">
                    {dict.advertise.title}
                </h1>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">
                    {dict.advertise.intro}
                </p>
            </header>

            <div className="mb-10 grid gap-4 sm:grid-cols-3">
                {features.map((feature) => (
                    <Card key={feature.title}>
                        <CardContent className="p-5">
                            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                <feature.icon className="h-5 w-5" aria-hidden />
                            </span>
                            <h2 className="mt-3 font-bold">{feature.title}</h2>
                            <p className="mt-1.5 text-sm text-muted-foreground">
                                {feature.body}
                            </p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>{dict.advertise.inquiryTitle}</CardTitle>
                </CardHeader>
                <CardContent>
                    <AdvertiseForm dict={dict} />
                </CardContent>
            </Card>
        </div>
    );
}
