"use client";

import * as React from "react";
import { Info } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Labeled public-form field with optional help popover + hint line.
 * Shared by every submit step/section so label/help/hint render identically.
 */
export function Field({
    label,
    htmlFor,
    children,
    hint,
    help,
}: {
    label: string;
    htmlFor: string;
    children: React.ReactNode;
    hint?: string;
    help?: string;
}) {
    return (
        <div className="space-y-1.5">
            <span className="flex items-center gap-1.5">
                <Label htmlFor={htmlFor}>{label}</Label>
                {help ? (
                    <Popover>
                        <PopoverTrigger
                            type="button"
                            aria-label={`${label} help`}
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                        >
                            <Info className="h-3.5 w-3.5" aria-hidden />
                        </PopoverTrigger>
                        <PopoverContent className="w-64 text-xs leading-relaxed">
                            {help}
                        </PopoverContent>
                    </Popover>
                ) : null}
            </span>
            {children}
            {hint ? (
                <p className="text-xs text-muted-foreground">{hint}</p>
            ) : null}
        </div>
    );
}
