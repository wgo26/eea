import type { Metadata } from "next";
import { buildAlternates, localePath } from "@/lib/i18n/urls";
import Link from "next/link";
import { headers } from "next/headers";
import { Camera, MapPin, Newspaper, ShieldCheck } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getDictionary, resolveLocale } from "@/lib/i18n";
import { getContributors } from "@/lib/queries/contributors";

export async function generateMetadata(): Promise<Metadata> {
    const locale = resolveLocale((await headers()).get("x-locale"));
    const dict = getDictionary(locale);
    return {
        title: dict.contributors.title,
        description: dict.contributors.tagline,
        alternates: buildAlternates(locale, "/contributors"),
    };
}

function initials(name: string | null): string {
    if (!name) return "?";
    return name
        .split(" ")
        .map((w) => w.charAt(0))
        .slice(0, 2)
        .join("")
        .toUpperCase();
}

export default async function ContributorsPage() {
    const locale = resolveLocale((await headers()).get("x-locale"));
    const dict = getDictionary(locale);
    const { contributors } = await getContributors({ page: 1, limit: 60, locale });

    return (
        <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6 lg:px-8">
            <header className="mb-8 max-w-2xl">
                <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
                    {dict.contributors.title}
                </h1>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">
                    {dict.contributors.intro}
                </p>
            </header>

            {contributors.length === 0 ? (
                <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                    {dict.contributors.empty}
                </p>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {contributors.map((c) => (
                        <Link key={c.id} href={localePath(locale, `/contributors/${c.id}`)} className="group">
                            <Card className="h-full transition-shadow hover:shadow-md">
                                <CardContent className="p-5">
                                    <div className="flex items-center gap-4">
                                        {c.avatarUrl ? (
                                            <span
                                                className="h-14 w-14 shrink-0 rounded-full bg-cover bg-center"
                                                style={{ backgroundImage: `url(${c.avatarUrl})` }}
                                                role="img"
                                                aria-label={c.displayName ?? ""}
                                            />
                                        ) : (
                                            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
                                                {initials(c.displayName)}
                                            </span>
                                        )}
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <p className="truncate font-bold">
                                                    {c.displayName ?? dict.contributors.viewProfile}
                                                </p>
                                                {c.isVerified ? (
                                                    <ShieldCheck
                                                        className="h-4 w-4 shrink-0 text-emerald-500"
                                                        aria-hidden
                                                    />
                                                ) : null}
                                                {c.isFeatured ? (
                                                    <Badge className="bg-amber-500/90 text-white">
                                                        {dict.contributors.featured}
                                                    </Badge>
                                                ) : null}
                                            </div>
                                            {c.locationName ? (
                                                <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                                                    <MapPin className="h-3 w-3" aria-hidden />
                                                    {c.locationName}
                                                </p>
                                            ) : null}
                                        </div>
                                    </div>

                                    <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
                                        <span className="inline-flex items-center gap-1.5">
                                            <Newspaper className="h-3.5 w-3.5" aria-hidden />
                                            <strong className="text-foreground">
                                                {c.publishedCount}
                                            </strong>{" "}
                                            {dict.contributors.stories}
                                        </span>
                                        <span className="inline-flex items-center gap-1.5">
                                            <Camera className="h-3.5 w-3.5" aria-hidden />
                                            <strong className="text-foreground">
                                                {c.photoCount}
                                            </strong>{" "}
                                            {dict.contributors.photographs}
                                        </span>
                                    </div>

                                    {c.categories.length > 0 ? (
                                        <div className="mt-3 flex flex-wrap gap-1.5">
                                            {c.categories.slice(0, 3).map((cat) => (
                                                <Badge key={cat} variant="secondary" className="text-[10px]">
                                                    {cat}
                                                </Badge>
                                            ))}
                                        </div>
                                    ) : null}
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
