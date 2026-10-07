import { describe, expect, it } from "vitest";
import {
  detectMomoProvider,
  newPaymentReference,
  normalizeMomoNumber,
  promotionPlan,
  subscriptionPlan,
} from "./plans";

describe("billing plans", () => {
  it("resolves known plans and rejects unknown ones", () => {
    expect(subscriptionPlan("pro_monthly")?.amountXaf).toBe(3000);
    expect(promotionPlan("boost_7d")?.days).toBe(7);
    expect(subscriptionPlan("nope")).toBeNull();
    expect(promotionPlan("nope")).toBeNull();
  });

  it("detects Cameroon carriers best-effort", () => {
    expect(detectMomoProvider("+237 67 12 34 56")).toBe("mtn");
    expect(detectMomoProvider("690123456")).toBe("orange");
    expect(detectMomoProvider("221771234567")).toBe("momo");
  });

  it("normalizes CM numbers and rejects the rest", () => {
    expect(normalizeMomoNumber("+237691234567")).toBe("691234567");
    expect(normalizeMomoNumber("123")).toBeNull();
  });

  it("mints unique references", () => {
    const refs = new Set(Array.from({ length: 50 }, newPaymentReference));
    expect(refs.size).toBe(50);
    expect(newPaymentReference().startsWith("EEA-")).toBe(true);
  });
});
