/**
 * A2 — public chrome strings (English). Single source of truth for the
 * every-page anonymous chrome (header, footer, theme toggle, command
 * palette). Imported by `lib/i18n/en.ts` (spread back into the full
 * Dictionary) AND by `lib/i18n/chrome.ts`, which is the only dictionary
 * module client chrome components may import — so the ~147 KB of
 * `*-app.ts` admin vocabulary never enters the anonymous client bundle.
 *
 * KEEP IN SYNC with chrome-fr.ts (same keys; the EN/FR parity test plus
 * scripts/verify-client-dictionary.mjs enforce this).
 */
export const chromeEn = {
  nav: {
    home: 'Home',
    photoStories: 'Photo Stories',
    news: 'Community News',
    buySell: 'Buy & Sell',
    notices: 'Notices',
    culture: 'Culture',
    submit: 'Submit a Story',
    search: 'Search',
    about: 'About',
    advertise: 'Advertise',
    locations: 'Locations',
    contributors: 'Contributors',
    main: 'Main',
    digest: 'Daily digest',
    filters: 'Filters',
  },
  readerToolbar: {
    label: 'Reader tools',
  },
  header: {
    searchPlaceholder: 'Search stories, notices, listings…',
    tagline: 'Seen by the community. Verified by Eagle Eye.',
    menu: 'Menu',
    close: 'Close',
  },
  theme: { label: 'Theme', light: 'Light', dark: 'Dark', system: 'System', contrast: 'High contrast' },
  language: { label: 'Language' },
  command: {
    openLabel: 'Search or jump to a section',
    placeholder: 'Search sections and actions…',
    sections: 'Sections',
    actions: 'Actions',
    empty: 'No matches found.',
    goToSearch: 'Advanced search',
  },
  // A3: the 404 page must stay static (not-found.tsx cannot use request APIs
  // without forcing the whole [locale] subtree dynamic), so its copy lives
  // here instead of system.notFound. Mirrors appStringsEn.system.notFound —
  // lib/i18n/chrome.test.ts fails on drift.
  notFound: {
    title: 'Page not found',
    body: "The page you're looking for doesn't exist or may have moved.",
    home: 'Back to homepage',
  },
footer: {
    aboutTitle: 'Eagle Eye Africa',
    aboutText:
      'A community-first African media platform combining local journalism, visual storytelling, community information, classifieds and culture — a digital record of what is happening around people.',
    sections: 'Sections',
    community: 'Community',
    legal: 'Legal',
    followUs: 'Follow us',
    terms: 'Terms of Service',
    privacy: 'Privacy Policy',
    guidelines: 'Community Guidelines',
    copyright: 'Copyright & Takedown',
    contact: 'Contact',
    rights: 'All rights reserved.',
    madeIn: 'Made for Africa\'s communities.',
  },
  locations: {
    yourPlace: 'Your place',
    selectPlace: 'Select your place',
    searchPlaces: 'Search places…',
    noPlacesFound: 'No places found.',
    clearPlace: 'Clear place',
    nearYou: 'Near you',
    nearYouTitle: 'Latest from {place}',
    placePromptTitle: 'Where is home?',
    placePromptBody: 'Pick your place once — the homepage will lead with news, notices, listings and events near you.',
    placePromptLater: 'Not now',
  },
}
