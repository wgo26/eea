"use client";

import { FormStepProvider } from "@/lib/submit/form-step-context";
import { FocusedStepProgress } from "@/components/shells/focused-step-progress";
import { SubmitForm, type SubmitType, type SubmitInitial } from "@/components/submit/submit-form";
import { useFormStep } from "@/lib/submit/form-step-context";
import type { Dictionary } from "@/lib/i18n";

/**
 * Client wrapper that reads the controlled step from `FormStepContext` and
 * passes it down to `SubmitForm`. The shell-level `FocusedStepProgress` is
 * the single visible stepper — `SubmitForm` renders no stepper of its own.
 */
function SubmitFormControlled({
    type,
    dict,
    canUpload,
    initial,
    initialDraft,
}: {
    type: SubmitType;
    dict: Dictionary;
    canUpload?: boolean;
    initial?: SubmitInitial | null;
    initialDraft?: Record<string, string> | null;
}) {
    const { step, setStep } = useFormStep();
    return (
        <SubmitForm
            type={type}
            dict={dict}
            canUpload={canUpload}
            initial={initial ?? undefined}
            initialDraft={initialDraft ?? undefined}
            step={step}
            onStepChange={setStep}
        />
    );
}

/**
 * Provider + progress + form combined. The server-gated page resolves
 * auth/session data and passes it here; this component owns the
 * step context so the shell progress bar and inline stepper stay in sync.
 */
export function SubmitFormWithProgress({
    type,
    dict,
    canUpload = false,
    initial,
    initialDraft,
}: {
    type: SubmitType;
    dict: Dictionary;
    canUpload?: boolean;
    initial?: SubmitInitial | null;
    initialDraft?: Record<string, string> | null;
}) {
    return (
        <FormStepProvider
            initialStep={0}
            totalSteps={3}
            stepLabels={[dict.submit.steps.one, dict.submit.steps.two, dict.submit.steps.three]}
        >
            <FocusedStepProgress />
            <SubmitFormControlled
                type={type}
                dict={dict}
                canUpload={canUpload}
                initial={initial}
                initialDraft={initialDraft}
            />
        </FormStepProvider>
    );
}
