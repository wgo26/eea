import Link from "next/link";
import { getDictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { localePath } from "@/lib/i18n/urls";
import { requireUser } from "@/lib/auth/guards";
import { accountPageBreadcrumb } from "@/lib/account/nav";
import { AccountPageShell } from "@/components/account/account-page-shell";
import { OwnListingsClient } from "@/components/buy-sell/own-listings-client";
import { getUserListings } from "@/lib/queries/buy-sell";

export async function generateMetadata(): Promise<{ title: string }> {
    const locale = await getRequestLocale();
    return { title: getDictionary(locale).buySell.myListings };
}

export default async function Page() {
    const locale = await getRequestLocale();
    const dict = getDictionary(locale);
    const e = dict.account.empty;
    const { user } = await requireUser("/account/listings");

    const listings = user ? await getUserListings(user.id, locale) : [];

    return (
        <AccountPageShell
            title={dict.buySell.myListings}
            description={dict.buySell.myListingsBody}
            breadcrumb={accountPageBreadcrumb(locale, "/account/listings")}
            actions={
                <Link
                    href={localePath(locale, "/submit/buy-sell")}
                    className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                    {e.listingsCta}
                </Link>
            }
        >
            <OwnListingsClient initial={listings} dict={dict} locale={locale} />
        </AccountPageShell>
    );
}
