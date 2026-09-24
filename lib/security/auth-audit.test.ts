import { beforeEach, describe, expect, it, vi } from "vitest";

type InsertRow = Record<string, unknown>;

const insertedRows: InsertRow[] = [];
const insert = vi.fn(async (row: InsertRow) => {
    insertedRows.push(row);
    return { error: null };
});
const from = vi.fn(() => ({ insert }));

vi.mock("next/headers", () => ({
    headers: async () => new Headers({ "x-real-ip": "203.0.113.7" }),
}));
vi.mock("@/lib/supabase/admin", () => ({
    createAdminClient: () => ({ from }),
}));

/** Fresh module registry per case — the hash key is cached at module scope. */
async function loadModule() {
    vi.resetModules();
    return await import("./auth-audit");
}

const DB_ENV = {
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

beforeEach(() => {
    insert.mockClear();
    from.mockClear();
    insertedRows.length = 0;
    for (const key of [
        "NEXT_PUBLIC_SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
        "AUTH_AUDIT_HASH_KEY",
        "CREDENTIAL_ENCRYPTION_KEY",
    ]) {
        delete process.env[key];
    }
});

describe("identifierHash", () => {
    it("omits the identifier when no key is available", async () => {
        const { identifierHash } = await loadModule();
        expect(identifierHash("person@example.com")).toBeNull();
    });

    it("reduces an email to a short, stable, non-reversible digest", async () => {
        process.env.AUTH_AUDIT_HASH_KEY = "unit-test-key";
        const { identifierHash } = await loadModule();
        const digest = identifierHash("person@example.com");
        expect(digest).toMatch(/^[0-9a-f]{16}$/);
        expect(digest).not.toContain("person");
        expect(identifierHash("person@example.com")).toBe(digest);
    });

    it("is case- and whitespace-insensitive so attempts on one account correlate", async () => {
        process.env.AUTH_AUDIT_HASH_KEY = "unit-test-key";
        const { identifierHash } = await loadModule();
        expect(identifierHash("  Person@Example.COM  ")).toBe(identifierHash("person@example.com"));
        expect(identifierHash("other@example.com")).not.toBe(identifierHash("person@example.com"));
    });

    it("changes with the key, so digests are not portable across deployments", async () => {
        process.env.AUTH_AUDIT_HASH_KEY = "first-key";
        const first = (await loadModule()).identifierHash("person@example.com");
        process.env.AUTH_AUDIT_HASH_KEY = "second-key";
        const second = (await loadModule()).identifierHash("person@example.com");
        expect(first).not.toBe(second);
    });
});

describe("recordAuthEvent", () => {
    it("no-ops when the service-role key is not configured", async () => {
        const { hasAuthAuditStorage, recordAuthEvent } = await loadModule();
        expect(hasAuthAuditStorage()).toBe(false);
        await expect(
            recordAuthEvent({ action: "auth.login.failed", identifier: "person@example.com" }),
        ).resolves.toBeUndefined();
        expect(insert).not.toHaveBeenCalled();
    });

    it("writes a source-tagged row carrying the hash, never the raw email", async () => {
        Object.assign(process.env, DB_ENV, { AUTH_AUDIT_HASH_KEY: "unit-test-key" });
        const { recordAuthEvent } = await loadModule();
        await recordAuthEvent({
            action: "auth.login.succeeded",
            actorId: "11111111-1111-1111-1111-111111111111",
            identifier: "person@example.com",
            detail: { mfa: "challenge_pending" },
        });
        expect(from).toHaveBeenCalledWith("audit_events");
        const row = insertedRows[0] as InsertRow;
        expect(row.action).toBe("auth.login.succeeded");
        expect(row.source).toBe("auth");
        expect(row.resource_type).toBe("auth");
        expect(row.actor_id).toBe("11111111-1111-1111-1111-111111111111");
        const metadata = row.metadata as Record<string, unknown>;
        expect(metadata.mfa).toBe("challenge_pending");
        expect(metadata.ip).toBe("203.0.113.7");
        expect(JSON.stringify(row)).not.toContain("person@example.com");
    });

    it("swallows a failing insert so the auth flow is never broken by the trail", async () => {
        Object.assign(process.env, DB_ENV);
        insert.mockRejectedValueOnce(new Error("database is down"));
        const { recordAuthEvent } = await loadModule();
        await expect(recordAuthEvent({ action: "auth.logout" })).resolves.toBeUndefined();
    });
});
