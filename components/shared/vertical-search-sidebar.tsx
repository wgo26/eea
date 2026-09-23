import Link from "next/link";
import { Search, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/lib/i18n";
import type { LocationFacet } from "@/lib/queries/locations";

type HiddenParam = { name: string; value: string };

type Props = {
    locale: Locale;
    actionPath: string;
    searchLabel: string;
    searchPlaceholder?: string;
    searchDefaultValue?: string;
    hiddenParams?: HiddenParam[];
    locations?: LocationFacet[];
    locationLabel?: string;
    allLocationsLabel?: string;
    activeLocation?: string | null;
    /**
     * Precomputed hrefs, one per location slug (built server-side).
     * A closure prop here would cross the server/client boundary the moment
     * this component (or any child) becomes a Client Component — see the
     * FacetFilter contract. Keep props data-only.
     */
    locationHrefs?: { slug: string; href: string }[];
    /** Href that clears the location filter. */
    clearLocationHref?: string;
    clearHref?: string;
    clearLabel?: string;
    isFiltered?: boolean;
};

/**
 * Shared search + location sidebar for public content verticals.
 * Consolidates the near-identical search form + location list markup
 * that was duplicated across News, Notices, Photo Stories, and Buy & Sell.
 */
export function VerticalSearchSidebar({
    locale,
    actionPath,
    searchLabel,
    searchPlaceholder = "",
    searchDefaultValue = "",
    hiddenParams = [],
    locations,
    locationLabel,
    allLocationsLabel,
    activeLocation,
    locationHrefs,
    clearLocationHref,
    clearHref,
    clearLabel,
    isFiltered,
}: Props) {
    return (
        <aside className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
                        {searchLabel}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <form
                        action={`/${locale}${actionPath}`}
                        method="GET"
                        role="search"
                        className="space-y-2"
                    >
                        {hiddenParams.map((p) => (
                            <input key={p.name} type="hidden" name={p.name} value={p.value} />
                        ))}
                        <Input
                            type="search"
                            name="q"
                            defaultValue={searchDefaultValue}
                            placeholder={searchPlaceholder}
                            aria-label={searchLabel}
                        />
                        <Button type="submit" className="w-full">
                            <Search data-icon="inline-start" aria-hidden />
                            {searchLabel}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            {locations && locations.length > 0 && locationLabel && locationHrefs ? (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden />
                            {locationLabel}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul className="flex flex-wrap gap-1.5">
                            {locations.map((loc) => (
                                <li key={loc.slug}>
                                    <Link
                                        href={locationHrefs.find((h) => h.slug === loc.slug)?.href ?? "#"}
                                        aria-current={activeLocation === loc.slug ? "page" : undefined}
                                        className={`inline-block rounded-full border px-2.5 py-1 text-xs transition-colors hover:bg-muted ${
                                            activeLocation === loc.slug
                                                ? "border-primary bg-primary/10 font-semibold text-foreground"
                                                : "text-muted-foreground"
                                        }`}
                                    >
                                        {loc.name}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                        {activeLocation && clearLocationHref ? (
                            <Link
                                href={clearLocationHref}
                                className="mt-2 block text-xs font-semibold text-muted-foreground underline-offset-4 hover:underline"
                            >
                                {allLocationsLabel ?? "All locations"}
                            </Link>
                        ) : null}
                    </CardContent>
                </Card>
            ) : null}

            {isFiltered && clearHref && clearLabel ? (
                <Link href={clearHref}>
                    <Button variant="outline" className="w-full">
                        {clearLabel}
                    </Button>
                </Link>
            ) : null}
        </aside>
    );
}
