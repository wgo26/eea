import Link from "next/link";
import {
  ArrowUpRight,
  Camera,
  MapPin,
  Megaphone,
  Newspaper,
  Palette,
  Tag,
} from "lucide-react";
import type { Dictionary } from "@/lib/i18n";
import { SectionHeader } from "@/components/home/section-header";

type ExploreTilesProps = {
  dict: Dictionary;
  hrefs: {
    photoStories: string;
    news: string;
    notices: string;
    buySell: string;
    culture: string;
    locations: string;
  };
};

/**
 * Quick-navigation tiles (spec §1A — the homepage is a hub, not a
 * destination): one tap into every content vertical and the location index.
 */
export function ExploreTiles({ dict, hrefs }: ExploreTilesProps) {
  const tiles = [
    { href: hrefs.photoStories, label: dict.nav.photoStories, Icon: Camera },
    { href: hrefs.news, label: dict.nav.news, Icon: Newspaper },
    { href: hrefs.notices, label: dict.nav.notices, Icon: Megaphone },
    { href: hrefs.buySell, label: dict.nav.buySell, Icon: Tag },
    { href: hrefs.culture, label: dict.nav.culture, Icon: Palette },
    { href: hrefs.locations, label: dict.nav.locations, Icon: MapPin },
  ];

  return (
    <section>
      <SectionHeader title={dict.home.exploreTitle} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex flex-col gap-3 rounded-2xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/40"
          >
            <Icon className="h-5 w-5 text-primary" aria-hidden />
            <span className="flex items-center justify-between gap-2 text-sm font-semibold leading-snug">
              {label}
              <ArrowUpRight
                className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                aria-hidden
              />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}