/**
 * Third-party ad-network (remnant) inventory.
 *
 * The first-party engine in `lib/queries/ads.ts` sells a slot directly: one
 * approved campaign per slot, rendered by `components/home/ad-slot.tsx`. This
 * module is the *second* half of the waterfall — what a slot shows when no
 * direct campaign is booked: a tag from an ad network (PropellerAds/Monetag,
 * AdSense, Adsterra, Ezoic, an affiliate SmartLink, …).
 *
 * Design rules (they are the reason this is one small pure module):
 *
 *  1. **Provider-agnostic.** Nothing about a specific network is compiled in.
 *     Operators configure a tag URL, box size and format in `/admin/ads`;
 *     `NEXT_PUBLIC_AD_SLOTS` remains a bootstrap/fallback. Adding a network is
 *     a config change, not a deploy, provided its origins are already covered
 *     by the deployment CSP.
 *  2. **Fail-closed.** A malformed JSON blob, an `http:`/`javascript:` URL, an
 *     unknown format or an `on*` attribute drops that unit (and, for a broken
 *     blob, every unit). A bad env value can never inject markup or crash a
 *     public page — it can only mean "no network ads".
 *  3. **Client-safe.** No `server-only`, no Node built-ins: the renderer
 *     (`components/ads/network-ad.tsx`) imports this file directly. Its
 *     fallback config reads only `NEXT_PUBLIC_*` values through static
 *     `process.env.X` access so Next inlines them at build time.
 *  4. **Nothing runs before consent.** `consentRequired` defaults to true and
 *     is checked against the same `eea-consent` flag the cookie banner writes
 *     (`components/system/cookie-banner.tsx`). A reader who declined never
 *     downloads a network script.
 *
 * See `docs/ad-monetization.md` for the operational stages (registration →
 * slots → tags → measurement → compliance).
 */

/** Ad shapes a remnant network can paint. */
export const AD_UNIT_FORMATS = [
    'banner',
    'native',
    'in-page-push',
    'push',
    'interstitial',
    'vignette',
    'popunder',
    'smartlink',
    'adsense',
] as const;
export type AdUnitFormat = (typeof AD_UNIT_FORMATS)[number];

/**
 * Formats that paint *inside* the reserved box. Everything else (popunder,
 * push, interstitial, vignette, smartlink) either overlays the page or is a
 * plain link, so reserving a box for it would create permanent empty space —
 * exactly the layout shift this module is meant to avoid.
 */
const BOXED_FORMATS: ReadonlySet<AdUnitFormat> = new Set(['banner', 'native', 'adsense']);

export function isBoxedFormat(format: AdUnitFormat): boolean {
    return BOXED_FORMATS.has(format);
}

export function isAdUnitFormat(value: unknown): value is AdUnitFormat {
    return typeof value === 'string' && (AD_UNIT_FORMATS as readonly string[]).includes(value);
}

/** How the unit is delivered: a script tag, a plain link, or an AdSense unit. */
export const AD_UNIT_KINDS = ['script', 'link', 'adsense'] as const;
export type AdUnitKind = (typeof AD_UNIT_KINDS)[number];

export function isAdUnitKind(value: unknown): value is AdUnitKind {
    return typeof value === 'string' && (AD_UNIT_KINDS as readonly string[]).includes(value);
}

/**
 * Providers offered in the admin picker. `cspGroup` says which built-in CSP host
 * group already covers the provider: `google` is baked into every deployment
 * (so AdSense works the moment an admin enables it — see `GOOGLE_AD_HOSTS` in
 * lib/security/csp.ts), while `null` means only the tag URL's own origin is
 * allowed, so an extra creative CDN needs `CSP_AD_EXTRA_HOSTS` + rebuild.
 */
export const AD_NETWORK_PROVIDERS = [
    {
        id: 'monetag',
        label: 'Monetag (PropellerAds)',
        cspGroup: null,
        policyUrl: 'https://monetag.com/',
    },
    {
        id: 'propellerads',
        label: 'PropellerAds',
        cspGroup: null,
        policyUrl: 'https://propellerads.com/',
    },
    {
        id: 'adsense',
        label: 'Google AdSense',
        cspGroup: 'google',
        policyUrl: 'https://policies.google.com/technologies/ads',
    },
    { id: 'adsterra', label: 'Adsterra', cspGroup: null, policyUrl: 'https://adsterra.com/' },
    { id: 'ezoic', label: 'Ezoic', cspGroup: null, policyUrl: 'https://www.ezoic.com/' },
    { id: 'custom', label: 'Custom / affiliate', cspGroup: null, policyUrl: null },
] as const;

export type AdNetworkProviderId = (typeof AD_NETWORK_PROVIDERS)[number]['id'];

export function isAdNetworkProvider(value: unknown): value is AdNetworkProviderId {
    return typeof value === 'string' && AD_NETWORK_PROVIDERS.some((p) => p.id === value);
}

export type EnabledAdProvider = {
    id: string;
    label: string;
    /** The provider's own privacy policy, when it is a known one. */
    policyUrl: string | null;
    /** How many placements currently carry this provider's tag. */
    placements: number;
};

/**
 * Providers that could actually load a tag right now, for the privacy policy's
 * partner list. Derived from the same resolved config the renderer uses, so the
 * published disclosure can never name a partner the site does not use — or omit
 * one it does. Unknown labels (a hand-written `network` value) are listed by
 * their raw name without a link rather than silently dropped.
 */
export function enabledAdProviders(config: AdNetworkConfig): EnabledAdProvider[] {
    if (!config.enabled) return [];
    const counts = new Map<string, number>();
    for (const unit of Object.values(config.units)) {
        if (!unit.network) continue;
        counts.set(unit.network, (counts.get(unit.network) ?? 0) + 1);
    }
    return [...counts.entries()]
        .map(([id, placements]) => {
            const known = AD_NETWORK_PROVIDERS.find((p) => p.id === id);
            return { id, label: known?.label ?? id, policyUrl: known?.policyUrl ?? null, placements };
        })
        .sort((a, b) => a.label.localeCompare(b.label));
}

/** One configured placement. Built by `parseAdNetworkConfig`, never by hand. */
export type AdUnit = {
    /** Matches `ad_slots.slot_key` where a direct slot exists (waterfall key). */
    slotKey: string;
    /** Free-form network label for reporting/debugging (`monetag`, `adsense`, …). */
    network: string;
    format: AdUnitFormat;
    kind: AdUnitKind;
    /** `https:` script source, link destination, or AdSense loader origin. */
    url: string;
    /** Reserved box width in CSS px (null = fluid). */
    width: number | null;
    /** Reserved box height in CSS px (null for non-boxed formats). */
    height: number | null;
    /** Extra `data-*` attributes copied onto the injected script. */
    attributes: Record<string, string>;
    /** AdSense-only identifiers. */
    adsense: { client: string; adSlot: string; format: string | null; layout: string | null } | null;
};

export type AdNetworkConfig = {
    /** Global kill switch. False also means "no units". */
    enabled: boolean;
    /** When true (default) no script loads until the reader accepted cookies. */
    consentRequired: boolean;
    /**
     * When true (default), a boxed unit keeps its reserved space in the first
     * paint for every reader — the CLS-safe mode. The box shows the house ad
     * until the network tag paints, and keeps showing it for a reader who
     * declined, so the slot is never blank.
     */
    reserveSpace: boolean;
    /**
     * When true (default), an unfilled placement renders the site's own
     * "Advertise with us" card instead of disappearing. Set by the admin toggle
     * (`ad_network_settings.house_ads_enabled`); this is what removes the
     * always-empty-box/CLS trade-off.
     */
    houseAds: boolean;
    units: Record<string, AdUnit>;
};

export const EMPTY_AD_NETWORK_CONFIG: AdNetworkConfig = Object.freeze({
    enabled: false,
    consentRequired: true,
    reserveSpace: true,
    houseAds: true,
    units: {},
});

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

/** `ad_slots.slot_key`-compatible: lowercase, digits and inner dashes. */
const SLOT_KEY_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** Only `data-*` attributes survive — `onload`/`src` can never be injected. */
const DATA_ATTR_RE = /^data-[a-z0-9-]{1,40}$/;
const ADSENSE_CLIENT_RE = /^ca-pub-\d{10,20}$/;
const ADSENSE_SLOT_RE = /^\d{4,20}$/;
const AD_SENSE_LOADER = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';
/**
 * Origins the AdSense / Ad Manager runtime additionally needs: the loader,
 * the ad-frame host and the measurement host are all distinct. Kept to the
 * documented ad-serving domains — anything else a browser console reports as
 * blocked belongs in `CSP_AD_EXTRA_HOSTS`, not in this list, so the built-in
 * surface stays as narrow as the provider actually requires.
 */
const ADSENSE_ORIGINS = [
    'https://pagead2.googlesyndication.com',
    'https://googleads.g.doubleclick.net',
    'https://tpc.googlesyndication.com',
    'https://www.google.com',
];
/** Hard caps: a config mistake must not be able to bloat every page. */
const MAX_UNITS = 40;
const MAX_ATTRIBUTES = 10;
const MAX_HEIGHT = 1200;
const MAX_WIDTH = 2000;

function httpsUrl(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const raw = value.trim();
    if (!/^https:\/\/\S+$/i.test(raw)) return null;
    try {
        const parsed = new URL(raw);
        return parsed.protocol === 'https:' ? parsed.toString() : null;
    } catch {
        return null;
    }
}

function clampedInt(value: unknown, min: number, max: number): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    return Math.min(max, Math.max(min, Math.round(value)));
}

function parseAttributes(value: unknown): Record<string, string> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const out: Record<string, string> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
        if (Object.keys(out).length >= MAX_ATTRIBUTES) break;
        if (!DATA_ATTR_RE.test(key)) continue;
        if (typeof raw !== 'string' || raw.length === 0 || raw.length > 200) continue;
        out[key] = raw;
    }
    return out;
}

function parseAdsense(value: unknown): AdUnit['adsense'] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const rec = value as Record<string, unknown>;
    if (typeof rec.client !== 'string' || !ADSENSE_CLIENT_RE.test(rec.client.trim())) return null;
    if (typeof rec.adSlot !== 'string' || !ADSENSE_SLOT_RE.test(rec.adSlot.trim())) return null;
    return {
        client: rec.client.trim(),
        adSlot: rec.adSlot.trim(),
        format: typeof rec.format === 'string' && rec.format.length <= 40 ? rec.format : null,
        layout: typeof rec.layout === 'string' && rec.layout.length <= 40 ? rec.layout : null,
    };
}

/**
 * Validate one slot entry. Returns null when *anything* is off — a partially
 * valid unit is never rendered, because a half-configured third-party tag is
 * exactly how empty boxes and console errors reach production.
 */
function parseUnit(slotKey: string, raw: unknown): AdUnit | null {
    if (!SLOT_KEY_RE.test(slotKey)) return null;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const rec = raw as Record<string, unknown>;
    if (!isAdUnitFormat(rec.format)) return null;
    const format = rec.format;

    const network =
        typeof rec.network === 'string' && /^[a-z0-9-]{1,40}$/.test(rec.network.trim())
            ? rec.network.trim()
            : 'custom';

    const kind: AdUnitKind = isAdUnitKind(rec.kind)
        ? rec.kind
        : format === 'adsense'
          ? 'adsense'
          : format === 'smartlink'
            ? 'link'
            : 'script';

    if ((format === 'adsense') !== (kind === 'adsense')) return null;
    if ((format === 'smartlink') !== (kind === 'link')) return null;

    if (kind === 'adsense') {
        const adsense = parseAdsense(rec.adsense);
        if (!adsense) return null;
        return {
            slotKey,
            network,
            format,
            kind,
            url: AD_SENSE_LOADER,
            width: clampedInt(rec.width, 1, MAX_WIDTH),
            height: clampedInt(rec.height, 50, MAX_HEIGHT) ?? 250,
            attributes: parseAttributes(rec.attributes),
            adsense,
        };
    }

    const url = httpsUrl(rec.url);
    if (!url) return null;

    if (kind === 'link') {
        return {
            slotKey,
            network,
            format,
            kind,
            url,
            width: null,
            height: null,
            attributes: parseAttributes(rec.attributes),
            adsense: null,
        };
    }

    return {
        slotKey,
        network,
        format,
        kind,
        url,
        width: clampedInt(rec.width, 1, MAX_WIDTH),
        height: isBoxedFormat(format) ? (clampedInt(rec.height, 50, MAX_HEIGHT) ?? 250) : null,
        attributes: parseAttributes(rec.attributes),
        adsense: null,
    };
}

/**
 * Map an `ad_slots` row (snake_case `network_*` columns) to a validated
 * `AdUnit`. It runs through the same `parseUnit`, so a database row can never
 * hold something the renderer would refuse — the DB is the source of truth and
 * the parser stays the single gate.
 *
 * `network_active = false` or an empty `network_url` means "no tag here".
 */
export function adUnitFromRow(
    slotKey: string,
    row: {
        network?: unknown;
        network_format?: unknown;
        network_kind?: unknown;
        network_url?: unknown;
        network_width?: unknown;
        network_height?: unknown;
        network_attributes?: unknown;
        network_active?: unknown;
        adsense_client?: unknown;
        adsense_slot?: unknown;
        adsense_format?: unknown;
        adsense_layout?: unknown;
    },
): AdUnit | null {
    if (row.network_active === false) return null;
    if (typeof row.network_url !== 'string' || row.network_url.length === 0) return null;
    const adsense =
        row.adsense_client != null || row.adsense_slot != null
            ? {
                  client: row.adsense_client,
                  adSlot: row.adsense_slot,
                  format: row.adsense_format ?? null,
                  layout: row.adsense_layout ?? null,
              }
            : null;
    return parseUnit(slotKey, {
        network: row.network,
        format: row.network_format,
        kind: row.network_kind ?? undefined,
        url: row.network_url,
        width: row.network_width ?? undefined,
        height: row.network_height ?? undefined,
        attributes: row.network_attributes ?? undefined,
        adsense,
    });
}

export type AdConfigSource = {
    /** `NEXT_PUBLIC_AD_SLOTS` — JSON object of `{ "slot-key": { … } }`. */
    rawJson?: string | null;
    /** `NEXT_PUBLIC_ADS_ENABLED` — `0`/`false` is a hard kill switch. */
    enabledFlag?: string | null;
    /** `NEXT_PUBLIC_AD_CONSENT_REQUIRED` — defaults to true. */
    consentFlag?: string | null;
    /** `NEXT_PUBLIC_AD_RESERVE_SPACE` — defaults to false. */
    reserveFlag?: string | null;
    /** `NEXT_PUBLIC_AD_HOUSE_ADS` — defaults to true. */
    houseFlag?: string | null;
};

function explicitlyOff(flag: string | null | undefined): boolean {
    if (typeof flag !== 'string') return false;
    return ['0', 'false', 'off', 'no'].includes(flag.trim().toLowerCase());
}

/**
 * Pure parser — the only supported way to build a config. Exported so tests
 * (and an admin preview in a later stage) can validate a JSON blob before it
 * is written to an environment variable.
 */
export function parseAdNetworkConfig(source: AdConfigSource): AdNetworkConfig {
    const consentRequired = !explicitlyOff(source.consentFlag);
    const reserveSpace = !explicitlyOff(source.reserveFlag);
    const houseAds = !explicitlyOff(source.houseFlag);
    if (!source.rawJson || explicitlyOff(source.enabledFlag)) {
        return { ...EMPTY_AD_NETWORK_CONFIG, consentRequired, reserveSpace, houseAds };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(source.rawJson);
    } catch {
        return { ...EMPTY_AD_NETWORK_CONFIG, consentRequired, reserveSpace, houseAds };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ...EMPTY_AD_NETWORK_CONFIG, consentRequired, reserveSpace, houseAds };
    }
    // Both `{ "slot": {…} }` and `{ "slots": { "slot": {…} } }` are accepted so
    // an operator can copy a snippet from either shape of our documentation.
    const root = parsed as Record<string, unknown>;
    const slots =
        root.slots && typeof root.slots === 'object' && !Array.isArray(root.slots)
            ? (root.slots as Record<string, unknown>)
            : root;

    const units: Record<string, AdUnit> = {};
    for (const [slotKey, value] of Object.entries(slots)) {
        if (Object.keys(units).length >= MAX_UNITS) break;
        const unit = parseUnit(slotKey, value);
        if (unit) units[slotKey] = unit;
    }

    return {
        enabled: Object.keys(units).length > 0,
        consentRequired,
        reserveSpace,
        houseAds,
        units,
    };
}

/**
 * Process-wide config, parsed once. Every read uses static
 * `process.env.NEXT_PUBLIC_*` property access so Next can inline the values
 * into the client bundle at build time.
 */
let cachedConfig: AdNetworkConfig | null = null;

export function readAdNetworkConfig(): AdNetworkConfig {
    if (cachedConfig) return cachedConfig;
    cachedConfig = parseAdNetworkConfig({
        rawJson: process.env.NEXT_PUBLIC_AD_SLOTS,
        enabledFlag: process.env.NEXT_PUBLIC_ADS_ENABLED,
        consentFlag: process.env.NEXT_PUBLIC_AD_CONSENT_REQUIRED,
        reserveFlag: process.env.NEXT_PUBLIC_AD_RESERVE_SPACE,
        houseFlag: process.env.NEXT_PUBLIC_AD_HOUSE_ADS,
    });
    return cachedConfig;
}

export function getAdUnit(slotKey: string, config: AdNetworkConfig = readAdNetworkConfig()): AdUnit | null {
    if (!config.enabled) return null;
    return config.units[slotKey] ?? null;
}

/**
 * Every origin the configured tags need, for the CSP (`lib/security/csp.ts`).
 *
 * Derived from the same config the renderer uses, so adding a network never
 * leaves a second allowlist to update by hand — and an unconfigured network
 * contributes nothing to the policy.
 */
export function adNetworkOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
    const config = parseAdNetworkConfig({
        rawJson: env.NEXT_PUBLIC_AD_SLOTS,
        enabledFlag: env.NEXT_PUBLIC_ADS_ENABLED,
        consentFlag: env.NEXT_PUBLIC_AD_CONSENT_REQUIRED,
        reserveFlag: env.NEXT_PUBLIC_AD_RESERVE_SPACE,
    });
    if (!config.enabled) return [];
    const origins = new Set<string>();
    let hasAdsense = false;
    for (const unit of Object.values(config.units)) {
        try {
            origins.add(new URL(unit.url).origin);
        } catch {
            /* parseUnit already rejected unparseable URLs */
        }
        if (unit.kind === 'adsense') hasAdsense = true;
    }
    // One adsense unit needs the whole Google ad-serving trio, even though only
    // the loader URL appears in the config.
    if (hasAdsense) for (const origin of ADSENSE_ORIGINS) origins.add(origin);
    return [...origins].sort();
}

/**
 * Canonical placement keys shared by the public pages and the admin slot list.
 * Using the constant (never a string literal) keeps call sites, the
 * `ad_slots.slot_key` rows and the `NEXT_PUBLIC_AD_SLOTS` JSON in sync.
 */
export const AD_PLACEMENTS = {
    homeBanner: 'homepage-banner',
    homeRail: 'homepage-rail-top',
    homeInlineMid: 'homepage-inline-mid',
    homeInlineBottom: 'homepage-inline-bottom',
    newsIndexRail: 'news-index-rail',
    newsRail: 'news-rail',
    photoStoryIndexRail: 'photo-story-index-rail',
    photoStoryRail: 'photo-story-rail',
    noticeIndexRail: 'notices-index-rail',
    noticeRail: 'notices-rail',
    cultureRail: 'culture-rail',
    buySellIndexRail: 'buy-sell-index-rail',
    buySellInline: 'buy-sell-inline',
    contributorRail: 'contributor-rail',
} as const;

export type AdPlacementKey = (typeof AD_PLACEMENTS)[keyof typeof AD_PLACEMENTS];