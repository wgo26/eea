"use client";

import { useEffect, useRef, useState } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

declare global {
    interface Window {
        turnstile?: {
            render: (element: HTMLElement, options: Record<string, unknown>) => string;
            remove: (widgetId: string) => void;
            reset: (widgetId?: string) => void;
        };
    }
}

/** Loads the Turnstile script once per page, then runs the callback. */
function loadTurnstile(onload: () => void, onError?: () => void): void {
    if (window.turnstile) {
        onload();
        return;
    }
    let settled = false;
    const done = (fn?: () => void) => {
        if (settled) return;
        settled = true;
        fn?.();
    };
    let script = document.querySelector<HTMLScriptElement>('script[data-turnstile="1"]');
    if (!script) {
        script = document.createElement("script");
        script.src = SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        script.dataset.turnstile = "1";
        document.head.appendChild(script);
    }
    script.onerror = () => done(onError);
    // Give up visibly instead of hanging on the spinner when the CDN is
    // blocked (ad-blocker, offline, CSP): 10s with no turnstile global.
    window.setTimeout(() => {
        if (!window.turnstile) done(onError);
    }, 10_000);
    const previousOnload = script.onload;
    script.onload = (event) => {
        previousOnload?.call(script, event);
        done(onload);
    };
}

/**
 * Cloudflare Turnstile challenge (features.md: "CAPTCHA or equivalent at
 * submission"). On success injects a hidden `cf-turnstile-response` input
 * that the server actions verify with TURNSTILE_SECRET_KEY
 * (lib/security/turnstile.ts). Set both keys or neither:
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY (client widget) + TURNSTILE_SECRET_KEY
 * (server). The public key is baked in at build time — setting it after
 * `next build` requires a rebuild to take effect.
 *
 * Failure modes are deliberately visible: a missing site key, a blocked
 * script load, or a challenge error renders an explanatory note instead of
 * failing silently (the server is fail-closed in production, so a silent
 * widget would make every submission fail with "human-verification").
 */
export function TurnstileWidget() {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);
    const [token, setToken] = useState("");
    const [status, setStatus] = useState<"loading" | "ready" | "failed" | "missing">(
        SITE_KEY ? "loading" : "missing",
    );

    useEffect(() => {
        if (!SITE_KEY || !containerRef.current) return;
        let cancelled = false;

        const resetWidget = () => {
            const id = widgetIdRef.current;
            if (id && window.turnstile?.reset) {
                try {
                    window.turnstile.reset(id);
                } catch {
                    /* already gone */
                }
            }
        };

        const render = () => {
            if (cancelled || widgetIdRef.current) return;
            const element = containerRef.current;
            if (!element || !window.turnstile) {
                if (!cancelled) setStatus("failed");
                return;
            }
            try {
                widgetIdRef.current = window.turnstile.render(element, {
                    sitekey: SITE_KEY,
                    callback: (value: string) => {
                        setToken(value);
                        setStatus("ready");
                    },
                    "expired-callback": () => {
                        setToken("");
                        resetWidget();
                    },
                    "error-callback": () => {
                        setToken("");
                        setStatus("failed");
                    },
                    theme: "auto",
                });
                if (!cancelled) setStatus("ready");
            } catch {
                if (!cancelled) setStatus("failed");
            }
        };

        loadTurnstile(render, () => {
            if (!cancelled) setStatus("failed");
        });

        return () => {
            cancelled = true;
            if (widgetIdRef.current && window.turnstile) {
                try {
                    window.turnstile.remove(widgetIdRef.current);
                } catch {
                    /* already gone */
                }
                widgetIdRef.current = null;
            }
        };
        // Render once per mount. Parents remount the widget (via `key`) after
        // a failed submit because Turnstile tokens are single-use — a spent
        // token must never be replayed.
    }, []);

    if (!SITE_KEY) {
        return (
            <div className="space-y-2">
                <p
                    role="alert"
                    data-turnstile="missing-key"
                    className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                >
                    Human verification is temporarily unavailable. Please try again later or
                    contact support if this persists.
                </p>
                <input type="hidden" name="cf-turnstile-response" value="" />
            </div>
        );
    }

    if (status === "failed") {
        return (
            <div className="space-y-2">
                <div ref={containerRef} className="overflow-x-auto" />
                <p role="alert" className="text-xs text-muted-foreground">
                    The verification widget could not load (network or content-blocker).
                    Disable blockers for this site and{" "}
                    <button
                        type="button"
                        className="font-medium text-primary hover:underline"
                        onClick={() => window.location.reload()}
                    >
                        reload the page
                    </button>{" "}
                    to continue.
                </p>
                <input type="hidden" name="cf-turnstile-response" value={token} />
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {/* Turnstile renders a fixed 300px widget; on viewports narrower
                than 300px + page padding (iPhone SE in the focused shell) the
                checkbox would sit partially off-screen and be untappable —
                let the strip scroll instead. */}
            <div ref={containerRef} className="overflow-x-auto" />
            <input type="hidden" name="cf-turnstile-response" value={token} />
        </div>
    );
}