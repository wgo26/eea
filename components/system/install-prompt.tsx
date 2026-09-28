"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, X } from "lucide-react";

const DISMISS_KEY = "eea-pwa-install-dismissed";

/** Minimal shape of the Chromium install prompt event (no DOM lib type). */
type InstallPromptEvent = Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIos(): boolean {
    if (typeof navigator === "undefined") return false;
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
    if (typeof window === "undefined") return true;
    return (
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
}

function wasDismissed(): boolean {
    try {
        return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
        return false;
    }
}

/**
 * "Install the app" banner for the public shell. Chromium fires
 * `beforeinstallprompt` (captured, deferred until the user taps Install);
 * iOS Safari never fires it, so iPhones get the manual Share → Add to Home
 * Screen hint instead. Never renders when already installed, once dismissed,
 * or outside the browsers that support installing — the app feel without the
 * nag.
 *
 * Client-only (mounted with `ssr: false`): eligibility reads localStorage and
 * matchMedia, which have no server answer — rendering this on the server
 * would hydrate a mismatch on every first paint.
 */
export function InstallPrompt({
    siteName,
    copy,
}: {
    siteName: string;
    copy: {
        installTitle: string;
        installBody: string;
        installAction: string;
        installDismiss: string;
        installIosBody: string;
    };
}) {
    const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
    const [closed, setClosed] = useState(false);
    const [busy, setBusy] = useState(false);

    // Eligibility is a pure read of stable client state (install mode +
    // persisted dismissal) — memoized, never set inside the effect below, so
    // the effect only subscribes to the install-prompt event.
    const eligible = useMemo(() => !isStandalone() && !wasDismissed(), []);
    const ios = useMemo(() => isIos(), []);

    useEffect(() => {
        if (!eligible || ios) return;
        const onPrompt = (e: Event) => {
            e.preventDefault();
            setDeferred(e as InstallPromptEvent);
        };
        window.addEventListener("beforeinstallprompt", onPrompt);
        return () => window.removeEventListener("beforeinstallprompt", onPrompt);
    }, [eligible, ios]);

    const visible = !closed && eligible && (ios || deferred !== null);
    if (!visible) return null;

    const dismiss = () => {
        try {
            localStorage.setItem(DISMISS_KEY, "1");
        } catch {
            /* private mode — the banner simply returns next visit */
        }
        setClosed(true);
    };

    const install = async () => {
        if (!deferred) return;
        setBusy(true);
        try {
            await deferred.prompt();
            await deferred.userChoice;
        } catch {
            /* install sheet failed — stay visible */
            setBusy(false);
            return;
        }
        dismiss();
    };

    const body = (ios ? copy.installIosBody : copy.installBody).replace("{site}", siteName);

    return (
        <div
            role="dialog"
            aria-label={copy.installTitle}
            className="hide-while-printing fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-2xl border bg-card p-4 shadow-lg md:bottom-6"
        >
            <div className="flex items-start gap-3">
                {/* Live app icon, not a generic glyph — the install pitch shows
                    exactly what lands on the home screen. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src="/app-icons/icon-192.png"
                    alt=""
                    width={48}
                    height={48}
                    className="h-12 w-12 shrink-0 rounded-xl"
                />
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">{copy.installTitle}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{body}</p>
                    <div className="mt-2.5 flex items-center gap-2">
                        {deferred && !ios ? (
                            <button
                                type="button"
                                onClick={install}
                                disabled={busy}
                                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-50"
                            >
                                <Download className="h-3.5 w-3.5" aria-hidden />
                                {copy.installAction}
                            </button>
                        ) : null}
                        <button
                            type="button"
                            onClick={dismiss}
                            className="inline-flex h-8 items-center rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                        >
                            {copy.installDismiss}
                        </button>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={dismiss}
                    aria-label={copy.installDismiss}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                >
                    <X className="h-4 w-4" aria-hidden />
                </button>
            </div>
        </div>
    );
}
