import { BellRing } from "lucide-react";
import Link from "next/link";
import { getDictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { localePath } from "@/lib/i18n/urls";
import { requireUser } from "@/lib/auth/guards";
import { accountPageBreadcrumb } from "@/lib/account/nav";
import { AccountEmptyState, AccountPageShell } from "@/components/account/account-page-shell";
import { FollowsClient } from "@/components/account/follows-client";
import { getOwnContentFollows } from "@/lib/follows/actions";

/**
 * Phase 3 — places & topics the member follows (content_follows, own rows).
 * Digest filtering by follows is a documented follow-up; today this page
 * manages the set and deep-links each place hub.
 */
export async function generateMetadata(): Promise<{ title: string }> {
    const locale = await getRequestLocale();
    return { title: getDictionary(locale).account.follows.title };
}

export default async function Page() {
    const locale = await getRequestLocale();
    const dict = getDictionary(locale);
    const t = dict.account.follows;
    const e = dict.account.empty;
    await requireUser("/account/follows");
    const follows = await getOwnContentFollows();

    return (
        <AccountPageShell
            title={t.title}
            description={t.description}
            breadcrumb={accountPageBreadcrumb(locale, "/account/follows")}
            actions={
                <Link
                    href={localePath(locale, "/locations")}
                    className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                    {e.followsCta}
                </Link>
            }
        >
            {follows.length === 0 ? (
                <AccountEmptyState
                    icon={BellRing}
                    title={e.followsTitle}
                    body={e.followsBody}
                    actionLabel={e.followsCta}
                    actionHref={localePath(locale, "/locations")}
                    secondaryLabel={e.followsSecondary}
                    secondaryHref={localePath(locale, "/news")}
                />
            ) : (
                <FollowsClient
                    initial={follows}
                    dict={dict}
                    locale={locale}
                    emptyTitle={e.followsTitle}
                    emptyBody={e.followsBody}
                    browseLabel={e.followsCta}
                    browseHref={localePath(locale, "/locations")}
                    secondaryLabel={e.followsSecondary}
                    secondaryHref={localePath(locale, "/news")}
                />
            )}
        </AccountPageShell>
    );
}
