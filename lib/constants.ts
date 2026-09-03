export const SITE = {
  name: "Eagle Eye Africa",
  shortName: "EEA",
  description:
    "A community-powered platform for photo stories, community news, notices, buy & sell, and culture — one community board for every place.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  locales: ["en", "fr"] as const,
  defaultLocale: "en" as const,
} as const;

export const NAV_LINKS = [
  { href: "/photo-stories", label: "Photo Stories" },
  { href: "/news", label: "News" },
  { href: "/notices", label: "Notices" },
  { href: "/buy-sell", label: "Buy & Sell" },
  { href: "/culture", label: "Culture" },
  { href: "/locations", label: "Locations" },
] as const;

export const FOOTER_LINKS = [
  { href: "/about", label: "About" },
  { href: "/about/terms", label: "Terms" },
  { href: "/about/privacy", label: "Privacy" },
  { href: "/about/guidelines", label: "Community Guidelines" },
  { href: "/about/copyright", label: "Copyright & Takedown" },
  { href: "/about/contact", label: "Contact" },
  { href: "/advertise", label: "Advertise" },
] as const;

export const SUBMIT_TYPES = [
  { type: "photo-story", label: "Photo Story" },
  { type: "news", label: "Community News" },
  { type: "notice", label: "Notice" },
  { type: "buy-sell", label: "Buy & Sell Listing" },
  { type: "culture", label: "Culture & Entertainment" },
] as const;