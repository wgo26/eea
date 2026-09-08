/**
 * Shared bot-trap ("honeypot") field for anonymous public forms.
 *
 * The field is rendered hidden and off-tab-order; humans never fill it, so a
 * non-empty value reliably identifies a bot. Actions respond with a fake
 * success so crawlers learn nothing — the row is simply never written.
 */
export const HONEYPOT_FIELD = "website";

/** Pure predicate — true when the trap field was filled (unit-tested). */
export function honeypotTripped(formData: FormData): boolean {
    const value = formData.get(HONEYPOT_FIELD);
    return typeof value === "string" && value.trim() !== "";
}