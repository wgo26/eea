"use client";

import * as React from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getPriceWatchState, togglePriceWatch } from "@/lib/public/actions";

/**
 * Phase 3 — price-drop watch toggle for a listing. Shows watcher count as
 * social proof; watching requires sign-in (rows are keyed by user id).
 */
export function PriceWatchButton({
    listingId,
    labels,
}: {
    listingId: string;
    labels: {
        watch: string;
        watching: string;
        watchers: string;
        signIn: string;
        rateLimited: string;
        unavailable: string;
        loading: string;
    };
}) {
    const [watching, setWatching] = React.useState(false);
    const [watchers, setWatchers] = React.useState<number | null>(null);
    const [needsAuth, setNeedsAuth] = React.useState(false);
    const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
    const [isPending, startTransition] = React.useTransition();

    React.useEffect(() => {
        let live = true;
        getPriceWatchState(listingId).then((s) => {
            if (!live) return;
            setWatching(s.watching);
            setWatchers(s.watchers);
        });
        return () => {
            live = false;
        };
    }, [listingId]);

    const handleToggle = () => {
        setErrorMessage(null);
        setNeedsAuth(false);
        startTransition(async () => {
            const res = await togglePriceWatch(listingId);
            if (res.ok) {
                setWatching(res.watching);
                setWatchers((n) => (n == null ? n : n + (res.watching ? 1 : -1)));
            } else if (res.error === "auth") {
                setNeedsAuth(true);
            } else if (res.error === "rate_limited") {
                setErrorMessage(labels.rateLimited);
            } else {
                setErrorMessage(labels.unavailable);
            }
        });
    };

    return (
        <div className="space-y-1.5">
            <Button
                type="button"
                variant={watching ? "default" : "outline"}
                size="sm"
                className="w-full"
                disabled={isPending}
                onClick={handleToggle}
                aria-pressed={watching}
            >
                {isPending ? (
                    <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        <span>{labels.loading}</span>
                    </>
                ) : watching ? (
                    <>
                        <BellOff className="h-4 w-4" aria-hidden />
                        <span>{labels.watching}</span>
                    </>
                ) : (
                    <>
                        <Bell className="h-4 w-4" aria-hidden />
                        <span>{labels.watch}</span>
                    </>
                )}
            </Button>
            {watchers != null && watchers > 0 ? (
                <p className="text-center text-xs text-muted-foreground">
                    {watchers} {labels.watchers}
                </p>
            ) : null}
            {needsAuth ? <p className="text-center text-xs text-muted-foreground">{labels.signIn}</p> : null}
            {errorMessage ? <p className="text-center text-xs text-destructive">{errorMessage}</p> : null}
        </div>
    );
}
