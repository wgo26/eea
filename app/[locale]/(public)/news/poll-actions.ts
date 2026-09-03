"use server";

import { castPollVote } from "@/lib/queries/polls";

/**
 * Records one community poll vote.
 *
 * `voterToken` is an anonymous per-reader token generated in the browser; the
 * database enforces one vote per token per poll, so a reader who clears storage
 * can vote again — acceptable for an indicative community poll, and the
 * alternative (accounts) would break the "no mandatory account" principle.
 */
export async function submitPollVote(
    pollId: string,
    optionId: string,
    voterToken: string,
) {
    if (!pollId || !optionId || !voterToken) {
        return { ok: false as const, reason: "invalid" as const };
    }
    return castPollVote(pollId, optionId, voterToken);
}
