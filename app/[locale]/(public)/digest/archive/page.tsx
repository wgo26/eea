import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";

import { formatDate, getDictionary, resolveLocale } from "@/lib/i18n";
import { buildAlternates, localePath } from "@/lib/i18n/urls";
import { getDigestArchive } from "@/lib/queries/digest";

/**
 * A3 — ISR: editorial content, revalidated every 5 minutes (or on demand).
 * The literal is required: segment config must be statically analyzable.
 */
export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale: rawLocale } = await params;

  const locale = resolveLocale(rawLocale);
  const dict = getDictionary(locale);
  return {
    title: dict.digest.archiveTitle,
    description: dict.digest.archiveDescription,
    alternates: buildAlternates(locale, "/digest/archive"),
  };
}

/** Public digest archive (features.md §newsletter): past issues of the daily digest. */
export default async function DigestArchivePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;

  const locale = resolveLocale(rawLocale);
  const dict = getDictionary(locale);
  const issues = await getDigestArchive(locale);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 md:px-6 lg:px-8">
      <Link
        href={localePath(locale, "/digest")}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {dict.common.back}
      </Link>

      <header className="mb-8 mt-4 max-w-2xl">
        <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">{dict.digest.archiveTitle}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">{dict.digest.archiveDescription}</p>
      </header>

      {issues.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {dict.digest.archiveEmpty}
        </p>
      ) : (
        <ul className="space-y-3">
          {issues.map((issue) => (
            <li key={`${issue.sentOn}-${issue.subject}`} className="rounded-2xl border bg-card p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-bold">
                  <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  {issue.subject}
                </h2>
                <time dateTime={issue.sentOn} className="text-xs text-muted-foreground">
                  {formatDate(issue.sentOn, locale)}
                </time>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {dict.digest.archiveStories.replace("{count}", String(issue.stories.length))}
              </p>
              {issue.stories.length > 0 ? (
                <ul className="mt-3 space-y-1.5">
                  {issue.stories.map((story, i) => (
                    <li key={`${story.path}-${i}`}>
                      <Link href={localePath(locale, story.path)} className="text-sm text-link hover:underline">
                        {story.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}