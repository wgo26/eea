"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signInWithPassword, type AuthState } from "@/lib/auth/actions";
import type { Dictionary } from "@/lib/i18n";

type Props = {
    copy: Dictionary["auth"]["login"];
    /** Validated, locale-prefixed destination carried through the flow. */
    nextPath: string;
    resetHref: string;
    signupHref: string;
};

function errorMessage(code: NonNullable<AuthState["error"]>, copy: Props["copy"]): string {
    switch (code) {
        case "invalid":
            return copy.errorInvalid;
        case "invalid_credentials":
            return copy.errorCredentials;
        case "not_confirmed":
            return copy.errorNotConfirmed;
        case "rate_limited":
            return copy.errorRateLimited;
        case "account_disabled":
            return copy.errorAccountDisabled;
        default:
            return copy.errorGeneric;
    }
}

export function LoginForm({ copy, nextPath, resetHref, signupHref }: Props) {
    const [state, formAction, pending] = useActionState<AuthState, FormData>(
        signInWithPassword,
        { ok: false },
    );

    return (
        <div className="space-y-8">
            <div className="text-center">
                <h1 className="text-3xl font-bold tracking-tight">{copy.title}</h1>
                <p className="mt-2 text-sm text-muted-foreground">{copy.subtitle}</p>
            </div>

            <form action={formAction} className="space-y-6">
                <input type="hidden" name="next" value={nextPath} />
                {state.error && (
                    <div
                        role="alert"
                        className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
                    >
                        {errorMessage(state.error, copy)}
                    </div>
                )}

                <div className="space-y-2">
                    <label
                        htmlFor="email"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                        {copy.email}
                    </label>
                    <input
                        id="email"
                        name="email"
                        type="email"
                        required
                        autoComplete="email"
                        maxLength={254}
                        placeholder={copy.emailPlaceholder}
                        className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                </div>

                <div className="space-y-2">
                    <label
                        htmlFor="password"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                        {copy.password}
                    </label>
                    <input
                        id="password"
                        name="password"
                        type="password"
                        required
                        autoComplete="current-password"
                        maxLength={256}
                        placeholder={copy.passwordPlaceholder}
                        className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                </div>

                <button
                    type="submit"
                    disabled={pending}
                    aria-busy={pending}
                    className="inline-flex min-h-[44px] w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
                >
                    {pending ? copy.submitting : copy.submit}
                </button>
            </form>

            <div className="text-center text-sm">
                <Link href={resetHref} className="text-primary hover:underline">
                    {copy.forgot}
                </Link>
            </div>

            <div className="text-center text-sm">
                <span className="text-muted-foreground">{copy.noAccount} </span>
                <Link href={signupHref} className="text-primary hover:underline">
                    {copy.signUp}
                </Link>
            </div>
        </div>
    );
}
