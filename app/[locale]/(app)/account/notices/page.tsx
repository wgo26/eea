import Link from "next/link";
import { getDictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { localePath } from "@/lib/i18n/urls";
import { requireUser } from "@/lib/auth/guards";
import { accountPageBreadcrumb } from "@/lib/account/nav";
import { AccountPageShell } from "@/components/account/account-page-shell";
import { OwnNoticesClient } from "./own-notices-client";
import { getUserNotices } from "@/lib/queries/notices";

export async function generateMetadata(): Promise<{ title: string }> {
    const locale = await getRequestLocale();
    return { title: getDictionary(locale).notices.myNotices };
}

export default async function Page() {
    const locale = await getRequestLocale();
    const dict = getDictionary(locale);
    const { user } = await requireUser("/account/notices");

    const notices = user ? await getUserNotices(user.id, locale) : [];

    return (
        <AccountPageShell
            title={dict.notices.myNotices}
            description={dict.notices.myNoticesBody}
            breadcrumb={accountPageBreadcrumb(locale, "/account/notices")}
            actions={
                <Link
                    href={localePath(locale, "/submit/notice")}
                    className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                    {dict.notices.postOne}
                </Link>
            }
        >
            <OwnNoticesClient initial={notices} dict={dict} locale={locale} />
        </AccountPageShell>
    );
}
