"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Dictionary, Locale } from "@/lib/i18n";

type Props = {
    locale: Locale;
    copy: Dictionary["auth"]["reset"];
    loginHref: string;
};

export function ResetRequestForm({ locale, copy, loginHref }: Props) {
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sent, setSent] = useState(false);

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        setLoading(true);
        setError(null);

        const supabase = createClient();
        const updatePath = `/${locale}/account/reset-password/update`;
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            // Locale-aware recovery landing (the callback re-prefixes with
            // the cookie's locale; `next` is validated there).
            redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(updatePath)}`,
        });

        setLoading(false);
        if (error) {
            setError(error.message);
            return;
        }
        setSent(true);
    }

    return (
        <div className="space-y-8">
            <div className="text-center">
                <h1 className="text-3xl font-bold tracking-tight">{copy.requestTitle}</h1>
                <p className="mt-2 text-sm text-muted-foreground">{copy.requestBody}</p>
            </div>

            {sent ? (
                <div role="status" className="rounded-md bg-emerald-500/10 p-4 text-center text-sm text-emerald-700">
                    <p className="font-medium">{copy.sentTitle}</p>
                    <p className="mt-1.5">{copy.sentBody.replace("{email}", email)}</p>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                    {error && (
                        <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                            {error}
                        </div>
                    )}

                    <div className="space-y-2">
                        <label htmlFor="email" className="text-sm font-medium leading-none">
                            {copy.email}
                        </label>
                        <input
                            id="email"
                            type="email"
                            required
                            autoComplete="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder={copy.emailPlaceholder}
                            className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="inline-flex min-h-[44px] w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
                    >
                        {loading ? copy.submitting : copy.submit}
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