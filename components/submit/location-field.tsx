'use client'

import * as React from 'react';
import { LocateFixed, MapPin } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';

type LocationSuggestion = { id: string; name: string; slug: string };

/**
 * Location step field: autocomplete against canonical `locations`, one-tap
 * browser geolocation, and free-text fallback. Selecting a suggestion stores
 * its id (hidden `location_id`); free text is kept as `location_text` for
 * editors to resolve — public input never creates location rows.
 */
export function LocationField({
    label,
    placeholder,
    detectLabel,
    detectedLabel,
    resolvingLabel,
    resolveFailedLabel,
    keepAsSuggestionLabel,
    initialText,
    initialId,
}: {
    label: string;
    placeholder?: string;
    detectLabel: string;
    detectedLabel: string;
    resolvingLabel: string;
    resolveFailedLabel: string;
    keepAsSuggestionLabel: string;
    initialText?: string | null;
    initialId?: string | null;
}) {
    const [text, setText] = React.useState(initialText ?? "");
    const [locationId, setLocationId] = React.useState(initialId ?? "");
    const [items, setItems] = React.useState<LocationSuggestion[]>([]);
    const [open, setOpen] = React.useState(false);
    const [detecting, setDetecting] = React.useState(false);
    const [resolving, setResolving] = React.useState(false);
    const [resolvedName, setResolvedName] = React.useState<string | null>(null);
    const [resolveFailed, setResolveFailed] = React.useState(false);
    const [coords, setCoords] = React.useState<{ lat: number; lng: number } | null>(null);
    const boxRef = React.useRef<HTMLDivElement>(null);

    const updateText = (value: string) => {
        setText(value);
        setLocationId("");
        if (value.trim().length < 2) {
            setItems([]);
            setOpen(false);
        }
    };

    React.useEffect(() => {
        if (text.trim().length < 2) return;
        let cancelled = false;
        const t = window.setTimeout(async () => {
            try {
                const supabase = createClient();
                const { data } = await supabase
                    .from("locations")
                    .select("id, name, slug")
                    .eq("is_active", true)
                    .ilike("name", `%${text.trim().slice(0, 60)}%`)
                    .order("name")
                    .limit(6);
                if (!cancelled) {
                    setItems((data ?? []) as LocationSuggestion[]);
                    setOpen(true);
                }
            } catch {
                if (!cancelled) setOpen(false);
            }
        }, 250);
        return () => {
            cancelled = true;
            window.clearTimeout(t);
        };
    }, [text]);

    React.useEffect(() => {
        const onDoc = (e: MouseEvent) => {
            if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    const detect = () => {
        if (!("geolocation" in navigator)) return;
        setDetecting(true);
        setResolving(false);
        setResolveFailed(false);
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                setDetecting(false);
                const lat = Math.round(pos.coords.latitude * 10000) / 10000;
                const lng = Math.round(pos.coords.longitude * 10000) / 10000;
                setCoords({ lat, lng });
                // Resolve the position to a proper place: a canonical
                // location link when one matches, otherwise the readable
                // place name as suggestion text. Raw "lat, lng" is never
                // submitted — coords are display-only confirmation.
                setResolving(true);
                try {
                    const res = await fetch(
                        `/api/locations/reverse?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`,
                    );
                    const data = (await res.json()) as {
                        displayName?: string | null;
                        locationId?: string | null;
                        locationName?: string | null;
                    };
                    if (data.locationId && data.locationName) {
                        setText(data.locationName);
                        setLocationId(data.locationId);
                        setResolvedName(data.locationName);
                    } else if (data.displayName) {
                        if (!text.trim()) setText(data.displayName);
                        setResolvedName(data.displayName);
                    } else {
                        setResolveFailed(true);
                    }
                } catch {
                    setResolveFailed(true);
                } finally {
                    setResolving(false);
                }
            },
            () => {
                setDetecting(false);
                setResolveFailed(true);
            },
            { timeout: 8000 },
        );
    };

    return (
        <div ref={boxRef} className="space-y-1.5">
            <span className="flex items-center justify-between gap-2">
                <Label htmlFor="location">{label}</Label>
                <button
                    type="button"
                    onClick={detect}
                    disabled={detecting || resolving}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
                >
                    <LocateFixed className="h-3.5 w-3.5" aria-hidden />
                    {detecting ? "…" : detectLabel}
                </button>
            </span>
            <div className="relative">
                <MapPin className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
                <Input
                    id="location"
                    name="location"
                    value={text}
                    onChange={(e) => updateText(e.target.value)}
                    onFocus={() => {
                        if (items.length) setOpen(true);
                    }}
                    placeholder={placeholder}
                    autoComplete="off"
                    className="pl-8"
                />
                {open && (items.length > 0 || text.trim()) ? (
                    <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-md border bg-popover shadow-md">
                        <ul role="listbox" aria-label={label} className="max-h-56 overflow-auto p-1">
                            {items.map((s) => (
                                <li key={s.id}>
                                    <button
                                        type="button"
                                        role="option"
                                        aria-selected={locationId === s.id}
                                        onClick={() => {
                                            setText(s.name);
                                            setLocationId(s.id);
                                            setOpen(false);
                                        }}
                                        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                                    >
                                        <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                                        <span className="truncate">{s.name}</span>
                                    </button>
                                </li>
                            ))}
                            {text.trim() ? (
                                <li>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setLocationId("");
                                            setOpen(false);
                                        }}
                                        className="w-full truncate px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent"
                                    >
                                        {keepAsSuggestionLabel}: “{text.trim().slice(0, 60)}”
                                    </button>
                                </li>
                            ) : null}
                        </ul>
                    </div>
                ) : null}
            </div>
            {resolving ? (
                <p className="text-xs text-muted-foreground">{resolvingLabel}</p>
            ) : resolvedName && coords ? (
                <p className="text-xs text-muted-foreground">
                    {detectedLabel}: {resolvedName} ({coords.lat}, {coords.lng})
                </p>
            ) : coords ? (
                <p className="text-xs text-muted-foreground">
                    {detectedLabel}: {coords.lat}, {coords.lng}
                </p>
            ) : null}
            {resolveFailed && !resolvedName ? (
                <p className="text-xs text-muted-foreground">{resolveFailedLabel}</p>
            ) : null}
            {/* Canonical pick (nullable) + raw text. Lean cut: precise GPS
                coords are display-only (confirmation line above) and never
                submitted — location is `location_id` + free text. */}
            <input type="hidden" name="location_id" value={locationId} />
            <input type="hidden" name="location_text" value={text} />
        </div>
    );
}
