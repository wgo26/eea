import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import type { Locale } from "@/lib/i18n";

/**
 * Data access for the Community Poll module on the news page.
 *
 * Reads `polls`, `poll_options` and the `poll_results` aggregate view
 * created by `supabase/migrations/20260902000000_community_polls.sql`.
 *
 * There is deliberately NO demo fallback: every poll rendered here is a row
 * the staff manage in the admin command center (`/admin/polls`). Deleting
 * the last poll empties the module (the page renders its dictionary-driven
 * empty state) instead of resurrecting hardcoded content. Every failure
 * path resolves to an empty array: a missing table or a DB hiccup must
 * never take the news page down.
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
    /** Origin marker, kept for forward compatibility — every poll rendered
     *  here is a database row managed in `/admin/polls` (there is no demo
     *  source; an empty table renders the dictionary empty state). */
    source: "database";
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

/**
 * Active polls, newest first. Returns an empty array when there are no
 * active polls, the tables are missing, or the database is unreachable —
 * the news page then renders its empty state instead of hardcoded polls.
 */
export async function getActivePolls(limit = 3): Promise<PollData[]> {
    if (!hasDatabase()) return [];

    const supabase = createAdminClient();
    const pollsResult = await supabase
        .from("polls")
        .select(
            "id, question, closes_at, is_active, content_item_id, story:content_items(slug), poll_options(id, label, sort_order)",
        )
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (pollsResult.error) {
        if (isMissingTable(pollsResult.error)) {
            // Expected until the migration is applied — not worth a console error.
            return [];
        }
        logger.error("polls", "active polls query failed", { error: pollsResult.error.message });
        return [];
    }

    const rows = (pollsResult.data ?? []) as unknown as {
        id: string;
        question: string;
        closes_at: string | null;
        content_item_id: string | null;
        story: { slug: string } | null;
        poll_options: { id: string; label: string; sort_order: number | null }[] | null;
    }[];
    // Zero rows means the staff deleted (or never created) every poll:
    // render nothing rather than hardcoded demo content.
    if (rows.length === 0) return [];

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
            href: row.story?.slug ? `/news/${row.story.slug}` : null,
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
        logger.error("polls", "option lookup failed", { error: optionResult.error.message });
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
        logger.error("polls", "vote insert failed", { error: insertResult.error.message });
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
        .select("id, question, closes_at, content_item_id, story:content_items(slug), poll_options(id, label, sort_order)")
        .eq("id", pollId)
        .limit(1);

    if (pollResult.error || !pollResult.data || pollResult.data.length === 0) return null;

    const row = pollResult.data[0] as unknown as {
        id: string;
        question: string;
        closes_at: string | null;
        content_item_id: string | null;
        story: { slug: string } | null;
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
        href: row.story?.slug ? `/news/${row.story.slug}` : null,
        options,
        totalVotes: options.reduce((sum, o) => sum + o.votes, 0),
        source: "database" as const,
    };
}

/** Kept for parity with the other verticals; polls are not locale-scoped yet. */
export type { Locale };
