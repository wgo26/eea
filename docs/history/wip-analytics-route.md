# Parked WIP: first-party pageview analytics route

**Status:** parked (not shipped) on 2026-09-21 during the release-integrity P0 pass.
**Original path:** `app/api/analytics/route.ts` (untracked working-tree file)

## Why it was parked

The route was written on 2026-09-21 22:49 and removed from the build path the same
day. It is **not** a judgement on the feature — it is incomplete work that could not
stay in the tree as-is:

1. **It does not compile.** It inserts into `public.analytics_events`, a table no
   migration creates, so the generated `Database` types have no such relation
   (6 × `tsc` errors). `tsconfig.json` includes `**/*.ts`, so this single file blocked
   `npx tsc --noEmit` → `npm run check` → the CI "Typecheck" step.
2. **It has no caller.** No client code, page or service worker posts to
   `/api/analytics`, so there is no beacon to exercise it.
3. **It is unsafe as written.** It is an unauthenticated `POST` that writes to the
   database through the **service-role** client, with no rate limit, no input
   validation, and it logs the raw driver error.

## Before this ships, it needs

- A migration creating `analytics_events` (+ indexes, RLS enabled, and **no**
  `anon`/`authenticated` grants — only the service role should write it). Migrations
  are applied by hand (`.github/workflows/db-push.yml` is `workflow_dispatch`-only,
  dry-run by default), then `npm run types:db` to regenerate
  `lib/supabase/database.types.ts`.
- A decision on the privacy surface. `path`, `referrer` and `user_agent` collected
  from unauthenticated visitors is personal data under GDPR; this needs a retention
  window, a documented lawful basis, and alignment with the existing cookie banner
  before it is switched on.
- Hardening: `checkRateLimit("analytics", { max, windowMs, policy: "fail-closed" })`
  before the insert, a bounded/validated payload, and no raw driver error in logs.
- The client beacon that actually calls it.

## Verbatim source (as parked)

```ts
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { path, referrer, userAgent, type = "pageview" } = body;

    const supabase = createAdminClient();

    // We insert into a generic analytics_events table.
    // This allows us to track pageviews without heavy external dependencies.
    const { error } = await supabase.from("analytics_events").insert({
      path,
      referrer,
      user_agent: userAgent,
      event_type: type,
      created_at: new Date().toISOString(),
    });

    if (error) {
      logger.error("analytics", "Failed to insert event", { error });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("analytics", "Failed to process analytics event", { error });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
```

## To restore

Recreate `app/api/analytics/route.ts` from the block above, then work through the
"Before this ships" list. Nothing else was changed to park it.
