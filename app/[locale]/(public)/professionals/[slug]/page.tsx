import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Globe, MapPin, ShieldCheck, Star } from "lucide-react";
import { ContentBreadcrumb } from "@/components/system/content-breadcrumb";
import { ShareButtons } from "@/components/share-buttons";
import { RevealProContact } from "@/components/professionals/reveal-pro-contact";
import { RatingStars, ReviewForm, ReviewList } from "@/components/professionals/reviews";
import { getDictionary, resolveLocale } from "@/lib/i18n";
import { buildAlternates, localePath } from "@/lib/i18n/urls";
import { getBusinessBySlug } from "@/lib/queries/businesses";
import { getBusinessBilling } from "@/lib/billing/actions";
import { getSessionUser } from "@/lib/auth/guards";
import { BillingPanel } from "@/components/billing/billing-panel";
import { personJsonLd, breadcrumbJsonLd, renderJsonLd } from "@/lib/seo/jsonld";
import { SITE } from "@/lib/constants";

type Props = { params: Promise<{ slug: string; locale: string }> };

export const revalidate = 300;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);
  const business = await getBusinessBySlug(slug, locale);
  if (!business) return { title: getDictionary(locale).professionals.notFound };
  return {
    title: business.name,
    description: business.description ?? undefined,
    alternates: buildAlternates(locale, `/professionals/${business.slug}`),
  };
}

export default async function ProfessionalProfilePage({ params }: Props) {
  const { slug, locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);
  const dict = getDictionary(locale);
  const t = dict.professionals;

  const business = await getBusinessBySlug(slug, locale);
  if (!business) notFound();

  // Owner-only promotion desk: the row owner (set at claim approval) or staff.
  const { user } = await getSessionUser().catch(() => ({ user: null }));
  const isOwner = Boolean(user && business.ownerId && user.id === business.ownerId);
  const billing =
    isOwner && business.ownerId
      ? await getBusinessBilling(business.id).catch(() => null)
      : null;

  const profileUrl = `${SITE.url}${localePath(locale, `/professionals/${business.slug}`)}`;
  const jsonLd = renderJsonLd([
    personJsonLd({
      name: business.name,
      description: business.description,
      image: null,
      url: profileUrl,
      homeLocation: business.location,
    }),
    breadcrumbJsonLd([
      { name: t.title, url: `${SITE.url}${localePath(locale, "/professionals")}` },
      { name: business.name, url: profileUrl },
    ]),
  ]);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <div className="mx-auto w-full max-w-4xl px-4 py-8 md:px-6 lg:px-8">
        <ContentBreadcrumb
          locale={locale}
          homeLabel={dict.nav.home}
          trail={[{ label: t.title, path: "/professionals" }, { label: business.name }]}
        />

        <header className="mb-6">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
              <ShieldCheck className="h-3 w-3" aria-hidden />
              {t.verifiedPro}
            </span>
            {business.isFeatured ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                <Star className="h-3 w-3" aria-hidden />
                {t.featured}
              </span>
            ) : null}
          </span>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight md:text-5xl">{business.name}</h1>
          {business.location ? (
            <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" aria-hidden />
              {t.basedIn} {business.location}
            </p>
          ) : null}
          <p className="mt-2">
            <RatingStars avg={business.ratingAvg} count={business.ratingCount} copy={t} />
          </p>
          {business.description ? (
            <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">{business.description}</p>
          ) : null}
        </header>

        {business.skills.length > 0 ? (
          <section aria-label={t.skills} className="mb-6">
            <h2 className="mb-2 text-sm font-extrabold uppercase tracking-widest text-muted-foreground">
              {t.skills}
            </h2>
            <ul className="flex flex-wrap gap-1.5">
              {business.skills.map((s) => (
                <li
                  key={s}
                  className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
                >
                  {s}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="mb-8 grid gap-4 sm:grid-cols-2">
          <RevealProContact
            slug={business.slug}
            hasPhone={business.hasPhone}
            hasEmail={business.hasEmail}
            hasWhatsapp={business.hasWhatsapp}
            labels={{
              reveal: t.reveal,
              hide: t.hide,
              rateLimited: t.rateLimited,
              unavailable: t.unavailable,
            }}
          />
          <div className="grid content-start gap-2 rounded-2xl border bg-card p-4 text-sm">
            <h2 className="text-sm font-extrabold">{t.contact}</h2>
            {business.websiteUrl ? (
              <a
                href={business.websiteUrl}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
              >
                <Globe className="h-3.5 w-3.5" aria-hidden />
                {business.websiteUrl.replace(/^https?:\/\//, "").slice(0, 40)}
              </a>
            ) : null}
            {business.openingHours ? (
              <dl className="grid gap-1 text-xs text-muted-foreground">
                {Object.entries(business.openingHours).slice(0, 7).map(([day, hours]) => (
                  <div key={day} className="flex justify-between gap-2">
                    <dt className="font-medium">{day}</dt>
                    <dd>{hours}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        </div>

        {isOwner ? (
          <section aria-label={t.manageBilling} className="mb-8">
            <BillingPanel
              copy={t}
              mode="subscription"
              targetId={business.id}
              billing={billing && billing.ok ? billing : null}
            />
            {billing && billing.ok && billing.promotions.length > 0 ? (
              <ul className="mt-2 grid gap-1.5 text-xs text-muted-foreground">
                {billing.promotions.map((p) => (
                  <li key={p.id} className="flex flex-wrap gap-x-2 rounded-md border px-2.5 py-1.5">
                    <span className="font-semibold">{p.planId}</span>
                    <span>{p.status}</span>
                    <span className="font-mono">{p.reference}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        <section aria-label={t.listings} className="mb-8">
          <h2 className="mb-3 text-lg font-extrabold">
            {t.listings} · {business.listings.length}
          </h2>
          {business.listings.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.noListings}</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {business.listings.map((l) => (
                <li key={l.id} className="rounded-2xl border bg-card p-4">
                  <Link
                    href={localePath(locale, l.href)}
                    className="font-semibold hover:text-primary"
                  >
                    {l.title}
                  </Link>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {l.price != null ? `${l.price} ${l.currency ?? ""}`.trim() : ""}
                    {l.location ? ` · ${l.location}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label={t.reviewsTitle} className="mb-8 grid gap-3">
          <h2 className="text-lg font-extrabold">{t.reviewsTitle}</h2>
          {business.reviews.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.noReviews}</p>
          ) : (
            <ReviewList reviews={business.reviews} />
          )}
          <ReviewForm businessId={business.id} copy={t} />
        </section>

        <div className="border-t pt-6">
          <p className="mb-3 text-sm font-bold">{dict.common.share}</p>
          <ShareButtons
            url={profileUrl}
            title={business.name}
            locale={locale}
            labels={{
              share: dict.common.share,
              whatsapp: dict.common.whatsapp,
              copyLink: dict.common.copyLink,
              copied: dict.common.copied,
            }}
          />
        </div>
      </div>
    </>
  );
}
