"use client";

import { RouteError } from "@/components/system/route-error";

/**
 * Public-section error boundary — recovers to the localized homepage.
 * Narrows the blast radius so a failing public page no longer falls
 * through to the [locale]-level fallback.
 */
export default function PublicError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return <RouteError error={error} reset={reset} variant="public" />;
}
