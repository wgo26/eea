export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "eea-theme";

/**
 * Cycle order for the theme toggle: light → dark → light. There is no
 * explicit "system" option — an unset/legacy stored value ("system" from the
 * old three-way toggle) automatically follows the OS preference.
 */
export const THEME_ORDER: Theme[] = ["light", "dark"];

/** True when the stored value is an explicit user choice (not the automatic default). */
export function isExplicitTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark";
}

/** Resolves the automatic (unset / legacy "system") theme from the OS preference. Client-side only. */
export function resolveAutomaticTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Applies the theme to <html>. Client-side only. */
export function applyTheme(theme: Theme) {
  if (typeof window === "undefined") return;
  const isDark = theme === "dark";
  document.documentElement.classList.toggle("dark", isDark);
  document.documentElement.style.colorScheme = isDark ? "dark" : "light";
}

/**
 * Inline pre-paint script — prevents a flash of the wrong theme. An explicit
 * stored choice wins; anything else (unset or the legacy "system" value)
 * follows the OS preference. Runs before hydration.
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem("eea-theme");var m=window.matchMedia("(prefers-color-scheme: dark)");var d=t==="dark"||(t!=="light"&&m.matches);var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light";}catch(e){}})();`;
