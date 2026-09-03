import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
    icon: LucideIcon;
    title: string;
    body?: string;
    /** Optional primary next-action. */
    actionLabel?: string;
    actionHref?: string;
    className?: string;
    /** "card" (default) keeps the bordered panel; "bare" drops it. */
    variant?: "card" | "bare";
};

/**
 * Standard empty state (checklist item 11) — every list/section that can be
 * empty renders this instead of hand-rolled dashed divs, so a reader or
 * admin always gets: what's empty, why it matters, and the next action.
 */
export function EmptyState({
    icon: Icon,
    title,
    body,
    actionLabel,
    actionHref,
    className,
    variant = "card",
}: EmptyStateProps) {
    return (
        <div
            className={cn(
                "flex flex-col items-center justify-center text-center",
                variant === "card" &&
                    "rounded-2xl border border-dashed border-border bg-muted/30 p-8",
                className,
            )}
        >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Icon className="h-6 w-6" aria-hidden />
            </span>
            <p className="mt-4 text-sm font-semibold">{title}</p>
            {body ? (
                <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
                    {body}
                </p>
            ) : null}
            {actionLabel && actionHref ? (
                <Button render={<Link href={actionHref} />} size="sm" className="mt-5">
                    {actionLabel}
                </Button>
            ) : null}
        </div>
    );
}