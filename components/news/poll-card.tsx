"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Check, Loader2, Share2, Vote } from "lucide-react";

import { submitPollVote } from "@/app/[locale]/(public)/news/poll-actions";
import { cn } from "@/lib/utils";
import { formatPercent, whatsappHref } from "@/lib/format";
import type { Locale, Dictionary } from "@/lib/i18n";
import type { PollData } from "@/lib/queries/polls";

const VOTER_TOKEN_KEY = "eea:voter-token";
const voteKey = (pollId: string) => `eea:poll-vote:${pollId}`;

/** Anonymous ballot token, created once per browser. */
function getVoterToken(): string {
    try {
        const existing = window.localStorage.getItem(VOTER_TOKEN_KEY);
        if (existing) return existing;
        const token =
            typeof crypto !== "undefined" && "randomUUID" in crypto
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        window.localStorage.setItem(VOTER_TOKEN_KEY, token);
        return token;
    } catch {
        // Private mode / storage disabled — fall back to a session-only token.
        return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
}

type PollCardProps = {
    poll: PollData;
    dict: Dictionary;
    locale: Locale;
    /** "feature" = full card in the main column; "rail" = compact sidebar card. */
    variant?: "feature" | "rail";
    className?: string;
};

/**
 * One community poll with voting.
 *
 * Voting is optimistic: the bar fills immediately, then the server response
 * reconciles the real tallies. If the polls tables have not been created yet
 * (migration not applied) the vote is kept locally so the interaction still
 * works, and the reader is told results are indicative.
 */
export function PollCard({ poll, dict, locale, variant = "feature", className }: PollCardProps) {
    const [tallies, setTallies] = useState<Record<string, number>>(() =>
        Object.fromEntries(poll.options.map((o) => [o.id, o.votes])),
    );
    const [votedFor, setVotedFor] = useState<string | null>(null);
    const [localOnly, setLocalOnly] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const [renderedAt] = useState(() => Date.now());

    // Restore this reader's vote (and any locally-held tally) on mount.
    useEffect(() => {
        try {
            const stored = window.localStorage.getItem(voteKey(poll.id));
            if (stored) {
                const parsed = JSON.parse(stored) as { optionId?: string; tallies?: Record<string, number> };
                queueMicrotask(() => {
                    if (parsed.optionId) setVotedFor(parsed.optionId);
                    if (parsed.tallies) setTallies((prev) => ({ ...prev, ...parsed.tallies }));
                    if (parsed.tallies) setLocalOnly(true);
                });
            }
        } catch {
            /* ignore malformed storage */
        }
    }, [poll.id]);

    const total = useMemo(
        () => Object.values(tallies).reduce((sum, n) => sum + n, 0),
        [tallies],
    );
    const maxVotes = useMemo(() => Math.max(...Object.values(tallies), 0), [tallies]);
    const leaders = useMemo(
        () => poll.options.filter((o) => (tallies[o.id] ?? 0) === maxVotes && maxVotes > 0),
        [poll.options, tallies, maxVotes],
    );

    const closed = Boolean(poll.closesAt && new Date(poll.closesAt) <= new Date());
    const canVote = !closed && votedFor === null;
    const showResults = closed || votedFor !== null;

    const persistLocal = useCallback(
        (optionId: string, next: Record<string, number>) => {
            try {
                window.localStorage.setItem(
                    voteKey(poll.id),
                    JSON.stringify({ optionId, tallies: next }),
                );
            } catch {
                /* storage unavailable — the in-memory state still works */
            }
        },
        [poll.id],
    );

    const vote = useCallback(
        (optionId: string) => {
            if (!canVote || isPending) return;
            setError(null);
            setVotedFor(optionId);

            // Optimistic bump.
            const optimistic = { ...tallies, [optionId]: (tallies[optionId] ?? 0) + 1 };
            setTallies(optimistic);

            const token = getVoterToken();

            // Demo mode (tables not created yet): keep the vote local only.
            if (poll.source === "demo") {
                setLocalOnly(true);
                persistLocal(optionId, optimistic);
                return;
            }

            startTransition(async () => {
                const result = await submitPollVote(poll.id, optionId, token);
                if (result.ok) {
                    setTallies(
                        Object.fromEntries(result.poll.options.map((o) => [o.id, o.votes])),
                    );
                    setLocalOnly(false);
                    try {
                        window.localStorage.setItem(
                            voteKey(poll.id),
                            JSON.stringify({ optionId }),
                        );
                    } catch {
                        /* ignore */
                    }
                    return;
                }
                if (result.reason === "already_voted") {
                    // Already counted — keep the optimistic result.
                    return;
                }
                if (result.reason === "unavailable") {
                    // Polls tables missing: fall back to a local vote so the
                    // reader still gets feedback rather than a dead button.
                    setLocalOnly(true);
                    persistLocal(optionId, optimistic);
                    return;
                }
                setError(dict.common.error);
                setVotedFor(null);
                setTallies(tallies);
            });
        },
        [canVote, isPending, tallies, poll.id, poll.source, dict.common.error, persistLocal],
    );

    const closingLabel = useMemo(() => {
        if (!poll.closesAt) return null;
        const target = new Date(poll.closesAt);
        if (Number.isNaN(target.getTime())) return null;
        if (closed) return dict.polls.closed;
        const days = Math.max(
            0,
            Math.round((target.getTime() - renderedAt) / 86_400_000),
        );
        if (days === 0) return dict.fundraisers.endsToday;
        return `${dict.polls.closesIn} ${days} ${days === 1 ? dict.fundraisers.dayLeft : dict.fundraisers.daysLeft}`;
    }, [poll.closesAt, closed, dict, renderedAt]);

    const shareHref = useMemo(() => {
        if (typeof window === "undefined") return "#";
        return whatsappHref(window.location.href, `${poll.question} —`);
    }, [poll.question]);

    return (
        <div
            className={cn(
                "overflow-hidden rounded-3xl border bg-card",
                variant === "feature" ? "shadow-sm" : "",
                className,
            )}
        >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-5 py-3">
                <span className="inline-flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.18em] text-foreground">
                    <Vote className="h-3.5 w-3.5 text-primary" aria-hidden />
                    {variant === "feature" ? dict.polls.title : dict.polls.upcoming}
                </span>
                {closingLabel ? (
                    <span
                        className={cn(
                            "rounded-full px-2.5 py-0.5 text-[10px] font-bold",
                            closed
                                ? "bg-muted text-muted-foreground"
                                : "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
                        )}
                    >
                        {closingLabel}
                    </span>
                ) : null}
            </div>

            <div className={cn(variant === "feature" ? "p-5 md:p-6" : "p-4")}>
                <h3
                    className={cn(
                        "font-extrabold leading-snug tracking-tight",
                        variant === "feature"
                            ? "text-xl md:text-2xl"
                            : "text-base",
                    )}
                >
                    {poll.question}
                </h3>

                {variant === "feature" ? (
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        {dict.polls.intro}
                    </p>
                ) : null}

                {/* Options */}
                <ul
                    className={cn("space-y-2", variant === "feature" ? "mt-5" : "mt-4")}
                    role={canVote ? "group" : undefined}
                    aria-label={poll.question}
                >
                    {poll.options.map((option) => {
                        const votes = tallies[option.id] ?? 0;
                        const share = total > 0 ? Math.round((votes / total) * 100) : 0;
                        const isLeader = showResults && votes === maxVotes && maxVotes > 0;
                        const isPick = votedFor === option.id;

                        return (
                            <li key={option.id}>
                                {showResults ? (
                                    <div
                                        className={cn(
                                            "relative overflow-hidden rounded-xl border px-3.5 py-2.5 transition-colors",
                                            isPick
                                                ? "border-primary bg-primary/5"
                                                : "border-transparent bg-muted/50",
                                        )}
                                    >
                                        {/* Result bar sits behind the label */}
                                        <span
                                            className={cn(
                                                "absolute inset-y-0 left-0 transition-[width] duration-500",
                                                isLeader ? "bg-primary/25" : "bg-foreground/[0.07]",
                                            )}
                                            style={{ width: `${share}%` }}
                                            aria-hidden
                                        />
                                        <span className="relative flex items-center justify-between gap-3">
                                            <span className="flex min-w-0 items-center gap-2">
                                                {isPick ? (
                                                    <Check
                                                        className="h-4 w-4 shrink-0 text-primary"
                                                        aria-hidden
                                                    />
                                                ) : null}
                                                <span
                                                    className={cn(
                                                        "truncate text-sm",
                                                        isLeader ? "font-bold" : "font-medium",
                                                    )}
                                                >
                                                    {option.label}
                                                </span>
                                                {isPick ? (
                                                    <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                                                        {dict.polls.yourPick}
                                                    </span>
                                                ) : null}
                                            </span>
                                            <span className="shrink-0 text-sm font-bold tabular-nums">
                                                {formatPercent(share, locale)}
                                            </span>
                                        </span>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => vote(option.id)}
                                        disabled={!canVote || isPending}
                                        className="group flex w-full items-center gap-3 rounded-xl border bg-card px-3.5 py-3 text-left transition-all hover:border-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        <span
                                            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-muted-foreground/40 transition-colors group-hover:border-primary"
                                            aria-hidden
                                        />
                                        <span className="text-sm font-medium">{option.label}</span>
                                    </button>
                                )}
                            </li>
                        );
                    })}
                </ul>

                {/* Footer */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                    <p className="text-xs text-muted-foreground">
                        <strong className="tabular-nums text-foreground">{total}</strong>{" "}
                        {total === 1 ? dict.polls.oneVote : dict.polls.votes}
                        {showResults && leaders.length === 1 ? (
                            <>
                                {" · "}
                                <span className="font-semibold text-foreground">
                                    {dict.polls.leading}: {leaders[0].label}
                                </span>
                            </>
                        ) : null}
                        {showResults && leaders.length > 1 && total > 0 ? (
                            <>
                                {" · "}
                                <span className="font-semibold text-foreground">
                                    {dict.polls.tied}
                                </span>
                            </>
                        ) : null}
                    </p>
                    <a
                        href={shareHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-link hover:underline"
                    >
                        <Share2 className="h-3.5 w-3.5" aria-hidden />
                        {dict.polls.share}
                    </a>
                </div>

                {votedFor ? (
                    <p
                        className={cn(
                            "mt-2 flex items-center gap-1.5 text-xs font-medium",
                            localOnly ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400",
                        )}
                    >
                        <Check className="h-3.5 w-3.5" aria-hidden />
                        {dict.polls.voteSubmitted}
                    </p>
                ) : null}

                {isPending ? (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        {dict.common.loading}
                    </p>
                ) : null}

                {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}

                {variant === "feature" ? (
                    <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                        {dict.polls.note}
                    </p>
                ) : null}
            </div>
        </div>
    );
}

/** Placeholder shown when there are no polls to render at all. */
export function PollEmpty({ dict }: { dict: Dictionary }) {
    return (
        <div className="rounded-3xl border border-dashed p-6">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Vote className="h-5 w-5" aria-hidden />
            </span>
            <p className="mt-3 text-sm text-muted-foreground">{dict.polls.empty}</p>
        </div>
    );
}
