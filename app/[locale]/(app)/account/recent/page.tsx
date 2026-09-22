import { getDictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { requireUser } from "@/lib/auth/guards";
import { PageHeader } from "@/components/admin/page-header";
import { RecentClient } from "@/components/account/recent-client";

/**
 * Phase 3 — recently viewed (device-local localStorage history, no backend).
 * The page shell is guarded; the list itself renders client-side.
 */
export async function generateMetadata(): Promise<{ title: string }> {
    const locale = await getRequestLocale();
    const dict = getDictionary(locale);
    return { title: dict.follow.recentTitle };
}

export default async function Page() {
    const locale = await getRequestLocale();
    const dict = getDictionary(locale);
    await requireUser("/account/recent");

    return (
        <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:px-6 lg:py-12">
            <PageHeader title={dict.follow.recentTitle} description={dict.follow.recentEmpty} />
            <RecentClient dict={dict} />
        </div>
    );
}
