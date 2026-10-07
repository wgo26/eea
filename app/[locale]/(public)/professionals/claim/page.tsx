import type { Metadata } from "next";
import { ContentBreadcrumb } from "@/components/system/content-breadcrumb";
import { getDictionary, resolveLocale } from "@/lib/i18n";
import { buildAlternates } from "@/lib/i18n/urls";
import { getAllLocations } from "@/lib/queries/locations";
import { ClaimForm } from "./claim-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);
  const dict = getDictionary(locale);
  return {
    title: dict.professionals.claimTitle,
    description: dict.professionals.claimIntro,
    alternates: buildAlternates(locale, "/professionals/claim"),
  };
}

export default async function ClaimPage({
  params: routeParams,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await routeParams;
  const locale = resolveLocale(rawLocale);
  const dict = getDictionary(locale);
  const t = dict.professionals;
  const locations = (await getAllLocations().catch(() => []))
    .filter((l) => l.id && l.name)
    .map((l) => ({ id: l.id, name: l.name }))
    .slice(0, 200);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 md:px-6 lg:px-8">
      <ContentBreadcrumb
        locale={locale}
        homeLabel={dict.nav.home}
        trail={[{ label: t.title, path: "/professionals" }, { label: t.claimTitle }]}
      />
      <h1 className="mt-3 text-3xl font-extrabold tracking-tight">{t.claimTitle}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{t.claimIntro}</p>
      <div className="mt-6">
        <ClaimForm copy={t} locations={locations} locationLabel={t.claimLocation} />
      </div>
    </div>
  );
}
