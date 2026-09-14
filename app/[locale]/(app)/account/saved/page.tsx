import { getDictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { requireUser } from "@/lib/auth/guards";
import { PageHeader } from "@/components/admin/page-header";
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
    await requireUser("/account/saved");

    const items = await getSavedItems(locale);

    return (
        <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:px-6 lg:py-12">
            <PageHeader title={t.title} description={t.description} />
            <SavedListClient initial={items} dict={dict} locale={locale} />
        </div>
    );
}
