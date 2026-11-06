"use client";

import { usePathname } from "next/navigation";
import { ContentProtectionProvider } from "@/components/content-protection/provider";

/**
 * SensitiveRouteProtection — client wrapper that enables content protection
 * on all public routes (since it's used in PublicShell which wraps all public pages).
 * Reads pathname from next/navigation for potential future route-specific logic.
 */
export function SensitiveRouteProtection({
  children,
  locale,
}: {
  children: React.ReactNode;
  locale: "en" | "fr";
}) {
  const pathname = usePathname();

  // Protection enabled for all public routes (PublicShell wraps all public pages)
  const isSensitive = true;

  return (
    <ContentProtectionProvider locale={locale} enabled={isSensitive}>
      {children}
    </ContentProtectionProvider>
  );
}