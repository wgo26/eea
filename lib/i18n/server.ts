import { cache } from "react";
import { cookies, headers } from "next/headers";
import { isLocale, LOCALE_COOKIE, type Locale } from "./config";
import { acceptLanguageLocale } from "./urls";

/**
 * Request-scoped locale resolution for server components, layouts and actions.
 *
 * Resolution order (the project standard, mirrored in proxy.ts):
 *   URL prefix (via the x-locale header proxy.ts sets) → eea-locale cookie
 *   → Accept-Language → English default.
 *
 * Cached per request so layouts, pages and metadata all agree without
 * repeated header/cookie reads.
 */
export const getRequestLocale = cache(async (): Promise<Locale> => {
  const requestHeaders = await headers();
  const fromProxy = requestHeaders.get("x-locale");
  if (isLocale(fromProxy)) return fromProxy;
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(cookieLocale)) return cookieLocale;
  return acceptLanguageLocale(requestHeaders.get("accept-language"));
});