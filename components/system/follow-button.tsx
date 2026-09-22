"use client";

import { useEffect, useState } from "react";
import { UserPlus, UserCheck } from "lucide-react";
import { getFollowState, toggleFollow } from "@/lib/follows/actions";
import { cn } from "@/lib/utils";
import type { Dictionary } from "@/lib/i18n";

type FollowCopy = Dictionary["follow"];

/**
 * Follow/unfollow toggle for contributor profiles, with a live follower
 * count. Guests get a sign-in hint; self-follow is rejected server-side.
 */
export function FollowButton({
    contributorId,
    copy,
}: {
    contributorId: string;
    copy: FollowCopy;
}) {
    const [following, setFollowing] = useState(false);
    const [followers, setFollowers] = useState(0);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        void getFollowState(contributorId).then((state) => {
            if (cancelled) return;
            setFollowing(state.following);
            setFollowers(state.followers);
        });
        return () => {
            cancelled = true;
        };
    }, [contributorId]);

    async function handleClick() {
        if (busy) return;
        setBusy(true);
        const result = await toggleFollow(contributorId);
        setBusy(false);
        if (!result.ok) {
            setNotice(result.error === "Not authenticated." ? copy.signIn : result.error || copy.error);
            return;
        }
        setFollowing(result.following);
        setFollowers(result.followers);
        setNotice(result.following ? copy.followed : copy.unfollowed);
    }

    return (
        <span className="inline-flex flex-col gap-1">
            <span className="inline-flex items-center gap-2">
                <button
                    type="button"
                    onClick={handleClick}
                    disabled={busy}
                    aria-pressed={following}
                    className={cn(
                        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
                        following
                            ? "border border-primary/30 bg-primary/10 text-primary"
                            : "bg-primary text-primary-foreground hover:bg-primary/90",
                    )}
                >
                    {following ? (
                        <UserCheck className="h-3.5 w-3.5" aria-hidden />
                    ) : (
                        <UserPlus className="h-3.5 w-3.5" aria-hidden />
                    )}
                    {following ? copy.following : copy.follow}
                </button>
                <span className="text-xs text-muted-foreground tabular-nums">
                    {copy.followers.replace("{count}", String(followers))}
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
