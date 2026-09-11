import type { NextConfig } from "next";

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
    const cspDirectives = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https:",
      "font-src 'self' https://fonts.gstatic.com data:",
      "connect-src 'self' https://*.supabase.co https://challenges.cloudflare.com https:",
      "frame-src 'self' https://challenges.cloudflare.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");

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

export default nextConfig;
