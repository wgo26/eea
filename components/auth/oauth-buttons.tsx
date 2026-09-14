"use client";

import { signInWithOAuth, type OAuthProvider } from "@/lib/auth/actions";

type OAuthCopy = {
    orContinueWith: string;
    continueWithGoogle: string;
    oauthUnavailable: string;
};

/**
 * Social login buttons (currently Google). Rendered only when
 * NEXT_PUBLIC_OAUTH_PROVIDERS enables the provider AND the Supabase
 * dashboard has it configured — otherwise nothing renders, so there is
 * never a dead button.
 */
export function OAuthButtons({
    copy,
    nextPath,
    providers,
}: {
    copy: OAuthCopy;
    nextPath: string;
    providers: OAuthProvider[];
}) {
    if (providers.length === 0) return null;

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" aria-hidden />
                {copy.orContinueWith}
                <span className="h-px flex-1 bg-border" aria-hidden />
            </div>
            <div className="grid gap-2">
                {providers.includes("google") ? (
                    <button
                        type="button"
                        onClick={() => void signInWithOAuth("google", nextPath)}
                        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
                            <path
                                fill="#4285F4"
                                d="M23.5 12.3c0-.9-.1-1.5-.3-2.3H12v4.5h6.5c-.1 1.1-.8 2.7-2.4 3.8l-.1.1 3.5 2.7.2.1c2.2-2 3.8-5 3.8-8.9z"
                            />
                            <path
                                fill="#34A853"
                                d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.1 1.2-3.2 0-5.9-2.1-6.8-5l-.1.1-3.6 2.8-.1.1C3.5 21.4 7.5 24 12 24z"
                            />
                            <path
                                fill="#FBBC05"
                                d="M5.2 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.7.4-2.4l-.1-.1-3.6-2.8-.1.1C.5 8.6 0 10.2 0 12s.5 3.4 1.4 4.9l3.8-2.5z"
                            />
                            <path
                                fill="#EA4335"
                                d="M12 4.7c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1.1 15.2 0 12 0 7.5 0 3.5 2.6 1.4 6.7l3.8 2.9c.9-2.9 3.6-4.9 6.8-4.9z"
                            />
                        </svg>
                        {copy.continueWithGoogle}
                    </button>
                ) : null}
            </div>
        </div>
    );
}
