"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { submitStory, saveStoryDraft } from "@/lib/public/submit-actions";
import { useSubmitDraft } from "@/components/submit/use-submit-draft";
import { clearQueued, useSubmitQueue } from "@/components/submit/use-submit-queue";
import type { SubmitState } from "@/lib/public/types";
import { localePath } from "@/lib/i18n/urls";
import { useLocaleFromPath } from "@/components/site-header";
import type { SubmitInitial, SubmitType } from "./submit-types";

/**
 * All interactive state behind the public submit funnel: server-action
 * states, step navigation with per-step validation, the buy-sell contact
 * rule, draft autosave + server-draft effects, and review-value capture.
 * Extracted from submit-form.tsx verbatim — the shell owns the `<form>`
 * element, the steps own their fields, this owns the transitions between.
 */
export function useSubmitSteps(opts: {
    type: SubmitType;
    initial?: SubmitInitial;
    initialDraft?: Record<string, string>;
    initialNoticeType?: string;
    controlledStep?: number;
    onStepChange?: (step: number) => void;
}) {
    const { type, initial, initialDraft, initialNoticeType, controlledStep, onStepChange } = opts;
    const router = useRouter();
    const locale = useLocaleFromPath();
    const [state, formAction, pending] = useActionState<SubmitState, FormData>(
        submitStory,
        { ok: false },
    );
    const [draftState, draftAction, draftPending] = useActionState<SubmitState, FormData>(
        saveStoryDraft,
        { ok: false },
    );
    // Turnstile tokens are single-use — remount the challenge after a failed
    // submit so a spent token is never replayed.
    const [submitAttempt, setSubmitAttempt] = React.useState(0);
    // Signed-in contributors with a known name start with contact collapsed.
    const [showContact, setShowContact] = React.useState(!initial?.name);
    const [selectedNoticeType, setSelectedNoticeType] = React.useState(
        initialDraft?.noticeType || initialNoticeType || "",
    );
    const [mediaOpen, setMediaOpen] = React.useState(false);
    const [reviewOpen, setReviewOpen] = React.useState(false);
    const [reviewValues, setReviewValues] = React.useState<Record<string, string>>({});
    const formRef = React.useRef<HTMLFormElement>(null);
    const stepRef = React.useRef<HTMLDivElement>(null);
    const [internalStep, setInternalStep] = React.useState(0)
    const step = controlledStep ?? internalStep;
    // Marketplace policy (confirmed): a buy-sell listing without a seller
    // contact is unreviewable, so email-or-phone is required for the type
    // even though both fields stay optional for every other type.
    const [contactError, setContactError] = React.useState(false);

    /** Effective contact values, whether the card is expanded or collapsed
     * into hidden inputs for signed-in contributors. */
    const contactValues = () => {
        const form = formRef.current;
        const read = (name: string) => {
            const el = form?.elements.namedItem(name);
            return el instanceof HTMLInputElement ? el.value.trim() : "";
        };
        return { email: read("email"), phone: read("phone") };
    };

    /** Enforce the buy-sell contact rule; returns true when satisfied. */
    const checkBuySellContact = () => {
        if (type !== "buy-sell") return true;
        const { email, phone } = contactValues();
        if (email || phone) {
            setContactError(false);
            return true;
        }
        setContactError(true);
        setShowContact(true);
        // The card may just have expanded — focus after paint.
        requestAnimationFrame(() => {
            (document.getElementById("phone") as HTMLInputElement | null)?.focus({ preventScroll: false });
        });
        return false;
    };

    const goStep = (next: number) => {
        if (next > step) {
            // Validate the always-visible contact card plus the visible step
            // before advancing. (Hidden steps are display:none — browsers bar
            // them from constraint validation — so each step is checked on
            // the way through, and the contact card is checked every time.)
            const root = stepRef.current;
            if (root) {
                const form = formRef.current;
                const contactRequired = form
                    ? Array.from(form.querySelectorAll<HTMLElement>("#submit-contact [required]"))
                    : [];
                const required = [
                    ...contactRequired,
                    ...Array.from(
                        root.querySelectorAll<HTMLElement>("[data-step-active='true'] [required]"),
                    ),
                ];
                for (const el of required) {
                    const input = el as HTMLInputElement;
                    if (!input.checkValidity()) {
                        input.reportValidity();
                        return;
                    }
                }
            }
            if (!checkBuySellContact()) return;
        }
        if (controlledStep === undefined) setInternalStep(next)
        onStepChange?.(next)
        stepRef.current?.scrollIntoView({ block: "start", behavior: "smooth" })
    }

    // Phase 3 — draft autosave: restore unsent fields after a dropped
    // connection, clear on success.
    const { restored, clearDraft } = useSubmitDraft(type, formRef);
    // Offline outbox: the Send tap snapshots text fields while offline; the
    // reporter completes the send on reconnect (see use-submit-queue).
    const queue = useSubmitQueue(type, formRef);
    React.useEffect(() => {
        if (initialDraft && formRef.current) {
            // Apply the server draft values to the form inputs if present
            for (const [key, val] of Object.entries(initialDraft)) {
                const el = formRef.current.elements.namedItem(key);
                if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
                    if (el instanceof HTMLInputElement && el.type === "checkbox") {
                        el.checked = Boolean(val);
                    } else if (val && typeof val === "string") {
                        el.value = val;
                    }
                }
            }
        }
    }, [initialDraft]);

    React.useEffect(() => {
        if (state.ok) {
            clearDraft();
            clearQueued(type);
            router.push(localePath(locale, "/submit/confirmation"));
        }
    }, [state.ok, router, locale, type, clearDraft]);

    React.useEffect(() => {
        if (draftState.ok) {
            // Optional: show a toast or message
            clearDraft(); // clear local draft since server took over
        }
    }, [draftState.ok, clearDraft]);

    /** Capture live form values into state when the review summary opens, so
     * refs are read inside an event handler (not during render). */
    function captureReviewValues() {
        const form = formRef.current;
        if (!form) return;
        const next: Record<string, string> = {};
        for (const name of ["contributorName", "email", "phone", "location_text", "date"]) {
            const el = form.elements.namedItem(name);
            if (
                el instanceof HTMLInputElement ||
                el instanceof HTMLTextAreaElement ||
                el instanceof HTMLSelectElement
            ) {
                if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
                    next[name] = el.checked ? el.value : "";
                } else {
                    next[name] = el.value.trim();
                }
            }
        }
        setReviewValues(next);
    }

    return {
        locale,
        state,
        formAction,
        pending,
        draftState,
        draftAction,
        draftPending,
        submitAttempt,
        setSubmitAttempt,
        showContact,
        setShowContact,
        selectedNoticeType,
        setSelectedNoticeType,
        mediaOpen,
        setMediaOpen,
        reviewOpen,
        setReviewOpen,
        reviewValues,
        formRef,
        stepRef,
        step,
        contactError,
        contactValues,
        checkBuySellContact,
        goStep,
        restored,
        clearDraft,
        captureReviewValues,
        queued: queue.queued,
        queueOnline: queue.online,
        queueCurrent: queue.queueCurrent,
        sendQueued: queue.sendQueued,
        discardQueued: queue.discardQueued,
    };
}

export type SubmitSteps = ReturnType<typeof useSubmitSteps>;
