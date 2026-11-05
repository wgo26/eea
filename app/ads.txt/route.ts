/**
 * /ads.txt — Authorized Digital Sellers (IAB Tech Lab).
 *
 * Every network that sells inventory for this domain publishes an
 * `ads.txt` record in its dashboard (`propellerads.com, <publisher-id>,
 * DIRECT`, `google.com, pub-…, DIRECT, f08c47fec0942fa0`, …). Those exact
 * strings are operator data, not code: they live in `ADS_TXT_LINES` (one
 * record per line; `\n` escapes also accepted) so a new network never needs a
 * deploy of this route.
 *
 * Records are validated rather than echoed: a line must look like
 * `domain, publisher-account, DIRECT|RESELLER[, cert-authority-id]`. Anything
 * else — including markup — is dropped, so a bad environment value cannot turn
 * this endpoint into a text-injection vector. Comments (`#…`) are preserved
 * but length-capped.
 *
 * The file is served even when no records are configured (an empty ads.txt is
 * valid and answers the crawler that would otherwise 404), and `/ads.txt` is
 * already exempt from the locale redirect in `proxy.ts` (any path with an
 * extension is).
 *
 * `force-dynamic` is deliberate: with the default static prerender, `GET()`
 * runs at **build** time and reads whatever `ADS_TXT_LINES` the builder had —
 * so an operator adding a network record would see the file unchanged until
 * the next deploy. Crawlers fetch this once an hour at most, so one render per
 * request is the right trade for "edit the env var, reload the URL".
 */

export const dynamic = 'force-dynamic';

const MAX_LINES = 50;
const MAX_COMMENT_LENGTH = 300;

/** `domain, account, DIRECT|RESELLER[, cert-id][, comment]` */
const RECORD_RE =
    /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?,\s*[^,<>\r\n]{1,200},\s*(?:DIRECT|RESELLER)\s*(?:,[^,<>\r\n]{1,200}){0,2}$/i;

const HEADER = [
    '# ads.txt — IAB Tech Lab Authorized Digital Sellers.',
    '# Records come from ADS_TXT_LINES on the host (copy them verbatim from',
    '# each network dashboard). Lines that are not valid records are dropped.',
];

/** Splits on real newlines and on the literal `\n` escape used in env files. */
function splitLines(raw: string): string[] {
    return raw
        .split(/\\n|\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
}

function sanitize(raw: string | undefined): string[] {
    if (!raw) return [];
    const kept: string[] = [];
    for (const line of splitLines(raw)) {
        if (kept.length >= MAX_LINES) break;
        if (line.startsWith('#')) {
            if (line.length <= MAX_COMMENT_LENGTH && !/[<>]/.test(line)) kept.push(line);
            continue;
        }
        if (RECORD_RE.test(line)) kept.push(line);
    }
    return kept;
}

export async function GET(): Promise<Response> {
    const records = sanitize(process.env.ADS_TXT_LINES);
    const body = `${[...HEADER, ...records].join('\n')}\n`;
    return new Response(body, {
        status: 200,
        headers: {
            'content-type': 'text/plain; charset=utf-8',
            // Public and cacheable; crawlers re-read it rarely.
            'cache-control': 'public, max-age=3600, s-maxage=3600',
        },
    });
}