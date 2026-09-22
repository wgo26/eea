"use client";

import { useEffect, useRef, useState } from "react";
import type { Dictionary } from "@/lib/i18n";
import type L from "leaflet";
// NOTE: leaflet plugins (markercluster, defaulticon-compatibility) and ALL
// leaflet CSS load dynamically inside the effect below — never at module
// scope. Module-scope plugin imports touch `window` at import time and crash
// SSR prerendering (the /map page is ISR, not force-dynamic).

export type MappedHub = {
    slug: string;
    name: string;
    latitude: number;
    longitude: number;
    href: string;
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
};

/**
 * Enhanced community map with clustering support.
 * Shows different content types as clustered markers.
 */
export function LocationMap({
    hubs,
    content = [],
    copy,
    showClustering = true,
    initialView,
}: {
    hubs: MappedHub[];
    content?: MappedContent[];
    copy: Dictionary["map"];
    showClustering?: boolean;
    initialView?: { lat: number; lng: number; zoom: number };
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<{ remove: () => void } | null>(null);
    const [markerClusterGroup, setMarkerClusterGroup] = useState<{ remove: () => void } | null>(null);

    useEffect(() => {
        if (!containerRef.current || mapRef.current) return;
        let cancelled = false;
        void (async () => {
            const L = await import("leaflet");
            await import("leaflet-defaulticon-compatibility");
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

            const points: [number, number][] = [];

            // Add location hubs
            for (const hub of hubs) {
                const marker = L.marker([hub.latitude, hub.longitude]).addTo(map);
                marker.bindPopup(`<a href="${hub.href}">${hub.name}</a>`);
                marker.bindTooltip(hub.name);
                points.push([hub.latitude, hub.longitude]);
            }

            // Add content items with clustering if enabled
            if (showClustering && content.length > 0) {
                // Use L.MarkerClusterGroup from the globally loaded leaflet.markercluster
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

                // Content type icons
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
                // Add content without clustering
                for (const item of content) {
                    const marker = L.marker([item.latitude, item.longitude]).addTo(map);
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
            markerClusterGroup?.remove();
        };
    }, [hubs, content, copy.tilesCredit, showClustering, initialView]);

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