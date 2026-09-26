import { describe, expect, it } from "vitest";

import {
  compressRecordId,
  entityContextFor,
  staticSubRoutesOf,
} from "./entity-context";

/**
 * Breadcrumb entity resolution (plan Phase 4).
 *
 * The topbar lives in a layout, which cannot read the pathname, so this is the
 * one place the "which record am I on" question is answered — and it is answered
 * from a string, in the client. Two failure directions matter: reading a static
 * sub-route as a record id (the crumb links somewhere that is not a list of
 * records), and missing a real id (the trail silently loses its last level,
 * which is the bug this phase exists to fix).
 */

describe("entityContextFor", () => {
  it("names the record on a detail route", () => {
    expect(entityContextFor("/admin/users/9f3c1a2b-0000", "/admin/users")).toEqual({
      sectionPath: "/admin/users",
      recordId: "9f3c1a2b-0000",
      // 13 characters: exactly the compression threshold, so it is left whole.
      label: "9f3c1a2b-0000",
    })
    expect(entityContextFor("/admin/users/9f3c1a2b-7d4e-4f60", "/admin/users")?.label).toBe(
      "9f3c1a2b…4f60",
    )
  })

  it("strips the locale prefix before matching, because usePathname keeps it", () => {
    // The whole feature fails without this: nav entries are canonical
    // (`/admin/users`) while the live URL is `/en/admin/users/…`.
    const fromFr = entityContextFor("/fr/admin/moderation/42", "/admin/moderation")
    expect(fromFr?.recordId).toBe("42")
    expect(entityContextFor("/en/admin/users/42", "/admin/users")?.recordId).toBe("42")
  })

  it("is null on the section index itself", () => {
    expect(entityContextFor("/admin/users", "/admin/users")).toBeNull()
    expect(entityContextFor("/admin/users/", "/admin/users")).toBeNull()
  })

  it("ignores a query string", () => {
    expect(entityContextFor("/admin/users/42?tab=roles", "/admin/users")?.recordId).toBe("42")
  })

  it("never reads a declared static sub-route as a record id", () => {
    // `branding/colors` really is a page, not a theme named "colors" — see the
    // static-wins-over-[id] note in app/[locale]/(app)/admin/branding/page.tsx.
    for (const [pathname, section] of [
      ["/admin/branding/colors", "/admin/branding"],
      ["/admin/branding/new", "/admin/branding"],
      ["/admin/content/timeline", "/admin/content"],
      ["/admin/content/import", "/admin/content"],
      ["/admin/secrets/new", "/admin/secrets"],
    ] as const) {
      expect(entityContextFor(pathname, section), pathname).toBeNull()
    }
  })

  it("does not claim a segment belonging to another section", () => {
    // Guards against a crumb for a page the viewer's nav resolved elsewhere.
    expect(entityContextFor("/admin/users/42", "/admin/moderation")).toBeNull()
  })

  it("does not treat a deeper nesting as one record", () => {
    expect(entityContextFor("/admin/users/42/roles/7", "/admin/users")).toBeNull()
  })

  it("still reads an id whose value happens to be a locale code", () => {
    // Stripping is by SEGMENT, so `/admin/users/en` keeps `en` as the record.
    expect(entityContextFor("/en/admin/users/en", "/admin/users")?.recordId).toBe("en")
    expect(entityContextFor("/admin/users/fr", "/admin/users")?.recordId).toBe("fr")
  })
})

describe("staticSubRoutesOf", () => {
  it("derives from the declared sub-routes, excluding dynamic placeholders", () => {
    expect(staticSubRoutesOf("/admin/branding").sort()).toEqual(
      ["assets", "colors", "new"].sort(),
    )
    // `{id}` is the record page itself — listing it would suppress real crumbs.
    expect(staticSubRoutesOf("/admin/users")).toEqual([])
    expect(staticSubRoutesOf("/admin/moderation")).toEqual([])
  })

  it("returns nothing for a section with no children", () => {
    expect(staticSubRoutesOf("/admin/dashboard")).toEqual([])
  })
})

describe("compressRecordId", () => {
  it("leaves a short id intact", () => {
    expect(compressRecordId("42")).toBe("42")
    expect(compressRecordId("abc-def")).toBe("abc-def")
  })

  it("compresses a uuid without losing either end", () => {
    const out = compressRecordId("9f3c1a2b-7d4e-4f60-8a11-00cc4de90b1f")
    expect(out).toBe("9f3c1a2b…0b1f")
    // The ellipsis is the only elision: head and tail are verbatim, so the
    // operator can still match the crumb against a URL or a log line.
    expect(out.startsWith("9f3c1a2b")).toBe(true)
    expect(out.endsWith("0b1f")).toBe(true)
  })

  it("trims surrounding whitespace", () => {
    expect(compressRecordId("  abc  ")).toBe("abc")
  })
})
