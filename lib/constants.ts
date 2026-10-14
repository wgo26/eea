export const SITE = {
  name: "Eagle Eye Africa",
  shortName: "EEA",
  description:
    "A durable, place-based record of African community life: local reporting, photographs, notices and culture, with visible sources and accepted corrections. Buy & Sell is a separate local service.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  locales: ["en", "fr"] as const,
  defaultLocale: "en" as const,
} as const;

/**
 * Submit-flow route keys. Labels intentionally live in the dictionaries
 * (`dict.submit.types`) so the public submit index is fully bilingual —
 * no hardcoded English labels here.
 */
export const SUBMIT_TYPES = [
  { type: "photo-story" },
  { type: "news" },
  { type: "notice" },
  { type: "buy-sell" },
  { type: "culture" },
] as const;