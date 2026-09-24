import { describe, expect, it } from "vitest";
import {
  SHARE_COUNT_PUBLIC_THRESHOLD,
  VIEW_COUNT_PUBLIC_THRESHOLD,
  showPublicShares,
  showPublicViews,
} from "./social-proof";

describe("social-proof thresholds", () => {
  it("uses 15 views / 10 shares thresholds", () => {
    expect(VIEW_COUNT_PUBLIC_THRESHOLD).toBe(15);
    expect(SHARE_COUNT_PUBLIC_THRESHOLD).toBe(10);
  });

  it("hides views at or below 15, shows above", () => {
    expect(showPublicViews(0)).toBe(false);
    expect(showPublicViews(15)).toBe(false);
    expect(showPublicViews(16)).toBe(true);
    expect(showPublicViews(null)).toBe(false);
    expect(showPublicViews(undefined)).toBe(false);
  });

  it("hides shares at or below 10, shows above", () => {
    expect(showPublicShares(0)).toBe(false);
    expect(showPublicShares(10)).toBe(false);
    expect(showPublicShares(11)).toBe(true);
    expect(showPublicShares(null)).toBe(false);
  });
});
