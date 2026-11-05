"use client";

import { useEffect, useState } from "react";
import { useContentProtection, getDeviceFingerprint } from "@/lib/content-protection";

interface ContentProtectionProviderProps {
  children: React.ReactNode;
  locale: "en" | "fr";
  /** Enable for sensitive routes only (photo-stories, culture events, notices, buy-sell) */
  enabled?: boolean;
}

/**
 * ContentProtectionProvider — client-side protection wrapper.
 * Adds keyboard blocking, right-click blocking, devtools detection, and watermark.
 * Only activates on sensitive routes to avoid degrading UX on public browsing pages.
 */
export function ContentProtectionProvider({
  children,
  locale,
  enabled = false,
}: ContentProtectionProviderProps) {
  const [userId, setUserId] = useState<string>("anonymous");

  useEffect(() => {
    // Generate device fingerprint as user identifier
    getDeviceFingerprint().then((fp) => {
      setUserId(`fp_${fp.slice(0, 12)}`);
    });
  }, []);

  // Only enable protection on sensitive routes
  useContentProtection({
    userId,
    locale,
    blockShortcuts: enabled,
    blockRightClick: enabled,
    detectDevTools: enabled,
    enableWatermark: enabled,
    watermarkTemplate: locale === "fr" ? "EEA • {userId} • {date}" : "EEA • {userId} • {date}",
    onSuspiciousActivity: (type) => {
      // Log to analytics or security monitoring
      if (typeof window !== "undefined" && (window as any).gtag) {
        (window as any).gtag("event", "content_protection_triggered", {
          event_category: "security",
          event_label: type,
          user_id: userId,
        });
      }
      // Could also send to a security endpoint
      console.warn(`[ContentProtection] Suspicious activity: ${type}`, { userId, locale });
    },
    onDevToolsDetected: () => {
      if (typeof window !== "undefined" && (window as any).gtag) {
        (window as any).gtag("event", "devtools_detected", {
          event_category: "security",
          user_id: userId,
        });
      }
    },
  });

  return <>{children}</>;
}