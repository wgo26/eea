'use client'

import { Check, X } from 'lucide-react'
import type { Dictionary } from '@/lib/i18n'

type Copy = Dictionary['admin']['content']

export type ReadinessCheck = {
    key: string;
    label: string;
    passed: boolean;
};

type Props = {
    copy: Copy;
    checks: ReadinessCheck[];
};

/**
 * Renders a publish-readiness checklist below the content form in create/edit
 * dialogs. Each check is a row with a pass/fail icon; the overall status drives
 * the "Publish" button disabled state and inline warning.
 */
export function PublishReadiness({ copy: _copy, checks }: Props) {
    const passed = checks.every((c) => c.passed);
    const failedCount = checks.filter((c) => !c.passed).length;

    return (
        <div className="mb-4 rounded-md border border-border bg-muted/30 p-4">
            <p className="mb-3 text-sm font-medium">
                {passed ? _copy.readinessReady : _copy.readinessMissing.replace('{n}', String(failedCount))}
            </p>
            <ul className="space-y-1.5">
                {checks.map((check) => (
                    <li
                        key={check.key}
                        className="flex items-center gap-2 text-sm"
                    >
                        {check.passed ? (
                            <Check className="h-3 w-3 text-emerald-600" aria-hidden />
                        ) : (
                            <X className="h-3 w-3 text-red-600" aria-hidden />
                        )}
                        <span className={check.passed ? 'text-foreground' : 'text-muted-foreground'}>
                            {check.label}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

/**
 * Builds the standard publish-readiness checks for a content item.
 * Used by both the create and edit dialogs.
 */
export function buildReadinessChecks(
    type: string,
    enTitle: string,
    frTitle: string,
    locationId: string,
    categoryId: string,
    hasCoverPhoto: boolean,
    excerpt: string,
    copy: Copy,
): ReadinessCheck[] {
    return [
        {
            key: 'title',
            label: copy.readinessNeedsTitle,
            passed: Boolean(enTitle.trim()),
        },
        {
            key: 'translation',
            label: copy.readinessNeedsTranslation,
            passed: Boolean(frTitle.trim()),
        },
        {
            key: 'location',
            label: copy.readinessNeedsLocation,
            passed: Boolean(locationId),
        },
        {
            key: 'category',
            label: copy.readinessNeedsCategory,
            passed: Boolean(categoryId),
        },
        {
            key: 'photo',
            label: copy.readinessNeedsPhoto,
            passed: hasCoverPhoto,
        },
        {
            key: 'excerpt',
            label: copy.readinessNeedsExcerpt,
            passed: Boolean(excerpt.trim()),
        },
    ];
}
