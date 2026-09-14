"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search as SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { localePath } from "@/lib/i18n/urls";
import type { Dictionary, Locale } from "@/lib/i18n";

type Suggestion = { id: string; type: string; title: string; href: string };

/**
 * Search input with debounced autocomplete: after 250ms of quiet typing
 * (2+ chars) it offers the top matching stories as direct links, falling
 * back to the full results page on submit. Keyboard: ArrowUp/Down moves,
 * Enter opens the highlight, Escape closes.
 */
export function SearchSuggest({
    locale,
    dict,
    defaultValue = "",
    typeFilter = "",
}: {
    locale: Locale;
    dict: Dictionary;
    defaultValue?: string;
    /** Preserve the active type filter across submissions. */
    typeFilter?: string;
}) {
    const router = useRouter();
    const [value, setValue] = useState(defaultValue);
    const [items, setItems] = useState<Suggestion[]>([]);
    const [open, setOpen] = useState(false);
    const [highlight, setHighlight] = useState(-1);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const boxRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (timer.current) clearTimeout(timer.current);
        const query = value.trim();
        if (query.length < 2) return;
        timer.current = setTimeout(async () => {
            try {
                const res = await fetch(
                    `/api/search/suggest?q=${encodeURIComponent(query)}&locale=${locale}`,
                );
                const json = (await res.json()) as { items: Suggestion[] };
                setItems(json.items ?? []);
                setOpen(true);
                setHighlight(-1);
            } catch {
                setItems([]);
            }
        }, 250);
        return () => {
            if (timer.current) clearTimeout(timer.current);
        };
    }, [value, locale]);

    useEffect(() => {
        function onOutside(e: MouseEvent) {
            if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener("mousedown", onOutside);
        return () => document.removeEventListener("mousedown", onOutside);
    }, []);

    // Derived at render (not cleared in the fetch effect): short queries
    // never show stale suggestions from a previous longer query.
    const activeItems = value.trim().length >= 2 ? items : [];
    const showDropdown = open && activeItems.length > 0;

    return (
        <div ref={boxRef} className="relative">
            <form
                action={localePath(locale, "/search")}
                method="GET"
                role="search"
                className="space-y-3"
                onSubmit={(e) => {
                    if (highlight >= 0 && activeItems[highlight]) {
                        e.preventDefault();
                        setOpen(false);
                        router.push(localePath(locale, activeItems[highlight].href));
                    }
                }}
            >
                {typeFilter ? <input type="hidden" name="type" value={typeFilter} /> : null}
                <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                        type="search"
                        name="q"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        onFocus={() => {
                            if (activeItems.length > 0) setOpen(true);
                        }}
                        onKeyDown={(e) => {
                            if (!showDropdown) return;
                            if (e.key === "ArrowDown") {
                                e.preventDefault();
                                setHighlight((h) => (h + 1) % activeItems.length);
                            } else if (e.key === "ArrowUp") {
                                e.preventDefault();
                                setHighlight((h) => (h - 1 + activeItems.length) % activeItems.length);
                            } else if (e.key === "Escape") {
                                setOpen(false);
                            }
                        }}
                        placeholder={dict.search.placeholder}
                        aria-label={dict.search.title}
                        aria-expanded={showDropdown}
                        role="combobox"
                        aria-autocomplete="list"
                        autoComplete="off"
                        className="flex-1"
                    />
                    <Button type="submit">
                        <SearchIcon className="h-4 w-4" aria-hidden />
                        {dict.nav.search}
                    </Button>
                </div>
            </form>
            {showDropdown ? (
                <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
                    <p className="border-b border-border px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {dict.search.suggestionsLabel}
                    </p>
                    <ul role="listbox">
                        {activeItems.map((item, i) => (
                            <li key={`${item.type}-${item.id}`} role="option" aria-selected={i === highlight}>
                                <Link
                                    href={localePath(locale, item.href)}
                                    onClick={() => setOpen(false)}
                                    onMouseEnter={() => setHighlight(i)}
                                    className={`block truncate px-3 py-2 text-sm transition-colors ${
                                        i === highlight ? "bg-accent text-accent-foreground" : ""
                                    }`}
                                >
                                    {item.title}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}
        </div>
    );
}
