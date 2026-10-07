import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { buildAlternates, localePath } from "@/lib/i18n/urls";
import { getDictionary, resolveLocale } from "@/lib/i18n";
import { getBusinesses } from "@/lib/queries/businesses";
import { BusinessCard } from "@/components/professionals/business-card";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);
  const dict = getDictionary(locale);
  return {
    title: dict.professionals.title,
    description: dict.professionals.intro,
    alternates: buildAlternates(locale, "/professionals"),
  };
}

type SearchParams = { q?: string | string[]; location?: string | string[] };

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ProfessionalsPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale: rawLocale } = await routeParams;
  const locale = resolveLocale(rawLocale);
  const dict = getDictionary(locale);
  const t = dict.professionals;

  const params = await searchParams;
  const q = firstParam(params.q)?.trim() || undefined;
  const location = firstParam(params.location)?.trim() || undefined;

  const businesses = await getBusinesses({ search: q, locationSlug: location });
  const locations = [
    ...new Map(
      businesses.filter((b) => b.location).map((b) => [b.location!, b.locationSlug ?? b.location!]),
    ).entries(),
  ].map(([name, slug]) => ({ name, slug }));

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6 lg:px-8">
      <header className="mb-8">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white">
            <ShieldCheck className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">{t.title}</h1>
            <p className="text-sm text-muted-foreground">{t.tagline}</p>
          </div>
        </div>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">{t.intro}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={localePath(locale, "/professionals/claim")}
            className="inline-flex min-h-[44px] items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            {t.claimTitle}
          </Link>
        </div>
      </header>

      <form method="get" className="mb-6 flex flex-wrap gap-2" role="search">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder={t.searchPlaceholder}
          aria-label={t.searchPlaceholder}
          className="h-10 min-h-[44px] min-w-52 flex-1 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          className="min-h-[44px] rounded-md border border-border px-4 text-sm font-medium hover:bg-accent"
        >
          {dict.common.search}
        </button>
      </form>

      {locations.length > 0 ? (
        <nav aria-label={t.basedIn} className="mb-8 flex flex-wrap items-center gap-1.5">
          <Link
            href={localePath(locale, `/professionals${q ? `?q=${encodeURIComponent(q)}` : ""}`)}
            aria-current={!location ? "page" : undefined}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
              !location ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {t.allLocations}
          </Link>
          {locations.map((loc) => (
            <Link
              key={loc.slug}
              href={localePath(
                locale,
                `/professionals?${q ? `q=${encodeURIComponent(q)}&` : ""}location=${encodeURIComponent(loc.slug)}`,
              )}
              aria-current={location === loc.slug ? "page" : undefined}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                location === loc.slug
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              {loc.name}
            </Link>
          ))}
        </nav>
      ) : null}

      {businesses.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-12 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
            <ShieldCheck className="h-6 w-6" aria-hidden />
          </span>
          <p className="mt-4 text-sm text-muted-foreground">{t.empty}</p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {businesses.map((b) => (
            <BusinessCard key={b.id} business={b} dict={dict} locale={locale} />
          ))}
        </div>
      )}
    </div>
  );
}
