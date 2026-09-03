import Link from "next/link";
import { Camera, Megaphone, Newspaper, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/lib/i18n";

/** "Submit a Story" CTA band — the core participation loop entry point. */
export function SubmitCta({ dict, submitHref }: { dict: Dictionary; submitHref: string }) {
  const chips = [
    { icon: Camera, label: dict.nav.photoStories },
    { icon: Newspaper, label: dict.nav.news },
    { icon: Megaphone, label: dict.nav.notices },
    { icon: Tag, label: dict.nav.buySell },
  ];
  return (
    <section className="rounded-3xl bg-neutral-900 p-8 text-neutral-50 ring-1 ring-white/10 md:p-12">
      <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
        <div className="max-w-xl">
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
            {dict.home.submitCtaTitle}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-neutral-50/80 md:text-base">
            {dict.home.submitCtaBody}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {chips.map(({ icon: Icon, label }) => (
              <span
                key={label}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium"
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {label}
              </span>
            ))}
          </div>
        </div>
        <Button size="lg" render={<Link href={submitHref} />}>
          {dict.home.submitCtaButton}
        </Button>
      </div>
    </section>
  );
}
