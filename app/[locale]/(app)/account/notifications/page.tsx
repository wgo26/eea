import { getDictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { requireUser } from "@/lib/auth/guards";
import { PageHeader } from "@/components/admin/page-header";
import { NotificationsClient } from "@/components/account/notifications-client";
import { getMyContact, getMyNotifications, getMyPrefs } from "@/lib/notify/queries";

export async function generateMetadata(): Promise<{ title: string }> {
    const locale = await getRequestLocale();
    return { title: getDictionary(locale).account.notifications.title };
}

export default async function Page() {
    const locale = await getRequestLocale();
    const dict = getDictionary(locale);
    const t = dict.account.notifications;
    await requireUser("/account/notifications");

    const [items, prefs, contact] = await Promise.all([getMyNotifications(), getMyPrefs(), getMyContact()]);

    return (
        <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:px-6 lg:py-12">
            <PageHeader title={t.title} description={t.description} />
            <NotificationsClient initial={items} prefs={prefs} dict={dict} locale={locale} contact={contact} />
        </div>
    );
}
