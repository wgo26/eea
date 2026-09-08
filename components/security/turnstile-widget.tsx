"use client";

import { useEffect, useRef, useState } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

declare global {
    interface Window {
        turnstile?: {
            render: (element: HTMLElement, options: Record<string, unknown>) => string;
            remove: (widgetId: string) => void;
        };
    }
}

/** Loads the Turnstile script once per page, then runs the callback. */
function loadTurnstile(onload: () => void): void {
    if (window.turnstile) {
        onload();
        return;
    }
    let script = document.querySelector<HTMLScriptElement>('script[data-turnstile="1"]');
    if (!script) {
        script = document.createElement("script");
        script.src = SCRIPT_SRC;
        script.async = true;
        script.dataset.turnstile = "1";
        document.head.appendChild(script);
    }
    const previousOnload = script.onload;
    script.onload = (event) => {
        previousOnload?.call(script, event);
        onload();
    };
}

/**
 * Cloudflare Turnstile challenge (features.md: "CAPTCHA or equivalent at
 * submission"). Renders nothing when NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset
 * — the pre-production default — and on success injects a hidden
 * `cf-turnstile-response` input that the server actions verify with
 * TURNSTILE_SECRET_KEY (lib/security/turnstile.ts). Set both keys or neither.
 */
export function TurnstileWidget() {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);
    const [token, setToken] = useState("");

    useEffect(() => {
        if (!SITE_KEY || !containerRef.current) return;
        let cancelled = false;

        const render = () => {
            if (cancelled || widgetIdRef.current) return;
            const element = containerRef.current;
            if (!element || !window.turnstile) return;
            widgetIdRef.current = window.turnstile.render(element, {
                sitekey: SITE_KEY,
                callback: (value: string) => setToken(value),
                "expired-callback": () => setToken(""),
                "error-callback": () => setToken(""),
                theme: "auto",
            });
        };

        loadTurnstile(render);

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
    }, []);

    if (!SITE_KEY) return null;

    return (
        <div className="space-y-2">
            <div ref={containerRef} />
            <input type="hidden" name="cf-turnstile-response" value={token} />
        </div>
    );
}