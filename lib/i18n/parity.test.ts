import { describe, expect, it } from "vitest";

import { locales } from "./config";
import { en } from "./en";
import { fr } from "./fr";
import { buildAlternates } from "./urls";
import sitemap from "@/app/sitemap";

/**
 * Phase 5.3 — automated EN/FR edge-case matrix (audit Phase 5.3).
 *
 * `fr: typeof en` already enforces KEY parity at compile time; this suite adds
 * the cases that typing cannot catch and the cross-locale invariants the
 * roadmap's "two-locale sign-off" needs:
 *   1. key parity at every depth (belt-and-braces against `any`/spread escapes);
 *   2. no empty or whitespace-only strings in EITHER locale (untranslated stubs);
 *   3. array-valued keys keep the same length across locales (ordered lists);
 *   4. the sitemap emits EVERY path for BOTH locales, each entry carrying the
 *      full hreflang set (en, fr, x-default = en);
 *   5. buildAlternates returns a canonical + both-locale hreflang set for
 *      every locale.
 */

function assertSameShape(
    a: unknown,
    b: unknown,
    path: string,
    arrayLengths: Map<string, [number, number]>,
): void {
    if (Array.isArray(a) || Array.isArray(b)) {
        const lenEn = Array.isArray(a) ? a.length : -1;
        const lenFr = Array.isArray(b) ? b.length : -1;
        arrayLengths.set(path, [lenEn, lenFr]);
        if (lenEn !== lenFr) {
            throw new Error(`Array length mismatch at "${path}": en=${lenEn}, fr=${lenFr}`);
        }
        return;
    }
    const aObj = a !== null && typeof a === "object";
    const bObj = b !== null && typeof b === "object";
    if (!aObj || !bObj) return; // leaf value — nothing deeper to compare

    const keysEn = Object.keys(a as object).sort();
    const keysFr = Object.keys(b as object).sort();
    const onlyEn = keysEn.filter((k) => !keysFr.includes(k));
    const onlyFr = keysFr.filter((k) => !keysEn.includes(k));
    if (onlyEn.length > 0 || onlyFr.length > 0) {
        throw new Error(
            `Dictionary key mismatch at "${path || "<root>"}" — ` +
                `en-only: [${onlyEn.join(", ") || "none"}], fr-only: [${onlyFr.join(", ") || "none"}]`,
        );
    }
    for (const k of keysEn) {
        assertSameShape(
            (a as Record<string, unknown>)[k],
            (b as Record<string, unknown>)[k],
            path ? `${path}.${k}` : k,
            arrayLengths,
        );
    }
}

function emptyStringPaths(value: unknown, path = ""): string[] {
    if (typeof value === "string") {
        return value.trim().length === 0 ? [path || "<root>"] : [];
    }
    if (Array.isArray(value)) {
        return value.flatMap((v, i) => emptyStringPaths(v, `${path}[${i}]`));
    }
    if (value !== null && typeof value === "object") {
        return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
            emptyStringPaths(v, path ? `${path}.${k}` : k),
        );
    }
    return [];
}

describe("Phase 5.3 — EN/FR locale matrix", () => {
    it("fr mirrors every en dictionary key (no missing/extra keys at any depth)", () => {
        expect(() => assertSameShape(en, fr, "", new Map())).not.toThrow();
    });

    it("has no empty or whitespace-only strings in either locale", () => {
        expect(emptyStringPaths(en)).toEqual([]);
        expect(emptyStringPaths(fr)).toEqual([]);
    });

    it("keeps array-valued keys the same length across locales", () => {
        const lengths = new Map<string, [number, number]>();
        assertSameShape(en, fr, "", lengths);
        for (const [path, [lenEn, lenFr]] of lengths) {
            expect([path, lenFr]).toEqual([path, lenEn]);
        }
    });

    it("emits every sitemap path for BOTH locales with full hreflang alternates", async () => {
        const entries = await sitemap();
        expect(entries.length).toBeGreaterThan(0);

        const localesByPath = new Map<string, Set<string>>();
        for (const entry of entries) {
            const { pathname } = new URL(entry.url);
            const segments = pathname.split("/").filter(Boolean);
            const [first] = segments;
            expect(locales as readonly string[]).toContain(first);

            const path = segments.length <= 1 ? "/" : `/${segments.slice(1).join("/")}`;
            if (!localesByPath.has(path)) localesByPath.set(path, new Set());
            localesByPath.get(path)!.add(first);

            const languages = entry.alternates?.languages ?? {};
            expect(Object.keys(languages).sort()).toEqual(["en", "fr", "x-default"]);
            expect(languages["x-default"]).toBe(languages.en);
        }

        for (const [path, set] of localesByPath) {
            expect(new Set([...set]).size, `path ${path} must exist in both locales`).toBe(
                locales.length,
            );
        }
    });

    it("buildAlternates produces a canonical + both-locale hreflang set for every locale", () => {
        for (const path of ["/", "/news", "/buy-sell", "/about/privacy"]) {
            for (const locale of locales) {
                const alternates = buildAlternates(locale, path);
                const self = locale === "fr" ? `/fr${path === "/" ? "" : path}` : `/en${path === "/" ? "" : path}`;
                if (path === "/" && locale === "en") expect(self).toBe("/en");
                expect(alternates.canonical).toBe(self);
                expect(alternates.languages[locale]).toBe(self);
                expect(alternates.languages["x-default"]).toBe(alternates.languages.en);
                expect(alternates.languages.en).not.toBe(alternates.languages.fr);
            }
        }
    });
});
