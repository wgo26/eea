"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitArticleCorrection } from "@/lib/public/actions";
import { TurnstileWidget } from "@/components/security/turnstile-widget";
import type { SubmitState } from "@/lib/public/types";
import { localePath } from "@/lib/i18n/urls";
import type { Dictionary, Locale } from "@/lib/i18n";

type CorrectionFormProps = {
    slug: string;
    dict: Dictionary;
    locale: Locale;
};

export function CorrectionForm({ slug, dict, locale }: CorrectionFormProps) {
    const [state, formAction, pending] = useActionState<SubmitState, FormData>(
        submitArticleCorrection,
        { ok: false },
    );
    const n = dict.news;

    if (state.ok) {
        return (
            <div className="rounded-2xl border bg-card p-8 text-center">
                <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" aria-hidden />
                <h2 className="mt-3 text-lg font-bold">{n.correctionThankYou}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{n.correctionThankYouBody}</p>
                <div className="mt-6">
                    <Button render={<Link href={localePath(locale, `/news/${slug}`)} />}>
                        {n.correctionBackToArticle}
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <form action={formAction} className="space-y-5 rounded-2xl border bg-card p-6 shadow-sm">
            <input type="hidden" name="slug" value={slug} />

            {/* Honeypot field */}
            <div className="hidden" aria-hidden="true">
                <label htmlFor="hp_website">Website</label>
                <input type="text" id="hp_website" name="website" tabIndex={-1} autoComplete="off" />
            </div>

            {state.error ? (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                    {state.error === "rate_limited"
                        ? "Too many submissions. Please try again later."
                        : state.error === "captcha"
                          ? "Security check failed. Please refresh and try again."
                          : "An error occurred while submitting your correction. Please verify the fields."}
                </div>
            ) : null}

            <div className="space-y-1.5">
                <Label htmlFor="corr_name">{n.correctionName}</Label>
                <Input
                    id="corr_name"
                    name="name"
                    placeholder={n.correctionNamePlaceholder}
                    required
                    maxLength={100}
                />
            </div>

            <div className="space-y-1.5">
                <Label htmlFor="corr_email">{n.correctionEmail}</Label>
                <Input
                    id="corr_email"
                    name="email"
                    type="email"
                    placeholder={n.correctionEmailPlaceholder}
                    required
                    maxLength={255}
                />
            </div>

            <div className="space-y-1.5">
                <Label htmlFor="corr_wrong">{n.correctionWrong}</Label>
                <Textarea
                    id="corr_wrong"
                    name="wrong"
                    rows={4}
                    placeholder={n.correctionWrongPlaceholder}
                    required
                    maxLength={2000}
                />
            </div>

            <div className="space-y-1.5">
                <Label htmlFor="corr_suggested">{n.correctionSuggested}</Label>
                <Textarea
                    id="corr_suggested"
                    name="suggested"
                    rows={3}
                    placeholder={n.correctionSuggestedPlaceholder}
                    maxLength={2000}
                />
            </div>

            <TurnstileWidget />

            <Button type="submit" disabled={pending} className="w-full">
                {pending ? (
                    <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        <span>Submitting...</span>
                    </>
                ) : (
                    <>
                        <Send className="h-4 w-4" aria-hidden />
                        <span>{n.correctionSubmit}</span>
                    </>
                )}
            </Button>
        </form>
    );
}
