import { NotFoundContent } from "@/components/system/not-found-content";

/**
 * Localized 404 for every route under /[locale] (P0-8, checklist item 6).
 *
 * A3: this file must stay free of request APIs (headers()/cookies()/
 * getRequestLocale()) — a single such read here forced the entire [locale]
 * subtree into per-request rendering and defeated all ISR. The locale is
 * derived client-side from the URL prefix inside NotFoundContent, so a
 * bogus URL under /fr still shows the French screen after hydration.
 */
export default function LocaleNotFound() {
    return <NotFoundContent />;
}
