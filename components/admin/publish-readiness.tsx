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
 * Compact publish-readiness checklist rendered inside the form's Publishing
 * section. Each check is a row with a pass/fail icon; the overall status
 * drives the "Publish" button disabled state (computed by the caller).
 */
export function PublishReadiness({ copy, checks }: Props) {
    const passed = checks.every((c) => c.passed);
    const failedCount = checks.filter((c) => !c.passed).length;

    return (
        <div className="rounded-md border border-border bg-muted/30 p-3">
            <p className="mb-2 text-sm font-medium">
                {passed ? copy.readinessReady : copy.readinessMissing.replace('{n}', String(failedCount))}
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
    opts?: {
        seoDescription?: string;
        tags?: string;
        contactPhone?: string;
        contactEmail?: string;
        whatsappNumber?: string;
        organizationName?: string;
        noticeType?: string;
    }
): ReadinessCheck[] {
    const checks: ReadinessCheck[] = [
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

    // Type-specific checks
    if (type === 'listing') {
        if (opts?.contactPhone) {
            checks.push({
                key: 'contactPhone',
                label: copy.readinessNeedsPhone,
                passed: Boolean(opts.contactPhone.trim()),
            });
        }
        if (opts?.contactEmail) {
            checks.push({
                key: 'contactEmail',
                label: copy.readinessNeedsEmail,
                passed: Boolean(opts.contactEmail.trim()) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(opts.contactEmail.trim()),
            });
        }
    }

    if (type === 'notice') {
        if (opts?.organizationName) {
            checks.push({
                key: 'organization',
                label: copy.readinessNeedsOrganization,
                passed: Boolean(opts.organizationName.trim()),
            });
        }
        if (opts?.noticeType) {
            checks.push({
                key: 'noticeType',
                label: copy.readinessNeedsNoticeType,
                passed: Boolean(opts.noticeType.trim()),
            });
        }
    }

    if (type === 'news' || type === 'photo_story' || type === 'micro_story') {
        if (opts?.seoDescription) {
            checks.push({
                key: 'seo',
                label: copy.readinessNeedsSeo,
                passed: Boolean(opts.seoDescription.trim()),
            });
        }
    }

    // General: tags if provided
    if (opts?.tags) {
        const tagCount = opts.tags.split(',').filter(t => t.trim()).length;
        if (tagCount > 0) {
            checks.push({
                key: 'tags',
                label: copy.readinessNeedsTags,
                passed: tagCount >= 1,
            });
        }
    }

    return checks;
}
