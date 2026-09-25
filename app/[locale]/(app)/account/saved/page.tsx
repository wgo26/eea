import { BookmarkPlus } from "lucide-react";
import Link from "next/link";
import { getDictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { localePath } from "@/lib/i18n/urls";
import { requireUser } from "@/lib/auth/guards";
import { accountPageBreadcrumb } from "@/lib/account/nav";
import { AccountEmptyState, AccountPageShell } from "@/components/account/account-page-shell";
import { SavedListClient } from "@/components/account/saved-list-client";
import { getSavedItems } from "@/lib/saves/actions";

export async function generateMetadata(): Promise<{ title: string }> {
    const locale = await getRequestLocale();
    return { title: getDictionary(locale).account.saved.title };
}

export default async function Page() {
    const locale = await getRequestLocale();
    const dict = getDictionary(locale);
    const t = dict.account.saved;
    const e = dict.account.empty;
    await requireUser("/account/saved");

    const items = await getSavedItems(locale);

    return (
        <AccountPageShell
            title={t.title}
            description={t.description}
            breadcrumb={accountPageBreadcrumb(locale, "/account/saved")}
            actions={
                <Link
                    href={localePath(locale, "/photo-stories")}
                    className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                    {e.savedCta}
                </Link>
            }
        >
            {items.length === 0 ? (
                <AccountEmptyState
                    icon={BookmarkPlus}
                    title={e.savedTitle}
                    body={e.savedBody}
                    actionLabel={e.savedCta}
                    actionHref={localePath(locale, "/photo-stories")}
                    secondaryLabel={e.savedSecondary}
                    secondaryHref={localePath(locale, "/buy-sell")}
                />
            ) : (
                <SavedListClient initial={items} dict={dict} locale={locale} />
            )}
        </AccountPageShell>
    );
}