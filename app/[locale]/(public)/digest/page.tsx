import type { Metadata } from "next";
import { headers } from "next/headers";

import { getDictionary, resolveLocale } from "@/lib/i18n";
import { buildAlternates } from "@/lib/i18n/urls";
import { DigestForm } from "@/components/digest/digest-form";

export async function generateMetadata(): Promise<Metadata> {
  const locale = resolveLocale((await headers()).get("x-locale"));
  const dict = getDictionary(locale);
  return {
    title: dict.digest.title,
    description: dict.digest.intro,
    alternates: buildAlternates(locale, "/digest"),
  };
}

export default async function DigestPage() {
  const locale = resolveLocale((await headers()).get("x-locale"));
  const dict = getDictionary(locale);
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 md:px-6 lg:px-8">
      <header className="mb-6 max-w-2xl">
        <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">{dict.digest.title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">{dict.digest.intro}</p>
      </header>
      <DigestForm dict={dict} locale={locale} />
    </div>
  );
}
