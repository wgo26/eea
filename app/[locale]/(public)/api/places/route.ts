import { getAllLocations, getNearYouContent } from "@/lib/queries/locations";
import { resolveLocale } from "@/lib/i18n";

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
    const url = new URL(_request.url);
    const place = (url.searchParams.get("place") ?? "").trim();
    if (place) {
        const content = await getNearYouContent(place, locale, 6);
        return Response.json({ places, content });
    }
    return Response.json({ places });
}