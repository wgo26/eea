import { MapPin } from "lucide-react";
import { formatDate, type Dictionary, type Locale } from "@/lib/i18n";
import type { StoryCardData } from "@/lib/queries/home";
import { CARD_SIZES, SmartImage } from "@/components/media/smart-image";
import { SaveButton } from "@/components/system/save-button";
import {
    CardCover,
    CardMeta,
    CardMetaItem,
    CardShell,
    CardTitle,
} from "@/components/home/card-parts";

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
  showSave = true,
}: {
  listing: StoryCardData;
  dict: Dictionary;
  locale: Locale;
  /** Show the favorites heart (overlay, outside the card link). */
  showSave?: boolean;
}) {
  const price = formatPrice(listing.price, listing.currency, locale, dict.home.free);
  return (
    <div className="relative">
    <CardShell href={listing.href}>
      <CardCover aspect="aspect-[4/3]">
        {listing.imageUrl ? (
          <SmartImage
            src={listing.imageUrl}
            alt={listing.title}
            sizes={CARD_SIZES}
            className="object-cover transition-transform duration-300 ease-standard group-hover:scale-[1.03]"
          />
        ) : null}
        {price ? (
          <span className="absolute bottom-2 left-2 rounded-full bg-black/75 px-3 py-1 text-sm font-bold text-white backdrop-blur">
            {price}
          </span>
        ) : null}
      </CardCover>
      <div className="p-3">
        <CardTitle size="sm" className="font-semibold">
          {listing.title}
        </CardTitle>
        <CardMeta className="mt-1.5">
          {listing.location ? (
            <CardMetaItem icon={MapPin}>{listing.location}</CardMetaItem>
          ) : null}
          {listing.publishedAt ? <span>{formatDate(listing.publishedAt, locale)}</span> : null}
        </CardMeta>
      </div>
    </CardShell>
    {showSave ? (
      <SaveButton
        contentItemId={listing.id}
        variant="heart"
        labels={{
          save: dict.common.saveForLater,
          unsave: dict.common.removeSaved,
          savedMessage: dict.common.savedToList,
          removedMessage: dict.common.removedFromList,
          signIn: dict.common.signInToSave,
        }}
        className="absolute right-2 top-2"
      />
    ) : null}
    </div>
  );
}
