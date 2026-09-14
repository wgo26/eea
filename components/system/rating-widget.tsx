"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { getRatingState, submitRating } from "@/lib/ratings/actions";
import { cn } from "@/lib/utils";
import type { Dictionary } from "@/lib/i18n";

type RatingsCopy = Dictionary["ratings"];

/**
 * 1–5 star rating for listings: one vote per signed-in user (upsert),
 * live average + count. Guests see the aggregate with a sign-in hint.
 */
export function RatingWidget({
    contentItemId,
    copy,
}: {
    contentItemId: string;
    copy: RatingsCopy;
}) {
    const [mine, setMine] = useState<number | null>(null);
    const [average, setAverage] = useState<number | null>(null);
    const [count, setCount] = useState(0);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        void getRatingState(contentItemId).then((state) => {
            if (cancelled) return;
            setMine(state.mine);
            setAverage(state.average);
            setCount(state.count);
        });
        return () => {
            cancelled = true;
        };
    }, [contentItemId]);

    async function rate(stars: number) {
        if (busy) return;
        setBusy(true);
        const result = await submitRating(contentItemId, stars);
        setBusy(false);
        if (!result.ok) {
            setNotice(result.error === "Not authenticated." ? copy.signIn : result.error || copy.error);
            return;
        }
        setMine(result.state.mine);
        setAverage(result.state.average);
        setCount(result.state.count);
        setNotice(copy.thanks);
    }

    return (
        <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{copy.title}</span>
            <span className="inline-flex items-center gap-0.5" role="radiogroup" aria-label={copy.yourRating}>
                {[1, 2, 3, 4, 5].map((stars) => (
                    <button
                        key={stars}
                        type="button"
                        onClick={() => rate(stars)}
                        disabled={busy}
                        role="radio"
                        aria-checked={mine === stars}
                        aria-label={`${stars} / 5`}
                        title={`${stars} / 5`}
                        className="rounded p-0.5 transition-colors disabled:opacity-50"
                    >
                        <Star
                            className={cn(
                                "h-5 w-5",
                                (mine ?? 0) >= stars
                                    ? "fill-amber-400 text-amber-400"
                                    : "text-muted-foreground/40 hover:text-amber-400",
                            )}
                            aria-hidden
                        />
                    </button>
                ))}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
                {average != null && count > 0
                    ? copy.average.replace("{avg}", average.toFixed(1)).replace("{count}", String(count))
                    : copy.noRatings}
            </span>
            {notice ? (
                <span role="status" className="text-xs text-muted-foreground">
                    {notice}
                </span>
            ) : null}
        </div>
    );
}
