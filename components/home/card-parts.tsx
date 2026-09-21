import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { TrustBadge } from "@/components/system/trust-badge";
import type { Dictionary, Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Phase 3 — shared card anatomy (spec §1A + audit U-card standardisation).
 *
 * Every editorial card (StoryCard, ListingCard, NoticeCard, EventCard,
 * SearchResult) composes the same parts: shell → cover → badge row →
 * title → excerpt → meta. Shared tokens: shadow-card/shadow-lift +
 * ease-standard (globals.css), the 12px text-xs floor (no sub-12px pills —
 * enforced by scripts/find-tiny-text.mjs), and the single TrustBadge
 * language. Cards keep their distinctive overlays (price, media badges,
 * notice spine); everything structural is shared.
 */

/** Card link shell: shared border, elevation and motion. */
export function CardShell({
    href,
    className,
    children,
}: {
    href: string;
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <Link
            href={href}
            className={cn(
                "group block overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card transition-shadow duration-300 ease-standard hover:shadow-lift",
                className,
            )}
        >
            {children}
        </Link>
    );
}

/** Image well with the standard aspect + hover zoom contract. */
export function CardCover({
    className,
    aspect = "aspect-[16/10]",
    children,
}: {
    className?: string;
    aspect?: string;
    children: React.ReactNode;
}) {
    return (
        <div className={cn("relative w-full overflow-hidden bg-muted", aspect, className)}>
            {children}
        </div>
    );
}

/** Category pill + trust badge row (badge never nests a link: cards link). */
export function CardBadgeRow({
    category,
    verification,
    dict,
    locale,
}: {
    category?: string | null;
    verification?: string | null;
    dict: Dictionary;
    locale: Locale;
}) {
    if (!category && !verification) return null;
    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {category ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {category}
                </span>
            ) : null}
            <TrustBadge verification={verification} dict={dict} locale={locale} link={false} />
        </div>
    );
}

/** Card headline (list-item level: h3 — the page owns h1/h2). */
export function CardTitle({
    size = "md",
    className,
    children,
}: {
    size?: "md" | "sm";
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <h3
            className={cn(
                "line-clamp-2 font-bold leading-snug tracking-tight group-hover:underline",
                size === "md" ? "text-base" : "text-sm",
                className,
            )}
        >
            {children}
        </h3>
    );
}

/** Meta row: date/location/author/price facts in the 12px floor. */
export function CardMeta({
    className,
    children,
}: {
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <div
            className={cn(
                "flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground",
                className,
            )}
        >
            {children}
        </div>
    );
}

/** One meta fact with a leading icon. */
export function CardMetaItem({
    icon: Icon,
    children,
}: {
    icon: LucideIcon;
    children: React.ReactNode;
}) {
    return (
        <span className="inline-flex items-center gap-1">
            <Icon className="h-3 w-3" aria-hidden />
            {children}
        </span>
    );
}
