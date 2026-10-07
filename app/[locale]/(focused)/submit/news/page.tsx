import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { getDictionary, resolveLocale } from "@/lib/i18n";
import { SubmitFormGated } from "@/components/submit/submit-form-gated";
import { SubmitOfflineNotice } from "@/components/submit/submit-offline-notice";
import { getPublicSiteSettings } from "@/lib/admin/queries/settings";
import { localePath } from "@/lib/i18n/urls";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale: rawLocale } = await params;
    const locale = resolveLocale(rawLocale);
    const dict = getDictionary(locale);
    return { title: dict.submit.types.news.title };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
    const { locale: rawLocale } = await params;
    const locale = resolveLocale(rawLocale);
    const dict = getDictionary(locale);
    const meta = dict.submit.types.news;
    const { contactWhatsapp } = await getPublicSiteSettings().catch(() => ({ contactWhatsapp: null as string | null }));
    return (
        <div className="mx-auto w-full max-w-2xl px-4 py-8 md:px-6 lg:px-8">
            <Link
                href={localePath(locale, "/submit")}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                {dict.submit.back}
            </Link>
            <h1 className="mt-4 text-2xl font-extrabold tracking-tight md:text-3xl">
                {meta.title}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{meta.blurb}</p>
            <div className="mt-6">
                <SubmitOfflineNotice
                    whatsapp={contactWhatsapp}
                    title={dict.submit.offlineTitle}
                    body={dict.submit.offlineBody}
                    fallback={dict.submit.fallbackWhatsapp}
                />
                <SubmitFormGated type="news" dict={dict} />
            </div>
        </div>
    );
}
