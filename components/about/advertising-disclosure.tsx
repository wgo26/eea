import { Card, CardContent } from "@/components/ui/card";
import { enabledAdProviders } from "@/lib/ads/networks";
import { getDictionary, type Locale } from "@/lib/i18n";
import { getAdNetworkConfig } from "@/lib/queries/ad-networks";

/**
 * Advertising + cookies disclosure on /about/privacy.
 *
 * Two things make this section different from the rest of the policy page:
 *
 *  1. **It always renders.** The long-form policy text comes from
 *     `policy_versions` in the database, and an installation without a
 *     published row shows "coming soon" — which is exactly the state a
 *     platform must not be in when a third-party tag is live. This section is
 *     dictionary-backed, so it ships with the code and is localized in en + fr.
 *  2. **The partner list is generated, not written.** It is derived from the
 *     same resolved config the renderer uses (`enabledAdProviders`), so the
 *     published disclosure can never name a partner the site does not use, or
 *     keep naming one after its last tag was removed. When nothing is
 *     configured, the section says so instead of listing partners.
 *
 * It is server-rendered and reads only cached data (`ads` tag), so the privacy
 * page stays ISR-static and invalidates a partner change immediately.
 */
export async function AdvertisingDisclosure({ locale }: { locale: Locale }) {
    const dict = getDictionary(locale);
    const t = dict.about;
    const partners = enabledAdProviders(await getAdNetworkConfig());

    return (
        <Card>
            <CardContent className="p-6">
                <h2 className="text-lg font-bold">{t.adDisclosureTitle}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t.adDisclosureBody}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t.adDisclosureConsent}</p>

                <h3 className="mt-4 text-sm font-semibold">{t.adDisclosurePartners}</h3>
                {partners.length === 0 ? (
                    <p className="mt-1 text-sm text-muted-foreground">{t.adDisclosureNone}</p>
                ) : (
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                        {partners.map((partner) => (
                            <li key={partner.id}>
                                {partner.policyUrl ? (
                                    <a
                                        href={partner.policyUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-medium text-primary underline underline-offset-2"
                                    >
                                        {partner.label}
                                    </a>
                                ) : (
                                    <span className="font-medium">{partner.label}</span>
                                )}
                            </li>
                        ))}
                    </ul>
                )}

                <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{t.adDisclosureContact}</p>
            </CardContent>
        </Card>
    );
}