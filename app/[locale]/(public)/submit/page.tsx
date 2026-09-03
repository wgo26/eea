import type { Metadata } from "next";
import { buildAlternates, localePath } from "@/lib/i18n/urls";
import Link from "next/link";
import { headers } from "next/headers";
import { ArrowRight, Camera, Megaphone, Newspaper, Tag, Music } from "lucide-react";

import { getDictionary, resolveLocale } from "@/lib/i18n";
import { SUBMIT_TYPES } from "@/lib/constants";

export async function generateMetadata(): Promise<Metadata> {
    const locale = resolveLocale((await headers()).get("x-locale"));
    const dict = getDictionary(locale);
    return {
        title: dict.submit.title,
        alternates: buildAlternates(locale, "/submit"),
    };
}

const ICONS: Record<string, typeof Camera> = {
    "photo-story": Camera,
    news: Newspaper,
    notice: Megaphone,
    "buy-sell": Tag,
    culture: Music,
};

export default async function SubmitPage() {
    const locale = resolveLocale((await headers()).get("x-locale"));
    const dict = getDictionary(locale);

    const typeKey: Record<string, "photoStory" | "news" | "notice" | "buySell" | "culture"> = {
        "photo-story": "photoStory",
        news: "news",
        notice: "notice",
        "buy-sell": "buySell",
        culture: "culture",
    };

    return (
        <div className="mx-auto w-full max-w-4xl px-4 py-8 md:px-6 lg:px-8">
            <header className="mb-8 max-w-2xl">
                <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
                    {dict.submit.title}
                </h1>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">
                    {dict.submit.intro}
                </p>
            </header>

            <h2 className="mb-4 text-lg font-extrabold">{dict.submit.choose}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
                {SUBMIT_TYPES.map((entry) => {
                    const Icon = ICONS[entry.type] ?? ArrowRight;
                    const meta = dict.submit.types[typeKey[entry.type]];
                    return (
                        <Link
                            key={entry.type}
                            href={localePath(locale, `/submit/${entry.type}`)}
                            className="group flex items-start gap-4 rounded-2xl border bg-card p-5 transition-shadow hover:shadow-md"
                        >
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                <Icon className="h-5 w-5" aria-hidden />
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="font-bold">{meta.title}</p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    {meta.blurb}
                                </p>
                            </div>
                            <ArrowRight className="h-4 w-4 shrink-0 self-center text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
