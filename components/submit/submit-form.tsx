"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitStory } from "@/lib/public/actions";
import { TurnstileWidget } from "@/components/security/turnstile-widget";
import type { SubmitState } from "@/lib/public/types";
import { localePath } from "@/lib/i18n/urls";
import { useLocaleFromPath } from "@/components/site-header";
import { noticeTypeLabel, NOTICE_TYPE_META } from "@/lib/notice-types";
import type { Dictionary } from "@/lib/i18n";

export type SubmitType =
    | "photo-story"
    | "news"
    | "culture"
    | "notice"
    | "buy-sell";

const TYPE_TO_DB: Record<SubmitType, string> = {
    "photo-story": "photo_story",
    news: "news",
    culture: "culture",
    notice: "notice",
    "buy-sell": "buy_sell",
};

const CURRENCIES = ["XAF", "XOF", "CDF", "USD", "EUR", "NGN", "GHS"];

const NOTICE_TYPES = Object.keys(NOTICE_TYPE_META);

const BUY_SELL_CATEGORIES = [
    "phones",
    "vehicles",
    "property",
    "furniture",
    "fashion",
    "jobs",
    "agriculture",
    "household",
    "business",
    "other",
] as const;

function Field({
    label,
    htmlFor,
    children,
    hint,
}: {
    label: string;
    htmlFor: string;
    children: React.ReactNode;
    hint?: string;
}) {
    return (
        <div className="space-y-1.5">
            <Label htmlFor={htmlFor}>{label}</Label>
            {children}
            {hint ? (
                <p className="text-xs text-muted-foreground">{hint}</p>
            ) : null}
        </div>
    );
}

export function SubmitForm({ type, dict }: { type: SubmitType; dict: Dictionary }) {
    const router = useRouter();
    const locale = useLocaleFromPath();
    const [state, formAction, pending] = useActionState<SubmitState, FormData>(
        submitStory,
        { ok: false },
    );
    const f = dict.submit.fields;

    React.useEffect(() => {
        if (state.ok) router.push(localePath(locale, "/submit/confirmation"));
    }, [state.ok, router, locale]);

    if (state.ok) {
        return (
            <div className="rounded-2xl border bg-card p-8 text-center">
                <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" aria-hidden />
                <p className="mt-3 font-bold">{dict.submit.successTitle}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                    {dict.submit.successBody}
                </p>
                <Button render={<Link href={localePath(locale, "/submit/confirmation")} />} className="mt-4">
                    {dict.submit.successTitle}
                </Button>
            </div>
        );
    }

    return (
        <form action={formAction} className="space-y-5">
            <input type="hidden" name="submissionType" value={TYPE_TO_DB[type]} />

            {/* Common contact fields */}
            <div className="grid gap-4 sm:grid-cols-2">
                <Field label={f.contributorName} htmlFor="contributorName">
                    <Input
                        id="contributorName"
                        name="contributorName"
                        required
                        placeholder={f.contributorNamePlaceholder}
                    />
                </Field>
                <Field label={f.email} htmlFor="email">
                    <Input
                        id="email"
                        name="email"
                        type="email"
                        placeholder={f.emailPlaceholder}
                    />
                </Field>
            </div>
            <Field label={f.phone} htmlFor="phone">
                <Input id="phone" name="phone" placeholder={f.phonePlaceholder} />
            </Field>

            {/* Type-specific fields */}
            {type === "photo-story" ? (
                <>
                    <Field label={f.what} htmlFor="what">
                        <Textarea
                            id="what"
                            name="what"
                            required
                            placeholder={f.whatPlaceholder}
                        />
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label={f.location} htmlFor="location">
                            <Input id="location" name="location" placeholder={f.locationPlaceholder} />
                        </Field>
                        <Field label={f.date} htmlFor="date">
                            <Input id="date" name="date" type="date" />
                        </Field>
                    </div>
                    <Field label={f.photos} htmlFor="photos" hint={f.photosHint}>
                        <Textarea
                            id="photos"
                            name="photos"
                            placeholder={f.photosPlaceholder}
                        />
                    </Field>
                    <Field label={f.description} htmlFor="description">
                        <Textarea id="description" name="description" placeholder={f.descriptionPlaceholder} />
                    </Field>
                </>
            ) : null}

            {type === "news" ? (
                <>
                    <Field label={f.headline} htmlFor="headline">
                        <Input id="headline" name="headline" required placeholder={f.headlinePlaceholder} />
                    </Field>
                    <Field label={f.description} htmlFor="description">
                        <Textarea
                            id="description"
                            name="description"
                            required
                            placeholder={f.descriptionPlaceholder}
                        />
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label={f.location} htmlFor="location">
                            <Input id="location" name="location" placeholder={f.locationPlaceholder} />
                        </Field>
                        <Field label={f.date} htmlFor="date">
                            <Input id="date" name="date" type="date" />
                        </Field>
                    </div>
                    <Field label={f.photos} htmlFor="photos" hint={f.photosHint}>
                        <Textarea id="photos" name="photos" placeholder={f.photosPlaceholder} />
                    </Field>
                </>
            ) : null}

            {type === "culture" ? (
                <>
                    <Field label={f.headline} htmlFor="headline">
                        <Input id="headline" name="headline" required placeholder={f.headlinePlaceholder} />
                    </Field>
                    <Field label={f.description} htmlFor="description">
                        <Textarea
                            id="description"
                            name="description"
                            required
                            placeholder={f.descriptionPlaceholder}
                        />
                    </Field>
                    <Field label={f.location} htmlFor="location">
                        <Input id="location" name="location" placeholder={f.locationPlaceholder} />
                    </Field>
                    <Field label={f.photos} htmlFor="photos" hint={f.photosHint}>
                        <Textarea id="photos" name="photos" placeholder={f.photosPlaceholder} />
                    </Field>
                </>
            ) : null}

            {type === "notice" ? (
                <>
                    <Field label={f.noticeType} htmlFor="noticeType">
                        <select
                            id="noticeType"
                            name="noticeType"
                            required
                            defaultValue=""
                            className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                        >
                            <option value="" disabled>
                                {f.noticeTypePlaceholder}
                            </option>
                            {NOTICE_TYPES.map((t) => (
                                <option key={t} value={t}>
                                    {noticeTypeLabel(t)}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label={f.item} htmlFor="item">
                        <Input id="item" name="item" required placeholder={f.itemPlaceholder} />
                    </Field>
                    <Field label={f.message} htmlFor="message">
                        <Textarea id="message" name="message" required placeholder={f.messagePlaceholder} />
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label={f.location} htmlFor="location">
                            <Input id="location" name="location" placeholder={f.locationPlaceholder} />
                        </Field>
                        <Field label={f.expiry} htmlFor="expiry">
                            <Input id="expiry" name="expiry" type="date" />
                        </Field>
                    </div>
                    <Field label={f.organization} htmlFor="organization">
                        <Input id="organization" name="organization" placeholder={f.organizationPlaceholder} />
                    </Field>
                    <Field label={f.doc} htmlFor="doc">
                        <Input id="doc" name="doc" placeholder={f.docPlaceholder} />
                    </Field>
                </>
            ) : null}

            {type === "buy-sell" ? (
                <>
                    <Field label={f.item} htmlFor="item">
                        <Input id="item" name="item" required placeholder={f.itemPlaceholder} />
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-3">
                        <Field label={f.category} htmlFor="category">
                            <select
                                id="category"
                                name="category"
                                required
                                defaultValue=""
                                className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                            >
                                <option value="" disabled>
                                    {f.categoryPlaceholder}
                                </option>
                                {BUY_SELL_CATEGORIES.map((c) => (
                                    <option key={c} value={c}>
                                        {(dict.buySell as Record<string, string>)[`category${c.charAt(0).toUpperCase()}${c.slice(1)}`] ?? c}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label={f.price} htmlFor="price">
                            <Input id="price" name="price" type="number" min="0" step="any" placeholder={f.pricePlaceholder} />
                        </Field>
                        <Field label={f.currency} htmlFor="currency">
                            <select
                                id="currency"
                                name="currency"
                                defaultValue="XAF"
                                className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                            >
                                {CURRENCIES.map((c) => (
                                    <option key={c} value={c}>
                                        {c}
                                    </option>
                                ))}
                            </select>
                        </Field>
                    </div>
                    <Field label={f.description} htmlFor="description">
                        <Textarea
                            id="description"
                            name="description"
                            required
                            placeholder={f.descriptionPlaceholder}
                        />
                    </Field>
                    <Field label={f.location} htmlFor="location">
                        <Input id="location" name="location" placeholder={f.locationPlaceholder} />
                    </Field>
                    <Field label={f.photos} htmlFor="photos" hint={f.photosHint}>
                        <Textarea id="photos" name="photos" placeholder={f.photosPlaceholder} />
                    </Field>
                </>
            ) : null}

            {/* Consent */}
            <div className="space-y-2 rounded-2xl border bg-muted/30 p-4 text-sm">
                <label className="flex items-start gap-2">
                    <input type="checkbox" name="rights" required className="mt-1" />
                    <span>{dict.submit.consent}</span>
                </label>
                <label className="flex items-start gap-2">
                    <input type="checkbox" name="consent" required className="mt-1" />
                    <span>
                        {dict.submit.consentLink}{" "}
                        <Link href={localePath(locale, "/about/guidelines")} className="underline">
                            {dict.footer.guidelines}
                        </Link>{" "}
                        &{" "}
                        <Link href={localePath(locale, "/about/terms")} className="underline">
                            {dict.footer.terms}
                        </Link>
                        .
                    </span>
                </label>
            </div>

            {state.error ? (
                <p className="text-sm text-destructive">
                    {state.error === "rate_limited"
                        ? dict.submit.errorRateLimited
                        : state.error === "captcha"
                          ? dict.submit.errorCaptcha
                          : dict.submit.errorGeneric}
                </p>
            ) : null}

            {/* Bot trap: hidden from humans; a filled field silently drops the row. */}
            <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="hidden"
            />
            <TurnstileWidget />

            <Button type="submit" disabled={pending} className="w-full">
                {pending ? (
                    <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        {dict.submit.submitting}
                    </>
                ) : (
                    dict.submit.submit
                )}
            </Button>
        </form>
    );
}
