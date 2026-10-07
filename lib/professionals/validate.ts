/**
 * Business-claim validation — pure, shared by the public claim form (for
 * instant feedback) and the server action (the real gate).
 */

export const MAX_SKILLS = 12;
const MAX_SKILL_LEN = 40;

/** "plumbing, solar, tailoring" → ["plumbing", "solar", "tailoring"]. */
export function parseSkills(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const skill = part.trim().toLowerCase().slice(0, MAX_SKILL_LEN);
    if (skill && !seen.has(skill)) seen.add(skill);
    if (seen.size >= MAX_SKILLS) break;
  }
  return [...seen];
}

export type ClaimInput = {
  businessName: string;
  claimantName: string;
  contactPhone: string;
  contactEmail: string;
  whatsapp: string;
  description: string;
  categoryText: string;
  skillsRaw: string;
};

/** Error message (dictionary key suffix) or null when the field is fine. */
export function validateClaim(input: ClaimInput): string | null {
  if (input.businessName.trim().length < 2 || input.businessName.trim().length > 200) {
    return "businessName";
  }
  if (input.claimantName.trim().length < 2 || input.claimantName.trim().length > 200) {
    return "claimantName";
  }
  const hasContact = input.contactPhone.trim() || input.contactEmail.trim() || input.whatsapp.trim();
  if (!hasContact) return "contact";
  if (input.contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contactEmail.trim())) {
    return "contactEmail";
  }
  if (input.description.trim().length > 2000) return "description";
  return null;
}
