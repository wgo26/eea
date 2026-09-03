"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type MobileNavProps = {
  items: { href: string; label: string }[];
  searchAction: string;
  searchPlaceholder: string;
  searchLabel: string;
  menuLabel: string;
  submitHref: string;
  submitLabel: string;
};

/** Mobile menu — nav links, search and the submit CTA below md. */
export function MobileNav({
  items,
  searchAction,
  searchPlaceholder,
  searchLabel,
  menuLabel,
  submitHref,
  submitLabel,
}: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() ?? "/";
  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={menuLabel}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
      </button>
      {open ? (
        <div className="absolute inset-x-0 top-full border-b bg-background p-4 shadow-lg md:hidden">
          <form action={searchAction} className="relative" role="search" aria-label={searchLabel}>
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input type="search" name="q" placeholder={searchPlaceholder} className="pl-9" />
          </form>
          <nav className="mt-3 flex flex-col">
            {items.map((item) => {
              const isActive =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={isActive ? "page" : undefined}
                  className={`rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-primary font-semibold text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <Button className="mt-3 w-full" render={<Link href={submitHref} onClick={() => setOpen(false)} />}>
            {submitLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
