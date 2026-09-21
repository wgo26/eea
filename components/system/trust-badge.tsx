import Link from "next/link";
import { Landmark, Radio, ShieldCheck, Users, type LucideIcon } from "lucide-react";
import { verificationBadgeInfo } from "@/lib/verification";
import { localePath } from "@/lib/i18n/urls";
import type { Dictionary, Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
    verified: ShieldCheck,
    official_source: Landmark,
    community_submission: Users,
    developing: Radio,
};

const HINTS: Record<string, keyof Dictionary["badges"]> = {
    verified: "hintVerified",
    official_source: "hintOfficial",
    community_submission: "hintCommunity",
    developing: "hintDeveloping",
};

/**
 * Phase 3 — the single trust-badge visual language (U11): identical icon +
 * colour + tooltip on cards, detail pages, notices and search results, and
 * every badge links to /about/verification, which explains the four states.
 * Colours/labels come from verificationBadgeInfo (the data layer); this
 * component owns the presentation (icon, title tooltip, explainer link).
 */
export function TrustBadge({
    verification,
    dict,
    locale,
    link = true,
    className,
}: {
    verification: string | null | undefined;
    dict: Dictionary;
    locale: Locale;
    /** Link to the explainer page (default true; false for overlay stacks that already link). */
    link?: boolean;
    className?: string;
}) {
    const key = verification ?? "";
    const badge = verificationBadgeInfo(verification ?? null, dict);
    if (!badge) return null;
    const Icon = ICONS[key] ?? ShieldCheck;
    // The data-layer label carries a "✓ " prefix for two states; the icon
    // conveys that here, so strip it for a clean icon + text lockup.
    const label = badge.label.replace(/^✓\s*/, "");
    const hint = dict.badges[HINTS[key] ?? "hintCommunity"];
    const cls = cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold shadow-sm",
        badge.className,
        className,
    );
    const content = (
        <>
            <Icon className="h-3 w-3" aria-hidden />
            {label}
        </>
    );
    if (!link) {
        return (
            <span className={cls} title={hint}>
                {content}
            </span>
        );
    }
    return (
        <Link
            href={localePath(locale, "/about/verification")}
            className={cls}
            title={`${label} — ${hint} ${dict.badges.aboutLink}`}
            aria-label={`${label}. ${hint}. ${dict.badges.aboutLink}`}
        >
            {content}
        </Link>
    );
}
