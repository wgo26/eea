"use client";

import { createContext, useContext, useMemo } from "react";
import type { LocationFacet } from "@/lib/queries/locations";

type LocationContextValue = {
    locations: LocationFacet[];
    /** The currently active location slug (from URL), or null. */
    activeLocation: string | null;
    /** Build a URL that sets or clears the location facet. */
    locationHref: (slug: string | null) => string;
};

const LocationContext = createContext<LocationContextValue>({
    locations: [],
    activeLocation: null,
    locationHref: () => "#",
});

/**
 * Provides location facet data + active location + href builder to descendant
 * components. Populated server-side by the page via `LocationProvider` props.
 * This lets <FacetFilter> and any future location-aware widget read location
 * data without each component independently fetching the same list.
 */
export function LocationProvider({
    locations,
    activeLocation,
    locationHref,
    children,
}: LocationContextValue & { children: React.ReactNode }) {
    const value = useMemo<LocationContextValue>(
        () => ({ locations, activeLocation, locationHref }),
        [locations, activeLocation, locationHref],
    );
    return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocationContext(): LocationContextValue {
    return useContext(LocationContext);
}
