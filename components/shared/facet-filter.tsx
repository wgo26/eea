"use client";

import { useState } from "react";
import { Filter, X } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
    Drawer,
    DrawerContent,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";

export type FilterFacet = {
    key: string;
    label: string;
    count?: number;
    slug?: string;
};

export type FilterGroup = {
    key: string;
    label: string;
    facets: FilterFacet[];
    activeKey: string | null;
    /** Build href preserving other filters */
    hrefFor: (facetKey: string) => string;
    /** "all" label shown when activeKey is null */
    allLabel?: string;
};

/**
 * Shared facet filter bar for public content verticals.
 *
 * Renders filter pills as horizontal nav links on desktop, and collapses
 * into a drawer on mobile. Each group (e.g. "Category", "Location") is
 * rendered as a separate nav so users can combine multiple filters.
 *
 * Replaces the 10+ ad-hoc chip/pill implementations across News, Culture,
 * Notices, Photo Stories, Buy & Sell, and Events pages.
 */
export function FacetFilter({
    groups,
    labels,
}: {
    groups: FilterGroup[];
    locale?: string;
    labels: {
        filterLabel?: string;
        clearFilters?: string;
        allLabel?: string;
    };
}) {
    const [mobileOpen, setMobileOpen] = useState(false);
    const isMobile = useIsMobile();

    const hasActiveFilters = groups.some((g) => g.activeKey != null);

    return (
        <>
            {isMobile ? (
                <>
                    <div className="mb-4 flex items-center justify-between border-b border-border/60 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                            {groups.map((group) => (
                                <FilterNav key={group.key} group={group} />
                            ))}
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setMobileOpen(true)}
                        >
                            <Filter className="h-4 w-4 mr-1" aria-hidden />
                            {labels.filterLabel ?? "Filters"}
                            {hasActiveFilters ? (
                                <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-xs font-bold text-primary-foreground">
                                    {groups.filter((g) => g.activeKey != null).length}
                                </span>
                            ) : null}
                        </Button>
                    </div>
                    <Drawer open={mobileOpen} onOpenChange={setMobileOpen}>
                        <DrawerContent className="h-auto max-h-[80vh]">
                            <DrawerHeader>
                                <DrawerTitle>{labels.filterLabel ?? "Filters"}</DrawerTitle>
                            </DrawerHeader>
                            <div className="p-4 overflow-y-auto">
                                {groups.map((group) => (
                                    <div key={group.key} className="mb-6 last:mb-0">
                                        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                                            {group.label}
                                        </p>
                                        <FilterNav group={group} vertical />
                                    </div>
                                ))}
                                {hasActiveFilters ? (
                                    <Link href={typeof window !== "undefined" ? window.location.pathname : "#"}>
                                        <Button variant="outline" className="w-full">
                                            <X className="h-4 w-4 mr-1" />
                                            {labels.clearFilters ?? "Clear filters"}
                                        </Button>
                                    </Link>
                                ) : null}
                            </div>
                        </DrawerContent>
                    </Drawer>
                </>
            ) : (
                <div className="mb-6 flex flex-wrap items-center gap-2 border-b border-border/60 py-3">
                    {groups.map((group) => (
                        <FilterNav key={group.key} group={group} />
                    ))}
                </div>
            )}
        </>
    );
}

function FilterNav({ group, vertical }: { group: FilterGroup; vertical?: boolean }) {
    const { activeKey, allLabel, facets, hrefFor } = group;

    if (facets.length === 0) return null;

    return (
        <nav
            aria-label={group.label}
            className={
                vertical
                    ? "mb-2 flex flex-col flex-wrap gap-1.5"
                    : "mb-2 flex flex-wrap items-center gap-1.5"
            }
        >
            {(allLabel ?? "All") ? (
                <Link
                    href={hrefFor("")}
                    aria-current={!activeKey ? "page" : undefined}
                    className={
                        vertical
                            ? pillClass(!activeKey)
                            : "rounded-full px-3 py-1.5 text-xs font-bold transition-colors " +
                              (!activeKey
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted text-muted-foreground hover:bg-accent")
                    }
                >
                    {allLabel ?? "All"}
                </Link>
            ) : null}
            {facets.map((facet) => {
                const isActive = activeKey === facet.key;
                return (
                    <Link
                        key={facet.key}
                        href={hrefFor(facet.key)}
                        aria-current={isActive ? "page" : undefined}
                        className={
                            vertical
                                ? pillClass(isActive)
                                : "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors " +
                                  (isActive
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-muted text-muted-foreground hover:bg-accent")
                        }
                    >
                        {facet.label}
                        {facet.count != null && (
                            <span
                                className={
                                    "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-xs font-semibold " +
                                    (isActive
                                        ? "bg-primary-foreground/20"
                                        : "bg-muted-foreground/20")
                                }
                            >
                                {facet.count}
                            </span>
                        )}
                    </Link>
                );
            })}
        </nav>
    );
}

function pillClass(active: boolean): string {
    return (
        "flex items-center justify-between rounded-full border px-3 py-1.5 text-xs font-medium transition-colors " +
        (active
            ? "border-primary bg-primary/10 text-foreground"
            : "border-border text-muted-foreground hover:bg-accent")
    );
}
