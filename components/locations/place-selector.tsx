"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, ChevronDown, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { localePath } from "@/lib/i18n/urls";
import type { Locale } from "@/lib/i18n";
import type { ChromeStrings } from "@/lib/i18n/chrome";
import { LocationData } from "@/lib/queries/locations";
import { Button } from "@/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Dialog,
    DialogContent,
    DialogTrigger,
} from "@/components/ui/dialog";

type PlaceSelectorProps = {
    locale: Locale;
    dict: ChromeStrings["locations"];
    initialPlace?: LocationData | null;
    onPlaceChange?: (place: LocationData | null) => void;
};

const PLACE_COOKIE = "eea-place";

function getPlaceFromCookie(): LocationData | null {
    try {
        const cookieValue = document.cookie
            .split("; ")
            .find((row) => row.startsWith(`${PLACE_COOKIE}=`))
            ?.split("=")[1];
        if (cookieValue) {
            return JSON.parse(decodeURIComponent(cookieValue)) as LocationData;
        }
    } catch {
        // invalid cookie
    }
    return null;
}

function setPlaceCookie(place: LocationData | null): void {
    if (place) {
        document.cookie = `${PLACE_COOKIE}=${encodeURIComponent(JSON.stringify(place))}; path=/; max-age=31536000; SameSite=Lax`;
    } else {
        document.cookie = `${PLACE_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
    }
}

export function PlaceSelector({ locale, dict, initialPlace, onPlaceChange }: PlaceSelectorProps) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [selectedPlace, setSelectedPlace] = useState<LocationData | null>(() => {
        if (initialPlace) return initialPlace;
        return getPlaceFromCookie();
    });
    const [searchQuery, setSearchQuery] = useState("");
    const [places, setPlaces] = useState<LocationData[]>([]);
    const [loading, setLoading] = useState(true);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        async function loadPlaces() {
            try {
                const res = await fetch(localePath(locale, "/api/places"));
                if (res.ok) {
                    const data = await res.json();
                    setPlaces(data.places ?? []);
                }
            } catch (err) {
                console.error("Failed to load places:", err);
            } finally {
                setLoading(false);
            }
        }
        loadPlaces();
    }, [locale]);

    const filteredPlaces = places.filter(
        (p) =>
            p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.parentName?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    function handleSelectPlace(place: LocationData | null) {
        setSelectedPlace(place);
        onPlaceChange?.(place);
        setPlaceCookie(place);
        setOpen(false);
        setSearchQuery("");
        router.refresh();
    }

    function handleSearchChange(value: string) {
        setSearchQuery(value);
        setTimeout(() => inputRef.current?.focus(), 0);
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger>
                <Button
                    variant={selectedPlace ? "default" : "outline"}
                    size="sm"
                    className="gap-2 h-9 px-3"
                    aria-label={dict.yourPlace ?? "Your place"}
                >
                    <MapPin className="h-4 w-4" aria-hidden />
                    <span className="truncate max-w-[160px] font-medium">
                        {selectedPlace?.name ?? dict.selectPlace ?? "Your place"}
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-60" aria-hidden />
                </Button>
            </DialogTrigger>
            <DialogContent className="w-[380px] p-0">
                <Command>
                    <CommandInput
                        placeholder={dict.searchPlaces ?? "Search places…"}
                        value={searchQuery}
                        onValueChange={handleSearchChange}
                        ref={inputRef}
                    />
                    <CommandList className="max-h-[300px]">
                        <CommandEmpty>{dict.noPlacesFound ?? "No places found."}</CommandEmpty>
                        <CommandGroup>
                            {loading ? (
                                <CommandItem className="py-3 text-center text-muted-foreground">
                                    Loading places…
                                </CommandItem>
                            ) : (
                                <>
                                    {filteredPlaces.map((place) => (
                                        <CommandItem
                                            key={place.slug}
                                            onSelect={() => handleSelectPlace(place)}
                                            className={
                                                selectedPlace?.slug === place.slug
                                                    ? "bg-primary/10 text-primary"
                                                    : ""
                                            }
                                        >
                                            <div className="flex flex-col">
                                                <span className="font-medium">{place.name}</span>
                                                {place.parentName && (
                                                    <span className="text-xs text-muted-foreground">
                                                        {place.parentName}
                                                    </span>
                                                )}
                                            </div>
                                        </CommandItem>
                                    ))}
                                    {selectedPlace && (
                                        <CommandItem
                                            onSelect={() => handleSelectPlace(null)}
                                            className="text-destructive focus:text-destructive"
                                        >
                                            <X className="mr-2 h-4 w-4" aria-hidden />
                                            {dict.clearPlace ?? "Clear place"}
                                        </CommandItem>
                                    )}
                                </>
                            )}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </DialogContent>
        </Dialog>
    );
}