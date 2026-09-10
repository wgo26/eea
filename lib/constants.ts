export const SITE = {
  name: "Eagle Eye Africa",
  shortName: "EEA",
  description:
    "A community-powered platform for photo stories, community news, notices, buy & sell, and culture — one community board for every place.",
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