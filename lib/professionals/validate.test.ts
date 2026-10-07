import { describe, expect, it } from "vitest";
import { parseSkills, validateClaim } from "./validate";

const good = {
  businessName: "Mankon Plumbing Works",
  claimantName: "Amina N.",
  contactPhone: "+237600000000",
  contactEmail: "",
  whatsapp: "",
  description: "Emergency plumbing across Bamenda.",
  categoryText: "Home services",
  skillsRaw: "plumbing, leak repair",
};

describe("parseSkills", () => {
  it("splits, lowercases and dedupes", () => {
    expect(parseSkills("Plumbing, plumbing,  Solar ")).toEqual(["plumbing", "solar"]);
  });

  it("caps at twelve skills", () => {
    expect(parseSkills(Array.from({ length: 20 }, (_, i) => `s${i}`).join(","))).toHaveLength(12);
  });
});

describe("validateClaim", () => {
  it("accepts a complete claim", () => {
    expect(validateClaim(good)).toBeNull();
  });

  it("requires a contact method", () => {
    expect(validateClaim({ ...good, contactPhone: "" })).toBe("contact");
  });

  it("rejects malformed email", () => {
    expect(validateClaim({ ...good, contactPhone: "", contactEmail: "not-an-email" })).toBe(
      "contactEmail",
    );
  });
});
