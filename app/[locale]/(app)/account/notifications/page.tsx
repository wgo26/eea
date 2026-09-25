import Link from "next/link";
import { getDictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { localePath } from "@/lib/i18n/urls";
import { requireUser } from "@/lib/auth/guards";
import { accountPageBreadcrumb } from "@/lib/account/nav";
import { AccountPageShell } from "@/components/account/account-page-shell";
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
        <AccountPageShell
            title={t.title}
            description={t.description}
            breadcrumb={accountPageBreadcrumb(locale, "/account/notifications")}
            actions={
                <Link
                    href={localePath(locale, "/account/profile")}
                    className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                    {dict.account.profile.title}
                </Link>
            }
        >
            <NotificationsClient initial={items} prefs={prefs} dict={dict} locale={locale} contact={contact} />
        </AccountPageShell>
    );
}
