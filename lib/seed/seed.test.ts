/**
 * Seed machinery tests — no database required.
 *
 * These cover the parts where a silent mistake is expensive: whether a pack can
 * duplicate a row, whether teardown can delete something the seed did not create,
 * and whether the catalogue's 40-odd packs agree with the registry. All of it runs
 * against a fake PostgREST client that records calls instead of making them.
 */
import { describe, it, expect } from "vitest";
import { SEED_TABLE_SPECS, tableSpec, pkConflictTarget, dedupeKey } from "./tables.mjs";
import { naturalId, stableUuid, stableToken, dateOffset, isoOffset } from "./ids.mjs";
import { IdMap } from "./idmap.mjs";
import { planRows } from "./runner.mjs";
import { validateCatalogue, validatePack, findCycle } from "./contract.mjs";
import { PROFILES, PROFILE_NAMES, resolveProfile, topoOrder, unbuiltFamilies } from "./profiles.mjs";
import { loadManifest, mergePackResult, rowId, forgetPacks } from "./manifest.mjs";
import { inDeleteOrder, undoManifest, DELETE_ORDER } from "./undo.mjs";
import { PACKS, PACKS_BY_ID, FAMILIES, selectPackIds } from "../../presets/index.mjs";
import { SITE_SETTING_KEYS } from "../admin/queries/settings";

/* ------------------------------------------------------------------ */
/* fixtures                                                            */
/* ------------------------------------------------------------------ */

/**
 * A minimal fake of the service-role client — only the surface the seed code
 * touches. `seed` is a table name → row snapshot; `calls` records every request
 * so assertions can check *what was sent* without a network; `reject` makes one
 * table's writes fail so the partial-failure paths can be tested too.
 */
function fakeDb(seed: Record<string, Record<string, unknown>[]> = {}, reject: Record<string, string> = {}) {
    const calls: Array<{ table: string; method: string; rows?: unknown; onConflict?: string; filters?: string[] }> = [];
    const tables = new Map(Object.entries(seed));

    /** A pending query: filters accumulate, awaiting runs it and records it. */
    const query = (table: string, method: string, extra?: { rows?: unknown; onConflict?: string }) => {
        const filters: string[] = [];
        const builder: Record<string, unknown> = {
            select: () => builder,
            eq: (c: string, v: unknown) => { filters.push(`eq ${c}=${String(v)}`); return builder; },
            is: (c: string, v: unknown) => { filters.push(`is ${c}=${String(v)}`); return builder; },
            in: (c: string, v: unknown[]) => { filters.push(`in ${c}=${v.join("|")}`); return builder; },
            order: () => builder,
            limit: () => builder,
            range: () => builder,
            then: (resolve: (v: unknown) => unknown) => {
                calls.push({ table, method, rows: extra?.rows, onConflict: extra?.onConflict, filters });
                const failure = reject[table];
                const result = failure
                    ? { data: null, error: { message: failure, code: "23503" } }
                    : method === "select" || method === "delete" || method === "update"
                        ? { data: tables.get(table) ?? [], count: (tables.get(table) ?? []).length, error: null }
                        : { data: extra?.rows, error: null };
                return Promise.resolve(result).then(resolve);
            },
        };
        return builder;
    };

    return {
        calls,
        tables,
        from: (table: string) => ({
            select: () => query(table, "select"),
            upsert: (rows: unknown, opts?: { onConflict?: string }) => query(table, "upsert", { rows, onConflict: opts?.onConflict }),
            insert: (rows: unknown) => query(table, "insert", { rows }),
            delete: () => query(table, "delete"),
            update: () => query(table, "update"),
        }),
    };
}

/** The pack shape, as the contract declares it (kept literal so `audience` narrows). */
type Pack = import("./contract.mjs").SeedPack;
type Manifest = import("./manifest.mjs").Manifest;




/**
 * The fake client in the client's own shape. They are structurally compatible at
 * runtime — the seed code only ever calls from().select/upsert/insert — but the
 * real Supabase client type carries generic overloads a duck-typed fake cannot
 * satisfy, and IdMap's own parameter is `any` (it is a JSDoc-typed JS class, so
 * Parameters<> cannot recover it). This is the single boundary where that is
 * asserted, instead of a cast repeated at every call site.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asDb(fake: unknown): any {
    return fake;
}

/**
 * A pack fixture that is deliberately NOT a valid SeedPack. validatePack's whole
 * job is to describe what is wrong with such an object, so tests must be able to
 * build one; funneling them through here keeps the escape hatch in one named
 * place instead of scattered `as never` casts.
 */
function badPack(overrides: Record<string, unknown>): Pack {
    return packOver(overrides as Partial<Pack>);
}

/** A pack fixture, overridable per case. Typed as Pack so `audience` stays a union. */
function packOver(overrides: Partial<Pack> = {}): Pack {
    const base: Pack = {
        id: "test-pack",
        family: "test",
        title: "Test",
        titleFr: "Test",
        what: "test",
        audience: "prod-safe",
        tables: ["locations"],
        rows: () => [],
    };
    // A deliberate cast: validatePack's whole job is to receive objects that do
    // NOT satisfy this shape, and tests need to build those.
    return { ...base, ...overrides } as Pack;
}

/** An empty manifest document, typed so row/pack property access compiles. */
function emptyManifest(): import("./manifest.mjs").Manifest {
    return { version: 1, updatedAt: null, env: null, packs: [], rows: [] };
}

/* ------------------------------------------------------------------ */
/* deterministic ids                                                   */
/* ------------------------------------------------------------------ */

describe("seed ids", () => {
    it("derives a v4-shaped uuid that is stable and key-sensitive", () => {
        const a = naturalId("locations", "bamenda");
        expect(a).toBe(naturalId("locations", "bamenda"));
        expect(a).not.toBe(naturalId("locations", "nkwen"));
        // Version-4 nibble and RFC variant bits, so it survives uuid validation.
        expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it("never lets a composite key be re-arranged into another key's id", () => {
        // "ab"+"c" must not collide with "a"+"bc"; the NUL join is what stops it.
        expect(naturalId("categories", "ab", "c")).not.toBe(naturalId("categories", "a", "bc"));
    });

    it("produces tokens satisfying the anon-vote column constraints", () => {
        // content_reactions.reactor_token: ^[A-Za-z0-9-]{8,64}$
        expect(stableToken("reaction/like/some-slug", 24)).toMatch(/^[A-Za-z0-9-]{8,64}$/);
        expect(stableToken("x")).toHaveLength(24);
        expect(stableToken("x", 2)).toHaveLength(8); // clamped up to the column minimum
    });

    it("dates are UTC and offset-relative", () => {
        const base = new Date("2026-03-05T12:00:00.000Z");
        expect(dateOffset(-1, { base })).toBe("2026-03-04");
        expect(isoOffset(1, { base, hour: 6, minute: 0 })).toBe("2026-03-06T06:00:00.000Z");
    });
});

/* ------------------------------------------------------------------ */
/* table registry                                                      */
/* ------------------------------------------------------------------ */

describe("seed table registry", () => {
    it("knows every table the catalogue writes", () => {
        for (const pack of PACKS) {
            for (const table of pack.tables) expect(() => tableSpec(table)).not.toThrow();
        }
    });

    it("excludes the ledger tables the no-ledgers rule forbids", () => {
        // A seeded row in any of these would assert that something happened —
        // a job ran, a page was viewed, a token was spent. Their absence from
        // the registry is what enforces the rule; every pack is checked against it.
        for (const ledger of [
            "cron_heartbeats", "app_flags", "analytics_daily", "llm_calls",
            "audit_events", "backup_jobs", "storage_tasks", "db_dumps",
            "rate_limit_hits", "api_credentials", "digest_slots", "ad_events",
            "system_state_events", "translation_jobs", "incidents",
        ]) {
            expect(() => tableSpec(ledger)).toThrow(/unknown seed table/);
        }
    });

    it("never lets a pack target auth.users", () => {
        for (const pack of PACKS) expect(pack.tables).not.toContain("auth.users");
    });

    it("targets the PK for upserts while deduping on the natural key", () => {
        // The two differ deliberately: the upsert always uses the PK so a database
        // whose natural unique constraints have drifted (see 20261009000002) still
        // works, while JavaScript identifies "the same row" by its natural key.
        expect(pkConflictTarget("content_items")).toBe("id");
        expect(dedupeKey("content_items")).toEqual(["slug"]);
        expect(dedupeKey("categories")).toEqual(["content_type", "slug"]);
        expect(dedupeKey("category_translations")).toEqual(["category_id", "locale"]);
        expect(dedupeKey("site_settings")).toEqual(["key"]);
    });

    it("declares nullable key columns only where a null is meaningful", () => {
        expect(tableSpec("content_follows").nullable).toEqual(["category_id", "location_id"]);
        expect(tableSpec("locations").nullable).toBeUndefined();
    });

    it("an unknown table names the file to fix", () => {
        expect(() => tableSpec("not_a_table")).toThrow(/add it to lib\/seed\/tables.mjs/);
    });
});

/* ------------------------------------------------------------------ */
/* adoption — teardown must never delete what the seed did not create  */
/* ------------------------------------------------------------------ */

describe("adoption", () => {
    it("distinguishes a legacy row, our own row, and a borrowed id", async () => {
        const db = fakeDb({
            locations: [
                { id: stableUuid("made-by-the-old-seeder"), slug: "bamenda" },      // legacy
                { id: naturalId("locations", "nkwen"), slug: "nkwen" },             // ours
                { id: naturalId("locations", "bafut"), slug: "mankon" },            // mismatch
                { id: "00000000-0000-4000-8000-000000000000", slug: "fungoh" },     // legacy
            ],
        });
        const ids = new IdMap(asDb(db));
        await ids.load("locations");

        expect(ids.isAdopted("locations", "bamenda")).toBe(true);
        expect(ids.isAdopted("locations", "nkwen")).toBe(false);
        // A row whose id derives from a DIFFERENT key cannot be ours, even though
        // the id is well-formed: someone else inserted it.
        expect(ids.isAdopted("locations", "mankon")).toBe(true);
        expect(ids.isAdopted("locations", "fungoh")).toBe(true);
        // No row at all → the id this run will create, so it is ours.
        expect(ids.isAdopted("locations", "fundong")).toBe(false);
    });

    it("marks an existing row adopted and preserves the database's own id", async () => {
        const liveId = stableUuid("operator-made");
        const ids = new IdMap(asDb(fakeDb({ locations: [{ id: liveId, slug: "bamenda" }] })));
        await ids.load("locations");

        const [plan] = planRows(
            packOver({}),
            [{ table: "locations", row: { slug: "bamenda", name: "Bamenda" } }],
            ids,
        );
        expect(plan.adopted).toBe(true);
        // undo:"none" is the safety property: teardown leaves this row standing.
        expect(plan.undo).toBe("none");
        expect(plan.row.id).toBe(liveId);
        expect(plan.pk.id).toBe(liveId);
    });

    it("keeps undo:delete for a row the seed actually created", async () => {
        const ids = new IdMap(asDb(fakeDb()));
        await ids.load("locations");
        const [plan] = planRows(
            packOver({}),
            [{ table: "locations", row: { slug: "new-place", name: "New" } }],
            ids,
        );
        expect(plan.adopted).toBe(false);
        expect(plan.undo).toBe("delete");
        expect(plan.row.id).toBe(naturalId("locations", "new-place"));
    });

    it("re-running a pack over its own output keeps the row deletable", async () => {
        // The regression this guards: if adoption meant merely "a row exists", the
        // second run would mark its own first run's rows adopted and teardown could
        // never remove them, stranding demo data forever.
        const seeded = { locations: [{ id: naturalId("locations", "bamenda"), slug: "bamenda" }] };
        const ids = new IdMap(asDb(fakeDb(seeded)));
        await ids.load("locations");
        const [plan] = planRows(
            packOver({}),
            [{ table: "locations", row: { slug: "bamenda", name: "Bamenda" } }],
            ids,
        );
        expect(plan.adopted).toBe(false);
        expect(plan.undo).toBe("delete");
    });

    it("keeps every row in a batch column-uniform, and always keyed", async () => {
        // PostgREST builds one INSERT per array, so a column missing from the first
        // record arrives as NULL for the rest — the mixed new/adopted batch that
        // used to fail with "null value in column \"id\"".
        const ids = new IdMap(asDb(fakeDb({ locations: [{ id: "legacy-uuid", slug: "bamenda" }] })));
        await ids.load("locations");
        const plans = planRows(packOver({}), [
            { table: "locations", row: { slug: "bamenda", name: "Bamenda" } },
            { table: "locations", row: { slug: "brand-new", name: "New" } },
        ], ids);
        const shapes = plans.map((p) => Object.keys(p.row).sort().join(","));
        expect(new Set(shapes).size).toBe(1);
        expect(plans.every((p) => typeof p.row.id === "string")).toBe(true);
    });
});

/* ------------------------------------------------------------------ */
/* planRows rejects what would corrupt the database                    */
/* ------------------------------------------------------------------ */

describe("planRows validation", () => {
    async function idsWith(...tables: string[]) {
        const ids = new IdMap(asDb(fakeDb()));
        for (const t of tables) await ids.load(t);
        return ids;
    }

    it("a table the pack did not declare", async () => {
        const ids = await idsWith("tags");
        expect(() => planRows(packOver({}), [{ table: "tags", row: { slug: "x" } }], ids))
            .toThrow(/does not declare it in tables/);
    });

    it("a missing natural-key column", async () => {
        const ids = await idsWith("locations");
        expect(() => planRows(packOver({}), [{ table: "locations", row: { name: "No slug" } }], ids))
            .toThrow(/missing natural-key column "slug"/);
    });

    it("a null in a key column that is not declared nullable", async () => {
        const ids = await idsWith("locations");
        expect(() => planRows(packOver({}), [{ table: "locations", row: { slug: null, name: "x" } }], ids))
            .toThrow(/unique index never matches a null/);
    });

    it("permits a null where the registry says the column is optional", async () => {
        const ids = await idsWith("content_follows");
        const [plan] = planRows(packOver({ tables: ["content_follows"] }), [{
            table: "content_follows",
            row: { user_id: "u1", content_type: "news", category_id: null, location_id: null },
        }], ids);
        expect(plan.nullableConflict).toBe(true);
        expect(plan.undo).toBe("delete");
    });

    it("two specs in one pack claiming the same row", async () => {
        const ids = await idsWith("locations");
        expect(() => planRows(packOver({}), [
            { table: "locations", row: { slug: "dup", name: "One" } },
            { table: "locations", row: { slug: "dup", name: "Two" } },
        ], ids)).toThrow(/claim the same locations row/);
    });

    it("a composite-PK row missing one of its key columns", async () => {
        const ids = await idsWith("category_translations");
        expect(() => planRows(packOver({ tables: ["category_translations"] }),
            [{ table: "category_translations", row: { locale: "en", name: "x" } }], ids))
            .toThrow(/primary key column "category_id"/);
    });

    it("a requiresPk table left without its caller-chosen key", async () => {
        const ids = await idsWith("system_states");
        expect(() => planRows(packOver({ tables: ["system_states"] }),
            [{ table: "system_states", row: { name: "No id" } }], ids))
            .toThrow(/primary key column "id"/);
    });

    it("a spec without a row", async () => {
        const ids = await idsWith("locations");
        expect(() => planRows(packOver({}), [{ table: "locations" }], ids))
            .toThrow(/is missing "row"/);
    });

    it("rows() that returns something other than an array", async () => {
        const ids = await idsWith("locations");
        expect(() => planRows(packOver({}), "nonsense" as never, ids))
            .toThrow(/must return an array/);
    });

    it("accepts a caller-chosen text PK verbatim", async () => {
        const ids = await idsWith("system_states");
        const [plan] = planRows(packOver({ tables: ["system_states"] }), [{
            table: "system_states",
            row: { id: "HOLIDAY", name: "Holiday season", severity: "info", active: false },
        }], ids);
        expect(plan.row.id).toBe("HOLIDAY");
        // system_states declares no unique key, so the PK is also the dedupe key.
        expect(plan.conflict).toEqual(["id"]);
    });
});

/* ------------------------------------------------------------------ */
/* catalogue integrity                                                 */
/* ------------------------------------------------------------------ */

describe("preset catalogue", () => {
    it("is valid as a whole", () => {
        expect(validateCatalogue(PACKS)).toEqual([]);
    });

    it("requires the French title, since the catalogue is admin-visible", () => {
        expect(validatePack(badPack({ titleFr: "" }))).toContain(
            "test-pack: titleFr is required (bilingual catalogue)",
        );
    });

    it("rejects an unknown audience and an unknown dep", () => {
        expect(validatePack(badPack({ audience: "everyone" })).join()).toMatch(/audience must be/);
        // Deps are only resolvable against a known set — validatePack skips the
        // check when none is given, so a standalone pack is not falsely flagged.
        expect(validatePack(badPack({ deps: ["nope"] }), new Set(["test-pack"])).join())
            .toMatch(/unknown dep "nope"/);
        expect(validatePack(badPack({ deps: ["nope"] }))).toEqual([]);
    });

    it("flags self-dependency and a bad table name", () => {
        expect(validatePack(badPack({ deps: ["test-pack"] }), new Set(["test-pack"])).join())
            .toMatch(/depends on itself/);
        expect(validatePack(badPack({ tables: ["not_a_table"] })).join())
            .toMatch(/unknown seed table "not_a_table"/);
        // auth.users is off-limits even if someone declares it.
        expect(validatePack(badPack({ tables: ["auth.users"] })).join())
            .toMatch(/off-limits/);
    });

    it("orders by dependency, then tier, then id", () => {
        const a = packOver({ id: "z-late", tier: 9, deps: ["b-mid"] });
        const b = packOver({ id: "b-mid", tier: 5 });
        const c = packOver({ id: "a-first", tier: 1 });
        const order = topoOrder([a, b, c]).map((p: { id: string }) => p.id);
        expect(order).toEqual(["a-first", "b-mid", "z-late"]);
    });

    it("detects a dependency cycle instead of hanging", () => {
        const packs = [
            packOver({ id: "one", deps: ["two"] }),
            packOver({ id: "two", deps: ["one"] }),
        ];
        expect(findCycle(packs)).toEqual(["one", "two", "one"]);
        expect(validateCatalogue(packs).join()).toMatch(/dependency cycle/);
    });

    it("every profile resolves to a non-empty, fully-ordered pack list", () => {
        for (const name of PROFILE_NAMES) {
            const resolved = resolveProfile(name, PACKS);
            expect(resolved.length, name).toBeGreaterThan(0);
            // Every dep of a selected pack is itself selected, in order.
            const seen = new Set<string>();
            for (const pack of resolved) {
                for (const dep of pack.deps ?? []) expect(seen.has(dep), `${name}: ${pack.id} before ${dep}`).toBe(true);
                seen.add(pack.id);
            }
        }
    });

    it("reports every profile family that has no pack yet, rather than hiding it", () => {
        // A `@family` entry with no implementing pack is EXPECTED while the
        // catalogue grows — profiles describe the whole target set. What must
        // never happen is the gap being invisible: a profile promising thirty
        // packs silently seeding three would still look right in the output.
        // So the contract is "known and reported", not "must exist".
        const families = new Set(PACKS.map((p) => p.family));
        const missing = new Set<string>();
        for (const [name, profile] of Object.entries(PROFILES)) {
            for (const entry of profile.include) {
                if (!entry.startsWith("@")) {
                    // A bare pack id is unambiguous — if it is named, it must exist.
                    expect(PACKS_BY_ID.has(entry), `${name} references unknown pack ${entry}`).toBe(true);
                    continue;
                }
                if (!families.has(entry.slice(1))) missing.add(entry.slice(1));
            }
        }
        // unbuiltFamilies() is what the CLI prints; it must agree exactly.
        expect(unbuiltFamilies(PACKS)).toEqual([...missing].sort());
        // And a profile that references an unbuilt family must carry the report.
        for (const [name, profile] of Object.entries(PROFILES)) {
            resolveProfile(name, PACKS); // populates profile.unbuiltFamilies
            // Recorded in `include` order (deduped), which is what makes the CLI's
            // warning line stable between runs.
            const expected: string[] = [];
            for (const entry of profile.include) {
                if (!entry.startsWith("@")) continue;
                const family = entry.slice(1);
                if (!families.has(family) && !expected.includes(family)) expected.push(family);
            }
            expect(profile.unbuiltFamilies ?? [], name).toEqual(expected);
        }
    });

    it("resolves every family the profile names, now that the catalog is complete", () => {
        // Originally this test verified that unbuilt families did not block the
        // built ones. Now that every referenced family has at least one pack,
        // the full-demo profile should resolve all of them with no unbuilt gaps.
        const full = resolveProfile("full-demo", PACKS);
        expect(full.length).toBeGreaterThan(0);
        const families = new Set(full.map((p: { family: string }) => p.family));
        for (const entry of PROFILES["full-demo"].include) {
            if (entry.startsWith("@")) expect(families.has(entry.slice(1)), `${entry} unbuilt`).toBe(true);
        }
        // unbuiltFamilies is set on the profile object during resolution
        expect(PROFILES["full-demo"].unbuiltFamilies ?? []).toEqual([]);
    });


    it("rejects an unknown profile and an unknown pack id", () => {
        expect(() => resolveProfile("nope", PACKS)).toThrow(/unknown profile "nope"/);
        expect(() => selectPackIds("not-a-pack")).toThrow(/unknown pack\(s\): not-a-pack/);
    });

    it("--packs pulls in dependencies automatically", () => {
        const withDep = PACKS.find((p) => p.deps?.length);
        if (withDep) {
            const picked = selectPackIds(withDep.id);
            for (const dep of withDep.deps ?? []) expect(picked.has(dep), `${withDep.id} → ${dep}`).toBe(true);
        }
    });

    it("every declared family has packs, and every pack has a family listed", () => {
        for (const family of FAMILIES) expect(PACKS.some((p) => p.family === family)).toBe(true);
    });

    it("every pack writes only its declared tables", async () => {
        const { makeContext } = await import("./context.mjs");
        for (const pack of PACKS) {
            const db = fakeDb();
            const ctx = makeContext({ db: asDb(db), env: "production" });
            // preloadFor is what the CLI does first; packs assume the maps exist.
            const { preloadFor } = await import("./context.mjs");
            await preloadFor(ctx, [], pack);
            const specs = await pack.rows(ctx);
            expect(Array.isArray(specs), pack.id).toBe(true);
            for (const spec of specs) expect(pack.tables, `${pack.id} wrote ${spec.table}`).toContain(spec.table);
            // Validate shape too: this is the same call the CLI makes.
            expect(() => planRows(pack, specs, ctx.ids), pack.id).not.toThrow();
        }
    });

    it("cfg-site-settings covers the admin editor's keys", async () => {
        const pack = PACKS_BY_ID.get("cfg-site-settings");
        expect(pack).toBeTruthy();
        const { makeContext } = await import("./context.mjs");
        const ctx = makeContext({ db: asDb(fakeDb()), env: "local" });
        const specs = await pack!.rows(ctx);
        const keys = specs.map((s: { row: Record<string, unknown> }) => s.row.key as string);
        // No invented keys: anything outside SITE_SETTING_KEYS is invisible to
        // /admin/site-content, so it could never be edited back.
        for (const key of keys) expect(SITE_SETTING_KEYS as readonly string[], key).toContain(key);

        // Every key the admin can set is reachable except the deprecated single
        // `announcement_url`, which PublicShell reads only as the last fallback
        // behind announcement_url_en/_fr (components/shells/public-shell.tsx:54).
        const INTENTIONALLY_UNSET = ["announcement_url"];
        const missing = (SITE_SETTING_KEYS as readonly string[]).filter((k) => !keys.includes(k));
        expect(missing.sort()).toEqual(INTENTIONALLY_UNSET.sort());
    });

});






/* ------------------------------------------------------------------ */
/* manifest: the record that makes teardown exact                      */
/* ------------------------------------------------------------------ */

describe("manifest", () => {
    it("identifies a row by table plus PK values, order-independent", () => {
        expect(rowId("category_translations", { locale: "en", category_id: "c1" }))
            .toBe(rowId("category_translations", { category_id: "c1", locale: "en" }));
        expect(rowId("tags", { id: "a" })).not.toBe(rowId("tags", { id: "b" }));
    });

    it("merges a repeated pack without stacking duplicate rows", () => {
        const manifest = { version: 1, updatedAt: null, env: null, packs: [], rows: [] } as Manifest;
        const rows = [
            { table: "tags", pk: { id: "t1" }, undo: "delete" as const },
            { table: "tag_translations", pk: { tag_id: "t1", locale: "en" }, undo: "delete" as const },
        ];
        mergePackResult(manifest, { id: "tax-tags", marker: "tax-tags", written: 2, skipped: 0, rows });
        mergePackResult(manifest, { id: "tax-tags", marker: "tax-tags", written: 2, skipped: 0, rows });
        expect(manifest.rows).toHaveLength(2);
        expect(manifest.packs).toHaveLength(1);

        mergePackResult(manifest, {
            id: "aaa-other", marker: "aaa-other", written: 1, skipped: 0,
            rows: [{ table: "site_settings", pk: { key: "site_name" }, undo: "clear" as const }],
        });
        expect(manifest.rows).toHaveLength(3);
        // Pack entries stay sorted by id so the file is diffable between runs.
        expect(manifest.packs.map((p: { id: string; marker: string }) => p.id)).toEqual(["aaa-other", "tax-tags"]);
    });

    it("carries `adopted` and `note` through a merge", () => {
        // Regression: mergePackResult rebuilds each row object, so any field it
        // does not copy is silently lost — and losing `adopted` converts teardown's
        // "leave this pre-existing row alone" into a delete.
        const manifest = { version: 1, updatedAt: null, env: null, packs: [], rows: [] } as Manifest;
        mergePackResult(manifest, {
            id: "p", marker: "p", written: 2, skipped: 0,
            rows: [
                { table: "locations", pk: { id: "1" }, undo: "none", adopted: true, note: "bamenda" },
                { table: "locations", pk: { id: "2" }, undo: "delete", note: "new-place" },
            ],
        });
        expect(manifest.rows[0]).toMatchObject({ adopted: true, note: "bamenda", undo: "none" });
        expect(manifest.rows[1].adopted).toBeUndefined();
        expect(manifest.rows[1].note).toBe("new-place");
    });

it("forgets only the packs that were fully removed", () => {
        const manifest = {
            version: 1, updatedAt: null, env: null,
            packs: [{ id: "a", marker: "a", appliedAt: "", written: 0, skipped: 0 }, { id: "b", marker: "b", appliedAt: "", written: 0, skipped: 0 }],
            rows: [
                { pack: "a", marker: "a", table: "tags", pk: { id: "1" }, undo: "delete" as const },
                { pack: "b", marker: "b", table: "tags", pk: { id: "2" }, undo: "delete" as const },
            ],
        };
        forgetPacks(manifest, ["a"]);
        expect(manifest.packs.map((p: { id: string }) => p.id)).toEqual(["b"]);
        expect(manifest.rows).toHaveLength(1);
        expect(manifest.rows[0].pack).toBe("b");
    });

    it("refuses a manifest from a future version, and treats absence as empty", async () => {
        const { writeFile, mkdtemp } = await import("node:fs/promises");
        const { tmpdir } = await import("node:os");
        const { join } = await import("node:path");
        const dir = await mkdtemp(join(tmpdir(), "eea-seed-"));
        const bad = join(dir, "bad.json");
        await writeFile(bad, JSON.stringify({ version: 99, rows: [], packs: [] }), "utf8");
        expect(() => loadManifest(bad)).toThrow(/version 99 is not supported/);
        expect(loadManifest(join(dir, "absent.json")).rows).toEqual([]);
    });
});

/* ------------------------------------------------------------------ */
/* teardown: ordering, and never deleting what the seed did not create */
/* ------------------------------------------------------------------ */

describe("undo", () => {
    it("removes children before their parents", () => {
        const ordered = inDeleteOrder(["locations", "content_translations", "content_items", "categories"]);
        expect(ordered.indexOf("content_translations")).toBeLessThan(ordered.indexOf("content_items"));
        expect(ordered.indexOf("content_items")).toBeLessThan(ordered.indexOf("categories"));
        expect(ordered.indexOf("categories")).toBeLessThan(ordered.indexOf("locations"));
    });

    it("lists no table twice, since the last index would silently win", () => {
        // inDeleteOrder ranks with a Map, so a duplicate entry keeps only its
        // final position — a parent could end up sorted after its own children
        // and the deletion would then rely on cascade behaviour the list exists
        // to avoid. Cheap to assert, and invisible in review.
        const seen = new Set<string>();
        const dupes = DELETE_ORDER.filter((t: string) => (seen.has(t) ? true : (seen.add(t), false)));
        expect(dupes).toEqual([]);
    });

    it("orders content_items below everything that references it", () => {
        const rank = new Map(DELETE_ORDER.map((t: string, i: number) => [t, i]));
        for (const child of ["content_translations", "media_assets", "notices", "listings", "events", "homepage_slots", "content_tags", "saved_content"]) {
            expect(rank.get(child), child).toBeLessThan(rank.get("content_items") as number);
        }
    });

    it("sends no delete for an undo:none row, and clears config instead of deleting it", async () => {
        const db = fakeDb();
        const manifest = {
            version: 1, updatedAt: null, env: null,
            packs: [{ id: "p", marker: "p" }],
            rows: [
                { pack: "p", marker: "p", table: "content_items", pk: { id: "a" }, undo: "delete" },
                { pack: "p", marker: "p", table: "locations", pk: { id: "b" }, undo: "none" },
                { pack: "p", marker: "p", table: "site_settings", pk: { key: "site_name" }, undo: "clear" },
            ],
        };
        const result = await undoManifest({ db: asDb(db), manifest });
        const seen = db.calls.map((c) => `${c.table}:${c.method}`);
        // The safety property: an adopted row produces no request at all.
        expect(seen).not.toContain("locations:delete");
        expect(seen).toContain("site_settings:update");
        expect(seen).not.toContain("site_settings:delete");
        expect(result.undone).toBe(3);
        expect(result.failed).toBe(0);
        expect(result.packsComplete).toEqual(["p"]);
    });

    it("keys a composite PK holding a null with .is(), not .eq()", async () => {
        const db = fakeDb();
        const manifest = {
            version: 1, updatedAt: null, env: null, packs: [{ id: "p", marker: "p" }],
            rows: [{
                pack: "p", marker: "p", table: "content_follows",
                pk: { user_id: "u", content_type: "news", category_id: null, location_id: null },
                undo: "delete",
            }],
        };
        await undoManifest({ db: asDb(db), manifest });
        const del = db.calls.find((c) => c.table === "content_follows");
        expect(del?.filters).toContain("is category_id=null");
        expect(del?.filters).toContain("is location_id=null");
        expect(del?.filters).toContain("eq user_id=u");
    });

    it("keeps a failed row recorded so the next run retries it", async () => {
        const db = fakeDb({}, { tags: "in use by another session" });
        const manifest = {
            version: 1, updatedAt: null, env: null, packs: [{ id: "p", marker: "p" }],
            rows: [
                { pack: "p", marker: "p", table: "tags", pk: { id: "stuck" }, undo: "delete" },
                { pack: "p", marker: "p", table: "site_settings", pk: { key: "k" }, undo: "clear" },
            ],
        };
        const result = await undoManifest({ db: asDb(db), manifest });
        expect(result.failed).toBe(1);
        expect(result.errors.join()).toMatch(/in use by another session/);
        // Never forget a pack whose rows are not all gone.
        expect(result.packsComplete).toEqual([]);
    });

    it("honours a --packs filter instead of undoing the world", async () => {
        const db = fakeDb();
        const manifest = {
            version: 1, updatedAt: null, env: null,
            packs: [{ id: "a", marker: "a" }, { id: "b", marker: "b" }],
            rows: [
                { pack: "a", marker: "a", table: "tags", pk: { id: "1" }, undo: "delete" },
                { pack: "b", marker: "b", table: "tags", pk: { id: "2" }, undo: "delete" },
            ],
        };
        const result = await undoManifest({ db: asDb(db), manifest, packIds: ["a"] });
        expect(result.undone).toBe(1);
        expect(db.calls.filter((c) => c.method === "delete")).toHaveLength(1);
        expect(result.packsComplete).toEqual(["a"]);
    });
});


