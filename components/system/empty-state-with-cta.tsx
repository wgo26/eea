import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/system/empty-state";
import { cn } from "@/lib/utils";

type EmptyStateWithCTAProps = {
    icon: LucideIcon;
    title: string;
    body?: string;
    /** Shown when the list is empty and not filtered (e.g. "Post your first listing"). */
    ctaLabel?: string;
    ctaHref?: string;
    /** Shown when the list is filtered but produces no results. */
    isFiltered: boolean;
    /** Href that clears all filters. */
    clearHref?: string;
    clearLabel?: string;
    className?: string;
};

/**
 * Standard empty state with an inline clear-filters link + optional CTA.
 *
 * Wraps `EmptyState` to unify the pattern: when filters wipe the list to zero
 * we offer a one-click "clear filters" (preserving nothing else); when the
 * section is empty outright we offer the primary CTA (e.g. "Post your first
 * listing"). Checklist item 11.
 */
export function EmptyStateWithCTA({
    icon: Icon,
    title,
    body,
    ctaLabel,
    ctaHref,
    isFiltered,
    clearHref,
    clearLabel = "Clear filters",
    className,
}: EmptyStateWithCTAProps) {
    return (
        <div className={cn("py-4", className)}>
            <EmptyState
                icon={Icon}
                title={title}
                body={body}
                actionLabel={isFiltered ? clearLabel : ctaLabel}
                actionHref={isFiltered ? clearHref : ctaHref}
                variant="bare"
            />
        </div>
    );
}

export { EmptyState };
