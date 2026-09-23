import type { Metadata } from "next";
import { Sparkles } from "lucide-react";

import { getDictionary, resolveLocale } from "@/lib/i18n";
import { buildAlternates } from "@/lib/i18n/urls";

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
    title: dict.changelog.title,
    description: dict.changelog.description,
    alternates: buildAlternates(locale, "/changelog"),
  };
}

/**
 * W22 — public changelog (reciprocity loop: contributors see the platform
 * improving). Entries ship in the dictionaries so both locales always have
 * copy; newest first.
 */
export default async function ChangelogPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;

  const locale = resolveLocale(rawLocale);
  const dict = getDictionary(locale);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 md:px-6 lg:px-8">
      <header className="mb-8 max-w-2xl">
        <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">{dict.changelog.title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">
          {dict.changelog.description}
        </p>
      </header>

      <ul className="space-y-3">
        {dict.changelog.entries.map((entry) => (
          <li key={`${entry.date}-${entry.version}`} className="rounded-2xl border bg-card p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-bold">
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                {entry.version}
              </h2>
              <time className="text-xs tabular-nums text-muted-foreground">{entry.date}</time>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{entry.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
