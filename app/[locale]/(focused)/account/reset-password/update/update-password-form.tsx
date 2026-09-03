"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Dictionary, Locale } from "@/lib/i18n";

type Props = {
    locale: Locale;
    copy: Dictionary["auth"]["reset"];
};

export function UpdatePasswordForm({ locale, copy }: Props) {
    const router = useRouter();
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        setLoading(true);
        setError(null);

        const supabase = createClient();
        const { error } = await supabase.auth.updateUser({ password });

        setLoading(false);
        if (error) {
            setError(error.message);
            return;
        }

        router.push(`/${locale}/account/dashboard`);
        router.refresh();
    }

    return (
        <div className="w-full">
            <h1 className="text-center text-2xl font-semibold tracking-tight md:text-3xl">
                {copy.updateTitle}
            </h1>
            <form onSubmit={handleSubmit} className="mt-8 space-y-6">
                {error && (
                    <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                        {error}
                    </div>
                )}

                <div className="space-y-2">
                    <label htmlFor="password" className="text-sm font-medium leading-none">
                        {copy.newPassword}
                    </label>
                    <input
                        id="password"
                        type="password"
                        required
                        minLength={8}
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex min-h-[44px] w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
                >
                    {loading ? copy.saving : copy.save}
                </button>
            </form>
        </div>
    );
}