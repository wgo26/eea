/**
 * Locale-aware URL helpers — shared by server and client code.
 *
 * These are pure string utilities (no server-only imports) so they can be
 * used in edge middleware (proxy.ts), server components and client components
 * alike. The locale model is "prefix-all": every user-facing URL lives under
 * /{locale} and unprefixed URLs are redirected by proxy.ts — never rendered.
 */
import { locales, type Locale } from "./config";

/** Matches protocol-relative ("//host") and absolute ("https://…") URLs. */
const EXTERNAL_RE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/** True when the path's first segment is a locale (/en, /fr/news…). */
export function isLocalePrefixed(path: string): boolean {
  const first = path.split(/[?#]/)[0].split("/").filter(Boolean)[0];
  return !!first && (locales as readonly string[]).includes(first);
}

/**
 * Canonical path → locale-prefixed path. Idempotent: already-prefixed,
 * external and in-page (#…) paths pass through untouched.
 */
export function localePath(locale: Locale, path: string): string {
  if (!path) return `/${locale}`;
  if (EXTERNAL_RE.test(path) || path.startsWith("#")) return path;
  if (isLocalePrefixed(path)) return path;
  if (path === "/") return `/${locale}`;
  return `/${locale}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Resolves a locale from an Accept-Language header.
 * Order: first supported tag wins over later ones; defaults to English.
 */
export function acceptLanguageLocale(accept: string | null | undefined): Locale {
  const parts = (accept ?? "").toLowerCase().split(",");
  for (const part of parts) {
    const tag = part.split(";")[0].trim();
    if (tag === "fr" || tag.startsWith("fr-")) return "fr";
    if (tag === "en" || tag.startsWith("en-")) return "en";
  }
  return "en";
}

/**
 * Validates a `next` / redirect target before honoring it (open-redirect
 * protection). Only same-origin absolute paths are accepted; scheme-relative
 * ("//evil.com"), backslash and control-character tricks are rejected, as are
 * API and asset-like paths that could never be a page. The result is always
 * (re-)prefixed with the active locale so a validated `next` can never pull
 * the user out of their language.
 *
 * Returns the safe path, or null when the input must be discarded.
 */
export function safeNextPath(
  raw: string | null | undefined,
  locale: Locale,
): string | null {
  if (!raw) return null;
  const candidate = raw.trim();
  if (!candidate || candidate.length > 2048) return null;
  if (EXTERNAL_RE.test(candidate)) return null;
  if (!candidate.startsWith("/") || candidate.includes("\\")) return null;
  if (/[\u0000-\u001f\u007f]/.test(candidate)) return null;
  const pathOnly = candidate.split(/[?#]/)[0];
  if (pathOnly.startsWith("/api") || pathOnly.startsWith("/_next")) return null;
  if (/\.[a-z0-9]{1,8}$/i.test(pathOnly)) return null;
  if (isLocalePrefixed(candidate)) return candidate;
  return localePath(locale, candidate);
}

/**
 * hreflang/canonical set for a public page. Canonical is always the page's
 * own localized URL; both locales plus x-default (English) are emitted.
 */
export function buildAlternates(locale: Locale, path: string): {
  canonical: string;
  languages: { en: string; fr: string; "x-default": string };
} {
  const en = localePath("en", path);
  const fr = localePath("fr", path);
  return {
    canonical: locale === "fr" ? fr : en,
    languages: { en, fr, "x-default": en },
  };
}