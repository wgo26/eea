import Link from "next/link";
import { ArrowRight } from "lucide-react";

type SectionHeaderProps = {
  title: string;
  hint?: string;
  viewAllHref?: string;
  viewAllLabel?: string;
};

/**
 * Shared homepage section heading with "View all →" link (spec §1A).
 *
 * Signature: display-serif headline + divide-lens divider + lens-ring focus.
 */
export function SectionHeader({ title, hint, viewAllHref, viewAllLabel }: SectionHeaderProps) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4 divide-lens pb-3">
      <div>
        <h2 className="font-display font-extrabold uppercase tracking-tight text-display-sm">{title}</h2>
        {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
      </div>
      {viewAllHref ? (
        <Link
          href={viewAllHref}
          aria-label={`${viewAllLabel}: ${title}`}
          className="focus-lens inline-flex shrink-0 items-center gap-1 text-sm font-medium text-link hover:underline"
        >
          {viewAllLabel}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}
