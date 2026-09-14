"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { getDictionary, type Dictionary, type Locale } from "@/lib/i18n";
import { localeHref, useLocaleFromPath } from "@/components/site-header";

/**
 * Site-wide command palette (Cmd/Ctrl+K): jump to sections, submit, or the
 * search page. Mounted in the SiteHeader so it is available on every public
 * page; entries are locale-prefixed and dictionary-driven, never hardcoded.
 */
export function CommandPaletteButton() {
    const locale = useLocaleFromPath();
    const dict = getDictionary(locale);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                setOpen((v) => !v);
            }
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, []);

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label={dict.command.openLabel}
                title={dict.command.openLabel}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-muted/50 px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
                <Search className="h-4 w-4" aria-hidden />
                <span className="hidden max-w-32 truncate xl:inline">{dict.command.openLabel}</span>
                <kbd className="hidden rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-semibold sm:inline">
                    ⌘K
                </kbd>
            </button>
            <CommandPalette open={open} onOpenChange={setOpen} locale={locale} dict={dict} />
        </>
    );
}

function CommandPalette({
    open,
    onOpenChange,
    locale,
    dict,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    locale: Locale;
    dict: Dictionary;
}) {
    const router = useRouter();

    const go = useCallback(
        (path: string) => {
            onOpenChange(false);
            router.push(localeHref(locale, path));
        },
        [locale, onOpenChange, router],
    );

    const sections: { label: string; path: string }[] = [
        { label: dict.nav.photoStories, path: "/photo-stories" },
        { label: dict.nav.news, path: "/news" },
        { label: dict.nav.notices, path: "/notices" },
        { label: dict.nav.buySell, path: "/buy-sell" },
        { label: dict.nav.culture, path: "/culture" },
        { label: dict.nav.locations, path: "/locations" },
    ];
    const actions: { label: string; path: string }[] = [
        { label: dict.nav.home, path: "/" },
        { label: dict.nav.submit, path: "/submit" },
        { label: dict.command.goToSearch, path: "/search" },
    ];

    return (
        <CommandDialog
            open={open}
            onOpenChange={onOpenChange}
            title={dict.command.openLabel}
            description={dict.command.placeholder}
        >
            <CommandInput placeholder={dict.command.placeholder} />
            <CommandList>
                <CommandEmpty>{dict.command.empty}</CommandEmpty>
                <CommandGroup heading={dict.command.sections}>
                    {sections.map((s) => (
                        <CommandItem key={s.path} value={`${s.label} ${s.path}`} onSelect={() => go(s.path)}>
                            <Search className="h-4 w-4" aria-hidden />
                            {s.label}
                        </CommandItem>
                    ))}
                </CommandGroup>
                <CommandGroup heading={dict.command.actions}>
                    {actions.map((a) => (
                        <CommandItem key={a.path} value={`${a.label} ${a.path}`} onSelect={() => go(a.path)}>
                            <Search className="h-4 w-4" aria-hidden />
                            {a.label}
                        </CommandItem>
                    ))}
                </CommandGroup>
            </CommandList>
        </CommandDialog>
    );
}
