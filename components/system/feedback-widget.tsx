"use client";

import { useEffect, useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { getFeedbackState, submitFeedback } from "@/lib/feedback/actions";
import { cn } from "@/lib/utils";
import type { Dictionary } from "@/lib/i18n";

type FeedbackCopy = Dictionary["feedback"];

/**
 * "Was this helpful?" thumbs widget. One vote per signed-in user per story
 * (upsert on the pair); guests see the counts with a sign-in hint.
 */
export function FeedbackWidget({
    contentItemId,
    copy,
}: {
    contentItemId: string;
    copy: FeedbackCopy;
}) {
    const [mine, setMine] = useState<boolean | null>(null);
    const [helpful, setHelpful] = useState(0);
    const [notHelpful, setNotHelpful] = useState(0);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        void getFeedbackState(contentItemId).then((state) => {
            if (cancelled) return;
            setMine(state.mine);
            setHelpful(state.helpful);
            setNotHelpful(state.notHelpful);
        });
        return () => {
            cancelled = true;
        };
    }, [contentItemId]);

    async function vote(value: boolean) {
        if (busy) return;
        setBusy(true);
        const result = await submitFeedback(contentItemId, value);
        setBusy(false);
        if (!result.ok) {
            setNotice(result.error === "Not authenticated." ? copy.signIn : copy.error);
            return;
        }
        setMine(result.state.mine);
        setHelpful(result.state.helpful);
        setNotHelpful(result.state.notHelpful);
        setNotice(copy.thanks);
    }

    function voteButton(value: boolean, count: number, label: string, Icon: typeof ThumbsUp) {
        const active = mine === value;
        return (
            <button
                type="button"
                onClick={() => vote(value)}
                disabled={busy}
                aria-pressed={active}
                aria-label={label}
                title={label}
                className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
                    active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
            >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {label}
                <span className="tabular-nums text-muted-foreground">· {count}</span>
            </button>
        );
    }

    return (
        <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{copy.title}</span>
            {voteButton(true, helpful, copy.yes, ThumbsUp)}
            {voteButton(false, notHelpful, copy.no, ThumbsDown)}
            {notice ? (
                <span role="status" className="text-xs text-muted-foreground">
                    {notice}
                </span>
            ) : null}
        </div>
    );
}
