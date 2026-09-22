import { NextResponse } from "next/server";

import { bearerMatches } from "@/lib/security/secrets";
import { logger } from "@/lib/observability/logger";

/**
 * Phase 0 — single fail-closed guard for every `/api/cron/*` route.
 *
 * Contract (no drift between the six jobs):
 *  - `CRON_SECRET` set + `Authorization: Bearer <secret>` matches → proceed (null).
 *  - `CRON_SECRET` set + missing/wrong bearer → 401.
 *  - `CRON_SECRET` unset + production → 500 (fail closed, alerts fire).
 *  - `CRON_SECRET` unset + non-production → 401 unless the operator
 *    explicitly opts into local drills with `ALLOW_UNAUTH_CRON=1`
 *    (previously every route silently ran open in dev — anyone on the
 *    network could trigger backups, dumps and mail fan-out).
 */
export function requireCronSecret(
    request: Request,
    scope: string,
    correlationId: string,
): NextResponse | null {
    const cronSecret = process.env.CRON_SECRET;
    const allowUnauthDrill =
        process.env.NODE_ENV !== "production" &&
        process.env.ALLOW_UNAUTH_CRON === "1";

    if (!cronSecret) {
        logger.error(`cron/${scope}`, "CRON_SECRET not configured", {
            correlationId,
        });
        if (allowUnauthDrill) {
            logger.warn(`cron/${scope}`, "running without CRON_SECRET (explicit ALLOW_UNAUTH_CRON=1 drill)", {
                correlationId,
            });
            return null;
        }
        // Fail closed everywhere by default — including non-production —
        // unless the drill opt-in above is set. Production keeps the 500
        // status so uptime monitors alert; non-production returns 401 so a
        // misconfigured dev host cannot be driven into spend/spam.
        const status = process.env.NODE_ENV === "production" ? 500 : 401;
        return NextResponse.json(
            { ok: false, error: `Cron not configured (${scope})` },
            { status },
        );
    }

    if (!bearerMatches(request.headers.get("authorization"), cronSecret)) {
        logger.warn(`cron/${scope}`, "unauthorized invocation", { correlationId });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return null;
}
