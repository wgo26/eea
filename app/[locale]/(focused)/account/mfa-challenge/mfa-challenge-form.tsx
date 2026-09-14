"use client";

import { useActionState } from "react";
import Link from "next/link";
import { verifyMfaChallenge } from "@/lib/auth/mfa";
import type { Dictionary } from "@/lib/i18n";

type Props = {
    copy: Dictionary["auth"]["mfa"];
    nextPath: string;
};

function errorMessage(error: string | undefined, copy: Props["copy"]): string | null {
    if (!error) return null;
    if (error === "invalid") return copy.errorInvalid;
    return copy.errorGeneric;
}

export function MfaChallengeForm({ copy, nextPath }: Props) {
    const [state, formAction, pending] = useActionState(verifyMfaChallenge, { ok: false });

    return (
        <div className="space-y-8">
            <div className="text-center">
                <h1 className="text-3xl font-bold tracking-tight">{copy.challengeTitle}</h1>
                <p className="mt-2 text-sm text-muted-foreground">{copy.challengeBody}</p>
            </div>

            <form action={formAction} className="space-y-6">
                <input type="hidden" name="next" value={nextPath} />
                {state.error ? (
                    <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                        {errorMessage(state.error, copy)}
                    </div>
                ) : null}

                <div className="space-y-2">
                    <label htmlFor="code" className="text-sm font-medium leading-none">
                        {copy.codeLabel}
                    </label>
                    <input
                        id="code"
                        name="code"
                        type="text"
                        required
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        placeholder={copy.codePlaceholder}
                        className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-center text-lg tracking-[0.5em] ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                </div>

                <button
                    type="submit"
                    disabled={pending}
                    aria-busy={pending}
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
                >
                    {pending ? copy.verifying : copy.verify}
                </button>
            </form>

            <div className="text-center text-sm">
                <Link href="../login" className="text-primary hover:underline">
                    {copy.backToLogin}
                </Link>
            </div>
        </div>
    );
}
