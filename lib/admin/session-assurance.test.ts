import { describe, expect, it } from "vitest";

import { classifyAssurance, type SessionAssurance } from "./session-assurance";

/**
 * Session assurance ranking (plan Phase 6 — the footer's 2FA row).
 *
 * Only the pure half is testable here: `getSessionAssurance()` needs a
 * cookie-scoped Supabase client. The ranking is the part that can mislead an
 * operator, so it is the part worth pinning.
 *
 * The distinction the suite protects is the one that matters in a runbook:
 * "you have no second factor" and "you have one but did not use it" read the same
 * if collapsed, and they call for opposite actions (enrol, versus re-authenticate).
 */

const at = (currentLevel: string, factorEnrolled: boolean): SessionAssurance => ({
  currentLevel,
  factorEnrolled,
})

describe("classifyAssurance", () => {
  it("reports the step-up only when the session itself is aal2", () => {
    expect(classifyAssurance(at("aal2", true))).toBe("step-up")
  })

  it("separates an unused factor from no factor at all", () => {
    expect(classifyAssurance(at("aal1", true))).toBe("enrolled-not-used")
    expect(classifyAssurance(at("aal1", false))).toBe("password-only")
  })

  it("does not claim a step-up for an enrolled-but-unused factor", () => {
    // The dangerous misread: enrolment is not this session's assurance. A chief
    // told "second factor verified" while sitting on an aal1 session would believe
    // the destructive-action step-up was already satisfied.
    expect(classifyAssurance(at("aal1", true))).not.toBe("step-up")
  })

  it("degrades to unknown rather than a downgrade when nothing could be read", () => {
    // Display, not authorization: a failed read must never shout "password only"
    // at someone who may be holding aal2.
    expect(classifyAssurance(null)).toBe("unknown")
  })

  it("treats a non-aal2 level with no factor as password-only", () => {
    expect(classifyAssurance(at("aal0", false))).toBe("password-only")
    expect(classifyAssurance(at("", false))).toBe("password-only")
  })

  it("covers every level it can return, so the dictionary cannot miss one", () => {
    const levels = [
      classifyAssurance(at("aal2", true)),
      classifyAssurance(at("aal1", true)),
      classifyAssurance(at("aal1", false)),
      classifyAssurance(null),
    ]
    expect(new Set(levels).size).toBe(4)
  })
})
