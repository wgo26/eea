"use client";

import { useState } from "react";
import { Zap } from "lucide-react";
import {
  createPromotionIntent,
  createSubscriptionIntent,
  type BillingState,
} from "@/lib/billing/actions";
import { PROMOTION_PLANS, SUBSCRIPTION_PLANS } from "@/lib/billing/plans";
import type { Dictionary } from "@/lib/i18n";

type Copy = Dictionary["professionals"];

const inputCls =
  "h-10 min-h-[44px] w-full rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";
const payBtn =
  "inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400 disabled:opacity-50";

function planLabel(copy: Copy, id: string): string {
  switch (id) {
    case "pro_weekly":
      return copy.planProWeekly;
    case "pro_monthly":
      return copy.planProMonthly;
    case "boost_7d":
      return copy.planBoost7;
    case "boost_30d":
      return copy.planBoost30;
    default:
      return id;
  }
}

/** Owner-only MoMo checkout: plan picker + number → pending intent + reference. */
export function BillingPanel({
  copy,
  mode,
  targetId,
  billing,
}: {
  copy: Copy;
  /** What the payment buys. */
  mode: "subscription" | "promotion";
  /** businessId for subscriptions, contentItemId for promotions. */
  targetId: string;
  /** Owner billing state (subscriptions only; promotions show per-listing state inline). */
  billing?: BillingState | null;
}) {
  const plans = mode === "subscription" ? SUBSCRIPTION_PLANS : PROMOTION_PLANS;
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [number, setNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const plan = plans.find((p) => p.id === planId) ?? plans[0]!;

  async function pay() {
    if (busy) return;
    if (!number.trim()) {
      setNotice(copy.momoNumberBad);
      return;
    }
    setBusy(true);
    const res =
      mode === "subscription"
        ? await createSubscriptionIntent({ businessId: targetId, planId: plan.id, momoNumber: number })
        : await createPromotionIntent({ contentItemId: targetId, planId: plan.id, momoNumber: number });
    setBusy(false);
    if (!res.ok) {
      setNotice(res.error);
      return;
    }
    setNotice(
      copy.intentDone
        .replace("{amount}", String(res.amountXaf))
        .replace("{provider}", res.provider)
        .replace("{ref}", res.reference),
    );
  }

  return (
    <div className="grid gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">
      <h3 className="flex items-center gap-2 text-sm font-extrabold">
        <Zap className="h-4 w-4 text-amber-600" aria-hidden />
        {copy.billingTitle}
      </h3>
      <p className="text-xs leading-relaxed text-muted-foreground">{copy.billingIntro}</p>
      {mode === "subscription" && billing?.subscription ? (
        <p role="status" className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
          {copy.activeUntil.replace(
            "{date}",
            billing.subscription.endsAt
              ? new Date(billing.subscription.endsAt).toLocaleDateString()
              : "—",
          )}
        </p>
      ) : null}
      <label className="grid gap-1 text-xs font-medium">
        <select value={planId} onChange={(e) => setPlanId(e.target.value)} className={inputCls}>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {planLabel(copy, p.id)} — {p.amountXaf} XAF
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-medium">
        {copy.momoNumber}
        <input
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          inputMode="tel"
          placeholder="67 12 34 56"
          maxLength={20}
          className={inputCls}
        />
      </label>
      <button type="button" onClick={() => void pay()} disabled={busy} className={payBtn}>
        {busy ? copy.paying : copy.payCta.replace("{amount}", String(plan.amountXaf))}
      </button>
      {notice ? (
        <p role="status" className="text-xs leading-relaxed text-muted-foreground">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
