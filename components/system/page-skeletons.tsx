import { cn } from "@/lib/utils";

/**
 * Brand mark: the "eye" aperture — concentric rings with a gold iris.
 * The signature Eagle Eye gesture, used on loading states and (later) the
 * About hero and 404 so every wait state still feels like the product.
 */
export function ApertureMark({ className }: { className?: string }) {
    return (
        <span
            aria-hidden
            className={cn("relative inline-flex items-center justify-center", className)}
        >
            <span className="absolute inset-0 rounded-full border border-primary/25" />
            <span className="absolute inset-[18%] rounded-full border border-primary/45" />
            <span className="absolute inset-[36%] rounded-full bg-primary/90" />
            <span className="absolute inset-[46%] rounded-full bg-background/90" />
        </span>
    );
}

/**
 * Loading-state skeletons (checklist item: no page should ever navigate to a
 * blank screen). Each shell gets its own rhythm so the wait state already
 * previews the destination: editorial grids for public, stat+table for
 * admin, greeting+panels for account, a centered card for focused screens.
 * Built on the shadcn Skeleton primitive (components/ui/skeleton.tsx).
 */

function ShimmerLine({ className }: { className?: string }) {
    return <div className={cn("h-4 animate-pulse rounded-md bg-muted", className)} />;
}

function ShimmerCard({ className, children }: { className?: string; children?: React.ReactNode }) {
    return (
        <div className={cn("rounded-2xl border border-border bg-card p-5", className)}>
            {children}
        </div>
    );
}

/**
 * Public page skeleton — mirrors the editorial page rhythm (page title,
 * lead block, card grids) without pretending to know the exact layout.
 */
export function PublicPageSkeleton() {
    return (
        <div className="mx-auto w-full max-w-7xl space-y-10 px-4 py-8 md:px-6">
            <div className="space-y-3">
                <ShimmerLine className="h-8 w-64 max-w-full" />
                <ShimmerLine className="h-4 w-96 max-w-full" />
            </div>
            <ShimmerCard className="flex flex-col gap-4 md:flex-row">
                <div className="h-44 w-full animate-pulse rounded-xl bg-muted md:h-56 md:w-72" />
                <div className="flex-1 space-y-3">
                    <div className="h-5 w-24 rounded-full bg-primary/30" />
                    <ShimmerLine className="h-6 w-3/4" />
                    <ShimmerLine className="h-4 w-full" />
                    <ShimmerLine className="h-4 w-5/6" />
                    <ShimmerLine className="h-4 w-2/3" />
                </div>
            </ShimmerCard>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                    <ShimmerCard key={i} className="space-y-3">
                        <div className="h-32 w-full animate-pulse rounded-xl bg-muted" />
                        <ShimmerLine className="h-5 w-4/5" />
                        <ShimmerLine className="h-4 w-1/2" />
                    </ShimmerCard>
                ))}
            </div>
        </div>
    );
}

/**
 * Admin page skeleton — command-center rhythm: header, stat grid, table.
 */
export function AdminPageSkeleton() {
    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <ShimmerLine className="h-7 w-56 max-w-full" />
                <ShimmerLine className="h-4 w-80 max-w-full" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <ShimmerCard key={i} className="space-y-3">
                        <ShimmerLine className="h-3 w-20" />
                        <ShimmerLine className="h-8 w-16" />
                    </ShimmerCard>
                ))}
            </div>
            <div className="flex gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-8 w-24 animate-pulse rounded-full bg-muted" />
                ))}
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
                <div className="bg-muted/50 border-b border-border px-4 py-3">
                    <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                </div>
                <div className="divide-y divide-border">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-4 px-4 py-3">
                            <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-muted" />
                            <div className="h-4 flex-1 animate-pulse rounded bg-muted" />
                            <div className="hidden h-4 w-24 animate-pulse rounded bg-muted sm:block" />
                            <div className="hidden h-4 w-16 animate-pulse rounded bg-muted md:block" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

/**
 * Account page skeleton — personal-workspace rhythm: greeting, stat grid,
 * activity panel.
 */
export function AccountPageSkeleton() {
    return (
        <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 md:px-6 lg:py-12">
            <ShimmerCard className="space-y-3">
                <ShimmerLine className="h-3 w-32" />
                <ShimmerLine className="h-8 w-64 max-w-full" />
                <ShimmerLine className="h-4 w-80 max-w-full" />
            </ShimmerCard>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <ShimmerCard key={i} className="space-y-3">
                        <ShimmerLine className="h-3 w-24" />
                        <ShimmerLine className="h-9 w-14" />
                        <ShimmerLine className="h-3 w-28" />
                    </ShimmerCard>
                ))}
            </div>
            <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                <ShimmerCard className="space-y-4">
                    <ShimmerLine className="h-5 w-40" />
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="flex items-center justify-between rounded-xl bg-muted/40 p-3">
                            <div className="space-y-2">
                                <ShimmerLine className="h-4 w-32" />
                                <ShimmerLine className="h-3 w-24" />
                            </div>
                            <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
                        </div>
                    ))}
                </ShimmerCard>
                <ShimmerCard className="space-y-4">
                    <ShimmerLine className="h-5 w-40" />
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="flex items-center justify-between rounded-xl bg-muted/40 p-3">
                            <ShimmerLine className="h-4 w-36" />
                            <div className="h-4 w-4 animate-pulse rounded bg-muted" />
                        </div>
                    ))}
                </ShimmerCard>
            </div>
        </div>
    );
}

/**
 * Focused (auth/submit) skeleton — minimal, centered card only.
 */
export function FocusedPageSkeleton() {
    return (
        <div className="flex min-h-[70vh] items-center justify-center px-4">
            <div className="w-full max-w-md space-y-5 rounded-3xl border border-border bg-card p-8 shadow-sm">
                <ApertureMark className="mx-auto h-12 w-12" />
                <div className="space-y-2 text-center">
                    <div className="mx-auto h-6 w-40 animate-pulse rounded bg-muted" />
                    <div className="mx-auto h-4 w-64 max-w-full animate-pulse rounded bg-muted" />
                </div>
                <div className="space-y-3">
                    <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
                    <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
                    <div className="h-10 w-full animate-pulse rounded-md bg-primary/40" />
                </div>
            </div>
        </div>
    );
}