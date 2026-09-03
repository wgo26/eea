import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { Dictionary } from "@/lib/i18n";
import type { AdCreative } from "@/lib/queries/home";
import { cn } from "@/lib/utils";

type AdSlotProps = {
  ad: AdCreative | null;
  dict: Dictionary;
  advertiseHref: string;
  /** "banner" = main leaderboard; "strip" = slim inline band; "rail" = tall sidebar; "inline-bottom" = bottom-of-section placement. */
  variant: "banner" | "rail" | "strip" | "inline-bottom";
  className?: string;
};

/** Ad placement (spec §11). Falls back to an "advertise with us" placeholder. */
export function AdSlot({ ad, dict, advertiseHref, variant, className }: AdSlotProps) {
  return (
    <div className={cn("w-full", className)}>
      <p className="mb-1 text-right text-[10px] font-medium uppercase tracking-widest text-muted-foreground/70">
        {dict.home.advertisement}
      </p>
      {ad ? (
        <Link
          href={ad.destinationUrl ?? "#"}
          target="_blank"
          rel="noopener sponsored"
          className="group relative block overflow-hidden rounded-2xl border"
        >
          <div
            className={cn(
              "w-full bg-muted bg-cover bg-center",
              variant === "banner" && "h-28 md:h-36",
              variant === "strip" && "h-24 md:h-28",
              variant === "rail" && "aspect-[3/4]",
              variant === "inline-bottom" && "h-24 md:h-28"
            )}
            style={ad.imageUrl ? { backgroundImage: `url(${ad.imageUrl})` } : undefined}
          >
            <div className="flex h-full items-center gap-3 bg-black/45 p-4 text-white">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold md:text-base">{ad.name}</p>
                {ad.copyText ? (
                  <p className="line-clamp-2 text-xs text-white/85 md:text-sm">{ad.copyText}</p>
                ) : null}
              </div>
              <ExternalLink className="ml-auto h-4 w-4 shrink-0 opacity-70" aria-hidden />
            </div>
          </div>
        </Link>
      ) : (
        <Link
          href={advertiseHref}
          className={cn(
            "flex flex-col items-center justify-center rounded-2xl border border-dashed text-center transition-colors hover:bg-muted/40",
            variant === "banner" && "h-28 gap-1 md:h-36",
            variant === "strip" && "h-24 gap-1 md:h-28",
            variant === "rail" && "aspect-[3/4] gap-2 p-4",
            variant === "inline-bottom" && "h-24 gap-1 md:h-28"
          )}
        >
          <span className="text-sm font-semibold text-muted-foreground">
            {dict.home.yourAdHere}
          </span>
          <span className="text-xs text-link underline-offset-2 hover:underline">
            {dict.home.advertiseWithUs}
          </span>
        </Link>
      )}
    </div>
  );
}
