/**
 * Human-verification mode matrix (lib/security/human-gate.ts).
 *
 * The facade is the single seam every public form's server action goes through,
 * so this suite is what keeps the three modes honest:
 *   - `pow` (default) reads `pow-response` and delegates to the proof-of-work
 *     verifier (injected clock + one-time consumer here),
 *   - `turnstile` reads the legacy `cf-turnstile-response` field and delegates
 *     to the Cloudflare siteverify call,
 *   - `off` only exists outside production, and production can never resolve
 *     to it (a deployment mistake must not silently disable bot protection).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/observability/logger", () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
    POW_FIELD,
    TURNSTILE_FIELD,
    humanMode,
    verifyHumanGate,
    verifyHumanGateToken,
} from "./human-gate";
import { issuePowChallenge } from "./pow";
import { decodePowChallenge, solvePowChallenge } from "./pow-solve";
import { en } from "@/lib/i18n/en";
import { fr } from "@/lib/i18n/fr";

const FIXED_NOW = 1_800_000_000_000;
const POW_ENV = { POW_HMAC_KEY: "gate-key", POW_DIFFICULTY_BITS: "8" } as unknown as NodeJS.ProcessEnv;

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});

/** Minimal FormData builder (avoids the DOM-only `new FormData(htmlForm)` path). */
function form(entries: Record<string, string>): FormData {
    const fd = new FormData();
    for (const [key, value] of Object.entries(entries)) fd.set(key, value);
    return fd;
}

/** Issues a challenge with the test env and solves it, like the browser gate. */
async function solvedToken(): Promise<string> {
    const issue = issuePowChallenge(POW_ENV, () => FIXED_NOW);
    if (!issue) throw new Error("expected a challenge");
    const params = decodePowChallenge(issue.challenge);
    if (!params) throw new Error("expected decodable params");
    const nonce = await solvePowChallenge(params, { now: () => FIXED_NOW });
    return `${issue.challenge}.${nonce}`;
}

/** Options that satisfy the PoW branch without touching the durable limiter. */
function powOptions(env: NodeJS.ProcessEnv) {
    return { env, now: () => FIXED_NOW, consume: async () => true };
}

describe("humanMode", () => {
    it("defaults to pow for unset and unrecognised values", () => {
        expect(humanMode({} as unknown as NodeJS.ProcessEnv)).toBe("pow");
        expect(humanMode({ NEXT_PUBLIC_HUMAN_MODE: "junk" } as unknown as NodeJS.ProcessEnv)).toBe("pow");
    });

    it("honours an explicit turnstile mode", () => {
        expect(humanMode({ NEXT_PUBLIC_HUMAN_MODE: "turnstile" } as unknown as NodeJS.ProcessEnv)).toBe(
            "turnstile",
        );
    });

    it("allows off outside production but never inside it", () => {
        expect(
            humanMode({ NEXT_PUBLIC_HUMAN_MODE: "off", NODE_ENV: "test" } as unknown as NodeJS.ProcessEnv),
        ).toBe("off");
        expect(
            humanMode({ NEXT_PUBLIC_HUMAN_MODE: "off", NODE_ENV: "production" } as unknown as NodeJS.ProcessEnv),
        ).toBe("pow");
    });
});

describe("verifyHumanGate — off mode", () => {
    const env = { NEXT_PUBLIC_HUMAN_MODE: "off", NODE_ENV: "test" } as unknown as NodeJS.ProcessEnv;

    it("waves through outside production", async () => {
        expect(await verifyHumanGate(new FormData(), { env })).toBe(true);
        expect(await verifyHumanGateToken(null, { env })).toBe(true);
    });

    it("cannot be turned off in production (resolves to fail-closed pow)", async () => {
        const prod = { NEXT_PUBLIC_HUMAN_MODE: "off", NODE_ENV: "production" } as unknown as NodeJS.ProcessEnv;
        expect(await verifyHumanGate(form({ [POW_FIELD]: "anything" }), { env: prod, pow: { env: prod } })).toBe(
            false,
        );
    });
});

describe("verifyHumanGate — pow mode", () => {
    const env = {
        ...POW_ENV,
        NEXT_PUBLIC_HUMAN_MODE: "pow",
        NODE_ENV: "test",
    } as unknown as NodeJS.ProcessEnv;

    it("accepts a solved token on the pow field", async () => {
        const token = await solvedToken();
        expect(await verifyHumanGate(form({ [POW_FIELD]: token }), { env, pow: powOptions(env) })).toBe(
            true,
        );
    });

    it("rejects an empty form and the legacy Cloudflare field", async () => {
        const token = await solvedToken();
        expect(await verifyHumanGate(new FormData(), { env, pow: powOptions(env) })).toBe(false);
        // The gate reads the mode's field: a pow token under the Cloudflare
        // name is not a solution.
        expect(
            await verifyHumanGate(form({ [TURNSTILE_FIELD]: token }), { env, pow: powOptions(env) }),
        ).toBe(false);
    });

    it("verifyHumanGateToken takes a raw token (non-FormData action path)", async () => {
        const token = await solvedToken();
        expect(await verifyHumanGateToken(token, { env, pow: powOptions(env) })).toBe(true);
        expect(await verifyHumanGateToken(null, { env, pow: powOptions(env) })).toBe(false);
    });
});

describe("verifyHumanGate — turnstile mode", () => {
    const env = { NEXT_PUBLIC_HUMAN_MODE: "turnstile", NODE_ENV: "test" } as unknown as NodeJS.ProcessEnv;

    it("delegates to Cloudflare siteverify and fails closed on rejection", async () => {
        vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({ ok: true, json: async () => ({ success: false }) })),
        );

        expect(await verifyHumanGate(form({ [TURNSTILE_FIELD]: "tok" }), { env })).toBe(false);
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("accepts a Cloudflare-approved token, ignoring the pow field", async () => {
        vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({ ok: true, json: async () => ({ success: true }) })),
        );

        expect(await verifyHumanGate(form({ [TURNSTILE_FIELD]: "tok" }), { env })).toBe(true);
        // Mode-aware field read: a pow token alone does not satisfy this mode.
        expect(await verifyHumanGate(form({ [POW_FIELD]: "tok" }), { env })).toBe(false);
    });

    it("fails closed when the siteverify transport errors", async () => {
        vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                throw new Error("network down");
            }),
        );

        expect(await verifyHumanGate(form({ [TURNSTILE_FIELD]: "tok" }), { env })).toBe(false);
    });

    it("verifyHumanGateToken takes a raw token in this mode too", async () => {
        vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({ ok: true, json: async () => ({ success: true }) })),
        );

        expect(await verifyHumanGateToken("tok", { env })).toBe(true);
    });
});


describe("gate copy contract (dict.common.human)", () => {
    /**
     * The gate renders `progress` through `.replace("{percent}", …)`, so a copy
     * edit that drops the placeholder silently removes the screen-reader
     * progress announcement. The dictionaries are the single source the mounts
     * pass down, so this is the place to pin it.
     */
    it("both locales carry the placeholder and non-empty copy", () => {
        for (const dict of [en, fr]) {
            const human = dict.common.human;
            expect(human.progress).toContain("{percent}");
            for (const value of Object.values(human)) {
                expect(value.trim().length).toBeGreaterThan(0);
            }
        }
    });
});

