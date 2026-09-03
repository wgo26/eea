"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Dictionary } from "@/lib/i18n";

type Props = {
    destination: string;
    copy: Dictionary["auth"]["landing"];
};

/**
 * Post-login interstitial: shows where the user is headed (so the redirect
 * never feels like a trap) and offers an immediate "continue" control in
 * case the automatic navigation is blocked or slow.
 */
export function AuthLandingClient({ destination, copy }: Props) {
    const router = useRouter();
    const isAdminWorkspace = destination.includes("/admin");

    useEffect(() => {
        const timer = window.setTimeout(() => router.replace(destination), 1200);
        return () => window.clearTimeout(timer);
    }, [destination, router]);

    return (
        <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-lg shadow-primary/5">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
                EEA
            </div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                {copy.welcome}
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">
                {isAdminWorkspace ? copy.adminTitle : copy.memberTitle}
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
                {isAdminWorkspace ? copy.adminBody : copy.memberBody}
            </p>

            <div className="mt-6 flex flex-col items-center gap-4">
                <div className="flex items-center justify-center gap-3">
                    <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary" />
                    <div className="text-sm text-muted-foreground">
                        {copy.redirecting.replace("{path}", destination)}
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => router.replace(destination)}
                    className="inline-flex min-h-[44px] items-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                    {copy.continue}
                </button>
            </div>
        </div>
    );
}
