/** Shared state shape returned by the public server actions. */
export type SubmitState = { ok: boolean; error?: string };

/** W20 content reactions (spec §16 first slice) — kinds + state shape. */
export const REACTION_KINDS = ["like", "helpful"] as const;
export type ReactionKind = (typeof REACTION_KINDS)[number];

export type ReactionState = {
    likes: number;
    helpful: number;
    mine: ReactionKind[];
};
