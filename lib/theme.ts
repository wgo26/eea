export type Theme = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "eea-theme";

/** Cycle order for the theme toggle: system → light → dark → system. */
export const THEME_ORDER: Theme[] = ["system", "light", "dark"];

/** Applies the resolved theme to <html>. Client-side only. */
export function applyTheme(theme: Theme) {
  if (typeof window === "undefined") return;
  const isDark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", isDark);
  document.documentElement.style.colorScheme = isDark ? "dark" : "light";
}

/**
 * Inline pre-paint script — prevents a flash of the wrong theme.
 * Default is "system" (follow OS preference). Runs before hydration.
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem("eea-theme")||"system";var m=window.matchMedia("(prefers-color-scheme: dark)");var d=t==="dark"||(t==="system"&&m.matches);var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light";}catch(e){}})();`;
