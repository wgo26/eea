'use client'

import * as React from 'react';
import { MapPin, Search } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';

type LocationSuggestion = { id: string; name: string; slug: string };

/**
 * Location step field for submissions: autocomplete against canonical
 * `locations`, with free-text fallback. Selecting a suggestion stores its id
 * (hidden `location_id`); free text is kept as `location_text` for editors
 * to resolve — public input never creates location rows.
 *
 * Browser geolocation was removed because it cannot be guaranteed accurate
 * (indoor drift, mobile tower fallback, stale cache). A wrong auto-detected
 * location is worse than no location — editors would waste time verifying
 * a place that doesn’t match the story. Contributors simply type the place
 * name and pick from suggestions, or leave free text.
 */
export function LocationField({
    label,
    placeholder,
    resolveFailedLabel,
    keepAsSuggestionLabel,
    initialText,
    initialId,
}: {
    label: string;
    placeholder?: string;
    resolveFailedLabel: string;
    keepAsSuggestionLabel: string;
    initialText?: string | null;
    initialId?: string | null;
}) {
    const [text, setText] = React.useState(initialText ?? "");
    const [locationId, setLocationId] = React.useState(initialId ?? "");
    const [items, setItems] = React.useState<LocationSuggestion[]>([]);
    const [open, setOpen] = React.useState(false);
    const boxRef = React.useRef<HTMLDivElement>(null);

    const supabase = createClient();

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

    return (
        <div ref={boxRef} className="space-y-1.5">
            <Label htmlFor="location">{label}</Label>
            <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
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
                    className="pl-9"
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
            {/* Canonical pick (nullable) + raw text. */}
            <input type="hidden" name="location_id" value={locationId} />
            <input type="hidden" name="location_text" value={text} />
        </div>
    );
}
