"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUpWithPassword, type AuthState } from "@/lib/auth/actions";
import type { Dictionary } from "@/lib/i18n";

type Props = {
    copy: Dictionary["auth"]["signup"];
    nextPath: string;
    loginHref: string;
};

function errorMessage(code: NonNullable<AuthState["error"]>, copy: Props["copy"]): string {
    switch (code) {
        case "invalid":
            return copy.errorInvalid;
        case "email_exists":
            return copy.errorExists;
        case "rate_limited":
            return copy.errorRateLimited;
        default:
            return copy.errorGeneric;
    }
}

export function SignupForm({ copy, nextPath, loginHref }: Props) {
    const [state, formAction, pending] = useActionState<AuthState, FormData>(
        signUpWithPassword,
        { ok: false },
    );

    if (state.ok && state.checkEmail) {
        return (
            <div className="space-y-8">
                <div className="text-center">
                    <h1 className="text-3xl font-bold tracking-tight">{copy.checkEmailTitle}</h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        {copy.checkEmailBody.replace("{email}", state.email ?? "")}
                    </p>
                </div>
                <div className="text-center text-sm">
                    <span className="text-muted-foreground">{copy.haveAccount} </span>
                    <Link href={loginHref} className="text-primary hover:underline">
                        {copy.signIn}
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="text-center">
                <h1 className="text-3xl font-bold tracking-tight">{copy.title}</h1>
                <p className="mt-2 text-sm text-muted-foreground">{copy.subtitle}</p>
            </div>

            <form action={formAction} className="space-y-6">
                <input type="hidden" name="next" value={nextPath} />
                {state.error && (
                    <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                        {errorMessage(state.error, copy)}
                    </div>
                )}

                <div className="space-y-2">
                    <label htmlFor="fullName" className="text-sm font-medium leading-none">
                        {copy.fullName}
                    </label>
                    <input
                        id="fullName"
                        name="fullName"
                        type="text"
                        required
                        minLength={2}
                        maxLength={80}
                        autoComplete="name"
                        placeholder={copy.fullNamePlaceholder}
                        className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                </div>

                <div className="space-y-2">
                    <label htmlFor="email" className="text-sm font-medium leading-none">
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
                        className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                </div>

                <div className="space-y-2">
                    <label htmlFor="password" className="text-sm font-medium leading-none">
                        {copy.password}
                    </label>
                    <input
                        id="password"
                        name="password"
                        type="password"
                        required
                        minLength={8}
                        maxLength={72}
                        autoComplete="new-password"
                        placeholder="••••••••"
                        className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                    <p className="text-xs text-muted-foreground">{copy.passwordHint}</p>
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
                <span className="text-muted-foreground">{copy.haveAccount} </span>
                <Link href={loginHref} className="text-primary hover:underline">
                    {copy.signIn}
                </Link>
            </div>
        </div>
    );
}
