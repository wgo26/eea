import { NextResponse } from "next/server";
import { settleByReference } from "@/lib/billing/actions";
import { logger } from "@/lib/observability/logger";

/**
 * POST /api/billing/campay — Campay Collect status callback.
 *
 * Settlement, not trust: the shared secret (CAMPAY_WEBHOOK_SECRET, configured
 * in the Campay dashboard + env) authenticates the call, and
 * `settleByReference` re-checks the amount against the plan price and only
 * moves `pending` rows — replaying or forging a callback cannot create money.
 *
 * Fail-closed by design: with no secret configured the route answers 503 so
 * a misconfigured deploy can never silently accept callbacks. Until the
 * provider is wired, the staff manual-confirm path in /admin/listings/claims
 * settles payments instead (same activation, audited the same way).
 *
 * Expected body (Campay Collect callback):
 *   { reference, status: "SUCCESSFUL" | "FAILED", amount, operator_reference }
 */
export async function POST(request: Request) {
  const secret = (process.env.CAMPAY_WEBHOOK_SECRET ?? "").trim();
  if (!secret) {
    return NextResponse.json({ error: "Billing webhook not configured." }, { status: 503 });
  }
  const presented =
    request.headers.get("x-campay-secret") ??
    request.headers.get("x-webhook-secret") ??
    "";
  if (presented !== secret) {
    logger.warn("billing/campay", "rejected callback with bad secret");
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  let body: { reference?: unknown; status?: unknown; amount?: unknown; operator_reference?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Bad body." }, { status: 400 });
  }
  const reference = typeof body.reference === "string" ? body.reference : "";
  const status = typeof body.status === "string" ? body.status.toUpperCase() : "";
  const amount = typeof body.amount === "number" ? body.amount : Number(body.amount);
  const providerRef = typeof body.operator_reference === "string" ? body.operator_reference : undefined;
  if (!reference || (status !== "SUCCESSFUL" && status !== "FAILED")) {
    return NextResponse.json({ error: "Bad callback." }, { status: 400 });
  }
  if (status === "FAILED") {
    logger.warn("billing/campay", "provider reported failure", { reference });
    return NextResponse.json({ ok: true });
  }
  const res = await settleByReference({
    reference,
    providerRef,
    amountXaf: Number.isFinite(amount) ? amount : undefined,
  });
  if (!res.ok) {
    logger.warn("billing/campay", "settle refused", { reference, error: res.error });
    return NextResponse.json({ error: res.error }, { status: 422 });
  }
  return NextResponse.json({ ok: true, kind: res.kind });
}
