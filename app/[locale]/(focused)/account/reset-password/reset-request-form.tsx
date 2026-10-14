"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { requestPasswordReset, type PasswordResetState } from "@/lib/auth/actions";
import { TurnstileWidget } from "@/components/security/turnstile-widget";
import type { Dictionary } from "@/lib/i18n";

type Props = {
    copy: Dictionary["auth"]["reset"];
    loginHref: string;
};

export function ResetRequestForm({ copy, loginHref }: Props) {
    const [state, formAction, pending] = useActionState<PasswordResetState, FormData>(
        requestPasswordReset,
        { ok: false },
    );
    const [attempt, setAttempt] = useState(0);
    const turnstileKey = state.error ? `${state.error}#${attempt}` : "fresh";

    const errorMessage = state.error
        ? ({
              invalid: copy.errorInvalid,
              rate_limited: copy.errorRateLimited,
              captcha: copy.errorCaptcha,
              provider_error: copy.errorGeneric,
          })[state.error]
        : null;

    return (
        <div className="space-y-8">
            <div className="text-center">
                <h1 className="text-3xl font-bold tracking-tight">{copy.requestTitle}</h1>
                <p className="mt-2 text-sm text-muted-foreground">{copy.requestBody}</p>
            </div>

            {state.ok ? (
                <div role="status" className="rounded-md bg-emerald-500/10 p-4 text-center text-sm text-emerald-700">
                    <p className="font-medium">{copy.sentTitle}</p>
                    <p className="mt-1.5">{copy.sentBody}</p>
                </div>
            ) : (
                <form action={formAction} onSubmit={() => setAttempt((value) => value + 1)} className="space-y-6">
                    {errorMessage && (
                        <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                            {errorMessage}
                        </div>
                    )}

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
                            className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base md:text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        />
                    </div>

                    <TurnstileWidget key={turnstileKey} />

                    <button
                        type="submit"
                        disabled={pending}
                        aria-busy={pending}
                        className="inline-flex min-h-[44px] w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
                    >
                        {pending ? copy.submitting : copy.submit}
                    </button>
                </form>
            )}

            <div className="text-center text-sm">
                <Link href={loginHref} className="text-primary hover:underline">
                    {copy.backToLogin}
                </Link>
            </div>
        </div>
    );
}