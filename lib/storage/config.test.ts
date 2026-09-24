import { describe, expect, it, vi } from "vitest";

import { resolveR2PublicBaseUrl } from "./config";

describe("resolveR2PublicBaseUrl", () => {
  it("prefers the server-only R2 URL", () => {
    expect(
      resolveR2PublicBaseUrl(
        "https://media.example.com",
        "https://public.example.com",
      ),
    ).toBe("https://media.example.com");
  });

  it("falls back to the public URL variable used by the browser", () => {
    expect(
      resolveR2PublicBaseUrl(undefined, "https://pub-example.r2.dev"),
    ).toBe("https://pub-example.r2.dev");
    expect(resolveR2PublicBaseUrl("  ", "https://pub-example.r2.dev")).toBe(
      "https://pub-example.r2.dev",
    );
  });

  it("returns an empty value when neither URL is configured", () => {
    expect(resolveR2PublicBaseUrl(undefined, undefined)).toBe("");
  });

  it("applies the fallback when storageConfig is initialized", async () => {
    vi.resetModules();
    vi.stubEnv("R2_PUBLIC_BASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_R2_PUBLIC_BASE_URL", "https://pub-example.r2.dev");

    const { storageConfig } = await import("./config");
    expect(storageConfig.r2.publicBaseUrl).toBe("https://pub-example.r2.dev");

    vi.unstubAllEnvs();
  });
});
