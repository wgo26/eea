"use client";

import { RouteError } from "@/components/system/route-error";

/**
 * Focused-flow error boundary (auth / submit screens) — recovers to the
 * localized homepage, keeping the minimal shell intact.
 */
export default function FocusedError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return <RouteError error={error} reset={reset} variant="public" />;
}
