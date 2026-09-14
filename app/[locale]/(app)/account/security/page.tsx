import { getDictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/admin/page-header";
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
        <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:px-6 lg:py-12">
            <PageHeader title={t.title} description={t.description} />
            <MfaSection copy={t} initial={factors} />
            <SessionsSection copy={t} email={fullUser?.email ?? user.email ?? ""} />
            <ExportSection copy={t} />
            <DeleteSection copy={t} />
        </div>
    );
}
