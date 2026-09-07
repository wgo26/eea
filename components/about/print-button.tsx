"use client";

import { Printer } from "lucide-react";

export function PrintButton({ label }: { label: string }) {
    return (
        <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground print:hidden"
        >
            <Printer className="h-3.5 w-3.5" aria-hidden />
            {label}
        </button>
    );
}
