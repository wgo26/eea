import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { cspFromEnv } from "./lib/security/csp";

type RemoteImagePattern = { protocol: "http" | "https"; hostname: string };

/**
 * Scheme + hostname of an env-provided URL, or null when unset/invalid. Next
 * loads `.env*` before this file is evaluated, so the storage env vars are
 * already available here — uploaded images become optimizable by next/image.
 */
function envImagePattern(raw: string | undefined): RemoteImagePattern | null {
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (!parsed.hostname) return null;
    return {
      protocol: parsed.protocol === "http:" ? "http" : "https",
      hostname: parsed.hostname,
    };
  } catch {
    return null;
  }
}

/** Remote image hosts: seed placeholders plus the configured storage backends. */
const storagePatterns: RemoteImagePattern[] = [
  envImagePattern(process.env.R2_PUBLIC_BASE_URL),
  envImagePattern(process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL),
  envImagePattern(process.env.NEXT_PUBLIC_SUPABASE_URL),
  process.env.CLOUDINARY_CLOUD_NAME
    ? { protocol: "https", hostname: "res.cloudinary.com" }
    : null,
].filter((pattern): pattern is RemoteImagePattern => pattern !== null);

const nextConfig: NextConfig = {
  async headers() {
    // CSP is built by lib/security/csp.ts (pure + unit-tested). Audit P0-3.
    const cspDirectives = cspFromEnv();

    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: cspDirectives },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
  images: {
    // AVIF-first negotiation: ~50% smaller than WebP at equal quality, with
    // WebP as the negotiated fallback for AVIF-less clients — the WebP-only
    // default leaves the low-bandwidth audience's biggest win on the table.
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "picsum.photos",
        pathname: "/seed/**",
      },
      ...storagePatterns,
    ],
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options
  org: "eea",
  project: "eea",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
  widenClientFileUpload: true,
  // Sentry v10 removed the top-level `hideSourceMaps`. Keeping generated maps
  // out of the shipped bundle is now expressed under `sourcemaps` and defaults
  // to `true` — stated explicitly here so the intent survives the upgrade.
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  disableLogger: true,
  automaticVercelMonitors: true,
});
