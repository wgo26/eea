import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { getDictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { requireUser } from "@/lib/auth/guards";
import { accountPageBreadcrumb } from "@/lib/account/nav";
import { AccountEmptyState, AccountPageShell } from "@/components/account/account-page-shell";
import { getInbox } from "@/lib/messages/actions";
import { localePath } from "@/lib/i18n/urls";

export async function generateMetadata(): Promise<{ title: string }> {
    const locale = await getRequestLocale();
    return { title: getDictionary(locale).account.messages.title };
}

export default async function Page() {
    const locale = await getRequestLocale();
    const dict = getDictionary(locale);
    const t = dict.account.messages;
    const e = dict.account.empty;
    await requireUser("/account/messages");

    const inbox = await getInbox();

    return (
        <AccountPageShell
            title={t.title}
            description={t.description}
            breadcrumb={accountPageBreadcrumb(locale, "/account/messages")}
        >
            {inbox.length === 0 ? (
                <AccountEmptyState
                    icon={MessageCircle}
                    title={e.messagesTitle}
                    body={e.messagesBody}
                    actionLabel={e.messagesCta}
                    actionHref={localePath(locale, "/buy-sell")}
                />
            ) : (
                <ul className="space-y-2">
                    {inbox.map((c) => (
                        <li key={c.id}>
                            <Link
                                href={localePath(locale, `/account/messages/${c.id}`)}
                                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-shadow hover:shadow-md"
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-bold">{c.listingTitle}</p>
                                    {c.lastMessage ? (
                                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                            {c.lastMessage}
                                        </p>
                                    ) : null}
                                </div>
                                {c.otherName ? (
                                    <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                                        {c.otherName}
                                    </span>
                                ) : null}
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </AccountPageShell>
    );
}
