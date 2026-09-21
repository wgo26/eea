import { Check, Circle, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ModerationStage = "submitted" | "in_review" | "published" | "rejected";

/** Maps a submissions.status value to its pipeline stage. */
export function stageForStatus(status: string | null | undefined): ModerationStage {
    switch ((status ?? "").toLowerCase()) {
        case "in_review":
        case "needs_clarification":
            return "in_review";
        case "approved":
        case "published":
            return "published";
        case "rejected":
            return "rejected";
        default:
            return "submitted";
    }
}

export type ModerationTimelineCopy = {
    submitted: string;
    submittedBody: string;
    inReview: string;
    inReviewBody: string;
    published: string;
    publishedBody: string;
    rejected: string;
    rejectedBody: string;
};

/**
 * Phase 3 — moderation timeline (Submitted → In review → Published).
 * Shows contributors where their submission stands without polling the
 * newsroom: full explainer on the confirmation page, compact dots on
 * /account/submissions rows.
 */
export function ModerationTimeline({
    stage,
    copy,
    compact = false,
}: {
    stage: ModerationStage;
    copy: ModerationTimelineCopy;
    compact?: boolean;
}) {
    const rejected = stage === "rejected";
    const steps = [
        { key: "submitted", label: copy.submitted, body: copy.submittedBody },
        { key: "in_review", label: copy.inReview, body: copy.inReviewBody },
        {
            key: rejected ? "rejected" : "published",
            label: rejected ? copy.rejected : copy.published,
            body: rejected ? copy.rejectedBody : copy.publishedBody,
        },
    ] as const;
    const order: ModerationStage[] = ["submitted", "in_review", rejected ? "rejected" : "published"];
    const currentIdx = order.indexOf(stage);

    return (
        <ol aria-label={copy.submitted} className="flex items-start gap-1 sm:gap-2">
            {steps.map((step, i) => {
                const done = i < currentIdx || (stage === "published" && i === currentIdx);
                const current = i === currentIdx && stage !== "published";
                const failed = rejected && i === 2;
                const reached = done || current;
                return (
                    <li key={step.key} className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5" aria-hidden={false}>
                            <span
                                aria-current={current ? "step" : undefined}
                                className={cn(
                                    compact ? "h-5 w-5" : "h-7 w-7",
                                    "flex shrink-0 items-center justify-center rounded-full",
                                    done && !failed && "bg-emerald-500 text-white",
                                    current && !failed && "bg-primary text-primary-foreground",
                                    failed && "bg-destructive text-destructive-foreground",
                                    !reached && "bg-muted text-muted-foreground",
                                )}
                            >
                                {done && !failed ? (
                                    <Check className={compact ? "h-3 w-3" : "h-4 w-4"} aria-hidden />
                                ) : failed ? (
                                    <X className={compact ? "h-3 w-3" : "h-4 w-4"} aria-hidden />
                                ) : (
                                    <Circle className={compact ? "h-3 w-3" : "h-4 w-4"} aria-hidden />
                                )}
                            </span>
                            {i < steps.length - 1 ? (
                                <span
                                    aria-hidden
                                    className={cn(
                                        "h-0.5 min-w-3 flex-1 rounded-full",
                                        i < currentIdx || stage === "published"
                                            ? "bg-emerald-500"
                                            : "bg-border",
                                    )}
                                />
                            ) : null}
                        </span>
                        <span
                            className={cn(
                                "mt-1.5 block font-semibold leading-tight",
                                compact ? "text-xs" : "text-sm",
                                reached ? "text-foreground" : "text-muted-foreground",
                            )}
                        >
                            {step.label}
                        </span>
                        {!compact ? (
                            <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                                {step.body}
                            </span>
                        ) : null}
                    </li>
                );
            })}
        </ol>
    );
}
