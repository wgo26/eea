'use client'

import * as React from 'react';
import { LocateFixed, MapPin } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';

type LocationSuggestion = { id: string; name: string; slug: string; depth: number };

/**
 * Phase 6 — cascading location picker for submissions.
 *
 * Replaces the flat autocomplete with a tiered drill-down:
 * continent → country → region → division → city/town → quarter.
 * Each tier's options are the direct children of the selected parent.
 *
 * Browser geolocation reverse-resolves to the deepest matching place
 * and pre-selects the full tier chain. Free-text fallback is preserved
 * for editors to resolve — public input never creates location rows.
 *
 * Stores `location_id` (canonical pick) + `location_text` (free text).
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
    const [tierChain, setTierChain] = React.useState<string[]>([]); // selected location ids, root→leaf
    const [tierOptions, setTierOptions] = React.useState<LocationSuggestion[][]>([]); // options per tier
    const [tierNames, setTierNames] = React.useState<string[]>([]); // display names per tier
    const [open, setOpen] = React.useState(false);
    const [detecting, setDetecting] = React.useState(false);
    const [resolving, setResolving] = React.useState(false);
    const [resolvedName, setResolvedName] = React.useState<string | null>(null);
    const [resolveFailed, setResolveFailed] = React.useState(false);
    const [coords, setCoords] = React.useState<{ lat: number; lng: number } | null>(null);
    const boxRef = React.useRef<HTMLDivElement>(null);

    const supabase = createClient();

    // Resolve the tier chain for an initial location (edit mode).
    React.useEffect(() => {
        if (!initialId) return;
        let cancelled = false;
        (async () => {
            try {
                const chain: { id: string; name: string }[] = [];
                let cursor: { id: string; name: string; parent_id: string | null } | null = null;

                const { data: row } = await supabase
                    .from("locations")
                    .select("id, name, parent_id")
                    .eq("id", initialId)
                    .single();
                cursor = row as { id: string; name: string; parent_id: string | null } | null;

                while (cursor && !cancelled) {
                    chain.unshift({ id: cursor.id, name: cursor.name });
                    if (!cursor.parent_id) break;
                    const { data: parent } = await supabase
                        .from("locations")
                        .select("id, name, parent_id")
                        .eq("id", cursor.parent_id)
                        .single();
                    cursor = parent as { id: string; name: string; parent_id: string | null } | null;
                }

                if (!cancelled && chain.length > 0) {
                    setTierChain(chain.map((c) => c.id));
                    setTierNames(chain.map((c) => c.name));
                    // Fetch the selected location's name for the text field
                    const { data: loc } = await supabase
                        .from("locations")
                        .select("name")
                        .eq("id", initialId)
                        .single();
                    if (!cancelled && loc) {
                        setText((loc as { name: string }).name);
                        setLocationId(initialId);
                    }
                }
            } catch {
                // Silent fail
            }
        })();
        return () => { cancelled = true; };
    }, [initialId]);

    // Load top-level locations (continents) on mount.
    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const { data } = await supabase
                    .from("locations")
                    .select("id, name, slug, depth, location_type_id")
                    .is("parent_id", null)
                    .eq("is_active", true)
                    .order("name", { ascending: true })
                    .limit(50);
                if (!cancelled) {
                    const roots = (data ?? []) as LocationSuggestion[];
                    setTierOptions([roots, [], [], [], [], []]);
                    setTierNames([]);
                }
            } catch {
                // Silent fail — picker starts empty; free-text fallback still works.
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // When a tier selection changes, load children for the next tier and clear deeper tiers.
    const selectTier = async (tierIndex: number, location: LocationSuggestion) => {
        const newChain = tierChain.slice(0, tierIndex);
        newChain.push(location.id);
        setTierChain(newChain);
        setTierNames(prev => {
            const names = prev.slice(0, tierIndex);
            names.push(location.name);
            return names;
        });

        // Clear deeper tier options
        const newOptions = tierOptions.map((_, i) => (i <= tierIndex + 1 ? (i === tierIndex + 1 ? [] : tierOptions[i]) : []));
        setTierOptions(newOptions);

        if (tierIndex < 5) {
            // Load children for the next tier
            try {
                const { data } = await supabase
                    .from("locations")
                    .select("id, name, slug, depth, location_type_id")
                    .eq("parent_id", location.id)
                    .eq("is_active", true)
                    .order("name", { ascending: true })
                    .limit(50);
                if (data) {
                    setTierOptions(prev => {
                        const next = [...prev];
                        next[tierIndex + 1] = (data ?? []) as LocationSuggestion[];
                        return next;
                    });
                }
            } catch {
                // Silent fail
            }
        }

        // If this is a leaf selection (no children or user stops), set as the chosen location
        setLocationId(location.id);
        setText(location.name);
        setOpen(false);
    };

    const updateText = (value: string) => {
        setText(value);
        setLocationId("");
        setTierChain([]);
        setTierOptions([[], [], [], [], [], []]);
        setTierNames([]);
        if (value.trim().length < 2) {
            setOpen(false);
        }
    };

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
                        // Resolve the full tier chain for the matched location
                        setText(data.locationName);
                        setLocationId(data.locationId);
                        setResolvedName(data.locationName);
                        try {
                            const { data: anc } = await supabase
                                .from("locations")
                                .select("id, name, parent_id, depth, location_type_id")
                                .eq("id", data.locationId)
                                .single();
                            if (anc) {
                                const row = anc as { id: string; name: string; parent_id: string | null; depth: number | null };
                                // Walk up the chain to build tier names
                                const chain: { id: string; name: string }[] = [];
                                let cursor: { id: string; name: string; parent_id: string | null } | null = row;
                                while (cursor) {
                                    chain.unshift({ id: cursor.id, name: cursor.name });
                                    if (!cursor.parent_id) break;
                                    const { data: parent } = await supabase
                                        .from("locations")
                                        .select("id, name, parent_id")
                                        .eq("id", cursor.parent_id)
                                        .single();
                                    cursor = parent as { id: string; name: string; parent_id: string | null } | null;
                                }
                                setTierChain(chain.map((c) => c.id));
                                setTierNames(chain.map((c) => c.name));
                                // Set options for each tier level
                                const options: LocationSuggestion[][] = [[], [], [], [], [], []];
                                for (let i = 0; i < chain.length; i++) {
                                    options[i] = [{ id: chain[i].id, name: chain[i].name, slug: "", depth: i }];
                                }
                                setTierOptions(options);
                            }
                        } catch {
                            // Chain resolution failed; still have the matched location
                        }
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

    const tierLabels = [
        'Continent',
        'Country',
        'Region',
        'Division',
        'City / Town',
        'Quarter',
    ];

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

            {/* Tiered cascading picker */}
            <div className="grid gap-2 sm:grid-cols-6">
                {tierLabels.map((tierLabel, i) => {
                    const options = tierOptions[i] ?? [];
                    const selectedId = tierChain[i];
                    const selectedName = tierNames[i] ?? '';
                    const hasParent = i === 0 || (tierChain[i - 1] != null);
                    const isEmpty = options.length === 0 && selectedName === '';
                    const disabled = !hasParent && i > 0;

                    return (
                        <div key={tierLabel} className="flex flex-col gap-1">
                            <label className="text-xs font-medium text-muted-foreground">{tierLabel}</label>
                            <select
                                value={selectedId || ""}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    if (!val) {
                                        // Clear this tier and all deeper
                                        const newChain = tierChain.slice(0, i);
                                        setTierChain(newChain);
                                        setTierNames(prev => prev.slice(0, i));
                                        const newOptions = tierOptions.map((_, j) => (j > i ? [] : tierOptions[j]));
                                        setTierOptions(newOptions);
                                        setLocationId("");
                                        setText("");
                                    } else {
                                        const loc = options.find((o) => o.id === val);
                                        if (loc) selectTier(i, loc);
                                    }
                                }}
                                disabled={disabled || detecting || resolving}
                                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-muted/50 disabled:text-muted-foreground/50"
                            >
                                <option value="">{isEmpty ? '—' : 'Select…'}</option>
                                {options.map((opt) => (
                                    <option key={opt.id} value={opt.id}>
                                        {opt.name}
                                    </option>
                                ))}
                            </select>
                            {selectedName && !disabled && (
                                <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">{selectedName}</span>
                            )}
                        </div>
                    );
                })}
            </div>

            {tierNames.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                    {' > '}
                    {tierNames.map((name, i) => (
                        <span key={i} className="text-xs font-medium text-foreground">{name}{i < tierNames.length - 1 ? ' › ' : ''}</span>
                    ))}
                </p>
            ) : null}

            {/* Free-text fallback */}
            <div className="relative">
                <MapPin className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
                <Input
                    id="location"
                    name="location"
                    value={text}
                    onChange={(e) => updateText(e.target.value)}
                    onFocus={() => {
                        // Free-text focus doesn't open tier suggestions
                    }}
                    placeholder={placeholder}
                    autoComplete="off"
                    className="pl-8"
                />
                {open && text.trim() ? (
                    <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-md border bg-popover shadow-md">
                        <ul role="listbox" aria-label={label} className="max-h-56 overflow-auto p-1">
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
            {/* Canonical pick (nullable) + raw text. */}
            <input type="hidden" name="location_id" value={locationId} />
            <input type="hidden" name="location_text" value={text} />
        </div>
    );
}
