"use client";

import { useEffect, useRef, useState } from "react";
import type { Dictionary } from "@/lib/i18n";
import type L from "leaflet";
// NOTE: leaflet plugins (markercluster) and ALL leaflet CSS load dynamically
// inside the effect below — never at module scope. Module-scope plugin imports
// touch `window` at import time and crash SSR prerendering (the /map page is
// ISR, not force-dynamic). Default pin icons are DivIcons (no image assets,
// no extra package) so no defaulticon-compatibility shim is needed.

export type MappedHub = {
    slug: string;
    name: string;
    latitude: number;
    longitude: number;
    href: string;
    /** Materialized depth (0 = continent, 1 = country, …). Used for tiered zoom clustering. */
    depth: number;
    locationTypeName?: string | null;
};

export type MappedContent = {
    id: string;
    type: string;
    title: string;
    slug: string;
    latitude: number;
    longitude: number;
    href: string;
    imageUrl: string | null;
    publishedAt: string | null;
    category: string | null;
    /** Hub slug this pin belongs to (map explorer place filtering). */
    locationSlug?: string;
};

/** Max depth shown at each zoom level. Deeper tiers appear as you zoom in. */
function maxDepthForZoom(zoom: number): number {
    if (zoom < 5) return 0;      // continents only
    if (zoom < 7) return 1;      // + countries
    if (zoom < 9) return 2;      // + regions
    if (zoom < 11) return 3;     // + divisions
    if (zoom < 13) return 4;     // + cities / towns
    return 5;                    // + quarters, landmarks
}

/**
 * Enhanced community map with clustering support.
 * Shows different content types as clustered markers.
 *
 * When `tieredClustering` is true, hubs are filtered by zoom level so the map
 * stays readable at any scale: continents at zoom 4, countries at 5-6, regions
 * at 7-8, divisions at 9-10, cities/towns at 11-12, quarters at 13+.
 */
export function LocationMap({
    hubs,
    content = [],
    copy,
    showClustering = true,
    initialView,
    tieredClustering = false,
}: {
    hubs: MappedHub[];
    content?: MappedContent[];
    copy: Dictionary["map"];
    showClustering?: boolean;
    initialView?: { lat: number; lng: number; zoom: number };
    tieredClustering?: boolean;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<{ remove: () => void } | null>(null);
    const [markerClusterGroup, setMarkerClusterGroup] = useState<{ remove: () => void } | null>(null);
    const [visibleHubs, setVisibleHubs] = useState<MappedHub[]>(hubs);

    useEffect(() => {
        if (!containerRef.current || mapRef.current) return;
        let cancelled = false;
        void (async () => {
            const L = await import("leaflet");
            await import("leaflet.markercluster");
            await import("leaflet/dist/leaflet.css");
            await import("leaflet.markercluster/dist/MarkerCluster.css");
            await import("leaflet.markercluster/dist/MarkerCluster.Default.css");
            if (cancelled || !containerRef.current) return;

            // Default view centered on Cameroon/West Africa
            const defaultView = initialView ?? { lat: 7.5, lng: 12.5, zoom: 5 };
            const map = L.map(containerRef.current, { scrollWheelZoom: false }).setView(
                [defaultView.lat, defaultView.lng],
                defaultView.zoom
            );
            L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
                maxZoom: 18,
                attribution: copy.tilesCredit,
            }).addTo(map);

            // Hub markers, tracked so they can be added/removed on zoom changes.
            const hubMarkers = new Map<string, L.Marker>();
            const hubIcon = L.divIcon({
                html: `<div class="content-marker" title="">📍</div>`,
                className: "content-marker-icon",
                iconSize: [28, 28],
                iconAnchor: [14, 14],
            });
            const addHubMarkers = (hubsToShow: MappedHub[]) => {
                for (const hub of hubsToShow) {
                    if (hubMarkers.has(hub.slug)) continue;
                    const marker = L.marker([hub.latitude, hub.longitude], { icon: hubIcon }).addTo(map);
                    marker.bindPopup(`<a href="${hub.href}">${hub.name}</a>`);
                    marker.bindTooltip(hub.name);
                    hubMarkers.set(hub.slug, marker);
                }
            };
            const removeHubMarkers = (slugs: string[]) => {
                for (const slug of slugs) {
                    const m = hubMarkers.get(slug);
                    if (m) {
                        map.removeLayer(m);
                        hubMarkers.delete(slug);
                    }
                }
            };

            // Initial render based on current zoom
            const currentZoom = map.getZoom();
            const maxDepth = tieredClustering ? maxDepthForZoom(currentZoom) : Infinity;
            const filtered = tieredClustering
                ? hubs.filter((h) => (h.depth ?? 0) <= maxDepth)
                : hubs;
            setVisibleHubs(filtered);
            addHubMarkers(filtered);

            const points: [number, number][] = filtered.map((h) => [h.latitude, h.longitude]);

            // Add content items with clustering if enabled
            if (showClustering && content.length > 0) {
                const clusterGroup = new L.MarkerClusterGroup({
                    chunkedLoading: true,
                    spiderfyOnMaxZoom: true,
                    showCoverageOnHover: false,
                    zoomToBoundsOnClick: true,
                    maxClusterRadius: 80,
                    iconCreateFunction: (cluster) => {
                        const count = cluster.getChildCount();
                        let size = "small";
                        if (count >= 100) size = "large";
                        else if (count >= 10) size = "medium";
                        return new L.DivIcon({
                            html: `<div class="marker-cluster marker-cluster-${size}"><span>${count}</span></div>`,
                            className: "marker-cluster-custom",
                            iconSize: size === "large" ? [40, 40] : size === "medium" ? [30, 30] : [24, 24],
                        });
                    },
                });

                const typeIcons: Record<string, string> = {
                    news: "📰",
                    photo_story: "📸",
                    notice: "📋",
                    culture: "🎭",
                    listing: "🛍️",
                    micro_story: "👁️",
                };

                for (const item of content) {
                    const icon = typeIcons[item.type] ?? "📍";
                    const marker = L.marker([item.latitude, item.longitude], {
                        icon: L.divIcon({
                            html: `<div class="content-marker" title="${item.title}">${icon}</div>`,
                            className: "content-marker-icon",
                            iconSize: [28, 28],
                            iconAnchor: [14, 14],
                        }),
                    });
                    marker.bindPopup(`
                        <div class="map-popup">
                            <a href="${item.href}" class="popup-link">
                                ${item.imageUrl ? `<img src="${item.imageUrl}" alt="${item.title}" class="popup-image" />` : ""}
                                <div class="popup-content">
                                    <span class="popup-type">${item.type.replace("_", " ")}</span>
                                    <h4 class="popup-title">${item.title}</h4>
                                    ${item.category ? `<span class="popup-category">${item.category}</span>` : ""}
                                    ${item.publishedAt ? `<span class="popup-date">${new Date(item.publishedAt).toLocaleDateString()}</span>` : ""}
                                </div>
                            </a>
                        </div>
                    `);
                    marker.bindTooltip(item.title);
                    clusterGroup.addLayer(marker);
                    points.push([item.latitude, item.longitude]);
                }

                map.addLayer(clusterGroup);
                setMarkerClusterGroup(clusterGroup);
            } else {
                const pinIcon = L.divIcon({
                    html: `<div class="content-marker" title="">📍</div>`,
                    className: "content-marker-icon",
                    iconSize: [28, 28],
                    iconAnchor: [14, 14],
                });
                for (const item of content) {
                    const marker = L.marker([item.latitude, item.longitude], { icon: pinIcon }).addTo(map);
                    marker.bindPopup(`<a href="${item.href}">${item.title}</a>`);
                    marker.bindTooltip(item.title);
                    points.push([item.latitude, item.longitude]);
                }
            }

            if (points.length > 1) {
                map.fitBounds(L.latLngBounds(points).pad(0.25));
            } else if (points.length === 1) {
                map.setView(points[0], 8);
            }

            // Tiered clustering: re-filter hubs when zoom changes.
            if (tieredClustering) {
                let pending: ReturnType<typeof setTimeout> | null = null;
                const onZoomEnd = () => {
                    if (pending) clearTimeout(pending);
                    pending = setTimeout(() => {
                        if (cancelled) return;
                        const z = map.getZoom();
                        const md = maxDepthForZoom(z);
                        const next = hubs.filter((h) => (h.depth ?? 0) <= md);
                        const nextSlugs = new Set(next.map((h) => h.slug));
                        const currentSlugs = new Set(hubMarkers.keys());
                        const toAdd = next.filter((h) => !currentSlugs.has(h.slug));
                        const toRemove = [...currentSlugs].filter((s) => !nextSlugs.has(s));
                        removeHubMarkers(toRemove);
                        addHubMarkers(toAdd);
                        setVisibleHubs(next);
                    }, 150);
                };
                map.on("zoomend", onZoomEnd);
                map.on("zoomend", onZoomEnd);
            }

            mapRef.current = map;
            map.on("focus", () => map.scrollWheelZoom.enable());
            map.on("blur", () => map.scrollWheelZoom.disable());
            map.on("click", () => map.scrollWheelZoom.enable());
        })();
        return () => {
            cancelled = true;
            mapRef.current?.remove();
            mapRef.current = null;
            markerClusterGroup?.remove();
        };
    }, [hubs, content, copy.tilesCredit, showClustering, initialView, tieredClustering]);

    // Re-filter visible hubs when the hub list changes (e.g. new locations added).
    useEffect(() => {
        if (!tieredClustering) return;
        setVisibleHubs(hubs);
    }, [hubs, tieredClustering]);

    return (
        <div
            ref={containerRef}
            role="application"
            aria-label={copy.title}
            className="z-0 h-80 w-full overflow-hidden rounded-2xl border border-border bg-muted md:h-96"
        />
    );
}

/**
 * Simplified map for location hub pages - shows just the hub and nearby content
 */
export function LocationHubMap({
    hub,
    content = [],
    copy,
}: {
    hub: MappedHub;
    content?: MappedContent[];
    copy: Dictionary["map"];
}) {
    return (
        <LocationMap
            hubs={[hub]}
            content={content}
            copy={copy}
            showClustering={false}
            initialView={{ lat: hub.latitude, lng: hub.longitude, zoom: 11 }}
        />
    );
}
