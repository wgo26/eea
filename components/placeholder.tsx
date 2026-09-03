import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PlaceholderProps = {
    title: string;
    description: string;
    /** What this page will link to / contain once wired to Supabase. */
    planned?: string[];
};

/**
 * Temporary scaffold page body. Each route gets real data + layout in
 * later iterations; this keeps the full sitemap navigable from day one.
 */
export function Placeholder({ title, description, planned }: PlaceholderProps) {
    return (
        <div className="mx-auto max-w-3xl px-4 py-16">
            <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
            <p className="mt-3 text-muted-foreground">{description}</p>
            {planned && planned.length > 0 ? (
                <Card className="mt-8">
                    <CardHeader>
                        <CardTitle className="text-base">
                            Planned for this page
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                            {planned.map((item) => (
                                <li key={item}>{item}</li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            ) : null}
        </div>
    );
}