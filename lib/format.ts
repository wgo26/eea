import type { Dictionary, Locale } from "@/lib/i18n";

/**
 * CFA franc is the currency of the target audience, so amounts render
 * without decimals (there is no minor unit in circulation).
 */
const ZERO_DECIMAL_CURRENCIES = new Set(["XAF", "XOF", "CDF", "RWF", "KES", "UGX", "TZS", "GNF"]);

/**
 * Formats a campaign amount, e.g. `1250000 XAF` → "1 250 000 FCFA".
 * Falls back to a plain grouped number when the currency is unknown.
 */
export function formatMoney(
    amount: number | string | null | undefined,
    currency: string | null | undefined,
    locale: Locale,
): string {
    const value = Number(amount ?? 0);
    if (!Number.isFinite(value)) return "—";
    const code = (currency ?? "XAF").toString().trim().toUpperCase() || "XAF";

    try {
        return new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-GB", {
            style: "currency",
            currency: code,
            maximumFractionDigits: ZERO_DECIMAL_CURRENCIES.has(code) ? 0 : 2,
            minimumFractionDigits: 0,
        }).format(value);
    } catch {
        return `${new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-GB").format(value)} ${code}`;
    }
}

/**
 * Abbreviated amount for tight spaces: 1 250 000 → "1.25M".
 * Used on stat strips and compact cards.
 */
export function formatMoneyCompact(
    amount: number | string | null | undefined,
    currency: string | null | undefined,
    locale: Locale,
): string {
    const value = Number(amount ?? 0);
    if (!Number.isFinite(value)) return "—";
    const code = (currency ?? "XAF").toString().trim().toUpperCase() || "XAF";
    const suffix = code === "XAF" || code === "XOF" ? "FCFA" : code;
    const tag = locale === "fr" ? "fr-FR" : "en-GB";

    if (value >= 1_000_000) {
        const n = new Intl.NumberFormat(tag, { maximumFractionDigits: 2 }).format(value / 1_000_000);
        return `${n}M ${suffix}`;
    }
    if (value >= 1_000) {
        const n = new Intl.NumberFormat(tag, { maximumFractionDigits: 0 }).format(value / 1_000);
        return `${n}K ${suffix}`;
    }
    return `${new Intl.NumberFormat(tag).format(value)} ${suffix}`;
}

/**
 * Human expiry line for a notice: "Expires in 3 days", "Expires tomorrow",
 * "Expired 2 Sep 2026", or the plain date when it is further out.
 */
export function expiryLabel(
    expiresAt: string | null | undefined,
    locale: Locale,
    dict: Dictionary,
): string {
    if (!expiresAt) return dict.notices.noExpiry;
    const target = new Date(expiresAt);
    if (Number.isNaN(target.getTime())) return dict.notices.noExpiry;

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const days = Math.round((target.getTime() - startOfToday.getTime()) / 86_400_000);
    const count = Math.abs(days);

    if (days < 0) {
        const formatted = new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
        }).format(target);
        return `${dict.notices.expiredOn} ${formatted}`;
    }
    if (days === 0) return dict.notices.expiresToday;
    if (days === 1) return dict.notices.expiresTomorrow;
    if (days <= 30) return dict.notices.expiresInDays.replace("{count}", String(count));

    return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
    }).format(target);
}

/** Whole days remaining, or null when there is no expiry date. */
export function daysLeft(expiresAt: string | null | undefined): number | null {
    if (!expiresAt) return null;
    const target = new Date(expiresAt);
    if (Number.isNaN(target.getTime())) return null;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - startOfToday.getTime()) / 86_400_000);
}

/** Sentence-case "3 days left" line used on fundraiser cards. */
export function countdownLabel(
    expiresAt: string | null | undefined,
    dict: Dictionary,
): string | null {
    const days = daysLeft(expiresAt);
    if (days === null) return null;
    if (days < 0) return dict.fundraisers.closed;
    if (days === 0) return dict.fundraisers.endsToday;
    if (days === 1) return `1 ${dict.fundraisers.dayLeft}`;
    return `${days} ${dict.fundraisers.daysLeft}`;
}

/** Percentage of goal reached, clamped to 0–100 and rounded. */
export function percentRaised(raised: number, goal: number): number {
    if (!goal || goal <= 0) return 0;
    return Math.min(100, Math.round((raised / goal) * 100));
}

export function formatPercent(value: number, locale: Locale): string {
    return new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-GB", {
        style: "percent",
        maximumFractionDigits: 0,
    }).format(value / 100);
}

/** Builds a WhatsApp deep link for sharing any page URL. */
export function whatsappHref(url: string, text: string): string {
    return `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
}

/**
 * Listing price helper for the Buy & Sell detail pages: renders a money
 * amount with its currency, falling back to the CFA franc default. Thin
 * wrapper around `formatMoney` so callers can use a shorter, intent-revealing
 * name at the page level.
 */
export function formatPrice(
    amount: number | string | null | undefined,
    currency: string | null | undefined,
    locale: Locale,
): string {
    return formatMoney(amount, currency, locale);
}
