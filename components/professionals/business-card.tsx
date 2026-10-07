import Link from "next/link";
import { MapPin, ShieldCheck, Star } from "lucide-react";
import { localePath } from "@/lib/i18n/urls";
import type { Dictionary, Locale } from "@/lib/i18n";
import type { BusinessCard as BusinessCardData } from "@/lib/queries/businesses";
import { RatingStars } from "./reviews";

/**
 * Trusted-professional card: verified badge first (verification is the
 * product), then skills chips, place and listing count.
 */
export function BusinessCard({
  business,
  dict,
  locale,
}: {
  business: BusinessCardData;
  dict: Dictionary;
  locale: Locale;
}) {
  const t = dict.professionals;
  return (
    <Link
      href={localePath(locale, `/professionals/${business.slug}`)}
      className="group flex flex-col gap-2 rounded-2xl border bg-card p-5 transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
          <ShieldCheck className="h-3 w-3" aria-hidden />
          {t.verifiedPro}
        </span>
        {business.isFeatured ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            <Star className="h-3 w-3" aria-hidden />
            {t.featured}
          </span>
        ) : null}
      </span>
      <span className="text-lg font-extrabold tracking-tight group-hover:text-primary">
        {business.name}
      </span>
      {business.description ? (
        <span className="line-clamp-2 text-sm text-muted-foreground">{business.description}</span>
      ) : null}
      {business.skills.length > 0 ? (
        <span className="flex flex-wrap gap-1">
          {business.skills.slice(0, 5).map((s) => (
            <span key={s} className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {s}
            </span>
          ))}
        </span>
      ) : null}
      <RatingStars avg={business.ratingAvg} count={business.ratingCount} copy={t} />
      <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-xs text-muted-foreground">
        {business.location ? (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" aria-hidden />
            {business.location}
          </span>
        ) : null}
        {business.listingCount > 0 ? (
          <span>
            {business.listingCount} · {t.listings.toLowerCase()}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
