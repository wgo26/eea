/**
 * Paid promotion plans — pure, client-safe.
 *
 * Cameroon-first pricing in XAF for Mobile Money (MTN / Orange). Prices live
 * here — not in the database — so a price change is a reviewed code change,
 * never a row an operator edits by accident. The webhook verifies the paid
 * amount against these plans before activating anything.
 */

export type SubscriptionPlan = {
  id: string;
  tier: 'pro';
  days: number;
  amountXaf: number;
};

export type PromotionPlan = {
  id: string;
  days: number;
  amountXaf: number;
};

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  { id: 'pro_weekly', tier: 'pro', days: 7, amountXaf: 1000 },
  { id: 'pro_monthly', tier: 'pro', days: 30, amountXaf: 3000 },
];

export const PROMOTION_PLANS: PromotionPlan[] = [
  { id: 'boost_7d', days: 7, amountXaf: 500 },
  { id: 'boost_30d', days: 30, amountXaf: 1500 },
];

export function subscriptionPlan(id: string): SubscriptionPlan | null {
  return SUBSCRIPTION_PLANS.find((p) => p.id === id) ?? null;
}

export function promotionPlan(id: string): PromotionPlan | null {
  return PROMOTION_PLANS.find((p) => p.id === id) ?? null;
}

export type MomoProvider = 'mtn' | 'orange' | 'momo';

/**
 * Best-effort carrier hint from a Cameroon phone number (digits only).
 * MTN CM uses 67/68, Orange CM uses 69/65 — anything else is generic MoMo.
 * This is a UX label for the payment instructions, never an auth decision.
 */
export function detectMomoProvider(raw: string): MomoProvider {
  const digits = raw.replace(/\D/g, '').replace(/^237/, '');
  if (/^6[78]/.test(digits)) return 'mtn';
  if (/^69/.test(digits) || /^65/.test(digits)) return 'orange';
  return 'momo';
}

const MOMO_LABEL: Record<MomoProvider, string> = {
  mtn: 'MTN MoMo',
  orange: 'Orange Money',
  momo: 'Mobile Money',
};

export function momoLabel(provider: MomoProvider): string {
  return MOMO_LABEL[provider];
}

/** Normalize a CM phone number to 9 national digits, or null when unusable. */
export function normalizeMomoNumber(raw: string): string | null {
  const digits = raw.replace(/\D/g, '').replace(/^237/, '');
  return /^6\d{8}$/.test(digits) ? digits : null;
}

/** Unique payment reference (DB-unique column backs this up). */
export function newPaymentReference(): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `EEA-${Date.now().toString(36).toUpperCase()}-${rand}`;
}
