import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export type ContentCardProps = {
    href: string;
    title: string;
    excerpt?: string;
    imageUrl?: string;
    location?: string;
    category?: string;
    meta?: string;
};

/**
 * Shared card used by every index page and homepage rail.
 * One Community Board: same card shape across all content verticals.
 */
export function ContentCard({
    href,
    title,
    excerpt,
    imageUrl,
    location,
    category,
    meta,
}: ContentCardProps) {
    return (
        <Link href={href} className="group block h-full">
            <Card className="h-full overflow-hidden transition-shadow group-hover:shadow-md">
                {imageUrl ? (
                    <div
                        className="aspect-video w-full bg-cover bg-center"
                        style={{ backgroundImage: `url(${imageUrl})` }}
                        role="img"
                        aria-label={title}
                    />
                ) : (
                    <div className="aspect-video w-full bg-muted" />
                )}
                <CardHeader>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {category ? <Badge variant="secondary">{category}</Badge> : null}
                        {location ? <span>📍 {location}</span> : null}
                        {meta ? <span>{meta}</span> : null}
                    </div>
                    <p className="font-semibold leading-snug group-hover:underline">
                        {title}
                    </p>
                    {excerpt ? (
                        <p className="line-clamp-2 text-sm text-muted-foreground">
                            {excerpt}
                        </p>
                    ) : null}
                </CardHeader>
            </Card>
        </Link>
    );
}