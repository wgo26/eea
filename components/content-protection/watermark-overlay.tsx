"use client";

import React, { useEffect, useRef, useState } from "react";
import { getDeviceFingerprint } from "@/lib/content-protection";

interface WatermarkOverlayProps {
  /** Unique user/session identifier */
  userId?: string;
  /** Locale for localized text */
  locale?: "en" | "fr";
  /** Custom watermark text template */
  template?: string;
  /** Opacity of watermark (0-1) */
  opacity?: number;
  /** Rotation angle in degrees */
  angle?: number;
  /** Font size in px */
  fontSize?: number;
  /** Z-index for the overlay */
  zIndex?: number;
  /** Additional CSS class */
  className?: string;
  /** Children to wrap with protection */
  children: React.ReactNode;
  /** Enable the protection hook on this subtree */
  enableProtection?: boolean;
}

/**
 * WatermarkOverlay — wraps content with a dynamic, user-specific watermark.
 * The watermark is rendered as a canvas pattern overlay covering the entire viewport.
 * Includes client-side protection hooks (keyboard, right-click, devtools detection).
 */
export function WatermarkOverlay({
  userId = "anonymous",
  locale = "en",
  template,
  opacity = 0.04,
  angle = -20,
  fontSize = 14,
  zIndex = 2147483647,
  className,
  children,
  enableProtection = true,
}: WatermarkOverlayProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [fingerprint, setFingerprint] = useState<string>("");

  // Generate device fingerprint on mount
  useEffect(() => {
    getDeviceFingerprint().then(setFingerprint);
  }, []);

  // Build watermark text
  const watermarkText = template ?? (locale === "fr" ? "EEA • {userId} • {date} • {fp}" : "EEA • {userId} • {date} • {fp}");
  const dateStr = new Date().toISOString().split("T")[0];
  const fpShort = fingerprint.slice(0, 8);
  const text = watermarkText
    .replace("{userId}", userId)
    .replace("{date}", dateStr)
    .replace("{fp}", fpShort)
    .replace("{locale}", locale);

  // Create canvas pattern
  useEffect(() => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.font = `${fontSize}px system-ui, -apple-system, sans-serif`;
    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    const textHeight = fontSize;

    // Canvas size for diagonal repeat with padding
    const rad = (angle * Math.PI) / 180;
    const canvasWidth = textWidth + 100;
    const canvasHeight = textHeight + 100;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`;
    ctx.font = `${fontSize}px system-ui, -apple-system, sans-serif`;
    ctx.translate(canvasWidth / 2, canvasHeight / 2);
    ctx.rotate(rad);
    ctx.fillText(text, -textWidth / 2, textHeight / 2);

    canvasRef.current = canvas;

    // Apply as background pattern to overlay using data URL
    if (overlayRef.current) {
      const dataUrl = canvas.toDataURL("image/png");
      overlayRef.current.style.backgroundImage = `url("${dataUrl}")`;
      overlayRef.current.style.backgroundRepeat = "repeat";
    }
  }, [text, fontSize, angle, opacity]);

  // Refresh watermark daily
  useEffect(() => {
    const interval = setInterval(() => {
      // Force re-render by updating a dummy state or recreating canvas
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const newDateStr = new Date().toISOString().split("T")[0];
      const newText = watermarkText
        .replace("{userId}", userId)
        .replace("{date}", newDateStr)
        .replace("{fp}", fpShort)
        .replace("{locale}", locale);

      ctx.font = `${fontSize}px system-ui, -apple-system, sans-serif`;
      const metrics = ctx.measureText(newText);
      const textWidth = metrics.width;
      const textHeight = fontSize;

      const rad = (angle * Math.PI) / 180;
      const canvasWidth = textWidth + 100;
      const canvasHeight = textHeight + 100;
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;

      ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`;
      ctx.font = `${fontSize}px system-ui, -apple-system, sans-serif`;
      ctx.translate(canvasWidth / 2, canvasHeight / 2);
      ctx.rotate(rad);
      ctx.fillText(newText, -textWidth / 2, textHeight / 2);

      if (overlayRef.current) {
        const dataUrl = canvas.toDataURL("image/png");
        overlayRef.current.style.backgroundImage = `url("${dataUrl}")`;
        overlayRef.current.style.backgroundRepeat = "repeat";
      }
    }, 60 * 60 * 1000); // Every hour

    return () => clearInterval(interval);
  }, [watermarkText, userId, fpShort, locale, fontSize, angle, opacity]);

  return (
    <div
      className={`relative protect-content ${className ?? ""}`}
      style={{
        position: "relative",
        zIndex: 1,
      }}
    >
      {/* Watermark overlay — fixed viewport cover */}
      <div
        ref={overlayRef}
        id="content-watermark-overlay"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          pointerEvents: "none",
          zIndex,
          opacity: 1,
        }}
        aria-hidden="true"
      />

      {/* Protected content */}
      <div className="protect-content" style={{ position: "relative", zIndex: 2 }}>
        {children}
      </div>

      {/* Print-only fallback — shows when printing */}
      <div className="print-only" style={{ position: "relative", zIndex: 3 }}>
        {children}
      </div>
    </div>
  );
}

/**
 * ProtectedContent — simpler wrapper that just adds the CSS protection class
 * and optionally enables the client-side protection hooks.
 */
interface ProtectedContentProps {
  children: React.ReactNode;
  className?: string;
  enableHooks?: boolean;
  userId?: string;
  locale?: "en" | "fr";
}

export function ProtectedContent({
  children,
  className,
  enableHooks = false,
  userId,
  locale = "en",
}: ProtectedContentProps) {
  // Dynamic import to avoid SSR issues
  const [ProtectionHooks, setProtectionHooks] = useState<React.ComponentType<{ userId?: string; locale?: "en" | "fr" }> | null>(null);

  useEffect(() => {
    if (enableHooks) {
      import("@/lib/content-protection").then((mod) => {
        // Create a simple wrapper component that uses the hook
        const HookWrapper = ({ userId, locale }: { userId?: string; locale?: "en" | "fr" }) => {
          mod.useContentProtection({ userId, locale, enableWatermark: false });
          return null;
        };
        setProtectionHooks(HookWrapper);
      });
    }
  }, [enableHooks]);

  return (
    <div className={`protect-content ${className ?? ""}`}>
      {enableHooks && ProtectionHooks && <ProtectionHooks userId={userId} locale={locale} />}
      {children}
    </div>
  );
}

/**
 * MediaProtectionWrapper — wraps media elements (img, video, audio) with protection.
 * Disables right-click, drag, and adds watermark overlay on hover.
 */
interface MediaProtectionWrapperProps {
  children: React.ReactElement<React.HTMLAttributes<HTMLImageElement> | React.VideoHTMLAttributes<HTMLVideoElement> | React.AudioHTMLAttributes<HTMLAudioElement>>;
  userId?: string;
  locale?: "en" | "fr";
}

export function MediaProtectionWrapper({
  children,
  userId = "anonymous",
  locale = "en",
}: MediaProtectionWrapperProps) {
  const [showWatermark, setShowWatermark] = useState(false);

  const handleMouseEnter = () => setShowWatermark(true);
  const handleMouseLeave = () => setShowWatermark(false);

  return (
    <div
      className="protect-content relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    >
      {React.cloneElement(children, {
        onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
        onDragStart: (e: React.DragEvent) => e.preventDefault(),
        // Disable native controls for video/audio if needed
        // controlsList: "nodownload noremoteplayback",
      })}
      {showWatermark && (
        <div
          className="absolute inset-0 pointer-events-none z-10"
          style={{
            background: `linear-gradient(135deg, rgba(0,0,0,0.02) 0%, transparent 50%, rgba(0,0,0,0.02) 100%)`,
            fontSize: "10px",
            color: "rgba(0,0,0,0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "system-ui, -apple-system, sans-serif",
            userSelect: "none",
          }}
          aria-hidden="true"
        >
          {locale === "fr" ? `EEA • ${userId}` : `EEA • ${userId}`}
        </div>
      )}
    </div>
  );
}