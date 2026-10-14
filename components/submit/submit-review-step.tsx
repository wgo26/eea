"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Dictionary, Locale } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/urls";
import { Field } from "./submit-field";
import { MediaField } from "./media-field";
import { TurnstileWidget } from "@/components/security/turnstile-widget";
import type { SubmitState } from "@/lib/public/types";

type Fields = Dictionary["submit"]["fields"];
type Steps = Dictionary["submit"]["steps"];

/**
 * STEP 3 — media + consent + review: optional media bundle (collapsible),
 * rights/consent checkboxes, server-error mapping, honeypot + Turnstile,
 * contact/location review summary, and the submit / save-draft actions.
 */
export function SubmitReviewStep(props: {
    active: boolean;
    f: Fields;
    s: Steps;
    dict: Dictionary;
    locale: Locale;
    canUpload: boolean;
    mediaOpen: boolean;
    setMediaOpen: (open: boolean) => void;
    state: SubmitState;
    pending: boolean;
    draftPending: boolean;
    draftAction: (formData: FormData) => void;
    turnstileKey: string;
    reviewOpen: boolean;
    setReviewOpen: (open: boolean) => void;
    reviewValues: Record<string, string>;
    setShowContact: (show: boolean) => void;
    goStep: (next: number) => void;
}) {
    const { active, f, s, dict, locale, canUpload, mediaOpen, setMediaOpen, state, pending, draftPending, draftAction, turnstileKey, reviewOpen, setReviewOpen, reviewValues, setShowContact, goStep } = props;
    const uploadCopy = {
        retryFailed: dict.submit.retryUpload,
        failedCount: dict.submit.uploadFailedCount,
    };

    return (
        <div data-step-active={active} hidden={!active} className="space-y-5">
            <div className="rounded-2xl border">
                <button
                    type="button"
                    onClick={() => setMediaOpen(!mediaOpen)}
                    aria-expanded={mediaOpen}
                    className="flex w-full items-center justify-between gap-2 p-4 text-left text-sm font-bold"
                >
                    {s.media} <span className="text-xs font-medium text-muted-foreground">{s.optional}</span>
                </button>
                <div hidden={!mediaOpen} className="space-y-5 border-t p-4">
                    {!canUpload ? (
                        <p className="rounded-xl border border-border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
                            {dict.submit.signInToUpload}{" "}
                            <Link href={localePath(locale, "/account/login")} className="font-medium text-primary underline">
                                {dict.auth.login.submit}
                            </Link>
                        </p>
                    ) : null}
                    <Field label={f.photos} htmlFor="photos" hint={f.photosHint}>
                        <MediaField kind="image" name="photos" placeholder={f.photosPlaceholder} canUpload={canUpload} uploadCopy={uploadCopy} />
                    </Field>
                    <Field label={f.videos} htmlFor="videos" hint={f.videosHint}>
                        <MediaField kind="video" name="videos" placeholder={f.videosPlaceholder} canUpload={canUpload} uploadCopy={uploadCopy} />
                    </Field>
                    <Field label={f.audios} htmlFor="audios" hint={f.audiosHint}>
                        <MediaField kind="audio" name="audios" placeholder={f.audiosPlaceholder} canUpload={canUpload} uploadCopy={uploadCopy} />
                    </Field>
                    <Field label={f.documents} htmlFor="documents" hint={f.documentsHint}>
                        <MediaField kind="document" name="documents" placeholder={f.documentsPlaceholder} canUpload={canUpload} uploadCopy={uploadCopy} />
                    </Field>
                </div>
            </div>

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
                <p className="text-sm text-destructive" role="alert">
                    {state.error === "rate_limited"
                        ? dict.submit.errorRateLimited
                        : state.error === "captcha"
                          ? dict.submit.errorCaptcha
                          : state.error === "missing_name" ||
                              state.error === "missing_contact" ||
                              state.error === "missing_consent" ||
                              state.error === "missing_content"
                            ? dict.submit.errorRequired
                            : state.error === "duplicate"
                              ? dict.submit.errorDuplicate
                              : dict.submit.errorGeneric}
                </p>
            ) : null}

            <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="hidden"
            />
            <TurnstileWidget key={turnstileKey} />

            {reviewOpen ? (
                <section aria-label={s.review} className="rounded-2xl border bg-muted/30 p-4">
                    <h3 className="mb-3 text-sm font-bold">{s.review}</h3>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <p className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
                                {s.contact}
                            </p>
                            <ul className="space-y-1 text-sm">
                                <li>
                                    <span className="text-muted-foreground">{f.contributorName}:</span>{" "}
                                    {reviewValues.contributorName || "—"}
                                </li>
                                <li>
                                    <span className="text-muted-foreground">{f.email}:</span>{" "}
                                    {reviewValues.email || "—"}
                                </li>
                                <li>
                                    <span className="text-muted-foreground">{f.phone}:</span>{" "}
                                    {reviewValues.phone || "—"}
                                </li>
                            </ul>
                            <button
                                type="button"
                                className="mt-2 text-xs font-medium text-primary hover:underline"
                                onClick={() => {
                                    setShowContact(true);
                                    setReviewOpen(false);
                                }}
                            >
                                {s.change}
                            </button>
                        </div>
                        <div>
                            <p className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
                                {s.two}
                            </p>
                            <ul className="space-y-1 text-sm">
                                <li>
                                    <span className="text-muted-foreground">{f.location}:</span>{" "}
                                    {reviewValues.location_text || "—"}
                                </li>
                                <li>
                                    <span className="text-muted-foreground">{f.date}:</span>{" "}
                                    {reviewValues.date || "—"}
                                </li>
                            </ul>
                            <button
                                type="button"
                                className="mt-2 text-xs font-medium text-primary hover:underline"
                                onClick={() => {
                                    setReviewOpen(false);
                                    goStep(1);
                                }}
                            >
                                {s.change}
                            </button>
                        </div>
                    </div>
                </section>
            ) : null}
            <div className="flex flex-col gap-3">
                <Button type="submit" disabled={pending || draftPending} className="w-full">
                    {pending ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                            {dict.submit.submitting}
                        </>
                    ) : (
                        dict.submit.submit
                    )}
                </Button>
                {canUpload ? (
                    <button
                        type="submit"
                        formAction={draftAction}
                        disabled={pending || draftPending}
                        className="text-sm font-medium text-primary underline underline-offset-2 hover:no-underline disabled:opacity-50"
                    >
                        {draftPending ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                                {dict.submit.submitting}
                            </>
                        ) : (
                            dict.submit.saveDraft
                        )}
                    </button>
                ) : null}
            </div>
        </div>
    );
}
