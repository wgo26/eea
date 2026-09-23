import { getAllLocations, getNearYouContent } from "@/lib/queries/locations";
import { resolveLocale } from "@/lib/i18n";

/** Content types a place rail may ask for (mirrors the public content_type enum). */
const RAIL_KINDS = new Set(["photo_story", "news", "listing", "notice", "culture"]);

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ locale: string }> }
) {
    const { locale: rawLocale } = await params;
    const locale = resolveLocale(rawLocale);
    const places = await getAllLocations();
    // Phase 1 ISR fix: the homepage "Near You" rail used to read the place
    // cookie with cookies() inside a server component (opting the whole page
    // out of ISR). It now fetches through ?place= client-side instead.
    //
    // W16 — the same endpoint now backs the *section* place rails: `kind`
    // narrows the payload to one content type so /news, /notices,
    // /photo-stories and /buy-sell can each show their own "near you" strip
    // without a second round-trip or a cookie read on the server (which would
    // opt those ISR routes out of static rendering).
    const url = new URL(_request.url);
    const place = (url.searchParams.get("place") ?? "").trim();
    const kindRaw = (url.searchParams.get("kind") ?? "").trim();
    const kind = RAIL_KINDS.has(kindRaw) ? kindRaw : null;
    if (place) {
        const content = await getNearYouContent(place, locale, kind ? 12 : 6);
        return Response.json({
            places,
            content: kind ? content.filter((item) => item.type === kind) : content,
        });
    }
    return Response.json({ places });
}