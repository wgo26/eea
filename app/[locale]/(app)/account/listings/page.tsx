import { getDictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { requireUser } from "@/lib/auth/guards";
import { PageHeader } from "@/components/admin/page-header";
import { OwnListingsClient } from "@/components/buy-sell/own-listings-client";
import { getUserListings } from "@/lib/queries/buy-sell";

export async function generateMetadata(): Promise<{ title: string }> {
    const locale = await getRequestLocale();
    return { title: getDictionary(locale).buySell.myListings };
}

export default async function Page() {
    const locale = await getRequestLocale();
    const dict = getDictionary(locale);
    const { user } = await requireUser("/account/listings");

    const listings = user ? await getUserListings(user.id, locale) : [];

    return (
        <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:px-6 lg:py-12">
            <PageHeader title={dict.buySell.myListings} description={dict.buySell.myListingsBody} />
            <OwnListingsClient initial={listings} dict={dict} locale={locale} />
        </div>
    );
}
