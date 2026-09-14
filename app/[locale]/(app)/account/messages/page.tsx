import Link from "next/link";
import { getDictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { requireUser } from "@/lib/auth/guards";
import { PageHeader } from "@/components/admin/page-header";
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
    await requireUser("/account/messages");

    const inbox = await getInbox();

    return (
        <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:px-6 lg:py-12">
            <PageHeader title={t.title} description={t.description} />
            {inbox.length === 0 ? (
                <p className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
                    {t.empty}
                </p>
            ) : (
                <ul className="space-y-2">
                    {inbox.map((c) => (
                        <li key={c.id}>
                            <Link
                                href={localePath(locale, `/account/messages/${c.id}`)}
                                className="flex items-center gap-3 rounded-2xl border bg-card p-4 transition-shadow hover:shadow-md"
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-bold">{c.listingTitle}</p>
                                    {c.lastMessage ? (
                                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                            {c.lastMessage}
                                        </p>
                                    ) : null}
                                </div>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
