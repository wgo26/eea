"use client";

import { usePathname } from "next/navigation";
import { ContentProtectionProvider } from "@/components/content-protection/provider";

/**
 * SensitiveRouteProtection — client wrapper that enables content protection
 * on sensitive routes (photo-stories, culture events, notices, buy-sell, submit).
 * Reads pathname from next/navigation to determine if protection should be active.
 */
export function SensitiveRouteProtection({
  children,
  locale,
}: {
  children: React.ReactNode;
  locale: "en" | "fr";
}) {
  const pathname = usePathname();

  // Define sensitive route patterns
  const sensitivePatterns = [
    /\/photo-stories/,
    /\/culture\/events/,
    /\/notices/,
    /\/buy-sell/,
    /\/submit/,
    /\/stories/,
    /\/street/,
    /\/map/,
  ];

  const isSensitive = sensitivePatterns.some((pattern) => pattern.test(pathname));

  return (
    <ContentProtectionProvider locale={locale} enabled={isSensitive}>
      {children}
    </ContentProtectionProvider>
  );
}