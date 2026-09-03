"use client";

import { Printer } from "lucide-react";

import type { Dictionary } from "@/lib/i18n";

/**
 * Prints the current page. Notices are the one content type people still
 * pin to a wall or hand to someone, so printing is a first-class action
 * rather than a browser-menu afterthought.
 */
export function PrintButton({ dict, className }: { dict: Dictionary; className?: string }) {
    return (
        <button
            type="button"
            onClick={() => window.print()}
            className={className}
            aria-label={dict.notices.printNotice}
        >
            <Printer className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">{dict.notices.printNotice}</span>
        </button>
    );
}
