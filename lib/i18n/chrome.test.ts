import { describe, expect, it } from "vitest";

import { chromeEn } from "./chrome-en";
import { chromeFr } from "./chrome-fr";
import { getChromeStrings } from "./chrome";
import { appStringsEn } from "./en-app";
import { appStringsFr } from "./fr-app";

/**
 * A2 — chrome string contracts.
 *
 * `chrome-en.ts` / `chrome-fr.ts` are the single source of truth for the
 * every-page anonymous chrome AND the slices spread back into the full
 * Dictionary, so they must mirror each other exactly (keys; values differ
 * by locale) and stay self-contained (no `*-app` imports — enforced
 * statically by scripts/verify-client-dictionary.mjs).
 */
function assertSameKeys(a: unknown, b: unknown, path: string): void {
    const aObj = a !== null && typeof a === "object";
    const bObj = b !== null && typeof b === "object";
    if (!aObj || !bObj) return;
    const keysA = Object.keys(a as object).sort();
    const keysB = Object.keys(b as object).sort();
    expect(keysB, `chrome key mismatch at "${path || "<root>"}"`).toEqual(keysA);
    for (const k of keysA) {
        assertSameKeys(
            (a as Record<string, unknown>)[k],
            (b as Record<string, unknown>)[k],
            path ? `${path}.${k}` : k,
        );
    }
}

function emptyStringPaths(value: unknown, path = ""): string[] {
    if (typeof value === "string") return value.trim().length === 0 ? [path || "<root>"] : [];
    if (value !== null && typeof value === "object") {
        return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
            emptyStringPaths(v, path ? `${path}.${k}` : k),
        );
    }
    return [];
}

describe("A2 — chrome strings", () => {
    it("mirrors every chrome key between en and fr", () => {
        assertSameKeys(chromeEn, chromeFr, "");
    });

    it("has no empty strings in either chrome locale", () => {
        expect(emptyStringPaths(chromeEn)).toEqual([]);
        expect(emptyStringPaths(chromeFr)).toEqual([]);
    });

    it("serves the matching locale from getChromeStrings", () => {
        expect(getChromeStrings("en")).toBe(chromeEn);
        expect(getChromeStrings("fr")).toBe(chromeFr);
        expect(getChromeStrings("fr").nav.home).toBe("Accueil");
    });

    it("covers every string the every-page chrome renders", () => {
        // If a chrome component needs a new string, it must be added here
        // (and in both locales) rather than reaching for getDictionary.
        for (const section of ["nav", "header", "theme", "language", "command", "footer", "notFound"] as const) {
            expect(chromeEn[section], `missing chrome section ${section}`).toBeDefined();
        }
    });

    it("keeps the chrome notFound copy in sync with system.notFound", () => {
        expect(chromeEn.notFound).toEqual(appStringsEn.system.notFound);
        expect(chromeFr.notFound).toEqual(appStringsFr.system.notFound);
    });
});
