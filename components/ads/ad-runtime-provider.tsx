"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { AdNetworkConfig } from "@/lib/ads/networks";
import type { Locale } from "@/lib/i18n";

/**
 * Request-scoped ad config for the public tree.
 *
 * The configuration now lives in Postgres (`ad_slots.network_*` +
 * `ad_network_settings`, edited at `/admin/ads`), so it is resolved **once on
 * the server** in `app/[locale]/(public)/layout.tsx` — inside the cached
 * `getAdNetworkRuntime()` read — and handed to the client renderer through this
 * context. That is what lets an operator change a tag without a rebuild: the
 * client bundle no longer carries the config, it receives it.
 *
 * `NEXT_PUBLIC_AD_SLOTS` remains supported as a bootstrap/fallback when the
 * database has no network rows (fresh install, migrations not applied), and the
 * renderer falls back to `readAdNetworkConfig()` when no provider is mounted.
 */
export type AdRuntimeValue = {
  config: AdNetworkConfig;
  locale: Locale;
};

const AdRuntimeContext = createContext<AdRuntimeValue | null>(null);

export function AdRuntimeProvider({ value, children }: { value: AdRuntimeValue; children: ReactNode }) {
  return <AdRuntimeContext.Provider value={value}>{children}</AdRuntimeContext.Provider>;
}

export function useAdRuntime(): AdRuntimeValue | null {
  return useContext(AdRuntimeContext);
}