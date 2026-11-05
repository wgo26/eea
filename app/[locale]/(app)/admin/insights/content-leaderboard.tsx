'use client';

import { useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { localePath } from '@/lib/i18n/urls';
import { contentPublicPath } from '@/lib/content/public-path';
import {
    metricHasData,
    rankRows,
    shareRatePer100,
    type LeaderboardMetric,
    type LeaderboardRow,
} from '@/lib/admin/content-ranking';

export type LeaderboardCopy = {
    leaderboardTitle: string;
    topViewedTitle: string;
    topSharedTitle: string;
    colViews: string;
    colShares: string;
    colProof: string;
    proofVisible: string;
    proofHidden: string;
    emptyTop: string;
    per100Views: string;
    colRank: string;
    lifetimeNote: string;
    zeroMetricNote: string;
    openEditor: string;
    viewLive: string;
};

/**
 * One board, two rankings.
 *
 * This used to be two sibling tables rendered by the same component: same
 * columns, same chrome, only the ordering differing — so "Top shared" read as
 * a stale copy of "Top viewed". Swapping to an explicit metric switch means
 * the colour, the bars and the order all change together, and a shares sort
 * with no data says so instead of silently echoing the views order.
 *
 * Server-rendered apart from the switch: the first paint is always the views
 * ranking, and every number required to trust it is in the markup already.
 */
export function ContentLeaderboard({
    rows,
    locale,
    typeLabels,
    copy,
}: {
    rows: LeaderboardRow[];
    locale: 'en' | 'fr';
    /** admin.common.types slice — same lookup as localizeType() in lib/admin/labels. */
    typeLabels: Record<string, string>;
    copy: LeaderboardCopy;
}) {
    const [metric, setMetric] = useState<LeaderboardMetric>('views');

    if (rows.length === 0) {
        return <p className="text-sm text-muted-foreground">{copy.emptyTop}</p>;
    }

    const ranked = rankRows(rows, metric);
    const hasData = metricHasData(ranked, metric);
    const max = Math.max(1, ...ranked.map((r) => r[metric]));

    return (
        <div className="space-y-3">
            {/* Metric switch + the sentence that names the active ordering. */}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div
                    role="group"
                    aria-label={copy.leaderboardTitle}
                    className="inline-flex rounded-lg border border-border p-0.5"
                >
                    {(['views', 'shares'] as const).map((m) => (
                        <button
                            key={m}
                            type="button"
                            onClick={() => setMetric(m)}
                            aria-pressed={metric === m}
                            className={cn(
                                'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                metric === m
                                    ? m === 'views'
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-emerald-600 text-white'
                                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                            )}
                        >
                            {m === 'views' ? copy.colViews : copy.colShares}
                        </button>
                    ))}
                </div>
                <p className="text-xs text-muted-foreground">
                    {metric === 'views' ? copy.topViewedTitle : copy.topSharedTitle}
                </p>
            </div>

            {!hasData && (
                <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    {copy.zeroMetricNote}
                </p>
            )}

            <ol
                className="space-y-2"
                aria-label={metric === 'views' ? copy.topViewedTitle : copy.topSharedTitle}
            >
                {ranked.map((row, index) => {
                    const livePath = contentPublicPath({ type: row.type, id: row.id, slug: row.slug });
                    const value = row[metric];
                    const other = metric === 'views' ? row.shares : row.views;
                    const rate = shareRatePer100(row.views, row.shares);
                    return (
                        <li
                            key={row.id}
                            className="group rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent/40"
                        >
                            <div className="flex items-start gap-3">
                                <span
                                    className={cn(
                                        'mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums',
                                        index === 0
                                            ? 'bg-amber-500 text-white'
                                            : index === 1
                                                ? 'bg-slate-400 text-white'
                                                : index === 2
                                                    ? 'bg-orange-600 text-white'
                                                    : 'bg-muted text-muted-foreground',
                                    )}
                                >
                                    <span aria-hidden>{index + 1}</span>
                                    <span className="sr-only">
                                        {copy.colRank} {index + 1}
                                    </span>
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                        <Link
                                            href={`${localePath(locale, '/admin/content')}?edit=${row.id}`}
                                            title={copy.openEditor}
                                            className="truncate text-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        >
                                            {row.title}
                                        </Link>
                                        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                            {typeLabels[row.type] ?? row.type.replace(/_/g, ' ')}
                                        </span>
                                        {livePath && (
                                            <a
                                                href={localePath(locale, livePath)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                title={copy.viewLive}
                                                aria-label={`${copy.viewLive} — ${row.title}`}
                                                className="rounded p-0.5 text-muted-foreground opacity-70 transition-opacity hover:bg-accent hover:text-foreground hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                            >
                                                <span aria-hidden>↗</span>
                                            </a>
                                        )}
                                    </div>

                                    {/* Relative-to-leader bar: the part that makes the
                                        active metric impossible to miss at a glance. */}
                                    <div className="mt-2 flex items-center gap-2.5">
                                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                                            <div
                                                className={cn(
                                                    'h-full rounded-full transition-[width] duration-500',
                                                    metric === 'views' ? 'bg-blue-600' : 'bg-emerald-600',
                                                )}
                                                style={{
                                                    width: `${
                                                        value > 0 ? Math.max(4, (value / max) * 100) : 0
                                                    }%`,
                                                }}
                                            />
                                        </div>
                                        <span
                                            className={cn(
                                                'shrink-0 text-sm font-semibold tabular-nums',
                                                metric === 'views'
                                                    ? 'text-blue-700 dark:text-blue-400'
                                                    : 'text-emerald-700 dark:text-emerald-400',
                                            )}
                                        >
                                            {value.toLocaleString()}
                                        </span>
                                    </div>

                                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                        <span className="tabular-nums">
                                            {metric === 'views' ? copy.colShares : copy.colViews}:{' '}
                                            {other.toLocaleString()}
                                        </span>
                                        <span className="tabular-nums">
                                            {rate != null ? `${rate}` : '—'} {copy.per100Views}
                                        </span>
                                        <span
                                            title={copy.colProof}
                                            className={cn(
                                                'rounded-full px-2 py-0.5 font-semibold',
                                                row.viewsPublic || row.sharesPublic
                                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                                                    : 'bg-muted text-muted-foreground',
                                            )}
                                        >
                                            {row.viewsPublic || row.sharesPublic
                                                ? copy.proofVisible
                                                : copy.proofHidden}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </li>
                    );
                })}
            </ol>

            <p className="text-xs text-muted-foreground">{copy.lifetimeNote}</p>
        </div>
    );
}