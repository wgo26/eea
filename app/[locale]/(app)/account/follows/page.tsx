import { getDictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { requireUser } from "@/lib/auth/guards";
import { PageHeader } from "@/components/admin/page-header";
import { FollowsClient } from "@/components/account/follows-client";
import { getOwnContentFollows } from "@/lib/follows/actions";

/**
 * Phase 3 — places & topics the member follows (content_follows, own rows).
 * Digest filtering by follows is a documented follow-up; today this page
 * manages the set and deep-links each place hub.
 */
export async function generateMetadata(): Promise<{ title: string }> {
    const locale = await getRequestLocale();
    const dict = getDictionary(locale);
    return { title: dict.follow.manageTitle };
}

export default async function Page() {
    const locale = await getRequestLocale();
    const dict = getDictionary(locale);
    await requireUser("/account/follows");
    const follows = await getOwnContentFollows();

    return (
        <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:px-6 lg:py-12">
            <PageHeader title={dict.follow.manageTitle} description={dict.follow.signInTopics} />
            <FollowsClient initial={follows} dict={dict} locale={locale} />
        </div>
    );
}
