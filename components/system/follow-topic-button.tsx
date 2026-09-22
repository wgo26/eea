"use client";

import { useEffect, useState } from "react";
import { BellPlus, BellRing } from "lucide-react";
import { getContentFollowState, toggleContentFollow, type ContentFollowKind } from "@/lib/follows/actions";
import { cn } from "@/lib/utils";
import type { Dictionary } from "@/lib/i18n";

type TopicCopy = Dictionary["follow"];

/**
 * Phase 3 — follow/unfollow toggle for places and categories, backed by the
 * `content_follows` table (RLS: own rows only). Mirrors FollowButton UX.
 */
export function FollowTopicButton({
    kind,
    id,
    name,
    copy,
}: {
    kind: ContentFollowKind;
    id: string;
    name: string;
    copy: TopicCopy;
}) {
    const [following, setFollowing] = useState(false);
    const [followers, setFollowers] = useState(0);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);

    const isPlace = kind === "place";

    useEffect(() => {
        let cancelled = false;
        void getContentFollowState(kind, id).then((state) => {
            if (cancelled) return;
            setFollowing(state.following);
            setFollowers(state.followers);
        });
        return () => {
            cancelled = true;
        };
    }, [kind, id]);

    async function handleClick() {
        if (busy) return;
        setBusy(true);
        const result = await toggleContentFollow(kind, id);
        setBusy(false);
        if (!result.ok) {
            setNotice(result.error === "Not authenticated." ? copy.signInTopics : result.error || copy.error);
            return;
        }
        setFollowing(result.following);
        setFollowers(result.followers);
        setNotice(
            result.following
                ? isPlace
                    ? copy.followedPlace
                    : copy.followedCategory
                : isPlace
                    ? copy.unfollowedPlace
                    : copy.unfollowedCategory,
        );
    }

    return (
        <span className="inline-flex flex-col gap-1">
            <span className="inline-flex items-center gap-2">
                <button
                    type="button"
                    onClick={handleClick}
                    disabled={busy}
                    aria-pressed={following}
                    aria-label={`${following ? (isPlace ? copy.followingPlace : copy.followingCategory) : isPlace ? copy.followPlace : copy.followCategory}: ${name}`}
                    className={cn(
                        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
                        following
                            ? "border border-primary/30 bg-primary/10 text-primary"
                            : "bg-primary text-primary-foreground hover:bg-primary/90",
                    )}
                >
                    {following ? (
                        <BellRing className="h-3.5 w-3.5" aria-hidden />
                    ) : (
                        <BellPlus className="h-3.5 w-3.5" aria-hidden />
                    )}
                    {following
                        ? isPlace
                            ? copy.followingPlace
                            : copy.followingCategory
                        : isPlace
                            ? copy.followPlace
                            : copy.followCategory}
                </button>
                <span className="text-xs text-muted-foreground tabular-nums">
                    {copy.placeFollowers.replace("{count}", String(followers))}
                </span>
            </span>
            {notice ? (
                <span role="status" className="text-xs text-muted-foreground">
                    {notice}
                </span>
            ) : null}
        </span>
    );
}
