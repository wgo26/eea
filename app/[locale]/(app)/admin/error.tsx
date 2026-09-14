"use client";

import { RouteError } from "@/components/system/route-error";

/**
 * Admin-workspace error boundary — recovers to the admin dashboard instead
 * of the public homepage, so staff stay inside the command center.
 */
export default function AdminError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return <RouteError error={error} reset={reset} variant="admin" />;
}
