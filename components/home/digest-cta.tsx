import Link from "next/link";
import { MailOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/lib/i18n";

/** Phase 3 — daily-digest CTA band: the return leg of the core loop. */
export function DigestCta({ dict, digestHref }: { dict: Dictionary; digestHref: string }) {
  return (
    <section className="rounded-3xl border border-primary/20 bg-primary/5 p-8 md:p-12">
      <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
        <div className="max-w-xl">
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-primary">
            <MailOpen className="h-4 w-4" aria-hidden />
            {dict.nav.digest}
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight md:text-3xl">
            {dict.home.digestCtaTitle}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground md:text-base">
            {dict.home.digestCtaBody}
          </p>
        </div>
        <Button size="lg" variant="default" render={<Link href={digestHref} />}>
          {dict.home.digestCtaButton}
        </Button>
      </div>
    </section>
  );
}
