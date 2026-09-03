"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Dictionary, Locale } from "@/lib/i18n";

type Props = {
    locale: Locale;
    copy: Dictionary["auth"]["login"];
    /** Validated, locale-prefixed destination carried through the flow. */
    nextPath: string;
    resetHref: string;
    signupHref: string;
};

export function LoginForm({ locale, copy, nextPath, resetHref, signupHref }: Props) {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleLogin(event: React.FormEvent) {
        event.preventDefault();
        setLoading(true);
        setError(null);

        const supabase = createClient();
        const { error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
            setError(error.message);
            setLoading(false);
            return;
        }

        // Role-aware landing; the `next` target survives via the query string.
        router.push(`/${locale}/auth/landing?next=${encodeURIComponent(nextPath)}`);
        router.refresh();
    }

    return (
        <div className="space-y-8">
            <div className="text-center">
                <h1 className="text-3xl font-bold tracking-tight">{copy.title}</h1>
                <p className="mt-2 text-sm text-muted-foreground">{copy.subtitle}</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-6">
                {error && (
                    <div
                        role="alert"
                        className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
                    >
                        {error}
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
                        type="email"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
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
                        type="password"
                        required
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={copy.passwordPlaceholder}
                        className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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