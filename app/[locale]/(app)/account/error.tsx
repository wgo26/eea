"use client";

import { RouteError } from "@/components/system/route-error";

/**
 * Account-area error boundary — recovers to the member dashboard.
 */
export default function AccountError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return <RouteError error={error} reset={reset} variant="account" />;
}
