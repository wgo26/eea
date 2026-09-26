import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import {
  ADMIN_NAV_SPECS,
  specCapabilities,
  type AdminNavItemSpec,
} from "@/components/admin/nav-items";
import {
  ALL_ADMIN_ROLES,
  capabilitiesForAdminRoles,
  type AdminRole,
} from "@/lib/auth/admin-roles";
import { ALL_CAPABILITIES, type Capability } from "@/lib/auth/capabilities";
import {
  GUARDED_ROUTES,
  SUB_ROUTES,
  navCapabilitiesForPath,
  pageGuardCapabilities,
  type GuardedRoute,
} from "./nav-integrity";

/**
 * Nav ↔ guard ↔ role integrity (plan Phase 7).
 *
 * Every rule here encodes a bug that actually shipped: a role whose capabilities
 * matched no nav entry (`analyst` got an empty sidebar; `marketplace_admin` and
 * `media_admin` got links to screens they were not the point of), and a nav entry
 * widened past its page guard (`insights` admits `analytics.read`, its guard did
 * not, so the Analyst's only working link bounced them to not-authorized).
 *
 * These are invisible to `tsc` (both sides type-check), to eslint, and to the
 * build — a mismatch only surfaces at runtime, for exactly one person, as a dead
 * link. Without this file the next role added reproduces the class.
 */

/* helpers ------------------------------------------------------------ */

/** Each spec keyed by its canonical path (`ADMIN_NAV_SPECS` is the source). */
const specsByPath = new Map<string, AdminNavItemSpec>(
  ADMIN_NAV_SPECS.map((spec) => [spec.path, spec]),
)

const routeByPath = new Map<string, GuardedRoute>(
  GUARDED_ROUTES.map((route) => [route.path, route]),
)

/** Nav entries a role set can actually see. */
function visibleSpecs(roleSet: AdminRole[]): AdminNavItemSpec[] {
  const caps = capabilitiesForAdminRoles(roleSet)
  return ADMIN_NAV_SPECS.filter((spec) => specCapabilities(spec).some((c) => caps.has(c)))
}

/** Route groups like `(app)` are URL-transparent but real on disk. */
function appPath(...segments: string[]): string {
  return resolve('app/[locale]', '(app)', ...segments)
}

/** `/admin/insights` -> `admin/insights/page.tsx` under the (app) group. */
function pageFileFor(path: string): string {
  return appPath(...path.split('/').filter(Boolean), 'page.tsx')
}


/* ------------------------------------------------------------------ */


describe("ADMIN_NAV_SPECS ↔ lib/admin/nav-integrity.ts stay in lockstep", () => {
  it("every nav spec has a declared guard pairing, and vice versa", () => {
    const specPaths = new Set(ADMIN_NAV_SPECS.map((s) => s.path))
    const declared = new Set(GUARDED_ROUTES.map((r) => r.path))
    expect([...specPaths].filter((p) => !declared.has(p)), "nav entries with no guard pairing").toEqual([])
    expect([...declared].filter((p) => !specPaths.has(p)), "guard pairings with no nav entry").toEqual([])
  })

  it("declared nav capabilities match the spec exactly", () => {
    for (const route of GUARDED_ROUTES) {
      const spec = specsByPath.get(route.path)
      expect(spec, `no nav spec for ${route.path}`).toBeTruthy()
      expect(specCapabilities(spec!).slice().sort(), `nav capabilities drift on ${route.path}`).toEqual(
        route.nav.slice().sort(),
      )
    }
  })

  it("covers every spec, so a new nav entry must be paired with a guard", () => {
    expect(GUARDED_ROUTES.length).toBe(ADMIN_NAV_SPECS.length)
  })

  it("declares no duplicate paths in either list", () => {
    expect(new Set(ADMIN_NAV_SPECS.map((s) => s.path)).size).toBe(ADMIN_NAV_SPECS.length)
    expect(new Set(GUARDED_ROUTES.map((r) => r.path)).size).toBe(GUARDED_ROUTES.length)
  })
})

describe("Route resolution: every nav path is a real route", () => {
  it("resolves every nav entry to a page.tsx on disk", () => {
    for (const spec of ADMIN_NAV_SPECS) {
      expect(existsSync(pageFileFor(spec.path)), `no route for nav path ${spec.path}`).toBe(true)
    }
  })

  it("resolves every declared sub-route file", () => {
    for (const sub of SUB_ROUTES) {
      expect(existsSync(appPath(sub.file)), `missing ${sub.file}`).toBe(true)
    }
  })

  it("has a nav entry that owns every sub-route", () => {
    for (const sub of SUB_ROUTES) {
      expect(specsByPath.has(sub.ownedBy), `${sub.path} owned by unknown ${sub.ownedBy}`).toBe(true)
    }
  })
})

describe("Nav ↔ page guard agreement", () => {
  /**
   * The rule that catches the insights bug. `single` must match exactly; `any`
   * must be a superset of the nav, so every capability the menu admits also
   * opens the page behind it.
   */
  it("no route admits a capability through the nav that its guard rejects", () => {
    for (const route of GUARDED_ROUTES) {
      const accepted = new Set(pageGuardCapabilities(route.page))
      for (const capability of route.nav) {
        expect(
          accepted.has(capability),
          `${route.path}: nav admits ${capability} but the guard rejects it — dead link`,
        ).toBe(true)
      }
    }
  })

  it("single-capability guards match their nav exactly", () => {
    for (const route of GUARDED_ROUTES) {
      if (route.page.mode !== "single") continue
      expect(route.nav, `${route.path} declares single but lists several`).toEqual([
        route.page.capability,
      ])
    }
  })

  it("every capability a guard accepts also earns the holder a nav entry", () => {
    const navUnion = new Set<Capability>(ADMIN_NAV_SPECS.flatMap((s) => specCapabilities(s)))
    for (const route of GUARDED_ROUTES) {
      expect(routeByPath.get(route.path)).toBe(route)
      for (const capability of pageGuardCapabilities(route.page)) {
        expect(
          navUnion.has(capability),
          `${route.path} accepts ${capability}, which no nav entry offers`,
        ).toBe(true)
      }
    }
  })

  it("a sub-route never demands more than its owning section admits", () => {
    for (const sub of SUB_ROUTES) {
      const owner = specsByPath.get(sub.ownedBy)!
      const admitted = new Set(specCapabilities(owner))
      for (const capability of pageGuardCapabilities(sub.page)) {
        expect(
          admitted.has(capability),
          `${sub.path} guards ${capability}, not admitted by ${sub.ownedBy}`,
        ).toBe(true)
      }
    }
  })
})

describe("Every admin role reaches work, and no capability is orphaned", () => {
  /** The regression that produced this suite: a role with an empty console. */
  it.each(ALL_ADMIN_ROLES.map((r) => [r] as [AdminRole]))("%s sees a section", (role) => {
    expect(visibleSpecs([role]).length).toBeGreaterThan(0)
  })

  it("marketplace_admin, media_admin and analyst reach their own screens", () => {
    // Each of these three used to hold a capability that matched nothing: the
    // role existed, the work it is named after did not appear anywhere.
    for (const [role, path] of [
      ["marketplace_admin", "/admin/listings"],
      ["media_admin", "/admin/media"],
      ["analyst", "/admin/insights"],
    ] as const) {
      const spec = specsByPath.get(path)!
      const caps = capabilitiesForAdminRoles([role])
      expect(
        specCapabilities(spec).some((c) => caps.has(c)),
        `${role} cannot open ${path}`,
      ).toBe(true)
    }
  })

  it("every capability named by the nav is granted by at least one admin role", () => {
    // The legacy `app_role` layer also grants capabilities, but the fine-grained
    // map is what a fresh grant looks like: a capability no admin role holds can
    // only ever be reached through the coarse legacy alias.
    const held = new Set<Capability>(ALL_ADMIN_ROLES.flatMap((r) => [...capabilitiesForAdminRoles([r])]))
    for (const spec of ADMIN_NAV_SPECS) {
      for (const capability of specCapabilities(spec)) {
        expect(
          held.has(capability),
          `${spec.path} requires ${capability}, which no admin role grants`,
        ).toBe(true)
      }
    }
  })

  it("names only real capabilities, in either direction", () => {
    const known = new Set<string>(ALL_CAPABILITIES)
    for (const route of GUARDED_ROUTES) {
      for (const capability of [...route.nav, ...pageGuardCapabilities(route.page)]) {
        expect(known.has(capability), `unknown capability ${capability} on ${route.path}`).toBe(true)
      }
    }
  })
})

/* ------------------------------------------------------------------ */
/* Shell links are judged by destination, not by a name list           */
/* ------------------------------------------------------------------ */

describe("navCapabilitiesForPath", () => {
  it("resolves a section to the capabilities its nav entry admits", () => {
    expect(navCapabilitiesForPath("/admin/storage-backup")).toEqual(["system.owner"])
    expect(navCapabilitiesForPath("/admin/insights")?.sort()).toEqual(
      ["viewDashboard", "analytics.read"].sort(),
    )
  })

  it("judges a deep route by the most specific owning section", () => {
    // The scheduler's `state-schedules` row points at /admin/states; a
    // breadcrumbs lookup for /admin/users/<id> resolves through /admin/users.
    expect(navCapabilitiesForPath("/admin/users/9f3c1a2b")).toEqual(["manageUsers"])
  })

  it("returns null for a path no section owns", () => {
    // Callers treat null as "no nav-level requirement", so the shell keeps the
    // row rather than hiding it behind a map entry nobody maintained.
    expect(navCapabilitiesForPath("/account")).toBeNull()
    expect(navCapabilitiesForPath("/admin")).toBeNull()
  })

  it("agrees with the page guard on every route it resolves", () => {
    // The invariant that keeps a shell LINK actionable: whatever the nav says
    // opens a path must also be accepted by that page's own guard, or the link
    // sends the operator to not-authorized. This is the same rule the insights
    // regression violated, asserted from the shell's side.
    for (const route of GUARDED_ROUTES) {
      const admitted = navCapabilitiesForPath(route.path) ?? []
      const accepted = new Set(pageGuardCapabilities(route.page))
      for (const capability of admitted) {
        expect(
          accepted.has(capability),
          `${route.path}: nav admits ${capability} but the guard rejects it`,
        ).toBe(true)
      }
    }
  })
})

/* ------------------------------------------------------------------ */
/* No capability is defined that gates nothing                         */
/* ------------------------------------------------------------------ */

/**
 * A capability is a promise that some surface checks it. `viewAuditLog` broke
 * that promise: it sat in the type, the legacy `admin` map and the weight table,
 * was granted to every legacy admin, and gated precisely nothing — the audit
 * tabs moved behind `system.owner` (docs/system/chief-access.md) and the old
 * guard was deleted with them. That is not harmless. A name in the map reads as
 * an authority, so an operator who trusts it grants "can see the audit trail"
 * and gets a person who can see nothing, and the next refactor reasons from a
 * permission that no longer exists.
 *
 * This rule is checked against the SOURCE on disk rather than another
 * declaration, because that is the only way it can catch a capability whose last
 * consumer was removed: nav-integrity.ts records what the guards say, so a
 * deleted guard simply stops appearing there, while the capability definition
 * stays and every other check still passes.
 */
const CAPABILITY_DEFINITION_FILES = new Set([
  resolve('lib/auth/capabilities.ts'),
  resolve('lib/auth/admin-roles.ts'),
])

/** Every .ts/.tsx under the shipped source roots (no tests, no worktrees). */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) sourceFiles(full, out)
    else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

const SHIPPED_SOURCE = ['lib', 'app', 'components', 'scripts'].flatMap((root) =>
  sourceFiles(root),
)

describe("every capability gates something real", () => {
  it.each(ALL_CAPABILITIES.map((c) => [c] as [Capability]))(
    "%s is referenced outside its own definition maps",
    (capability) => {
      const needle = `'${capability}'`
      const doubled = `"${capability}"`
      const found = SHIPPED_SOURCE.some((file) => {
        if (CAPABILITY_DEFINITION_FILES.has(resolve(file))) return false
        const src = readFileSync(file, 'utf8')
        return src.includes(needle) || src.includes(doubled)
      })
      expect(
        found,
        `${capability} is declared but gates nothing — delete it, or wire it to a surface`,
      ).toBe(true)
    },
  )
})


/* ------------------------------------------------------------------ */
/* The declared pairing vs the guard that is really on disk            */
/* ------------------------------------------------------------------ */

/**
 * Without this rule the suite only proves that `nav-integrity.ts` agrees with
 * `ADMIN_NAV_SPECS` — two declarations. A page's guard is the third party, and
 * it is the one that decides whether a visible link works.
 *
 * So each pairing is checked against the source text of the page that implements
 * it: the guard call is parsed off disk and compared to what this suite claims
 * the page requires. Editing a `requireCapability` argument without updating
 * `nav-integrity.ts` (or the reverse) fails here, which is the exact drift that
 * shipped on /admin/insights.
 */
/** Read a page's real guard off disk, or null when it has none. */
function guardOnDisk(absolutePageFile: string): { mode: 'single' | 'any'; caps: Capability[] } | null {
  const src = readFileSync(absolutePageFile, 'utf8')
  const call = src.match(/require(Any)?Capability\(/)
  if (!call) return null
  const mode = call[1] ? 'any' : 'single'
  const args = splitTopLevelArgs(src.slice(call.index! + call[0].length))
  if (!args) return null
  // The final argument is always the locale-free redirect path; drop it.
  const expression = args.slice(0, -1).join(',')
  const arrayLiteral = expression.match(/\[\s*\.\.\.([A-Za-z_][A-Za-z0-9_]*)\s*\]/)
  if (arrayLiteral) {
    return { mode, caps: capabilitiesOfConst(src, arrayLiteral[1]) }
  }
  return { mode, caps: [...expression.matchAll(/'([^']+)'/g)].map((m) => m[1]) as Capability[] }
}

/**
 * Split an argument list at top-level commas only. `[a, b], '/path'` must not
 * split inside the array, and a call may end in a trailing comma before the
 * closing paren — hence the balanced-scan-and-trim rather than a regex.
 */
function splitTopLevelArgs(from: string): string[] | null {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const ch of from) {
    if (ch === '(' || ch === '[' || ch === '{') depth += 1
    if (ch === ')' || ch === ']' || ch === '}') {
      if (depth === 0) {
        parts.push(current.trim())
        return parts.filter((p, i) => p.length > 0 || i < parts.length - 1)
      }
      depth -= 1
    }
    if (ch === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  return null
}

/** The string literals inside `const NAME = [...]` (possibly `as const`). */
function capabilitiesOfConst(src: string, name: string): Capability[] {
  const decl = src.match(
    new RegExp(`(?:const|let)\\s+${name}\\b[^=\\n]*=\\s*\\[([\\s\\S]*?)\\]`),
  )
  if (!decl) return []
  return [...decl[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) as Capability[]
}

describe("Declared pairing matches the guard parsed off the page source", () => {
  it("every guarded route's page really requires what nav-integrity.ts says", () => {
    for (const route of GUARDED_ROUTES) {
      const found = guardOnDisk(pageFileFor(route.path))
      expect(found, `${route.path}: no requireCapability call found on disk`).toBeTruthy()
      const declared = pageGuardCapabilities(route.page)
      expect(found!.mode, `${route.path}: guard form differs`).toBe(route.page.mode)
      expect(found!.caps.slice().sort(), `${route.path}: guard capabilities differ`).toEqual(
        declared.slice().sort(),
      )
    }
  })

  it("every sub-route's page really requires what nav-integrity.ts says", () => {
    for (const sub of SUB_ROUTES) {
      const found = guardOnDisk(appPath(sub.file))
      expect(found, `${sub.path}: no requireCapability call found on disk`).toBeTruthy()
      expect(found!.caps.slice().sort(), `${sub.path}: guard capabilities differ`).toEqual(
        pageGuardCapabilities(sub.page).slice().sort(),
      )
    }
  })
})

