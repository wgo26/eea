"use client";

import { createContext, useContext, ReactNode, useState } from "react";

export interface FormStep {
    label: string;
    completed: boolean;
}

export interface FormStepContextValue {
    step: number;
    totalSteps: number;
    steps: FormStep[];
    setStep: (step: number) => void;
}

const FormStepContext = createContext<FormStepContextValue | null>(null);

/**
 * Reads the current form-step context. Throws when used outside of a
 * `FormStepProvider` — intentional fail-fast for wiring mistakes.
 */
export function useFormStep(): FormStepContextValue {
    const ctx = useContext(FormStepContext);
    if (!ctx) {
        throw new Error("useFormStep must be used within a FormStepProvider");
    }
    return ctx;
}

/**
 * Optional reader for surfaces mounted both inside and outside a provider
 * (e.g. the shell-level progress tracker, which renders on every focused
 * page). Returns null instead of throwing — callers render nothing.
 * Components that REQUIRE step state must keep using `useFormStep`.
 */
export function useFormStepOptional(): FormStepContextValue | null {
    return useContext(FormStepContext);
}

/**
 * Provider that owns the active step for a focused multi-step form
 * (submit flows). Renders the step once at the shell level so the
 * progress tracker and the form stay in sync without prop-drilling
 * through every intermediate component.
 */
export function FormStepProvider({
    initialStep = 0,
    totalSteps,
    stepLabels,
    children,
}: {
    initialStep?: number;
    totalSteps: number;
    stepLabels: string[];
    children: ReactNode;
}) {
    const [step, setStep] = useState(initialStep);

    const steps: FormStep[] = stepLabels.map((label, i) => ({
        label,
        completed: i < step,
    }));

    return (
        <FormStepContext.Provider value={{ step, totalSteps, steps, setStep }}>
            {children}
        </FormStepContext.Provider>
    );
}
