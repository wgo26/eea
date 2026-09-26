"use client";

import { cn } from "@/lib/utils";
import { useFormStep } from "@/lib/submit/form-step-context";

/**
 * Horizontal progress tracker that lives in the `FocusedShell` header area.
 * Reads step state from `FormStepContext` (provided by the enclosing
 * `SubmitFormWithProgress` wrapper) so a single source of truth drives both
 * the shell-level bar and the inline stepper inside `SubmitForm`.
 *
 * Renders nothing when no step context is present — safe to mount on every
 * focused page (login, signup, etc.) that does not opt into the provider.
 */
export function FocusedStepProgress() {
    let ctx;
    try {
        ctx = useFormStep();
    } catch {
        return null;
    }

    const { step, steps } = ctx;

    return (
        <nav
            className="hide-while-printing mb-6 w-full"
            aria-label="Progress"
        >
            <ol
                className="flex items-center gap-2"
                aria-label="Submission progress"
            >
                {steps.map((s, i) => {
                    const isActive = step === i;
                    const isComplete = s.completed;
                    const isLast = i === steps.length - 1;
                    return (
                        <li key={s.label} className="flex flex-1 items-center gap-2">
                            <span
                                aria-current={isActive ? "step" : undefined}
                                className={cn(
                                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors",
                                    isComplete
                                        ? "bg-emerald-500 text-white"
                                        : isActive
                                          ? "bg-primary text-primary-foreground"
                                          : "bg-muted text-muted-foreground",
                                )}
                            >
                                {i + 1}
                            </span>
                            <span
                                className={cn(
                                    "text-xs font-medium",
                                    isActive ? "text-foreground" : "text-muted-foreground",
                                )}
                            >
                                {s.label}
                            </span>
                            {!isLast ? (
                                <span
                                    className={cn(
                                        "h-px flex-1 border-t",
                                        isComplete ? "border-emerald-500" : "border-border",
                                    )}
                                    aria-hidden
                                />
                            ) : null}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}
