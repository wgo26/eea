import { NOTICE_TYPE_META } from "@/lib/notice-types";

/**
 * Shared vocabulary for the public submit funnel. The per-type field groups
 * (`submit-essentials.tsx` etc.) and the server wrapper (`submit-form-gated`,
 * via `submit-form.tsx` re-exports) all read from here — one place for the
 * five intake types and their server allowlist mirrors.
 */
export type SubmitType =
    | "photo-story"
    | "news"
    | "culture"
    | "notice"
    | "buy-sell";

export type SubmitInitial = {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    locationId?: string | null;
    locationText?: string | null;
};

export const TYPE_TO_DB: Record<SubmitType, string> = {
    "photo-story": "photo_story",
    news: "news",
    culture: "culture",
    notice: "notice",
    "buy-sell": "buy_sell",
};

export const CURRENCIES = ["XAF", "XOF", "CDF", "USD", "EUR", "NGN", "GHS"];

export const NOTICE_TYPES = Object.keys(NOTICE_TYPE_META);

export const BUY_SELL_CATEGORIES = [
    "phones",
    "vehicles",
    "property",
    "furniture",
    "fashion",
    "jobs",
    "agriculture",
    "household",
    "business",
    "other",
];
