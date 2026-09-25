import { describe, expect, it } from "vitest";

import {
  clearDraft,
  draftKey,
  isDraftWorthRestoring,
  readDraft,
  writeDraft,
  type StoredDraft,
} from "./draft-autosave";

/** In-memory Storage so the tests do not depend on a browser environment. */
function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  } as unknown as Storage;
}

describe("draft-autosave", () => {
  it("keys create-mode separately from a stored item", () => {
    expect(draftKey(null)).toBe("eea:content-draft:new");
    expect(draftKey("abc")).toBe("eea:content-draft:abc");
    expect(draftKey(null)).not.toBe(draftKey("abc"));
  });

  it("round-trips values through storage", () => {
    const s = fakeStorage();
    const key = draftKey("abc");
    expect(writeDraft(key, { enTitle: "Hello" }, s)).toBe(true);
    const read = readDraft<{ enTitle: string }>(key, s);
    expect(read?.values.enTitle).toBe("Hello");
    expect(typeof read?.savedAt).toBe("number");
  });

  it("returns null for a missing key", () => {
    expect(readDraft(draftKey("nope"), fakeStorage())).toBeNull();
  });

  it("treats corrupt storage as absent instead of throwing", () => {
    const s = fakeStorage();
    s.setItem(draftKey("abc"), "{not json");
    expect(readDraft(draftKey("abc"), s)).toBeNull();
  });

  it("survives a storage that refuses writes (private mode / quota)", () => {
    const full = fakeStorage();
    full.setItem = () => {
      throw new Error("QuotaExceeded");
    };
    expect(writeDraft(draftKey("abc"), { a: 1 }, full)).toBe(false);
  });

  it("clears a draft", () => {
    const s = fakeStorage();
    const key = draftKey("abc");
    writeDraft(key, { a: 1 }, s);
    clearDraft(key, s);
    expect(readDraft(key, s)).toBeNull();
  });

  describe("isDraftWorthRestoring", () => {
    const now = 1_700_000_000_000;
    const fresh: StoredDraft<number> = { savedAt: now - 60_000, values: 1 };

    it("offers a recent draft", () => {
      expect(isDraftWorthRestoring(fresh, 0, undefined, now)).toBe(true);
    });

    it("drops a draft older than the saved row it belongs to", () => {
      // Without this, saving a post would keep offering the pre-save draft.
      expect(isDraftWorthRestoring(fresh, now, undefined, now)).toBe(false);
    });

    it("drops an abandoned draft past the age window", () => {
      const stale: StoredDraft<number> = { savedAt: now - 1000 * 60 * 60 * 24 * 30, values: 1 };
      expect(isDraftWorthRestoring(stale, 0, undefined, now)).toBe(false);
    });

    it("is false for no draft", () => {
      expect(isDraftWorthRestoring(null, 0, undefined, now)).toBe(false);
    });
  });
});
