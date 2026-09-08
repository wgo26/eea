"use server";

import { castPollVote } from "@/lib/queries/polls";
import { checkRateLimit } from "@/lib/security/rate-limit";

/**
 * Records one community poll vote.
 *
 * `voterToken` is an anonymous per-reader token generated in the browser; the
 * database enforces one vote per token per poll, so a reader who clears storage
 * can vote again — acceptable for an indicative community poll, and the
 * alternative (accounts) would break the "no mandatory account" principle.
 *
 * Per-IP fixed-window rate limiting (durable, migration 20260918000000) keeps
 * ballot-stuffing scripts from cycling tokens at wire speed. A limited request
 * surfaces as the generic "error" reason in the poll card UI.
 */
export async function submitPollVote(
    pollId: string,
    optionId: string,
    voterToken: string,
) {
    if (!pollId || !optionId || !voterToken) {
        return { ok: false as const, reason: "invalid" as const };
    }
    const limited = await checkRateLimit("public:poll-vote", {
        max: 8,
        windowMs: 10 * 60_000,
    });
    if (!limited.ok) {
        return { ok: false as const, reason: "error" as const };
    }
    return castPollVote(pollId, optionId, voterToken);
}
