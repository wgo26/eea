/**
 * Submission type → content type (client-safe: no server imports).
 *
 * Lives in lib/content rather than lib/admin/actions/_shared.ts because the
 * review screen needs it on the client to decide which form fields and which
 * category list a submission maps to — and `server-only` cannot be imported
 * from a component. The server action imports the same table, so the two sides
 * of the review loop can no longer disagree about what `buy_sell` becomes.
 */
export const SUBMISSION_TO_CONTENT = {
  photo_story: 'photo_story',
  news: 'news',
  culture: 'culture',
  notice: 'notice',
  buy_sell: 'listing',
} as const

export type SubmissionType = keyof typeof SUBMISSION_TO_CONTENT

/** Narrow an arbitrary `submissions.submission_type` string. */
export function asSubmissionType(value: string): SubmissionType | null {
  return Object.hasOwn(SUBMISSION_TO_CONTENT, value) ? (value as SubmissionType) : null
}

/** The content type a submission will become, or null when it is unknown. */
export function contentTypeForSubmission(value: string): string | null {
  const t = asSubmissionType(value)
  return t ? SUBMISSION_TO_CONTENT[t] : null
}
