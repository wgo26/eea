import {
    CircleDot,
    Construction,
    GraduationCap,
    HandHeart,
    Landmark,
    Megaphone,
    PackageSearch,
    Siren,
    Users,
    UserSearch,
    Wrench,
    type LucideIcon,
} from "lucide-react";

/**
 * Human-readable type labels. Kept local (rather than importing from
 * `lib/queries/notices`) so this module stays safe to use inside client
 * components — the query module is server-only.
 */
const TYPE_LABELS: Record<string, string> = {
    public_notice: "Public Notice",
    lost_found: "Lost & Found",
    road_closure: "Road Closure",
    community_alert: "Community Alert",
    missing_person: "Missing Person",
    service_announcement: "Service Announcement",
    government_notice: "Government Notice",
    school_notice: "School Notice",
    organization_notice: "Organization Notice",
    other: "Other",
};

/**
 * Presentation metadata for the Notice Board (spec §5).
 *
 * Notices are not news: the *type* is the primary way people scan them, so
 * each type carries its own icon, accent and urgency tier. Urgency drives
 * the top-of-page alert banner and the colour of the card's spine.
 */
export type NoticeUrgency = "critical" | "high" | "standard";

export type NoticeTypeMeta = {
    /** Lucide icon rendered in the tile, the card spine and the banner. */
    icon: LucideIcon;
    /** Urgency tier — critical/high notices are surfaced more loudly. */
    urgency: NoticeUrgency;
    /** Tailwind classes for the tile/icon chip (light + dark). */
    chip: string;
    /** Tailwind class for the card's left spine. */
    spine: string;
    /** Short blurb used on the browse-by-type tiles. */
    blurb: string;
};

export const NOTICE_TYPE_META: Record<string, NoticeTypeMeta> = {
    missing_person: {
        icon: UserSearch,
        urgency: "critical",
        chip: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
        spine: "bg-rose-500",
        blurb: "Someone is missing — every share helps.",
    },
    community_alert: {
        icon: Siren,
        urgency: "critical",
        chip: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
        spine: "bg-rose-500",
        blurb: "Safety, weather and incidents affecting the area.",
    },
    road_closure: {
        icon: Construction,
        urgency: "high",
        chip: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
        spine: "bg-amber-500",
        blurb: "Closed roads, diversions and works.",
    },
    government_notice: {
        icon: Landmark,
        urgency: "standard",
        chip: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
        spine: "bg-sky-500",
        blurb: "Councils, ministries and public bodies.",
    },
    service_announcement: {
        icon: Wrench,
        urgency: "standard",
        chip: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
        spine: "bg-sky-500",
        blurb: "Water, power, health and transport changes.",
    },
    school_notice: {
        icon: GraduationCap,
        urgency: "standard",
        chip: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
        spine: "bg-indigo-500",
        blurb: "Term dates, closures and PTA announcements.",
    },
    public_notice: {
        icon: Megaphone,
        urgency: "standard",
        chip: "bg-primary/15 text-foreground",
        spine: "bg-primary",
        blurb: "General announcements for the public.",
    },
    lost_found: {
        icon: PackageSearch,
        urgency: "standard",
        chip: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
        spine: "bg-violet-500",
        blurb: "Lost items, found property and animals.",
    },
    organization_notice: {
        icon: Users,
        urgency: "standard",
        chip: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
        spine: "bg-teal-500",
        blurb: "Churches, NGOs, groups and associations.",
    },
    other: {
        icon: CircleDot,
        urgency: "standard",
        chip: "bg-muted text-muted-foreground",
        spine: "bg-muted-foreground/40",
        blurb: "Anything else the community needs to know.",
    },
};

/** Fallback for a type that is not in the map (e.g. newly added enum value). */
export const NOTICE_TYPE_FALLBACK: NoticeTypeMeta = {
    icon: HandHeart,
    urgency: "standard",
    chip: "bg-muted text-muted-foreground",
    spine: "bg-muted-foreground/40",
    blurb: "Community notice.",
};

export function noticeTypeMeta(type: string | null | undefined): NoticeTypeMeta {
    if (!type) return NOTICE_TYPE_FALLBACK;
    return NOTICE_TYPE_META[type] ?? NOTICE_TYPE_FALLBACK;
}

export function noticeTypeLabel(type: string | null | undefined): string {
    if (!type) return "Notice";
    return (
        TYPE_LABELS[type] ??
        type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    );
}

/** Whole days from today until `date` (negative once it has passed). */
export function daysUntil(date: string | Date | null | undefined): number | null {
    if (!date) return null;
    const target = typeof date === "string" ? new Date(date) : date;
    if (Number.isNaN(target.getTime())) return null;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - startOfToday.getTime()) / 86_400_000);
}

export function isExpired(expiresAt: string | null | undefined): boolean {
    if (!expiresAt) return false;
    return new Date(expiresAt).getTime() < Date.now();
}

/** "Expiring soon" window — used for the status filter and the amber chip. */
export const EXPIRING_SOON_DAYS = 3;

export function isExpiringSoon(expiresAt: string | null | undefined): boolean {
    const days = daysUntil(expiresAt);
    if (days === null) return false;
    return days >= 0 && days <= EXPIRING_SOON_DAYS;
}
