"use client";

import React, { useEffect, useRef, useState } from "react";

interface ContentProtectionOptions {
  /** Unique user/session identifier for watermark */
  userId?: string;
  /** Locale for localized watermark text */
  locale?: "en" | "fr";
  /** Enable keyboard shortcut blocking */
  blockShortcuts?: boolean;
  /** Enable right-click blocking */
  blockRightClick?: boolean;
  /** Enable dev tools detection */
  detectDevTools?: boolean;
  /** Enable watermark overlay */
  enableWatermark?: boolean;
  /** Watermark text template (supports {userId}, {timestamp}, {locale}) */
  watermarkTemplate?: string;
  /** Callback when dev tools detected */
  onDevToolsDetected?: () => void;
  /** Callback when suspicious activity detected */
  onSuspiciousActivity?: (type: string) => void;
}

/**
 * Content Protection Hook — client-side deterrence layer.
 * Runs in browser only; no protection against determined attackers.
 * Use .protect-content CSS class for base protection, this hook adds:
 * - Keyboard shortcut blocking (Ctrl+C, Ctrl+S, Ctrl+P, Ctrl+U, F12, PrintScreen)
 * - Right-click context menu prevention
 * - DevTools detection (resize, debugger, console)
 * - Dynamic user-specific watermark overlay
 * - Visibility/blur detection (tab switching)
 */
export function useContentProtection(options: ContentProtectionOptions = {}) {
  const {
    userId = "anonymous",
    locale = "en",
    blockShortcuts = true,
    blockRightClick = true,
    detectDevTools = true,
    enableWatermark = true,
    watermarkTemplate,
    onDevToolsDetected,
    onSuspiciousActivity,
  } = options;

  const watermarkRef = useRef<HTMLDivElement | null>(null);
  const devToolsCheckRef = useRef<number | null>(null);
  const [devToolsOpen, setDevToolsOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!blockShortcuts) return;

      const isCtrl = e.ctrlKey || e.metaKey;
      const isShift = e.shiftKey;
      const key = e.key.toLowerCase();

      // Blocked combinations
      const blocked = [
        // Copy/Paste/Save/Print/View Source
        isCtrl && ["c", "s", "p", "u", "a"].includes(key),
        // DevTools
        e.key === "F12",
        isCtrl && isShift && ["i", "j", "c"].includes(key),
        // Print Screen (partial - only works when focused)
        e.key === "PrintScreen",
        // Select All
        isCtrl &&
          key === "a" &&
          !(
            (e.target as HTMLElement) instanceof HTMLInputElement ||
            (e.target as HTMLElement) instanceof HTMLTextAreaElement
          ),
      ];

      if (blocked.some(Boolean)) {
        e.preventDefault();
        e.stopPropagation();
        onSuspiciousActivity?.("keyboard_shortcut");
        return false;
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      if (!blockRightClick) return;
      // Allow right-click on inputs/textareas for native browser features
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      onSuspiciousActivity?.("right_click");
      return false;
    };

    const handleDragStart = (e: DragEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "IMG" || target.tagName === "A") {
        e.preventDefault();
        onSuspiciousActivity?.("drag_start");
      }
    };

    const handleSelectStart = (e: Event) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName !== "INPUT" &&
        target.tagName !== "TEXTAREA" &&
        !target.isContentEditable &&
        !target.closest(".allow-select")
      ) {
        e.preventDefault();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("contextmenu", handleContextMenu, true);
    document.addEventListener("dragstart", handleDragStart, true);
    document.addEventListener("selectstart", handleSelectStart, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("contextmenu", handleContextMenu, true);
      document.removeEventListener("dragstart", handleDragStart, true);
      document.removeEventListener("selectstart", handleSelectStart, true);
    };
  }, [blockShortcuts, blockRightClick, onSuspiciousActivity]);

  // DevTools Detection
  useEffect(() => {
    if (!detectDevTools || typeof window === "undefined") return;

    let checkCount = 0;
    const threshold = 160; // ms between checks when devtools open

    const checkDevTools = () => {
      const start = performance.now();
      // Debugger statement triggers breakpoint if devtools open
      // eslint-disable-next-line no-debugger
      debugger;
      const elapsed = performance.now() - start;

      if (elapsed > threshold) {
        checkCount++;
        if (checkCount >= 2 && !devToolsOpen) {
          setDevToolsOpen(true);
          onDevToolsDetected?.();
          onSuspiciousActivity?.("devtools_open");
        }
      } else {
        checkCount = 0;
        if (devToolsOpen) {
          setDevToolsOpen(false);
        }
      }

      devToolsCheckRef.current = requestAnimationFrame(checkDevTools);
    };

    // Alternative: window size detection (devtools docked)
    const checkWindowSize = () => {
      const widthThreshold = window.outerWidth - window.innerWidth > 160;
      const heightThreshold = window.outerHeight - window.innerHeight > 160;

      if (widthThreshold || heightThreshold) {
        if (!devToolsOpen) {
          setDevToolsOpen(true);
          onDevToolsDetected?.();
          onSuspiciousActivity?.("devtools_open");
        }
      } else if (devToolsOpen) {
        setDevToolsOpen(false);
      }
    };

    // Console.log detection (formatter trick)
    const detectConsole = () => {
      const devtools = { open: false, orientation: null as string | null };
      const element = new Image();
      Object.defineProperty(element, "id", {
        get: () => {
          devtools.open = true;
          return "";
        },
      });
      // eslint-disable-next-line no-console
      console.log("%c", element);
      return devtools.open;
    };

    const interval = setInterval(() => {
      checkWindowSize();
      detectConsole();
    }, 1000);

    devToolsCheckRef.current = requestAnimationFrame(checkDevTools);

    return () => {
      clearInterval(interval);
      if (devToolsCheckRef.current) {
        cancelAnimationFrame(devToolsCheckRef.current);
      }
    };
  }, [detectDevTools, devToolsOpen, onDevToolsDetected, onSuspiciousActivity]);

  // Watermark Overlay
  useEffect(() => {
    if (!enableWatermark || typeof window === "undefined") return;

    const createWatermark = () => {
      // Remove existing
      const existing = document.getElementById("content-watermark");
      if (existing) existing.remove();

      const container = document.createElement("div");
      container.id = "content-watermark";
      container.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 2147483647;
        overflow: hidden;
        font-family: system-ui, -apple-system, sans-serif;
      `;

      const template =
        watermarkTemplate ??
        (locale === "fr"
          ? "EEA • {userId} • {timestamp}"
          : "EEA • {userId} • {timestamp}");

      const text = template
        .replace("{userId}", userId)
        .replace("{timestamp}", new Date().toISOString().split("T")[0])
        .replace("{locale}", locale);

      // Create diagonal repeating pattern
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const fontSize = 16;
      const font = `${fontSize}px system-ui`;
      ctx.font = font;
      const metrics = ctx.measureText(text);
      const textWidth = metrics.width;
      const textHeight = fontSize;

      // Canvas size for diagonal repeat
      const angle = -20 * (Math.PI / 180);
      const canvasWidth = textWidth + 200;
      const canvasHeight = textHeight + 100;
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;

      ctx.fillStyle = "rgba(0, 0, 0, 0.03)";
      ctx.font = font;
      ctx.translate(canvasWidth / 2, canvasHeight / 2);
      ctx.rotate(angle);
      ctx.fillText(text, -textWidth / 2, textHeight / 2);

      const pattern = ctx.createPattern(canvas, "repeat");
      if (pattern) {
        const overlay = document.createElement("div");
        overlay.style.cssText = `
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: ${pattern};
          opacity: 1;
        `;
        container.appendChild(overlay);
      }

      document.body.appendChild(container);
      watermarkRef.current = container;
    };

    createWatermark();

    // Refresh watermark periodically (e.g., on date change)
    const interval = setInterval(createWatermark, 60 * 60 * 1000);

    return () => {
      clearInterval(interval);
      const existing = document.getElementById("content-watermark");
      if (existing) existing.remove();
    };
  }, [enableWatermark, userId, locale, watermarkTemplate]);

  // Visibility/Focus Detection (tab switching, blur)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        onSuspiciousActivity?.("tab_hidden");
      } else {
        onSuspiciousActivity?.("tab_visible");
      }
    };

    const handleBlur = () => {
      onSuspiciousActivity?.("window_blur");
    };

    const handleFocus = () => {
      onSuspiciousActivity?.("window_focus");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
    };
  }, [onSuspiciousActivity]);

  return {
    devToolsOpen,
    isProtected: true,
  };
}

/**
 * Higher-order component wrapper for page-level protection.
 * Usage: export default withContentProtection(PageComponent, { userId, locale })
 */
export function withContentProtection<P extends object>(
  Component: React.ComponentType<P>,
  options: ContentProtectionOptions
) {
  return function ProtectedComponent(props: P) {
    useContentProtection(options);
    return React.createElement(Component, props);
  };
}

/**
 * Generate a signed URL for protected media access.
 * Server-side only — uses crypto.subtle for HMAC-SHA256.
 */
export async function generateSignedUrl(
  baseUrl: string,
  params: Record<string, string>,
  secret: string,
  ttlSeconds: number = 300
): Promise<string> {
  const url = new URL(baseUrl);
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;

  // Add standard params
  url.searchParams.set("expires", expires.toString());
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  // Create signature
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(url.pathname + url.search)
  );

  const signatureHex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  url.searchParams.set("sig", signatureHex);

  return url.toString();
}

/**
 * Verify a signed URL (server-side).
 */
export async function verifySignedUrl(
  url: string,
  secret: string
): Promise<{ valid: boolean; expires?: number; params?: Record<string, string> }> {
  try {
    const parsed = new URL(url);
    const sig = parsed.searchParams.get("sig");
    const expires = parsed.searchParams.get("expires");

    if (!sig || !expires) {
      return { valid: false };
    }

    // Check expiry
    const expiresNum = parseInt(expires, 10);
    if (isNaN(expiresNum) || Date.now() / 1000 > expiresNum) {
      return { valid: false };
    }

    // Verify signature
    parsed.searchParams.delete("sig");
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const expectedSig = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(parsed.pathname + parsed.search)
    );

    const expectedHex = Array.from(new Uint8Array(expectedSig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Constant-time comparison
    let valid = sig.length === expectedHex.length;
    for (let i = 0; i < sig.length; i++) {
      valid = valid && sig[i] === expectedHex[i];
    }

    if (!valid) return { valid: false };

    // Extract params
    const params: Record<string, string> = {};
    parsed.searchParams.forEach((value, key) => {
      if (key !== "expires" && key !== "sig") {
        params[key] = value;
      }
    });

    return { valid: true, expires: expiresNum, params };
  } catch {
    return { valid: false };
  }
}

/**
 * Device fingerprint for token binding.
 * Returns a hash string suitable for binding tokens to a device.
 */
export async function getDeviceFingerprint(): Promise<string> {
  if (typeof window === "undefined") return "server";

  const nav = navigator as Navigator & { deviceMemory?: number };
  const components = [
    navigator.userAgent,
    navigator.language,
    screen.width + "x" + screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset().toString(),
    navigator.hardwareConcurrency?.toString() || "",
    nav.deviceMemory?.toString() || "",
  ];

  // Canvas fingerprint
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.textBaseline = "top";
      ctx.font = "14px system-ui";
      ctx.fillText("🛡️", 2, 2);
      components.push(canvas.toDataURL().slice(-50));
    }
  } catch {
    // ignore
  }

  const combined = components.join("|");
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(combined));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}