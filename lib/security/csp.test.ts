import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCsp, originOf, parseHostList, cspFromEnv } from "./csp";

const __here = dirname(fileURLToPath(import.meta.url));

/**
 * Reads the source of an exported template-literal string (e.g. the inline
 * pre-paint bootstrap scripts) and returns its sha256 as a base64 digest. The
 * scripts are read from disk rather than imported because locale-init.ts
 * carries `import "server-only"`, which would throw under a non-production
 * runtime. Mirrors scripts/tmp-hash.mjs (now superseded by this gate).
 */
function sha256OfExport(sourceFile: string, exportName: string): string | null {
    const src = readFileSync(sourceFile, "utf8");
    const re = new RegExp(`export const ${exportName} = \`([\\s\\S]*?)\`;?`);
    const match = src.match(re);
    if (!match) return null;
    return createHash("sha256").update(match[1], "utf8").digest("base64");
}

/** Pulls one directive's value out of a serialized policy. */
function directive(csp: string, name: string): string | undefined {
  return csp
    .split("; ")
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `))
    ?.slice(name.length)
    .trim();
}

const prod = { isProduction: true } as const;

describe("originOf", () => {
  it("returns scheme + host for http(s) URLs", () => {
    expect(originOf("https://xyz.supabase.co/rest/v1?x=1")).toBe("https://xyz.supabase.co");
    expect(originOf("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("returns null for unset, invalid, or non-http schemes", () => {
    expect(originOf(undefined)).toBeNull();
    expect(originOf("")).toBeNull();
    expect(originOf("not a url")).toBeNull();
    // A javascript:/data: entry must never reach a CSP host allowlist.
    expect(originOf("javascript:alert(1)")).toBeNull();
    expect(originOf("data:text/html,<script>")).toBeNull();
  });

  it("preserves a non-default port and drops a default one", () => {
    // A CSP host-source without a port matches only the scheme's default port,
    // so a non-default port must survive into the allowlist entry.
    expect(originOf("https://api.example.com:8443/rest")).toBe("https://api.example.com:8443");
    // WHATWG URL normalizes a default port away, so no redundant :443 is emitted.
    expect(originOf("https://api.example.com:443/rest")).toBe("https://api.example.com");
  });
});

describe("parseHostList", () => {
  it("normalizes bare hostnames to https origins", () => {
    expect(parseHostList("cdn.example.com, other.net")).toEqual([
      "https://cdn.example.com",
      "https://other.net",
    ]);
  });

  it("keeps explicit schemes and drops junk entries", () => {
    expect(parseHostList("https://a.example, javascript:alert(1), ,b.example")).toEqual([
      "https://a.example",
      "https://b.example",
    ]);
  });

  it("returns an empty array for unset input", () => {
    expect(parseHostList(undefined)).toEqual([]);
  });
});

describe("buildCsp — XSS containment", () => {
  it("never allows unsafe-eval in production", () => {
    expect(directive(buildCsp(prod), "script-src")).not.toContain("'unsafe-eval'");
  });

  it("allows unsafe-eval only outside production (Turbopack/React refresh)", () => {
    const dev = buildCsp({ isProduction: false });
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
  });

  it("refuses inline event-handler attributes outright", () => {
    // The containment layer that matters if stored HTML ever bypasses the
    // sanitizer: script-src-attr does not inherit 'unsafe-inline' from
    // script-src once declared explicitly.
    expect(directive(buildCsp(prod), "script-src-attr")).toBe("'none'");
  });

  it("locks down the remaining injection-relevant directives", () => {
    const csp = buildCsp(prod);
    expect(directive(csp, "object-src")).toBe("'none'");
    expect(directive(csp, "base-uri")).toBe("'self'");
    expect(directive(csp, "form-action")).toBe("'self'");
    expect(directive(csp, "frame-ancestors")).toBe("'none'");
    expect(directive(csp, "default-src")).toBe("'self'");
  });

  it("does not emit a blanket https: image source by default", () => {
    const img = directive(buildCsp(prod), "img-src")!;
    // A bare `https:` token would let injected markup beacon to any host.
    expect(img.split(" ")).not.toContain("https:");
  });

  it("restores the blanket https: image source only when explicitly opted in", () => {
    const img = directive(buildCsp({ ...prod, allowAnyImageHost: true }), "img-src")!;
    expect(img.split(" ")).toContain("https:");
  });

  it("does not emit a blanket https: connect source", () => {
    const connect = directive(buildCsp(prod), "connect-src")!;
    expect(connect.split(" ")).not.toContain("https:");
  });
});
describe("buildCsp — host allowlisting", () => {
  it("allowlists the Supabase origin over both https and wss", () => {
    const connect = directive(
      buildCsp({ ...prod, supabaseUrl: "https://xyz.supabase.co" }),
      "connect-src",
    )!;
    expect(connect).toContain("https://xyz.supabase.co");
    expect(connect).toContain("wss://xyz.supabase.co");
    expect(connect).toContain("https://*.supabase.co");
  });

  it("adds the Cloudinary transform host only when a cloud name is set", () => {
    const without = directive(buildCsp(prod), "img-src")!;
    expect(without).not.toContain("res.cloudinary.com");

    const withCloud = directive(buildCsp({ ...prod, cloudinaryCloudName: "eea" }), "img-src")!;
    expect(withCloud).toContain("https://res.cloudinary.com");
  });

  it("allowlists the storage + Blogger + map-tile image hosts", () => {
    const img = directive(
      buildCsp({ ...prod, r2PublicBaseUrl: "https://media.example.com/public" }),
      "img-src",
    )!;
    expect(img).toContain("https://media.example.com");
    // Imported Blogger posts keep their original <img src>.
    expect(img).toContain("https://blogger.googleusercontent.com");
    expect(img).toContain("https://tile.openstreetmap.org");
  });

  it("keeps Cloudflare Turnstile reachable in script, frame and connect", () => {
    const csp = buildCsp(prod);
    expect(directive(csp, "script-src")).toContain("https://challenges.cloudflare.com");
    expect(directive(csp, "frame-src")).toContain("https://challenges.cloudflare.com");
    expect(directive(csp, "connect-src")).toContain("https://challenges.cloudflare.com");
  });

  it("allowlists the video embed frames", () => {
    const frame = directive(buildCsp(prod), "frame-src")!;
    expect(frame).toContain("https://www.youtube.com");
    expect(frame).toContain("https://player.vimeo.com");
  });

  it("allowlists YouTube thumbnails so video-only posts render a picture preview", () => {
    const img = directive(buildCsp(prod), "img-src")!;
    expect(img).toContain("https://i.ytimg.com");
    const media = directive(buildCsp(prod), "media-src")!;
    expect(media).toContain("https://i.ytimg.com");
  });

  it("honours the extra-host escape hatches", () => {
    const csp = buildCsp({
      ...prod,
      extraImageHosts: "cdn.example.com",
      extraConnectHosts: "api.example.com",
    });
    expect(directive(csp, "img-src")).toContain("https://cdn.example.com");
    expect(directive(csp, "connect-src")).toContain("https://api.example.com");
  });

  it("emits upgrade-insecure-requests in production only", () => {
    expect(buildCsp(prod)).toContain("upgrade-insecure-requests");
    expect(buildCsp({ isProduction: false })).not.toContain("upgrade-insecure-requests");
  });

  it("includes a reporting endpoint only when configured", () => {
    expect(buildCsp(prod)).not.toContain("report-uri");
    const reported = buildCsp({ ...prod, reportUri: "https://report.example.com/csp" });
    expect(reported).toContain("report-uri https://report.example.com/csp");
    expect(reported).toContain("report-to https://report.example.com/csp");
  });

  it("produces a stable, deduplicated policy string", () => {
    const options = { ...prod, supabaseUrl: "https://xyz.supabase.co" };
    const first = buildCsp(options);
    expect(buildCsp(options)).toBe(first);
    // Duplicate sources would mean a duplicated allowlist entry leaked in.
    const connect = directive(first, "connect-src")!.split(" ");
    expect(new Set(connect).size).toBe(connect.length);
  });
});

describe("buildCsp — hash-pinned bootstrap scripts", () => {
    // Phase 1, audit A13: Next.js 16 inlines unhashable RSC flight JSON on every
    // static page (sha256 changes per build), and Turnstile is loaded inline,
    // so `'unsafe-inline'` cannot be removed without breaking hydration or
    // forcing dynamic rendering of every page (defeating ISR). The two
    // *developer-authored* bootstrap scripts are pinned instead — a drift in
    // either signals an unintended change to the pre-paint payload.
    const themeSrc = join(__here, "../../lib/theme.ts");
    const localeSrc = join(__here, "../../lib/i18n/locale-init.ts");

    it("theme-init bootstrap script hash matches the pinned value", () => {
        const hash = sha256OfExport(themeSrc, "themeInitScript");
        expect(hash).not.toBeNull();
        expect(hash).toBe("98d5gLooYySALC2j91N+UCYbhX3zM6o+KHBLc9L6kR0=");
    });

    it("locale-init bootstrap script hash matches the pinned value", () => {
        const hash = sha256OfExport(localeSrc, "localeInitScript");
        expect(hash).not.toBeNull();
        expect(hash).toBe("10eVgOxrOqT1jh//Btcg/JyFBjHkUih0SNqr1Rh1T8Q=");
    });
});

describe("cspFromEnv", () => {
  it("reads the knobs from the environment", () => {
    const csp = cspFromEnv({
      NODE_ENV: "production",
      NEXT_PUBLIC_SUPABASE_URL: "https://proj.supabase.co",
      R2_PUBLIC_BASE_URL: "https://media.example.com",
      CSP_EXTRA_IMAGE_HOSTS: "extra.example.com",
      CSP_REPORT_URI: "https://report.example.com/csp",
    } as unknown as NodeJS.ProcessEnv);

    expect(directive(csp, "script-src")).not.toContain("'unsafe-eval'");
    expect(csp).toContain("https://proj.supabase.co");
    expect(directive(csp, "img-src")).toContain("https://media.example.com");
    expect(directive(csp, "img-src")).toContain("https://extra.example.com");
    expect(csp).toContain("report-uri https://report.example.com/csp");
  });

  it("treats NEXT_PUBLIC_R2_PUBLIC_BASE_URL as a fallback for the R2 base", () => {
    const csp = cspFromEnv({
      NODE_ENV: "production",
      NEXT_PUBLIC_R2_PUBLIC_BASE_URL: "https://fallback.example.com",
    } as unknown as NodeJS.ProcessEnv);
    expect(directive(csp, "img-src")).toContain("https://fallback.example.com");
  });

  it("omits the blanket image source unless explicitly opted in", () => {
    const strict = cspFromEnv({ NODE_ENV: "production" } as unknown as NodeJS.ProcessEnv);
    expect(directive(strict, "img-src")!.split(" ")).not.toContain("https:");

    const loosened = cspFromEnv({
      NODE_ENV: "production",
      CSP_ALLOW_ANY_IMAGE_HOST: "1",
    } as unknown as NodeJS.ProcessEnv);
    expect(directive(loosened, "img-src")!.split(" ")).toContain("https:");
  });
});