import Link from "next/link";
import { getDictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { localePath } from "@/lib/i18n/urls";
import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { accountPageBreadcrumb } from "@/lib/account/nav";
import { AccountPageShell } from "@/components/account/account-page-shell";
import { DeleteSection, ExportSection, MfaSection, SessionsSection } from "@/components/account/security-sections";
import { getMfaFactors } from "@/lib/auth/mfa";

export async function generateMetadata(): Promise<{ title: string }> {
    const locale = await getRequestLocale();
    return { title: getDictionary(locale).account.security.title };
}

export default async function Page() {
    const locale = await getRequestLocale();
    const dict = getDictionary(locale);
    const t = dict.account.security;
    const { user } = await requireUser("/account/security");

    const supabase = await createClient();
    const { data: { user: fullUser } } = await supabase.auth.getUser();
    const [factors] = await Promise.all([getMfaFactors()]);

    return (
        <AccountPageShell
            title={t.title}
            description={t.description}
            breadcrumb={accountPageBreadcrumb(locale, "/account/security")}
            size="narrow"
            actions={
                <Link
                    href={localePath(locale, "/account/notifications")}
                    className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                    {dict.account.topbar.notifications}
                </Link>
            }
        >
            <MfaSection copy={t} initial={factors} />
            <SessionsSection copy={t} email={fullUser?.email ?? user.email ?? ""} />
            <ExportSection copy={t} />
            <DeleteSection copy={t} />
        </AccountPageShell>
    );
}
