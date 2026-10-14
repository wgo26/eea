"use client";

import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/lib/i18n";
import { TYPE_TO_DB } from "./submit-types";
import type { SubmitInitial, SubmitType } from "./submit-types";
import { useSubmitSteps } from "./use-submit-steps";
import { SubmitContactCard } from "./submit-contact-card";
import { SubmitEssentials } from "./submit-essentials";
import { SubmitDetailsStep } from "./submit-details-step";
import { SubmitReviewStep } from "./submit-review-step";

// Re-exported: submit-form-gated and submit-form-with-progress import the
// funnel vocabulary from this module. The definitions live in
// ./submit-types; this barrel keeps those import paths stable.
export type { SubmitType, SubmitInitial } from "./submit-types";
export { TYPE_TO_DB } from "./submit-types";

/**
 * Public submit funnel shell: 3 steps (essentials → details → media/review)
 * plus the always-visible contact card. Field groups live in
 * submit-essentials / submit-details-step / submit-review-step, transitions
 * and validation in use-submit-steps. Nothing here may grow a new field —
 * it belongs in the step that owns it.
 */
export function SubmitForm({
    type,
    dict,
    canUpload = false,
    initial,
    initialDraft,
    initialNoticeType,
    initialNoticeDirection,
    step: controlledStep,
    onStepChange,
}: {
    type: SubmitType;
    dict: Dictionary;
    canUpload?: boolean;
    initial?: SubmitInitial;
    initialDraft?: Record<string, string>;
    /** P1 Lost & Found: deep-link preselect for the notice-type select (?type=). */
    initialNoticeType?: string;
    initialNoticeDirection?: "lost" | "found";
    /** When provided, the form becomes controlled — step state lives in the parent. */
    step?: number;
    onStepChange?: (step: number) => void;
}) {
    const steps = useSubmitSteps({
        type,
        initial,
        initialDraft,
        initialNoticeType,
        controlledStep,
        onStepChange,
    });
    const {
        locale, state, formAction, pending, draftAction, draftPending,
        submitAttempt, setSubmitAttempt, showContact, setShowContact,
        selectedNoticeType, setSelectedNoticeType, mediaOpen, setMediaOpen,
        reviewOpen, setReviewOpen, reviewValues, formRef, stepRef, step,
        contactError, checkBuySellContact, goStep, restored, clearDraft,
        captureReviewValues, queued, queueOnline, queueCurrent, sendQueued,
        discardQueued,
    } = steps;
    // Turnstile tokens are single-use — remount the challenge after a failed
    // submit so a spent token is never replayed.
    const turnstileKey = state.error ? `${state.error}#${submitAttempt}` : "fresh";
    const f = dict.submit.fields;
    const s = dict.submit.steps;

    // Success navigates to /submit/confirmation via the hook effect — no
    // inline success card here (it used to flash before the redirect).

    return (
        <form
            ref={formRef}
            action={formAction}
            onSubmit={(e) => {
                // Offline outbox: spam checks cannot run offline, so the Send
                // tap snapshots text fields into the outbox instead of
                // failing. The reporter completes the send on reconnect.
                if (typeof navigator !== "undefined" && !navigator.onLine) {
                    e.preventDefault();
                    queueCurrent();
                    return;
                }
                setSubmitAttempt((a) => a + 1);
                // Native validation runs first; this covers the cross-field
                // marketplace rule (email OR phone) that `required` cannot
                // express on its own.
                if (!checkBuySellContact()) e.preventDefault();
            }}
            className="space-y-5"
        >
            <input type="hidden" name="submissionType" value={TYPE_TO_DB[type]} />

            {/* Phase 3 — restored-draft notice (autosave survived a dropped connection). */}
            {restored ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
                    <p className="font-medium">{dict.submit.draftRestored}</p>
                    <button
                        type="button"
                        onClick={clearDraft}
                        className="font-medium text-primary hover:underline"
                    >
                        {dict.submit.draftDiscard}
                    </button>
                </div>
            ) : null}

            {/* Offline outbox receipt: queued while offline, one tap sends on reconnect. */}
            {queued ? (
                <div role="status" className="space-y-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
                    <p className="text-sm font-bold">{dict.submit.queuedTitle}</p>
                    <p className="text-sm text-muted-foreground">{dict.submit.queuedBody}</p>
                    <p className="text-xs text-muted-foreground">{dict.submit.queuedNote}</p>
                    <div className="flex flex-wrap gap-2 pt-1">
                        <button
                            type="button"
                            disabled={!queueOnline}
                            onClick={() => {
                                sendQueued();
                            }}
                            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                        >
                            {dict.submit.queuedSend}
                        </button>
                        <button
                            type="button"
                            onClick={discardQueued}
                            className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                        >
                            {dict.submit.queuedDiscard}
                        </button>
                    </div>
                </div>
            ) : null}

            {/* Step progress lives in the shell (FocusedStepProgress, driven by
                FormStepContext) — the single stepper. A second inline copy
                used to render here and showed double step numbers. */}

            <SubmitContactCard
                initial={initial}
                showContact={showContact}
                setShowContact={setShowContact}
                contactError={contactError}
                isBuySell={type === "buy-sell"}
                f={f}
                s={s}
                errorRequired={dict.submit.errorRequired}
            />

            <div ref={stepRef}>
                {/* STEP 1 — essentials */}
                <SubmitEssentials
                    type={type}
                    active={step === 0}
                    f={f}
                    s={s}
                    dict={dict}
                    locale={locale}
                    selectedNoticeType={selectedNoticeType}
                    setSelectedNoticeType={setSelectedNoticeType}
                    initialDraft={initialDraft}
                    initialNoticeDirection={initialNoticeDirection}
                />

                {/* STEP 2 — details (location + dates) */}
                <SubmitDetailsStep
                    type={type}
                    active={step === 1}
                    f={f}
                    s={s}
                    initial={initial}
                />

                {/* STEP 3 — media + consent + review */}
                <SubmitReviewStep
                    active={step === 2}
                    f={f}
                    s={s}
                    dict={dict}
                    locale={locale}
                    canUpload={canUpload}
                    mediaOpen={mediaOpen}
                    setMediaOpen={setMediaOpen}
                    state={state}
                    pending={pending}
                    draftPending={draftPending}
                    draftAction={draftAction}
                    turnstileKey={turnstileKey}
                    reviewOpen={reviewOpen}
                    setReviewOpen={setReviewOpen}
                    reviewValues={reviewValues}
                    setShowContact={setShowContact}
                    goStep={goStep}
                />
            </div>

            {/* Step nav */}
            <div className="flex items-center justify-between gap-3">
                <Button
                    type="button"
                    variant="outline"
                    disabled={step === 0 || pending}
                    onClick={() => goStep(step - 1)}
                >
                    {s.back}
                </Button>
                {step < 2 ? (
                    <Button type="button" onClick={() => goStep(step + 1)}>
                        {s.continue}
                    </Button>
                ) : (
                    <Button
                        type="button"
                        variant={reviewOpen ? "default" : "ghost"}
                        aria-expanded={reviewOpen}
                        onClick={() => {
                            if (!reviewOpen) captureReviewValues();
                            setReviewOpen(!reviewOpen);
                        }}
                    >
                        {s.review}
                    </Button>
                )}
            </div>
        </form>
    );
}
