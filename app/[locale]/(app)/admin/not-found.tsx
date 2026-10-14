"use client";

import Link from "next/link";
import { getDictionary } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/urls";
import { useLocaleFromPath } from "@/components/site-header";

/**
 * Admin-workspace 404 — the shell had error + loading states but no
 * not-found, so a bad deep-link inside the command center fell through to
 * the public 404 and stranded staff outside their workspace. This recovers
 * to the admin dashboard, in the operator's locale, without leaving the
 * shell (the layout above still renders sidebar + topbar).
 */
export default function AdminNotFound() {
    const locale = useLocaleFromPath();
    const dict = getDictionary(locale);

    return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
            <p className="text-7xl font-extrabold tracking-tight text-admin-rail/70">404</p>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight md:text-3xl">
                {dict.system.notFound.title}
            </h1>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                {dict.system.notFound.body}
            </p>
            <Link
                href={localePath(locale, "/admin/dashboard")}
                className="mt-8 inline-flex min-h-[44px] items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                {dict.admin.sidebar.dashboard}
            </Link>
        </div>
    );
}
