import { BellRing, MapPin } from "lucide-react";
import Link from "next/link";
import { getDictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { localePath } from "@/lib/i18n/urls";
import { requireUser } from "@/lib/auth/guards";
import { accountPageBreadcrumb } from "@/lib/account/nav";
import { AccountEmptyState, AccountPageShell } from "@/components/account/account-page-shell";
import { FollowsClient } from "@/components/account/follows-client";
import { LocationSubscribeButton } from "@/components/account/location-subscribe-button";
import { getOwnContentFollows } from "@/lib/follows/actions";
import { getUserLocationSubscriptions } from "@/lib/subscriptions/actions";

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
    const [follows, subscriptions] = await Promise.all([
        getOwnContentFollows(),
        getUserLocationSubscriptions(),
    ]);

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
            <div className="space-y-6">
                {follows.length > 0 ? (
                    <section>
                        <h2 className="text-lg font-semibold">{t.title}</h2>
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
                    </section>
                ) : null}

                <section>
                    <h2 className="text-lg font-semibold">{t.title}</h2>
                    <p className="text-sm text-muted-foreground">
                        {subscriptions.length > 0
                            ? `Following ${subscriptions.length} place${subscriptions.length === 1 ? '' : 's'}.`
                            : t.manageEmpty}
                    </p>
                    {subscriptions.length === 0 ? (
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
                        <ul className="space-y-2">
                            {subscriptions.map((sub) => (
                                <li
                                    key={sub.locationId}
                                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3"
                                >
                                    <span className="flex min-w-0 items-center gap-2 text-sm">
                                        <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                                        <Link
                                            href={localePath(locale, `/locations/${sub.locationSlug}`)}
                                            className="truncate font-medium hover:underline"
                                        >
                                            {sub.locationName}
                                        </Link>
                                        {sub.locationDepth > 0 ? (
                                            <span className="text-xs text-muted-foreground">
                                                • depth {sub.locationDepth}
                                            </span>
                                        ) : null}
                                    </span>
                                    <LocationSubscribeButton
                                        locationId={sub.locationId}
                                        locationName={sub.locationName}
                                        copy={dict.account.follows}
                                    />
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                {follows.length === 0 && subscriptions.length === 0 ? (
                    <AccountEmptyState
                        icon={BellRing}
                        title={e.followsTitle}
                        body={e.followsBody}
                        actionLabel={e.followsCta}
                        actionHref={localePath(locale, "/locations")}
                        secondaryLabel={e.followsSecondary}
                        secondaryHref={localePath(locale, "/news")}
                    />
                ) : null}
            </div>
        </AccountPageShell>
    );
}
