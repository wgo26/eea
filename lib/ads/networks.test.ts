import { describe, expect, it } from 'vitest';
import {
    AD_PLACEMENTS,
    adNetworkOrigins,
    adUnitFromRow,
    enabledAdProviders,
    getAdUnit,
    isBoxedFormat,
    parseAdNetworkConfig,
} from './networks';

/** Minimal valid banner unit — each test overrides only what it asserts. */
const banner = {
    format: 'banner',
    url: 'https://ads.example.com/tag.js?zone=42',
    height: 250,
};

function parse(slots: Record<string, unknown>, extra: Record<string, string> = {}) {
    return parseAdNetworkConfig({ rawJson: JSON.stringify(slots), ...extra });
}

describe('ad network config', () => {
    it('is disabled and consent-gated when nothing is configured', () => {
        const config = parseAdNetworkConfig({});
        expect(config.enabled).toBe(false);
        expect(config.consentRequired).toBe(true);
        expect(config.units).toEqual({});
        expect(getAdUnit('homepage-banner', config)).toBeNull();
    });

    it('parses a banner unit and reserves its box', () => {
        const config = parse({ 'homepage-banner': { ...banner, network: 'monetag' } });
        const unit = config.units['homepage-banner'];
        expect(config.enabled).toBe(true);
        expect(unit.kind).toBe('script');
        expect(unit.format).toBe('banner');
        expect(unit.height).toBe(250);
        expect(unit.width).toBeNull();
        expect(unit.network).toBe('monetag');
        expect(isBoxedFormat(unit.format)).toBe(true);
    });

    it('accepts the { slots: … } wrapper shape as well', () => {
        const config = parseAdNetworkConfig({
            rawJson: JSON.stringify({ slots: { 'news-rail': banner } }),
        });
        expect(config.units['news-rail']).toBeTruthy();
    });

    it('drops http://, javascript: and relative tag URLs', () => {
        for (const url of ['http://ads.example.com/tag.js', 'javascript:alert(1)', '/tag.js']) {
            const config = parse({ 'homepage-banner': { ...banner, url } });
            expect(config.enabled).toBe(false);
            expect(config.units['homepage-banner']).toBeUndefined();
        }
    });

    it('drops a malformed JSON blob instead of throwing', () => {
        const config = parseAdNetworkConfig({ rawJson: '{"homepage-banner":' });
        expect(config.enabled).toBe(false);
    });

    it('honours the kill switch even with valid units', () => {
        const config = parse({ 'homepage-banner': banner }, { enabledFlag: '0' });
        expect(config.enabled).toBe(false);
        expect(config.units).toEqual({});
    });

    it('lets consent be optional only when explicitly disabled', () => {
        expect(parse({ 'homepage-banner': banner }, { consentFlag: '0' }).consentRequired).toBe(false);
        expect(parse({ 'homepage-banner': banner }, { consentFlag: 'true' }).consentRequired).toBe(true);
    });

    it('keeps only data-* attributes on the injected script', () => {
        const config = parse({
            'homepage-banner': {
                ...banner,
                attributes: {
                    'data-zone': '42',
                    onload: 'alert(1)',
                    src: 'https://evil.test/x.js',
                    'data-empty': '',
                },
            },
        });
        expect(config.units['homepage-banner'].attributes).toEqual({ 'data-zone': '42' });
    });

    it('reserves no box for page-level formats', () => {
        const config = parse({
            'homepage-banner': { format: 'popunder', url: 'https://ads.example.com/pop.js', height: 600 },
        });
        expect(config.units['homepage-banner'].height).toBeNull();
        expect(isBoxedFormat('popunder')).toBe(false);
    });

    it('turns a smartlink into a link unit', () => {
        const config = parse({
            'buy-sell-index-rail': { format: 'smartlink', url: 'https://smart.example.com/go' },
        });
        const unit = config.units['buy-sell-index-rail'];
        expect(unit.kind).toBe('link');
        expect(unit.height).toBeNull();
        expect(unit.url).toBe('https://smart.example.com/go');
    });

    it('requires a valid AdSense client and slot id', () => {
        const valid = parse({
            'news-rail': {
                format: 'adsense',
                adsense: { client: 'ca-pub-1234567890123456', adSlot: '1234567890' },
            },
        });
        expect(valid.units['news-rail'].kind).toBe('adsense');
        expect(valid.units['news-rail'].url).toBe(
            'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js',
        );

        const invalid = parse({
            'news-rail': { format: 'adsense', adsense: { client: 'pub-1', adSlot: 'x' } },
        });
        expect(invalid.units['news-rail']).toBeUndefined();
    });

    it('drops unknown formats and keeps the valid siblings', () => {
        const config = parse({
            'homepage-banner': { format: 'hologram', url: 'https://ads.example.com/x.js' },
            'news-rail': banner,
        });
        expect(config.units['homepage-banner']).toBeUndefined();
        expect(config.units['news-rail']).toBeTruthy();
    });

    it('rejects mismatched delivery kinds and formats', () => {
        expect(parse({
            'news-rail': { format: 'adsense', kind: 'script', adsense: { client: 'ca-pub-1234567890123456', adSlot: '1234567890' } },
            'buy-sell-index-rail': { format: 'smartlink', kind: 'script', url: 'https://smart.example.com/go' },
        }).units).toEqual({});
    });

    it('rejects slot keys that are not placement keys', () => {
        const config = parse({ '../evil': banner, 'Bad Key': banner, 'ok-key': banner });
        expect(Object.keys(config.units)).toEqual(['ok-key']);
    });

    it('exposes stable placement keys that look like slot keys', () => {
        for (const key of Object.values(AD_PLACEMENTS)) {
            expect(key).toMatch(/^[a-z0-9][a-z0-9-]{0,63}$/);
        }
    });
});

describe('adUnitFromRow (database rows)', () => {
    it('maps a stored row through the same validator', () => {
        const unit = adUnitFromRow('news-rail', {
            network: 'monetag',
            network_format: 'banner',
            network_kind: 'script',
            network_url: 'https://ads.example.com/t.js',
            network_width: null,
            network_height: 300,
            network_attributes: { 'data-zone': '7' },
            network_active: true,
        });
        expect(unit).not.toBeNull();
        expect(unit?.format).toBe('banner');
        expect(unit?.height).toBe(300);
        expect(unit?.attributes).toEqual({ 'data-zone': '7' });
    });

    it('treats an inactive row, a missing url or a non-https url as no tag', () => {
        const base = {
            network: 'monetag',
            network_format: 'banner',
            network_url: 'https://ads.example.com/t.js',
            network_active: true,
        };
        expect(adUnitFromRow('news-rail', { ...base, network_active: false })).toBeNull();
        expect(adUnitFromRow('news-rail', { ...base, network_url: null })).toBeNull();
        expect(adUnitFromRow('news-rail', { ...base, network_url: 'http://ads.example.com/t.js' })).toBeNull();
    });

    it('builds an AdSense unit from the adsense columns', () => {
        const unit = adUnitFromRow('news-rail', {
            network: 'adsense',
            network_format: 'adsense',
            network_kind: 'adsense',
            network_url: 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js',
            network_active: true,
            adsense_client: 'ca-pub-1234567890123456',
            adsense_slot: '1234567890',
            adsense_format: 'auto',
            adsense_layout: 'true',
        });
        expect(unit?.kind).toBe('adsense');
        expect(unit?.url).toBe('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js');
        expect(unit?.adsense).toEqual({
            client: 'ca-pub-1234567890123456',
            adSlot: '1234567890',
            format: 'auto',
            layout: 'true',
        });
    });

    it('rejects an AdSense row without both ids', () => {
        const unit = adUnitFromRow('news-rail', {
            network: 'adsense',
            network_format: 'adsense',
            network_kind: 'adsense',
            network_url: 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js',
            network_active: true,
            adsense_client: 'ca-pub-1234567890123456',
        });
        expect(unit).toBeNull();
    });
});

describe('enabledAdProviders (privacy disclosure)', () => {
    it('lists each live provider once, with its policy url', () => {
        const config = parse({
            'homepage-banner': {
                network: 'adsense',
                format: 'adsense',
                adsense: { client: 'ca-pub-1234567890123456', adSlot: '1234567890' },
            },
            'news-rail': { network: 'monetag', ...banner },
            'notices-rail': { network: 'monetag', ...banner },
        });
        const providers = enabledAdProviders(config);
        expect(providers.map((p) => p.id)).toEqual(['adsense', 'monetag']);
        expect(providers.find((p) => p.id === 'monetag')?.placements).toBe(2);
        expect(providers.find((p) => p.id === 'adsense')?.policyUrl).toContain('policies.google.com');
    });

    it('names nothing when no network is live', () => {
        expect(enabledAdProviders(parseAdNetworkConfig({}))).toEqual([]);
        expect(enabledAdProviders(parse({ 'news-rail': banner }, { enabledFlag: '0' }))).toEqual([]);
    });

    it('keeps an unknown provider label, without inventing a policy link', () => {
        const config = parse({
            'news-rail': { network: 'my-affiliate', format: 'smartlink', url: 'https://go.example.com/x' },
        });
        expect(enabledAdProviders(config)).toEqual([
            { id: 'my-affiliate', label: 'my-affiliate', policyUrl: null, placements: 1 },
        ]);
    });
});

describe('adNetworkOrigins', () => {
    it('returns nothing when no network is configured', () => {
        expect(adNetworkOrigins({} as unknown as NodeJS.ProcessEnv)).toEqual([]);
    });

    it('collects the script origin from the configured units', () => {
        const env = {
            NEXT_PUBLIC_AD_SLOTS: JSON.stringify({
                'homepage-banner': banner,
                'news-rail': { format: 'in-page-push', url: 'https://cdn.ads.example.net/push.js' },
            }),
        } as unknown as NodeJS.ProcessEnv;
        expect(adNetworkOrigins(env)).toEqual([
            'https://ads.example.com',
            'https://cdn.ads.example.net',
        ]);
    });

    it('adds the AdSense ad-serving origins for adsense units', () => {
        const env = {
            NEXT_PUBLIC_AD_SLOTS: JSON.stringify({
                'news-rail': {
                    format: 'adsense',
                    adsense: { client: 'ca-pub-1234567890123456', adSlot: '1234567890' },
                },
            }),
        } as unknown as NodeJS.ProcessEnv;
        const origins = adNetworkOrigins(env);
        expect(origins).toContain('https://pagead2.googlesyndication.com');
        expect(origins).toContain('https://googleads.g.doubleclick.net');
        // Stable, deduped, sorted output keeps the emitted CSP byte-identical.
        expect(origins).toEqual([...new Set(origins)].sort());
    });
});