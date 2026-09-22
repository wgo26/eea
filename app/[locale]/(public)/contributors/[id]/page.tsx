import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, ShieldCheck } from "lucide-react";
import { ContentBreadcrumb } from "@/components/system/content-breadcrumb";
import { personJsonLd, breadcrumbJsonLd, renderJsonLd } from "@/lib/seo/jsonld";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdSlot } from "@/components/home/ad-slot";
import { SectionHeader } from "@/components/home/section-header";
import { CARD_SIZES, SmartImage } from "@/components/media/smart-image";
import { FollowButton } from "@/components/system/follow-button";
import { getDictionary, resolveLocale } from "@/lib/i18n";
import { getContributorById } from "@/lib/queries/contributors";
import { buildAlternates, localePath } from "@/lib/i18n/urls";
import { SITE } from "@/lib/constants";

type Props = { params: Promise<{ id: string; locale: string }> };

/**
 * A3 — ISR: editorial content, revalidated every 5 minutes (or on demand).
 * The literal is required: segment config must be statically analyzable.
 */
export const revalidate = 300;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { id, locale: rawLocale } = await params;
    const locale = resolveLocale(rawLocale);
    const { profile } = await getContributorById(id, locale);
    if (!profile) return { title: locale === "fr" ? "Contributeur introuvable" : "Contributor not found" };
    return {
        title: profile.displayName ?? (locale === "fr" ? "Contributeur" : "Contributor"),
        description: profile.bio ?? undefined,
        alternates: buildAlternates(locale, `/contributors/${id}`),
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

export default async function ContributorProfilePage({ params }: Props) {
    const { id, locale: rawLocale } = await params;
    const locale = resolveLocale(rawLocale);
    const dict = getDictionary(locale);

    const { profile, content } = await getContributorById(id, locale);
    if (!profile) notFound();

    const profileName = profile.displayName ?? dict.contributors.viewProfile;
    const profileUrl = `${SITE.url}${localePath(locale, `/contributors/${id}`)}`;
    // Phase 3 — Person + breadcrumb structured data (rich results).
    const jsonLd = renderJsonLd([
        personJsonLd({
            name: profileName,
            description: profile.bio,
            image: profile.avatarUrl,
            url: profileUrl,
            homeLocation: profile.locationName,
        }),
        breadcrumbJsonLd([
            { name: dict.contributors.title, url: `${SITE.url}${localePath(locale, "/contributors")}` },
            { name: profileName, url: profileUrl },
        ]),
    ]);

    return (
        <>
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: jsonLd }}
        />
        <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6 lg:px-8">
            <ContentBreadcrumb
                locale={locale}
                homeLabel={dict.nav.home}
                trail={[
                    { label: dict.contributors.title, path: "/contributors" },
                    { label: profileName },
                ]}
            />

            {/* Profile header */}
            <header className="mt-4 flex flex-col gap-5 rounded-3xl border bg-card p-6 sm:flex-row sm:items-center">
                {profile.avatarUrl ? (
                    <span className="relative block h-20 w-20 shrink-0 overflow-hidden rounded-full bg-muted">
                        <SmartImage
                            src={profile.avatarUrl}
                            alt={profile.displayName ?? ""}
                            sizes="80px"
                            className="object-cover"
                        />
                    </span>
                ) : (
                    <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary">
                        {initials(profile.displayName)}
                    </span>
                )}
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">
                            {profile.displayName ?? dict.contributors.viewProfile}
                        </h1>
                        {profile.isVerified ? (
                            <Badge className="bg-emerald-600/90 text-white">
                                <ShieldCheck className="mr-1 h-3 w-3" aria-hidden />
                                {dict.contributors.verified}
                            </Badge>
                        ) : null}
                    </div>
                    {profile.locationName ? (
                        <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                            <MapPin className="h-4 w-4" aria-hidden />
                            {dict.contributors.location}: {profile.locationName}
                        </p>
                    ) : null}
                    {profile.bio ? (
                        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                            {profile.bio}
                        </p>
                    ) : null}
                    <div className="mt-3">
                        <FollowButton contributorId={id} copy={dict.follow} />
                    </div>
                </div>
                <div className="flex shrink-0 gap-6 border-t pt-4 text-center sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
                    <div>
                        <p className="text-2xl font-black">{profile.publishedCount}</p>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            {dict.contributors.stories}
                        </p>
                    </div>
                    <div>
                        <p className="text-2xl font-black">{profile.photoCount}</p>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            {dict.contributors.photographs}
                        </p>
                    </div>
                </div>
            </header>

            {profile.categories.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-1.5">
                    {profile.categories.map((cat) => (
                        <Badge key={cat} variant="secondary">
                            {cat}
                        </Badge>
                    ))}
                </div>
            ) : null}

            {/* Portfolio */}
            <section className="mt-10">
                <SectionHeader title={dict.contributors.portfolio} hint={dict.contributors.intro} />
                {content.length === 0 ? (
                    <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                        {dict.contributors.noContent}
                    </p>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {content.map((item) => (
                            <Link key={item.id} href={item.href} className="group">
                                <Card className="overflow-hidden transition-shadow hover:shadow-md">
                                    {item.imageUrl ? (
                                        <span className="relative block aspect-[4/3] w-full overflow-hidden bg-muted">
                                            <SmartImage
                                                src={item.imageUrl}
                                                alt={item.title}
                                                sizes={CARD_SIZES}
                                                className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                                            />
                                        </span>
                                    ) : (
                                        <span className="block aspect-[4/3] w-full bg-muted" />
                                    )}
                                    <CardContent className="p-3">
                                        <h3 className="line-clamp-2 text-sm font-bold leading-snug group-hover:underline">
                                            {item.title}
                                        </h3>
                                        <span className="mt-1 block text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                            {item.category ?? ""}
                                        </span>
                                    </CardContent>
                                </Card>
                            </Link>
                        ))}
                    </div>
                )}
            </section>

            <AdSlot
                ad={null}
                dict={dict}
                variant="inline-bottom"
                className="mt-12"
            />
        </div>
        </>
    );
}
