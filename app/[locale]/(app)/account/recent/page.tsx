import { getDictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { localePath } from "@/lib/i18n/urls";
import { requireUser } from "@/lib/auth/guards";
import { accountPageBreadcrumb } from "@/lib/account/nav";
import { AccountPageShell } from "@/components/account/account-page-shell";
import { RecentClient } from "@/components/account/recent-client";

/**
 * Phase 3 — recently viewed (device-local localStorage history, no backend).
 * The page shell is guarded; the list itself renders client-side.
 */
export async function generateMetadata(): Promise<{ title: string }> {
    const locale = await getRequestLocale();
    return { title: getDictionary(locale).account.recent.title };
}

export default async function Page() {
    const locale = await getRequestLocale();
    const dict = getDictionary(locale);
    const t = dict.account.recent;
    const e = dict.account.empty;
    await requireUser("/account/recent");

    return (
        <AccountPageShell
            title={t.title}
            description={t.description}
            breadcrumb={accountPageBreadcrumb(locale, "/account/recent")}
        >
            {/* RecentClient renders its own warm empty state from device
                storage — a cold device has nothing to list yet. */}
            <RecentClient
                dict={dict}
                emptyTitle={e.recentTitle}
                emptyBody={e.recentBody}
                browseLabel={e.recentCta}
                browseHref={localePath(locale, "/photo-stories")}
            />
        </AccountPageShell>
    );
}
