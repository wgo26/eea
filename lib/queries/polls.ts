import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { DEMO_POLLS } from "@/lib/polls-demo";
import type { Locale } from "@/lib/i18n";

/**
 * Data access for the Community Poll module on the news page.
 *
 * Two modes, deliberately:
 *
 *  1. Database mode — reads `polls`, `poll_options` and the `poll_results`
 *     aggregate view created by
 *     `supabase/migrations/20260902000000_community_polls.sql`.
 *  2. Demo mode — if those tables have not been created yet (PGRST205), the
 *     curated list in `lib/polls-demo.ts` is returned instead. The page
 *     therefore renders correctly before the migration is applied.
 *
 * Every failure path resolves to the demo list or an empty array: a missing
 * table or a DB hiccup must never take the news page down.
 */

export type PollOptionData = {
    id: string;
    label: string;
    votes: number;
};

export type PollData = {
    id: string;
    question: string;
    closesAt: string | null;
    /** Related community story, when the poll is attached to one. */
    href: string | null;
    options: PollOptionData[];
    totalVotes: number;
    /** Where this poll came from — drives whether votes can be persisted. */
    source: "database" | "demo";
};

const MISSING_TABLE_CODES = new Set(["PGRST205", "42P01"]);

function isMissingTable(error: { message?: string; code?: string } | null): boolean {
    if (!error) return false;
    if (error.code && MISSING_TABLE_CODES.has(error.code)) return true;
    return /could not find the table|relation .* does not exist/i.test(error.message ?? "");
}

function hasDatabase(): boolean {
    return Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
}

/** Demo fallback, converted to the shared shape. */
function demoPolls(): PollData[] {
    return DEMO_POLLS.map((poll) => {
        const closesAt =
            poll.closesInDays === null
                ? null
                : new Date(Date.now() + poll.closesInDays * 86_400_000).toISOString();
        return {
            id: poll.id,
            question: poll.question,
            closesAt,
            href: null,
            options: poll.options.map((o) => ({ id: o.id, label: o.label, votes: o.votes })),
            totalVotes: poll.options.reduce((sum, o) => sum + o.votes, 0),
            source: "demo" as const,
        };
    });
}

/**
 * Active polls, newest first. Falls back to the curated demo list when the
 * polls tables have not been created yet.
 */
export async function getActivePolls(limit = 3): Promise<PollData[]> {
    if (!hasDatabase()) return demoPolls();

    const supabase = createAdminClient();
    const pollsResult = await supabase
        .from("polls")
        .select(
            "id, question, closes_at, is_active, content_item_id, poll_options(id, label, sort_order)",
        )
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (pollsResult.error) {
        if (isMissingTable(pollsResult.error)) {
            // Expected until the migration is applied — not worth a console error.
            return demoPolls();
        }
        console.error("[polls]", pollsResult.error.message);
        return demoPolls();
    }

    const rows = (pollsResult.data ?? []) as unknown as {
        id: string;
        question: string;
        closes_at: string | null;
        content_item_id: string | null;
        poll_options: { id: string; label: string; sort_order: number | null }[] | null;
    }[];
    if (rows.length === 0) return demoPolls();

    // Tallies come from the aggregate view (raw ballots are never readable).
    const resultsResult = await supabase
        .from("poll_results")
        .select("poll_id, option_id, votes")
        .in(
            "poll_id",
            rows.map((r) => r.id),
        );

    const tallies = new Map<string, number>();
    for (const row of (resultsResult.data ?? []) as unknown as {
        poll_id: string;
        option_id: string;
        votes: number | null;
    }[]) {
        tallies.set(`${row.poll_id}:${row.option_id}`, Number(row.votes ?? 0));
    }

    return rows.map((row) => {
        const options = (row.poll_options ?? [])
            .slice()
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
            .map((option) => ({
                id: option.id,
                label: option.label,
                votes: tallies.get(`${row.id}:${option.id}`) ?? 0,
            }));
        return {
            id: row.id,
            question: row.question,
            closesAt: row.closes_at,
            href: row.content_item_id ? `/news/${row.content_item_id}` : null,
            options,
            totalVotes: options.reduce((sum, o) => sum + o.votes, 0),
            source: "database" as const,
        };
    });
}

/**
 * Records one ballot. Returns the refreshed tallies so the client can render
 * results immediately.
 *
 * `voterToken` is an anonymous per-reader token held in localStorage; the
 * `poll_votes_one_per_reader` unique constraint is what actually enforces
 * one vote per reader.
 */
export async function castPollVote(
    pollId: string,
    optionId: string,
    voterToken: string,
): Promise<
    | { ok: true; poll: PollData }
    | { ok: false; reason: "unavailable" | "already_voted" | "invalid" | "error" }
> {
    if (!hasDatabase()) return { ok: false, reason: "unavailable" };
    if (!pollId || !optionId || !voterToken) return { ok: false, reason: "invalid" };

    const supabase = createAdminClient();

    // Confirm the option belongs to the poll (never trust the client pair).
    const optionResult = await supabase
        .from("poll_options")
        .select("id, poll_id")
        .eq("id", optionId)
        .eq("poll_id", pollId)
        .limit(1);

    if (optionResult.error) {
        if (isMissingTable(optionResult.error)) return { ok: false, reason: "unavailable" };
        console.error("[polls] option lookup", optionResult.error.message);
        return { ok: false, reason: "error" };
    }
    if (!optionResult.data || optionResult.data.length === 0) {
        return { ok: false, reason: "invalid" };
    }

    const insertResult = await supabase
        .from("poll_votes")
        .insert({ poll_id: pollId, option_id: optionId, voter_token: voterToken });

    if (insertResult.error) {
        // 23505 = unique_violation → this reader already voted.
        if (insertResult.error.code === "23505") return { ok: false, reason: "already_voted" };
        if (isMissingTable(insertResult.error)) return { ok: false, reason: "unavailable" };
        console.error("[polls] vote", insertResult.error.message);
        return { ok: false, reason: "error" };
    }

    const refreshed = await refreshPoll(pollId);
    if (!refreshed) return { ok: false, reason: "error" };
    return { ok: true, poll: refreshed };
}

/** Re-reads one poll (with tallies) after a vote. */
export async function refreshPoll(pollId: string): Promise<PollData | null> {
    if (!hasDatabase()) return null;
    const supabase = createAdminClient();

    const pollResult = await supabase
        .from("polls")
        .select("id, question, closes_at, content_item_id, poll_options(id, label, sort_order)")
        .eq("id", pollId)
        .limit(1);

    if (pollResult.error || !pollResult.data || pollResult.data.length === 0) return null;

    const row = pollResult.data[0] as unknown as {
        id: string;
        question: string;
        closes_at: string | null;
        content_item_id: string | null;
        poll_options: { id: string; label: string; sort_order: number | null }[] | null;
    };

    const resultsResult = await supabase
        .from("poll_results")
        .select("option_id, votes")
        .eq("poll_id", pollId);

    const tallies = new Map<string, number>();
    for (const r of (resultsResult.data ?? []) as unknown as {
        option_id: string;
        votes: number | null;
    }[]) {
        tallies.set(r.option_id, Number(r.votes ?? 0));
    }

    const options = (row.poll_options ?? [])
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((option) => ({
            id: option.id,
            label: option.label,
            votes: tallies.get(option.id) ?? 0,
        }));

    return {
        id: row.id,
        question: row.question,
        closesAt: row.closes_at,
        href: row.content_item_id ? `/news/${row.content_item_id}` : null,
        options,
        totalVotes: options.reduce((sum, o) => sum + o.votes, 0),
        source: "database" as const,
    };
}

/** Kept for parity with the other verticals; polls are not locale-scoped yet. */
export type { Locale };
