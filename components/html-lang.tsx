"use client";

import { useEffect } from "react";

/** Keeps <html lang> in sync with the active locale route segment. */
export function HtmlLang({ locale }: { locale: string }) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}
