"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Dictionary, Locale } from "@/lib/i18n";

type Props = {
    locale: Locale;
    copy: Dictionary["auth"]["signup"];
    nextPath: string;
    loginHref: string;
};

export function SignupForm({ locale, copy, nextPath, loginHref }: Props) {
    const router = useRouter();
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    async function handleSignup(event: React.FormEvent) {
        event.preventDefault();
        setLoading(true);
        setError(null);
        setSuccess(false);

        const supabase = createClient();
        const { data, error: signUpError } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { full_name: fullName },
                // Land the confirmation link in the locale-aware callback,
                // which then returns the user to login with `next` intact.
                emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(`/${locale}/account/login?next=${encodeURIComponent(nextPath)}`)}`,
            },
        });

        if (signUpError) {
            setError(signUpError.message);
            setLoading(false);
            return;
        }

        if (data.user) {
            const { error: profileError } = await supabase.from("profiles").insert({
                id: data.user.id,
                full_name: fullName,
                email: email,
            });
            if (profileError) console.error("Profile creation error:", profileError);
        }

        setSuccess(true);
        setLoading(false);
        // Give the user time to read the confirmation, then hand off to login.
        window.setTimeout(() => {
            router.push(`/${locale}/account/login?next=${encodeURIComponent(nextPath)}`);
        }, 2500);
    }

    return (
        <div className="space-y-8">
            <div className="text-center">
                <h1 className="text-3xl font-bold tracking-tight">{copy.title}</h1>
                <p className="mt-2 text-sm text-muted-foreground">{copy.subtitle}</p>
            </div>

            <form onSubmit={handleSignup} className="space-y-6">
                {error && (
                    <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                        {error}
                    </div>
                )}
                {success && (
                    <div role="status" className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-600">
                        {copy.success}
                    </div>
                )}
                {/* fields */}

                <div className="space-y-2">
                    <label htmlFor="fullName" className="text-sm font-medium leading-none">
                        {copy.fullName}
                    </label>
                    <input
                        id="fullName"
                        type="text"
                        required
                        autoComplete="name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
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
                        type="email"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
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
                        type="password"
                        required
                        minLength={6}
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                    <p className="text-xs text-muted-foreground">{copy.passwordHint}</p>
                </div>

                <button
                    type="submit"
                    disabled={loading || success}
                    className="inline-flex min-h-[44px] w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
                >
                    {loading ? copy.submitting : copy.submit}
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