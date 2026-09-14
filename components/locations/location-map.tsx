"use client";

import { useEffect, useRef } from "react";
import type { Dictionary } from "@/lib/i18n";

export type MappedHub = {
    slug: string;
    name: string;
    latitude: number;
    longitude: number;
    href: string;
};

/**
 * Community map: OpenStreetMap tiles with one marker per mapped location
 * hub (Leaflet, client-only). Grows to fit all markers; falls back to a
 * continental view when there is a single hub.
 */
export function LocationMap({ hubs, copy }: { hubs: MappedHub[]; copy: Dictionary["map"] }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<{ remove: () => void } | null>(null);

    useEffect(() => {
        if (!containerRef.current || mapRef.current) return;
        let cancelled = false;
        void (async () => {
            const L = await import("leaflet");
            await import("leaflet/dist/leaflet.css");
            if (cancelled || !containerRef.current) return;
            const map = L.map(containerRef.current, { scrollWheelZoom: false }).setView([7.5, 12.5], 5);
            L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
                maxZoom: 18,
                attribution: copy.tilesCredit,
            }).addTo(map);
            const points: [number, number][] = [];
            for (const hub of hubs) {
                const marker = L.marker([hub.latitude, hub.longitude]).addTo(map);
                marker.bindPopup(`<a href="${hub.href}">${hub.name}</a>`);
                marker.bindTooltip(hub.name);
                points.push([hub.latitude, hub.longitude]);
            }
            if (points.length > 1) {
                map.fitBounds(L.latLngBounds(points).pad(0.25));
            } else if (points.length === 1) {
                map.setView(points[0], 8);
            }
            mapRef.current = map;
            // Re-enable scroll zoom once the user interacts (page scroll wins).
            map.on("focus", () => map.scrollWheelZoom.enable());
            map.on("blur", () => map.scrollWheelZoom.disable());
            map.on("click", () => map.scrollWheelZoom.enable());
        })();
        return () => {
            cancelled = true;
            mapRef.current?.remove();
            mapRef.current = null;
        };
    }, [hubs, copy.tilesCredit]);

    return (
        <div
            ref={containerRef}
            role="application"
            aria-label={copy.title}
            className="z-0 h-80 w-full overflow-hidden rounded-2xl border border-border bg-muted md:h-96"
        />
    );
}
