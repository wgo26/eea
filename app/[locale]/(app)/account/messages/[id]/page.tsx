import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { requireUser } from "@/lib/auth/guards";
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
        <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 md:px-6 lg:py-12">
            <ThreadClient thread={thread} dict={dict} locale={locale} />
        </div>
    );
}
