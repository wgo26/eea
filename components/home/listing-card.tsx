import Link from "next/link";
import { MapPin } from "lucide-react";
import { formatDate, type Dictionary, type Locale } from "@/lib/i18n";
import type { StoryCardData } from "@/lib/queries/home";

function formatPrice(
  price: number | null | undefined,
  currency: string | null | undefined,
  locale: Locale,
  freeLabel: string
): string | null {
  if (price == null) return null;
  if (price === 0) return freeLabel;
  try {
    return new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-GB", {
      style: "currency",
      currency: currency || "XAF",
      maximumFractionDigits: 0,
    }).format(price);
  } catch {
    return `${price} ${currency ?? ""}`.trim();
  }
}

/** Buy & Sell preview card — price-first, with location and posting date. */
export function ListingCard({
  listing,
  dict,
  locale,
}: {
  listing: StoryCardData;
  dict: Dictionary;
  locale: Locale;
}) {
  const price = formatPrice(listing.price, listing.currency, locale, dict.home.free);
  return (
    <Link
      href={listing.href}
      className="group block overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-md"
    >
      <div
        className="relative aspect-[4/3] w-full bg-muted bg-cover bg-center"
        style={listing.imageUrl ? { backgroundImage: `url(${listing.imageUrl})` } : undefined}
        role="img"
        aria-label={listing.title}
      >
        {price ? (
          <span className="absolute bottom-2 left-2 rounded-full bg-black/75 px-3 py-1 text-sm font-bold text-white backdrop-blur">
            {price}
          </span>
        ) : null}
      </div>
      <div className="p-3">
        <p className="line-clamp-2 text-sm font-semibold leading-snug group-hover:underline">
          {listing.title}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {listing.location ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" aria-hidden />
              {listing.location}
            </span>
          ) : null}
          {listing.publishedAt ? <span>{formatDate(listing.publishedAt, locale)}</span> : null}
        </div>
      </div>
    </Link>
  );
}
