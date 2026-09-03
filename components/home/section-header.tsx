import Link from "next/link";
import { ArrowRight } from "lucide-react";

type SectionHeaderProps = {
  title: string;
  hint?: string;
  viewAllHref?: string;
  viewAllLabel?: string;
};

/** Shared homepage section heading with "View all →" link (spec §1A). */
export function SectionHeader({ title, hint, viewAllHref, viewAllLabel }: SectionHeaderProps) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4 border-b pb-3">
      <div>
        <h2 className="text-xl font-extrabold uppercase tracking-tight md:text-2xl">{title}</h2>
        {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
      </div>
      {viewAllHref ? (
        <Link
          href={viewAllHref}
          className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-link hover:underline"
        >
          {viewAllLabel}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}
