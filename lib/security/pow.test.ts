/**
 * Proof-of-work human gate — server verifier (lib/security/pow.ts) and the
 * shared solver (lib/security/pow-solve.ts) exercised as one unit, because the
 * whole design rests on the client's solution shape matching exactly what the
 * server re-computes. A drift here is either a bot hole or a form nobody can
 * submit.
 *
 * Covered:
 *  - bit-accurate difficulty (the shared predicate both sides use),
 *  - difficulty env clamping (a bad value can neither trivialize nor wreck it),
 *  - issue → solve → verify round-trip,
 *  - every rejection path: tampered HMAC, expired, malformed, wrong digest,
 *    unsupported version, out-of-range difficulty, replay,
 *  - fail-closed posture without key material (and the POW_REQUIRE rehearsal).
 */
import { createHash, createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/observability/logger", () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
    POW_DIFFICULTY_DEFAULT,
    POW_DIFFICULTY_MAX,
    POW_DIFFICULTY_MIN,
    issuePowChallenge,
    meetsDifficulty,
    resolveDifficulty,
    verifyPowToken,
} from "./pow";
import { PowExpiredError, decodePowChallenge, solvePowChallenge } from "./pow-solve";

const KEY = "unit-test-pow-key";
const FIXED_NOW = 1_800_000_000_000;
/** 8 bits keeps the test search ~256 digests while exercising every branch. */
const ENV = { POW_HMAC_KEY: KEY, POW_DIFFICULTY_BITS: "8" } as unknown as NodeJS.ProcessEnv;

/** Issues a challenge and solves it locally, exactly like the browser gate. */
async function solved(now = FIXED_NOW) {
    const issue = issuePowChallenge(ENV, () => now);
    if (!issue) throw new Error("expected a challenge");
    const params = decodePowChallenge(issue.challenge);
    if (!params) throw new Error("expected decodable params");
    const nonce = await solvePowChallenge(params, { now: () => now });
    return { token: `${issue.challenge}.${nonce}`, params, issue, nonce };
}

/** Re-signs an arbitrary payload so a rejection is proven to come from the
 *  payload check, not from the HMAC check that would also fail. */
function sign(payload: Record<string, unknown>, key = KEY): string {
    const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    return `${encoded}.${createHmac("sha256", key).update(encoded).digest("base64url")}`;
}

/** Finds a nonce that does NOT meet the difficulty (deterministic scan). */
function failingNonce(salt: string, bits: number): string {
    for (let n = 0; n < 4096; n++) {
        const digest = createHash("sha256").update(`${salt}${n}`).digest("hex");
        if (!meetsDifficulty(digest, bits)) return String(n);
    }
    throw new Error("no failing nonce found");
}

describe("meetsDifficulty", () => {
    it("counts leading zero bits, not hex characters", () => {
        // 4 bits only constrains the high nibble.
        expect(meetsDifficulty("0fff", 4)).toBe(true);
        expect(meetsDifficulty("1fff", 4)).toBe(false);
        // 5 bits reaches into the second nibble's high bit.
        expect(meetsDifficulty("07ff", 5)).toBe(true);
        expect(meetsDifficulty("08ff", 5)).toBe(false);
        // 16 bits = two whole zero bytes.
        expect(meetsDifficulty("0000ffff", 16)).toBe(true);
        expect(meetsDifficulty("0001ffff", 16)).toBe(false);
    });

    it("is trivial at zero bits", () => {
        expect(meetsDifficulty("ffff", 0)).toBe(true);
    });
});

describe("resolveDifficulty", () => {
    it("defaults when unset or unparsable", () => {
        expect(resolveDifficulty({} as unknown as NodeJS.ProcessEnv)).toBe(POW_DIFFICULTY_DEFAULT);
        expect(resolveDifficulty({ POW_DIFFICULTY_BITS: "abc" } as unknown as NodeJS.ProcessEnv)).toBe(
            POW_DIFFICULTY_DEFAULT,
        );
    });

    it("clamps so a bad value cannot trivialize or wreck the gate", () => {
        expect(resolveDifficulty({ POW_DIFFICULTY_BITS: "0" } as unknown as NodeJS.ProcessEnv)).toBe(
            POW_DIFFICULTY_MIN,
        );
        expect(resolveDifficulty({ POW_DIFFICULTY_BITS: "999" } as unknown as NodeJS.ProcessEnv)).toBe(
            POW_DIFFICULTY_MAX,
        );
        expect(resolveDifficulty({ POW_DIFFICULTY_BITS: "12" } as unknown as NodeJS.ProcessEnv)).toBe(12);
    });
});

describe("issuePowChallenge", () => {
    it("returns null when no key material exists", () => {
        expect(issuePowChallenge({} as unknown as NodeJS.ProcessEnv)).toBeNull();
    });

    it("derives its key from the service-role key when POW_HMAC_KEY is unset", () => {
        const issue = issuePowChallenge({ SUPABASE_SERVICE_ROLE_KEY: "svc" } as unknown as NodeJS.ProcessEnv);
        expect(issue).not.toBeNull();
    });

    it("signs the clamped difficulty and a future expiry", () => {
        const issue = issuePowChallenge(ENV, () => FIXED_NOW)!;
        const params = decodePowChallenge(issue.challenge)!;
        expect(params.bits).toBe(8);
        expect(params.exp).toBeGreaterThan(FIXED_NOW);
        expect(params.salt.endsWith(":")).toBe(true);
        expect(issue.expiresAt).toBe(params.exp);
    });
});

describe("solvePowChallenge", () => {
    it("finds a nonce whose digest meets the difficulty", async () => {
        const { params, nonce } = await solved();
        const digest = createHash("sha256").update(`${params.salt}${nonce}`).digest("hex");
        expect(meetsDifficulty(digest, params.bits)).toBe(true);
        expect(nonce).toMatch(/^\d+$/);
    });

    it("aborts when the challenge expires mid-solve", async () => {
        const issue = issuePowChallenge(ENV, () => FIXED_NOW)!;
        const params = decodePowChallenge(issue.challenge)!;
        await expect(
            solvePowChallenge(params, { now: () => params.exp + 1 }),
        ).rejects.toBeInstanceOf(PowExpiredError);
    });

    it("decodePowChallenge rejects junk and non-challenge JSON", () => {
        expect(decodePowChallenge("")).toBeNull();
        expect(decodePowChallenge("not-base64!!")).toBeNull();
        // Valid base64url of a JSON object without the expected keys.
        const junk = Buffer.from(JSON.stringify({ hello: "world" }), "utf8").toString("base64url");
        expect(decodePowChallenge(`${junk}.sig`)).toBeNull();
    });
});

describe("verifyPowToken — accept path", () => {
    it("accepts a freshly solved token and consumes it once", async () => {
        const { token, params } = await solved();
        const consumed = new Set<string>();
        const keys: string[] = [];
        const consume = async (key: string) => {
            keys.push(key);
            if (consumed.has(key)) return false;
            consumed.add(key);
            return true;
        };

        expect(await verifyPowToken(token, { env: ENV, now: () => FIXED_NOW, consume })).toBe(true);
        expect(keys[0]).toMatch(/^pow:use:[0-9a-f]{32}$/);
        // Single-use: the exact same token is refused the second time.
        expect(await verifyPowToken(token, { env: ENV, now: () => FIXED_NOW, consume })).toBe(false);
        expect(params.bits).toBe(8);
    });

    it("refuses when the one-time consumer denies (limiter outage / replay)", async () => {
        const { token } = await solved();
        expect(
            await verifyPowToken(token, {
                env: ENV,
                now: () => FIXED_NOW,
                consume: async () => false,
            }),
        ).toBe(false);
    });

    it("bounds the consumption window to the remaining challenge lifetime", async () => {
        const { token } = await solved();
        let window = 0;
        await verifyPowToken(token, {
            env: ENV,
            now: () => FIXED_NOW,
            consume: async (_key, windowMs) => {
                window = windowMs;
                return true;
            },
        });
        expect(window).toBeGreaterThan(0);
        expect(window).toBeLessThanOrEqual(15 * 60_000);
    });
});


describe("verifyPowToken — rejection paths", () => {
    it("rejects missing, empty and malformed tokens", async () => {
        for (const bad of [null, undefined, "", "a.b", "a.b.c.d", "only-one-part"]) {
            expect(await verifyPowToken(bad, { env: ENV, consume: async () => true })).toBe(false);
        }
    });

    it("rejects a token signed with the wrong key", async () => {
        const { issue, nonce } = await solved();
        const payload = issue.challenge.split(".")[0];
        const forged = `${payload}.${createHmac("sha256", "wrong-key")
            .update(payload)
            .digest("base64url")}.${nonce}`;
        expect(
            await verifyPowToken(forged, { env: ENV, now: () => FIXED_NOW, consume: async () => true }),
        ).toBe(false);
    });

    it("rejects an expired challenge", async () => {
        const { token, params } = await solved();
        expect(
            await verifyPowToken(token, {
                env: ENV,
                now: () => params.exp + 1,
                consume: async () => true,
            }),
        ).toBe(false);
    });

    it("rejects a nonce that does not satisfy the difficulty", async () => {
        const { issue, params } = await solved();
        const bad = failingNonce(params.salt, params.bits);
        expect(
            await verifyPowToken(`${issue.challenge}.${bad}`, {
                env: ENV,
                now: () => FIXED_NOW,
                consume: async () => true,
            }),
        ).toBe(false);
    });

    it("rejects a non-canonical nonce grammar", async () => {
        const { issue } = await solved();
        for (const nonce of ["-1", "1e3", "1.5", "1234567890123456"]) {
            expect(
                await verifyPowToken(`${issue.challenge}.${nonce}`, {
                    env: ENV,
                    now: () => FIXED_NOW,
                    consume: async () => true,
                }),
            ).toBe(false);
        }
    });
});


describe("verifyPowToken — payload validation", () => {
    it("rejects an unsupported version, bad salt, past expiry and out-of-range bits", async () => {
        const valid = { v: 1, salt: "abcd:", bits: 8, exp: FIXED_NOW + 60_000 };

        for (const payload of [
            { ...valid, v: 2 },
            { ...valid, salt: "no-trailing-colon" },
            { ...valid, salt: "x".repeat(200) },
            { ...valid, exp: FIXED_NOW - 1 },
            { ...valid, bits: POW_DIFFICULTY_MAX + 1 },
            { ...valid, salt: 123 },
        ]) {
            expect(
                await verifyPowToken(`${sign(payload)}.0`, {
                    env: ENV,
                    now: () => FIXED_NOW,
                    consume: async () => true,
                }),
            ).toBe(false);
        }
    });
});

describe("verifyPowToken — failure posture", () => {
    it("fails closed in production when no key material exists", async () => {
        expect(
            await verifyPowToken("anything", {
                env: { NODE_ENV: "production" } as unknown as NodeJS.ProcessEnv,
                consume: async () => true,
            }),
        ).toBe(false);
    });

    it("rehearses the production posture in dev with POW_REQUIRE=1", async () => {
        expect(
            await verifyPowToken("anything", {
                env: { NODE_ENV: "test", POW_REQUIRE: "1" } as unknown as NodeJS.ProcessEnv,
                consume: async () => true,
            }),
        ).toBe(false);
    });

    it("stays permissive outside production so a bare local checkout works", async () => {
        expect(
            await verifyPowToken(null, {
                env: { NODE_ENV: "test" } as unknown as NodeJS.ProcessEnv,
                consume: async () => true,
            }),
        ).toBe(true);
    });
});

