"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { updateUserPassword, type PasswordResetState } from "@/lib/auth/actions";
import { HumanChallenge, type HumanGateCopy } from "@/components/security/human-challenge";
import { PasswordInput } from "@/components/ui/password-input";
import type { Dictionary, Locale } from "@/lib/i18n";

type Props = {
    locale: Locale;
    copy: Dictionary["auth"]["reset"];
    /** Localized gate copy (`dict.common.human`). */
    humanCopy: HumanGateCopy;
};

export function UpdatePasswordForm({ locale, copy, humanCopy }: Props) {
    const router = useRouter();
    const [state, formAction, pending] = useActionState<PasswordResetState, FormData>(
        updateUserPassword,
        { ok: false },
    );
    const [password, setPassword] = useState("");
    const [attempt, setAttempt] = useState(0);
    const gateKey = state.error ? `${state.error}#${attempt}` : "fresh";

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        setAttempt((a) => a + 1);
    }

    const errorMessage = state.error
        ? ({
              invalid: copy.errorInvalid,
              rate_limited: copy.errorRateLimited,
              captcha: copy.errorCaptcha,
              provider_error: copy.errorGeneric,
          })[state.error]
        : null;

    return (
        <div className="w-full">
            <h1 className="text-center text-2xl font-semibold tracking-tight md:text-3xl">
                {copy.updateTitle}
            </h1>
            <form action={formAction} onSubmit={handleSubmit} className="mt-8 space-y-6">
                {state.error && (
                    <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                        {errorMessage}
                    </div>
                )}

                <div className="space-y-2">
                    <label htmlFor="password" className="text-sm font-medium leading-none">
                        {copy.newPassword}
                    </label>
                    <PasswordInput
                        id="password"
                        name="password"
                        required
                        minLength={8}
                        maxLength={72}
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        showHideLabel={copy.showPassword}
                        hideLabel={copy.hidePassword}
                        className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base md:text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                </div>

                <HumanChallenge key={gateKey} copy={humanCopy} />

                <button
                    type="submit"
                    disabled={pending}
                    aria-busy={pending}
                    className="inline-flex min-h-[44px] w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
                >
                    {pending ? copy.saving : copy.save}
                </button>
            </form>

            {state.ok && (
                <div role="status" className="rounded-md bg-emerald-500/10 p-4 text-center text-sm text-emerald-700">
                    <p className="font-medium">{copy.savedTitle ?? 'Password updated.'}</p>
                    <p className="mt-1.5">{copy.savedBody ?? 'Your password has been changed successfully.'}</p>
                </div>
            )}
        </div>
    );
}
