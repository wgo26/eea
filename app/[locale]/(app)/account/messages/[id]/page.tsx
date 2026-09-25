import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { requireUser } from "@/lib/auth/guards";
import { accountPageBreadcrumb } from "@/lib/account/nav";
import { AccountPageShell } from "@/components/account/account-page-shell";
import { ThreadClient } from "@/components/messages/thread-client";
import { getThread } from "@/lib/messages/actions";

export async function generateMetadata(): Promise<{ title: string }> {
    const locale = await getRequestLocale();
    return { title: getDictionary(locale).account.messages.title };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const locale = await getRequestLocale();
    const dict = getDictionary(locale);
    await requireUser("/account/messages");

    const { id } = await params;
    const thread = await getThread(id);
    if (!thread) notFound();

    return (
        <AccountPageShell
            title={dict.account.messages.title}
            description={thread.listingTitle}
            size="narrow"
            // The inbox crumb is a real parent (audit §2.3: child pages need
            // a way back), not just the section grouping.
            breadcrumb={[
                ...accountPageBreadcrumb(locale, "/account/messages"),
                { label: thread.otherName ?? thread.listingTitle },
            ]}
        >
            <ThreadClient thread={thread} dict={dict} locale={locale} />
        </AccountPageShell>
    );
}