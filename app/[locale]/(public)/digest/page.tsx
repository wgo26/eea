import type { Metadata } from "next";
import Link from "next/link";

import { getDictionary, resolveLocale } from "@/lib/i18n";
import { buildAlternates, localePath } from "@/lib/i18n/urls";
import { DigestForm } from "@/components/digest/digest-form";
import { getPromotedPitch } from "@/lib/automation/flags";

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
    title: dict.digest.title,
    description: dict.digest.intro,
    alternates: buildAlternates(locale, "/digest"),
  };
}

export default async function DigestPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);
  const dict = getDictionary(locale);
  // E2 — the promoted experiment winner (null while the A/B still runs).
  const promotedPitch = await getPromotedPitch();
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 md:px-6 lg:px-8">
      <header className="mb-6 max-w-2xl">
        <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">{dict.digest.title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">{dict.digest.intro}</p>
      </header>
      <DigestForm dict={dict} locale={locale} promotedPitch={promotedPitch} />
      <p className="mt-6 text-center">
        <Link
          href={localePath(locale, "/digest/archive")}
          className="text-sm font-medium text-link hover:underline"
        >
          {dict.digest.viewArchive}
        </Link>
      </p>
    </div>
  );
}
